import { describe, expect, it } from 'vitest';
import {
  baseURL,
  generation,
  parseDescription,
  rincon,
  type Device,
} from '../device';
import type { Service } from '../../sonos';

// Ported from backend/internal/sonos/device_test.go. Same fixtures, same
// expectations, adapted to the fast-xml-parser engine. parseTagValue:false
// keeps firmware versions ("15.9") as Go-faithful strings.

// A trimmed but structurally faithful Sonos device_description.xml: the root
// ZonePlayer device plus an embedded MediaRenderer carrying AVTransport and a
// MediaServer carrying ContentDirectory + the S2-only Queue service.
const sampleDescription = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:ZonePlayer:1</deviceType>
    <friendlyName>192.168.1.10 - Sonos One</friendlyName>
    <manufacturer>Sonos, Inc.</manufacturer>
    <modelNumber>S13</modelNumber>
    <modelName>Sonos One</modelName>
    <displayVersion>15.9</displayVersion>
    <roomName>Living Room</roomName>
    <UDN>uuid:RINCON_AAAAAAAAAAAA01400</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ZoneGroupTopology:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ZoneGroupTopology</serviceId>
        <controlURL>/ZoneGroupTopology/Control</controlURL>
        <eventSubURL>/ZoneGroupTopology/Event</eventSubURL>
        <SCPDURL>/xml/ZoneGroupTopology1.xml</SCPDURL>
      </service>
    </serviceList>
    <deviceList>
      <device>
        <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
            <controlURL>/MediaRenderer/AVTransport/Control</controlURL>
            <eventSubURL>/MediaRenderer/AVTransport/Event</eventSubURL>
            <SCPDURL>/xml/AVTransport1.xml</SCPDURL>
          </service>
          <service>
            <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
            <controlURL>/MediaRenderer/RenderingControl/Control</controlURL>
            <eventSubURL>/MediaRenderer/RenderingControl/Event</eventSubURL>
            <SCPDURL>/xml/RenderingControl1.xml</SCPDURL>
          </service>
        </serviceList>
      </device>
      <device>
        <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
            <controlURL>/MediaServer/ContentDirectory/Control</controlURL>
            <eventSubURL>/MediaServer/ContentDirectory/Event</eventSubURL>
            <SCPDURL>/xml/ContentDirectory1.xml</SCPDURL>
          </service>
          <service>
            <serviceType>urn:schemas-sonos-com:service:Queue:1</serviceType>
            <serviceId>urn:sonos-com:serviceId:Queue</serviceId>
            <controlURL>/MediaRenderer/Queue/Control</controlURL>
            <eventSubURL>/MediaRenderer/Queue/Event</eventSubURL>
            <SCPDURL>/xml/Queue1.xml</SCPDURL>
          </service>
        </serviceList>
      </device>
    </deviceList>
  </device>
</root>`;

/** Builds a minimal Device for the generation table. */
function deviceWith(services: Record<string, Service>, softwareVersion: string): Device {
  return {
    ip: '192.168.1.10',
    udn: 'uuid:RINCON_AAAAAAAAAAAA01400',
    friendlyName: '',
    modelName: '',
    modelNumber: '',
    softwareVersion,
    roomName: '',
    services: new Map(Object.entries(services)),
  };
}

const emptyService: Service = {
  serviceType: '',
  serviceId: '',
  controlURL: '',
  eventSubURL: '',
  scpdURL: '',
};

describe('parseDescription', () => {
  it('parses fields (udn/rincon/model/displayVersion/baseURL)', () => {
    const d = parseDescription('192.168.1.10', sampleDescription);

    expect(d.udn).toBe('uuid:RINCON_AAAAAAAAAAAA01400');
    expect(rincon(d)).toBe('RINCON_AAAAAAAAAAAA01400');
    expect(d.modelName).toBe('Sonos One');
    // displayVersion preferred over softwareVersion.
    expect(d.softwareVersion).toBe('15.9');
    expect(baseURL(d)).toBe('http://192.168.1.10:1400');
  });

  it('collects all 5 nested services with the right AVTransport control URL', () => {
    const d = parseDescription('192.168.1.10', sampleDescription);

    for (const want of [
      'ZoneGroupTopology',
      'AVTransport',
      'RenderingControl',
      'ContentDirectory',
      'Queue',
    ]) {
      expect(d.services.has(want), `missing service ${want}`).toBe(true);
    }
    expect(d.services.size).toBe(5);
    expect(d.services.get('AVTransport')?.controlURL).toBe(
      '/MediaRenderer/AVTransport/Control',
    );
  });

  it('reports S2 when the Queue service is present', () => {
    const d = parseDescription('192.168.1.10', sampleDescription);
    expect(generation(d)).toBe('S2');
  });

  it('throws when the device description has no UDN', () => {
    const noUdn = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <device>
    <friendlyName>No UDN here</friendlyName>
    <modelName>Sonos One</modelName>
  </device>
</root>`;
    expect(() => parseDescription('192.168.1.10', noUdn)).toThrow(/no UDN/);
  });
});

describe('generation table', () => {
  const cases: Array<{
    name: string;
    services: Record<string, Service>;
    sw: string;
    want: 'S2' | 'S1' | 'unknown';
  }> = [
    { name: 'queue present (+ fw 11)', services: { Queue: emptyService }, sw: '11.0', want: 'S2' },
    { name: 'no queue, fw 15.9', services: {}, sw: '15.9', want: 'S2' },
    { name: 'no queue, fw 11.1', services: {}, sw: '11.1', want: 'S1' },
    { name: 'no queue, empty fw', services: {}, sw: '', want: 'unknown' },
    { name: 'no queue, junk fw x.y', services: {}, sw: 'x.y', want: 'unknown' },
  ];

  for (const c of cases) {
    it(`${c.name} => ${c.want}`, () => {
      expect(generation(deviceWith(c.services, c.sw))).toBe(c.want);
    });
  }
});
