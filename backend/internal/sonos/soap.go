package sonos

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// soapTimeout bounds a single SOAP round-trip to a speaker.
const soapTimeout = 10 * time.Second

// Fault is a parsed UPnP SOAP fault. Sonos returns these for invalid
// arguments, wrong coordinator, bad metadata, etc. We surface them as Go
// errors rather than swallowing them.
type Fault struct {
	FaultCode   string
	FaultString string
	UPnPError   int    // numeric UPnPError/errorCode, e.g. 714, 800
	ErrorDesc   string // errorDescription if present
}

func (f *Fault) Error() string {
	if f.UPnPError != 0 {
		return fmt.Sprintf("UPnP fault %d (%s): %s", f.UPnPError, f.ErrorDesc, f.FaultString)
	}
	return fmt.Sprintf("SOAP fault %s: %s", f.FaultCode, f.FaultString)
}

// SOAPCall performs a single SOAP action against a service on a device and
// returns the raw response body (the SOAP envelope) for the caller to parse.
//
// svc is the target service (control URL + type). action is the bare action
// name (e.g. "GetZoneGroupState"). args are the action's child elements in
// order; nearly every Sonos action begins with InstanceID=0.
func SOAPCall(ctx context.Context, base string, svc Service, action string, args []Arg) ([]byte, error) {
	body := buildEnvelope(svc.Type, action, args)
	url := base + svc.ControlURL
	soapAction := fmt.Sprintf("\"%s#%s\"", svc.Type, action)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build SOAP request %s: %w", action, err)
	}
	req.Header.Set("Content-Type", `text/xml; charset="utf-8"`)
	req.Header.Set("SOAPACTION", soapAction)

	client := &http.Client{Timeout: soapTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("SOAP %s -> %s: %w", action, url, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, fmt.Errorf("read SOAP response for %s: %w", action, err)
	}

	if resp.StatusCode != http.StatusOK {
		// A 500 carries a SOAP fault body; parse it so the caller sees the
		// real UPnP error code instead of a bare HTTP status.
		if f := parseFault(respBody); f != nil {
			return nil, fmt.Errorf("SOAP %s: %w", action, f)
		}
		return nil, fmt.Errorf("SOAP %s: HTTP %s: %s", action, resp.Status, truncate(respBody, 300))
	}
	return respBody, nil
}

// Arg is a single SOAP action argument (an XML child element with text value).
type Arg struct {
	Name  string
	Value string
}

// InstanceArg is the InstanceID=0 argument that begins almost every Sonos
// AVTransport/RenderingControl action.
func InstanceArg() Arg { return Arg{Name: "InstanceID", Value: "0"} }

func buildEnvelope(serviceType, action string, args []Arg) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="utf-8"?>`)
	b.WriteString(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">`)
	b.WriteString(`<s:Body>`)
	fmt.Fprintf(&b, `<u:%s xmlns:u="%s">`, action, serviceType)
	for _, a := range args {
		fmt.Fprintf(&b, `<%s>`, a.Name)
		xml.EscapeText(&b, []byte(a.Value))
		fmt.Fprintf(&b, `</%s>`, a.Name)
	}
	fmt.Fprintf(&b, `</u:%s>`, action)
	b.WriteString(`</s:Body></s:Envelope>`)
	return b.String()
}

// --- response/fault parsing helpers ---

type soapFaultEnvelope struct {
	XMLName xml.Name `xml:"Envelope"`
	Body    struct {
		Fault struct {
			FaultCode   string `xml:"faultcode"`
			FaultString string `xml:"faultstring"`
			Detail      struct {
				// Sonos nests UPnPError in the fault detail.
				UPnPError struct {
					ErrorCode int    `xml:"errorCode"`
					ErrorDesc string `xml:"errorDescription"`
				} `xml:"UPnPError"`
			} `xml:"detail"`
		} `xml:"Fault"`
	} `xml:"Body"`
}

func parseFault(body []byte) *Fault {
	var env soapFaultEnvelope
	if err := xml.Unmarshal(body, &env); err != nil {
		return nil
	}
	fc := env.Body.Fault.FaultCode
	if fc == "" && env.Body.Fault.Detail.UPnPError.ErrorCode == 0 {
		return nil
	}
	return &Fault{
		FaultCode:   fc,
		FaultString: env.Body.Fault.FaultString,
		UPnPError:   env.Body.Fault.Detail.UPnPError.ErrorCode,
		ErrorDesc:   env.Body.Fault.Detail.UPnPError.ErrorDesc,
	}
}

// extractResponseArg pulls a single named output element's text from a SOAP
// response envelope. UPnP responses wrap outputs in a <u:{Action}Response>
// element; we walk the token stream and return the first element matching
// name. Returns an error if not found.
func extractResponseArg(body []byte, name string) (string, error) {
	dec := xml.NewDecoder(bytes.NewReader(body))
	for {
		tok, err := dec.Token()
		if err == io.EOF {
			return "", fmt.Errorf("response element %q not found", name)
		}
		if err != nil {
			return "", fmt.Errorf("decode SOAP response: %w", err)
		}
		if se, ok := tok.(xml.StartElement); ok && se.Name.Local == name {
			var val string
			if err := dec.DecodeElement(&val, &se); err != nil {
				return "", fmt.Errorf("decode element %q: %w", name, err)
			}
			return val, nil
		}
	}
}

func truncate(b []byte, n int) string {
	if len(b) <= n {
		return string(b)
	}
	return string(b[:n]) + "..."
}
