// Noira — the warm, editorial palette behind orkester's UI.
// Off-white surfaces, warm near-black ink, dusty pastels, one wakeful primary colour.

export const colors = {
  background: '#F2EFE8', // the window behind everything
  surface: '#F7F4ED', // cards, popovers and inputs lifted off the background

  text: '#1A1814', // primary text and icons
  textSecondary: '#6B6558', // metadata, secondary labels
  textTertiary: '#98927F', // captions, placeholders, quiet icons
  textHint: '#C8C2B0', // the faintest marks: idle dots, disabled hints

  primary: '#E4F289', // the one wakeful colour: play buttons, the playing row, selection
  onPrimary: '#2A3308', // text and icons drawn on primary

  danger: '#B86A6A', // errors

  logoBackground: '#1A1814', // the orkester logo's tile
  logoForeground: '#F7F4ED', // the orkester logo's mark
} as const;

// Hairline / overlay rgba helper (text colour at low opacity over warm surfaces).
export const ink = (a: number) => `rgba(26,24,20,${a})`;

// A dark that is the same in every theme: for a backdrop dimming the whole app,
// or a glyph drawn on fixed light art.
export const FIXED_DARK = '#1A1814';

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

// The desktop top bar, which on macOS is also the window's title bar.
export const TOP_BAR_HEIGHT = 60;

// The phone frame the mockup was designed at.
export const FRAME = { width: 390, height: 844 } as const;
