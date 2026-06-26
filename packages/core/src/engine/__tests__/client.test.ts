import { describe, expect, it } from 'vitest';
import type {
  DiscoverOptions,
  DiscoveryTransport,
  HttpRequest,
  HttpResponse,
  HttpTransport,
  SSDPResult,
} from '../../sonos';
import { AV_TRANSPORT_TYPE } from '../control';
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
