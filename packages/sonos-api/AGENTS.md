# AGENTS.md — @orkester/sonos-api

A typed client for every UPnP service a Sonos device exposes, so callers use the
device's own action and argument names instead of hand-built SOAP. It also owns
the SOAP envelope/fault layer and GENA event subscriptions. Workspace rules:
[root AGENTS.md](../../AGENTS.md).

## The service clients are generated

`spec/services.json` is the source of truth: the union of the SCPDs of 18 device
models, where the newest firmware wins when an action's signature differs.
`bun run generate` turns it into `src/services/*.ts` (one `<Name>Service` class
per service, one method per action) and `src/device.ts` (`SonosDevice`, every
service on one base URL). Never edit those files by hand; change the spec or
`scripts/generate.ts` and regenerate. The spec data is MIT-licensed, see
`spec/LICENSE`.

Argument types follow each argument's state variable: integers are `number`
(range-checked before sending), `boolean` crosses the wire as `1`/`0`, and a
string with allowed values is a literal union. A missing or malformed output
argument throws.

## Invariants

- **RN-safe.** No `node:*` import anywhere under `src/`; the network is reached
  only through the injected `HttpTransport`. Core's `rn-no-node.test.ts` walks this
  package's source.
- **`parseTagValue: false`** is frozen in `src/soap.ts` and pinned by
  `src/__tests__/soap.test.ts`. Decoding to numbers happens in `src/codec.ts`.
- **Events need a host listener.** `subscribe` / `renewSubscription` /
  `unsubscribe` go through the transport; the NOTIFY callback server is a host
  capability (`NodeEventListener` in `@orkester/core/node`), and its bodies are
  parsed with `parsePropertySet` / `parseLastChange`.
