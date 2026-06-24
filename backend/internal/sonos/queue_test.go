package sonos

import (
	"strings"
	"testing"
)

func TestAddURIToQueueEnvelope(t *testing.T) {
	args := []Arg{
		InstanceArg(),
		{Name: "EnqueuedURI", Value: "x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9"},
		{Name: "EnqueuedURIMetaData", Value: "<DIDL-Lite></DIDL-Lite>"},
		{Name: "DesiredFirstTrackNumberEnqueued", Value: "0"},
		{Name: "EnqueueAsNext", Value: "0"},
	}
	env := buildEnvelope(avTransportType, "AddURIToQueue", args)

	if !strings.Contains(env, "<EnqueuedURI>x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9</EnqueuedURI>") {
		t.Errorf("envelope missing EnqueuedURI:\n%s", env)
	}
	// Metadata DIDL must be entity-escaped inside the SOAP body.
	if !strings.Contains(env, "&lt;DIDL-Lite&gt;&lt;/DIDL-Lite&gt;") {
		t.Errorf("envelope did not escape metadata:\n%s", env)
	}
	if !strings.Contains(env, "<EnqueueAsNext>0</EnqueueAsNext>") {
		t.Errorf("envelope missing EnqueueAsNext:\n%s", env)
	}
}

func TestPlayFromQueueURI(t *testing.T) {
	// PlayFromQueue points the transport at x-rincon-queue:<uuid>#0.
	args := []Arg{
		InstanceArg(),
		{Name: "CurrentURI", Value: "x-rincon-queue:RINCON_AAAAAAAAAAAA01400#0"},
		{Name: "CurrentURIMetaData", Value: ""},
	}
	env := buildEnvelope(avTransportType, "SetAVTransportURI", args)
	if !strings.Contains(env, "<CurrentURI>x-rincon-queue:RINCON_AAAAAAAAAAAA01400#0</CurrentURI>") {
		t.Errorf("queue URI envelope wrong:\n%s", env)
	}
}

func TestIsDirectStream(t *testing.T) {
	cases := []struct {
		uri  string
		want bool
	}{
		{"x-sonosapi-stream:s12345?sid=254", true},       // radio
		{"x-rincon-mp3radio://example.com/stream", true}, // mp3 radio
		{"x-rincon-stream:RINCON_xxxx", true},            // line-in
		{"x-rincon-cpcontainer:1006206cspotify", false},  // container → queue
		{"x-sonos-spotify:spotify%3atrack%3a4Am", false}, // single track → queue
		{"x-file-cifs://nas/song.flac", false},           // library track → queue
	}
	for _, c := range cases {
		got := isDirectStream(BrowseItem{URI: c.uri})
		if got != c.want {
			t.Errorf("isDirectStream(%q) = %v, want %v", c.uri, got, c.want)
		}
	}
}
