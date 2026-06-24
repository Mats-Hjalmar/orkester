package sonos

import "testing"

const sampleSSDPResponse = "HTTP/1.1 200 OK\r\n" +
	"CACHE-CONTROL: max-age = 1800\r\n" +
	"EXT:\r\n" +
	"LOCATION: http://192.168.1.10:1400/xml/device_description.xml\r\n" +
	"SERVER: Linux UPnP/1.0 Sonos/70.3-35220\r\n" +
	"ST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n" +
	"USN: uuid:RINCON_AAAAAAAAAAAA01400::urn:schemas-upnp-org:device:ZonePlayer:1\r\n" +
	"\r\n"

func TestParseSSDPResponse(t *testing.T) {
	res, ok := parseSSDPResponse([]byte(sampleSSDPResponse))
	if !ok {
		t.Fatal("expected a parsed ZonePlayer response")
	}
	if res.Location != "http://192.168.1.10:1400/xml/device_description.xml" {
		t.Errorf("Location = %q", res.Location)
	}
	if res.IP == nil || res.IP.String() != "192.168.1.10" {
		t.Errorf("IP = %v, want 192.168.1.10", res.IP)
	}
}

func TestParseSSDPResponseRejectsNonZonePlayer(t *testing.T) {
	other := "HTTP/1.1 200 OK\r\n" +
		"LOCATION: http://192.168.1.99:80/desc.xml\r\n" +
		"ST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n"
	if _, ok := parseSSDPResponse([]byte(other)); ok {
		t.Error("expected non-ZonePlayer ST to be rejected")
	}
}

func TestParseSSDPResponseNoLocation(t *testing.T) {
	bad := "HTTP/1.1 200 OK\r\nST: urn:schemas-upnp-org:device:ZonePlayer:1\r\n\r\n"
	if _, ok := parseSSDPResponse([]byte(bad)); ok {
		t.Error("expected response without LOCATION to be rejected")
	}
}
