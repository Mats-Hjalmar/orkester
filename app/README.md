# orkester — app

The orkester **mobile** client (Expo / React Native, iOS + Android) — plus the
shared desktop UI that the Electron app renders. There is **no web target**: a
browser can't discover or control speakers.

- **The phone app (`App.tsx`).** A rooms-first React Navigation stack (Rooms →
  Room → Search / Speakers) — full-frame screens, no tab bar or global mini-player
  (in a multi-room manager nothing is globally "now playing"). Source under
  `src/screens/` + `src/components/`.
- **The desktop UI (`src/desktop/`).** A full-window master–detail layout (top bar,
  a Rooms rail, a focused Now-Playing / Search pane). It is **not** rendered here —
  the Electron `desktop/` app imports it via an `@app` alias and renders it with
  `react-native-web`.

State, the Sonos engine, and theme tokens all come from **`@orkester/core`**; this
package is just the views. The app is wired to a real, engine-backed `Api` — there
is **no mock/demo Api**:

- **Mobile** runs the engine **in-process** via `src/native/` (enabled on both
  platforms; see [`src/native/README.md`](./src/native/README.md)). With no speakers
  on the LAN the UI shows an empty/error state, never fake data.
- The **Electron desktop** injects its own IPC-backed `Api` (it doesn't use this
  package's `makeApi`).

## Run

Run from the repo root (this is a pnpm workspace — not `npm`):

```sh
pnpm build       # build @orkester/core once first (the app imports its dist/)
pnpm ios         # phone app in the iOS simulator
pnpm android     # phone app on Android
# or, directly: pnpm --filter app exec expo start  (press i / a)
```

## Layout

```
App.tsx                 # font gate + Api injection; renders the phone nav stack
src/
  theme/                # Noira palette + fonts; tokens.ts re-exports @orkester/core/theme
  state/                # re-export facades over @orkester/core/state + app-only selectors
  icons/                # inline react-native-svg icons
  components/           # shared + phone components (CoverArt, TrackBar, QueueRow, …)
  screens/              # phone screens (Rooms, NowPlaying, Search, Speakers)
  desktop/              # desktop UI, rendered by the Electron app (TopBar, RoomList, NowPlaying, SpotifySearch)
  native/               # in-process engine transports for iOS/Android
```

See [`AGENTS.md`](./AGENTS.md) for conventions (platform splits, the `@app` alias
contract, the re-export facades).
