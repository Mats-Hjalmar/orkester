package sonos

import (
	"strings"
	"testing"
)

func TestBuildEnvelope(t *testing.T) {
	env := buildEnvelope(
		"urn:schemas-upnp-org:service:RenderingControl:1",
		"SetVolume",
		[]Arg{InstanceArg(), {Name: "Channel", Value: "Master"}, {Name: "DesiredVolume", Value: "25"}},
	)

	checks := []string{
		`<u:SetVolume xmlns:u="urn:schemas-upnp-org:service:RenderingControl:1">`,
		`<InstanceID>0</InstanceID>`,
		`<Channel>Master</Channel>`,
		`<DesiredVolume>25</DesiredVolume>`,
		`</u:SetVolume>`,
	}
	for _, c := range checks {
		if !strings.Contains(env, c) {
			t.Errorf("envelope missing %q\nenvelope: %s", c, env)
		}
	}
	// InstanceID must precede the other args.
	if strings.Index(env, "InstanceID") > strings.Index(env, "DesiredVolume") {
		t.Error("InstanceID should come first")
	}
}

func TestBuildEnvelopeEscapesValues(t *testing.T) {
	// DIDL metadata is passed as an arg value and contains XML that must be
	// escaped so it doesn't break the envelope.
	env := buildEnvelope(
		"urn:schemas-upnp-org:service:AVTransport:1",
		"SetAVTransportURI",
		[]Arg{InstanceArg(), {Name: "CurrentURIMetaData", Value: `<DIDL-Lite a="b">x</DIDL-Lite>`}},
	)
	if strings.Contains(env, "<DIDL-Lite") {
		t.Errorf("metadata not escaped:\n%s", env)
	}
	if !strings.Contains(env, "&lt;DIDL-Lite") {
		t.Errorf("expected escaped metadata, got:\n%s", env)
	}
}

const sampleFault = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <s:Fault>
      <faultcode>s:Client</faultcode>
      <faultstring>UPnPError</faultstring>
      <detail>
        <UPnPError xmlns="urn:schemas-upnp-org:control-1-0">
          <errorCode>714</errorCode>
          <errorDescription>Illegal MIME-Type</errorDescription>
        </UPnPError>
      </detail>
    </s:Fault>
  </s:Body>
</s:Envelope>`

func TestParseFault(t *testing.T) {
	f := parseFault([]byte(sampleFault))
	if f == nil {
		t.Fatal("expected a fault, got nil")
	}
	if f.UPnPError != 714 {
		t.Errorf("UPnPError = %d, want 714", f.UPnPError)
	}
	if f.ErrorDesc != "Illegal MIME-Type" {
		t.Errorf("ErrorDesc = %q", f.ErrorDesc)
	}
	if !strings.Contains(f.Error(), "714") {
		t.Errorf("Error() = %q, want it to mention 714", f.Error())
	}
}

func TestParseFaultOnNonFault(t *testing.T) {
	if f := parseFault([]byte(`<ok/>`)); f != nil {
		t.Errorf("expected nil for non-fault body, got %v", f)
	}
}

const sampleZGSResponse = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <u:GetZoneGroupStateResponse xmlns:u="urn:schemas-upnp-org:service:ZoneGroupTopology:1">
      <ZoneGroupState>&lt;ZoneGroupState&gt;&lt;ZoneGroups&gt;&lt;ZoneGroup Coordinator="RINCON_A01400" ID="x"&gt;&lt;ZoneGroupMember UUID="RINCON_A01400" ZoneName="Den" Location="http://192.168.1.5:1400/xml/device_description.xml"/&gt;&lt;/ZoneGroup&gt;&lt;/ZoneGroups&gt;&lt;/ZoneGroupState&gt;</ZoneGroupState>
    </u:GetZoneGroupStateResponse>
  </s:Body>
</s:Envelope>`

func TestExtractResponseArgUnescapes(t *testing.T) {
	// extractResponseArg must return the inner state XML with entities
	// decoded, so it can be re-parsed as XML by parseZoneGroupState.
	state, err := extractResponseArg([]byte(sampleZGSResponse), "ZoneGroupState")
	if err != nil {
		t.Fatalf("extractResponseArg: %v", err)
	}
	if !strings.HasPrefix(strings.TrimSpace(state), "<ZoneGroupState>") {
		t.Fatalf("expected unescaped XML, got: %q", state)
	}

	hh, err := parseZoneGroupState(state)
	if err != nil {
		t.Fatalf("parseZoneGroupState on extracted state: %v", err)
	}
	if len(hh.Groups) != 1 || hh.Groups[0].Name() != "Den" {
		t.Errorf("round-trip parse failed: %+v", hh.Groups)
	}
}

func TestExtractResponseArgMissing(t *testing.T) {
	_, err := extractResponseArg([]byte(sampleZGSResponse), "NoSuchElement")
	if err == nil {
		t.Error("expected error for missing element")
	}
}
