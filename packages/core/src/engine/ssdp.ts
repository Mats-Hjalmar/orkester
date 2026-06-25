// SSDP datagram parsing + M-SEARCH probe construction.
//
// Ported from backend/internal/sonos/ssdp.go — PURE functions only. The Go
// version leaned on net/http's ReadResponse to split the status line from the
// headers; here we parse the HTTP-style SSDP message by hand so this module
// touches NO node:* (it is part of the RN-facing core surface). The actual UDP
// multicast socket loop (Discover/DiscoverOne, multicastSockets) lives in the
// node DiscoveryTransport adapter, not here.

import type { SSDPResult } from '../sonos';

/**
 * The Sonos-specific UPnP device type used as the SSDP search target so we only
 * match ZonePlayers, not every UPnP device on the LAN.
 */
export const zonePlayerST = 'urn:schemas-upnp-org:device:ZonePlayer:1';

/** Discriminated result of {@link parseSSDPResponse}. */
export type ParseSSDPResult =
  | { ok: false }
  | { ok: true; result: SSDPResult };

/**
 * Parses a raw SSDP M-SEARCH response datagram (HTTP status line + CRLF
 * headers). Rejects (`{ok:false}`) when LOCATION is absent, or when an ST header
 * is present but does not name a ZonePlayer — mirroring ssdp.go exactly. On
 * accept, returns a Feature-1 {@link SSDPResult} with the responder IP extracted
 * from the LOCATION host and all header keys lowercased.
 */
export function parseSSDPResponse(raw: string | Uint8Array): ParseSSDPResult {
  const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

  // Split status line from header block. SSDP/HTTP uses CRLF; tolerate bare LF.
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length === 0) return { ok: false };

  // lines[0] is the status line ("HTTP/1.1 200 OK"); we don't need its fields,
  // but a malformed datagram with no header lines can't carry a LOCATION.
  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === '') break; // end of header block
    const colon = line.indexOf(':');
    if (colon < 0) continue; // not a header line; skip
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === '') continue;
    headers[key] = value;
  }

  const location = headers.location;
  if (!location) return { ok: false };

  const st = headers.st;
  // Only accept ZonePlayer responses; some speakers also answer for other
  // embedded device/service types we don't care about here. An ABSENT ST is
  // accepted (matches Go's `st != "" && !contains` guard).
  if (st !== undefined && st !== '' && !st.includes('ZonePlayer')) {
    return { ok: false };
  }

  return {
    ok: true,
    result: {
      address: parseHost(location) ?? '',
      location,
      usn: headers.usn ?? '',
      searchTarget: st ?? '',
      headers,
    },
  };
}

/**
 * Extracts the host IP from a `LOCATION` URL of the form
 * `http://{ip}:1400/xml/device_description.xml`. Returns `undefined` when no
 * host can be parsed. Ported from ssdp.go's parseHost (string slicing, not a
 * full URL parse — keeps behavior identical and avoids platform URL quirks).
 */
export function parseHost(location: string): string | undefined {
  const scheme = 'http://';
  let s = location.startsWith(scheme) ? location.slice(scheme.length) : location;
  const colon = s.indexOf(':');
  if (colon >= 0) {
    s = s.slice(0, colon);
  } else {
    const slash = s.indexOf('/');
    if (slash >= 0) s = s.slice(0, slash);
  }
  return s === '' ? undefined : s;
}

/**
 * Builds the SSDP M-SEARCH datagram for ZonePlayers. MX (the max wait a
 * responder may randomize before replying) is scaled from the listen window in
 * milliseconds to whole seconds, with a minimum of 1 — mirroring ssdp.go's
 * `max(int(wait.Seconds()), 1)`.
 */
export function searchProbe(waitMs: number): string {
  const mx = Math.max(Math.floor(waitMs / 1000), 1);
  return (
    'M-SEARCH * HTTP/1.1\r\n' +
    'HOST: 239.255.255.250:1900\r\n' +
    'MAN: "ssdp:discover"\r\n' +
    `MX: ${mx}\r\n` +
    `ST: ${zonePlayerST}\r\n\r\n`
  );
}
