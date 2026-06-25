# @orkester/core Node platform adapters (src/node/**)

Durable notes on the Node-only adapter layer (the only part of `@orkester/core`
allowed to import `node:*`).

- 2026-06-25: tsup/esbuild with `platform: node` (tsup's default `target:
  node18`) STRIPS the `node:` prefix from externalized builtins in the emitted
  bundle — source `import { request } from 'node:http'` becomes
  `from "http"` in `dist/node/index.js`. This is harmless at runtime (Node
  resolves bare `http`/`https`/`dgram`/`os` to builtins, which take precedence
  over userland), and `@orkester/core/node` resolves + imports cleanly. The
  load-bearing RN-no-node check is the static import-graph guard over the
  SOURCE tree (chunk-9), NOT a scan of dist — so the prefix-stripping in dist
  does not weaken the boundary. Do not "fix" the dist prefix.

- 2026-06-25: The RN-no-node boundary cannot be enforced by `grep "node:"` over
  src naively — engine source files mention `node:*` in PROSE comments and use
  `node` as an ordinary identifier (e.g. `function findKey(node: unknown)`).
  The guard must match actual import statements (`from 'node:...'` /
  `require('node:...')`), not the substring `node:`.

- 2026-06-25: Loopback UDP discovery test strategy. `NodeDiscoveryTransport.
  discover()` binds to non-loopback multicast interfaces and sends to
  239.255.255.250 — neither deterministic in CI nor loopable back to a
  127.0.0.1 listener, so it is NOT driven end-to-end offline. Instead the
  datagram->parse->dedupe->onResult wiring is factored into the exported
  `makeDatagramHandler`, unit-tested directly AND over a real loopback dgram
  round-trip (send synthetic ZonePlayer datagram to a 127.0.0.1 socket). Only
  the multicast send / interface-bind glue is deferred to live verification.

- 2026-06-25: NodeHttpTransport does NOT throw on non-2xx — it returns the
  status/body verbatim so the SOAP layer can decode UPnP faults. Only
  transport-level failures (refused, timeout via `setTimeout`+`destroy`, abort)
  reject. `setTimeout` alone does not abort a Node client request; you must
  `clientReq.destroy(err)` in the timeout callback or the promise hangs.

- 2026-06-25: `@types/node` added as an explicit devDependency of
  `packages/core` (was only transitively present). core's tsconfig has no
  `types` allowlist, so node globals are visible during typecheck across the
  whole package — acceptable because the import-graph guard, not tsc, enforces
  the RN boundary.
