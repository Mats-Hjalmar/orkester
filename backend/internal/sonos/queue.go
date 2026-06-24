package sonos

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

// SetAVTransportURI points a coordinator's transport at uri (with optional DIDL
// metadata). It underlies grouping (x-rincon:), queue playback
// (x-rincon-queue:) and direct stream playback (x-sonosapi-stream:). metadata
// may be "" — Sonos accepts an empty CurrentURIMetaData and some firmware in
// fact requires the element be present-but-empty rather than omitted.
func SetAVTransportURI(ctx context.Context, base, uri, metadata string) error {
	_, err := SOAPCall(ctx, base, avTransport(), "SetAVTransportURI",
		[]Arg{InstanceArg(),
			{Name: "CurrentURI", Value: uri},
			{Name: "CurrentURIMetaData", Value: metadata}})
	return err
}

// AddURIToQueue appends (or, with asNext, inserts after the current track) a URI
// and its DIDL metadata onto the coordinator's queue. It returns
// FirstTrackNumberEnqueued — the 1-based queue position the item landed at,
// which PlayFromQueue must seek to (do not assume position 1).
func AddURIToQueue(ctx context.Context, coordBase, uri, metadata string, asNext bool) (int, error) {
	next := "0"
	if asNext {
		next = "1"
	}
	resp, err := SOAPCall(ctx, coordBase, avTransport(), "AddURIToQueue",
		[]Arg{InstanceArg(),
			{Name: "EnqueuedURI", Value: uri},
			{Name: "EnqueuedURIMetaData", Value: metadata},
			{Name: "DesiredFirstTrackNumberEnqueued", Value: "0"},
			{Name: "EnqueueAsNext", Value: next}})
	if err != nil {
		return 0, err
	}
	s, err := extractResponseArg(resp, "FirstTrackNumberEnqueued")
	if err != nil {
		return 0, err
	}
	n, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return 0, fmt.Errorf("parse FirstTrackNumberEnqueued %q: %w", s, err)
	}
	return n, nil
}

// PlayFromQueue points the coordinator at its own queue, seeks to the given
// 1-based track, and starts playback. coordUUID is the coordinator's bare RINCON
// UUID (Group.Coordinator). Sonos does not auto-switch to the queue when items
// are added over UPnP, so this explicit step is required.
func PlayFromQueue(ctx context.Context, coordBase, coordUUID string, track int) error {
	if err := SetAVTransportURI(ctx, coordBase, "x-rincon-queue:"+coordUUID+"#0", ""); err != nil {
		return err
	}
	if track > 0 {
		if err := seekTrack(ctx, coordBase, track); err != nil {
			return err
		}
	}
	return Play(ctx, coordBase)
}

// seekTrack jumps the coordinator's queue to a 1-based track number.
func seekTrack(ctx context.Context, coordBase string, track int) error {
	_, err := SOAPCall(ctx, coordBase, avTransport(), "Seek",
		[]Arg{InstanceArg(),
			{Name: "Unit", Value: "TRACK_NR"},
			{Name: "Target", Value: strconv.Itoa(track)}})
	return err
}

// PlayItem plays a browsed favorite/playlist/track on the group coordinator,
// choosing the correct transport path for the item:
//
//   - Single broadcast streams (radio: x-sonosapi-stream:, x-rincon-mp3radio:,
//     …) are set directly as the transport URI and played.
//   - Everything else — containers (albums, playlists), x-rincon-cpcontainer
//     favorites, and individual tracks — is enqueued then played from the
//     queue. Feeding an x-rincon-cpcontainer URI straight to SetAVTransportURI
//     returns UPnP fault 714, so containers must go through the queue.
//
// coordBase/coordUUID identify the group coordinator; sending these actions to a
// non-coordinator returns UPnP fault 800.
func PlayItem(ctx context.Context, coordBase, coordUUID string, item BrowseItem) error {
	if item.URI == "" {
		return fmt.Errorf("item %q has no playable URI", item.Title)
	}
	if isDirectStream(item) {
		if err := SetAVTransportURI(ctx, coordBase, item.URI, item.Metadata); err != nil {
			return err
		}
		return Play(ctx, coordBase)
	}
	track, err := AddURIToQueue(ctx, coordBase, item.URI, item.Metadata, false)
	if err != nil {
		return err
	}
	return PlayFromQueue(ctx, coordBase, coordUUID, track)
}

// directStreamSchemes are URI schemes that are single, continuous broadcast
// streams — they play via a direct SetAVTransportURI rather than the queue.
var directStreamSchemes = []string{
	"x-sonosapi-stream:", // radio (TuneIn etc.)
	"x-sonosapi-radio:",  // service radio stations
	"x-rincon-mp3radio:", // direct MP3 radio
	"x-sonosapi-hls:",    // HLS broadcast
	"x-rincon-stream:",   // line-in
	"x-sonos-htastream:", // TV / home-theater
}

func isDirectStream(item BrowseItem) bool {
	for _, s := range directStreamSchemes {
		if strings.HasPrefix(item.URI, s) {
			return true
		}
	}
	return false
}
