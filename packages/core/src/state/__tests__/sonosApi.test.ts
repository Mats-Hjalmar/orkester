import { describe, expect, it } from 'vitest';
import type { DiscoverOptions, HttpRequest, HttpResponse, HttpTransport, SSDPResult } from '../../sonos';
import type { CredentialStore, SpotifyAuth } from '../../api';
import { SonosClient } from '../../engine';
import { SonosApi } from '../sonosApi';

// SonosApi is tested against a SCRIPTED mock transport + mock discovery — no real
// speaker, no network. The mock answers each SOAP action by name from a small
// canned household, so we exercise the id resolver (handle->member, group.id->
// coordinator), the position parse bridge, and the now-playing flatten. CRITICAL:
// nothing here touches a real speaker.

const AV = 'urn:schemas-upnp-org:service:AVTransport:1';

function escapeXMLText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

const ZGS =
  '<ZoneGroupState><ZoneGroups>' +
  '<ZoneGroup Coordinator="RINCON_AAAA01400" ID="g1">' +
  '<ZoneGroupMember UUID="RINCON_AAAA01400" Location="http://192.168.1.10:1400/x" ZoneName="Living Room" SoftwareVersion="15.9" Invisible="0"/>' +
  '<ZoneGroupMember UUID="RINCON_BBBB01400" Location="http://192.168.1.11:1400/x" ZoneName="Kitchen" SoftwareVersion="15.9" Invisible="0"/>' +
  '</ZoneGroup>' +
  '<ZoneGroup Coordinator="RINCON_CCCC01400" ID="g2">' +
  '<ZoneGroupMember UUID="RINCON_CCCC01400" Location="http://192.168.1.12:1400/x" ZoneName="Bedroom" SoftwareVersion="15.9" Invisible="0"/>' +
  '</ZoneGroup>' +
  '</ZoneGroups></ZoneGroupState>';

const DIDL =
  '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
  '<item><dc:title>Black Dog</dc:title><upnp:artist>Led Zeppelin</upnp:artist><upnp:album>IV</upnp:album></item></DIDL-Lite>';

function envelope(action: string, inner: string): string {
  return (
    '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<s:Body><u:${action}Response xmlns:u="${AV}">${inner}</u:${action}Response></s:Body></s:Envelope>`
  );
}

/** A scripted transport: routes by the SOAPACTION header's action name. */
class ScriptedTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  /** Per-action override so a test can make one action fail/return a value. */
  failAction: string | null = null;

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const action = /#([^"]+)"/.exec(req.headers?.SOAPACTION ?? '')?.[1] ?? '';
    if (this.failAction && action === this.failAction) {
      return Promise.resolve({ status: 500, headers: {}, body: '<bad/>' });
    }
    const ok = (inner: string) => Promise.resolve({ status: 200, headers: {}, body: envelope(action, inner) });
    switch (action) {
      case 'GetZoneGroupState':
        return ok(`<ZoneGroupState>${escapeXMLText(ZGS)}</ZoneGroupState>`);
      case 'GetTransportInfo':
        return ok('<CurrentTransportState>PLAYING</CurrentTransportState>');
      case 'GetPositionInfo':
        return ok(`<Track>1</Track><TrackDuration>0:04:55</TrackDuration><TrackMetaData>${escapeXMLText(DIDL)}</TrackMetaData><RelTime>0:01:23</RelTime>`);
      case 'GetTransportSettings':
        return ok('<PlayMode>SHUFFLE_NOREPEAT</PlayMode>');
      case 'GetVolume':
        return ok('<CurrentVolume>42</CurrentVolume>');
      case 'GetMute':
        return ok('<CurrentMute>0</CurrentMute>');
      default:
        return ok(''); // Play/Pause/Next/Seek/SetPlayMode/SetVolume/SetMute/SetAVTransportURI
    }
  }
}

class MockDiscovery {
  async discover(opts: DiscoverOptions): Promise<void> {
    const result: SSDPResult = {
      address: '192.168.1.10',
      location: 'http://192.168.1.10:1400/xml/device_description.xml',
      usn: 'uuid:RINCON_AAAA01400',
      searchTarget: 'urn:schemas-upnp-org:device:ZonePlayer:1',
      headers: {},
    };
    opts.onResult(result);
  }
}

function makeApi(transport: ScriptedTransport): SonosApi {
  const client = new SonosClient({ http: transport, discovery: new MockDiscovery() });
  return new SonosApi(client);
}

describe('SonosApi.loadTopology', () => {
  it('projects rooms (handles) + groups (engine ids + coordinator UUID)', async () => {
    const api = makeApi(new ScriptedTransport());
    const topo = await api.loadTopology();
    expect(topo.rooms.map((r) => r.id).sort()).toEqual(['bedroom', 'kitchen', 'living-room']);
    const g1 = topo.groups.find((g) => g.id === 'g1')!;
    expect(g1.coordinatorUuid).toBe('RINCON_AAAA01400');
    expect(g1.roomIds.sort()).toEqual(['kitchen', 'living-room']);
  });
});

describe('SonosApi.getNowPlaying', () => {
  it('flattens transport + position + playmode with the seconds bridge', async () => {
    const api = makeApi(new ScriptedTransport());
    await api.loadTopology();
    const np = await api.getNowPlaying('g1');
    expect(np).toEqual({
      isPlaying: true,
      title: 'Black Dog',
      artist: 'Led Zeppelin',
      album: 'IV',
      positionSeconds: 83, // 0:01:23
      durationSeconds: 295, // 0:04:55
      shuffle: true,
      repeat: 'none',
      artUrl: '', // the scripted DIDL carries no albumArtURI
      queueIndex: 0, // <Track>1</Track> -> 0-based 0
    });
  });

  it('routes the now-playing call to the COORDINATOR base (.10), not a member', async () => {
    const t = new ScriptedTransport();
    const api = makeApi(t);
    await api.loadTopology();
    t.requests.length = 0;
    await api.getNowPlaying('g1');
    // every AVTransport call for g1 must hit the coordinator at .10
    const avCalls = t.requests.filter((r) => r.url.includes('/AVTransport/'));
    expect(avCalls.length).toBeGreaterThan(0);
    expect(avCalls.every((r) => r.url.startsWith('http://192.168.1.10:1400'))).toBe(true);
  });
});

describe('SonosApi id resolution', () => {
  it('volume routes to the room own player base (kitchen=.11)', async () => {
    const t = new ScriptedTransport();
    const api = makeApi(t);
    await api.loadTopology();
    t.requests.length = 0;
    const vol = await api.getVolume('kitchen');
    expect(vol).toBe(42);
    expect(t.requests[0].url.startsWith('http://192.168.1.11:1400')).toBe(true);
  });

  it('throws on an unknown room/group id (no silent fallback)', async () => {
    const api = makeApi(new ScriptedTransport());
    await api.loadTopology();
    await expect(api.getNowPlaying('nope')).rejects.toThrow(/unknown group/);
    // getVolume resolves the id synchronously before returning the promise, so
    // it surfaces as a thrown error (still no silent fallback). Wrap to assert.
    await expect(Promise.resolve().then(() => api.getVolume('nope'))).rejects.toThrow(/unknown room/);
  });
});

describe('SonosApi grouping routing', () => {
  it('joinGroup sends x-rincon to the joining member base', async () => {
    const t = new ScriptedTransport();
    const api = makeApi(t);
    await api.loadTopology();
    t.requests.length = 0;
    await api.joinGroup('kitchen', 'RINCON_AAAA01400');
    expect(t.requests[0].url.startsWith('http://192.168.1.11:1400')).toBe(true);
    expect(t.requests[0].body).toContain('<CurrentURI>x-rincon:RINCON_AAAA01400</CurrentURI>');
  });

  it('setShuffle preserves the current repeat (read-modify-write)', async () => {
    const t = new ScriptedTransport();
    const api = makeApi(t);
    await api.loadTopology();
    t.requests.length = 0;
    await api.setShuffle('g1', false); // current is SHUFFLE_NOREPEAT -> repeat:none
    const setCall = t.requests.find((r) => r.headers?.SOAPACTION?.includes('SetPlayMode'));
    expect(setCall?.body).toContain('<NewPlayMode>NORMAL</NewPlayMode>');
  });
});

describe('SonosApi error propagation (optimistic revert relies on this)', () => {
  it('rejects when the speaker faults a transport action', async () => {
    const t = new ScriptedTransport();
    t.failAction = 'Play';
    const api = makeApi(t);
    await api.loadTopology();
    await expect(api.play('g1')).rejects.toBeTruthy();
  });
});

// --- Spotify search token-refresh handling --------------------------------
// searchSpotify talks to the SMAPI endpoint via the same injected transport.
// A `Client.TokenRefreshRequired` fault either carries refreshed credentials in
// its <detail> (persist + retry) or does not (re-link required). These cover both
// plus the "refreshed token still rejected" case — none must surface a raw fault.

const AUTH: SpotifyAuth = {
  serviceId: 9,
  seed: 2311,
  endpoint: 'https://spotify.example/smapi',
  authToken: 'OLD-TOKEN',
  privateKey: 'OLD-KEY',
  householdId: 'Sonos_hh',
  accountSn: '1',
};

function tokenRefreshFault(withToken: boolean): HttpResponse {
  const detail = withToken
    ? '<detail><ns0:refreshAuthTokenResult><ns0:authToken>NEW-TOKEN</ns0:authToken><ns0:privateKey>NEW-KEY</ns0:privateKey></ns0:refreshAuthTokenResult></detail>'
    : '';
  return {
    status: 500,
    headers: {},
    body:
      '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns0="http://www.sonos.com/Services/1.1">' +
      '<s:Body><s:Fault><faultcode>ns0:Client.TokenRefreshRequired</faultcode><faultstring>tokenRefreshRequired</faultstring>' +
      detail +
      '</s:Fault></s:Body></s:Envelope>',
  };
}

const SEARCH_OK: HttpResponse = {
  status: 200,
  headers: {},
  body:
    '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><searchResponse><searchResult>' +
    '<mediaMetadata><id>spotify:track:abc</id><itemType>track</itemType><title>Song</title>' +
    '<trackMetadata><artist>Artist</artist></trackMetadata></mediaMetadata>' +
    '</searchResult></searchResponse></s:Body></s:Envelope>',
};

/** Returns scripted responses to successive `search` SOAPACTIONs, in order. */
class SmapiSearchTransport implements HttpTransport {
  private i = 0;
  constructor(private readonly responses: HttpResponse[]) {}
  request(req: HttpRequest): Promise<HttpResponse> {
    const action = /#([^"]+)"/.exec(req.headers?.SOAPACTION ?? '')?.[1] ?? '';
    if (action !== 'search') throw new Error(`unexpected SMAPI action ${action}`);
    const r = this.responses[Math.min(this.i, this.responses.length - 1)];
    this.i += 1;
    return Promise.resolve(r);
  }
}

function makeSearchApi(responses: HttpResponse[]): { api: SonosApi; saved: SpotifyAuth[] } {
  const saved: SpotifyAuth[] = [];
  const store: CredentialStore = {
    load: async () => AUTH,
    save: async (a) => { saved.push(a); },
  };
  const client = new SonosClient({ http: new SmapiSearchTransport(responses), discovery: new MockDiscovery() });
  return { api: new SonosApi(client, store), saved };
}

describe('SonosApi.searchSpotify token refresh', () => {
  it('refreshes the stored token and retries when the fault embeds one', async () => {
    const { api, saved } = makeSearchApi([tokenRefreshFault(true), SEARCH_OK]);
    const hits = await api.searchSpotify('miles', 'tracks');
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Song');
    expect(saved).toEqual([expect.objectContaining({ authToken: 'NEW-TOKEN', privateKey: 'NEW-KEY' })]);
  });

  it('surfaces a re-link prompt (NotLinkedError) when the fault embeds no token', async () => {
    const { api, saved } = makeSearchApi([tokenRefreshFault(false)]);
    await expect(api.searchSpotify('miles', 'tracks')).rejects.toMatchObject({
      name: 'NotLinkedError',
      message: expect.stringMatching(/re-link/i),
    });
    expect(saved).toEqual([]); // nothing persisted when there's no new token
  });

  it('surfaces a re-link prompt when the refreshed token is itself rejected', async () => {
    const { api } = makeSearchApi([tokenRefreshFault(true), tokenRefreshFault(true)]);
    await expect(api.searchSpotify('miles', 'tracks')).rejects.toMatchObject({
      name: 'NotLinkedError',
      message: expect.stringMatching(/re-link/i),
    });
  });
});
