# orkester — app

The orkester client UI, built with Expo (React Native + `react-native-web`) from a
single shared codebase. It ships **two faces of the same controller**, switched by
platform at the root (`App.tsx`):

- **Web → the desktop controller.** A full-window master–detail layout: a top bar,
  a Rooms rail (groups + idle rooms), and a focused Now-Playing / Search pane.
  Source under `src/desktop/`. This is the UI the Electron `desktop/` app renders.
- **Native (iOS / Android) → the phone app.** A rooms-first React Navigation stack
  (Rooms → Room → Search / Speakers) — full-frame screens, no tab bar or global
  mini-player (in a multi-room manager nothing is globally "now playing"). Source
  under `src/screens/` + `src/components/`.

State, the Sonos engine, and theme tokens all come from **`@orkester/core`**; this
package is just the views. The app is wired to a runtime `Api`:

- **Web** runs on `MockApi` (so `expo export --platform web` and demos work with no
  speakers).
- **Native** runs the engine **in-process** via `src/native/` — but it is
  **spike-gated** per platform (`NATIVE_ENGINE_PLATFORMS` in `App.tsx`); see
  [`src/native/README.md`](./src/native/README.md).
- The **Electron desktop** injects its own IPC-backed `Api` (it doesn't use this
  package's `makeApi`).

## Run

Run from the repo root (this is a pnpm workspace — not `npm`):

```sh
pnpm build       # build @orkester/core once first (the app imports its dist/)
pnpm web         # desktop controller in the browser  (http://localhost:8081)
pnpm ios         # phone app in the iOS simulator
pnpm android     # phone app on Android
# or, directly: pnpm --filter app exec expo start  (press w / i / a)
```

On web, append `?m=1` to the URL to preview the **phone** UI in a centred 390×844
frame (handy for developing the native layout without a simulator).

## Layout

```
App.tsx                 # font gate + platform switch (web→desktop, native→phone) + Api injection
src/
  theme/                # Noira palette + fonts; tokens.ts re-exports @orkester/core/theme
  state/                # re-export facades over @orkester/core/state + app-only selectors
  icons/                # inline react-native-svg icons
  components/           # shared + phone components (CoverArt, TrackBar, QueueRow, …)
  screens/              # phone screens (Rooms, NowPlaying, Search, Speakers)
  desktop/              # desktop web layout (TopBar, RoomList, NowPlaying, SpotifySearch)
  native/               # in-process engine transports for iOS/Android (spike-gated)
```

See [`AGENTS.md`](./AGENTS.md) for conventions (platform splits, the `@app` alias
contract, the re-export facades).
