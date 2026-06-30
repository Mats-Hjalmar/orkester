# AGENTS.md — desktop (Electron)

For the architecture and how to run it, see [README.md](./README.md). Workspace
rules: [root AGENTS.md](../AGENTS.md).

This package is the **Electron shell + IPC bridge only**. It owns no UI components —
the renderer reuses `app/src/desktop` via the `@app` alias.

## Conventions / invariants

- **Process boundary is load-bearing.** `contextIsolation: true`,
  `nodeIntegration: false`. The renderer never sees `require` / `node:*`; the only
  path to the engine is the typed `contextBridge` IPC. Don't relax these.
- **The engine runs in main.** `@orkester/core/node` transports → `SonosClient` →
  `SonosApi`, in the main process. The renderer drives it purely over IPC.
- **`src/ipc-contract.ts` is the single source.** One `ipcMain.handle` per `Api`
  method is derived from it; main / preload / renderer stay in lockstep through it.
  Add a method there, not ad-hoc in three places.
- **Never edit `app/src` from here.** The renderer imports the desktop UI via the
  `@app` alias (`electron.vite.config.ts`). UI changes belong in `app/src/desktop`
  (which exists in the `app` package but is rendered only by this Electron app).
- **Renderer must stay node-free.** `pnpm --filter desktop build && pnpm --filter
  desktop check:renderer-no-node` after any renderer change. Note the guard matches
  import/require **specifiers**, not the bare substring `node:` — minified object
  keys like `node: null` legitimately appear in the bundle and are not violations.
