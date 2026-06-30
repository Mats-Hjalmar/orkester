# Native (iOS/Android) Sonos engine — SPIKE-GATED

The mobile app can run the Sonos engine **in-process** (unlike Electron, which
runs it in a separate Node process). The transports here are RN-specific:

- `RnFetchHttpTransport` — UPnP SOAP over RN `fetch` to `http://<ip>:1400`.
  Mirrors `NodeHttpTransport`: a non-2xx is **returned, not thrown**, so the SOAP
  layer can decode UPnP faults. Needs `usesCleartextTraffic` (Android, set via
  `expo-build-properties` in `app.json`).
- `ZeroconfDiscoveryTransport` — **mDNS/Bonjour** discovery via
  `react-native-zeroconf` (`_sonos._tcp`). Reuses the engine's `SSDPResult`
  contract: the speaker's TXT record carries `location` (the
  `device_description.xml` URL) and `uuid` (the RINCON USN), so the rest of the
  engine (`fetchTopology`, control) is reused unchanged.
- `makeNativeApi()` composes both into an in-process `SonosApi`.

## Why mDNS and not SSDP

On the target LAN the speakers answer **mDNS** (`_sonos._tcp`) but **not** SSDP
M-SEARCH — see `findings/mobile-discovery-mdns.md` for the probe results. mDNS is
also the strictly easier path on iOS: Bonjour needs only the **Local Network
permission** (`NSLocalNetworkUsageDescription` + `NSBonjourServices` in
`app.json`), whereas SSDP multicast would require Apple's **approval-gated**
`com.apple.developer.networking.multicast` entitlement. (The old
`react-native-jsi-udp`/SSDP transport was removed.)

Metro resolution keeps the **web bundle clean**: `makeNativeApi.native.ts`
(zeroconf) is used on a device; `makeNativeApi.ts` (a throwing stub) is the web
fallback. `App.tsx` further guards with `Platform.OS !== 'web'` + a lazy
`require`, so `expo export --platform web` never pulls in the native module.

## ⚠️ This path is NOT proven

`react-native-zeroconf` (v0.14.0, Dec 2025) is a legacy native module relying on
RN's New-Architecture interop layer. The mDNS spike passed on 2026-06-29 (Android
on real hardware, iOS on the Simulator), so `App.tsx` now always runs this
in-process engine on a device (the old `NATIVE_ENGINE_PLATFORMS` per-platform gate
was removed when the mock Api was dropped — there is no fallback). But there is
still **no device in CI**, and the iOS Simulator does **not** enforce the Local
Network prompt, so a real iPhone's first-launch grant remains unverified. Treat the
native path as enabled-but-thin; the steps below are the gate before trusting it on
new hardware.

## Step 1 — run the mDNS spike on the device (USER)

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
npx expo install react-native-zeroconf expo-build-properties   # SDK-54-correct versions
npx expo prebuild --platform android --clean                    # generate android/ (perms)
npx expo run:android                                            # local toolchain; or EAS dev build
# (iOS: npx expo prebuild --platform ios --clean && npx expo run:ios — grant the
#  Local Network prompt on first launch)
# open the app, tap "Run discovery (4s)"
```

**Pass criteria:** at least one responder appears with an IPv4 address (this LAN
is `10.10.x.x`, NOT `192.168.x.x` — do not assume the prefix) and a `RINCON_…`
USN.

## Step 2 — if the spike finds nothing

- **Android:** `react-native-zeroconf` has two impls — the default Android `NSD`
  and a newer `DNSSD`. If `NSD` is flaky, try the `DNSSD` impl
  (`zeroconf.scan('sonos','tcp','local.', ImplType.DNSSD)`). Confirm
  `CHANGE_WIFI_MULTICAST_STATE` + `ACCESS_WIFI_STATE` are present (they are, in
  `app.json`).
- **iOS:** confirm the Local Network permission was granted (Settings → the app →
  Local Network) and `NSBonjourServices` lists `_sonos._tcp`.
- **Either:** verify the device is on the same Wi-Fi/subnet as the speakers (no
  VLAN/AP isolation).
- **New-Arch sanity:** if discovery errors on load, the module may not be loading
  under bridgeless — rule it out with a one-off legacy build (`newArchEnabled:false`,
  a SDK-54-only diagnostic; RN 0.82+ removes the option).

### Fallback if mDNS stays broken

- **Seed IP**: let the user type a speaker IP; skip discovery and call
  `fetchTopology(transport, "http://<ip>:1400")` directly. (Still subject to the
  iOS Local Network permission, since it's unicast to a local IP.)

## Step 3 — confirm the engine on the device (after the spike passes)

The engine is always on for native builds (no per-platform gate). Rebuild the dev
client and confirm: rooms
populate, **Play** starts a real speaker, volume drag changes it, grouping works,
shuffle/repeat reflect in the official Sonos app. Handle the Local-Network-denied
state on control calls (surface it — no silent fallback).
