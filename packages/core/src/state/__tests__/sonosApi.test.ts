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
  currentUri = 'x-rincon-queue:RINCON_AAAA01400#0';

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
      case 'GetMediaInfo':
        return ok(`<CurrentURI>${escapeXMLText(this.currentUri)}</CurrentURI>`);
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
      spotifyConnect: false,
    });
  });

  it('flags Spotify Connect from the virtual line-in CurrentURI', async () => {
    const t = new ScriptedTransport();
    t.currentUri = 'x-sonos-vli:RINCON_AAAA01400:2,spotify:e934941535d7b182815bf99a1fd9c6be';
    const api = makeApi(t);
    await api.loadTopology();
    expect((await api.getNowPlaying('g1')).spotifyConnect).toBe(true);
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
    expect(hits[0].browsable).toBe(false); // tracks don't open
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

  // Regression: in the packaged app, tsup bundles each entry separately, so the
  // SMAPIFault thrown by the engine bundle is a DIFFERENT class identity than the
  // one sonosApi imports. The handler must match on `name`, not `instanceof` (an
  // `instanceof` check misses this and the raw fault escaped to the UI).
  it('recognises a foreign-identity SMAPIFault and still refreshes + retries', async () => {
    class ForeignFault extends Error {
      readonly code = 'ns0:Client.TokenRefreshRequired';
      readonly refreshedToken = { authToken: 'NEW-TOKEN', privateKey: 'NEW-KEY' };
      readonly detail = '<fault/>';
      constructor() {
        super('SMAPI fault ns0:Client.TokenRefreshRequired: tokenRefreshRequired');
        this.name = 'SMAPIFault';
      }
      isTokenRefresh(): boolean { return true; }
    }
    let calls = 0;
    const saved: SpotifyAuth[] = [];
    const store: CredentialStore = { load: async () => AUTH, save: async (a) => { saved.push(a); } };
    const fakeClient = {
      searchService: async () => {
        calls += 1;
        if (calls === 1) throw new ForeignFault();
        return [{ id: 'spotify:track:x', itemType: 'track', title: 'Song', artist: 'A', album: '', artUrl: '', isContainer: false }];
      },
    } as unknown as SonosClient;
    const api = new SonosApi(fakeClient, store);
    const hits = await api.searchSpotify('q', 'tracks');
    expect(hits).toHaveLength(1);
    expect(saved).toEqual([expect.objectContaining({ authToken: 'NEW-TOKEN', privateKey: 'NEW-KEY' })]);
  });
});

// --- Spotify playlist browsing --------------------------------------------

/** A getMetadata page of `n` tracks numbered from `from`, for a container of `total`. */
function metadataPage(from: number, n: number, total: number): HttpResponse {
  let tracks = '';
  for (let i = from; i < from + n; i++) {
    tracks += `<mediaMetadata><id>spotify:track:t${i}</id><itemType>track</itemType><title>T${i}</title></mediaMetadata>`;
  }
  return {
    status: 200,
    headers: {},
    body:
      '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
      `<getMetadataResponse><getMetadataResult><index>${from}</index><count>${n}</count><total>${total}</total>${tracks}` +
      '</getMetadataResult></getMetadataResponse></s:Body></s:Envelope>',
  };
}

/** Answers getMetadata from a fixed-size container, recording each requested window. */
class SmapiBrowseTransport implements HttpTransport {
  readonly windows: { id: string; index: number; count: number }[] = [];
  constructor(private readonly size: number) {}
  request(req: HttpRequest): Promise<HttpResponse> {
    const action = /#([^"]+)"/.exec(req.headers?.SOAPACTION ?? '')?.[1] ?? '';
    if (action !== 'getMetadata') throw new Error(`unexpected SMAPI action ${action}`);
    const body = String(req.body ?? '');
    const id = /<id>([^<]*)<\/id>/.exec(body)?.[1] ?? '';
    const index = Number(/<index>(\d+)<\/index>/.exec(body)?.[1]);
    const count = Number(/<count>(\d+)<\/count>/.exec(body)?.[1]);
    this.windows.push({ id, index, count });
    return Promise.resolve(metadataPage(index, Math.max(0, Math.min(count, this.size - index)), this.size));
  }
}

const PLAYLIST_HIT = {
  id: 'spotify:playlist:37i9',
  title: 'Jazz',
  artist: '',
  album: '',
  artUrl: '',
  isContainer: true,
  browsable: true,
  uri: 'x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9',
  metadata: '',
};

function makeBrowseApi(size: number): { api: SonosApi; t: SmapiBrowseTransport } {
  const t = new SmapiBrowseTransport(size);
  const store: CredentialStore = { load: async () => AUTH, save: async () => {} };
  const client = new SonosClient({ http: t, discovery: new MockDiscovery() });
  return { api: new SonosApi(client, store), t };
}

describe('SonosApi.browseSpotify', () => {
  it('pages through a playlist and returns playable tracks', async () => {
    const { api, t } = makeBrowseApi(142);
    const { items, total } = await api.browseSpotify(PLAYLIST_HIT);
    expect(total).toBe(142);
    expect(items).toHaveLength(142);
    expect(items[0]).toMatchObject({ id: 'spotify:track:t0', title: 'T0', browsable: false });
    expect(items[0].uri).toContain('x-sonos-spotify:spotify%3atrack%3at0');
    expect(t.windows).toEqual([
      { id: 'spotify:playlist:37i9', index: 0, count: 100 },
      { id: 'spotify:playlist:37i9', index: 100, count: 100 },
    ]);
  });

  it('caps a huge playlist but reports its real total', async () => {
    const { api } = makeBrowseApi(10_000);
    const { items, total } = await api.browseSpotify(PLAYLIST_HIT);
    expect(items).toHaveLength(500);
    expect(total).toBe(10_000);
  });

  it('refuses a hit that is not browsable', async () => {
    const { api } = makeBrowseApi(1);
    await expect(api.browseSpotify({ ...PLAYLIST_HIT, browsable: false })).rejects.toThrow(/can't be opened/);
  });
});

// A discovery transport that counts sweeps, so we can prove refreshTopology does
// not run one when a previously-seen speaker still answers. A discovery sweep costs
// DISCOVER_WAIT_MS of radio time and the store runs it on a timer, so on a phone
// this is the difference between an idle app and one that never lets the Wi-Fi sleep.
class CountingDiscovery extends MockDiscovery {
  sweeps = 0;
  override async discover(opts: DiscoverOptions): Promise<void> {
    this.sweeps += 1;
    await super.discover(opts);
  }
}

function makeCountingApi(transport: ScriptedTransport): { api: SonosApi; discovery: CountingDiscovery } {
  const discovery = new CountingDiscovery();
  return { api: new SonosApi(new SonosClient({ http: transport, discovery })), discovery };
}

describe('SonosApi.refreshTopology', () => {
  it('reuses the last known speaker instead of re-discovering', async () => {
    const t = new ScriptedTransport();
    const { api, discovery } = makeCountingApi(t);

    await api.loadTopology();
    expect(discovery.sweeps).toBe(1);

    await api.refreshTopology();
    await api.refreshTopology();

    // Still one sweep: both refreshes went straight to the remembered speaker.
    expect(discovery.sweeps).toBe(1);
    const zgs = t.requests.filter((r) => (r.headers?.SOAPACTION ?? '').includes('GetZoneGroupState'));
    expect(zgs).toHaveLength(3);
    expect(zgs[2].url).toBe('http://192.168.1.10:1400/ZoneGroupTopology/Control');
  });

  it('still returns a correct topology from the cached speaker', async () => {
    const { api } = makeCountingApi(new ScriptedTransport());
    await api.loadTopology();
    const topo = await api.refreshTopology();
    expect(topo.rooms.map((r) => r.id).sort()).toEqual(['bedroom', 'kitchen', 'living-room']);
    expect(topo.groups.find((g) => g.id === 'g1')!.coordinatorUuid).toBe('RINCON_AAAA01400');
  });

  it('escalates to a real discovery when the cached speaker stops answering', async () => {
    const t = new ScriptedTransport();
    const { api, discovery } = makeCountingApi(t);
    await api.loadTopology();
    expect(discovery.sweeps).toBe(1);

    // The remembered speaker is gone: its GetZoneGroupState now faults.
    t.failAction = 'GetZoneGroupState';
    await expect(api.refreshTopology()).rejects.toThrow();
    // It did not silently give up — it re-discovered before failing.
    expect(discovery.sweeps).toBe(2);

    // Once a speaker answers again the refresh succeeds and re-arms the cache.
    t.failAction = null;
    await expect(api.refreshTopology()).resolves.toBeTruthy();
    expect(discovery.sweeps).toBe(3);
    await api.refreshTopology();
    expect(discovery.sweeps).toBe(3);
  });
});

describe('SonosApi topology room/group coverage', () => {
  // Both UIs used to carry a "Not playing" section fed by "rooms in no group".
  // That list can never populate: engine `rooms()` derives every RoomRef by walking
  // household.groups, and index() collects each group's roomIds from those same
  // refs, so every room handle always belongs to a group — a standalone speaker is
  // a one-member group. This pins the invariant that made those sections dead code.
  it('puts every room in exactly one group (no room is groupless)', async () => {
    const api = makeApi(new ScriptedTransport());
    const topo = await api.loadTopology();

    const grouped = topo.groups.flatMap((g) => g.roomIds);
    expect([...grouped].sort()).toEqual(topo.rooms.map((r) => r.id).sort());
    for (const room of topo.rooms) {
      expect(topo.groups.filter((g) => g.roomIds.includes(room.id))).toHaveLength(1);
    }
    // Bedroom is alone on .12 and still arrives as its own group, not as a loose room.
    expect(topo.groups.find((g) => g.roomIds.join() === 'bedroom')).toBeDefined();
  });
});

describe('SonosApi.resolveArt', () => {
  const HASH = '81f6e9d86f64a4a4e5c319c8';
  const GETAA = 'http://192.168.1.10:1400/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a4axCvAhvcO8m5qJeLMa3dg%3fsid%3d9';
  const SIZED = {
    small: `https://i.scdn.co/image/ab67616d00001e02${HASH}`,
    large: `https://i.scdn.co/image/ab67616d0000b273${HASH}`,
  };

  class OEmbedTransport implements HttpTransport {
    readonly requests: HttpRequest[] = [];
    status = 200;
    request(req: HttpRequest): Promise<HttpResponse> {
      this.requests.push(req);
      const body = JSON.stringify({ thumbnail_url: SIZED.small });
      return Promise.resolve({ status: this.status, headers: {}, body });
    }
  }

  function makeArtApi(): { api: SonosApi; transport: OEmbedTransport } {
    const transport = new OEmbedTransport();
    return { api: new SonosApi(new SonosClient({ http: transport, discovery: new MockDiscovery() })), transport };
  }

  it('looks a Spotify track up once, however often it is asked for', async () => {
    const { api, transport } = makeArtApi();
    const [a, b] = await Promise.all([api.resolveArt(GETAA), api.resolveArt(GETAA)]);
    expect(await api.resolveArt(GETAA)).toEqual(SIZED);
    expect([a, b]).toEqual([SIZED, SIZED]);
    expect(transport.requests).toHaveLength(1);
  });

  it('retries a lookup that failed', async () => {
    const { api, transport } = makeArtApi();
    transport.status = 503;
    await expect(api.resolveArt(GETAA)).rejects.toThrow('503');
    transport.status = 200;
    expect(await api.resolveArt(GETAA)).toEqual(SIZED);
    expect(transport.requests).toHaveLength(2);
  });

  it('sizes a CDN URL and passes other art through, without a request', async () => {
    const { api, transport } = makeArtApi();
    expect(await api.resolveArt(SIZED.large)).toEqual(SIZED);
    expect(await api.resolveArt('https://logo.cdn/x.png')).toEqual({ small: 'https://logo.cdn/x.png', large: 'https://logo.cdn/x.png' });
    expect(transport.requests).toHaveLength(0);
  });
});
