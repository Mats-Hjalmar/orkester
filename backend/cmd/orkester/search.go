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

// searchResult is one matched entry plus where it came from (for display).
type searchResult struct {
	item   sonos.BrowseItem
	source string // "favorite" or "playlist"
}

// cmdSearch finds Sonos Favorites / saved playlists whose title contains the
// query and plays the chosen one on the room's group coordinator. With -pick N
// it plays the Nth result non-interactively; otherwise it prompts (requiring a
// terminal — it never silently auto-picks).
func cmdSearch(args []string) error {
	fs := flag.NewFlagSet("search", flag.ContinueOnError)
	wait := fs.Duration("wait", defaultWait, "max time to listen for SSDP discovery")
	pick := fs.Int("pick", 0, "play the Nth result without prompting")
	if err := fs.Parse(args); err != nil {
		return err
	}
	pos := fs.Args()
	if len(pos) < 2 {
		return fmt.Errorf("usage: orkester search [-pick N] <room> <query>")
	}
	room := pos[0]
	query := strings.Join(pos[1:], " ") // allow unquoted multi-word queries

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

// searchMedia browses Favorites and saved playlists on the given player base and
// returns entries whose title contains query (case-insensitive). Browsing can
// hit any player; we use the coordinator since we already resolved it.
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
