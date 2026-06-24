package sonos

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ssdpMulticast is the standard SSDP multicast endpoint.
var ssdpMulticast = &net.UDPAddr{IP: net.IPv4(239, 255, 255, 250), Port: 1900}

// zonePlayerST is the Sonos-specific UPnP device type used as the SSDP search
// target so we only match ZonePlayers, not every UPnP device on the LAN.
const zonePlayerST = "urn:schemas-upnp-org:device:ZonePlayer:1"

// SSDPResult is a single SSDP M-SEARCH response from a ZonePlayer.
type SSDPResult struct {
	Location string // URL of device_description.xml
	IP       net.IP
	USN      string // unique service name (contains the RINCON UDN)
}

// Discover broadcasts an SSDP M-SEARCH for Sonos ZonePlayers and collects
// replies for the given duration. It sends out of every multicast-capable
// IPv4 interface (so multi-homed hosts reach the right subnet) and dedupes by
// location. An empty result with no error means no speakers answered — the
// caller should treat that as "none found / UPnP may be disabled", not as a
// silent success.
func Discover(ctx context.Context, wait time.Duration) ([]SSDPResult, error) {
	if wait <= 0 {
		wait = 3 * time.Second
	}
	deadline := time.Now().Add(wait)
	probe := searchProbe(wait)

	conns, err := multicastSockets()
	if err != nil {
		return nil, err
	}
	if len(conns) == 0 {
		return nil, fmt.Errorf("no multicast-capable IPv4 interfaces found")
	}

	var (
		mu      sync.Mutex
		seen    = map[string]struct{}{}
		results []SSDPResult
		wg      sync.WaitGroup
	)

	for _, c := range conns {
		wg.Add(1)
		go func(conn *net.UDPConn) {
			defer wg.Done()
			defer conn.Close()

			// Send a few probes — UDP is lossy and speakers may miss one.
			for range 3 {
				if _, err := conn.WriteToUDP(probe, ssdpMulticast); err != nil {
					return
				}
				time.Sleep(50 * time.Millisecond)
			}

			buf := make([]byte, 2048)
			for {
				if ctx.Err() != nil {
					return
				}
				conn.SetReadDeadline(deadline)
				n, _, err := conn.ReadFromUDP(buf)
				if err != nil {
					return // deadline or closed
				}
				res, ok := parseSSDPResponse(buf[:n])
				if !ok {
					continue
				}
				mu.Lock()
				if _, dup := seen[res.Location]; !dup {
					seen[res.Location] = struct{}{}
					results = append(results, res)
				}
				mu.Unlock()
			}
		}(c)
	}
	wg.Wait()
	return results, nil
}

// DiscoverOne broadcasts an SSDP M-SEARCH and returns as soon as the first
// ZonePlayer answers, then returns without waiting out the full window. Any
// single ZonePlayer reports the entire household via GetZoneGroupState, so one
// responder is enough to bootstrap every command — this keeps each CLI
// invocation snappy.
//
// The returned speaker is only a topology entry point: the first UDP responder
// is nondeterministic and may be a bonded/satellite player, so callers MUST
// re-resolve actual control targets from the topology and never treat this IP as
// the speaker they want. An error (not an empty result) is returned when nobody
// answers, so callers can't mistake silence for success.
func DiscoverOne(ctx context.Context, wait time.Duration) (SSDPResult, error) {
	if wait <= 0 {
		wait = 3 * time.Second
	}
	deadline := time.Now().Add(wait)
	probe := searchProbe(wait)

	conns, err := multicastSockets()
	if err != nil {
		return SSDPResult{}, err
	}
	if len(conns) == 0 {
		return SSDPResult{}, fmt.Errorf("no multicast-capable IPv4 interfaces found")
	}

	found := make(chan SSDPResult, len(conns))
	var wg sync.WaitGroup
	for _, c := range conns {
		wg.Add(1)
		go func(conn *net.UDPConn) {
			defer wg.Done()
			defer conn.Close()

			for range 3 {
				if _, err := conn.WriteToUDP(probe, ssdpMulticast); err != nil {
					return
				}
				time.Sleep(50 * time.Millisecond)
			}

			buf := make([]byte, 2048)
			for {
				if ctx.Err() != nil {
					return
				}
				conn.SetReadDeadline(deadline)
				n, _, err := conn.ReadFromUDP(buf)
				if err != nil {
					return // deadline or closed
				}
				if res, ok := parseSSDPResponse(buf[:n]); ok {
					found <- res // buffered; never blocks
					return
				}
			}
		}(c)
	}

	// Close found once every socket goroutine is done so a no-responder run
	// yields a closed channel rather than hanging until ctx expires.
	go func() {
		wg.Wait()
		close(found)
	}()

	select {
	case res, ok := <-found:
		if !ok {
			return SSDPResult{}, fmt.Errorf("no Sonos speakers answered SSDP")
		}
		return res, nil
	case <-ctx.Done():
		return SSDPResult{}, ctx.Err()
	}
}

// searchProbe builds the SSDP M-SEARCH datagram for ZonePlayers. MX (max wait
// the responder may randomize before replying) is scaled to the listen window.
func searchProbe(wait time.Duration) []byte {
	mx := max(int(wait.Seconds()), 1)
	return []byte("M-SEARCH * HTTP/1.1\r\n" +
		"HOST: 239.255.255.250:1900\r\n" +
		"MAN: \"ssdp:discover\"\r\n" +
		fmt.Sprintf("MX: %d\r\n", mx) +
		"ST: " + zonePlayerST + "\r\n\r\n")
}

// multicastSockets opens one UDP4 socket bound to each up, multicast-capable,
// non-loopback interface address. Binding to the interface IP routes the
// probe out that interface, which matters on multi-homed hosts.
func multicastSockets() ([]*net.UDPConn, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, fmt.Errorf("list interfaces: %w", err)
	}
	var conns []*net.UDPConn
	for _, ifi := range ifaces {
		if ifi.Flags&net.FlagUp == 0 || ifi.Flags&net.FlagMulticast == 0 || ifi.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := ifi.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ipnet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip4 := ipnet.IP.To4()
			if ip4 == nil {
				continue
			}
			conn, err := net.ListenUDP("udp4", &net.UDPAddr{IP: ip4, Port: 0})
			if err != nil {
				continue
			}
			conns = append(conns, conn)
		}
	}
	return conns, nil
}

func parseSSDPResponse(b []byte) (SSDPResult, bool) {
	resp, err := http.ReadResponse(bufio.NewReader(bytes.NewReader(b)), nil)
	if err != nil {
		return SSDPResult{}, false
	}
	resp.Body.Close()

	st := resp.Header.Get("ST")
	loc := resp.Header.Get("LOCATION")
	if loc == "" {
		return SSDPResult{}, false
	}
	// Only accept ZonePlayer responses; some speakers also answer for other
	// embedded device/service types we don't care about here.
	if st != "" && !strings.Contains(st, "ZonePlayer") {
		return SSDPResult{}, false
	}

	res := SSDPResult{Location: loc, USN: resp.Header.Get("USN")}
	if u, err := parseHost(loc); err == nil {
		res.IP = u
	}
	return res, true
}

func parseHost(location string) (net.IP, error) {
	// LOCATION is http://{ip}:1400/xml/device_description.xml
	const scheme = "http://"
	s := strings.TrimPrefix(location, scheme)
	if i := strings.IndexByte(s, ':'); i >= 0 {
		s = s[:i]
	} else if i := strings.IndexByte(s, '/'); i >= 0 {
		s = s[:i]
	}
	ip := net.ParseIP(s)
	if ip == nil {
		return nil, fmt.Errorf("no IP in location %q", location)
	}
	return ip, nil
}
