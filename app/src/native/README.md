# Native (Android) Sonos engine — SPIKE-GATED

The Android app can run the Sonos engine **in-process** (unlike Electron, which
runs it in a separate Node process). The transports here are RN-specific:

- `RnFetchHttpTransport` — UPnP SOAP over RN `fetch` to `http://<ip>:1400`.
  Mirrors `NodeHttpTransport`: a non-2xx is **returned, not thrown**, so the SOAP
  layer can decode UPnP faults. Needs `usesCleartextTraffic` (set in `app.json`).
- `JsiUdpDiscoveryTransport` — SSDP over UDP via `react-native-jsi-udp`, reusing
  the node-free `searchProbe` / `parseSSDPResponse` from `@orkester/core/engine`.
  Acquires/releases a `MulticastLock` around the discovery window.
- `makeNativeApi()` composes both into an in-process `SonosApi`.

Metro resolution keeps the **web bundle node-free**: `makeNativeApi.native.ts`
(jsi-udp) is used on a device; `makeNativeApi.ts` (a throwing stub) is the web
fallback. `App.tsx` further guards with `Platform.OS !== 'web'` + a lazy
`require`, so `expo export --platform web` never pulls in jsi-udp (verified: 0
refs in the web bundle).

## ⚠️ This path is NOT proven

`react-native-jsi-udp` (last release Nov 2024, v1.3.0) is **unverified on RN 0.81
/ New Architecture**, and Android **drops inbound multicast** without a held
`WifiManager.MulticastLock` (there is no Expo core module for it). There is **no
device in CI**, so nothing here is known to work. `USE_NATIVE_ENGINE` in
`App.tsx` is **`false`** — the app ships on `MockApi` until the spike below
passes on the actual Nothing Phone.

## Step 1 — run the SSDP spike on the device (USER)

The spike (`SpikeScreen.native.tsx`) runs ONLY discovery and reports whether a
speaker is found. Mount it from a throwaway dev entry (do not commit), e.g. point
`App.tsx`'s render at it temporarily:

```tsx
// TEMP, in App.tsx, for the spike only:
import SpikeScreen from './src/native/SpikeScreen';
export default function App() { return <SpikeScreen />; }
```

Then build + install a **dev client** (Expo Go can't load custom native modules):

```bash
# from app/
npx expo install expo-build-properties react-native-jsi-udp   # pin SDK-54-correct versions
npx expo prebuild --platform android --clean                  # generate android/ with the perms + plugin
npx eas build --platform android --profile development          # or: npx expo run:android  (local toolchain)
# install the resulting .apk on the Nothing Phone, open it, tap "Run discovery (4s)"
```

**Pass criteria:** at least one responder appears with a `192.168.x.x` address and
a `RINCON_…` USN. **If zero responders on Android**, the `MulticastLock` is
required — see Step 2.

## Step 2 — MulticastLock (if the spike finds nothing)

Add a tiny config-plugin native module exposing `acquire()/release()` around
`WifiManager.createMulticastLock(...).acquire()/.release()`, pass it into
`JsiUdpDiscoveryTransport(lock)` / `makeNativeApi(lock)`, and re-run the spike.
`CHANGE_WIFI_MULTICAST_STATE` + `ACCESS_WIFI_STATE` are already declared in
`app.json`.

### Fallbacks if jsi-udp multicast stays broken

- **zeroconf / mDNS** discovery instead of SSDP (`_sonos._tcp` is not standard,
  but `_spotify-connect` / device mDNS can locate speakers), then `fetchTopology`.
- **Seed IP**: let the user type a speaker IP; skip discovery and call
  `fetchTopology(transport, "http://<ip>:1400")` directly.
- **Legacy-arch dev build** (`newArchEnabled:false`) to rule out a New-Arch JSI
  regression.

## Step 3 — turn the engine on (after the spike passes)

Set `USE_NATIVE_ENGINE = true` in `App.tsx`, rebuild the dev client, and confirm:
rooms populate, **Play** starts a real speaker, volume drag changes it, grouping
works, shuffle/repeat reflect in the official Sonos app.
