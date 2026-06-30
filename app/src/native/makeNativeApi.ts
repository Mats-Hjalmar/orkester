// Web/default stub for the native Api factory. Metro picks makeNativeApi.native.ts
// on a device; this non-native variant is what a web build would resolve, so the
// react-native-zeroconf / RN-fetch transports never enter it. The app has no web
// target (a browser can't discover/control speakers — the desktop runs through the
// Electron app), so reaching here is a wiring bug: it THROWS rather than silently
// returning a no-op Api.

import type { Api } from '@orkester/core';

export function makeNativeApi(): Api {
  throw new Error(
    'makeNativeApi() is native-only — there is no web target. This stub resolving means a ' +
      'native module was imported on web (Platform.OS guard missing).',
  );
}
