# AGENTS.md — orkester workspace

Conventions and load-bearing invariants for working in this repo. For what the
project is and how to run it, see [README.md](./README.md) (the run-table there is
the source of truth for commands — don't restate it). Per-package `AGENTS.md`
files cover package-specific rules; this file covers the whole workspace.

## Shape

pnpm workspace (`app`, `desktop`, `packages/*`). One shared package,
`@orkester/core`, holds the Sonos engine, the app store, and theme tokens; `app`
and `desktop` are clients. Put shared logic in core, not in a client.

## Invariants — do not break these

- **RN/Node boundary.** The RN-facing surface of `@orkester/core` (`src/index.ts`,
  `src/engine`, `src/state`, `src/theme`, `src/api`, `src/sonos`) must import **no**
  `node:*` builtins — only `src/node/**` may. Enforced by a static import-graph
  test (`packages/core/src/__tests__/rn-no-node.test.ts`). If the engine needs a
  Node capability, inject it through a transport under `src/node/**`.
- **`parseTagValue: false`.** fast-xml-parser is frozen with this option so numeric
  strings ("11", "007", RINCON ids) stay strings and callers convert explicitly.
  Pinned by a test; don't flip it for "convenience" numbers.
- **No silent fallbacks.** The engine throws on no-speaker / unresolvable / ambiguous
  rather than returning empty or a default. Keep it that way; surface errors in the
  UI (e.g. the topology error state), never swallow them.
- **Hoisted node-linker.** `node-linker=hoisted` lives in the root `.npmrc` (pnpm 9
  ignores it in `pnpm-workspace.yaml`). Metro needs the flat layout. Don't move it.
- **Build first, derive paths.** `@orkester/core` is consumed via its built `dist/`
  and `package.json` `exports` map. Build before consuming; tests/configs derive
  dist paths from the exports map — never hardcode `dist/...`.

## Single sources of truth

- Design tokens: `packages/core/src/theme/tokens.ts` (the app re-exports it).
- App store / types: `@orkester/core/state` (the app's `src/state/*` are re-export
  facades + a few app-only selectors).
- Desktop IPC method list: `desktop/src/ipc-contract.ts`.
- Desktop UI: `app/src/desktop` (the Electron renderer reuses it via `@app`).

## findings/

`findings/*.md` are durable, dated investigation notes (mDNS discovery, the engine
port, the pnpm/Expo monorepo gotchas, SMAPI, topology). They explain *why* the
non-obvious decisions are the way they are. Read the relevant one before changing
protocol, discovery, or build-boundary code; append a dated entry when an
investigation yields a durable conclusion.

## Verifying a change

`pnpm typecheck`, `pnpm --filter @orkester/core test`, and for the desktop
`pnpm --filter desktop build && pnpm --filter desktop check:renderer-no-node`.
Real-hardware checks are user-run only.
