package sonos

import (
	"net"
	"strings"
	"testing"
)

// Representative inner ZoneGroupState XML (already unescaped, as it appears
// after extracting the SOAP output arg). Two groups: a grouped pair coordinated
// by the Living Room, and a standalone Kitchen. Includes an invisible bonded
// surround to exercise the Invisible flag.
const sampleZoneGroupState = `<ZoneGroupState>
  <ZoneGroups>
    <ZoneGroup Coordinator="RINCON_AAAAAAAAAAAA01400" ID="RINCON_AAAAAAAAAAAA01400:42">
      <ZoneGroupMember UUID="RINCON_AAAAAAAAAAAA01400" Location="http://192.168.1.10:1400/xml/device_description.xml" ZoneName="Living Room" SoftwareVersion="15.9" Invisible="0"/>
      <ZoneGroupMember UUID="RINCON_BBBBBBBBBBBB01400" Location="http://192.168.1.11:1400/xml/device_description.xml" ZoneName="Bedroom" SoftwareVersion="15.9" Invisible="0"/>
      <ZoneGroupMember UUID="RINCON_CCCCCCCCCCCC01400" Location="http://192.168.1.12:1400/xml/device_description.xml" ZoneName="Living Room (Sub)" SoftwareVersion="15.9" Invisible="1"/>
    </ZoneGroup>
    <ZoneGroup Coordinator="RINCON_DDDDDDDDDDDD01400" ID="RINCON_DDDDDDDDDDDD01400:7">
      <ZoneGroupMember UUID="RINCON_DDDDDDDDDDDD01400" Location="http://192.168.1.13:1400/xml/device_description.xml" ZoneName="Kitchen" SoftwareVersion="15.9" Invisible="0"/>
    </ZoneGroup>
  </ZoneGroups>
  <VanishedDevices/>
</ZoneGroupState>`

func TestParseZoneGroupState(t *testing.T) {
	hh, err := parseZoneGroupState(sampleZoneGroupState)
	if err != nil {
		t.Fatalf("parseZoneGroupState: %v", err)
	}
	if len(hh.Groups) != 2 {
		t.Fatalf("got %d groups, want 2", len(hh.Groups))
	}

	// Locate the grouped pair (coordinator = Living Room).
	var living, kitchen *Group
	for i := range hh.Groups {
		switch hh.Groups[i].Coordinator {
		case "RINCON_AAAAAAAAAAAA01400":
			living = &hh.Groups[i]
		case "RINCON_DDDDDDDDDDDD01400":
			kitchen = &hh.Groups[i]
		}
	}
	if living == nil || kitchen == nil {
		t.Fatalf("expected living and kitchen groups; got %+v", hh.Groups)
	}

	if len(living.Members) != 3 {
		t.Errorf("living group has %d members, want 3", len(living.Members))
	}

	// Coordinator IP resolution.
	ip, err := living.CoordinatorIP()
	if err != nil {
		t.Fatalf("CoordinatorIP: %v", err)
	}
	if ip.String() != "192.168.1.10" {
		t.Errorf("coordinator IP = %s, want 192.168.1.10", ip)
	}

	// Group name: Bedroom is visible (+1); the Sub is invisible and excluded.
	if got := living.Name(); got != "Living Room +1" {
		t.Errorf("living.Name() = %q, want %q", got, "Living Room +1")
	}
	if got := kitchen.Name(); got != "Kitchen" {
		t.Errorf("kitchen.Name() = %q, want %q", got, "Kitchen")
	}

	// Invisible flag parsed correctly.
	var foundSub bool
	for _, m := range living.Members {
		if m.UUID == "RINCON_CCCCCCCCCCCC01400" {
			foundSub = true
			if !m.Invisible {
				t.Error("Sub member should be Invisible")
			}
		}
	}
	if !foundSub {
		t.Error("Sub member not found in living group")
	}
}

func TestSlug(t *testing.T) {
	cases := map[string]string{
		"Living Room":     "living-room",  // simple + space
		"Café Lärka":      "cafe-larka",   // é, ä fold
		"Smörgås Åker":    "smorgas-aker", // ö, å fold
		"GUEST 5G":        "guest-5g",     // uppercase + digit
		"  Spaced  Out  ": "spaced-out",   // collapse + trim
		"-Weird Room-":    "weird-room",   // never leads/trails with '-'
		"Søndag Øl":       "sondag-ol",    // ø fold
		"Café & Bar":      "cafe-bar",
		"日本語":             "", // all-unmapped → empty (Rooms adds fallback)
	}
	for in, want := range cases {
		if got := Slug(in); got != want {
			t.Errorf("Slug(%q) = %q, want %q", in, got, want)
		}
	}
}

// roomHousehold builds a household: a stereo pair (Living Room, with an invisible
// secondary sharing the name) grouped with Bedroom, plus a standalone Kitchen.
func roomHousehold() *Household {
	return &Household{Groups: []Group{
		{
			ID:          "g1",
			Coordinator: "RINCON_LR01400",
			Members: []Member{
				{UUID: "RINCON_LR01400", ZoneName: "Living Room", IP: net.ParseIP("10.0.0.1")},
				{UUID: "RINCON_BR01400", ZoneName: "Bedroom", IP: net.ParseIP("10.0.0.2")},
				// Stereo-pair secondary: same ZoneName, invisible.
				{UUID: "RINCON_LR201400", ZoneName: "Living Room", IP: net.ParseIP("10.0.0.3"), Invisible: true},
			},
		},
		{
			ID:          "g2",
			Coordinator: "RINCON_K01400",
			Members: []Member{
				{UUID: "RINCON_K01400", ZoneName: "Kitchen", IP: net.ParseIP("10.0.0.4")},
			},
		},
	}}
}

func TestRoomsHandlesSkipInvisible(t *testing.T) {
	rooms := roomHousehold().Rooms()

	got := map[string]string{} // handle -> ZoneName
	for _, r := range rooms {
		if r.Member.Invisible {
			t.Errorf("Rooms() included invisible member %q", r.Member.UUID)
		}
		got[r.Handle] = r.Member.ZoneName
	}
	want := map[string]string{
		"bedroom":     "Bedroom",
		"kitchen":     "Kitchen",
		"living-room": "Living Room",
	}
	if len(got) != len(want) {
		t.Fatalf("Rooms() handles = %v, want %v", got, want)
	}
	for h, zone := range want {
		if got[h] != zone {
			t.Errorf("handle %q -> %q, want %q", h, got[h], zone)
		}
	}
}

func TestRoomsHandleCollisionAndReserved(t *testing.T) {
	hh := &Household{Groups: []Group{
		{ID: "g1", Coordinator: "RINCON_A01400", Members: []Member{
			{UUID: "RINCON_A01400", ZoneName: "Office"}, // -> office
		}},
		{ID: "g2", Coordinator: "RINCON_B01400", Members: []Member{
			{UUID: "RINCON_B01400", ZoneName: "Office"}, // collision -> office-2
		}},
		{ID: "g3", Coordinator: "RINCON_C01400", Members: []Member{
			{UUID: "RINCON_C01400", ZoneName: "Play"}, // reserved -> play-2
		}},
	}}
	handles := map[string]bool{}
	for _, r := range hh.Rooms() {
		if handles[r.Handle] {
			t.Errorf("duplicate handle %q", r.Handle)
		}
		handles[r.Handle] = true
	}
	for _, want := range []string{"office", "office-2", "play-2"} {
		if !handles[want] {
			t.Errorf("expected handle %q in %v", want, handles)
		}
	}
	if handles["play"] {
		t.Error("reserved handle \"play\" must not be assigned to a room")
	}
}

func TestResolve(t *testing.T) {
	hh := roomHousehold() // rooms: living-room, bedroom (grouped), kitchen

	// Exact handle → the visible primary, never the invisible secondary.
	if m, _, err := hh.Resolve("living-room"); err != nil || m.UUID != "RINCON_LR01400" || m.Invisible {
		t.Errorf("Resolve(living-room) = %q (invisible=%v), %v", m.UUID, m.Invisible, err)
	}

	// Exact name, case-insensitive.
	if m, _, err := hh.Resolve("KITCHEN"); err != nil || m.UUID != "RINCON_K01400" {
		t.Errorf("Resolve(KITCHEN) = %q, %v", m.UUID, err)
	}

	// Unique substring "just works".
	if m, _, err := hh.Resolve("bed"); err != nil || m.UUID != "RINCON_BR01400" {
		t.Errorf("Resolve(bed) = %q, %v; want bedroom", m.UUID, err)
	}
	if m, _, err := hh.Resolve("kit"); err != nil || m.UUID != "RINCON_K01400" {
		t.Errorf("Resolve(kit) = %q, %v; want kitchen", m.UUID, err)
	}

	// Ambiguous substring ("room" is in both living-room and bedroom).
	_, _, err := hh.Resolve("room")
	if err == nil || !strings.Contains(err.Error(), "matches") {
		t.Errorf("Resolve(room) should be ambiguous, got: %v", err)
	}

	// No match lists the rooms.
	_, _, err = hh.Resolve("garage")
	if err == nil || !strings.Contains(err.Error(), "bedroom") {
		t.Errorf("Resolve(garage) should list rooms, got: %v", err)
	}
}
