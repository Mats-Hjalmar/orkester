# orkester — app

The orkester client UI, built with Expo (React Native + react-native-web) from a
single shared codebase. It ships **two faces of the same controller**, switched by
platform at the root (`App.tsx`):

- **Web → the desktop controller.** A full-bleed, full-window layout: top bar,
  a Rooms sidebar (groups + idle rooms), a Home / Now-Playing main panel, and a
  persistent transport bar. Source under `src/desktop/`.
- **Native (iOS / Android) → the phone app.** Now Playing, Listen (Home), Rooms,
  with a mini-player + tab bar. Source under `src/screens/` + `src/components/`.

Both share one store (`src/state/store.tsx`) — the same rooms, groups, queue,
volume and simulated playback. **Everything is currently mock data**: an 8-track
library and a 1-second clock that advances progress and walks the queue. No audio,
no network yet — the next step is wiring these actions to the orkester backend.

## Run

```sh
cd app
npm run web      # desktop controller in the browser  (http://localhost:8081)
npm run ios      # phone app in the iOS simulator
npm run android  # phone app on Android
npx expo start   # dev server; press w / i / a, or scan the QR with Expo Go (SDK 54)
```

On web you can append `?m=1` to the URL to preview the **phone** UI in a centred
390×844 frame (handy for developing the native layout without a simulator).

## Layout

```
App.tsx                 # font gate + platform switch (web→desktop, native→phone)
src/
  theme/                # Noira palette, fonts (Instrument Serif / Manrope / Fragment Mono), type presets
  state/                # types, mock library, store (reducer + 1s clock), selectors
  icons/                # inline react-native-svg icons
  components/           # shared + phone components (CoverArt, TrackBar, MiniPlayer, …)
  screens/              # phone screens (NowPlaying, Home, Rooms, Search)
  desktop/              # desktop web layout (TopBar, Sidebar, Home, NowPlaying, TransportBar)
```
