import { describe, expect, it } from 'vitest';
import { buildEnvelope, extractResponseArg, instanceArg } from '../soap';
import {
  avTransport,
  renderingControl,
  parseTrackMetadata,
  parseStreamContent,
  setVolumeRequest,
  AV_TRANSPORT_TYPE,
  RENDERING_CONTROL_TYPE,
} from '../control';
import * as control from '../control';

// Ported from backend/internal/sonos/control_test.go. Same DIDL fixtures, same
// expectations, adapted to the fast-xml-parser engine. parseTagValue:false is
// load-bearing: it keeps a numeric title ("2112") as a string so .trim() never
// throws.

/**
 * Wraps a DIDL-Lite document the way a real speaker does: the metadata is
 * entity-escaped inside the <TrackMetaData> element. This exercises the
 * two-stage parse (extractResponseArg unescapes, parseTrackMetadata then
 * parses the result). Mirrors Go's xml.EscapeText.
 */
function escapeXMLText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;');
}

function buildPositionInfoResponse(didl: string, relTime: string, duration: string): string {
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:GetPositionInfoResponse xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">' +
    '<Track>1</Track>' +
    '<TrackDuration>' +
    duration +
    '</TrackDuration>' +
    '<TrackMetaData>' +
    escapeXMLText(didl) +
    '</TrackMetaData>' +
    '<RelTime>' +
    relTime +
    '</RelTime>' +
    '</u:GetPositionInfoResponse></s:Body></s:Envelope>'
  );
}

describe('two-stage now-playing', () => {
  it('unescapes TrackMetaData then parses title/artist/album', () => {
    const didl =
      '<DIDL-Lite ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
      'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" ' +
      'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
      '<item id="-1" parentID="-1" restricted="true">' +
      '<res>x-sonos-http:track.mp3</res>' +
      '<dc:title>Black Dog</dc:title>' +
      '<dc:creator>Led Zeppelin</dc:creator>' +
      '<upnp:album>Led Zeppelin IV</upnp:album>' +
      '<upnp:artist>Led Zeppelin</upnp:artist>' +
      '</item></DIDL-Lite>';

    const resp = buildPositionInfoResponse(didl, '0:01:23', '0:04:55');

    // Stage 1: the escaped metadata must come back as usable DIDL XML.
    const meta = extractResponseArg(resp, 'TrackMetaData');
    expect(meta).toContain('<dc:title>Black Dog</dc:title>');

    // Stage 2: parse it.
    const { title, artist, album } = parseTrackMetadata(meta);
    expect(title).toBe('Black Dog');
    expect(artist).toBe('Led Zeppelin');
    expect(album).toBe('Led Zeppelin IV');
  });
});

describe("numeric title '2112' stays string", () => {
  it('does not throw on .trim() and yields the string "2112"', () => {
    const didl =
      '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
      '<item><dc:title>2112</dc:title><upnp:artist>Rush</upnp:artist>' +
      '<upnp:album>2112</upnp:album></item></DIDL-Lite>';

    const { title, artist, album } = parseTrackMetadata(didl);
    expect(title).toBe('2112');
    expect(typeof title).toBe('string');
    expect(artist).toBe('Rush');
    expect(album).toBe('2112');
  });
});

describe('both radio fallbacks', () => {
  it('TYPE=SNG|TITLE..|ARTIST.. pulls live track over the station title', () => {
    const didl =
      '<DIDL-Lite ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" ' +
      'xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" ' +
      'xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">' +
      '<item id="-1" parentID="-1" restricted="true">' +
      '<dc:title></dc:title>' +
      '<r:streamContent>TYPE=SNG|TITLE Comfortably Numb|ARTIST Pink Floyd|ALBUM The Wall</r:streamContent>' +
      '</item></DIDL-Lite>';

    const { title, artist } = parseTrackMetadata(didl);
    expect(title).toBe('Comfortably Numb');
    expect(artist).toBe('Pink Floyd');
  });

  it('"Artist - Title" form', () => {
    const didl =
      '<DIDL-Lite xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">' +
      '<item><r:streamContent>Daft Punk - Around the World</r:streamContent></item></DIDL-Lite>';

    const { title, artist } = parseTrackMetadata(didl);
    expect(title).toBe('Around the World');
    expect(artist).toBe('Daft Punk');
  });

  it('parseStreamContent surfaces an unknown format as the raw title', () => {
    expect(parseStreamContent('just some text')).toEqual({
      title: 'just some text',
      artist: '',
    });
  });
});

describe('empty/garbage all-empty', () => {
  it('parseTrackMetadata("") -> all empty', () => {
    expect(parseTrackMetadata('')).toEqual({ title: '', artist: '', album: '' });
  });

  it('parseTrackMetadata("not xml") -> all empty (no throw)', () => {
    expect(parseTrackMetadata('not xml')).toEqual({ title: '', artist: '', album: '' });
  });

  it('whitespace-only -> all empty', () => {
    expect(parseTrackMetadata('   \n  ')).toEqual({ title: '', artist: '', album: '' });
  });
});

describe('SetAVTransportURI buildEnvelope empty-metadata element', () => {
  // Pure buildEnvelope assertion (ported from TestJoinEnvelopeIncludesEmptyMetadata).
  it('emits CurrentURI and an EMPTY (not self-closing) CurrentURIMetaData element', () => {
    const args = [
      instanceArg(),
      { name: 'CurrentURI', value: 'x-rincon:RINCON_AAAAAAAAAAAA01400' },
      { name: 'CurrentURIMetaData', value: '' },
    ];
    const env = buildEnvelope(AV_TRANSPORT_TYPE, 'SetAVTransportURI', args);

    expect(env).toContain('<CurrentURI>x-rincon:RINCON_AAAAAAAAAAAA01400</CurrentURI>');
    // The empty metadata element must be emitted (omitting it can trip UPnP 402).
    expect(env).toContain('<CurrentURIMetaData></CurrentURIMetaData>');
    expect(env).not.toContain('<CurrentURIMetaData/>');
  });
});

describe('service helpers + volume guard', () => {
  it('avTransport / renderingControl carry the hardcoded types + control URLs', () => {
    expect(avTransport()).toEqual({
      type: AV_TRANSPORT_TYPE,
      controlURL: '/MediaRenderer/AVTransport/Control',
    });
    expect(renderingControl()).toEqual({
      type: RENDERING_CONTROL_TYPE,
      controlURL: '/MediaRenderer/RenderingControl/Control',
    });
  });

  it('setVolumeRequest accepts in-range and routes to the player base', () => {
    const req = setVolumeRequest(25);
    expect(req.base).toBe('player');
    expect(req.service.type).toBe(RENDERING_CONTROL_TYPE);
    expect(req.args).toContainEqual({ name: 'DesiredVolume', value: '25' });
  });

  it('setVolumeRequest rejects out-of-range volume rather than clamping', () => {
    expect(() => setVolumeRequest(-1)).toThrow(/out of range/);
    expect(() => setVolumeRequest(101)).toThrow(/out of range/);
  });

  it('AVTransport requests target the coordinator, RenderingControl the player', () => {
    expect(control.playRequest().base).toBe('coordinator');
    expect(control.getPositionInfoRequest().base).toBe('coordinator');
    expect(control.getVolumeRequest().base).toBe('player');
  });
});

describe('grouping / seek / playmode symbols now present', () => {
  it('exports joinGroup / leaveGroup / setAVTransportURI / seek / playmode ops', () => {
    const mod = control as Record<string, unknown>;
    expect(typeof mod.joinGroup).toBe('function');
    expect(typeof mod.leaveGroup).toBe('function');
    expect(typeof mod.setAVTransportURI).toBe('function');
    expect(typeof mod.seek).toBe('function');
    expect(typeof mod.seekTrack).toBe('function');
    expect(typeof mod.getTransportSettings).toBe('function');
    expect(typeof mod.setPlayMode).toBe('function');
    expect(typeof mod.playModeToSettings).toBe('function');
    expect(typeof mod.settingsToPlayMode).toBe('function');
    expect(typeof mod.formatRelTime).toBe('function');
    expect(typeof mod.parseRelTime).toBe('function');
  });
});

describe('still-deferred symbols absent', () => {
  it('does not export ApplyVolumeArg / queue / browse helpers', () => {
    const mod = control as Record<string, unknown>;
    // Relative-volume clamping (ApplyVolumeArg) stays deferred.
    expect(mod.ApplyVolumeArg).toBeUndefined();
    expect(mod.applyVolumeArg).toBeUndefined();
    // Queue building / favorites / browse stay deferred.
    expect(mod.AddURIToQueue).toBeUndefined();
    expect(mod.addURIToQueue).toBeUndefined();
    expect(mod.PlayFromQueue).toBeUndefined();
    expect(mod.playFromQueue).toBeUndefined();
    expect(mod.PlayItem).toBeUndefined();
    expect(mod.playItem).toBeUndefined();
  });
});
