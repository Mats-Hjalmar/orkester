# Album art

## 2026-11-10 — Spotify covers: use Spotify's CDN, not the speaker's /getaa

**Conclusion.** For Spotify tracks, skip the speaker's `/getaa` art URL and load
the cover from Spotify's CDN at the size it is drawn. Look up the CDN image
through Spotify's public oEmbed endpoint, and fall back to `/getaa` only when that
lookup fails. Implemented in `packages/core/src/engine/art.ts`
(`SonosApi.resolveArt`), used by the desktop `app/src/components/CoverArt.tsx`.

**What the speaker does** (measured on our household, all Spotify):

- Queue items and now-playing carry `upnp:albumArtURI` as a coordinator-relative
  `/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a<trackId>%3fsid%3d9…`.
  Queues were 30–240 tracks long.
- One `/getaa` took ~10 s cold and ~2–2.5 s repeated. The response is
  `image/jpeg`, `Cache-Control: private, max-age=15780000`.
- It ignores every size parameter tried (`size`, `sz`, `w`/`h`, `width`, `s`,
  `res`, `thumb`) and always serves 640 px (130 KB).
- Chromium allows ~6 connections per host, so a whole queue's `/getaa` requests
  serialize behind each other. The now-playing cover, which is on the same host,
  waits in that line. That is why covers "often didn't show".
- Under Spotify Connect, now-playing art already arrives as an absolute
  `https://i.scdn.co/image/…` URL.

**Spotify's CDN.**

- The `/getaa` image is byte-identical to `https://i.scdn.co/image/ab67616d0000b273<hash>`.
- Album covers are `ab67616d0000` + a 4-hex size code + a 24-hex image hash:
  `b273` = 640 px (130 KB), `1e02` = 300 px (29 KB), `4851` = 64 px (1.7 KB).
  Each loads in ~40–80 ms. Other image types (e.g. playlists, `ab6765630000…`) use
  different prefixes and are not sized.
- The hash is not in the `/getaa` URL. `GET https://open.spotify.com/oembed?url=spotify:track:<id>`
  (no auth, ~240 ms) returns `thumbnail_url` = the 300 px CDN image, from which
  the other sizes follow.
- A 50-track queue resolved fully in 0.86 s, versus roughly a minute through
  `/getaa`.

**Caveats.**

- oEmbed is not a documented art API. If Spotify changes it, covers fall back to
  the slow `/getaa` path rather than disappearing.
- 64 px looks soft in a 40 pt row on a 2× screen, so rows use 300 px.
- Covers resolve only once they scroll into view, which keeps a long queue from
  firing hundreds of oEmbed calls.
- The phone (expo-image) still loads `/getaa` directly. It already downsamples
  decoded images to the view size, but it pays the same network cost.
