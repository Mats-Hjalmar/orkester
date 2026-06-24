package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/mhm/orkester/backend/internal/sonos"
)

// cmdPlay handles both forms of `play`:
//
//	orkester play <room>              resume the room's group
//	orkester play <room> -s <query>   find a Favorite/saved playlist whose title
//	                                  contains <query> and play it
//
// With -pick N the Nth match is played without prompting; otherwise an
// interactive picker runs (and a non-terminal stdin errors rather than guessing).
func cmdPlay(args []string) error {
	// Everything after a -s/--search marker is the (possibly multi-word) query.
	// Splitting it off before flag parsing lets the query trail the room without
	// quoting, while -wait/-pick keep the usual flags-before-room convention.
	args, query, hasSearch := splitSearchClause(args)

	fs := flag.NewFlagSet("play", flag.ContinueOnError)
	wait := fs.Duration("wait", defaultWait, "max time to listen for SSDP discovery")
	pick := fs.Int("pick", 0, "with -s: play the Nth result without prompting")
	if err := fs.Parse(args); err != nil {
		return err
	}
	pos := fs.Args()
	if len(pos) != 1 {
		return fmt.Errorf("usage: orkester play <room> [-s <query>]")
	}
	room := pos[0]
	if *pick > 0 && !hasSearch {
		return fmt.Errorf("-pick only applies to a search (orkester play %s -s <query>)", room)
	}

	ctx, cancel := newCtx(*wait + 30*time.Second)
	defer cancel()

	_, _, grp, err := openRoom(ctx, *wait, room)
	if err != nil {
		return err
	}
	coordBase, err := coordinatorBase(grp)
	if err != nil {
		return err
	}

	if !hasSearch {
		if err := sonos.Play(ctx, coordBase); err != nil {
			return err
		}
		fmt.Printf("▶ playing %s\n", grp.Name())
		return nil
	}

	if strings.TrimSpace(query) == "" {
		return fmt.Errorf("-s needs a search query, e.g. orkester play %s -s jazz", room)
	}

	results, err := searchMedia(ctx, coordBase, query)
	if err != nil {
		return err
	}
	if len(results) == 0 {
		fmt.Printf("no favorites or playlists match %q\n", query)
		return nil
	}

	printResults(os.Stdout, results)
	idx, err := choose(*pick, len(results))
	if err != nil {
		return err
	}
	chosen := results[idx-1]

	if err := sonos.PlayItem(ctx, coordBase, grp.Coordinator, chosen.item); err != nil {
		return fmt.Errorf("play %q: %w", chosen.item.Title, err)
	}
	fmt.Printf("▶ playing %q on %s\n", chosen.item.Title, grp.Name())
	return nil
}

// splitSearchClause splits args at the first -s/--search marker; everything after
// it becomes the search query and the marker+query are removed from rest. hasSearch
// is true whenever the marker is present (even with an empty query, so the caller
// reports the mistake instead of silently resuming).
func splitSearchClause(args []string) (rest []string, query string, hasSearch bool) {
	for i, a := range args {
		if a == "-s" || a == "--search" {
			return args[:i], strings.Join(args[i+1:], " "), true
		}
	}
	return args, "", false
}

// searchResult is one matched entry plus where it came from (for display).
type searchResult struct {
	item   sonos.BrowseItem
	source string // "favorite" or "playlist"
}

// searchMedia browses Favorites and saved playlists on the given player base and
// returns entries whose title contains query (case-insensitive). Browsing can hit
// any player; we use the coordinator since we already resolved it.
func searchMedia(ctx context.Context, base, query string) ([]searchResult, error) {
	q := strings.ToLower(query)

	var out []searchResult
	for _, src := range []struct {
		objectID string
		label    string
	}{
		{sonos.ObjectFavorites, "favorite"},
		{sonos.ObjectPlaylists, "playlist"},
	} {
		items, err := sonos.Browse(ctx, base, src.objectID)
		if err != nil {
			return nil, fmt.Errorf("browse %s: %w", src.label, err)
		}
		for _, it := range items {
			if strings.Contains(strings.ToLower(it.Title), q) {
				out = append(out, searchResult{item: it, source: src.label})
			}
		}
	}
	return out, nil
}

func printResults(w io.Writer, results []searchResult) {
	for i, r := range results {
		fmt.Fprintf(w, "  %d) [%s] %s\n", i+1, r.source, r.item.Title)
	}
}

// choose resolves which result to play. pick>0 selects non-interactively (bounds
// checked — out of range is a loud error). pick==0 prompts on a terminal; on a
// non-terminal it errors rather than guessing (no silent default).
func choose(pick, n int) (int, error) {
	if pick > 0 {
		if pick > n {
			return 0, fmt.Errorf("-pick %d out of range (1-%d)", pick, n)
		}
		return pick, nil
	}
	if !isInteractive() {
		return 0, fmt.Errorf("non-interactive input: pass -pick N to choose a result")
	}
	fmt.Fprintf(os.Stderr, "Select 1-%d (Enter/q to cancel): ", n)
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && line == "" {
		return 0, fmt.Errorf("cancelled")
	}
	return parseSelection(line, n)
}
