// Native (Android/iOS) Api factory: composes the RN transports into an
// in-process SonosApi the app injects into StoreProvider. Metro resolves the
// `.native.ts` variant on a device; the web build gets makeNativeApi.ts (a stub
// that throws), so jsi-udp NEVER enters the web bundle.
//
// SPIKE-GATED: trusts react-native-jsi-udp's SSDP path (see README) — do not
// rely on it before the on-device spike passes.

import { SonosClient } from '@orkester/core';
import { SonosApi } from '@orkester/core/state';
import type { Api } from '@orkester/core';
import { RnFetchHttpTransport } from './RnFetchHttpTransport';
import { JsiUdpDiscoveryTransport, type MulticastLock } from './JsiUdpDiscoveryTransport';

/**
 * Builds the in-process engine-backed Api for a device. `lock` is the optional
 * Android MulticastLock (a config-plugin native module); pass it on Android so
 * SSDP responses are not dropped. The engine runs IN the RN JS context — there
 * is no separate process, unlike the Electron desktop.
 */
export function makeNativeApi(lock?: MulticastLock): Api {
  const client = new SonosClient({
    http: new RnFetchHttpTransport(),
    discovery: new JsiUdpDiscoveryTransport(lock),
  });
  return new SonosApi(client);
}

export type { MulticastLock };
