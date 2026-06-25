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
