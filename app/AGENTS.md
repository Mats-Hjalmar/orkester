# AGENTS.md — app

The Expo client UI. For what it is and how to run it, see [README.md](./README.md).
Workspace-wide rules are in the [root AGENTS.md](../AGENTS.md).

## Expo HAS CHANGED

Read the exact versioned docs at <https://docs.expo.dev/versions/v54.0.0/> before
writing any Expo/RN code. Don't rely on memory of older Expo APIs.

## Conventions

- **Native only; no web target.** `App.tsx` renders the `src/screens` phone stack
  and injects the in-process engine. A browser can't discover/control speakers, so
  there is no web build — `src/desktop` is the desktop UI but is rendered by the
  Electron app, not here.
- **The `@app` alias is a contract.** The Electron renderer imports `app/src/desktop`
  via an `@app` alias and **never edits it**. Treat `src/desktop` (and anything it
  imports, like `src/components`) as shared with desktop — a change here ships to
  Electron too. Verify with `bun run --cwd desktop build`.
- **Platform splits via filename.** `*.native.ts(x)` lets Metro pick the device impl
  (e.g. `makeNativeApi.native.ts` vs the `.ts` stub, which now just throws since
  there's no web build). Keep the lazy `require` behind `Platform.OS !== 'web'` so a
  stray web build never pulls in device-only native modules.
- **Phone-only deps stay out of shared components.** `expo-image`, `expo-haptics`,
  `react-native-gesture-handler`, `react-native-reanimated`,
  `react-native-safe-area-context` and `async-storage` are NOT in the Electron
  renderer bundle. Import them only from `src/screens/**`, `src/components/phone/**`,
  or a `*.native.tsx` split (`CoverArt.native.tsx` is the pattern — Metro takes it,
  Vite/RNW takes the base file). `bun run --cwd desktop build &&
  bun run --cwd desktop check:renderer-no-node` is the check.
- **Group by id, never by a global selection.** Every group-scoped screen takes a
  `groupId` route param and resolves it fresh via `groupById`, rendering a
  "this group is gone" state when it vanishes. The old store-level active-group
  fallback silently retargeted open screens at other rooms — see
  `findings/mobile-ui.md`.
- **Re-export facades.** `src/theme/tokens.ts` and `src/state/{store,types}.ts` are
  thin re-exports of `@orkester/core`; the source of truth is core. `src/state/
  selectors.ts` is the app-only exception (UI helpers with no core equivalent).
- **In-process engine, no mock.** The app runs the real engine via `src/native/`
  (both platforms enabled). There is no mock/demo Api — with no speakers the UI must
  show an empty/error state. Surface a Local-Network-denied state too; never silently
  show "no speakers". See `src/native/README.md`.
