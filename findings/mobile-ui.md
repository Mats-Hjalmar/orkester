# Mobile UI (Expo / React Native)

Durable conclusions about the phone client's UI layer. Protocol/discovery notes live
in [mobile-discovery-mdns.md](./mobile-discovery-mdns.md); slider behaviour in
[volume-control.md](./volume-control.md).

- 2026-08-19: The phone screens must address a group by **route param**, never by a
  store-level "active group". `activeGroup()` fell back to `groups[0]` when its group
  vanished, so a regroup — ours in the Speakers sheet, or anyone's in the official
  Sonos app — silently retargeted an open screen at a different room while the user
  kept pressing its controls. The desktop had already solved this by passing the
  group as a prop; the whole legacy `activeGroupId` / active-group action block is
  now deleted from core and both clients resolve groups by id.
- 2026-08-19: `app/src/components/*` is shared with the Electron renderer via the
  `@app` alias, so a phone-only dependency in a shared base file breaks
  `pnpm --filter desktop build`. The **`*.native.tsx` split** is the fix and it
  works in both directions: Metro prefers `CoverArt.native.tsx` (expo-image), while
  Vite/react-native-web takes `CoverArt.tsx` (plain RN Image). Verified by grepping
  the built renderer bundle for `expo-image` / `gesture-handler` / `reanimated` /
  `expo-haptics` / `async-storage` — all zero hits, and the bundle got *smaller*.
  Anything phone-only that isn't a `.native` split belongs under
  `app/src/components/phone/`.
- 2026-08-19: A green `expo export --platform ios` is the strongest device-free check
  on the phone bundle: it catches `.native` resolution, missing native modules, and
  whether the Reanimated babel plugin ran. Confirm worklets actually compiled with
  `strings <bundle>.hbc | grep -c __workletHash` — the count should equal the number
  of worklet functions written (5, at the time of writing). A missing plugin is
  build-silent and runtime-fatal. It still does **not** catch a `node:*` leak — only
  `rn-no-node.test.ts` does.
- 2026-08-19: Expo SDK 54 needs **no `babel.config.js`** for Reanimated 4;
  `babel-preset-expo` wires the plugin when the library is installed, and
  `@expo/metro-config`'s default transformer applies that preset when the project has
  no babel config. Don't add one. Reanimated 4 also requires `react-native-worklets`
  as a separate install.
- 2026-08-19: Queue reorder on touch is a `Gesture.Pan().activateAfterLongPress(220)`,
  not a plain pan: the queue lives in a ScrollView, and only deferring activation to a
  long press leaves ordinary vertical scrolling intact. This is the native equivalent
  of the desktop's pointer-capture drag (`app/src/desktop/NowPlaying.tsx`), which is
  web-only. The chevron buttons stay alongside it — they are the only reorder path a
  screen reader can drive.
- 2026-08-19: `TrackBar` needs `accessibilityRole="adjustable"` plus
  `accessibilityActions` + `onAccessibilityAction`. Without them VoiceOver/TalkBack
  can read a volume but has no way to change it, because the bar is a custom
  Responder view rather than a platform slider.
