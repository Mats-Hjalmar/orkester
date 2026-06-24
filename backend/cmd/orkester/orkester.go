// Command orkester is a CLI for controlling Sonos speakers over the local
// network (SSDP discovery + UPnP SOAP). It lists the household, shows what's
// playing, and drives transport, volume/mute, and grouping — no cloud, no
// daemon. (A resident orkesterd server comes later.)
//
// Usage:
//
//	orkester list                     list rooms & groups
//	orkester status <room>            now playing + volume for that room's group
//	orkester play|pause|next|prev <room>
//	orkester volume <room> [N|+N|-N]  print or set volume (relative with +/-)
//	orkester mute|unmute <room>
//	orkester group <room> <into-room> join <room> into <into-room>'s group
//	orkester ungroup <room>           break <room> out to a standalone group
//
// A -wait flag (default 3s) bounds SSDP discovery and must come *before* the
// room name, e.g. `orkester play -wait 5s "Living Room"`.
package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mhm/orkester/backend/internal/sonos"
)

// defaultWait bounds SSDP discovery per invocation. One responder is enough to
// fetch the whole topology, so this rarely needs raising.
const defaultWait = 3 * time.Second

func main() {
	if len(os.Args) < 2 {
		usage(os.Stderr)
		os.Exit(2)
	}
	if err := dispatch(os.Args[1], os.Args[2:]); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			os.Exit(0) // the flag package already printed usage
		}
		fmt.Fprintf(os.Stderr, "orkester: %v\n", err)
		os.Exit(1)
	}
}

func dispatch(cmd string, args []string) error {
	switch cmd {
	case "list":
		return cmdList(args)
	case "status":
		return cmdStatus(args)
	case "play":
		return cmdTransport("play", args, sonos.Play, "▶ playing")
	case "pause":
		return cmdTransport("pause", args, sonos.Pause, "⏸ paused")
	case "next":
		return cmdTransport("next", args, sonos.Next, "⏭ next on")
	case "prev":
		return cmdTransport("prev", args, sonos.Previous, "⏮ previous on")
	case "volume":
		return cmdVolume(args)
	case "mute":
		return cmdMute("mute", args, true)
	case "unmute":
		return cmdMute("unmute", args, false)
	case "group":
		return cmdGroup(args)
	case "ungroup":
		return cmdUngroup(args)
	case "help", "-h", "--help":
		usage(os.Stdout)
		return nil
	default:
		usage(os.Stderr)
		return fmt.Errorf("unknown command %q", cmd)
	}
}

func usage(w *os.File) {
	fmt.Fprint(w, `orkester — local Sonos controller

Usage:
  orkester list                       list rooms & groups
  orkester status  <room>             now playing + volume for that room's group
  orkester play    <room>             start/resume playback
  orkester pause   <room>             pause playback
  orkester next    <room>             next track
  orkester prev    <room>             previous track
  orkester volume  <room> [N|+N|-N]   print volume, or set it (relative with +/-)
  orkester mute    <room>             mute the room
  orkester unmute  <room>             unmute the room
  orkester group   <room> <into>      join <room> into <into>'s group
  orkester ungroup <room>             break <room> out to a standalone group

<room> is any unique part of a room's handle or name (see 'list'): 'lob' works
when only 'lobby' matches. Flags must precede the room, e.g.
'orkester play -wait 5s lob'.
  -wait DURATION   max time to listen for SSDP discovery (default 3s)
`)
}

// --- command handlers ---

func cmdList(args []string) error {
	fs := flag.NewFlagSet("list", flag.ContinueOnError)
	wait := fs.Duration("wait", defaultWait, "max time to listen for SSDP discovery")
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx, cancel := newCtx(*wait + 15*time.Second)
	defer cancel()

	hh, err := household(ctx, *wait)
	if err != nil {
		return err
	}
	printHousehold(hh)
	return nil
}

func cmdStatus(args []string) error {
	wait, pos, err := parseRoomCmd("status", args)
	if err != nil {
		return err
	}
	if len(pos) != 1 {
		return fmt.Errorf("usage: orkester status <room>")
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	_, room, grp, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	coordBase, err := coordinatorBase(grp)
	if err != nil {
		return err
	}

	np, err := sonos.GetNowPlaying(ctx, coordBase)
	if err != nil {
		return err
	}

	fmt.Printf("Room:   %s   (group: %s)\n", room.ZoneName, grp.Name())
	fmt.Printf("State:  %s\n", humanState(np.State))
	if np.Title != "" {
		fmt.Printf("Track:  %s\n", np.Title)
	}
	if np.Artist != "" {
		fmt.Printf("Artist: %s\n", np.Artist)
	}
	if np.Album != "" {
		fmt.Printf("Album:  %s\n", np.Album)
	}
	if isTimecode(np.Position) || isTimecode(np.Duration) {
		fmt.Printf("Time:   %s / %s\n", np.Position, np.Duration)
	}

	// Volume/mute are per-player (this room), distinct from the group transport.
	if vol, err := sonos.GetVolume(ctx, room.BaseURL()); err != nil {
		fmt.Printf("Volume: unavailable (%v)\n", err)
	} else {
		muted := ""
		if m, merr := sonos.GetMute(ctx, room.BaseURL()); merr == nil && m {
			muted = " (muted)"
		}
		fmt.Printf("Volume: %d%s\n", vol, muted)
	}
	return nil
}

// cmdTransport handles play/pause/next/prev — all routed to the group
// coordinator (sending these to a non-coordinator returns UPnP error 800).
func cmdTransport(name string, args []string, action func(context.Context, string) error, verb string) error {
	wait, pos, err := parseRoomCmd(name, args)
	if err != nil {
		return err
	}
	if len(pos) != 1 {
		return fmt.Errorf("usage: orkester %s <room>", name)
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	_, _, grp, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	base, err := coordinatorBase(grp)
	if err != nil {
		return err
	}
	if err := action(ctx, base); err != nil {
		return err
	}
	fmt.Printf("%s %s\n", verb, grp.Name())
	return nil
}

func cmdVolume(args []string) error {
	wait, pos, err := parseRoomCmd("volume", args)
	if err != nil {
		return err
	}
	if len(pos) < 1 || len(pos) > 2 {
		return fmt.Errorf("usage: orkester volume <room> [N|+N|-N]")
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	_, room, _, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	base := room.BaseURL()
	cur, err := sonos.GetVolume(ctx, base)
	if err != nil {
		return err
	}
	if len(pos) == 1 {
		fmt.Printf("%s volume: %d\n", room.ZoneName, cur)
		return nil
	}
	target, err := sonos.ApplyVolumeArg(pos[1], cur)
	if err != nil {
		return err
	}
	if err := sonos.SetVolume(ctx, base, target); err != nil {
		return err
	}
	fmt.Printf("%s volume: %d → %d\n", room.ZoneName, cur, target)
	return nil
}

func cmdMute(name string, args []string, mute bool) error {
	wait, pos, err := parseRoomCmd(name, args)
	if err != nil {
		return err
	}
	if len(pos) != 1 {
		return fmt.Errorf("usage: orkester %s <room>", name)
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	_, room, _, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	if err := sonos.SetMute(ctx, room.BaseURL(), mute); err != nil {
		return err
	}
	if mute {
		fmt.Printf("%s muted\n", room.ZoneName)
	} else {
		fmt.Printf("%s unmuted\n", room.ZoneName)
	}
	return nil
}

func cmdGroup(args []string) error {
	wait, pos, err := parseRoomCmd("group", args)
	if err != nil {
		return err
	}
	if len(pos) != 2 {
		return fmt.Errorf("usage: orkester group <room> <into-room>")
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	hh, joiner, _, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	target, targetGrp, err := resolveRoom(hh, pos[1])
	if err != nil {
		return err
	}
	if joiner.UUID == target.UUID {
		return fmt.Errorf("cannot group %s into itself", joiner.ZoneName)
	}
	if joiner.UUID == targetGrp.Coordinator {
		return fmt.Errorf("%s already coordinates that group", joiner.ZoneName)
	}
	// Join must point at the target group's *coordinator*, not the named
	// room's own UUID (they differ when the target is itself a grouped member).
	if err := sonos.JoinGroup(ctx, joiner.BaseURL(), targetGrp.Coordinator); err != nil {
		return err
	}
	fmt.Printf("grouped %s into %s\n", joiner.ZoneName, target.ZoneName)
	return nil
}

func cmdUngroup(args []string) error {
	wait, pos, err := parseRoomCmd("ungroup", args)
	if err != nil {
		return err
	}
	if len(pos) != 1 {
		return fmt.Errorf("usage: orkester ungroup <room>")
	}
	ctx, cancel := newCtx(wait + 15*time.Second)
	defer cancel()

	_, room, grp, err := openRoom(ctx, wait, pos[0])
	if err != nil {
		return err
	}
	if room.UUID == grp.Coordinator {
		if n := visibleMembers(grp); n > 1 {
			fmt.Fprintf(os.Stderr,
				"warning: %s coordinates a group of %d rooms; detaching it promotes a new coordinator and the rest keep playing\n",
				room.ZoneName, n)
		}
	}
	if err := sonos.LeaveGroup(ctx, room.BaseURL()); err != nil {
		return err
	}
	fmt.Printf("ungrouped %s\n", room.ZoneName)
	return nil
}

// --- shared helpers ---

// parseRoomCmd parses a per-subcommand flag set. Go's flag package stops at the
// first non-flag argument, so flags (e.g. -wait) must precede the room name; the
// room and any trailing args (e.g. a volume value, including "-5") are returned
// verbatim as positionals. A misplaced flag thus becomes a loud positional error
// rather than being silently ignored.
func parseRoomCmd(name string, args []string) (time.Duration, []string, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	wait := fs.Duration("wait", defaultWait, "max time to listen for SSDP discovery")
	if err := fs.Parse(args); err != nil {
		return 0, nil, err
	}
	return *wait, fs.Args(), nil
}

func newCtx(timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), timeout)
}

// openRoom discovers the household and resolves a room query to its player and
// group in one step.
func openRoom(ctx context.Context, wait time.Duration, room string) (*sonos.Household, sonos.Member, sonos.Group, error) {
	hh, err := household(ctx, wait)
	if err != nil {
		return nil, sonos.Member{}, sonos.Group{}, err
	}
	m, g, err := resolveRoom(hh, room)
	if err != nil {
		return nil, sonos.Member{}, sonos.Group{}, err
	}
	return hh, m, g, nil
}

// resolveRoom resolves a query to one room. On an ambiguous match it shows an
// interactive numbered picker when stdin is a terminal; otherwise (piped/
// scripted) it returns the ambiguity error so nothing hangs.
func resolveRoom(hh *sonos.Household, query string) (sonos.Member, sonos.Group, error) {
	m, g, err := hh.Resolve(query)
	if err == nil {
		return m, g, nil
	}
	var amb *sonos.AmbiguousError
	if errors.As(err, &amb) && isInteractive() {
		ref, perr := pickRoom(os.Stdin, os.Stderr, amb)
		if perr != nil {
			return sonos.Member{}, sonos.Group{}, perr
		}
		return ref.Member, ref.Group, nil
	}
	return sonos.Member{}, sonos.Group{}, err
}

// isInteractive reports whether stdin is a terminal (so a prompt makes sense).
func isInteractive() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// pickRoom prints a numbered menu of the ambiguous matches and reads a choice.
// An empty line or "q" cancels.
func pickRoom(in io.Reader, out io.Writer, amb *sonos.AmbiguousError) (sonos.RoomRef, error) {
	fmt.Fprintf(out, "%q matches %d rooms:\n", amb.Query, len(amb.Matches))
	for i, r := range amb.Matches {
		fmt.Fprintf(out, "  %d) %s\n", i+1, r.Handle)
	}
	fmt.Fprintf(out, "Select 1-%d (Enter/q to cancel): ", len(amb.Matches))

	line, err := bufio.NewReader(in).ReadString('\n')
	if err != nil && line == "" {
		return sonos.RoomRef{}, fmt.Errorf("cancelled")
	}
	n, err := parseSelection(line, len(amb.Matches))
	if err != nil {
		return sonos.RoomRef{}, err
	}
	return amb.Matches[n-1], nil
}

// parseSelection turns a menu reply into a 1..max index. "" / "q" cancel.
func parseSelection(line string, max int) (int, error) {
	s := strings.TrimSpace(line)
	if s == "" || s == "q" || s == "Q" {
		return 0, fmt.Errorf("cancelled")
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 || n > max {
		return 0, fmt.Errorf("invalid selection %q (pick 1-%d)", s, max)
	}
	return n, nil
}

// household fetches the full topology. It tries the first SSDP responder (fast
// path), and on failure falls back to a full discovery sweep, trying each
// responder — so a single flaky speaker doesn't sink the command.
func household(ctx context.Context, wait time.Duration) (*sonos.Household, error) {
	if one, err := sonos.DiscoverOne(ctx, wait); err == nil && one.IP != nil {
		if hh, terr := sonos.FetchTopology(ctx, baseFromIP(one.IP)); terr == nil {
			return hh, nil
		}
	}

	found, err := sonos.Discover(ctx, wait)
	if err != nil {
		return nil, fmt.Errorf("discovery failed: %w", err)
	}
	if len(found) == 0 {
		return nil, fmt.Errorf("no Sonos speakers answered SSDP.\n" +
			"  - Is this host on the same LAN/subnet as the speakers (no VLAN isolation)?\n" +
			"  - Newer firmware lets users disable UPnP (System > Network settings); it must be on.")
	}
	var lastErr error
	for _, r := range found {
		if r.IP == nil {
			continue
		}
		if hh, terr := sonos.FetchTopology(ctx, baseFromIP(r.IP)); terr == nil {
			return hh, nil
		} else {
			lastErr = terr
		}
	}
	return nil, fmt.Errorf("found %d speaker(s) but none returned topology: %w", len(found), lastErr)
}

func baseFromIP(ip net.IP) string {
	return fmt.Sprintf("http://%s:%d", ip.String(), sonos.HTTPPort)
}

func coordinatorBase(g sonos.Group) (string, error) {
	ip, err := g.CoordinatorIP()
	if err != nil {
		return "", err
	}
	return baseFromIP(ip), nil
}

func visibleMembers(g sonos.Group) int {
	n := 0
	for _, m := range g.Members {
		if !m.Invisible {
			n++
		}
	}
	return n
}

func humanState(state string) string {
	switch state {
	case "PLAYING":
		return "playing"
	case "PAUSED_PLAYBACK":
		return "paused"
	case "STOPPED":
		return "stopped"
	case "TRANSITIONING":
		return "transitioning"
	case "":
		return "unknown"
	default:
		return state
	}
}

// isTimecode reports whether s looks like an h:mm:ss position/duration (Sonos
// returns "NOT_IMPLEMENTED" for live streams, which we hide).
func isTimecode(s string) bool {
	return strings.Contains(s, ":")
}

// printHousehold lists rooms as a compact tree of handles: grouped rooms nest
// under their group's coordinator; standalone rooms are a single line.
func printHousehold(hh *sonos.Household) {
	handle := map[string]string{} // UUID -> handle
	for _, r := range hh.Rooms() {
		handle[r.Member.UUID] = r.Handle
	}

	type tgroup struct {
		head    string
		members []string
	}
	var groups []tgroup
	for _, g := range hh.Groups {
		var visible []sonos.Member
		for _, m := range g.Members {
			if !m.Invisible {
				visible = append(visible, m)
			}
		}
		if len(visible) == 0 {
			continue
		}
		// Head = the coordinator if it's visible, else the first visible member
		// (a bonded coordinator must never be the displayed/playable node).
		head := visible[0]
		for _, m := range visible {
			if m.UUID == g.Coordinator {
				head = m
				break
			}
		}
		var members []string
		for _, m := range visible {
			if m.UUID != head.UUID {
				members = append(members, handle[m.UUID])
			}
		}
		sort.Strings(members)
		groups = append(groups, tgroup{handle[head.UUID], members})
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].head < groups[j].head })

	for _, g := range groups {
		fmt.Println(g.head)
		for i, m := range g.members {
			branch := "├─"
			if i == len(g.members)-1 {
				branch = "└─"
			}
			fmt.Printf("  %s %s\n", branch, m)
		}
	}
}
