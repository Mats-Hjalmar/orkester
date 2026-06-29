// React Native DiscoveryTransport — Sonos discovery over mDNS / Bonjour via
// react-native-zeroconf, the mirror of the node:dgram NodeDiscoveryTransport but
// for the platforms that actually answer here.
//
// WHY mDNS and not SSDP: on the target LAN the speakers answer mDNS
// (`_sonos._tcp`) but NOT SSDP M-SEARCH (see findings/mobile-discovery-mdns.md).
// mDNS also avoids iOS's Apple-gated multicast entitlement — Bonjour needs only
// the Local Network permission (NSLocalNetworkUsageDescription + NSBonjourServices
// in app.json). The `_sonos._tcp` TXT record carries exactly what the engine's
// SSDPResult needs: `location` (the device_description.xml URL) and `uuid` (the
// RINCON USN), so the rest of the engine (fetchTopology, control) is reused
// unchanged.
//
// node-free (RN Zeroconf only) — lives under app/src/native and is imported ONLY
// behind Platform.OS !== 'web', so the web/electron bundle never pulls it.
//
// No silent fallbacks: a Zeroconf error rejects discover(); a run that resolves
// nothing simply never calls onResult and resolves normally (the legitimate
// "none found" path, matching NodeDiscoveryTransport).

// eslint-disable-next-line @typescript-eslint/no-var-requires
import Zeroconf from 'react-native-zeroconf';
import type { DiscoverOptions, DiscoveryTransport, SSDPResult } from '@orkester/core';

/** Sonos advertises its control/topology endpoint as `_sonos._tcp.local.`. */
const SERVICE_TYPE = 'sonos';
const SERVICE_PROTOCOL = 'tcp';
const SERVICE_DOMAIN = 'local.';

/** Listen window when waitMs is non-positive (mirrors the node/jsi 3s default). */
const DEFAULT_WAIT_MS = 3000;

/** Speakers serve their device description on this port over plain HTTP. */
const SONOS_HTTP_PORT = 1400;
const DEVICE_DESCRIPTION_PATH = '/xml/device_description.xml';

/**
 * The shape react-native-zeroconf emits on `resolved`. Typed locally so we don't
 * couple to the lib's exported types (and so the txt access is explicit).
 */
interface ResolvedService {
  name?: string;
  fullName?: string;
  host?: string;
  port?: number;
  addresses?: string[];
  txt?: Record<string, string | undefined> | null;
}

/** Picks the first IPv4 address (Zeroconf may also surface IPv6 entries). */
function firstIPv4(addresses: string[] | undefined): string | undefined {
  if (!addresses) return undefined;
  return addresses.find((a) => /^\d{1,3}(\.\d{1,3}){3}$/.test(a));
}

/** The device type Sonos ZonePlayers match — the SSDP ST analogue for mDNS. */
const ZONEPLAYER_ST = 'urn:schemas-upnp-org:device:ZonePlayer:1';

/**
 * Maps a resolved `_sonos._tcp` service to the engine's SSDPResult. Returns null
 * when the record has no usable IPv4 — the engine builds the speaker's base URL
 * from `address` and throws without it, so a record we can't target is skipped
 * (the mDNS analogue of an unparseable SSDP datagram), not passed on with an
 * empty address. `location` is taken from the TXT record when present (it is, on
 * Sonos) and otherwise derived from the resolved IPv4 at the standard :1400
 * device-description endpoint — a deterministic, documented derivation. The
 * SSDP-only fields (`searchTarget`, `headers`) have no mDNS equivalent and are
 * filled with the matched device type / an empty map (both unused downstream).
 */
export function serviceToSSDPResult(service: ResolvedService): SSDPResult | null {
  const address = firstIPv4(service.addresses);
  if (!address) return null;

  const txt = service.txt ?? {};
  const location = txt.location ?? `http://${address}:${SONOS_HTTP_PORT}${DEVICE_DESCRIPTION_PATH}`;

  // USN: prefer the TXT uuid; else the instance name is `RINCON_…@Room`.
  const usn = txt.uuid ?? service.name?.split('@')[0];
  if (!usn) return null;

  return { address, location, usn, searchTarget: ZONEPLAYER_ST, headers: {} };
}

export class ZeroconfDiscoveryTransport implements DiscoveryTransport {
  async discover(options: DiscoverOptions): Promise<void> {
    const waitMs = options.waitMs > 0 ? options.waitMs : DEFAULT_WAIT_MS;
    const seen = new Set<string>();
    const zeroconf = new Zeroconf();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        if (deadline) clearTimeout(deadline);
        if (options.signal) options.signal.removeEventListener('abort', onAbort);
        try {
          zeroconf.stop();
          zeroconf.removeDeviceListeners();
        } catch {
          // scan may already be stopped; stopping twice is harmless.
        }
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

      if (options.signal) {
        if (options.signal.aborted) {
          resolve();
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      zeroconf.on('error', (err: unknown) => {
        fail(err instanceof Error ? err : new Error(String(err)));
      });

      zeroconf.on('resolved', (service: ResolvedService) => {
        const result = serviceToSSDPResult(service);
        if (!result) return;
        if (seen.has(result.location)) return;
        seen.add(result.location);
        options.onResult(result);
      });

      zeroconf.scan(SERVICE_TYPE, SERVICE_PROTOCOL, SERVICE_DOMAIN);
      deadline = setTimeout(finish, waitMs);
    });
  }
}
