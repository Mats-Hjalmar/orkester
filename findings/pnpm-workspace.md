# pnpm workspace / Expo monorepo findings

- 2026-06-24: pnpm 9.15.0 does NOT read `nodeLinker` from `pnpm-workspace.yaml`
  (that is a pnpm 10+ feature). Verified empirically: `nodeLinker: hoisted` in
  pnpm-workspace.yaml is silently ignored — `pnpm config get node-linker` returns
  `undefined` and the install is isolated/symlinked (per-package node_modules are
  symlinks into `.pnpm`). The hoisted layout (which Expo's Metro needs) requires
  `node-linker=hoisted` in a root `.npmrc` instead — that form works (flat root
  node_modules, `pnpm config get node-linker` -> `hoisted`). On pnpm 9, hoisted
  config MUST live in `.npmrc`, not pnpm-workspace.yaml. Guard: a smoke check that
  asserts `pnpm config get node-linker` == `hoisted` after install (text-matching
  the YAML is a false-green).
- 2026-06-24: tsup `format:['esm','cjs']` in a package with `"type":"module"`
  emits ESM as `<name>.js` (+ `<name>.d.ts`) and CJS as `<name>.cjs` (+
  `<name>.d.cts`) — NOT the other way around. So a package.json exports map must
  point `import`→`.js`, `require`→`.cjs`. Build FIRST, then write the map to the
  real filenames; tests should derive the path from the exports map, never
  hardcode it.
- 2026-06-24: Guarding a "types-only" TS module with a grep for `=>` is a
  FALSE POSITIVE — interface arrow-type members (`discover: (o) => Promise<...>`)
  are pure types and legitimately contain `=>`. The reliable invariant is
  COMPILE-LEVEL: a types-only module emits an empty runtime module
  (`Object.keys(require('./dist/x.cjs')).length === 0`, and the ESM `.js` is 0 B).
  Use the emptiness check; it is robust to arrow- vs method-style members.
- 2026-06-24: tsup preserves the SOURCE SUBDIRECTORY structure in dist when
  entries live in subfolders: entries `src/theme/tokens.ts` and
  `src/sonos/index.ts` emit `dist/theme/tokens.{js,cjs,d.ts,d.cts}` and
  `dist/sonos/index.{js,cjs,...}` — NOT a flattened `dist/theme.cjs` /
  `dist/sonos.cjs`. So the package.json `exports` map must point at the nested
  real paths (e.g. `./theme` -> `./dist/theme/tokens.js` / `.cjs`), and tests
  must DERIVE the dist path from the exports map after the build, never hardcode
  `dist/index.cjs`. Verified empirically with tsup 8.5.1 / type:module.
- 2026-06-25: When migrating an existing `app/` from npm to a pnpm workspace,
  deleting `app/package-lock.json` and running `pnpm install` is NOT enough: the
  OLD `app/node_modules` (real, flat, npm-installed dep dirs + a stale
  `.package-lock.json`) survives and SHADOWS pnpm's hoisted root layout —
  `require.resolve('expo',{paths:['app']})` then resolves to
  `app/node_modules/expo` instead of the root. Fix: `rm -rf app/node_modules`
  (and root `node_modules`) BEFORE `pnpm install` so the hoisted linker owns
  resolution. Guard: assert the resolved path is under the ROOT `node_modules`,
  not just that the file exists.
- 2026-06-25: tsup with `bundle:false` leaves relative barrel re-exports
  EXTENSIONLESS in emitted ESM (`from "./theme/tokens"`), which native Node
  ESM resolution (`import('./dist/index.js')`) REJECTS with ERR_MODULE_NOT_FOUND.
  For a multi-entry package whose `src/index.ts` re-exports sibling modules, keep
  tsup's DEFAULT bundling (do NOT set `bundle:false`): it inlines shared code into
  a hashed `dist/chunk-*.js` referenced WITH an extension, so ESM resolves. The
  per-entry types-only files still emit 0-byte ESM / empty-CJS. Guard: the chunk's
  "ESM barrel value re-export resolves" node test catches this regression.
