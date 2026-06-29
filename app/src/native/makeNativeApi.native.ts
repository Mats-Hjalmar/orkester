// Native (Android/iOS) Api factory: composes the RN transports into an
// in-process SonosApi the app injects into StoreProvider. Metro resolves the
// `.native.ts` variant on a device; the web build gets makeNativeApi.ts (a stub
// that throws), so the native discovery module NEVER enters the web bundle.
//
// Discovery is mDNS/Bonjour (react-native-zeroconf), not SSDP: on the target LAN
// the speakers answer mDNS but not SSDP M-SEARCH, and mDNS avoids iOS's
// Apple-gated multicast entitlement (see findings/mobile-discovery-mdns.md and
// ZeroconfDiscoveryTransport). HTTP control stays unicast over RN fetch.
//
// SPIKE-GATED: the on-device mDNS path is unproven on RN 0.81 New Architecture
// (see README) — do not rely on it before the on-device spike passes.

import { SonosClient } from '@orkester/core';
import { SonosApi } from '@orkester/core/state';
import type { Api } from '@orkester/core';
import { RnFetchHttpTransport } from './RnFetchHttpTransport';
import { ZeroconfDiscoveryTransport } from './ZeroconfDiscoveryTransport';
import { SecureCredentialStore } from './SecureCredentialStore';

/**
 * Builds the in-process engine-backed Api for a device. The engine runs IN the
 * RN JS context — there is no separate process, unlike the Electron desktop.
 *
 * The SecureCredentialStore is REQUIRED for Spotify search: SonosApi throws
 * "Spotify support is not configured" on every Spotify method when no store is
 * injected (the desktop injects NodeCredentialStore; this is the RN equivalent).
 */
export function makeNativeApi(): Api {
  const client = new SonosClient({
    http: new RnFetchHttpTransport(),
    discovery: new ZeroconfDiscoveryTransport(),
  });
  return new SonosApi(client, new SecureCredentialStore());
}
