import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../sonos';
import { fetchSpotifyTrackArt, sizedCdnArt, spotifyTrackIdFromArtUrl } from '../art';

// A real queue item's art URL and the oEmbed answer for its track, as captured
// from a speaker and open.spotify.com on 2026-11-10.
const TRACK_ID = '4axCvAhvcO8m5qJeLMa3dg';
const GETAA =
  'http://10.200.0.242:1400/getaa?s=1&u=x-sonos-spotify%3aspotify%253atrack%253a4axCvAhvcO8m5qJeLMa3dg%3fsid%3d9%26flags%3d8232%26sn%3d7';
const HASH = '81f6e9d86f64a4a4e5c319c8';
const SIZED = {
  small: `https://i.scdn.co/image/ab67616d00001e02${HASH}`,
  large: `https://i.scdn.co/image/ab67616d0000b273${HASH}`,
};

class OneResponse implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  constructor(private readonly resp: HttpResponse) {}
  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    return Promise.resolve(this.resp);
  }
}

const oembed = (body: object, status = 200) => new OneResponse({ status, headers: {}, body: JSON.stringify(body) });

describe('spotifyTrackIdFromArtUrl', () => {
  it('reads the track id from a speaker /getaa URL', () => {
    expect(spotifyTrackIdFromArtUrl(GETAA)).toBe(TRACK_ID);
  });

  it('returns null for art that is not a Spotify track', () => {
    expect(spotifyTrackIdFromArtUrl('http://10.0.0.1:1400/getaa?s=1&u=x-file-cifs%3a%2f%2fnas%2fa.flac')).toBeNull();
    expect(spotifyTrackIdFromArtUrl('https://logo.cdn/x.png')).toBeNull();
  });
});

describe('sizedCdnArt', () => {
  it('derives both sizes from any size of a Spotify CDN album cover', () => {
    expect(sizedCdnArt(SIZED.large)).toEqual(SIZED);
    expect(sizedCdnArt(`https://i.scdn.co/image/ab67616d00004851${HASH}`)).toEqual(SIZED);
    expect(sizedCdnArt(`https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02${HASH}`)).toEqual(SIZED);
  });

  it('returns null for a non-cover image or another host format', () => {
    expect(sizedCdnArt(`https://i.scdn.co/image/ab6765630000ba8a${HASH}`)).toBeNull();
    expect(sizedCdnArt(GETAA)).toBeNull();
  });
});

describe('fetchSpotifyTrackArt', () => {
  it('asks oEmbed for the track and sizes the thumbnail it returns', async () => {
    const t = oembed({ thumbnail_url: `https://image-cdn-ak.spotifycdn.com/image/ab67616d00001e02${HASH}` });
    expect(await fetchSpotifyTrackArt(t, TRACK_ID)).toEqual(SIZED);
    expect(t.requests[0]).toMatchObject({ method: 'GET', url: `https://open.spotify.com/oembed?url=spotify:track:${TRACK_ID}` });
  });

  it('throws on a non-200 answer', async () => {
    await expect(fetchSpotifyTrackArt(oembed({}, 404), TRACK_ID)).rejects.toThrow('404');
  });

  it('throws when the answer has no album cover', async () => {
    await expect(fetchSpotifyTrackArt(oembed({ title: 'x' }), TRACK_ID)).rejects.toThrow('no album cover');
  });
});
