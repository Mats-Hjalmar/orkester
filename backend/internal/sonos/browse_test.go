package sonos

import (
	"encoding/xml"
	"strings"
	"testing"
)

// parseBrowse mirrors what Browse does after extractResponseArg: unmarshal the
// (already SOAP-unescaped) DIDL-Lite Result and flatten it to BrowseItems.
func parseBrowse(t *testing.T, didl string) []BrowseItem {
	t.Helper()
	var d didlLite
	if err := xml.Unmarshal([]byte(strings.TrimSpace(didl)), &d); err != nil {
		t.Fatalf("unmarshal DIDL: %v", err)
	}
	return d.browseItems()
}

// A FV:2 favorites Result: favorites are <item> entries whose playable target +
// metadata live in <res> and <r:resMD>. The resMD content is entity-escaped in
// the document and must come back unescaped (it becomes EnqueuedURIMetaData).
const favoritesDIDL = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <item id="FV:2/22" parentID="FV:2" restricted="false">
    <dc:title>Morning Jazz</dc:title>
    <upnp:class>object.itemobject.item.sonos-favorite</upnp:class>
    <r:ordinal>0</r:ordinal>
    <res protocolInfo="x-rincon-cpcontainer:*:*:*">x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9</res>
    <r:resMD>&lt;DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"&gt;&lt;item id="1006206cspotify%3aplaylist%3a37i9" parentID="0" restricted="true"&gt;&lt;dc:title&gt;Morning Jazz&lt;/dc:title&gt;&lt;upnp:class&gt;object.container.playlistContainer&lt;/upnp:class&gt;&lt;desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/"&gt;SA_RINCON3079_X_#Svc3079-0-Token&lt;/desc&gt;&lt;/item&gt;&lt;/DIDL-Lite&gt;</r:resMD>
  </item>
  <item id="FV:2/4" parentID="FV:2" restricted="false">
    <dc:title>P3 Radio</dc:title>
    <upnp:class>object.item.audioItem.audioBroadcast</upnp:class>
    <res protocolInfo="x-sonosapi-stream:*:*:*">x-sonosapi-stream:s12345?sid=254</res>
  </item>
</DIDL-Lite>`

// An SQ: saved-playlists Result: each playlist is a <container> with no resMD.
const playlistsDIDL = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
  <container id="SQ:0" parentID="SQ:" restricted="true">
    <dc:title>Party Mix</dc:title>
    <upnp:class>object.container.playlistContainer</upnp:class>
    <res protocolInfo="file:*:audio/mpegurl:*">file:///jffs/settings/savedqueues.rsq#0</res>
  </container>
</DIDL-Lite>`

func TestBrowseFavorites(t *testing.T) {
	items := parseBrowse(t, favoritesDIDL)
	if len(items) != 2 {
		t.Fatalf("got %d items, want 2", len(items))
	}

	jazz := items[0]
	if jazz.Title != "Morning Jazz" {
		t.Errorf("title = %q, want Morning Jazz", jazz.Title)
	}
	if jazz.IsContainer {
		t.Error("favorite <item> should not be flagged IsContainer")
	}
	if !strings.HasPrefix(jazz.URI, "x-rincon-cpcontainer:") {
		t.Errorf("URI = %q, want x-rincon-cpcontainer prefix", jazz.URI)
	}
	// resMD must arrive unescaped and usable as enqueue metadata.
	if !strings.Contains(jazz.Metadata, "<DIDL-Lite") || !strings.Contains(jazz.Metadata, `<desc id="cdudn"`) {
		t.Errorf("metadata not unescaped DIDL:\n%s", jazz.Metadata)
	}

	radio := items[1]
	if radio.Title != "P3 Radio" || !strings.HasPrefix(radio.URI, "x-sonosapi-stream:") {
		t.Errorf("radio favorite parsed wrong: %+v", radio)
	}
}

func TestBrowsePlaylistsContainer(t *testing.T) {
	items := parseBrowse(t, playlistsDIDL)
	if len(items) != 1 {
		t.Fatalf("got %d items, want 1", len(items))
	}
	c := items[0]
	if !c.IsContainer {
		t.Error("saved playlist <container> should be flagged IsContainer")
	}
	if c.Title != "Party Mix" {
		t.Errorf("title = %q, want Party Mix", c.Title)
	}
	if c.URI != "file:///jffs/settings/savedqueues.rsq#0" {
		t.Errorf("URI = %q", c.URI)
	}
	if c.Metadata != "" {
		t.Errorf("container without resMD should have empty metadata, got %q", c.Metadata)
	}
}
