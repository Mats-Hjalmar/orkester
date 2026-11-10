// Album art at the size a view needs.
//
// A Spotify track's upnp:albumArtURI is a speaker-relative /getaa URL. The speaker
// fetches the cover from Spotify on every request (2-10 s each, measured) and
// ignores any size parameter, always serving the 640 px original — byte-identical
// to Spotify's CDN copy. The CDN serves the same cover in fixed sizes keyed by a
// prefix in front of a per-image hash, so once we know the hash we can pick a
// size and skip the speaker entirely. The hash is not in the /getaa URL; Spotify's
// public oEmbed endpoint maps a track id to it without auth.

import type { HttpTransport } from '../sonos';

/** A cover in the two sizes the UI uses. Both are equal when no sizes exist. */
export interface ArtUrls {
  /** 300 px — rows, cards, the mini player. */
  small: string;
  /** 640 px — the Now Playing cover. */
  large: string;
}

const CDN = 'https://i.scdn.co/image/';
const SMALL_PREFIX = 'ab67616d00001e02';
const LARGE_PREFIX = 'ab67616d0000b273';
// Album covers share the ab67616d0000 prefix; the next four hex digits pick the size.
const CDN_IMAGE = /\/image\/ab67616d0000[0-9a-f]{4}([0-9a-f]{24})$/;
// The id sits in the /getaa `u` param, encoded once or twice ("%3a" / "%253a").
const SPOTIFY_TRACK = /spotify(?::|%3a|%253a)track(?::|%3a|%253a)([A-Za-z0-9]{22})/i;

function cdnUrls(hash: string): ArtUrls {
  return { small: CDN + SMALL_PREFIX + hash, large: CDN + LARGE_PREFIX + hash };
}

/** The Spotify track id an art URL refers to, or null if it is not a Spotify track. */
export function spotifyTrackIdFromArtUrl(artUrl: string): string | null {
  return SPOTIFY_TRACK.exec(artUrl)?.[1] ?? null;
}

/** Sized URLs derived from a Spotify CDN album-cover URL, or null for any other URL. */
export function sizedCdnArt(artUrl: string): ArtUrls | null {
  const hash = CDN_IMAGE.exec(artUrl)?.[1];
  return hash ? cdnUrls(hash) : null;
}

/** Looks up a Spotify track's cover through oEmbed. THROWS when it can't be resolved. */
export async function fetchSpotifyTrackArt(transport: HttpTransport, trackId: string): Promise<ArtUrls> {
  const resp = await transport.request({
    method: 'GET',
    url: `https://open.spotify.com/oembed?url=spotify:track:${trackId}`,
    timeoutMs: 5000,
  });
  if (resp.status !== 200) throw new Error(`Spotify oEmbed returned ${resp.status} for track ${trackId}`);
  const thumbnail = (JSON.parse(resp.body) as { thumbnail_url?: unknown }).thumbnail_url;
  const sized = typeof thumbnail === 'string' ? sizedCdnArt(thumbnail) : null;
  if (!sized) throw new Error(`Spotify oEmbed gave no album cover for track ${trackId}`);
  return sized;
}
