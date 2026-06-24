# Orkester

A from-scratch controller for Sonos speakers — a self-hosted replacement for the
official Sonos app. It speaks the Sonos **local network protocol** (SSDP / UPnP
SOAP / GENA events) directly, with no cloud dependency.

- **`orkester` CLI:** a Go command-line tool that discovers speakers, maps the
  household, and controls playback / volume / grouping over the LAN.
- **Later:** a resident `orkesterd` server (REST + WebSocket) and UI clients in
  Compose Multiplatform. The CLI comes first and stays useful on its own.

## Status

Working CLI for **discovery, status, transport, volume/mute, and grouping**.

- `internal/sonos/ssdp.go` — SSDP M-SEARCH discovery (incl. fast `DiscoverOne`).
- `internal/sonos/device.go` — device_description.xml parsing, S1/S2 detection.
- `internal/sonos/soap.go` — SOAP envelope builder + UPnP fault parsing.
- `internal/sonos/topology.go` — `GetZoneGroupState` → group/coordinator model,
  room handles (`Slug`) + forgiving resolution (`Resolve`).
- `internal/sonos/control.go` — AVTransport / RenderingControl actions, grouping,
  now-playing (DIDL-Lite) parsing.
- `cmd/orkester/` — the subcommand CLI.

## Install / run (on your LAN)

```sh
cd backend
go install ./cmd/orkester     # puts `orkester` on your PATH (GOBIN / ~/go/bin)
# or just run without installing:
go run ./cmd/orkester list
```

You target a room by **any unique part of its handle or name** — no exact spelling
needed. `pause lob` works because only `lobby` matches. When a query matches
several rooms (`pause dag` → the three dagobah rooms) and you're at a terminal,
it shows a **numbered picker** to choose one; piped/scripted use errors instead
(so nothing hangs). Handles (slugs of room names) are shown by `list`.

```sh
orkester list                  # rooms & groups (shows handles)
orkester status  lobby         # now playing + volume for that room's group
orkester play    lob           # unique substring → Lobby; transport → group coordinator
orkester play    lobby -s jazz # search Favorites/playlists for "jazz" and play a match
orkester pause   lobby
orkester next    lobby
orkester prev    lobby
orkester volume  lobby         # print volume
orkester volume  lobby 35      # set absolute (0–100)
orkester volume  lobby +5      # relative (also -5)
orkester mute    lobby
orkester unmute  lobby
orkester group   bedroom lobby # join bedroom into lobby's group
orkester ungroup bedroom       # break bedroom out to standalone
```

`list` prints a compact tree of handles — grouped rooms (playing in sync) nest
under their coordinator; standalone rooms are a single line:

```
kitchen
lobby
  └─ bedroom
```

(`lobby` and `bedroom` are one group; `kitchen` is on its own.)

A `-wait DURATION` flag (default 3s) bounds discovery and **must come before the
room**: `orkester play -wait 5s lob`. Transport commands route to the group
coordinator; volume/mute apply to the matched room's own speaker.

`play <room> -s <query>` searches your **Sonos Favorites and saved playlists**
(over the LAN — no cloud) and plays a title containing the query. The query is
the exception to "flags before the room": it trails the room and consumes the
rest of the line, so `orkester play lobby -s coffee jazz` needs no quoting. It
lists matches and prompts you to pick one; `-pick N` (before the room) chooses
the Nth match non-interactively for scripts. Anything saved as a favorite —
including Spotify/Tidal content — plays via the speaker's own stored metadata.

### macOS: Local Network permission

macOS 15+ blocks multicast/local-network access until you grant permission. A
plain `go run` from a terminal that hasn't been granted **Local Network** access
will find **0 speakers** even when they're online. Fix:

- System Settings → Privacy & Security → **Local Network** → enable your terminal
  (Terminal / iTerm / the app launching the process), then re-run.
- Also ensure this machine is on the **same LAN/subnet** as the speakers (Sonos
  on a separate VLAN breaks discovery), and that **UPnP is enabled** on the
  system (newer firmware lets users turn it off).

## Test

```sh
cd backend
go test ./...
```

Parsers (SSDP response, device description, SOAP envelope/fault, ZoneGroupState,
DIDL-Lite now-playing) plus room resolution and volume-arg handling are
unit-tested against representative Sonos payloads, so the logic is verified
without needing live speakers.
