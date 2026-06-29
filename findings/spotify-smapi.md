# Spotify catalog search via SMAPI

How orkester searches the Spotify catalog and plays results. Append new entries
chronologically (most recent at the bottom).

ARCHITECTURE: the domain logic lives in `packages/core` (engine `musicservices.ts`
+ `smapi.ts`, `Api` methods, `state/store.tsx` wrappers) because BOTH `desktop`
and `app` consume `@orkester/core` for all domain + data logic. The feature
surfaces in the **desktop UI** (`app/src/desktop/SpotifySearch.tsx`, opened from
the TopBar). The Go CLI (`backend/`) deliberately does NOT have this feature.
The Node host injects `NodeCredentialStore` (`packages/core/src/node/
configStore.ts`) for token persistence; the RN app would inject a secure-store
impl later.

- 2026-06-29: Sonos `ContentDirectory.Browse` only walks LOCAL content
  (favorites `FV:2`, saved queues `SQ:`, library). Real catalog search must go
  through **SMAPI** (the music-service SOAP API), POSTed to the service's own
  HTTPS endpoint — not a `:1400` UPnP control URL.
- 2026-06-29: SMAPI `search` needs a per-account **session token**. Modern
  firmware seals it (encrypted `R_SvcAccounts`); `/status/accounts` does NOT
  expose it and a favorite's `cdudn` holds only a placeholder. Confirmed via SoCo
  + svrooij/node-sonos-ts. So we MINT our own via the **AppLink device-link**
  flow (one-time browser login), exactly as node-sonos-ts does. No Spotify
  Developer app / API keys.
- 2026-06-29: Device-link flow (Spotify = `Auth="AppLink"`):
  1. `ListAvailableServices` (MusicServices, `/MusicServices/Control`) → find
     Spotify: raw `Id` (e.g. 9), `SecureUri` endpoint, `Policy/@Auth`.
  2. `GetHouseholdID` (DeviceProperties, `/DeviceProperties/Control`).
  3. `getAppLink` (SMAPI, NO credentials header) → `deviceLink{regUrl, linkCode,
     linkDeviceId, showLinkCode}`. Show user `regUrl`.
  4. Poll `getDeviceAuthToken(householdId, linkCode, linkDeviceId)` → fault
     `Client.NOT_LINKED_RETRY` (errno 5) while pending; success returns
     `authToken` + `privateKey`; terminal failure `Client.NOT_LINKED_FAILURE` (6).
  5. Persist `{serviceId, seed, endpoint, authToken, privateKey, householdId,
     accountSn}`. Authenticated calls carry a `<credentials>` SOAP HEADER with
     `<loginToken><token><key><householdId>` in ns
     `http://www.sonos.com/Services/1.1`.
- 2026-06-29: Token store is `~/.config/orkester/auth.json` (0600), shared by the
  Go CLI (`internal/config`) and the TS Node host (`packages/core/src/node/
  configStore.ts`). Linking via the CLI makes the desktop app's search work too.
- 2026-06-29: ⚠️ ENQUEUE CONSTANTS ARE UNVALIDATED against live hardware. The
  result→enqueue URI/DIDL uses per-item-kind magic prefixes/flags (from
  node-sonos-ts MetadataHelper), NOT derivable from the service id. Current table
  (Go `smapi_didl.go` == TS `smapi.ts`):
  | kind     | URI                                                   | resMD id prefix | upnp:class                         |
  |----------|-------------------------------------------------------|-----------------|------------------------------------|
  | track    | `x-sonos-spotify:{enc}?sid={id}&flags=8224&sn={sn}`   | `00032020`      | object.item.audioItem.musicTrack   |
  | album    | `x-rincon-cpcontainer:1004206c{enc}`                  | `1004206c`      | object.container.album.musicAlbum  |
  | playlist | `x-rincon-cpcontainer:1006206c{enc}`                  | `1006206c`      | object.container.playlistContainer |
  | artist   | `x-rincon-cpcontainer:100e206c{enc}`                  | `100e206c`      | object.container.playlistContainer |
  `enc` = id with `:`→`%3a` (lowercase). `seed = id*256+7` (9→2311); cdudn =
  `SA_RINCON{seed}_X_#Svc{seed}-{sn}-Token`. Distinct numbers: URI `sid` = raw id
  (9); `seed`/2311 = the account seed. VALIDATE each kind against a real
  favorite's `<res>`/`<r:resMD>` captured from the target system before trusting.
- 2026-06-29: `sn` (account serial) is NOT reliably discoverable post-lockdown.
  Default to `"1"` (single-account households). On a multi-account system, a
  mismatch surfaces as UPnP fault **711/701** on enqueue — make `accountSn`
  configurable in `auth.json` and re-link/adjust rather than guessing silently.
- 2026-06-29: Smoke checks (need a real Sonos + Spotify):
  - Desktop: `pnpm desktop` → click "Search" in the TopBar → "Link Spotify"
    (a browser opens; approve) → search "miles davis" → click a result; the
    selected group's speaker should audibly start it. Watch the renderer/main
    console for UPnP 711/714/800 (wrong URI/resMD/sn) bubbling up via the Api
    rejection.
  - Engine read-only parity (no UI): `pnpm --filter @orkester/core smoke:live --
    "<room>" 3000 --search "miles davis"` (uses the token saved by the desktop
    link, since both share `~/.config/orkester/auth.json`).
