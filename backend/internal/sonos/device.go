package sonos

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// HTTPPort is the unencrypted HTTP port every Sonos ZonePlayer exposes for
// SOAP control, the description XML, GENA event subscriptions and /status/*.
const HTTPPort = 1400

// Service describes a single UPnP service advertised by a ZonePlayer, taken
// from its device description XML. The control/event/SCPD URLs are paths
// relative to http://{ip}:1400.
type Service struct {
	Type       string // e.g. urn:schemas-upnp-org:service:AVTransport:1
	ID         string // e.g. urn:upnp-org:serviceId:AVTransport
	ControlURL string // e.g. /MediaRenderer/AVTransport/Control
	EventURL   string // e.g. /MediaRenderer/AVTransport/Event
	SCPDURL    string
}

// Device is a discovered Sonos ZonePlayer, populated from its
// device_description.xml. It is the per-physical-speaker handle; room/group
// layout comes separately from ZoneGroupTopology.
type Device struct {
	IP              net.IP
	UDN             string // uuid:RINCON_xxxxxxxxxxxx01400
	FriendlyName    string
	ModelName       string // e.g. "Sonos PLAY:1"
	ModelNumber     string // e.g. "S13"
	SoftwareVersion string // displayVersion, e.g. "15.9"
	RoomName        string // zone/room name if present in the description

	// Services indexed by short name (the trailing segment of the serviceId,
	// e.g. "AVTransport", "RenderingControl", "Queue").
	Services map[string]Service
}

// RINCON returns the bare RINCON UUID (without the "uuid:" prefix) used in
// x-rincon grouping URIs and topology coordinator references.
func (d *Device) RINCON() string {
	return strings.TrimPrefix(d.UDN, "uuid:")
}

// BaseURL is http://{ip}:1400 — the root every service path hangs off.
func (d *Device) BaseURL() string {
	return fmt.Sprintf("http://%s:%d", d.IP.String(), HTTPPort)
}

// Generation reports a best-effort S1/S2 guess. Sonos splits its ecosystem
// into S1 (legacy) and S2 (modern). The dedicated Queue service
// (urn:schemas-sonos-com:service:Queue:1) is present on S2 players, so we use
// it as the primary signal and fall back to the firmware major version. The
// returned string is one of "S2", "S1", or "unknown" — never silently
// defaulted; callers should show the raw SoftwareVersion alongside it.
func (d *Device) Generation() string {
	if _, ok := d.Services["Queue"]; ok {
		return "S2"
	}
	// Firmware major version: S1 caps out around v11.x; S2 is v12+.
	if maj, ok := firmwareMajor(d.SoftwareVersion); ok {
		if maj >= 12 {
			return "S2"
		}
		return "S1"
	}
	return "unknown"
}

func firmwareMajor(v string) (int, bool) {
	if v == "" {
		return 0, false
	}
	part, _, _ := strings.Cut(v, ".")
	n := 0
	for _, r := range part {
		if r < '0' || r > '9' {
			return 0, false
		}
		n = n*10 + int(r-'0')
	}
	return n, true
}

// --- description XML parsing ---

// xmlDevice mirrors the nested <device> structure in device_description.xml.
// Services are spread across the root device and embedded MediaRenderer /
// MediaServer devices, so we recurse.
type xmlDevice struct {
	DeviceType      string      `xml:"deviceType"`
	FriendlyName    string      `xml:"friendlyName"`
	ModelName       string      `xml:"modelName"`
	ModelNumber     string      `xml:"modelNumber"`
	DisplayVersion  string      `xml:"displayVersion"`
	SoftwareVersion string      `xml:"softwareVersion"`
	RoomName        string      `xml:"roomName"`
	UDN             string      `xml:"UDN"`
	ServiceList     []xmlSvc    `xml:"serviceList>service"`
	DeviceList      []xmlDevice `xml:"deviceList>device"`
}

type xmlSvc struct {
	ServiceType string `xml:"serviceType"`
	ServiceID   string `xml:"serviceId"`
	ControlURL  string `xml:"controlURL"`
	EventSubURL string `xml:"eventSubURL"`
	SCPDURL     string `xml:"SCPDURL"`
}

type xmlRoot struct {
	XMLName xml.Name  `xml:"root"`
	Device  xmlDevice `xml:"device"`
}

// shortServiceName turns a serviceId like
// "urn:upnp-org:serviceId:AVTransport" into "AVTransport".
func shortServiceName(serviceID string) string {
	if i := strings.LastIndexByte(serviceID, ':'); i >= 0 {
		return serviceID[i+1:]
	}
	return serviceID
}

func collectServices(d *xmlDevice, into map[string]Service) {
	for _, s := range d.ServiceList {
		name := shortServiceName(s.ServiceID)
		into[name] = Service{
			Type:       s.ServiceType,
			ID:         s.ServiceID,
			ControlURL: s.ControlURL,
			EventURL:   s.EventSubURL,
			SCPDURL:    s.SCPDURL,
		}
	}
	for i := range d.DeviceList {
		collectServices(&d.DeviceList[i], into)
	}
}

// FetchDevice retrieves and parses http://{ip}:1400/xml/device_description.xml
// into a Device. It returns an error (never a half-populated Device) on any
// network or parse failure.
func FetchDevice(ctx context.Context, ip net.IP) (*Device, error) {
	descURL := fmt.Sprintf("http://%s:%d/xml/device_description.xml", ip.String(), HTTPPort)
	return fetchDeviceURL(ctx, ip, descURL)
}

// FetchDeviceFromLocation parses an SSDP LOCATION URL (which points at the
// description XML) and fetches the device. The IP is taken from the URL.
func FetchDeviceFromLocation(ctx context.Context, location string) (*Device, error) {
	u, err := url.Parse(location)
	if err != nil {
		return nil, fmt.Errorf("parse LOCATION %q: %w", location, err)
	}
	host := u.Hostname()
	ip := net.ParseIP(host)
	if ip == nil {
		return nil, fmt.Errorf("LOCATION host %q is not an IP", host)
	}
	return fetchDeviceURL(ctx, ip, location)
}

func fetchDeviceURL(ctx context.Context, ip net.IP, descURL string) (*Device, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, descURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build request for %s: %w", descURL, err)
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("GET %s: %w", descURL, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: unexpected status %s", descURL, resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", descURL, err)
	}
	return parseDescription(ip, body)
}

func parseDescription(ip net.IP, body []byte) (*Device, error) {
	var root xmlRoot
	if err := xml.Unmarshal(body, &root); err != nil {
		return nil, fmt.Errorf("parse device description: %w", err)
	}
	if root.Device.UDN == "" {
		return nil, fmt.Errorf("device description for %s has no UDN", ip)
	}

	services := make(map[string]Service)
	collectServices(&root.Device, services)

	sw := root.Device.DisplayVersion
	if sw == "" {
		sw = root.Device.SoftwareVersion
	}

	return &Device{
		IP:              ip,
		UDN:             root.Device.UDN,
		FriendlyName:    root.Device.FriendlyName,
		ModelName:       root.Device.ModelName,
		ModelNumber:     root.Device.ModelNumber,
		SoftwareVersion: sw,
		RoomName:        root.Device.RoomName,
		Services:        services,
	}, nil
}
