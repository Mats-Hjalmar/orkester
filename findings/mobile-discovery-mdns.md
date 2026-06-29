# Mobile (RN) Sonos discovery: use mDNS, not SSDP

Durable conclusions for the on-device (iOS/Android) Sonos engine discovery path.

- 2026-06-26: **On this LAN, Sonos answers mDNS but NOT SSDP M-SEARCH.** Probed
  from a laptop on the same subnet:
  - `go run ./cmd/orkester list -wait 5s` (the engine's SSDP M-SEARCH path) →
    "no Sonos speakers answered SSDP."
  - `dns-sd -B _sonos._tcp local` → all speakers listed
    (`RINCON_…@Lobby`, `…@Matsalen`, `…@Dagobah …`, etc.).
  - `dns-sd -L … _sonos._tcp local` TXT record contains exactly what the engine
    needs: `location=http://10.10.247.194:1400/xml/device_description.xml` and
    `uuid=RINCON_949F3E06EC2801400`.
  - `curl http://10.10.247.194:1400/xml/device_description.xml` → HTTP 200, full
    UPnP ZonePlayer description (Play:1, model S12). So unicast HTTP control on
    :1400 works fine; only multicast SSDP RX comes back empty.
  - Caveat: the SSDP miss *could* be a macOS Local-Network-permission false
    negative on the `go` binary (the backend README warns about exactly this) OR
    genuine mDNS-only firmware. Not fully disambiguated — but it doesn't change
    the decision: mDNS is reliable and complete here.

- 2026-06-26: **Decision — the RN app discovers via mDNS (`react-native-zeroconf`),
  not `react-native-jsi-udp`/SSDP.** Rationale:
  - Proven on this network; SSDP is at best uncertain.
  - The `_sonos._tcp` TXT record yields `location` + `uuid` directly, mapping 1:1
    onto the engine's `SSDPResult { address, location, usn }` seam
    (`packages/core/src/sonos/index.ts`). The rest of the engine (`fetchTopology`,
    control) is reused unchanged.
  - **Avoids the Apple multicast entitlement** (`com.apple.developer.networking.multicast`,
    Apple-approval-gated, multi-day). Bonjour/mDNS on iOS needs only the Local
    Network permission (`NSLocalNetworkUsageDescription` + `NSBonjourServices`).
  - Drops the unproven `react-native-jsi-udp` (v1.3.0, Nov 2024, 0 maintainers,
    unverified on RN 0.81 New Arch) and the Android `WifiManager.MulticastLock`
    native module entirely.

- 2026-06-26: **`react-native-zeroconf@0.14.0`** (published 2025-12-31, after a
  long gap from 0.13.8/2023) is the chosen lib. API: `new Zeroconf()`,
  `scan(type, protocol, domain)` e.g. `scan('sonos','tcp','local.')`,
  `on('resolved', service)` → `{ name, host, port, addresses[], txt, fullName }`,
  `stop()`, `removeDeviceListeners()`. Android has two impls (NSD default; a newer
  `DNSSD` impl added around 0.14.0). New-Arch (bridgeless) support is **to be
  confirmed by the on-device spike** — it's a legacy native module relying on RN's
  interop layer; the recent release is encouraging but not proof.

- 2026-06-26: **The network here is `10.10.x.x`, not `192.168.x.x`.** Any
  discovery "pass criteria" / SpikeScreen must not hard-code the `192.168` prefix.

- 2026-06-29: **On-device spike PASSED on real Android hardware (model A065, RN
  0.81 New Architecture).** `react-native-zeroconf@0.14.0` loaded and ran under
  bridgeless/New Arch with NO crash — the unproven risk is cleared. The spike
  (`SpikeScreen.native.tsx`, now auto-runs on mount + logs `[SPIKE] …` to logcat)
  found **13** `_sonos._tcp` responders, each with a usable IPv4 (`10.10.x.x`,
  one `10.200.0.57`) and a `RINCON_…` USN. Android's OS NSD resolver
  (`serviceDiscovery [MdnsDiscoveryManager] _sonos._tcp.local`) backs it — visible
  in logcat resolving rooms by name (`@Lobby`, `@Matsalen`, `@Ateljén Taket`, …).
  How to re-run: `EXPO_PUBLIC_RUN_SPIKE=1 npx expo run:android` boots straight into
  the spike (default off; `RUN_SPIKE` gate in `App.tsx`).

- 2026-06-29: **`NATIVE_ENGINE_PLATFORMS.android` turned ON** (`App.tsx`). The real
  app (no spike flag) then booted against the live system: topology loaded,
  now-playing + the coordinator's real **70-track queue** with album art rendered
  over the LAN (unicast `http://<ip>:1400`), no mock, no crash. iOS stays gated
  until its own on-device spike runs. The Android `WifiManager.MulticastLock` is
  NOT needed — OS NSD handles `_sonos._tcp` without it on this hardware.

- 2026-06-29: **iOS spike PASSED on the iOS Simulator (iPhone 16, Xcode 26.6, RN
  0.81 New Arch)** — `react-native-zeroconf` found the same **13** `_sonos._tcp`
  responders, and `NATIVE_ENGINE_PLATFORMS.ios` was turned ON. The real-engine app
  on the sim then populated the live household (Lobby +1 playing, Ateljén Bokhylla
  paused, Dagobah rooms, album art) — the sim shares the Mac's LAN, so unicast
  control on :1400 works. **CAVEAT — untested on a real iPhone:** the iOS Simulator
  does NOT enforce the **Local Network** privacy prompt. On real hardware the first
  Bonjour browse prompts (NSLocalNetworkUsageDescription is set in `app.json`), and
  discovery returns 0 until the user taps Allow; a denied grant must surface as the
  "no speakers found" connect screen, never a silent empty. Validate the prompt +
  denied path on a physical iPhone before shipping iOS.
