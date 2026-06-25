// Deterministic synthesized cover art.
//
// The Sonos engine has no album art, but the UI's CoverArt renders a pastel
// field (coverBg) with one circle/arc "motif" shape (coverShape). We synthesize
// a {coverBg, coverShape} pair from hash(title|artist) so the SAME track always
// gets the SAME cover — drawn from the warm pastel palette the mock library used
// (theme/tokens carries the brand colours; these pastels are the cover-specific
// extension of that palette). No node:* — pure string hashing.

/** The pastel cover palette, lifted from the mock library's coverBg/coverShape pairs. */
export const COVER_PALETTE: ReadonlyArray<{ bg: string; shape: string }> = [
  { bg: '#F9D8A6', shape: '#C99A6E' }, // amber
  { bg: '#C3ECFD', shape: '#6E96A4' }, // sky
  { bg: '#D0E0C9', shape: '#7E9170' }, // sage
  { bg: '#FDF787', shape: '#A89A4E' }, // lemon
  { bg: '#D4C7E6', shape: '#8A7BA2' }, // lilac
  { bg: '#FAE1F0', shape: '#C9919A' }, // blush
  { bg: '#ECE7DC', shape: '#C99A6E' }, // cream
];

/**
 * djb2 string hash (deterministic, fast, no deps). Returns a non-negative
 * 32-bit integer so the same input always picks the same palette slot across
 * platforms and runs.
 */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0; // h * 33 + c, wrapped to 32-bit
  }
  return h >>> 0; // force unsigned
}

/**
 * Synthesizes a deterministic {coverBg, coverShape} for a track from
 * hash("title|artist"). Stable for a given title/artist so the cover never
 * flickers between polls.
 */
export function synthesizeArt(title: string, artist: string): { coverBg: string; coverShape: string } {
  const slot = hashString(`${title}|${artist}`) % COVER_PALETTE.length;
  const { bg, shape } = COVER_PALETTE[slot];
  return { coverBg: bg, coverShape: shape };
}
