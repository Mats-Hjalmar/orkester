import { describe, expect, it } from 'vitest';
import { parseSSDPResponse, searchProbe, zonePlayerST } from '../ssdp';

// Ported from backend/internal/sonos/ssdp.go (parseSSDPResponse / searchProbe /
// parseHost). PURE datagram parsing only — no dgram socket loop here (that lives
// in the node adapter). Same fixtures, same accept/reject semantics, adapted to
// the Feature-1 SSDPResult shape (address/location/usn/searchTarget/headers with
// lowercased keys).

// A faithful SSDP M-SEARCH reply from a Sonos ZonePlayer: HTTP status line
// followed by CRLF-delimited headers. Header names are deliberately mixed-case
// to exercise the case-insensitive lookup / lowercased-key contract.
const sampleResponse =
  'HTTP/1.1 200 OK\r\n' +
  'CACHE-CONTROL: max-age = 1800\r\n' +
  'EXT:\r\n' +
  'LOCATION: http://192.168.1.10:1400/xml/device_description.xml\r\n' +
  'SERVER: Linux UPnP/1.0 Sonos/79.1-55010\r\n' +
  'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
  'USN: uuid:RINCON_AAAAAAAAAAAA01400::urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
  '\r\n';

describe('parseSSDPResponse', () => {
  it('sample parse', () => {
    const parsed = parseSSDPResponse(sampleResponse);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return; // narrow for TS
    expect(parsed.result.location).toBe(
      'http://192.168.1.10:1400/xml/device_description.xml',
    );
    expect(parsed.result.address).toBe('192.168.1.10');
    expect(parsed.result.usn).toBe(
      'uuid:RINCON_AAAAAAAAAAAA01400::urn:schemas-upnp-org:device:ZonePlayer:1',
    );
    expect(parsed.result.searchTarget).toBe(
      'urn:schemas-upnp-org:device:ZonePlayer:1',
    );
  });

  it('result conforms to Feature-1 SSDPResult shape with lowercased header keys', () => {
    const parsed = parseSSDPResponse(sampleResponse);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.result).sort()).toEqual([
      'address',
      'headers',
      'location',
      'searchTarget',
      'usn',
    ]);
    // Header keys are lowercased; values preserved verbatim.
    expect(parsed.result.headers.location).toBe(
      'http://192.168.1.10:1400/xml/device_description.xml',
    );
    expect(parsed.result.headers.st).toBe(
      'urn:schemas-upnp-org:device:ZonePlayer:1',
    );
    expect(parsed.result.headers.usn).toBe(parsed.result.usn);
    // No upper-case key leaked through.
    expect(parsed.result.headers.LOCATION).toBeUndefined();
  });

  it('non-ZonePlayer reject', () => {
    const resp =
      'HTTP/1.1 200 OK\r\n' +
      'LOCATION: http://192.168.1.10:1400/xml/device_description.xml\r\n' +
      'ST: urn:schemas-upnp-org:service:AVTransport:1\r\n' +
      'USN: uuid:RINCON_AAAAAAAAAAAA01400\r\n' +
      '\r\n';
    expect(parseSSDPResponse(resp).ok).toBe(false);
  });

  it('no-LOCATION reject', () => {
    const resp =
      'HTTP/1.1 200 OK\r\n' +
      'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
      'USN: uuid:RINCON_AAAAAAAAAAAA01400\r\n' +
      '\r\n';
    expect(parseSSDPResponse(resp).ok).toBe(false);
  });

  it('accepts a Uint8Array datagram', () => {
    const parsed = parseSSDPResponse(
      new TextEncoder().encode(sampleResponse),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.address).toBe('192.168.1.10');
  });

  it('accepts when ST header is absent (LOCATION present)', () => {
    // Go only rejects when ST is present AND not a ZonePlayer; an absent ST is
    // accepted. searchTarget falls back to empty string.
    const resp =
      'HTTP/1.1 200 OK\r\n' +
      'LOCATION: http://192.168.1.10:1400/xml/device_description.xml\r\n' +
      'USN: uuid:RINCON_AAAAAAAAAAAA01400\r\n' +
      '\r\n';
    const parsed = parseSSDPResponse(resp);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.searchTarget).toBe('');
    expect(parsed.result.address).toBe('192.168.1.10');
  });
});

describe('searchProbe', () => {
  it('searchProbe content', () => {
    const probe = searchProbe(3000);
    expect(probe).toContain('M-SEARCH * HTTP/1.1');
    expect(probe).toContain('MAN: "ssdp:discover"');
    expect(probe).toContain(`ST: ${zonePlayerST}`);
    expect(zonePlayerST).toContain('ZonePlayer');
    expect(probe).toContain('MX: 1');
  });

  it('MX is a small fixed 1 (snappy first reply) regardless of the wait window', () => {
    // MX caps the responder's random reply delay; discovery aborts on first
    // responder, so a small MX makes the first reply land in ~<1s.
    expect(searchProbe(500)).toContain('MX: 1');
    expect(searchProbe(0)).toContain('MX: 1');
    expect(searchProbe(5000)).toContain('MX: 1');
  });
});
