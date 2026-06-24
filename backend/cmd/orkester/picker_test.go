package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mhm/orkester/backend/internal/sonos"
)

func TestParseSelection(t *testing.T) {
	cases := []struct {
		in      string
		max     int
		want    int
		wantErr bool
	}{
		{"2\n", 3, 2, false},
		{"  1 \n", 3, 1, false},
		{"3", 3, 3, false},
		{"\n", 3, 0, true},  // cancel
		{"q\n", 3, 0, true}, // cancel
		{"4", 3, 0, true},   // out of range
		{"0", 3, 0, true},   // out of range
		{"x", 3, 0, true},   // not a number
	}
	for _, c := range cases {
		got, err := parseSelection(c.in, c.max)
		if c.wantErr {
			if err == nil {
				t.Errorf("parseSelection(%q,%d): want error", c.in, c.max)
			}
			continue
		}
		if err != nil || got != c.want {
			t.Errorf("parseSelection(%q,%d) = %d,%v; want %d", c.in, c.max, got, err, c.want)
		}
	}
}

func TestPickRoom(t *testing.T) {
	amb := &sonos.AmbiguousError{
		Query: "attic",
		Matches: []sonos.RoomRef{
			{Handle: "attic-left", Member: sonos.Member{UUID: "A"}},
			{Handle: "attic-right", Member: sonos.Member{UUID: "B"}},
			{Handle: "attic-center", Member: sonos.Member{UUID: "C"}},
		},
	}

	// Selecting 2 returns the second match.
	var out bytes.Buffer
	ref, err := pickRoom(strings.NewReader("2\n"), &out, amb)
	if err != nil || ref.Member.UUID != "B" {
		t.Fatalf("pickRoom select 2 = %q, %v; want B", ref.Member.UUID, err)
	}
	// The menu lists each candidate handle.
	if !strings.Contains(out.String(), "attic-center") {
		t.Errorf("menu missing a candidate:\n%s", out.String())
	}

	// Cancelling returns an error.
	if _, err := pickRoom(strings.NewReader("\n"), &bytes.Buffer{}, amb); err == nil {
		t.Error("pickRoom with empty input should cancel")
	}
}
