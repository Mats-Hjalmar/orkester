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
- 2026-06-25: A workspace package that NO member depends on is NOT importable by
  package name. pnpm (hoisted linker, 9.15.0) only creates the
  `node_modules/<name>` symlink inside the node_modules of an importer. With
  nothing depending on `@orkester/core`, there is no `node_modules/@orkester/core`
  anywhere (root, app, or `.pnpm`) and `require.resolve('@orkester/core')` /
  `import('@orkester/core')` fail with MODULE_NOT_FOUND from ANY cwd — even though
  the built `packages/core/dist/index.cjs` is valid and importable by relative
  path. To make a scaffold package resolvable by name at the repo root with no
  consumer yet, the ROOT `package.json` must list it as a `workspace:*`
  (dev)dependency so pnpm links it into the root `node_modules`. Implication for
  Feature 1: chunk-4's "import by package name" criterion cannot pass while only
  pnpm-lock.yaml is in scope; it needs a root-package.json amendment (add
  `"@orkester/core": "workspace:*"` to root devDependencies) before the import
  smoke can be green.
- 2026-06-25: An "import by package name" smoke script must EXECUTE from a cwd
  inside the workspace, not from the scratchpad. Node's CJS and ESM resolvers walk
  up the importing file's directory ancestry to find `node_modules/<name>`; a
  script physically living in `/private/tmp/.../scratchpad` never reaches the
  repo's root `node_modules`, so it fails MODULE_NOT_FOUND / ERR_MODULE_NOT_FOUND
  even when the link is correct. `NODE_PATH` does NOT fix this (ESM ignores it).
  Fix: copy the scratchpad script into the repo root (or any dir under it), run,
  then delete it. With the root `workspace:*` devDep in place, both `require()`
  and `import()` of `@orkester/core` resolve and yield colors.bg=#F2EFE8 /
  FRAME.width=390 / typeof ink=function.
- 2026-06-25: FALSE-NEGATIVE in the by-name import smoke: do NOT assert that
  `require.resolve('@orkester/core')` returns a path containing
  `/node_modules/@orkester/core/`. pnpm's hoisted linker makes
  `node_modules/@orkester/core` a SYMLINK to `packages/core`, and Node's
  `require.resolve` returns the symlink's REALPATH — i.e.
  `<repo>/packages/core/dist/index.cjs`, NOT the `node_modules/...` link path.
  A strict "must be under node_modules" check fails even though by-name
  resolution is working perfectly. Correct invariant: resolution SUCCEEDS by name
  (require/import don't throw) AND the resolved path ends under either
  `/node_modules/@orkester/core/` OR `/packages/core/` — then assert the runtime
  VALUES (colors.bg=#F2EFE8, FRAME.width=390, typeof ink==='function') from BOTH
  the `require()` object and the `await import()` namespace. The value+no-throw
  check is the load-bearing one; the path string is incidental.
- 2026-06-25 (TIER-2 GUARD): The recurring failure class is "import-by-name smoke
  asserts the wrong thing" (cwd-from-scratchpad; node_modules path string). Until
  a tracked smoke script is in scope to add, the enforced guard is the canonical
  snippet below — copy verbatim into the REPO ROOT as `.smoke-import.mjs`, run
  `node .smoke-import.mjs`, then delete. It encodes all three lessons (run from
  inside repo / accept symlink realpath / assert values from require()+import()):

  ```js
  import { createRequire } from 'node:module';
  const require = createRequire(import.meta.url);
  const cjs = require('@orkester/core');
  const r = require.resolve('@orkester/core');
  if (!(r.includes('/node_modules/@orkester/core/') || r.includes('/packages/core/')))
    throw new Error('unexpected resolve path: ' + r);
  const esm = await import('@orkester/core');
  for (const m of [cjs, esm]) {
    if (m.colors?.bg !== '#F2EFE8') throw new Error('colors.bg=' + m.colors?.bg);
    if (m.FRAME?.width !== 390) throw new Error('FRAME.width=' + m.FRAME?.width);
    if (typeof m.ink !== 'function') throw new Error('ink=' + typeof m.ink);
  }
  console.log('SMOKE OK: ' + r);
  ```
