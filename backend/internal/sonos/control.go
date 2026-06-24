package sonos

import (
	"context"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
)

// Sonos exposes the same service control paths on every model, so we hardcode
// them (as topology.go already does for ZoneGroupTopology) and skip a per-call
// device-description fetch. AVTransport owns the queue/transport and lives on
// the group coordinator; RenderingControl owns per-player volume/mute.
const (
	avTransportType            = "urn:schemas-upnp-org:service:AVTransport:1"
	avTransportControlURL      = "/MediaRenderer/AVTransport/Control"
	renderingControlType       = "urn:schemas-upnp-org:service:RenderingControl:1"
	renderingControlControlURL = "/MediaRenderer/RenderingControl/Control"
)

func avTransport() Service {
	return Service{Type: avTransportType, ControlURL: avTransportControlURL}
}

func renderingControl() Service {
	return Service{Type: renderingControlType, ControlURL: renderingControlControlURL}
}

// --- Transport (send to the group coordinator's base URL) ---

// Play starts/resumes playback. Speed=1 is normal playback rate.
func Play(ctx context.Context, base string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "Play",
		[]Arg{InstanceArg(), {Name: "Speed", Value: "1"}})
	return err
}

// Pause pauses playback.
func Pause(ctx context.Context, base string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "Pause", []Arg{InstanceArg()})
	return err
}

// Next skips to the next track.
func Next(ctx context.Context, base string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "Next", []Arg{InstanceArg()})
	return err
}

// Previous skips to the previous track.
func Previous(ctx context.Context, base string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "Previous", []Arg{InstanceArg()})
	return err
}

// GetTransportState returns the raw CurrentTransportState
// (PLAYING / PAUSED_PLAYBACK / STOPPED / TRANSITIONING).
func GetTransportState(ctx context.Context, base string) (string, error) {
	resp, err := SOAPCall(ctx, base, avTransport(), "GetTransportInfo", []Arg{InstanceArg()})
	if err != nil {
		return "", err
	}
	return extractResponseArg(resp, "CurrentTransportState")
}

// NowPlaying is a flattened view of what a coordinator is currently playing.
type NowPlaying struct {
	State    string // CurrentTransportState
	Title    string
	Artist   string
	Album    string
	Position string // RelTime, e.g. "0:01:23"
	Duration string // TrackDuration; "NOT_IMPLEMENTED" for live streams
}

// GetNowPlaying reports the coordinator's transport state plus the current
// track's metadata and position.
func GetNowPlaying(ctx context.Context, base string) (NowPlaying, error) {
	np := NowPlaying{}
	state, err := GetTransportState(ctx, base)
	if err != nil {
		return np, err
	}
	np.State = state

	resp, err := SOAPCall(ctx, base, avTransport(), "GetPositionInfo", []Arg{InstanceArg()})
	if err != nil {
		return np, err
	}
	if np.Duration, err = extractResponseArg(resp, "TrackDuration"); err != nil {
		return np, err
	}
	if np.Position, err = extractResponseArg(resp, "RelTime"); err != nil {
		return np, err
	}
	meta, err := extractResponseArg(resp, "TrackMetaData")
	if err != nil {
		return np, err
	}
	np.Title, np.Artist, np.Album = parseTrackMetadata(meta)
	return np, nil
}

// --- Volume & mute (per-player; send to the named room's base URL) ---

// GetVolume returns the master channel volume (0–100) for a player.
func GetVolume(ctx context.Context, base string) (int, error) {
	resp, err := SOAPCall(ctx, base, renderingControl(), "GetVolume",
		[]Arg{InstanceArg(), {Name: "Channel", Value: "Master"}})
	if err != nil {
		return 0, err
	}
	s, err := extractResponseArg(resp, "CurrentVolume")
	if err != nil {
		return 0, err
	}
	v, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0, fmt.Errorf("parse volume %q: %w", s, err)
	}
	return v, nil
}

// SetVolume sets the master channel volume. vol must be in [0,100]; out-of-range
// values are rejected rather than silently clamped (callers compute relative
// changes with ApplyVolumeArg, which clamps deliberately).
func SetVolume(ctx context.Context, base string, vol int) error {
	if vol < 0 || vol > 100 {
		return fmt.Errorf("volume %d out of range (0-100)", vol)
	}
	_, err := SOAPCall(ctx, base, renderingControl(), "SetVolume",
		[]Arg{InstanceArg(), {Name: "Channel", Value: "Master"}, {Name: "DesiredVolume", Value: strconv.Itoa(vol)}})
	return err
}

// GetMute reports whether the player's master channel is muted.
func GetMute(ctx context.Context, base string) (bool, error) {
	resp, err := SOAPCall(ctx, base, renderingControl(), "GetMute",
		[]Arg{InstanceArg(), {Name: "Channel", Value: "Master"}})
	if err != nil {
		return false, err
	}
	s, err := extractResponseArg(resp, "CurrentMute")
	if err != nil {
		return false, err
	}
	return strings.TrimSpace(s) == "1", nil
}

// SetMute mutes/unmutes the player's master channel.
func SetMute(ctx context.Context, base string, mute bool) error {
	val := "0"
	if mute {
		val = "1"
	}
	_, err := SOAPCall(ctx, base, renderingControl(), "SetMute",
		[]Arg{InstanceArg(), {Name: "Channel", Value: "Master"}, {Name: "DesiredMute", Value: val}})
	return err
}

// ApplyVolumeArg interprets a CLI volume argument against the current volume:
// "50" is absolute, "+5"/"-5" are relative to cur. The result is clamped to
// [0,100]. This clamping is the deliberate, documented behavior for the relative
// form — keep it out of SetVolume so the low-level setter stays strict.
func ApplyVolumeArg(arg string, cur int) (int, error) {
	arg = strings.TrimSpace(arg)
	if arg == "" {
		return 0, fmt.Errorf("empty volume argument")
	}
	relative := arg[0] == '+' || arg[0] == '-'
	n, err := strconv.Atoi(arg)
	if err != nil {
		return 0, fmt.Errorf("invalid volume %q (use 0-100, +N, or -N)", arg)
	}
	v := n
	if relative {
		v = cur + n
	}
	if v < 0 {
		v = 0
	} else if v > 100 {
		v = 100
	}
	return v, nil
}

// --- Grouping ---

// JoinGroup makes the player at base join the group coordinated by
// coordinatorUUID (a bare RINCON_xxxx01400, as carried in topology Member.UUID).
// CurrentURIMetaData is sent as an empty element on purpose — omitting it can
// trip a UPnP 402 (invalid args) on some firmware.
func JoinGroup(ctx context.Context, base, coordinatorUUID string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "SetAVTransportURI",
		[]Arg{InstanceArg(),
			{Name: "CurrentURI", Value: "x-rincon:" + coordinatorUUID},
			{Name: "CurrentURIMetaData", Value: ""}})
	return err
}

// LeaveGroup detaches the player at base into its own standalone group. Sent to
// a non-coordinator member it simply leaves; sent to a coordinator of a
// multi-member group it detaches and the rest promote a new coordinator (the
// caller should warn about that case).
func LeaveGroup(ctx context.Context, base string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "BecomeCoordinatorOfStandaloneGroup",
		[]Arg{InstanceArg()})
	return err
}

// --- DIDL-Lite metadata parsing ---

// didlLite mirrors the DIDL-Lite document Sonos embeds (entity-escaped) in a
// GetPositionInfo TrackMetaData field, and also returns (as a list) from a
// ContentDirectory Browse Result. Tags use BARE local names on purpose: Go's
// encoding/xml namespace-qualified tags are brittle and silently yield empty
// fields, whereas the DIDL local names (title, creator, artist, album,
// streamContent, res, class, resMD) are distinct enough that local-name
// matching is reliable.
type didlLite struct {
	XMLName    xml.Name        `xml:"DIDL-Lite"`
	Items      []didlItem      `xml:"item"`
	Containers []didlContainer `xml:"container"`
}

type didlItem struct {
	ID            string `xml:"id,attr"`
	ParentID      string `xml:"parentID,attr"`
	Title         string `xml:"title"`         // dc:title
	Creator       string `xml:"creator"`       // dc:creator
	Artist        string `xml:"artist"`        // upnp:artist
	Album         string `xml:"album"`         // upnp:album
	StreamContent string `xml:"streamContent"` // r:streamContent (radio/line-in/TV)
	Class         string `xml:"class"`         // upnp:class
	Res           string `xml:"res"`           // the playable URI
	ResMD         string `xml:"resMD"`          // r:resMD — DIDL metadata to enqueue (favorites)
}

// didlContainer is a <container> entry in a Browse result (a favorite that is
// itself a playlist/station, or a saved-queue playlist). Same bare-local-name
// rationale as didlItem.
type didlContainer struct {
	ID       string `xml:"id,attr"`
	ParentID string `xml:"parentID,attr"`
	Title    string `xml:"title"`
	Class    string `xml:"class"`
	Res      string `xml:"res"`
	ResMD    string `xml:"resMD"`
}

// parseTrackMetadata extracts title/artist/album from an (already entity-decoded)
// DIDL-Lite string. For radio/line-in/TV, dc:title is often the station and the
// live track lives in r:streamContent, which is used as a fallback.
func parseTrackMetadata(meta string) (title, artist, album string) {
	meta = strings.TrimSpace(meta)
	if meta == "" {
		return "", "", ""
	}
	var d didlLite
	if err := xml.Unmarshal([]byte(meta), &d); err != nil || len(d.Items) == 0 {
		return "", "", ""
	}
	it := d.Items[0]
	title = strings.TrimSpace(it.Title)
	artist = strings.TrimSpace(it.Artist)
	if artist == "" {
		artist = strings.TrimSpace(it.Creator)
	}
	album = strings.TrimSpace(it.Album)

	if sc := strings.TrimSpace(it.StreamContent); sc != "" {
		if t, a := parseStreamContent(sc); t != "" || a != "" {
			if t != "" {
				title = t
			}
			if a != "" {
				artist = a
			}
		}
	}
	return title, artist, album
}

// parseStreamContent pulls a title/artist out of an r:streamContent value.
// Sonos radio uses "TYPE=SNG|TITLE The Song|ARTIST The Band|ALBUM ..." while
// many stations just send "Artist - Title".
func parseStreamContent(sc string) (title, artist string) {
	if strings.Contains(sc, "|") && strings.Contains(sc, "TITLE") {
		for _, part := range strings.Split(sc, "|") {
			part = strings.TrimSpace(part)
			switch {
			case strings.HasPrefix(part, "TITLE"):
				title = strings.TrimSpace(strings.TrimPrefix(part, "TITLE"))
			case strings.HasPrefix(part, "ARTIST"):
				artist = strings.TrimSpace(strings.TrimPrefix(part, "ARTIST"))
			}
		}
		return title, artist
	}
	if i := strings.Index(sc, " - "); i >= 0 {
		return strings.TrimSpace(sc[i+3:]), strings.TrimSpace(sc[:i])
	}
	return sc, "" // unknown format: surface the raw content rather than nothing
}
