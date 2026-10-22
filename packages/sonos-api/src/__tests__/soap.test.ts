import { describe, expect, it } from 'vitest';
import {
  buildEnvelope,
  extractResponseArg,
  instanceArg,
  makeParser,
  parseFault,
  parserOptions,
} from '../soap';

// Ported from backend/internal/sonos/soap_test.go. Same fixtures, same
// expectations, adapted to the fast-xml-parser engine. parseTagValue:false is
// load-bearing: it keeps text nodes (incl. errorCode) as Go-faithful strings.

describe('soap parser config', () => {
  it('uses parseTagValue:false (observable: numeric text stays a string)', () => {
    expect(parserOptions.parseTagValue).toBe(false);
    expect(parserOptions.removeNSPrefix).toBe(true);
    expect(parserOptions.ignoreAttributes).toBe(false);

    const parser = makeParser();
    const obj = parser.parse('<X>0714</X>') as { X: unknown };
    expect(obj.X).toBe('0714');
    expect(typeof obj.X).toBe('string');
  });
});

describe('buildEnvelope', () => {
  it('emits the action open w/ xmlns, args in order, and close', () => {
    const env = buildEnvelope(
      'urn:schemas-upnp-org:service:RenderingControl:1',
      'SetVolume',
      [
        instanceArg(),
        { name: 'Channel', value: 'Master' },
        { name: 'DesiredVolume', value: '25' },
      ],
    );

    for (const sub of [
      '<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">',
      '<InstanceID>0</InstanceID>',
      '<Channel>Master</Channel>',
      '<DesiredVolume>25</DesiredVolume>',
      '</u:SetVolume>',
    ]) {
      expect(env).toContain(sub);
    }

    // InstanceID must precede the other args.
    expect(env.indexOf('InstanceID')).toBeLessThan(env.indexOf('DesiredVolume'));
  });

  it("renders an empty-string arg as '<Tag></Tag>', never self-closing", () => {
    const env = buildEnvelope(
      'urn:schemas-upnp-org:service:AVTransport:1',
      'X',
      [{ name: 'Tag', value: '' }],
    );
    expect(env).toContain('<Tag></Tag>');
    expect(env).not.toContain('<Tag/>');
  });

  it('escapes XML in arg values (DIDL metadata)', () => {
    const env = buildEnvelope(
      'urn:schemas-upnp-org:service:AVTransport:1',
      'SetAVTransportURI',
      [
        instanceArg(),
        { name: 'CurrentURIMetaData', value: '<DIDL-Lite a="b">x</DIDL-Lite>' },
      ],
    );
    expect(env).not.toContain('<DIDL-Lite');
    expect(env).toContain('&lt;DIDL-Lite');
  });
});

const sampleFault = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring>UPnPError</faultstring>
      <detail>
        <UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
          <errorCode>714</errorCode>
          <errorDescription>Illegal MIME-Type</errorDescription>
        </UPnPError>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>`;

describe('parseFault', () => {
  it('parses a UPnP fault: upnpError 714 (number) + desc + message', () => {
    const f = parseFault(sampleFault);
    expect(f).not.toBeNull();
    expect(f!.upnpError).toBe(714);
    expect(typeof f!.upnpError).toBe('number');
    expect(f!.errorDesc).toBe('Illegal MIME-Type');
    expect(f!.message).toContain('714');
  });

  it('returns null for a non-fault body', () => {
    expect(parseFault('<ok/>')).toBeNull();
  });
});

const sampleZGSResponse = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:GetZoneGroupStateResponse xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1">
      <ZoneGroupState>&lt;ZoneGroupState&gt;&lt;ZoneGroups&gt;&lt;ZoneGroup Coordinator="RINCON_A01400" ID="x"&gt;&lt;ZoneGroupMember UUID="RINCON_A01400" ZoneName="Den" Location="http://192.168.1.5:1400/xml/device_description.xml"/&gt;&lt;/ZoneGroup&gt;&lt;/ZoneGroups&gt;&lt;/ZoneGroupState&gt;</ZoneGroupState>
    </u:GetZoneGroupStateResponse>
  </s:Body>
</s:Envelope>`;

describe('extractResponseArg', () => {
  it('returns the named element text with entities decoded', () => {
    const state = extractResponseArg(sampleZGSResponse, 'ZoneGroupState');
    expect(state.trim().startsWith('<ZoneGroupState>')).toBe(true);
  });

  it('finds a deeply-nested element regardless of wrapper name', () => {
    const body = '<a><b><c><Deep>val</Deep></c></b></a>';
    expect(extractResponseArg(body, 'Deep')).toBe('val');
  });

  it('throws when the named element is missing', () => {
    expect(() => extractResponseArg(sampleZGSResponse, 'NoSuchElement')).toThrow();
  });
});
