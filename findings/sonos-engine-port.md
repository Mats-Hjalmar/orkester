# Sonos engine port (Go -> TypeScript @orkester/core) findings

- 2026-06-25: fast-xml-parser MUST be configured with `parseTagValue: false`
  (plus `removeNSPrefix: true`, `ignoreAttributes: false`) for the Sonos engine.
  Rationale: Sonos SOAP/DIDL responses carry numeric-looking strings (volume
  "11", track numbers, RINCON ids, `1` booleans) that the Go reference treats as
  raw strings; with the parser's default `parseTagValue: true` fast-xml-parser
  coerces "11" -> number 11, "007" -> 7, "1" -> 1, silently changing types and
  dropping leading zeros. Keeping it `false` makes every parsed tag a string, so
  the TS engine reproduces the Go behaviour exactly and callers convert numbers
  EXPLICITLY where intended (e.g. `Number(extractResponseArg(...,'CurrentVolume'))`).
  Recorded as the canonical decision in `src/engine/soap.ts` `parserOptions`
  (frozen object) — do not flip it back to derive "convenience" numbers.

- 2026-06-25 (TIER-2 GUARD — load-bearing RN-safety): The RN-facing core surface
  (`src/index.ts`, `src/sonos/index.ts`, `src/engine/**`, `src/api/**`,
  `src/state/**`, `src/theme/**`) must import ZERO `node:*` builtins (prefixed
  `node:fs` OR bare `fs`/`dgram`/`crypto`/...); only `src/node/**` may. This is
  enforced by `src/__tests__/rn-no-node.test.ts`, which statically walks the TS
  import graph from those entries and asserts no reachable module imports a Node
  builtin. CRITICAL — this test is the ONLY automated check that catches such a
  leak: `npx expo export --platform web` does NOT transitively bundle the engine
  (the app imports `@orkester/core` by name and the web bundle does not pull the
  engine in the Feature-1 invariant run), so an expo-export green does NOT prove
  the engine is node-free. Verified empirically: injecting `import 'node:dgram'`
  into `src/engine/client.ts` flips the guard RED (`engine/client.ts imports
  "node:dgram"`), and removing it restores green. The guard also includes a
  reachability sanity assertion (engine barrel must resolve client/soap/ssdp) so
  a silent resolution failure can't false-green it. If the engine ever needs a
  Node-only capability, route it through an injected transport (HttpTransport /
  DiscoveryTransport) implemented under `src/node/**`, never an import.

- 2026-06-25: The `@orkester/core/engine` entry carries runtime VALUES
  (SonosClient, SOAPCall, ...) so it emits non-empty ESM/CJS, UNLIKE the
  types-only `./sonos` barrel which stays a 0-byte ESM. `src/sonos/index.ts`
  re-exports engine TYPES via `export type { ... } from '../engine'` — that keeps
  the sonos barrel's 0-byte-ESM invariant intact (tsup strips type-only
  re-exports at runtime) and introduces no runtime import cycle even though
  `engine/client.ts` imports types from `../sonos`. package.json `exports` and
  tsup entries point `./engine` at `dist/engine/index.{js,cjs,d.ts}`; the
  `exports-resolve.test.ts` guard derives every target from the map post-build
  and asserts the file exists, per the build-first/derive-paths rule from
  `findings/pnpm-workspace.md` (never hardcode `dist/...`).

- 2026-06-25 (whole-feature integration pass, chunks 0-9 all committed): full
  OFFLINE smoke is green end-to-end — `pnpm --filter @orkester/core test` = 93
  tests / 12 files (all ported Go XML fixtures + mock-transport + the RN-no-node
  guard + exports-resolve), `build` (tsup ESM/CJS/DTS) success, `pnpm typecheck`
  (core+app) clean, Feature-1 by-name `require('@orkester/core')` OK, and
  `npx expo export --platform web` still exports `dist` (1 web bundle). Zero
  `backend/` changes across the whole branch (Go reference untouched); the only
  touched paths are `packages/core/**` and `findings/**` — drift guard clean.

- 2026-06-25 (TIER-2 GUARD — parseTagValue regression is now PINNED, not prose):
  the `parseTagValue:false` decision is enforced deterministically by
  `src/engine/__tests__/soap.test.ts` ("uses parseTagValue:false (observable:
  numeric text stays a string)") which asserts BOTH `parserOptions.parseTagValue
  === false` AND the OBSERVABLE behavior — a `<X>0714</X>` text node parses to the
  STRING `'0714'` (not number `714`, no leading-zero loss). So flipping the frozen
  parserOptions back to coercion fails the suite, it can't silently regress. This
  is the recurring-risk twin of the RN-no-node static guard.

- 2026-06-25 (live-smoke isolation re-verified at integration): `src/node/
  live-smoke.ts` is delivered and runnable ONLY via the `smoke:live` package
  script (`node src/node/live-smoke.ts`); confirmed `vitest list` does NOT collect
  it (not a `*.test.ts`), no `*.test.ts` imports it, and it is not a tsup entry.
  It hits real hardware — USER-RUN ONLY; never executed by any automated step.

- 2026-06-25 (Feature 3 — wire clients to the real engine, Agent A): Engine
  extended with grouping (joinGroup/leaveGroup/setAVTransportURI — joinGroup
  sends `x-rincon:<coordUUID>` to the MEMBER base, leaveGroup sends
  BecomeCoordinatorOfStandaloneGroup to the member base), REL_TIME seek
  (authored, not in Go; formatRelTime/parseRelTime bridge 'H:MM:SS'<->seconds,
  returns 0 for ''/NOT_IMPLEMENTED), and shuffle/repeat via Get/SetPlayMode with
  a PlayMode<->{shuffle,repeat:none|all|one} map that THROWS on unknown values
  (no coerce-to-NORMAL). Base routing: AVTransport/playmode/seek -> coordinator;
  join/leave -> the member's own base.
- 2026-06-25: The store was LIFTED into @orkester/core/state with a STABLE
  useStore() surface (same actions + derived helpers) driven by an injected
  `Api`. `react` is a peerDependency + tsup `external` so the provider stays
  node-free and the RN-no-node guard stays green. Two Api impls: SonosApi (wraps
  SonosClient; room id = RoomRef.handle, group id = engine Group.id; position
  parse bridge) and MockApi (mock library/rooms, demo/web). Optimistic updates
  REVERT by re-polling now-playing on Api rejection (no silent swallow). Cover
  art is synthesized deterministically from hash(title|artist) over a pastel
  palette (synthesizeArt). Edge cases the UI must handle: placeholder track/group
  when nothing plays (never throws), dur===0 for live streams (no scrubber math),
  topology idle/loading/ready/error states.
- 2026-06-25: Electron desktop (desktop/) runs the engine in the MAIN process
  (@orkester/core/node transports) and exposes the Api over contextBridge/IPC
  (one ipcMain.handle per method from a shared ipc-contract; contextIsolation on,
  nodeIntegration off). Renderer = Vite + vite-plugin-react-native-web reusing
  app/src/desktop via an `@app` alias (never edited). Guard:
  `pnpm --filter desktop build` then check-renderer-no-node.mjs asserts ZERO
  node:* imports in the renderer chunk (the `node:` substrings that DO appear are
  minified object keys `node: null`, not module specifiers — match on
  require/from/import specifiers, not bare substrings).
- 2026-06-25 (SPIKE-GATED, unverified): Android in-process engine lives under
  app/src/native (RnFetchHttpTransport mirrors the non-2xx-returned contract;
  JsiUdpDiscoveryTransport over react-native-jsi-udp@1.3.0 + a MulticastLock).
  Metro platform-split (makeNativeApi.native.ts vs .ts stub) + a lazy require
  behind Platform.OS!=='web' && USE_NATIVE_ENGINE keep the WEB bundle at ZERO
  jsi-udp refs (verified). USE_NATIVE_ENGINE is FALSE — the app ships on MockApi
  until the on-device SSDP spike (SpikeScreen.native.tsx) passes on the Nothing
  Phone. NOT claimed working: no device in CI; jsi-udp unproven on RN 0.81/New Arch.
- 2026-06-30: MockApi REMOVED. The app no longer ships a mock/demo Api or a web
  target — both clients run a real engine (mobile in-process via app/src/native;
  Electron in its main process). Dropped `mockApi.ts`, `mockLibrary.ts`, the
  `MockApi`/`MOCK_LIBRARY`/`MOCK_ROOMS` exports, the `App.tsx` web/desktop-on-web
  branch + `?m=1`, the `NATIVE_ENGINE_PLATFORMS` gate (its only purpose was to fall
  back to MockApi — gone now, the native engine is unconditional), and the `pnpm web`
  / `app web` scripts. With no speakers the UI must show an empty/error state, never
  fake data (no silent fallback). The group-isolation test (groupControls.test.ts)
  keeps its coverage via a tiny in-file stateful fake Api cast to `Api` — test-only,
  not shipped. A browser can't discover/control speakers, so there is intentionally
  no web build; the desktop is the Electron app.
