import { describe, expect, it } from 'vitest';
import type {
  DiscoverOptions,
  DiscoveryTransport,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  SSDPResult,
} from '../../sonos';
import { AV_TRANSPORT_TYPE, type QueuePosition } from '../control';
import { SonosClient } from '../client';

// Exercises the WHOLE SonosClient facade OFFLINE against hand-rolled MOCK
// transports. CRITICAL: nothing here touches a real speaker, a socket, or the
// network — discovery emits a canned SSDPResult and every SOAP round-trip is a
// keyed canned response. There is no node:* import anywhere in this file.

/** A MOCK DiscoveryTransport that emits a fixed list of SSDPResults. */
class ScriptedDiscovery implements DiscoveryTransport {
  constructor(private readonly results: SSDPResult[]) {}

  discover(options: DiscoverOptions): Promise<void> {
    for (const r of this.results) {
      options.onResult(r);
    }
    return Promise.resolve();
  }
}

/**
 * A MOCK HttpTransport that records every request and answers from a table keyed
 * by `"${SOAPACTION}"` (GET device-desc would key by url, but the facade flow
 * here only ever issues SOAP POSTs). Recording the requests lets the routing
 * test assert which BASE URL each action was sent to. THROWS on an unkeyed
 * request — no silent empty response.
 */
class KeyedTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly byAction: Record<string, HttpResponse>) {}

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const action = req.headers?.['SOAPACTION'] ?? '';
    const resp = this.byAction[action];
    if (resp === undefined) {
      throw new Error(`KeyedTransport: no canned response for SOAPACTION ${action} (${req.url})`);
    }
    return Promise.resolve(resp);
  }
}

function ok(body: string): HttpResponse {
  return { status: 200, headers: {}, body };
}

/** Wraps a single output element in a minimal SOAP response envelope. */
function soapResponse(action: string, inner: string): string {
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<s:Body><u:${action}Response xmlns:u="${AV_TRANSPORT_TYPE}">` +
    inner +
    `</u:${action}Response></s:Body></s:Envelope>`
  );
}

function escapeXMLText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

const soapAction = (action: string): string => `"${AV_TRANSPORT_TYPE}#${action}"`;
const RENDERING_TYPE = 'urn:schemas-upnp-org:service:RenderingControl:1';
const renderingAction = (action: string): string => `"${RENDERING_TYPE}#${action}"`;
const TOPOLOGY_TYPE = 'urn:schemas-upnp-org:service:ZoneGroupTopology:1';
const topologyAction = (action: string): string => `"${TOPOLOGY_TYPE}#${action}"`;

// Living Room (coordinator, .10) groups Bedroom (.11); a separate Kitchen group
// (.13). The Sub (.12) is Invisible. Ported from the topology test fixtures.
const sampleZoneGroupState =
  '<ZoneGroupState>' +
  '<ZoneGroups>' +
  '<ZoneGroup Coordinator="RINCON_AAAAAAAAAAAA01400" ID="RINCON_AAAAAAAAAAAA01400:42">' +
  '<ZoneGroupMember UUID="RINCON_AAAAAAAAAAAA01400" Location="http://192.168.1.10:1400/xml/device_description.xml" ZoneName="Living Room" SoftwareVersion="15.9" Invisible="0"/>' +
  '<ZoneGroupMember UUID="RINCON_BBBBBBBBBBBB01400" Location="http://192.168.1.11:1400/xml/device_description.xml" ZoneName="Bedroom" SoftwareVersion="15.9" Invisible="0"/>' +
  '<ZoneGroupMember UUID="RINCON_CCCCCCCCCCCC01400" Location="http://192.168.1.12:1400/xml/device_description.xml" ZoneName="Living Room (Sub)" SoftwareVersion="15.9" Invisible="1"/>' +
  '</ZoneGroup>' +
  '<ZoneGroup Coordinator="RINCON_DDDDDDDDDDDD01400" ID="RINCON_DDDDDDDDDDDD01400:7">' +
  '<ZoneGroupMember UUID="RINCON_DDDDDDDDDDDD01400" Location="http://192.168.1.13:1400/xml/device_description.xml" ZoneName="Kitchen" SoftwareVersion="15.9" Invisible="0"/>' +
  '</ZoneGroup>' +
  '</ZoneGroups>' +
  '<VanishedDevices/>' +
  '</ZoneGroupState>';

const zoneGroupStateResponse = soapResponse(
  'GetZoneGroupState',
  '<ZoneGroupState>' + escapeXMLText(sampleZoneGroupState) + '</ZoneGroupState>',
);

const didl =
  '<DIDL-Lite ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
  'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
  'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
  '<item>' +
  '<dc:title>Black Dog</dc:title>' +
  '<upnp:artist>Led Zeppelin</upnp:artist>' +
  '<upnp:album>Led Zeppelin IV</upnp:album>' +
  '</item>' +
  '</DIDL-Lite>';

const positionInfoResponse =
  '<?xml version="1.0"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
  `<s:Body><u:GetPositionInfoResponse xmlns:u="${AV_TRANSPORT_TYPE}">` +
  '<Track>1</Track>' +
  '<TrackDuration>0:04:55</TrackDuration>' +
  '<TrackMetaData>' +
  escapeXMLText(didl) +
  '</TrackMetaData>' +
  '<RelTime>0:01:23</RelTime>' +
  '</u:GetPositionInfoResponse></s:Body></s:Envelope>';

/** The full canned response table covering every SOAP action the flow issues. */
function fullResponseTable(): Record<string, HttpResponse> {
  return {
    [topologyAction('GetZoneGroupState')]: ok(zoneGroupStateResponse),
    [soapAction('GetTransportInfo')]: ok(
      soapResponse('GetTransportInfo', '<CurrentTransportState>PLAYING</CurrentTransportState>'),
    ),
    [soapAction('GetPositionInfo')]: ok(positionInfoResponse),
    [soapAction('GetMediaInfo')]: ok(
      soapResponse('GetMediaInfo', '<CurrentURI>x-rincon-queue:RINCON_AAAAAAAAAAAA01400#0</CurrentURI>'),
    ),
    [renderingAction('GetVolume')]: ok(
      soapResponse('GetVolume', '<CurrentVolume>25</CurrentVolume>'),
    ),
    [soapAction('Play')]: ok(soapResponse('Play', '')),
  };
}

const LIVING_ROOM_RESULT: SSDPResult = {
  address: '192.168.1.10',
  location: 'http://192.168.1.10:1400/xml/device_description.xml',
  usn: 'uuid:RINCON_AAAAAAAAAAAA01400::urn:schemas-upnp-org:device:ZonePlayer:1',
  searchTarget: 'urn:schemas-upnp-org:device:ZonePlayer:1',
  headers: {},
};

describe('SonosClient — full mock facade flow', () => {
  it('discoverOne -> loadHousehold -> resolveRoom -> getNowPlaying -> getVolume', async () => {
    const http = new KeyedTransport(fullResponseTable());
    const discovery = new ScriptedDiscovery([LIVING_ROOM_RESULT]);
    const client = new SonosClient({ http, discovery });

    // discoverOne: first ZonePlayer.
    const responder = await client.discoverOne(3000);
    expect(responder.address).toBe('192.168.1.10');

    // loadHousehold: discoverOne + fetchTopology, >= 1 group.
    const household = await client.loadHousehold(3000);
    expect(household.groups.length).toBeGreaterThanOrEqual(1);
    expect(household.groups).toHaveLength(2);

    // resolveRoom('living') -> Living Room (its own coordinator).
    const room = client.resolveRoom(household, 'living');
    expect(room.member.zoneName).toBe('Living Room');
    expect(room.group.coordinator).toBe('RINCON_AAAAAAAAAAAA01400');

    // getNowPlaying off the coordinator.
    const np = await client.getNowPlaying(room);
    expect(np).toEqual({
      state: 'PLAYING',
      title: 'Black Dog',
      artist: 'Led Zeppelin',
      album: 'Led Zeppelin IV',
      position: '0:01:23',
      duration: '0:04:55',
      albumArtUrl: '',
      queueIndex: 0, // <Track>1</Track> -> 0-based 0
      spotifyConnect: false,
    });

    // getVolume off the player.
    const vol = await client.getVolume(room);
    expect(vol).toBe(25);
  });
});

describe('SonosClient.discoverOne', () => {
  it('throws when discovery yields zero results (no silent empty)', async () => {
    const http = new KeyedTransport({});
    const discovery = new ScriptedDiscovery([]);
    const client = new SonosClient({ http, discovery });

    await expect(client.discoverOne(3000)).rejects.toThrow(/no Sonos speakers answered/i);
  });

  it('resolves with the FIRST result when several answer', async () => {
    const second: SSDPResult = { ...LIVING_ROOM_RESULT, address: '192.168.1.13' };
    const discovery = new ScriptedDiscovery([LIVING_ROOM_RESULT, second]);
    const client = new SonosClient({ http: new KeyedTransport({}), discovery });

    const responder = await client.discoverOne(3000);
    expect(responder.address).toBe('192.168.1.10');
  });
});

describe('SonosClient base routing (recorded URLs)', () => {
  it('routes AVTransport to the COORDINATOR base and RenderingControl to the PLAYER base', async () => {
    // Resolve Bedroom (.11) — a non-coordinator member whose group coordinator
    // is Living Room (.10). This makes the two base URLs distinct so we can
    // prove the routing rule from the recorded request URLs alone.
    const http = new KeyedTransport(fullResponseTable());
    const discovery = new ScriptedDiscovery([LIVING_ROOM_RESULT]);
    const client = new SonosClient({ http, discovery });

    const household = await client.loadHousehold(3000);
    const room = client.resolveRoom(household, 'bedroom');
    expect(room.member.zoneName).toBe('Bedroom');
    expect(room.member.ip).toBe('192.168.1.11');

    // AVTransport: Play -> coordinator base (.10).
    await client.play(room);
    const playReq = http.requests.find(
      (r) => r.headers?.['SOAPACTION'] === soapAction('Play'),
    );
    expect(playReq).toBeDefined();
    expect(playReq!.url).toBe('http://192.168.1.10:1400/MediaRenderer/AVTransport/Control');

    // RenderingControl: GetVolume -> player base (.11).
    await client.getVolume(room);
    const volReq = http.requests.find(
      (r) => r.headers?.['SOAPACTION'] === renderingAction('GetVolume'),
    );
    expect(volReq).toBeDefined();
    expect(volReq!.url).toBe('http://192.168.1.11:1400/MediaRenderer/RenderingControl/Control');
  });
});

describe('SonosClient.playQueueIndex', () => {
  it('switches the group onto its own queue, seeks the 1-based track, and plays', async () => {
    const http = new KeyedTransport({
      ...fullResponseTable(),
      [soapAction('SetAVTransportURI')]: ok(soapResponse('SetAVTransportURI', '')),
      [soapAction('Seek')]: ok(soapResponse('Seek', '')),
    });
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    // Bedroom is a non-coordinator member, so a wrong route would be visible.
    const room = client.resolveRoom(household, 'bedroom');

    await client.playQueueIndex(room, 3);

    const coordinator = 'http://192.168.1.10:1400/MediaRenderer/AVTransport/Control';

    // 1. Point the coordinator at its OWN queue — this is what makes the jump work
    //    when a stream is playing instead of the queue.
    const setUri = http.requests.find(
      (r) => r.headers?.['SOAPACTION'] === soapAction('SetAVTransportURI'),
    );
    expect(setUri).toBeDefined();
    expect(setUri!.url).toBe(coordinator);
    expect(setUri!.body).toContain('x-rincon-queue:RINCON_AAAAAAAAAAAA01400#0');

    // 2. TRACK_NR seek to index+1 (Sonos track numbers are 1-based).
    const seek = http.requests.find((r) => r.headers?.['SOAPACTION'] === soapAction('Seek'));
    expect(seek).toBeDefined();
    expect(seek!.url).toBe(coordinator);
    expect(seek!.body).toContain('<Unit>TRACK_NR</Unit>');
    expect(seek!.body).toContain('<Target>4</Target>');

    // 3. Play.
    expect(
      http.requests.some((r) => r.headers?.['SOAPACTION'] === soapAction('Play')),
    ).toBe(true);
  });
});

describe('SonosClient.enqueue queue position', () => {
  const table = () => ({
    ...fullResponseTable(),
    [soapAction('AddURIToQueue')]: ok(
      soapResponse('AddURIToQueue', '<FirstTrackNumberEnqueued>7</FirstTrackNumberEnqueued>'),
    ),
  });

  const enqueueBody = async (where?: QueuePosition) => {
    const http = new KeyedTransport(table());
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    const room = client.resolveRoom(household, 'living');
    const item = { uri: 'x-sonos-spotify:track', metadata: '<DIDL/>' };
    if (where === undefined) await client.enqueue(room, item);
    else await client.enqueue(room, item, where);
    return http.requests.find(
      (r) => r.headers?.['SOAPACTION'] === soapAction('AddURIToQueue'),
    )!.body;
  };

  it('appends to the END by default', async () => {
    const body = await enqueueBody();
    expect(body).toContain('<EnqueueAsNext>0</EnqueueAsNext>');
    expect(body).toContain(
      '<DesiredFirstTrackNumberEnqueued>0</DesiredFirstTrackNumberEnqueued>',
    );
  });

  it("inserts at the slot after the current track for 'next'", async () => {
    // positionInfoResponse reports <Track>1</Track>, so "next" is slot 2.
    const body = await enqueueBody('next');
    expect(body).toContain('<EnqueueAsNext>1</EnqueueAsNext>');
    expect(body).toContain(
      '<DesiredFirstTrackNumberEnqueued>2</DesiredFirstTrackNumberEnqueued>',
    );
  });

  it('inserts at an explicit 0-based index as the 1-based desired track', async () => {
    const body = await enqueueBody(3);
    expect(body).toContain('<EnqueueAsNext>0</EnqueueAsNext>');
    expect(body).toContain(
      '<DesiredFirstTrackNumberEnqueued>4</DesiredFirstTrackNumberEnqueued>',
    );
  });

  it('rejects a negative or fractional index instead of guessing a slot', async () => {
    await expect(enqueueBody(-1)).rejects.toThrow(RangeError);
    await expect(enqueueBody(1.5)).rejects.toThrow(RangeError);
  });

  it("falls to the top for 'next' when the coordinator is not on its queue", async () => {
    const http = new KeyedTransport({
      ...table(),
      [soapAction('GetPositionInfo')]: ok(
        soapResponse('GetPositionInfo', '<Track>NOT_IMPLEMENTED</Track>'),
      ),
    });
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    const room = client.resolveRoom(household, 'living');
    await client.enqueue(room, { uri: 'x-sonos-spotify:track', metadata: '<DIDL/>' }, 'next');
    const body = http.requests.find(
      (r) => r.headers?.['SOAPACTION'] === soapAction('AddURIToQueue'),
    )!.body;
    expect(body).toContain(
      '<DesiredFirstTrackNumberEnqueued>1</DesiredFirstTrackNumberEnqueued>',
    );
  });
});

describe('SonosClient.playNow', () => {
  const run = async (overrides: Record<string, HttpResponse> = {}) => {
    const http = new KeyedTransport({
      ...fullResponseTable(),
      [soapAction('AddURIToQueue')]: ok(
        soapResponse('AddURIToQueue', '<FirstTrackNumberEnqueued>7</FirstTrackNumberEnqueued>'),
      ),
      [soapAction('SetAVTransportURI')]: ok(soapResponse('SetAVTransportURI', '')),
      [soapAction('Seek')]: ok(soapResponse('Seek', '')),
      ...overrides,
    });
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    await client.playNow(client.resolveRoom(household, 'living'), {
      uri: 'x-sonos-spotify:track',
      metadata: '<DIDL/>',
    });
    const find = (action: string) =>
      http.requests.find((r) => r.headers?.['SOAPACTION'] === soapAction(action));
    return { http, find };
  };

  it('inserts after the current track and plays from the enqueued track, keeping the queue', async () => {
    const { http, find } = await run();
    expect(
      http.requests.some((r) => r.headers?.['SOAPACTION'] === soapAction('RemoveAllTracksFromQueue')),
    ).toBe(false);
    // positionInfoResponse reports <Track>1</Track>, so the next slot is 2.
    expect(find('AddURIToQueue')!.body).toContain(
      '<DesiredFirstTrackNumberEnqueued>2</DesiredFirstTrackNumberEnqueued>',
    );
    expect(find('AddURIToQueue')!.body).toContain('<EnqueueAsNext>1</EnqueueAsNext>');
    expect(find('SetAVTransportURI')!.body).toContain('x-rincon-queue:RINCON_AAAAAAAAAAAA01400#0');
    expect(find('Seek')!.body).toContain('<Target>7</Target>');
    expect(find('Play')).toBeDefined();
  });

  it('inserts at the top when the coordinator is not on its queue', async () => {
    const { find } = await run({
      [soapAction('GetPositionInfo')]: ok(
        soapResponse('GetPositionInfo', '<Track>NOT_IMPLEMENTED</Track>'),
      ),
    });
    expect(find('AddURIToQueue')!.body).toContain(
      '<DesiredFirstTrackNumberEnqueued>1</DesiredFirstTrackNumberEnqueued>',
    );
  });
});

describe('SonosClient multi-track queue edits', () => {
  const CD_TYPE = 'urn:schemas-upnp-org:service:ContentDirectory:1';
  const run = async (edit: (client: SonosClient, room: ReturnType<SonosClient['resolveRoom']>) => Promise<void>) => {
    const http = new KeyedTransport({
      ...fullResponseTable(),
      [`"${CD_TYPE}#Browse"`]: ok(
        soapResponse('Browse', '<Result></Result><NumberReturned>1</NumberReturned><TotalMatches>10</TotalMatches><UpdateID>3</UpdateID>'),
      ),
      [soapAction('RemoveTrackRangeFromQueue')]: ok(
        soapResponse('RemoveTrackRangeFromQueue', '<NewUpdateID>4</NewUpdateID>'),
      ),
      [soapAction('ReorderTracksInQueue')]: ok(soapResponse('ReorderTracksInQueue', '')),
    });
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    await edit(client, client.resolveRoom(household, 'bedroom'));
    return http.requests;
  };
  const bodies = (reqs: HttpRequest[], action: string) =>
    reqs.filter((r) => r.headers?.['SOAPACTION'] === soapAction(action)).map((r) => r.body);

  it('removes each contiguous run with one 1-based range call, bottom run first, on the coordinator', async () => {
    const reqs = await run((c, room) => c.removeQueueTracks(room, [1, 2, 6]));
    const removes = bodies(reqs, 'RemoveTrackRangeFromQueue');
    expect(removes).toHaveLength(2);
    expect(removes[0]).toContain('<StartingIndex>7</StartingIndex>');
    expect(removes[0]).toContain('<NumberOfTracks>1</NumberOfTracks>');
    expect(removes[1]).toContain('<StartingIndex>2</StartingIndex>');
    expect(removes[1]).toContain('<NumberOfTracks>2</NumberOfTracks>');
    for (const r of reqs.filter((r) => r.headers?.['SOAPACTION'] === soapAction('RemoveTrackRangeFromQueue'))) {
      expect(r.url).toBe('http://192.168.1.10:1400/MediaRenderer/AVTransport/Control');
    }
  });

  it('validates against the speaker-reported queue length', async () => {
    await expect(run((c, room) => c.removeQueueTracks(room, [10]))).rejects.toThrow();
    await expect(run((c, room) => c.moveQueueTracks(room, [8, 9], 9))).rejects.toThrow();
  });

  it('moves a contiguous run with one NumberOfTracks call', async () => {
    const reqs = await run((c, room) => c.moveQueueTracks(room, [1, 2, 3], 5));
    const moves = bodies(reqs, 'ReorderTracksInQueue');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toContain('<StartingIndex>2</StartingIndex>');
    expect(moves[0]).toContain('<NumberOfTracks>3</NumberOfTracks>');
    expect(moves[0]).toContain('<InsertBefore>9</InsertBefore>');
  });
});

describe('SonosClient.playBrowseItem', () => {
  const browseItem = (uri: string, isContainer: boolean) => ({
    id: 'FV:2/1', parentId: 'FV:2', title: 'Fav', artist: '', album: '', albumArtUrl: '',
    upnpClass: '', isContainer, uri, metadata: '<DIDL/>',
  });
  const run = async (uri: string, isContainer: boolean, overrides: Record<string, HttpResponse> = {}) => {
    const http = new KeyedTransport({
      ...fullResponseTable(),
      [soapAction('AddURIToQueue')]: ok(
        soapResponse('AddURIToQueue', '<FirstTrackNumberEnqueued>5</FirstTrackNumberEnqueued>'),
      ),
      [soapAction('SetAVTransportURI')]: ok(soapResponse('SetAVTransportURI', '')),
      [soapAction('Seek')]: ok(soapResponse('Seek', '')),
      ...overrides,
    });
    const client = new SonosClient({ http, discovery: new ScriptedDiscovery([LIVING_ROOM_RESULT]) });
    const household = await client.loadHousehold(3000);
    await client.playBrowseItem(client.resolveRoom(household, 'living'), browseItem(uri, isContainer));
    return (action: string) => http.requests.filter((r) => r.headers?.['SOAPACTION'] === soapAction(action));
  };

  it('inserts a queue-backed entry after the current track and plays from it', async () => {
    const sent = await run('', true);
    expect(sent('RemoveAllTracksFromQueue')).toHaveLength(0);
    const add = sent('AddURIToQueue')[0].body;
    expect(add).toContain('x-rincon-playlist:RINCON_AAAAAAAAAAAA01400#FV:2/1');
    expect(add).toContain('<DesiredFirstTrackNumberEnqueued>2</DesiredFirstTrackNumberEnqueued>');
    expect(sent('Seek')[0].body).toContain('<Target>5</Target>');
    expect(sent('Play')).toHaveLength(1);
  });

  it('inserts at the top when the coordinator is not on its queue', async () => {
    const sent = await run('x-sonos-spotify:track', false, {
      [soapAction('GetPositionInfo')]: ok(soapResponse('GetPositionInfo', '<Track>NOT_IMPLEMENTED</Track>')),
    });
    expect(sent('AddURIToQueue')[0].body).toContain(
      '<DesiredFirstTrackNumberEnqueued>1</DesiredFirstTrackNumberEnqueued>',
    );
  });

  it('still plays a stream directly, without touching the queue', async () => {
    const sent = await run('x-sonosapi-stream:s1234?sid=254', false);
    expect(sent('AddURIToQueue')).toHaveLength(0);
    expect(sent('SetAVTransportURI')[0].body).toContain('x-sonosapi-stream:s1234?sid=254');
    expect(sent('Play')).toHaveLength(1);
  });
});
