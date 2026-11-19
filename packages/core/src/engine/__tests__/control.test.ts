import { describe, expect, it } from 'vitest';
import { buildEnvelope, extractResponseArg, instanceArg } from '../soap';
import {
  avTransport,
  renderingControl,
  parseTrackMetadata,
  parseQueueItems,
  parseStreamContent,
  resolveAlbumArt,
  clearQueueRequest,
  reorderQueueRequest,
  planQueueMove,
  planQueueRemoval,
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

describe('album art', () => {
  it('parseTrackMetadata extracts the raw upnp:albumArtURI', () => {
    const didl =
      '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
      '<item><dc:title>Black Dog</dc:title><upnp:artist>Led Zeppelin</upnp:artist>' +
      '<upnp:albumArtURI>/getaa?s=1&amp;u=x-sonos-spotify%3atrack</upnp:albumArtURI>' +
      '</item></DIDL-Lite>';
    expect(parseTrackMetadata(didl).albumArt).toBe('/getaa?s=1&u=x-sonos-spotify%3atrack');
  });

  it('resolveAlbumArt prefixes a relative path with the coordinator base', () => {
    expect(resolveAlbumArt('http://192.168.1.10:1400', '/getaa?s=1&u=x')).toBe(
      'http://192.168.1.10:1400/getaa?s=1&u=x',
    );
    // trailing slash on the base is collapsed, missing leading slash is added
    expect(resolveAlbumArt('http://192.168.1.10:1400/', 'getaa?u=y')).toBe(
      'http://192.168.1.10:1400/getaa?u=y',
    );
  });

  it('resolveAlbumArt passes an absolute http(s) URL through unchanged, "" stays ""', () => {
    expect(resolveAlbumArt('http://192.168.1.10:1400', 'https://logo.cdn/x.png')).toBe('https://logo.cdn/x.png');
    expect(resolveAlbumArt('http://192.168.1.10:1400', '')).toBe('');
  });
});

describe('parseQueueItems', () => {
  it('parses every <item> in a Browse Result, in order, with creator fallback', () => {
    const didl =
      '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
      '<item><dc:title>Track One</dc:title><dc:creator>Artist A</dc:creator><upnp:album>Album A</upnp:album>' +
      '<upnp:albumArtURI>/getaa?u=a</upnp:albumArtURI></item>' +
      '<item><dc:title>Track Two</dc:title><upnp:artist>Artist B</upnp:artist></item>' +
      '</DIDL-Lite>';
    const items = parseQueueItems(didl);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ title: 'Track One', artist: 'Artist A', album: 'Album A', albumArt: '/getaa?u=a' });
    expect(items[1].title).toBe('Track Two');
    expect(items[1].artist).toBe('Artist B'); // upnp:artist
  });

  it('empty / unparseable input returns [] (no throw)', () => {
    expect(parseQueueItems('')).toEqual([]);
    expect(parseQueueItems('not xml')).toEqual([]);
  });

  it('parses a large, heavily-escaped queue past the default entity-expansion cap', () => {
    // A real queue trips fast-xml-parser's default 1000-entity guard: each
    // albumArtURI carries several &amp; and there are many items. Build 300
    // items (~5 entities each ≈ 1500 expansions) and assert it parses.
    const items = Array.from({ length: 300 }, (_, i) =>
      `<item><dc:title>Track ${i}</dc:title><upnp:artist>Artist ${i}</upnp:artist>` +
      `<upnp:albumArtURI>/getaa?s=1&amp;u=x&amp;sid=9&amp;flags=8224&amp;sn=1</upnp:albumArtURI></item>`,
    ).join('');
    const didl =
      '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' + items + '</DIDL-Lite>';
    const parsed = parseQueueItems(didl);
    expect(parsed).toHaveLength(300);
    expect(parsed[0].albumArt).toBe('/getaa?s=1&u=x&sid=9&flags=8224&sn=1');
  });
});

describe('queue editing requests', () => {
  const argMap = (req: ReturnType<typeof reorderQueueRequest>) =>
    Object.fromEntries(req.args.map((a) => [a.name, a.value]));

  it('clearQueueRequest is RemoveAllTracksFromQueue on the coordinator', () => {
    const req = clearQueueRequest();
    expect(req.action).toBe('RemoveAllTracksFromQueue');
    expect(req.base).toBe('coordinator');
    expect(req.service.controlURL).toBe('/MediaRenderer/AVTransport/Control');
    expect(argMap(req)).toEqual({ InstanceID: '0' });
  });

  it('reorder moving DOWN (0->2) → StartingIndex 1, InsertBefore 4 (1-based, original numbering)', () => {
    const m = argMap(reorderQueueRequest(0, 2));
    expect(m).toEqual({ InstanceID: '0', StartingIndex: '1', NumberOfTracks: '1', InsertBefore: '4', UpdateID: '0' });
  });

  it('reorder moving UP (3->1) → StartingIndex 4, InsertBefore 2', () => {
    const m = argMap(reorderQueueRequest(3, 1));
    expect(m.StartingIndex).toBe('4');
    expect(m.InsertBefore).toBe('2');
  });

  it('reorderQueueRequest rejects negative indices (no silent bad request)', () => {
    expect(() => reorderQueueRequest(-1, 0)).toThrow();
  });

  it('reorder of a 3-track run DOWN (1->4) → InsertBefore counts the run in original numbering', () => {
    const m = argMap(reorderQueueRequest(1, 4, 3));
    expect(m).toEqual({ InstanceID: '0', StartingIndex: '2', NumberOfTracks: '3', InsertBefore: '8', UpdateID: '0' });
  });

  it('reorder of a 2-track run UP (5->1) → StartingIndex 6, InsertBefore 2', () => {
    const m = argMap(reorderQueueRequest(5, 1, 2));
    expect(m).toMatchObject({ StartingIndex: '6', NumberOfTracks: '2', InsertBefore: '2' });
  });

  it('reorderQueueRequest rejects a non-positive track count', () => {
    expect(() => reorderQueueRequest(0, 2, 0)).toThrow();
  });
});

/**
 * Applies a ReorderTracksInQueue request to a plain array the way Sonos does:
 * take NumberOfTracks from 1-based StartingIndex and put them before the track
 * that was at 1-based InsertBefore BEFORE the move (or at the end).
 */
function applySonosReorder<T>(queue: T[], args: Record<string, string>): T[] {
  const start = Number(args.StartingIndex) - 1;
  const count = Number(args.NumberOfTracks);
  const before = Number(args.InsertBefore) - 1;
  expect(start + count).toBeLessThanOrEqual(queue.length);
  expect(before < start || before >= start + count).toBe(true);
  const run = queue.slice(start, start + count);
  const rest = [...queue.slice(0, start), ...queue.slice(start + count)];
  const at = before === queue.length ? rest.length : rest.indexOf(queue[before]);
  return [...rest.slice(0, at), ...run, ...rest.slice(at)];
}

/** Runs a planned move through the request builder against a 0..n-1 queue. */
function simulateMove(indices: number[], toIndex: number, n: number): number[] {
  let queue = Array.from({ length: n }, (_, i) => i);
  for (const m of planQueueMove(indices, toIndex, n)) {
    const req = reorderQueueRequest(m.from, m.to, m.count);
    queue = applySonosReorder(queue, Object.fromEntries(req.args.map((a) => [a.name, a.value])));
  }
  return queue;
}

/** The order a move must produce: toIndex unselected tracks, the selection, the rest. */
function expectedMove(indices: number[], toIndex: number, n: number): number[] {
  const sel = [...indices].sort((a, b) => a - b);
  const others = Array.from({ length: n }, (_, i) => i).filter((i) => !sel.includes(i));
  return [...others.slice(0, toIndex), ...sel, ...others.slice(toIndex)];
}

describe('planQueueMove', () => {
  const cases: Array<[string, number[], number]> = [
    ['non-contiguous selection to the middle', [1, 4, 7], 3],
    ['selection on both sides of the target', [0, 1, 5, 8, 9], 2],
    ['runs above the target, unordered input', [6, 2, 3], 5],
    ['move to the top', [3, 4, 8], 0],
    ['move to the end', [0, 2, 5], 7],
    ['single track down', [2], 6],
    ['single track up', [7], 1],
  ];
  for (const [name, indices, to] of cases) {
    it(name, () => {
      expect(simulateMove(indices, to, 10)).toEqual(expectedMove(indices, to, 10));
    });
  }

  it('a single track plans exactly the single-track reorder', () => {
    expect(planQueueMove([2], 6, 10)).toEqual([{ from: 2, count: 1, to: 6 }]);
    expect(planQueueMove([7], 1, 10)).toEqual([{ from: 7, count: 1, to: 1 }]);
  });

  it('plans nothing when the block is already in place', () => {
    expect(planQueueMove([3, 4, 5], 3, 10)).toEqual([]);
    expect(planQueueMove([4], 4, 10)).toEqual([]);
  });

  it('moves one contiguous run in one call', () => {
    expect(planQueueMove([1, 2, 3], 5, 10)).toEqual([{ from: 1, count: 3, to: 5 }]);
  });

  it('is correct for every selection of a 6-track queue and every target', () => {
    const n = 6;
    for (let mask = 1; mask < 1 << n; mask++) {
      const indices = Array.from({ length: n }, (_, i) => i).filter((i) => mask & (1 << i));
      for (let to = 0; to <= n - indices.length; to++) {
        expect(simulateMove(indices, to, n)).toEqual(expectedMove(indices, to, n));
      }
    }
  });

  it('rejects bad input instead of guessing', () => {
    expect(() => planQueueMove([], 0, 5)).toThrow();
    expect(() => planQueueMove([1, 1], 0, 5)).toThrow();
    expect(() => planQueueMove([-1], 0, 5)).toThrow();
    expect(() => planQueueMove([5], 0, 5)).toThrow();
    expect(() => planQueueMove([1.5], 0, 5)).toThrow();
    expect(() => planQueueMove([1, 2], 4, 5)).toThrow();
    expect(() => planQueueMove([1], -1, 5)).toThrow();
  });
});

describe('planQueueRemoval', () => {
  it('removes contiguous runs bottom-up so earlier indices stay valid', () => {
    expect(planQueueRemoval([1, 7, 2, 3, 9, 8], 10)).toEqual([
      { from: 7, count: 3 },
      { from: 1, count: 3 },
    ]);
  });

  it('applied in order, removes exactly the selected tracks', () => {
    let queue = Array.from({ length: 10 }, (_, i) => i);
    for (const r of planQueueRemoval([0, 4, 5, 9], 10)) queue.splice(r.from, r.count);
    expect(queue).toEqual([1, 2, 3, 6, 7, 8]);
  });

  it('rejects bad input instead of guessing', () => {
    expect(() => planQueueRemoval([], 5)).toThrow();
    expect(() => planQueueRemoval([2, 2], 5)).toThrow();
    expect(() => planQueueRemoval([5], 5)).toThrow();
  });
});

describe('empty/garbage all-empty', () => {
  it('parseTrackMetadata("") -> all empty', () => {
    expect(parseTrackMetadata('')).toEqual({ title: '', artist: '', album: '', albumArt: '' });
  });

  it('parseTrackMetadata("not xml") -> all empty (no throw)', () => {
    expect(parseTrackMetadata('not xml')).toEqual({ title: '', artist: '', album: '', albumArt: '' });
  });

  it('whitespace-only -> all empty', () => {
    expect(parseTrackMetadata('   \n  ')).toEqual({ title: '', artist: '', album: '', albumArt: '' });
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
  it('does not export ApplyVolumeArg', () => {
    const mod = control as Record<string, unknown>;
    // Relative-volume clamping (ApplyVolumeArg) stays deferred.
    expect(mod.ApplyVolumeArg).toBeUndefined();
    expect(mod.applyVolumeArg).toBeUndefined();
  });

  it('now exports the enqueue/play path (added for Spotify search)', () => {
    const mod = control as Record<string, unknown>;
    expect(typeof mod.addURIToQueue).toBe('function');
    expect(typeof mod.playFromQueue).toBe('function');
    expect(typeof mod.playItem).toBe('function');
  });
});
