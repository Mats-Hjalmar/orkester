// Web/default stub for the native Api factory. Metro picks makeNativeApi.native.ts
// on a device; this non-native variant is what the WEB bundle resolves, so the
// react-native-zeroconf / RN-fetch transports never enter the web build. Calling
// it on web is a wiring bug (web uses MockApi), so it THROWS rather than silently
// returning a no-op Api.

import type { Api } from '@orkester/core';

export function makeNativeApi(): Api {
  throw new Error(
    'makeNativeApi() is native-only — the web build uses MockApi. This stub means a native ' +
      'module was imported on web (Platform.OS guard missing).',
  );
}
