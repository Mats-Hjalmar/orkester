# @orkester/core

Shared, React-Native-free building blocks for orkester: theme tokens, transport
contracts, and the ported Sonos protocol engine (SSDP discovery parsing, SOAP,
device description, ZoneGroup topology, transport/volume/now-playing control)
plus the rich `SonosClient` facade.

## Layout & the RN boundary

The RN-facing surface — `src/index.ts`, `src/sonos`, `src/engine`, `src/api`,
`src/state`, `src/theme` — imports **no** `node:*` builtins, so it bundles for
React Native. Only `src/node/**` may import `node:*`; it holds the Node platform
adapters (`NodeHttpTransport`, `NodeDiscoveryTransport`) and the live-smoke
script. A static import-graph guard enforces that boundary.

The engine is transport-agnostic: it talks to speakers only through an injected
`HttpTransport` / `DiscoveryTransport`. Node hosts inject the `./node` adapters;
React Native injects its own; tests inject mocks.

## SonosClient

`SonosClient` (`src/engine/client.ts`) ties discovery, topology and control
together. Construct it with the two injected transports:

```ts
// SonosClient lives in the engine (src/engine/client.ts); the Node platform
// adapters are exported from the ./node subpath. (A public barrel re-export of
// SonosClient is wired in a later chunk.)
import { SonosClient } from './engine/client';
import { NodeHttpTransport, NodeDiscoveryTransport } from '@orkester/core/node';

const client = new SonosClient({
  http: new NodeHttpTransport(),
  discovery: new NodeDiscoveryTransport(),
});

const household = await client.loadHousehold(3000); // discover + fetch topology
const room = client.resolveRoom(household, 'living'); // fuzzy room match
const np = await client.getNowPlaying(room);
const vol = await client.getVolume(room);
```

Routing rule: AVTransport actions (`play`/`pause`/`next`/`previous`/
`getNowPlaying`) target the group **coordinator's** base URL; RenderingControl
actions (`getVolume`/`setVolume`/`getMute`/`setMute`) target the **named
player's** base URL. The facade resolves both from a resolved room. Grouping
(join/leave) is deferred to a later feature.

No silent fallbacks: `discoverOne` throws when no speaker answers; `resolveRoom`
throws on an unknown or ambiguous query; an unresolvable coordinator/player IP
throws rather than producing a malformed URL.

## Testing

All automated verification is **offline**: vitest drives the engine and the
whole `SonosClient` facade against mock `HttpTransport`/`DiscoveryTransport`
plus loopback only.

```sh
pnpm --filter @orkester/core test       # vitest (fixtures + mock transports)
pnpm --filter @orkester/core build      # tsup
pnpm --filter @orkester/core typecheck  # tsc --noEmit
```

## Live smoke — you run it, nothing automated does

`src/node/live-smoke.ts` connects to **real** Sonos hardware on your LAN. It is
delivered for **manual** use and is intentionally excluded from tests, build,
typecheck and CI — the `smoke:live` package script is its only entry point and
that script is wired into no automated step.

```sh
pnpm --filter @orkester/core smoke:live
# optionally name a room and/or a discovery wait (ms):
pnpm --filter @orkester/core smoke:live -- living 4000
```

It discovers one speaker, loads the household topology, resolves a room (the one
you name, else the first), then prints now-playing and volume. It is read-only —
it never changes playback or volume.
