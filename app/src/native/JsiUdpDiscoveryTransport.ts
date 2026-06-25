// React Native DiscoveryTransport — SSDP over UDP via react-native-jsi-udp.
//
// Reuses the NODE-FREE protocol logic from @orkester/core/engine
// (searchProbe / parseSSDPResponse) — only the socket loop is RN-specific, the
// mirror of the node DiscoveryTransport. On Android, multicast RX is dropped by
// the Wi-Fi stack unless a WifiManager.MulticastLock is held, so we acquire one
// for the discovery window and release it in a finally.
//
// SPIKE-GATED: react-native-jsi-udp is unproven on RN 0.81 / New Architecture
// (see app/src/native/README.md). This path must pass the on-device spike before
// it is trusted. It lives under app/src/native and is imported ONLY behind
// Platform.OS !== 'web' (the web bundle must never pull in jsi-udp).
//
// No silent fallbacks: if the MulticastLock cannot be acquired we SURFACE a
// warning (multicast RX will likely fail) rather than pretending it worked; a
// socket error rejects the discover() promise.

// eslint-disable-next-line @typescript-eslint/no-var-requires
import dgram from 'react-native-jsi-udp';
import type { DiscoverOptions, DiscoveryTransport, SSDPResult } from '@orkester/core';
import { parseSSDPResponse, searchProbe } from '@orkester/core/engine';

const SSDP_MULTICAST_ADDR = '239.255.255.250';
const SSDP_MULTICAST_PORT = 1900;
const DEFAULT_WAIT_MS = 3000;
const PROBE_COUNT = 3;
const PROBE_INTERVAL_MS = 50;

/**
 * A WifiManager MulticastLock handle. On Android this MUST be held around the
 * discovery window or the OS silently drops inbound multicast. There is no Expo
 * core module for it, so the host supplies one (a tiny config-plugin native
 * module — see README). Web/iOS pass `undefined` (no lock needed).
 */
export interface MulticastLock {
  acquire(): void;
  release(): void;
}

export class JsiUdpDiscoveryTransport implements DiscoveryTransport {
  private readonly lock: MulticastLock | undefined;

  constructor(lock?: MulticastLock) {
    this.lock = lock;
  }

  async discover(options: DiscoverOptions): Promise<void> {
    const waitMs = options.waitMs > 0 ? options.waitMs : DEFAULT_WAIT_MS;

    if (this.lock) {
      this.lock.acquire();
    } else {
      // Visible, not silent: discovery will likely receive nothing on Android
      // without the lock. The spike confirms whether jsi-udp needs it here.
      console.warn(
        '[JsiUdpDiscoveryTransport] no MulticastLock supplied — Android may drop SSDP responses',
      );
    }

    const seen = new Set<string>();
    try {
      await new Promise<void>((resolve, reject) => {
        // dgram mirrors node's API (createSocket/bind/send/on).
        const socket = dgram.createSocket({ type: 'udp4', reusePort: true } as never);
        let settled = false;
        const probeTimers: ReturnType<typeof setTimeout>[] = [];
        let deadline: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
          if (settled) return;
          settled = true;
          for (const t of probeTimers) clearTimeout(t);
          if (deadline) clearTimeout(deadline);
          if (options.signal) options.signal.removeEventListener('abort', onAbort);
          try {
            socket.close();
          } catch {
            // socket may already be closed; closing twice is harmless.
          }
        };
        const finish = () => {
          cleanup();
          resolve();
        };
        const onAbort = () => finish();

        if (options.signal) {
          if (options.signal.aborted) {
            try {
              socket.close();
            } catch {
              /* already closed */
            }
            resolve();
            return;
          }
          options.signal.addEventListener('abort', onAbort, { once: true });
        }

        socket.on('error', (err: Error) => {
          cleanup();
          reject(err);
        });

        socket.on('message', (msg: Uint8Array) => {
          const parsed = parseSSDPResponse(msg);
          if (!parsed.ok) return;
          const result: SSDPResult = parsed.result;
          if (seen.has(result.location)) return;
          seen.add(result.location);
          options.onResult(result);
        });

        socket.bind(0, () => {
          const probe = searchProbe(waitMs);
          const sendProbe = () => {
            if (settled) return;
            socket.send(probe, undefined, undefined, SSDP_MULTICAST_PORT, SSDP_MULTICAST_ADDR, (err?: Error) => {
              if (err && !settled) {
                cleanup();
                reject(err);
              }
            });
          };
          sendProbe();
          for (let i = 1; i < PROBE_COUNT; i++) {
            probeTimers.push(setTimeout(sendProbe, PROBE_INTERVAL_MS * i));
          }
          deadline = setTimeout(finish, waitMs);
        });
      });
    } finally {
      if (this.lock) this.lock.release();
    }
  }
}
