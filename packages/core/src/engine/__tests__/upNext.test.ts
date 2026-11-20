import { describe, expect, it } from 'vitest';
import { parsePropertySet } from '@orkester/sonos-api';
import { escapeXMLText } from '../soap';
import { upNextFromLastChange } from '../control';

// Fixture rebuilt from a real Spotify Connect AVTransport NOTIFY (2026-11-20):
// the DIDL is escaped into the r:NextTrackMetaData attribute, and the whole
// LastChange document is escaped again into the propertyset.

const NEXT_DIDL =
  '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
  '<item id="-1" parentID="-1"><res></res><upnp:class>object.item.audioItem.musicTrack</upnp:class>' +
  '<dc:title>All Love Can Be</dc:title><dc:creator>James Horner</dc:creator>' +
  '<upnp:album>A Beautiful Mind (Original Motion Picture Soundtrack)</upnp:album></item></DIDL-Lite>';

function lastChange(nextVars: string): string {
  return (
    '<Event xmlns="urn:schemas-upnp-org:metadata-1-0/AVT/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">' +
    '<InstanceID val="0"><TransportState val="PAUSED_PLAYBACK"/>' +
    '<AVTransportURI val="x-sonos-vli:RINCON_AAAA01400:2,spotify:e934941535d7b182815bf99a1fd9c6be"/>' +
    `${nextVars}</InstanceID></Event>`
  );
}

function notifyBody(lastChangeXml: string): string {
  return (
    '<e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0"><e:property>' +
    `<LastChange>${escapeXMLText(lastChangeXml)}</LastChange>` +
    '</e:property></e:propertyset>'
  );
}

describe('upNextFromLastChange', () => {
  it('reads the next track from a double-escaped NOTIFY', () => {
    const body = notifyBody(
      lastChange(`<r:NextTrackURI val=""/><r:NextTrackMetaData val="${escapeXMLText(NEXT_DIDL)}"/>`),
    );
    expect(upNextFromLastChange(parsePropertySet(body).LastChange)).toEqual({
      title: 'All Love Can Be',
      artist: 'James Horner',
      album: 'A Beautiful Mind (Original Motion Picture Soundtrack)',
    });
  });

  it('is null when the next-track metadata is empty', () => {
    expect(upNextFromLastChange(lastChange('<r:NextTrackURI val=""/><r:NextTrackMetaData val=""/>'))).toBeNull();
  });

  it('is null when the next-track metadata is absent', () => {
    expect(upNextFromLastChange(lastChange(''))).toBeNull();
  });

  it('is null when the next track has no title', () => {
    const untitled = NEXT_DIDL.replace('<dc:title>All Love Can Be</dc:title>', '');
    expect(upNextFromLastChange(lastChange(`<r:NextTrackMetaData val="${escapeXMLText(untitled)}"/>`))).toBeNull();
  });

  it('throws on a document that is not a LastChange event', () => {
    expect(() => upNextFromLastChange('<NotAnEvent/>')).toThrow();
  });
});
