# Spotify Connect: up next

## 2026-11-20 — The next track only arrives as an AVTransport event

**Conclusion.** Under Spotify Connect the speaker reports exactly one next track,
and only in the AVTransport GENA event. The desktop subscribes to that event on
the group coordinator and shows the track as "Up next"; the phone app shows only
a caption. Implemented in `upNextFromLastChange` (`packages/core/src/engine/control.ts`),
`NodeNextTrackSource` (`packages/core/src/node/nextTrackSource.ts`, injected into
`SonosApi` by `desktop/src/main/index.ts`) and `app/src/components/SpotifyUpNext.tsx`.

**What the speaker does** (probed on the coordinator while casting from the
Spotify app):

- The transport URI is `x-sonos-vli:RINCON_…:2,spotify:…`. The Sonos queue is
  not what plays, so the app hides it.
- Polled SOAP calls do not carry the next track. `GetMediaInfo` returns empty
  `NextURI` / `NextURIMetaData`, and `GetPositionInfo` has only the current track.
- The AVTransport event does. Its `LastChange` holds `r:NextTrackURI val=""` and
  `r:NextTrackMetaData` with an escaped DIDL-Lite item (title in `dc:title`,
  artist in `dc:creator`, `upnp:album`). The LastChange is itself escaped inside
  the NOTIFY propertyset, so it is parsed in two stages.
- The DIDL has no `upnp:albumArtURI`, so the next track has no art.
- The next track is reported while paused too.
- The initial event (seq 0) arrives right after SUBSCRIBE with the full state, so
  the first poll can wait briefly for it instead of showing nothing.

**Only one track.** The rest of the Spotify Connect queue lives on Spotify's
servers; the speaker never sees it. Showing more would need the Spotify Web API
with the user's own Spotify login, which we don't have.

**Callback address.** The speaker needs a callback URL on this machine. Our LAN
is a /16 (speaker 10.10.237.187, this machine 10.10.221.110), so picking the local
interface whose first three octets match the speaker's finds nothing. Instead a
UDP socket is `connect()`ed to the speaker (no packet is sent) and its
`address()` is the address the OS routes from.

**Why the phone app has no next track.** Receiving events needs an HTTP server
the speaker can reach. React Native has none, so the phone passes no source to
`SonosApi`, `upNext` stays null, and only the caption shows.
