import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../sonos';
import { SOAPCall, SonosFault } from '../soap';
import { AV_TRANSPORT_TYPE } from '../control';
import * as control from '../control';
import { fetchTopology } from '../topology';

// Ported from backend/internal/sonos {soap,control,topology}_test.go, adapted to
// the injected-HttpTransport engine. No node:* anywhere — the transport is a
// hand-rolled MOCK that records requests and returns canned bodies. CRITICAL:
// nothing here touches a real speaker or the network.

/**
 * A MOCK HttpTransport that records every request it is asked to perform and
 * replies with a queued canned response. Used to assert exactly what the engine
 * puts on the wire (url / headers / body) without any I/O.
 */
class RecordingTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponse[];

  constructor(responses: HttpResponse[]) {
    this.responses = [...responses];
  }

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const next = this.responses.shift();
    if (next === undefined) {
      throw new Error(`RecordingTransport: no canned response for ${req.method} ${req.url}`);
    }
    return Promise.resolve(next);
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

// The UPnP fault body Sonos returns on a 500, ported verbatim from soap_test.go.
const sampleFault =
  '<?xml version="1.0"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<s:Body>' +
  '<s:Fault>' +
  '<faultcode>s:Client</faultcode>' +
  '<faultstring>UPnPError</faultstring>' +
  '<detail>' +
  '<UPnPError xmlns="urn:schemas-upnp-org:control-1-0">' +
  '<errorCode>714</errorCode>' +
  '<errorDescription>Illegal MIME-Type</errorDescription>' +
  '</UPnPError>' +
  '</detail>' +
  '</s:Fault>' +
  '</s:Body></s:Envelope>';

// Inner ZoneGroupState XML, ported verbatim from topology_test.go.
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

const BASE = 'http://192.168.1.10:1400';

describe('SOAPCall', () => {
  it('sets url, Content-Type, SOAPACTION; POSTs the envelope; returns the 200 body', async () => {
    const respBody = soapResponse('GetTransportInfo', '<CurrentTransportState>PLAYING</CurrentTransportState>');
    const t = new RecordingTransport([ok(respBody)]);

    const body = await SOAPCall(t, BASE, control.avTransport(), 'GetTransportInfo', [control.instanceArg()]);

    expect(body).toBe(respBody);
    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://192.168.1.10:1400/MediaRenderer/AVTransport/Control');
    expect(req.headers?.['Content-Type']).toBe('text/xml; charset="utf-8"');
    expect(req.headers?.['SOAPACTION']).toBe(
      '"urn:schemas-upnp-org:service:AVTransport:1#GetTransportInfo"',
    );
    expect(req.body).toContain('<u:GetTransportInfo');
    expect(req.body).toContain('<InstanceID>0</InstanceID>');
  });

  it('throws a SonosFault with upnpError 714 (number) on a 500 + sampleFault body', async () => {
    const t = new RecordingTransport([{ status: 500, headers: {}, body: sampleFault }]);

    await expect(SOAPCall(t, BASE, control.avTransport(), 'Play', [control.instanceArg()])).rejects.toBeInstanceOf(
      SonosFault,
    );

    // Re-run to inspect the thrown value (rejects.toBeInstanceOf consumed the first).
    const t2 = new RecordingTransport([{ status: 500, headers: {}, body: sampleFault }]);
    let caught: unknown;
    try {
      await SOAPCall(t2, BASE, control.avTransport(), 'Play', [control.instanceArg()]);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SonosFault);
    const fault = caught as SonosFault;
    expect(fault.upnpError).toBe(714);
    expect(typeof fault.upnpError).toBe('number');
    expect(fault.message).toContain('714');
  });

  it('throws a plain HTTP error (no fault) on a non-200 with a non-fault body', async () => {
    const t = new RecordingTransport([{ status: 404, headers: {}, body: 'not found' }]);
    await expect(
      SOAPCall(t, BASE, control.avTransport(), 'Play', [control.instanceArg()]),
    ).rejects.toThrow(/404/);
  });
});

describe('control.play', () => {
  it('sends one POST with the Play SOAPACTION and an InstanceID 0 + Speed 1 body', async () => {
    const t = new RecordingTransport([ok(soapResponse('Play', ''))]);

    await control.play(t, BASE);

    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://192.168.1.10:1400/MediaRenderer/AVTransport/Control');
    expect(req.headers?.['SOAPACTION']).toBe('"urn:schemas-upnp-org:service:AVTransport:1#Play"');
    expect(req.body).toContain('<InstanceID>0</InstanceID>');
    expect(req.body).toContain('<Speed>1</Speed>');
  });
});

describe('control.getVolume', () => {
  it('parses a canned CurrentVolume 25 to the number 25', async () => {
    const t = new RecordingTransport([
      ok(soapResponse('GetVolume', '<CurrentVolume>25</CurrentVolume>')),
    ]);

    const vol = await control.getVolume(t, BASE);

    expect(vol).toBe(25);
    expect(typeof vol).toBe('number');
  });
});

describe('control.setVolume', () => {
  it('rejects an out-of-range volume (101) and records zero requests', async () => {
    const t = new RecordingTransport([]);

    await expect(control.setVolume(t, BASE, 101)).rejects.toThrow(/out of range/);
    expect(t.requests).toHaveLength(0);
  });
});

describe('control.getNowPlaying', () => {
  it('combines GetTransportInfo + GetPositionInfo into a flattened NowPlaying', async () => {
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

    const transportInfo = soapResponse(
      'GetTransportInfo',
      '<CurrentTransportState>PLAYING</CurrentTransportState>',
    );
    const positionInfo =
      '<?xml version="1.0"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
      `<s:Body><u:GetPositionInfoResponse xmlns:u="${AV_TRANSPORT_TYPE}">` +
      '<TrackDuration>0:04:55</TrackDuration>' +
      '<TrackMetaData>' +
      escapeXMLText(didl) +
      '</TrackMetaData>' +
      '<RelTime>0:01:23</RelTime>' +
      '</u:GetPositionInfoResponse></s:Body></s:Envelope>';

    const t = new RecordingTransport([ok(transportInfo), ok(positionInfo)]);

    const np = await control.getNowPlaying(t, BASE);

    expect(np).toEqual({
      state: 'PLAYING',
      title: 'Black Dog',
      artist: 'Led Zeppelin',
      album: 'Led Zeppelin IV',
      position: '0:01:23',
      duration: '0:04:55',
    });
    expect(t.requests).toHaveLength(2);
  });
});

describe('fetchTopology', () => {
  it('issues GetZoneGroupState and parses the canned household', async () => {
    const respBody = soapResponse(
      'GetZoneGroupState',
      '<ZoneGroupState>' + escapeXMLText(sampleZoneGroupState) + '</ZoneGroupState>',
    );
    const t = new RecordingTransport([ok(respBody)]);

    const household = await fetchTopology(t, BASE);

    expect(household.groups).toHaveLength(2);
    expect(household.groups[0].coordinator).toBe('RINCON_AAAAAAAAAAAA01400');
    expect(household.groups[0].members).toHaveLength(3);
    expect(household.groups[0].members[0].zoneName).toBe('Living Room');
    expect(household.groups[0].members[0].ip).toBe('192.168.1.10');
    expect(household.groups[0].members[2].invisible).toBe(true);
    expect(household.groups[1].members[0].zoneName).toBe('Kitchen');

    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://192.168.1.10:1400/ZoneGroupTopology/Control');
    expect(req.headers?.['SOAPACTION']).toBe(
      '"urn:schemas-upnp-org:service:ZoneGroupTopology:1#GetZoneGroupState"',
    );
  });
});
