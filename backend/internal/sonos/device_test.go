package sonos

import (
	"net"
	"testing"
)

// A trimmed but structurally faithful Sonos device_description.xml: the root
// ZonePlayer device plus an embedded MediaRenderer carrying AVTransport and a
// MediaServer carrying ContentDirectory + the S2-only Queue service.
const sampleDescription = `<?xml version="1.0" encoding="utf-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:ZonePlayer:1</deviceType>
    <friendlyName>192.168.1.10 - Sonos One</friendlyName>
    <manufacturer>Sonos, Inc.</manufacturer>
    <modelNumber>S13</modelNumber>
    <modelName>Sonos One</modelName>
    <displayVersion>15.9</displayVersion>
    <roomName>Living Room</roomName>
    <UDN>uuid:RINCON_AAAAAAAAAAAA01400</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ZoneGroupTopology:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ZoneGroupTopology</serviceId>
        <controlURL>/ZoneGroupTopology/Control</controlURL>
        <eventSubURL>/ZoneGroupTopology/Event</eventSubURL>
        <SCPDURL>/xml/ZoneGroupTopology1.xml</SCPDURL>
      </service>
    </serviceList>
    <deviceList>
      <device>
        <deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:AVTransport</serviceId>
            <controlURL>/MediaRenderer/AVTransport/Control</controlURL>
            <eventSubURL>/MediaRenderer/AVTransport/Event</eventSubURL>
            <SCPDURL>/xml/AVTransport1.xml</SCPDURL>
          </service>
          <service>
            <serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:RenderingControl</serviceId>
            <controlURL>/MediaRenderer/RenderingControl/Control</controlURL>
            <eventSubURL>/MediaRenderer/RenderingControl/Event</eventSubURL>
            <SCPDURL>/xml/RenderingControl1.xml</SCPDURL>
          </service>
        </serviceList>
      </device>
      <device>
        <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
        <serviceList>
          <service>
            <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
            <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
            <controlURL>/MediaServer/ContentDirectory/Control</controlURL>
            <eventSubURL>/MediaServer/ContentDirectory/Event</eventSubURL>
            <SCPDURL>/xml/ContentDirectory1.xml</SCPDURL>
          </service>
          <service>
            <serviceType>urn:schemas-sonos-com:service:Queue:1</serviceType>
            <serviceId>urn:sonos-com:serviceId:Queue</serviceId>
            <controlURL>/MediaRenderer/Queue/Control</controlURL>
            <eventSubURL>/MediaRenderer/Queue/Event</eventSubURL>
            <SCPDURL>/xml/Queue1.xml</SCPDURL>
          </service>
        </serviceList>
      </device>
    </deviceList>
  </device>
</root>`

func TestParseDescription(t *testing.T) {
	ip := net.ParseIP("192.168.1.10")
	d, err := parseDescription(ip, []byte(sampleDescription))
	if err != nil {
		t.Fatalf("parseDescription: %v", err)
	}

	if d.UDN != "uuid:RINCON_AAAAAAAAAAAA01400" {
		t.Errorf("UDN = %q", d.UDN)
	}
	if d.RINCON() != "RINCON_AAAAAAAAAAAA01400" {
		t.Errorf("RINCON() = %q", d.RINCON())
	}
	if d.ModelName != "Sonos One" {
		t.Errorf("ModelName = %q", d.ModelName)
	}
	if d.SoftwareVersion != "15.9" {
		t.Errorf("SoftwareVersion = %q (want displayVersion)", d.SoftwareVersion)
	}
	if got := d.BaseURL(); got != "http://192.168.1.10:1400" {
		t.Errorf("BaseURL() = %q", got)
	}

	// Services from root + both embedded devices must all be collected.
	for _, want := range []string{"ZoneGroupTopology", "AVTransport", "RenderingControl", "ContentDirectory", "Queue"} {
		if _, ok := d.Services[want]; !ok {
			t.Errorf("missing service %q; have %v", want, keys(d.Services))
		}
	}
	if got := d.Services["AVTransport"].ControlURL; got != "/MediaRenderer/AVTransport/Control" {
		t.Errorf("AVTransport control URL = %q", got)
	}

	// Queue service present => S2.
	if gen := d.Generation(); gen != "S2" {
		t.Errorf("Generation() = %q, want S2 (Queue service present)", gen)
	}
}

func TestGeneration(t *testing.T) {
	cases := []struct {
		name    string
		svcs    map[string]Service
		sw      string
		want    string
	}{
		{"queue present", map[string]Service{"Queue": {}}, "11.0", "S2"},
		{"no queue, fw 15", map[string]Service{}, "15.9", "S2"},
		{"no queue, fw 11", map[string]Service{}, "11.1", "S1"},
		{"no queue, no fw", map[string]Service{}, "", "unknown"},
		{"no queue, junk fw", map[string]Service{}, "x.y", "unknown"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d := &Device{Services: c.svcs, SoftwareVersion: c.sw}
			if got := d.Generation(); got != c.want {
				t.Errorf("Generation() = %q, want %q", got, c.want)
			}
		})
	}
}

func keys(m map[string]Service) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
