// Noira — the warm, editorial palette behind orkester's UI.
// Off-white surfaces, warm near-black ink, dusty pastels, one wakeful accent.

export const colors = {
  bg: '#F2EFE8', // primary off-white surface
  bgCream: '#ECE7DC', // subtle warm tint
  bgPaper: '#F7F4ED', // lifted surface
  bgDeep: '#1A1814', // warm near-black, for hero/photo treatments

  fg: '#1A1814', // primary text, near-black warm
  fgStrong: '#0E0D0A',
  fgMuted: '#6B6558', // secondary, metadata
  fgSubtle: '#98927F', // tertiary, captions
  fgFaint: '#C8C2B0', // hairlines
  fgOnPhoto: '#F7F4ED', // text over warm photography

  accent: '#E4F289', // lime / chartreuse — used sparingly
  accentDeep: '#C9D96B',
  accentText: '#2A3308', // text on accent

  danger: '#B86A6A',
} as const;

// Hairline / overlay rgba helpers (ink at low opacity over warm surfaces).
export const ink = (a: number) => `rgba(26,24,20,${a})`;
export const paper = (a: number) => `rgba(247,244,237,${a})`;

export const radii = {
  sm: 9,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

// Soft, warm shadows. Cross-platform `boxShadow` string (New Architecture).
export const shadow = {
  sm: '0px 2px 8px rgba(26,24,20,0.04)',
  md: '0px 8px 24px rgba(26,24,20,0.06)',
  lg: '0px 24px 60px rgba(26,24,20,0.10)',
} as const;

export const space = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
} as const;

// The phone frame the mockup was designed at.
export const FRAME = { width: 390, height: 844 } as const;
