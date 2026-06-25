// Node.js DiscoveryTransport adapter (SSDP over UDP multicast).
//
// One of the ONLY two node:* importers in @orkester/core (see httpTransport.ts).
// The PURE datagram parsing and probe construction live in ../engine/ssdp
// (node-free); this file owns just the dgram socket loop, ported from
// backend/internal/sonos/ssdp.go (Discover + multicastSockets).

import { createSocket } from 'node:dgram';
import type { Socket } from 'node:dgram';
import { networkInterfaces } from 'node:os';

import type {
  DiscoverOptions,
  DiscoveryTransport,
  SSDPResult,
} from '../sonos';
import { parseSSDPResponse, searchProbe } from '../engine/ssdp';

/** Standard SSDP multicast endpoint. */
const SSDP_MULTICAST_ADDR = '239.255.255.250';
const SSDP_MULTICAST_PORT = 1900;

/** Default listen window when waitMs is non-positive (mirrors ssdp.go's 3s). */
const DEFAULT_WAIT_MS = 3000;
/** Number of probes sent per socket — UDP is lossy (mirrors ssdp.go's `range 3`). */
const PROBE_COUNT = 3;
/** Gap between probes (mirrors ssdp.go's 50ms sleep). */
const PROBE_INTERVAL_MS = 50;

/**
 * Builds the per-run datagram handler that parses, ZonePlayer-filters and
 * dedupes by location, invoking `onResult` once per unique responder. Exported
 * for offline unit testing of the dedupe/filter wiring independently of any
 * socket. `seen` is shared across every interface socket in a run.
 */
export function makeDatagramHandler(
  seen: Set<string>,
  onResult: (result: SSDPResult) => void,
): (datagram: Uint8Array) => void {
  return (datagram) => {
    const parsed = parseSSDPResponse(datagram);
    if (!parsed.ok) return;
    const { location } = parsed.result;
    if (seen.has(location)) return;
    seen.add(location);
    onResult(parsed.result);
  };
}

/**
 * Lists the non-loopback IPv4 interface addresses to bind a discovery socket
 * to. Binding to each interface IP routes the probe out that interface, which
 * matters on multi-homed hosts (ported from ssdp.go's multicastSockets, using
 * node:os in place of net.Interfaces). node:os does not expose a per-interface
 * multicast flag, so we filter on non-internal IPv4 only.
 */
export function multicastInterfaceAddresses(): string[] {
  const addrs: string[] = [];
  const ifaces = networkInterfaces();
  for (const list of Object.values(ifaces)) {
    if (!list) continue;
    for (const info of list) {
      if (info.internal) continue;
      // node 18+ reports `family` as the string 'IPv4' (older numeric 4 also
      // tolerated for safety).
      const isV4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (!isV4) continue;
      addrs.push(info.address);
    }
  }
  return addrs;
}

/**
 * Concrete {@link DiscoveryTransport} backed by node:dgram. Opens one UDP4
 * socket per multicast-capable non-loopback interface, sends the M-SEARCH probe
 * a few times, listens until `waitMs` elapses or the caller's AbortSignal fires,
 * parsing each datagram and deduping by LOCATION so `onResult` fires once per
 * unique ZonePlayer.
 *
 * No silent fallbacks: when no multicast-capable interface exists, this throws
 * rather than completing as a no-op (a no-op would be indistinguishable from
 * "no speakers answered"). A run that finds nothing simply never calls
 * `onResult` and resolves normally — that is the legitimate "none found" path.
 */
export class NodeDiscoveryTransport implements DiscoveryTransport {
  async discover(options: DiscoverOptions): Promise<void> {
    const waitMs = options.waitMs > 0 ? options.waitMs : DEFAULT_WAIT_MS;
    const addresses = multicastInterfaceAddresses();
    if (addresses.length === 0) {
      throw new Error('no multicast-capable IPv4 interfaces found');
    }

    const probe = Buffer.from(searchProbe(waitMs), 'utf8');
    const seen = new Set<string>();
    const handle = makeDatagramHandler(seen, options.onResult);

    await Promise.all(
      addresses.map((address) =>
        this.discoverOnInterface(address, probe, waitMs, handle, options.signal),
      ),
    );
  }

  /** Runs the probe/listen loop on a single bound interface socket. */
  private discoverOnInterface(
    bindAddress: string,
    probe: Buffer,
    waitMs: number,
    handle: (datagram: Uint8Array) => void,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket: Socket = createSocket({ type: 'udp4', reuseAddr: true });
      let settled = false;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const probeTimers: ReturnType<typeof setTimeout>[] = [];

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (deadlineTimer) clearTimeout(deadlineTimer);
        for (const t of probeTimers) clearTimeout(t);
        if (signal) signal.removeEventListener('abort', onAbort);
        socket.close();
      };

      const finish = () => {
        cleanup();
        resolve();
      };

      const fail = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onAbort = () => finish();

      if (signal) {
        if (signal.aborted) {
          // Never opened a listener; resolve immediately.
          socket.close();
          resolve();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      socket.on('error', fail);
      socket.on('message', (msg: Buffer) => handle(msg));

      socket.bind({ address: bindAddress, port: 0 }, () => {
        // Send a few probes — UDP is lossy and a speaker may miss one.
        const sendProbe = () => {
          if (settled) return;
          socket.send(probe, SSDP_MULTICAST_PORT, SSDP_MULTICAST_ADDR);
        };
        sendProbe();
        for (let i = 1; i < PROBE_COUNT; i++) {
          probeTimers.push(setTimeout(sendProbe, PROBE_INTERVAL_MS * i));
        }
        deadlineTimer = setTimeout(finish, waitMs);
      });
    });
  }
}
