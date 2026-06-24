package sonos

import (
	"context"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
)

// ContentDirectory lives on the embedded MediaServer device and owns the
// browsable content model (favorites, saved playlists, the music library,
// radio). Its control path is fixed across Sonos models, like the AVTransport /
// RenderingControl paths in control.go, so we hardcode it.
const (
	contentDirectoryType       = "urn:schemas-upnp-org:service:ContentDirectory:1"
	contentDirectoryControlURL = "/MediaServer/ContentDirectory/Control"
)

func contentDirectory() Service {
	return Service{Type: contentDirectoryType, ControlURL: contentDirectoryControlURL}
}

// Well-known ContentDirectory object IDs. Browsing one with BrowseDirectChildren
// lists its entries.
const (
	ObjectFavorites = "FV:2" // Sonos Favorites
	ObjectPlaylists = "SQ:"  // saved Sonos playlists (saved queues)
)

// browsePageSize is the RequestedCount per Browse call. Favorites/playlists are
// small, but we page on TotalMatches anyway so nothing is silently truncated.
const browsePageSize = 100

// BrowseItem is one entry (an <item> or a <container>) from a Browse result.
type BrowseItem struct {
	ID          string
	ParentID    string
	Title       string
	URI         string // <res> — the playable URI (may be empty for pure folders)
	Metadata    string // DIDL metadata to pass as EnqueuedURIMetaData (from r:resMD)
	Class       string // upnp:class
	IsContainer bool   // a <container> (playlist/album/station) vs a single <item>
}

// Browse lists the direct children of objectID (e.g. ObjectFavorites) on the
// player at base. It pages until TotalMatches is exhausted so large containers
// are returned in full rather than silently capped at one page. Browse works
// against any player (it does not require the group coordinator).
func Browse(ctx context.Context, base, objectID string) ([]BrowseItem, error) {
	var items []BrowseItem
	start := 0
	for {
		resp, err := SOAPCall(ctx, base, contentDirectory(), "Browse", []Arg{
			{Name: "ObjectID", Value: objectID},
			{Name: "BrowseFlag", Value: "BrowseDirectChildren"},
			{Name: "Filter", Value: "*"},
			{Name: "StartingIndex", Value: strconv.Itoa(start)},
			{Name: "RequestedCount", Value: strconv.Itoa(browsePageSize)},
			{Name: "SortCriteria", Value: ""},
		})
		if err != nil {
			return nil, err
		}

		// Result is an entity-escaped DIDL-Lite document; encoding/xml's decoder
		// returns it already unescaped from extractResponseArg, same two-stage
		// pattern as GetNowPlaying's TrackMetaData.
		result, err := extractResponseArg(resp, "Result")
		if err != nil {
			return nil, fmt.Errorf("Browse %s: %w", objectID, err)
		}
		var d didlLite
		if err := xml.Unmarshal([]byte(strings.TrimSpace(result)), &d); err != nil {
			return nil, fmt.Errorf("Browse %s: parse DIDL-Lite: %w", objectID, err)
		}
		items = append(items, d.browseItems()...)

		numReturned, _ := strconv.Atoi(mustArg(resp, "NumberReturned"))
		total, _ := strconv.Atoi(mustArg(resp, "TotalMatches"))
		start += numReturned
		// Stop when we've seen everything, or when a page returns nothing (a
		// defensive guard against a NumberReturned of 0 looping forever).
		if numReturned == 0 || start >= total {
			break
		}
	}
	return items, nil
}

// mustArg returns the named response element's text, or "" if absent. Used only
// for the optional paging counters, where a missing/garbage value safely falls
// back to "stop after this page".
func mustArg(resp []byte, name string) string {
	v, err := extractResponseArg(resp, name)
	if err != nil {
		return ""
	}
	return v
}

// browseItems flattens a parsed DIDL-Lite document into BrowseItems, mapping
// both <item> and <container> entries. For each, the enqueue metadata is the
// embedded r:resMD when present (favorites carry it); a container without resMD
// (e.g. a saved queue) is enqueued with empty metadata, which Sonos accepts.
func (d *didlLite) browseItems() []BrowseItem {
	out := make([]BrowseItem, 0, len(d.Items)+len(d.Containers))
	for _, it := range d.Items {
		out = append(out, BrowseItem{
			ID:          it.ID,
			ParentID:    it.ParentID,
			Title:       strings.TrimSpace(it.Title),
			URI:         strings.TrimSpace(it.Res),
			Metadata:    strings.TrimSpace(it.ResMD),
			Class:       strings.TrimSpace(it.Class),
			IsContainer: false,
		})
	}
	for _, c := range d.Containers {
		out = append(out, BrowseItem{
			ID:          c.ID,
			ParentID:    c.ParentID,
			Title:       strings.TrimSpace(c.Title),
			URI:         strings.TrimSpace(c.Res),
			Metadata:    strings.TrimSpace(c.ResMD),
			Class:       strings.TrimSpace(c.Class),
			IsContainer: true,
		})
	}
	return out
}
