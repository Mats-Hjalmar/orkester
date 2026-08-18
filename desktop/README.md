# Orkester desktop (Electron)

The desktop controller. The **Sonos engine runs in the Electron main process**
(`@orkester/core/node` transports → `SonosClient` → `SonosApi`); the **renderer**
is a Vite + `react-native-web` bundle that reuses the app's desktop UI verbatim
(`app/src/desktop`, imported via the `@app` alias — never edited here) and drives
the engine through an **IPC-backed `Api`**.

## Architecture

```
main (Node)                          preload (bridge)            renderer (browser)
─────────────────────────────────    ──────────────────────      ─────────────────────────
NodeHttpTransport + NodeDiscovery     contextBridge.expose         window.orkester (Api)
  → SonosClient → SonosApi            'orkester' = { …Api }          → getIpcApi()
ipcMain.handle('orkester:<m>')   ◀──  ipcRenderer.invoke      ◀──   StoreProvider api={ipc}
                                                                      → <DesktopApp/> (react-native-web)
```

- `contextIsolation: true`, `nodeIntegration: false` — the renderer never sees
  `require`/node:*. The only path to the engine is the typed IPC bridge.
- One `ipcMain.handle` per `Api` method, derived from the shared
  `src/ipc-contract.ts` so main / preload / renderer stay in lockstep.
- Now-playing is **sampled**: the store's poll loop in the renderer calls
  `getNowPlaying` (~1s) / volumes (~2.5s) / topology (~10s) over IPC; main answers
  from the live engine. No push channel needed.

## Offline checks (no speakers)

```bash
pnpm --filter @orkester/core build        # the desktop consumes core's dist
pnpm --filter desktop build               # builds main + preload + renderer
pnpm --filter desktop check:renderer-no-node   # asserts the renderer bundle has no node:* imports
```

## Packaging a signed macOS build

```bash
pnpm desktop:dist   # from the repo root: builds core, builds the app, then electron-builder
```

Output: `desktop/release/Orkester-<version>-universal.dmg` — a universal (x86_64 +
arm64) bundle, Developer ID signed with hardened runtime, **not notarized**.
Config lives in `desktop/electron-builder.yml`; entitlements and the icon in
`desktop/build/`.

Two things this build depends on:

- `electron.vite.config.ts` sets `main.build.externalizeDeps.exclude:
  ['@orkester/core']`, so core is inlined into `out/main/index.js` and the shipped
  app carries **no `node_modules`** — a workspace `file:`/`workspace:` dep cannot be
  resolved next to a packaged app.
- `electron` must be pinned to an exact version in `package.json`;
  electron-builder refuses a semver range because it downloads per-arch binaries.

Because it is unnotarized, Gatekeeper blocks first launch on another Mac
(`spctl --assess` reports `rejected  source=Unnotarized Developer ID`). On macOS 15+
the recipient's **only** route is System Settings → Privacy & Security →
**Open Anyway** + login password — Apple removed the Control-click → Open override
in Sequoia. Recipient instructions live in `release/FIRST-RUN.txt`; notarizing
(`mac.notarize` + notarytool credentials) removes the prompt entirely.

`build/entitlements.mac.plist` grants **only** `com.apple.security.cs.allow-jit`.
That is deliberately narrower than electron-builder's default template — see
[findings/desktop-packaging-macos.md](../findings/desktop-packaging-macos.md)
before adding anything to it.

## Live check (USER runs this — needs a Sonos speaker on the LAN)

> The engine talks to real speakers. Run this only on a network with Sonos.

```bash
pnpm desktop   # from the repo root: builds @orkester/core, then launches Electron
# equivalently:
pnpm --filter @orkester/core build && pnpm --filter desktop dev
```

Then in the window that opens:

1. **Rooms populate** in the sidebar from the real household topology.
2. **Play** on a group starts a real speaker (confirm audio).
3. **Drag a room/group volume** — the speaker volume changes.
4. **Group a room** into another group — the Sonos app reflects the new grouping.
5. **Toggle shuffle / repeat** — confirm the change in the official Sonos app.
6. **Seek** the scrubber on a finite track — playback jumps (live streams show no
   scrubber math: `dur === 0`).

If discovery finds nothing, the UI surfaces a topology **error** state (no silent
fallback); check the speaker is on the same subnet as the machine.
