# AGENTS.md — app

The Expo client UI. For what it is and how to run it, see [README.md](./README.md).
Workspace-wide rules are in the [root AGENTS.md](../AGENTS.md).

## Expo HAS CHANGED

Read the exact versioned docs at <https://docs.expo.dev/versions/v54.0.0/> before
writing any Expo/RN code. Don't rely on memory of older Expo APIs.

## Conventions

- **One entry, two UIs.** `App.tsx` switches on `Platform.OS`: web renders
  `src/desktop`, native renders the `src/screens` stack. Web can force the phone UI
  with `?m=1`. Keep both faces working when you touch shared components.
- **The `@app` alias is a contract.** The Electron renderer imports `app/src/desktop`
  via an `@app` alias and **never edits it**. Treat `src/desktop` (and anything it
  imports, like `src/components`) as shared with desktop — a change here ships to
  Electron too. Verify with `pnpm --filter desktop build`.
- **Platform splits via filename.** `*.native.ts(x)` / `*.web.ts(x)` let Metro pick
  per platform (e.g. `makeNativeApi.native.ts` vs the `.ts` web stub). Use this —
  plus a lazy `require` behind `Platform.OS !== 'web'` — to keep device-only native
  modules out of the web bundle.
- **Re-export facades.** `src/theme/tokens.ts` and `src/state/{store,types}.ts` are
  thin re-exports of `@orkester/core`; the source of truth is core. `src/state/
  selectors.ts` is the app-only exception (UI helpers with no core equivalent).
- **Native engine is spike-gated.** `NATIVE_ENGINE_PLATFORMS` gates the in-process
  engine per platform; flip a platform on only after its mDNS spike passes on real
  hardware. Surface a Local-Network-denied state — never silently show "no
  speakers". See `src/native/README.md`.
