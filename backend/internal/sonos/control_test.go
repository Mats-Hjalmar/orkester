package sonos

import (
	"bytes"
	"encoding/xml"
	"strings"
	"testing"
)

// buildPositionInfoResponse wraps a DIDL-Lite document the way a real speaker
// does: the metadata is entity-escaped inside the <TrackMetaData> element. This
// exercises the two-stage parse (extractResponseArg unescapes, parseTrackMetadata
// then unmarshals the result).
func buildPositionInfoResponse(didl, relTime, duration string) []byte {
	var esc bytes.Buffer
	xml.EscapeText(&esc, []byte(didl))
	return []byte(`<?xml version="1.0"?>` +
		`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
		`<s:Body><u:GetPositionInfoResponse xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">` +
		`<Track>1</Track>` +
		`<TrackDuration>` + duration + `</TrackDuration>` +
		`<TrackMetaData>` + esc.String() + `</TrackMetaData>` +
		`<RelTime>` + relTime + `</RelTime>` +
		`</u:GetPositionInfoResponse></s:Body></s:Envelope>`)
}

func TestNowPlayingTrackMetadata(t *testing.T) {
	const didl = `<DIDL-Lite ` +
		`xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
		`xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ` +
		`xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" ` +
		`xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
		`<item id="-1" parentID="-1" restricted="true">` +
		`<res>x-sonos-http:track.mp3</res>` +
		`<dc:title>Black Dog</dc:title>` +
		`<dc:creator>Led Zeppelin</dc:creator>` +
		`<upnp:album>Led Zeppelin IV</upnp:album>` +
		`<upnp:artist>Led Zeppelin</upnp:artist>` +
		`</item></DIDL-Lite>`

	resp := buildPositionInfoResponse(didl, "0:01:23", "0:04:55")

	// Stage 1: the escaped metadata must come back as usable XML.
	meta, err := extractResponseArg(resp, "TrackMetaData")
	if err != nil {
		t.Fatalf("extractResponseArg(TrackMetaData): %v", err)
	}
	if !strings.Contains(meta, "<dc:title>Black Dog</dc:title>") {
		t.Fatalf("TrackMetaData not unescaped to DIDL XML, got: %q", meta)
	}

	// Stage 2: parse it.
	title, artist, album := parseTrackMetadata(meta)
	if title != "Black Dog" || artist != "Led Zeppelin" || album != "Led Zeppelin IV" {
		t.Fatalf("parseTrackMetadata = (%q, %q, %q)", title, artist, album)
	}
}

func TestTrackMetadataRadioFallback(t *testing.T) {
	// Radio: dc:title is the station, the live track is in r:streamContent.
	const didl = `<DIDL-Lite ` +
		`xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
		`xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ` +
		`xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" ` +
		`xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">` +
		`<item id="-1" parentID="-1" restricted="true">` +
		`<dc:title></dc:title>` +
		`<r:streamContent>TYPE=SNG|TITLE Comfortably Numb|ARTIST Pink Floyd|ALBUM The Wall</r:streamContent>` +
		`</item></DIDL-Lite>`

	title, artist, _ := parseTrackMetadata(didl)
	if title != "Comfortably Numb" || artist != "Pink Floyd" {
		t.Fatalf("radio fallback = (%q, %q), want (Comfortably Numb, Pink Floyd)", title, artist)
	}

	// "Artist - Title" form.
	const didl2 = `<DIDL-Lite xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">` +
		`<item><r:streamContent>Daft Punk - Around the World</r:streamContent></item></DIDL-Lite>`
	title, artist, _ = parseTrackMetadata(didl2)
	if title != "Around the World" || artist != "Daft Punk" {
		t.Fatalf(`"artist - title" fallback = (%q, %q)`, title, artist)
	}
}

func TestParseTrackMetadataEmpty(t *testing.T) {
	if tl, ar, al := parseTrackMetadata(""); tl != "" || ar != "" || al != "" {
		t.Fatalf("empty metadata = (%q, %q, %q), want all empty", tl, ar, al)
	}
	if tl, _, _ := parseTrackMetadata("not xml"); tl != "" {
		t.Fatalf("garbage metadata should yield empty, got %q", tl)
	}
}

func TestApplyVolumeArg(t *testing.T) {
	cases := []struct {
		arg     string
		cur     int
		want    int
		wantErr bool
	}{
		{"50", 20, 50, false},
		{"+5", 20, 25, false},
		{"-5", 20, 15, false},
		{" +10 ", 20, 30, false}, // trimmed
		{"+100", 20, 100, false}, // clamp high
		{"-100", 20, 0, false},   // clamp low
		{"0", 50, 0, false},
		{"abc", 20, 0, true},
		{"", 20, 0, true},
	}
	for _, c := range cases {
		got, err := ApplyVolumeArg(c.arg, c.cur)
		if c.wantErr {
			if err == nil {
				t.Errorf("ApplyVolumeArg(%q, %d): expected error", c.arg, c.cur)
			}
			continue
		}
		if err != nil {
			t.Errorf("ApplyVolumeArg(%q, %d): unexpected error %v", c.arg, c.cur, err)
			continue
		}
		if got != c.want {
			t.Errorf("ApplyVolumeArg(%q, %d) = %d, want %d", c.arg, c.cur, got, c.want)
		}
	}
}

func TestJoinEnvelopeIncludesEmptyMetadata(t *testing.T) {
	args := []Arg{
		InstanceArg(),
		{Name: "CurrentURI", Value: "x-rincon:RINCON_AAAAAAAAAAAA01400"},
		{Name: "CurrentURIMetaData", Value: ""},
	}
	env := buildEnvelope(avTransportType, "SetAVTransportURI", args)

	if !strings.Contains(env, "<CurrentURI>x-rincon:RINCON_AAAAAAAAAAAA01400</CurrentURI>") {
		t.Errorf("join envelope missing CurrentURI:\n%s", env)
	}
	// The empty metadata element must be emitted (omitting it can trip UPnP 402).
	if !strings.Contains(env, "<CurrentURIMetaData></CurrentURIMetaData>") {
		t.Errorf("join envelope missing empty CurrentURIMetaData:\n%s", env)
	}
}

