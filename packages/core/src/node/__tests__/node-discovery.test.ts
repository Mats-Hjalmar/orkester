import { createSocket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import type { SSDPResult } from '../../sonos';
import { makeDatagramHandler } from '../discoveryTransport';

// Offline discovery tests. NO real speaker and NO multicast: a synthetic
// ZonePlayer datagram is delivered (a) directly to the dedupe/filter handler
// and (b) over a real UDP socket on 127.0.0.1 (loopback only).
//
// We do not drive NodeDiscoveryTransport.discover() end-to-end here because it
// binds to the host's non-loopback multicast interfaces and sends to the SSDP
// multicast group 239.255.255.250 — neither deterministic in CI nor loopable
// back to a 127.0.0.1 listener. Instead we exercise the exact wiring discover()
// uses (makeDatagramHandler) plus a real loopback dgram round-trip, so the
// socket-message -> parse -> dedupe -> onResult path is covered offline. The
// multicast send/interface-bind glue is the only part deferred to live verify.

// A faithful SSDP M-SEARCH reply from a Sonos ZonePlayer.
const zonePlayerDatagram =
  'HTTP/1.1 200 OK\r\n' +
  'CACHE-CONTROL: max-age = 1800\r\n' +
  'EXT:\r\n' +
  'LOCATION: http://192.168.1.42:1400/xml/device_description.xml\r\n' +
  'SERVER: Linux UPnP/1.0 Sonos/79.1-55010\r\n' +
  'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
  'USN: uuid:RINCON_AAAAAAAAAAAA01400::urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
  '\r\n';

// A datagram from some other UPnP device with no ZonePlayer ST.
const nonZonePlayerDatagram =
  'HTTP/1.1 200 OK\r\n' +
  'LOCATION: http://192.168.1.99:1400/xml/device_description.xml\r\n' +
  'ST: urn:schemas-upnp-org:device:MediaServer:1\r\n' +
  'USN: uuid:RINCON_BBBBBBBBBBBB01400::urn:schemas-upnp-org:device:MediaServer:1\r\n' +
  '\r\n';

// A malformed datagram with no LOCATION header.
const noLocationDatagram =
  'HTTP/1.1 200 OK\r\n' +
  'ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n' +
  '\r\n';

describe('makeDatagramHandler (dedupe/filter wiring)', () => {
  it('a ZonePlayer datagram yields exactly one onResult', () => {
    const results: SSDPResult[] = [];
    const handle = makeDatagramHandler(new Set(), (r) => results.push(r));
    handle(new TextEncoder().encode(zonePlayerDatagram));
    expect(results).toHaveLength(1);
    expect(results[0].address).toBe('192.168.1.42');
    expect(results[0].location).toBe(
      'http://192.168.1.42:1400/xml/device_description.xml',
    );
  });

  it('a duplicate location is deduped to a single onResult', () => {
    const results: SSDPResult[] = [];
    const handle = makeDatagramHandler(new Set(), (r) => results.push(r));
    const buf = new TextEncoder().encode(zonePlayerDatagram);
    handle(buf);
    handle(buf);
    handle(buf);
    expect(results).toHaveLength(1);
  });

  it('a non-ZonePlayer datagram yields no onResult', () => {
    const results: SSDPResult[] = [];
    const handle = makeDatagramHandler(new Set(), (r) => results.push(r));
    handle(new TextEncoder().encode(nonZonePlayerDatagram));
    expect(results).toHaveLength(0);
  });

  it('a datagram with no LOCATION yields no onResult', () => {
    const results: SSDPResult[] = [];
    const handle = makeDatagramHandler(new Set(), (r) => results.push(r));
    handle(new TextEncoder().encode(noLocationDatagram));
    expect(results).toHaveLength(0);
  });
});

describe('loopback UDP round-trip (127.0.0.1 only, no multicast)', () => {
  it('a synthetic ZonePlayer datagram over loopback drives one onResult; bad datagrams none', async () => {
    const results: SSDPResult[] = [];
    const handle = makeDatagramHandler(new Set(), (r) => results.push(r));

    // Listener socket — the exact handler discover() attaches to its sockets.
    const listener = createSocket('udp4');
    const messageCount = await new Promise<number>((resolve, reject) => {
      let received = 0;
      const expected = 3; // we send 3 datagrams total
      listener.on('error', reject);
      listener.on('message', (msg: Buffer) => {
        handle(msg);
        received++;
        if (received === expected) resolve(received);
      });
      listener.bind(0, '127.0.0.1', () => {
        const { port } = listener.address() as AddressInfo;
        const sender = createSocket('udp4');
        const send = (payload: string) =>
          new Promise<void>((res, rej) =>
            sender.send(Buffer.from(payload, 'utf8'), port, '127.0.0.1', (e) =>
              e ? rej(e) : res(),
            ),
          );
        // One good ZonePlayer datagram + two that must be ignored.
        void send(zonePlayerDatagram)
          .then(() => send(nonZonePlayerDatagram))
          .then(() => send(noLocationDatagram))
          .finally(() => sender.close());
      });
    });
    listener.close();

    expect(messageCount).toBe(3);
    // Only the ZonePlayer datagram produced a result.
    expect(results).toHaveLength(1);
    expect(results[0].address).toBe('192.168.1.42');
  });
});
