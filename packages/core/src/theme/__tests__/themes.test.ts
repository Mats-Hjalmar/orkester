import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  DEFAULT_SETTINGS,
  DEFAULT_THEME_NAMES,
  ON_ACCENT_SECONDARY_OPACITY,
  colors,
  cssVarName,
  parseSettings,
  parseTheme,
  resolveTheme,
  themeNameProblem,
  type Theme,
} from '..';

const custom: Theme = { appearance: 'dark', colors: { ...colors, bg: '#000000' } };
const lookup = (name: string) => ({ ...BUILTIN_THEMES, Mine: custom })[name];
const stored = { appearance: 'system', lightTheme: 'Noira', darkTheme: 'Noira Night' };

// WCAG relative luminance / contrast ratio.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// `top` at `alpha` composited over `bottom`, as the browser blends opacity in sRGB.
function blend(top: string, bottom: string, alpha: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return '#' + [1, 3, 5].map((i) => Math.round(alpha * channel(top, i) + (1 - alpha) * channel(bottom, i)).toString(16).padStart(2, '0')).join('');
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('built-in themes', () => {
  it('Noira is the default light theme and is exactly `colors`; Noira Night the default dark one', () => {
    expect(BUILTIN_THEMES[DEFAULT_THEME_NAMES.light]).toEqual({ appearance: 'light', colors });
    expect(BUILTIN_THEMES[DEFAULT_THEME_NAMES.dark].appearance).toBe('dark');
  });

  it('has two light and six dark themes', () => {
    const byAppearance = Object.values(BUILTIN_THEMES).map((t) => t.appearance);
    expect(byAppearance.filter((a) => a === 'light')).toHaveLength(2);
    expect(byAppearance.filter((a) => a === 'dark')).toHaveLength(6);
  });

  for (const [name, theme] of Object.entries(BUILTIN_THEMES)) {
    it(`${name} is a valid theme file, stays readable, and its appearance matches its background`, () => {
      const s = theme.colors;
      expect(parseTheme(JSON.parse(JSON.stringify(theme)))).toEqual(theme);
      expect(contrast(s.fg, s.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.accentText, s.accent)).toBeGreaterThanOrEqual(3);
      expect(contrast(blend(s.accentText, s.accent, ON_ACCENT_SECONDARY_OPACITY), s.accent)).toBeGreaterThanOrEqual(3);
      expect(contrast(s.fgOnPhoto, s.bgDeep)).toBeGreaterThanOrEqual(7);
      expect(luminance(s.fgOnPhoto)).toBeGreaterThan(0.7);
      expect(luminance(s.bgDeep)).toBeLessThan(0.02);
      expect(luminance(s.bg) > 0.5 ? 'light' : 'dark').toBe(theme.appearance);
    });
  }
});

describe('parseTheme', () => {
  it.each<[string, unknown, RegExp]>([
    ['a non-object', [], /JSON object/],
    ['the old flat colour object', { ...colors }, /unknown theme key "bg"/],
    ['a missing appearance', { colors }, /missing theme key "appearance"/],
    ['a missing colors', { appearance: 'light' }, /missing theme key "colors"/],
    ['an unknown appearance', { appearance: 'dim', colors }, /"appearance" must be "light" or "dark"/],
    ['a missing token', { appearance: 'light', colors: { ...colors, bg: undefined } }, /missing colour "bg"/],
    ['a non-hex value', { appearance: 'light', colors: { ...colors, fg: 'red' } }, /fg must be a #RRGGBB/],
    ['a short hex value', { appearance: 'light', colors: { ...colors, fg: '#fff' } }, /#RRGGBB/],
    ['an unknown token', { appearance: 'light', colors: { ...colors, glow: '#FFFFFF' } }, /unknown colour "glow"/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseTheme(raw)).toThrow(message);
  });
});

describe('parseSettings', () => {
  it('accepts an appearance and a theme of the right appearance for each slot', () => {
    expect(parseSettings({ ...stored, appearance: 'dark', darkTheme: 'Mine' }, lookup)).toEqual({ ...stored, appearance: 'dark', darkTheme: 'Mine' });
  });

  it.each<[string, unknown, RegExp]>([
    ['a non-object', [], /JSON object/],
    ['an unknown setting', { ...stored, accent: 1 }, /unknown setting "accent"/],
    ['the old theme key', { theme: 'Noira' }, /unknown setting "theme"/],
    ['the in-memory themes map', { ...stored, themes: {} }, /unknown setting "themes"/],
    ['a missing darkTheme', { appearance: 'system', lightTheme: 'Noira' }, /missing setting "darkTheme"/],
    ['an unknown appearance', { ...stored, appearance: 'auto' }, /"appearance" must be "system", "light" or "dark"/],
    ['an unknown theme', { ...stored, lightTheme: 'Nope' }, /"lightTheme" names an unknown theme "Nope"/],
    ['a dark theme as the light theme', { ...stored, lightTheme: 'Velvet' }, /"lightTheme" names "Velvet", which is a dark theme/],
    ['a light theme as the dark theme', { ...stored, darkTheme: 'Fjord' }, /"darkTheme" names "Fjord", which is a light theme/],
  ])('rejects %s', (_label, raw, message) => {
    expect(() => parseSettings(raw, lookup)).toThrow(message);
  });
});

describe('resolveTheme', () => {
  const settings = { ...DEFAULT_SETTINGS, lightTheme: 'Fjord', darkTheme: 'Velvet' };
  it.each<[typeof settings.appearance, boolean, string]>([
    ['system', false, 'Fjord'],
    ['system', true, 'Velvet'],
    ['light', true, 'Fjord'],
    ['dark', false, 'Velvet'],
  ])('appearance %s with the system dark=%s shows %s', (appearance, systemIsDark, name) => {
    expect(resolveTheme({ ...settings, appearance }, systemIsDark)).toBe(BUILTIN_THEMES[name]);
  });
});

describe('themeNameProblem', () => {
  it('accepts an ordinary name', () => {
    expect(themeNameProblem('My theme')).toBeNull();
  });

  it.each([['', /needs a name/], ['   ', /needs a name/], ['Noira', /built-in/], ['a/b', /\//], ['a\\b', /\//], ['../evil', /\//], ['.hidden', /dot/], ['a\u0000b', /control/], ['a\nb', /control/]])(
    'rejects %j',
    (name, message) => {
      expect(themeNameProblem(name)).toMatch(message);
    },
  );
});

it('cssVarName prefixes the token', () => {
  expect(cssVarName('bgPaper')).toBe('--ork-bgPaper');
});
