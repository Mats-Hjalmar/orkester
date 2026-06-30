# Orkester

A from-scratch controller for Sonos speakers — a self-hosted replacement for the
official Sonos app. It speaks the Sonos **local network protocol** (SSDP / UPnP
SOAP / GENA events) directly, with **no cloud dependency**: discovery, topology,
transport, volume, grouping and queueing all happen over your LAN.

It ships as **two apps over one shared engine**:

| Surface | What it is | Run it |
| --- | --- | --- |
| **Desktop** | Electron app. The Sonos engine runs in the main process; the UI is `react-native-web`. | `pnpm desktop` |
| **Mobile** | Expo app (iOS / Android). Phone-shaped, rooms-first UI. | `pnpm ios` · `pnpm android` |
| **Web preview** | The desktop UI in a browser (handy for UI work without speakers). | `pnpm web` |
| **`@orkester/core`** | The shared, React-Native-safe TypeScript Sonos engine + app state. Not run directly. | — |

Both apps share `@orkester/core`, so the protocol logic, the app store, and the
design tokens live in exactly one place.

## Repo layout

```
packages/core/   @orkester/core — Sonos engine (SSDP/SOAP/topology/control/SMAPI),
                 the app store, theme tokens. RN-safe; node:* only under src/node.
app/             Expo app. Web → desktop UI (src/desktop); native → phone UI
                 (src/screens + src/components). Single entry: App.tsx.
desktop/         Electron shell + IPC bridge. Reuses app/src/desktop via an @app
                 alias; runs the engine in the main process.
findings/        Per-subject investigation notes (durable conclusions, dated).
```

## Quick start

**Prerequisites**

- Node 18+ and **pnpm 9.15** (`corepack enable` picks up the pinned version).
- This is a pnpm workspace using the **hoisted** node-linker (required by Expo's
  Metro) — configured in the root `.npmrc` (`node-linker=hoisted`). Nothing to do;
  just don't switch package managers.

**Install & run**

```sh
pnpm install
pnpm build        # build @orkester/core once (the apps import its dist/)
pnpm desktop      # Electron desktop app  (builds core first, then launches)
pnpm web          # desktop UI in a browser at http://localhost:8081
pnpm ios          # phone app in the iOS simulator
pnpm android      # phone app on Android
```

> `pnpm web`, `pnpm ios` and `pnpm android` do **not** rebuild `@orkester/core`
> first (only `pnpm desktop` does). After a fresh clone or a change to
> `packages/core`, run `pnpm build` once before them.

On `pnpm web` you can append `?m=1` to the URL to preview the **phone** UI in a
centred 390×844 frame without a simulator.

Both apps default to **mock data**, so they run with no speakers on the LAN. The
desktop app and (spike-gated) native app connect to real hardware once they're on
the same network as your Sonos.

### macOS: Local Network permission

macOS 15+ blocks multicast / local-network access until you grant it. Until then
discovery finds **0 speakers** even when they're online.

- System Settings → Privacy & Security → **Local Network** → enable the app
  launching the process (Terminal / iTerm for `pnpm web`, the Electron app for
  `pnpm desktop`), then re-run.
- Ensure the machine is on the **same LAN/subnet** as the speakers (a separate
  VLAN breaks discovery).

## Test

```sh
pnpm typecheck                          # tsc --noEmit across core + app
pnpm --filter @orkester/core test       # the engine + store suite (offline, mocked)
```

All automated tests are **offline** — the engine is driven against recorded Sonos
payloads and mock transports, so the logic is verified without live speakers. The
one script that touches real hardware (`smoke:live`) is user-run only.

## Contributing

Each package has an `AGENTS.md` with its conventions and load-bearing invariants
(the RN/Node boundary, the XML-parsing rules, the IPC contract, etc.). Durable
investigation notes live in `findings/`. Read those before changing protocol or
build-boundary code.
