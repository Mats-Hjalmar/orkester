# AGENTS.md — @orkester/core

The shared, React-Native-safe Sonos engine + app state + theme tokens. For the
public API and how to test it, see [README.md](./README.md). Workspace rules:
[root AGENTS.md](../../AGENTS.md).

## Invariants — these are enforced by tests; don't regress them

- **RN/Node boundary.** The RN-facing surface (`src/index.ts`, `src/engine`,
  `src/state`, `src/theme`, `src/api`, `src/sonos`) imports **no** `node:*` builtins.
  Only `src/node/**` may. Enforced by `src/__tests__/rn-no-node.test.ts` (a static
  import-graph walk — the ONLY check that catches a leak; an `expo export` green does
  not). Need a Node capability in the engine? Inject it through an
  `HttpTransport`/`DiscoveryTransport` implemented under `src/node/**`.
- **`parseTagValue: false`** is frozen in `@orkester/sonos-api`'s `src/soap.ts`
  `parserOptions` (re-exported by `src/engine/soap.ts`) and pinned by
  `packages/sonos-api/src/__tests__/soap.test.ts` (asserts the option *and* that
  `<X>0714</X>` parses to the string `'0714'`). Numeric coercion would silently
  change types / drop leading zeros. Callers convert numbers explicitly.
- **No silent fallbacks.** `discoverOne` throws on zero responders; `resolveRoom`
  throws on unknown/ambiguous; an unresolvable coordinator/player IP throws rather
  than building a malformed URL. Keep failures loud.
- **Build-first / derive-paths.** Consumers import the built `dist/` via the
  `package.json` `exports` map (tsup, bundle mode — relative imports get inlined into
  hashed chunks, so a new internal file like `engine/xml.ts` needs **no** new entry
  or export). `exports-resolve.test.ts` derives every target from the map after the
  build; never hardcode `dist/...`.

## Routing rule (SonosClient facade)

AVTransport and GroupRenderingControl actions (transport, queue, play mode,
crossfade, sleep timer, line-in/TV source, group volume/mute) → group
**coordinator** base URL. RenderingControl (volume, mute, bass, treble, loudness,
EQ) and DeviceProperties → **named player** base URL. Grouping join/leave → the
**member's own** base URL. ContentDirectory and AlarmClock are household-wide, so
any player answers. `coordinatorDevice` / `playerDevice` hand out the full
`SonosDevice` for anything the facade does not wrap.

## Layout & tests

`src/engine` = protocol modules (ssdp, device, topology, control, library, smapi,
musicservices, client); `soap.ts` and `xml.ts` re-export `@orkester/sonos-api`.
The `build` script builds sonos-api first, and tsup inlines it (`noExternal`). `src/state` = the
store, reducer, and the engine-backed `Api` impl (`SonosApi`). `src/node` = the
only Node adapters. Tests are co-located in `__tests__/` beside the code they cover
(`bun run --cwd packages/core test`).

## live-smoke — USER-RUN ONLY

`src/node/live-smoke.ts` hits **real** hardware. It is reachable only via the
`smoke:live` package script — not a `*.test.ts`, not a tsup entry, imported by
nothing. Never run it from tests / coder / CI.
