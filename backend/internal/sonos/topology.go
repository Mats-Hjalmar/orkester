package sonos

import (
	"context"
	"encoding/xml"
	"fmt"
	"net"
	"sort"
	"strings"
)

// zoneGroupTopologyType is the proprietary Sonos service type for topology.
const zoneGroupTopologyType = "urn:schemas-upnp-org:service:ZoneGroupTopology:1"

// zoneGroupTopologyControlURL is the fixed control path for the topology
// service (it lives on the root device, not an embedded one).
const zoneGroupTopologyControlURL = "/ZoneGroupTopology/Control"

// Member is one ZonePlayer within the household topology.
type Member struct {
	UUID            string // RINCON_xxxxxxxxxxxx01400
	ZoneName        string
	IP              net.IP
	Location        string // description XML URL
	SoftwareVersion string
	Invisible       bool // bonded/satellite players hidden from the room list
}

// BaseURL is http://{ip}:1400 — the root every service path hangs off. It is
// empty if the member's IP could not be resolved from the topology.
func (m *Member) BaseURL() string {
	if m.IP == nil {
		return ""
	}
	return fmt.Sprintf("http://%s:%d", m.IP.String(), HTTPPort)
}

// Group is a set of members coordinated by one ZonePlayer. The coordinator
// owns the queue/transport; transport commands must be sent to it.
type Group struct {
	ID          string
	Coordinator string // UUID of the coordinating member
	Members     []Member
}

// Name returns a display name for the group: the coordinator's zone name,
// suffixed with "+N" when other rooms are grouped in.
func (g *Group) Name() string {
	coord := g.coordinatorMember()
	base := coord.ZoneName
	if base == "" {
		base = g.Coordinator
	}
	extra := 0
	for _, m := range g.Members {
		if m.UUID != g.Coordinator && !m.Invisible {
			extra++
		}
	}
	if extra > 0 {
		return fmt.Sprintf("%s +%d", base, extra)
	}
	return base
}

func (g *Group) coordinatorMember() Member {
	for _, m := range g.Members {
		if m.UUID == g.Coordinator {
			return m
		}
	}
	if len(g.Members) > 0 {
		return g.Members[0]
	}
	return Member{}
}

// CoordinatorIP returns the IP of the group's coordinator — the address
// transport/queue commands must target.
func (g *Group) CoordinatorIP() (net.IP, error) {
	m := g.coordinatorMember()
	if m.IP == nil {
		return nil, fmt.Errorf("group %s has no resolvable coordinator IP", g.ID)
	}
	return m.IP, nil
}

// Household is the full topology snapshot: every group and its members.
type Household struct {
	Groups []Group
}

// RoomRef pairs a visible room with its unique, stable handle (a slug used as
// the CLI target / tab-completion candidate) and the group it belongs to.
type RoomRef struct {
	Handle string
	Member Member
	Group  Group
}

// Rooms returns every visible room paired with a unique handle, sorted by handle.
// Handles come from Slug(ZoneName); an empty slug falls back to a UUID-derived
// name, and a slug that collides with another room or a reserved subcommand name
// gets a deterministic numeric suffix. Invisible members (bonded surrounds, sub,
// stereo-pair secondaries) are excluded: they accept SOAP but are the wrong
// control surface.
func (h *Household) Rooms() []RoomRef {
	type pair struct {
		m Member
		g Group
	}
	var all []pair
	for _, g := range h.Groups {
		for _, m := range g.Members {
			if m.Invisible {
				continue
			}
			all = append(all, pair{m, g})
		}
	}
	// Stable input order so suffix assignment is deterministic regardless of how
	// the topology happened to be ordered.
	sort.Slice(all, func(i, j int) bool {
		if all[i].m.ZoneName != all[j].m.ZoneName {
			return all[i].m.ZoneName < all[j].m.ZoneName
		}
		return all[i].m.UUID < all[j].m.UUID
	})

	used := map[string]bool{}
	refs := make([]RoomRef, 0, len(all))
	for _, p := range all {
		base := Slug(p.m.ZoneName)
		if base == "" {
			base = "room-" + uuidSuffix(p.m.UUID)
		}
		handle := uniqueHandle(base, used)
		used[handle] = true
		refs = append(refs, RoomRef{Handle: handle, Member: p.m, Group: p.g})
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].Handle < refs[j].Handle })
	return refs
}

// Resolve maps a query to a single visible room, forgivingly. An exact handle or
// room-name match wins outright; otherwise any room whose handle or name
// *contains* the query (case-insensitive) is a candidate. Exactly one candidate
// is used — so `pause lob` just works when only "lobby" matches. Multiple
// candidates return an error listing them (e.g. `pause dag` → the three dagobah
// rooms); none returns an error listing every room. Invisible members are never
// matched (they're excluded from Rooms).
func (h *Household) Resolve(query string) (Member, Group, error) {
	rooms := h.Rooms()
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return Member{}, Group{}, fmt.Errorf("empty room query")
	}

	// Exact handle or name wins, even if it's also a substring of others.
	for _, r := range rooms {
		if r.Handle == q || strings.ToLower(r.Member.ZoneName) == q {
			return r.Member, r.Group, nil
		}
	}

	var matches []RoomRef
	for _, r := range rooms {
		if strings.Contains(r.Handle, q) || strings.Contains(strings.ToLower(r.Member.ZoneName), q) {
			matches = append(matches, r)
		}
	}
	switch len(matches) {
	case 1:
		return matches[0].Member, matches[0].Group, nil
	case 0:
		return Member{}, Group{}, fmt.Errorf("no room matching %q; rooms: %s",
			query, strings.Join(handlesOf(rooms), ", "))
	default:
		return Member{}, Group{}, &AmbiguousError{Query: query, Matches: matches}
	}
}

// AmbiguousError is returned by Resolve when a query matches more than one room.
// It carries the candidates so an interactive caller can offer a picker; a
// non-interactive caller can just print Error().
type AmbiguousError struct {
	Query   string
	Matches []RoomRef
}

func (e *AmbiguousError) Error() string {
	return fmt.Sprintf("%q matches %d rooms: %s",
		e.Query, len(e.Matches), strings.Join(handlesOf(e.Matches), ", "))
}

func handlesOf(rooms []RoomRef) []string {
	hs := make([]string, len(rooms))
	for i, r := range rooms {
		hs[i] = r.Handle
	}
	return hs
}

// reservedHandles are subcommand names a room handle must never equal, so a room
// can't shadow a command in dispatch / completion.
var reservedHandles = map[string]bool{
	"list": true, "status": true, "play": true, "pause": true, "next": true,
	"prev": true, "volume": true, "mute": true, "unmute": true, "group": true,
	"ungroup": true, "help": true, "completion": true, "__handles": true,
}

// uniqueHandle returns base, or base with the smallest -N suffix (N≥2) that is
// neither already used nor a reserved subcommand name.
func uniqueHandle(base string, used map[string]bool) string {
	if !reservedHandles[base] && !used[base] {
		return base
	}
	for n := 2; ; n++ {
		cand := fmt.Sprintf("%s-%d", base, n)
		if !reservedHandles[cand] && !used[cand] {
			return cand
		}
	}
}

// uuidSuffix yields a short stable token from a RINCON UUID for fallback handles.
func uuidSuffix(uuid string) string {
	s := strings.ToLower(strings.TrimPrefix(uuid, "RINCON_"))
	switch {
	case len(s) >= 8:
		return s[4:8]
	case s != "":
		return s
	default:
		return "x"
	}
}

// Slug converts a room name into a stable, ASCII, shell-friendly handle:
// lowercase, common Latin/Nordic diacritics folded to ASCII, every run of other
// non-alphanumeric characters collapsed to a single '-', with leading/trailing
// '-' trimmed (so a handle never starts with '-', which would break flag
// parsing). It returns "" only when the name has no mappable alphanumerics;
// Rooms substitutes a UUID-based fallback in that case.
func Slug(name string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if folded, ok := foldRunes[r]; ok {
			b.WriteString(folded)
			dash = false
			continue
		}
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if b.Len() > 0 && !dash {
				b.WriteByte('-')
				dash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// foldRunes maps lowercase accented Latin letters to ASCII. strings.ToLower has
// already lowered the input, so only lowercase keys are needed.
var foldRunes = map[rune]string{
	'á': "a", 'à': "a", 'â': "a", 'ä': "a", 'ã': "a", 'å': "a",
	'é': "e", 'è': "e", 'ê': "e", 'ë': "e",
	'í': "i", 'ì': "i", 'î': "i", 'ï': "i",
	'ó': "o", 'ò': "o", 'ô': "o", 'ö': "o", 'õ': "o", 'ø': "o",
	'ú': "u", 'ù': "u", 'û': "u", 'ü': "u",
	'ý': "y", 'ÿ': "y", 'ñ': "n", 'ç': "c",
	'æ': "ae", 'œ': "oe", 'ß': "ss",
}

// FetchTopology asks one device for the entire household's zone-group state
// and parses it. Any device in the system returns the complete topology, so a
// single call after discovering one speaker maps everything.
func FetchTopology(ctx context.Context, base string) (*Household, error) {
	svc := Service{Type: zoneGroupTopologyType, ControlURL: zoneGroupTopologyControlURL}
	resp, err := SOAPCall(ctx, base, svc, "GetZoneGroupState", []Arg{})
	if err != nil {
		return nil, err
	}
	stateXML, err := extractResponseArg(resp, "ZoneGroupState")
	if err != nil {
		return nil, fmt.Errorf("GetZoneGroupState: %w", err)
	}
	return parseZoneGroupState(stateXML)
}

// --- ZoneGroupState XML parsing ---

type xmlZoneGroupState struct {
	XMLName    xml.Name       `xml:"ZoneGroupState"`
	ZoneGroups []xmlZoneGroup `xml:"ZoneGroups>ZoneGroup"`
}

type xmlZoneGroup struct {
	Coordinator string               `xml:"Coordinator,attr"`
	ID          string               `xml:"ID,attr"`
	Members     []xmlZoneGroupMember `xml:"ZoneGroupMember"`
}

type xmlZoneGroupMember struct {
	UUID            string `xml:"UUID,attr"`
	ZoneName        string `xml:"ZoneName,attr"`
	Location        string `xml:"Location,attr"`
	SoftwareVersion string `xml:"SoftwareVersion,attr"`
	Invisible       string `xml:"Invisible,attr"` // "1" for bonded/satellite
}

func parseZoneGroupState(stateXML string) (*Household, error) {
	// The topology service sometimes wraps the state; trim to the element.
	stateXML = strings.TrimSpace(stateXML)
	var state xmlZoneGroupState
	if err := xml.Unmarshal([]byte(stateXML), &state); err != nil {
		return nil, fmt.Errorf("parse ZoneGroupState: %w", err)
	}

	hh := &Household{}
	for _, zg := range state.ZoneGroups {
		g := Group{ID: zg.ID, Coordinator: zg.Coordinator}
		for _, m := range zg.Members {
			g.Members = append(g.Members, Member{
				UUID:            m.UUID,
				ZoneName:        m.ZoneName,
				IP:              ipFromLocation(m.Location),
				Location:        m.Location,
				SoftwareVersion: m.SoftwareVersion,
				Invisible:       m.Invisible == "1",
			})
		}
		hh.Groups = append(hh.Groups, g)
	}
	return hh, nil
}

func ipFromLocation(location string) net.IP {
	if location == "" {
		return nil
	}
	ip, err := parseHost(location)
	if err != nil {
		return nil
	}
	return ip
}
