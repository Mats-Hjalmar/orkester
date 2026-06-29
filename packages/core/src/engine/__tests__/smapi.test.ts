import { describe, expect, it } from 'vitest';
import {
  buildSMAPIEnvelope,
  parseSMAPIFault,
  parseSearchResult,
  spotifyEnqueueItem,
  encodeServiceId,
  type SMAPIItem,
} from '../smapi';
import { DIRECT_STREAM_SCHEMES } from '../control';

const SID = 9;
const SEED = 9 * 256 + 7; // 2311
const SN = '1';

const searchResponseXML = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
  <s:Body>
    <searchResponse xmlns="http://www.sonos.com/Services/1.1">
      <searchResult>
        <index>0</index>
        <count>2</count>
        <total>57</total>
        <mediaMetadata>
          <id>spotify:track:6rqhFgbbKwnb9MLmUQDhG6</id>
          <itemType>track</itemType>
          <title>So What</title>
          <mimeType>audio/x-spotify</mimeType>
          <trackMetadata>
            <artist>Miles Davis</artist>
            <album>Kind of Blue</album>
            <albumArtURI>https://i.scdn.co/image/track-art</albumArtURI>
          </trackMetadata>
        </mediaMetadata>
        <mediaCollection>
          <id>spotify:album:1weenld61qoidwYuZ1GESA</id>
          <itemType>album</itemType>
          <title>Kind of Blue</title>
          <artist>Miles Davis</artist>
          <albumArtURI>https://i.scdn.co/image/album-art</albumArtURI>
        </mediaCollection>
      </searchResult>
    </searchResponse>
  </s:Body>
</s:Envelope>`;

describe('parseSearchResult', () => {
  it('flattens mediaMetadata (tracks) and mediaCollection (containers)', () => {
    const items = parseSearchResult(searchResponseXML);
    expect(items).toHaveLength(2);

    const track = items[0];
    expect(track).toMatchObject({
      id: 'spotify:track:6rqhFgbbKwnb9MLmUQDhG6',
      itemType: 'track',
      title: 'So What',
      artist: 'Miles Davis',
      album: 'Kind of Blue',
      artUrl: 'https://i.scdn.co/image/track-art', // nested under trackMetadata
      isContainer: false,
    });

    const album = items[1];
    expect(album).toMatchObject({
      itemType: 'album',
      artist: 'Miles Davis',
      artUrl: 'https://i.scdn.co/image/album-art', // direct on mediaCollection
      isContainer: true,
    });
  });
});

describe('buildSMAPIEnvelope', () => {
  it('omits loginToken for unauthenticated link calls', () => {
    const env = buildSMAPIEnvelope(null, '<getAppLink/>');
    expect(env).not.toContain('<loginToken>');
    expect(env).toContain('<deviceProvider>Sonos</deviceProvider>');
  });

  it('includes the loginToken for authenticated calls', () => {
    const env = buildSMAPIEnvelope(
      { authToken: 'tok', privateKey: 'key', householdId: 'Sonos_hh' },
      '<search/>',
    );
    expect(env).toContain('<token>tok</token>');
    expect(env).toContain('<key>key</key>');
    expect(env).toContain('<householdId>Sonos_hh</householdId>');
  });
});

describe('parseSMAPIFault', () => {
  it('detects NOT_LINKED_RETRY', () => {
    const body =
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
      '<s:Fault><faultcode>s:Client.NOT_LINKED_RETRY</faultcode><faultstring>NOT_LINKED_RETRY</faultstring></s:Fault>' +
      '</s:Body></s:Envelope>';
    const fault = parseSMAPIFault(body);
    expect(fault).not.toBeNull();
    expect(fault!.isRetry()).toBe(true);
    expect(fault!.isFailure()).toBe(false);
  });

  it('returns null for a non-fault body', () => {
    expect(parseSMAPIFault('<ok/>')).toBeNull();
  });
});

describe('spotifyEnqueueItem', () => {
  const track: SMAPIItem = {
    id: 'spotify:track:abc',
    itemType: 'track',
    title: 'So What',
    artist: 'Miles Davis',
    album: 'Kind of Blue',
    artUrl: '',
    isContainer: false,
  };

  it('encodes the service id with %3a', () => {
    expect(encodeServiceId('spotify:track:abc')).toBe('spotify%3atrack%3aabc');
  });

  it('builds the track URI + resMD and does not classify it as a direct stream', () => {
    const e = spotifyEnqueueItem(track, SID, SEED, SN);
    expect(e.uri).toBe('x-sonos-spotify:spotify%3atrack%3aabc?sid=9&flags=8224&sn=1');
    expect(DIRECT_STREAM_SCHEMES.some((s) => e.uri.startsWith(s))).toBe(false);
    expect(e.metadata).toContain('<item id="00032020spotify%3atrack%3aabc" parentID="0" restricted="true">');
    expect(e.metadata).toContain('<upnp:class>object.item.audioItem.musicTrack</upnp:class>');
    expect(e.metadata).toContain(
      '<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON2311_X_#Svc2311-1-Token</desc>',
    );
  });

  it('builds a cpcontainer URI for a playlist', () => {
    const e = spotifyEnqueueItem(
      { id: 'spotify:playlist:37i9', itemType: 'playlist', title: 'Jazz', artist: '', album: '', artUrl: '', isContainer: true },
      SID,
      SEED,
      SN,
    );
    expect(e.uri).toBe('x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a37i9');
    expect(e.metadata).toContain('<upnp:class>object.container.playlistContainer</upnp:class>');
  });

  it('throws for an unsupported item type', () => {
    expect(() =>
      spotifyEnqueueItem(
        { id: 'spotify:show:x', itemType: 'show', title: 'Pod', artist: '', album: '', artUrl: '', isContainer: false },
        SID,
        SEED,
        SN,
      ),
    ).toThrow(/unsupported/);
  });
});
