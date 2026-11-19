import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  COLOR_TOKENS,
  CORE_COLOR_TOKENS,
  DEFAULT_DANGER,
  DEFAULT_SETTINGS,
  DEFAULT_THEME_NAMES,
  MIN_LOGO_TILE_CONTRAST,
  MIN_SURFACE_CONTRAST,
  ON_PRIMARY_SECONDARY_OPACITY,
  colors,
  contrast,
  cssVarName,
  luminance,
  mix,
  parseSettings,
  parseTheme,
  resolveColors,
  resolveTheme,
  themeColors,
  themeNameProblem,
  type Theme,
} from '..';

const custom: Theme = { appearance: 'dark', colors: { ...colors, background: '#000000' } };
const lookup = (name: string) => ({ ...BUILTIN_THEMES, Mine: custom })[name];
const stored = { appearance: 'system', lightTheme: 'Noira', darkTheme: 'Noira Night' };

// Every built-in's full palette as it looked when derivation was introduced, so tuning the
// resolver can never silently shift one.
const BUILTIN_SNAPSHOT: Record<string, Record<string, string>> = {
  'Noira': { background: '#F2EFE8', surface: '#F7F4ED', text: '#1A1814', textSecondary: '#6B6558', textTertiary: '#98927F', textHint: '#C8C2B0', primary: '#E4F289', onPrimary: '#2A3308', danger: '#B86A6A', logoBackground: '#1A1814', logoForeground: '#F7F4ED' },
  'Noira Night': { background: '#1C1915', surface: '#2A2620', text: '#EEE8DC', textSecondary: '#A89F8E', textTertiary: '#7F7767', textHint: '#4A443A', primary: '#E4F289', onPrimary: '#2A3308', danger: '#E08F84', logoBackground: '#100E0B', logoForeground: '#F7F4ED' },
  'Fjord': { background: '#EEF2F4', surface: '#F8FAFB', text: '#16222D', textSecondary: '#56677A', textTertiary: '#8796A5', textHint: '#C3CDD6', primary: '#7FD1C7', onPrimary: '#0B3631', danger: '#B4545A', logoBackground: '#14202B', logoForeground: '#F4F7F9' },
  'Velvet': { background: '#1E1824', surface: '#2C2434', text: '#ECE4F0', textSecondary: '#A797B0', textTertiary: '#7C6E86', textHint: '#463C4E', primary: '#F5C451', onPrimary: '#3A2A00', danger: '#EF8A8A', logoBackground: '#120E16', logoForeground: '#F7F2F9' },
  'Monokai Dark Vibrant': { background: '#1E1F1C', surface: '#2F3029', text: '#F8F8F2', textSecondary: '#A6A28C', textTertiary: '#75715E', textHint: '#49483E', primary: '#F92672', onPrimary: '#FFFFFF', danger: '#FD971F', logoBackground: '#141411', logoForeground: '#F8F8F2' },
  'Catppuccin Frapp\u00e9': { background: '#303446', surface: '#414559', text: '#C6D0F5', textSecondary: '#A5ADCE', textTertiary: '#838BA7', textHint: '#51576D', primary: '#CA9EE6', onPrimary: '#232634', danger: '#E78284', logoBackground: '#232634', logoForeground: '#DCE3FA' },
  'Tokyo Night': { background: '#1A1B26', surface: '#202330', text: '#C0CAF5', textSecondary: '#FF9E64', textTertiary: '#73DACA', textHint: '#363B54', primary: '#BB9AF7', onPrimary: '#16161E', danger: '#F7768E', logoBackground: '#16161E', logoForeground: '#DDE2FA' },
  'One Dark Vivid': { background: '#282C34', surface: '#323844', text: '#BBBBBB', textSecondary: '#E5C07B', textTertiary: '#9DA5B4', textHint: '#333841', primary: '#D55FDE', onPrimary: '#202329', danger: '#EF596F', logoBackground: '#202329', logoForeground: '#E6E9EF' },
};

describe('built-in themes', () => {
  it('Noira is the default light theme and resolves exactly to `colors`; Noira Night is the default dark one', () => {
    expect(themeColors(BUILTIN_THEMES[DEFAULT_THEME_NAMES.light])).toEqual(colors);
    expect(BUILTIN_THEMES[DEFAULT_THEME_NAMES.dark].appearance).toBe('dark');
  });

  it('has two light and six dark themes', () => {
    const byAppearance = Object.values(BUILTIN_THEMES).map((t) => t.appearance);
    expect(byAppearance.filter((a) => a === 'light')).toHaveLength(2);
    expect(byAppearance.filter((a) => a === 'dark')).toHaveLength(6);
  });

  it('resolve to their snapshot palettes', () => {
    expect(Object.fromEntries(Object.entries(BUILTIN_THEMES).map(([name, theme]) => [name, themeColors(theme)]))).toEqual(BUILTIN_SNAPSHOT);
  });

  for (const [name, theme] of Object.entries(BUILTIN_THEMES)) {
    it(`${name} stores only overrides that differ from what would be derived`, () => {
      const derived = resolveColors(theme.colors, theme.appearance);
      const coreOnly = resolveColors(
        { background: theme.colors.background, text: theme.colors.text, primary: theme.colors.primary },
        theme.appearance,
      );
      for (const token of Object.keys(theme.colors) as (keyof typeof derived)[]) {
        if (!(CORE_COLOR_TOKENS as readonly string[]).includes(token)) expect(theme.colors[token], token).not.toBe(coreOnly[token]);
      }
      expect(Object.keys(derived)).toHaveLength(COLOR_TOKENS.length);
    });

    it(`${name} is a valid theme file, stays readable, and its appearance matches its background`, () => {
      const s = themeColors(theme);
      expect(parseTheme(JSON.parse(JSON.stringify(theme)))).toEqual(theme);
      expect(contrast(s.text, s.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.onPrimary, s.primary)).toBeGreaterThanOrEqual(3);
      expect(contrast(mix(s.primary, s.onPrimary, ON_PRIMARY_SECONDARY_OPACITY), s.primary)).toBeGreaterThanOrEqual(3);
      expect(contrast(s.logoForeground, s.logoBackground)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(s.primary, s.logoBackground)).toBeGreaterThanOrEqual(3);
      expect(luminance(s.background) > 0.5 ? 'light' : 'dark').toBe(theme.appearance);
    });
  }
});

describe('resolveColors', () => {
  const core = { background: '#FFFFFF', text: '#000000', primary: '#FFCC00' };

  it('keeps the core colours and lifts the surface toward white in a light theme', () => {
    const c = resolveColors(core, 'light');
    expect([c.background, c.text, c.primary]).toEqual(['#FFFFFF', '#000000', '#FFCC00']);
    expect(resolveColors({ ...core, background: '#808080' }, 'light').surface).toBe(mix('#808080', '#FFFFFF', 0.4));
  });

  it('lifts the surface toward the text in a dark theme', () => {
    expect(resolveColors({ background: '#000000', text: '#FFFFFF', primary: '#FFCC00' }, 'dark').surface).toBe(mix('#000000', '#FFFFFF', 0.07));
  });

  it('fades the three quieter text levels from the text toward the background', () => {
    const c = resolveColors(core, 'light');
    expect([c.textSecondary, c.textTertiary, c.textHint]).toEqual([mix('#000000', '#FFFFFF', 0.35), mix('#000000', '#FFFFFF', 0.55), mix('#000000', '#FFFFFF', 0.8)]);
  });

  it('puts whichever end of the palette contrasts more on primary', () => {
    expect(resolveColors(core, 'light').onPrimary).toBe('#000000');
    expect(resolveColors({ ...core, primary: '#1030A0' }, 'light').onPrimary).toBe('#FFFFFF');
  });

  it('uses the default danger for the appearance, and the darker / lighter end for a light theme\'s logo', () => {
    const lightTheme = resolveColors(core, 'light');
    const darkTheme = resolveColors({ background: '#101010', text: '#EEEEEE', primary: '#FFCC00' }, 'dark');
    expect([lightTheme.danger, darkTheme.danger]).toEqual([DEFAULT_DANGER.light, DEFAULT_DANGER.dark]);
    expect([lightTheme.logoBackground, lightTheme.logoForeground]).toEqual(['#000000', '#FFFFFF']);
    expect(darkTheme.logoForeground).toBe('#EEEEEE');
  });

  it.each(['#000000', '#101010', '#14161B', '#1C1915', '#303446'])('sets a dark theme\'s logo tile apart from the background %s', (background) => {
    const c = resolveColors({ background, text: '#D8DEE9', primary: '#7FD4A8' }, 'dark');
    expect(contrast(c.logoBackground, background)).toBeGreaterThanOrEqual(MIN_LOGO_TILE_CONTRAST);
    expect(contrast(c.logoForeground, c.logoBackground)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.primary, c.logoBackground)).toBeGreaterThanOrEqual(3);
  });

  it.each<[string, string, 'light' | 'dark']>([
    ['#FFFFFF', '#1F2A44', 'light'],
    ['#FBF8F3', '#1F2A44', 'light'],
    ['#F2EFE8', '#1A1814', 'light'],
    ['#14161B', '#D8DEE9', 'dark'],
    ['#000000', '#FFFFFF', 'dark'],
  ])('sets the surface apart from the background %s, keeping text readable on it', (background, text, appearance) => {
    const c = resolveColors({ background, text, primary: '#E85D3A' }, appearance);
    expect(contrast(c.surface, background)).toBeGreaterThanOrEqual(MIN_SURFACE_CONTRAST);
    expect(contrast(text, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('deepens the surface toward the text when a light background has no room to lift', () => {
    expect(resolveColors({ ...core, text: '#1F2A44' }, 'light').surface).toBe(mix('#FFFFFF', '#1F2A44', 0.03));
  });

  it('lets an override win over the derived colour', () => {
    expect(resolveColors({ ...core, surface: '#123456', danger: '#654321' }, 'light')).toMatchObject({ surface: '#123456', danger: '#654321' });
  });
});

describe('parseTheme', () => {
  it('accepts the core three alone, or with any overrides up to all eleven', () => {
    const core = { background: '#FFFFFF', text: '#000000', primary: '#FFCC00' };
    expect(parseTheme({ appearance: 'light', colors: core })).toEqual({ appearance: 'light', colors: core });
    expect(parseTheme({ appearance: 'light', colors: { ...core, danger: '#AA0000' } }).colors).toEqual({ ...core, danger: '#AA0000' });
    expect(parseTheme({ appearance: 'light', colors }).colors).toEqual(colors);
  });

  it.each<[string, unknown, RegExp]>([
    ['a non-object', [], /JSON object/],
    ['the old flat colour object', { ...colors }, /unknown theme key "background"/],
    ['a missing appearance', { colors }, /missing theme key "appearance"/],
    ['a missing colors', { appearance: 'light' }, /missing theme key "colors"/],
    ['an unknown appearance', { appearance: 'dim', colors }, /"appearance" must be "light" or "dark"/],
    ['a missing core colour', { appearance: 'light', colors: { text: '#000000', primary: '#FFCC00' } }, /missing colour "background"/],
    ['a non-hex value', { appearance: 'light', colors: { ...colors, text: 'red' } }, /text must be a #RRGGBB/],
    ['a short hex value', { appearance: 'light', colors: { ...colors, text: '#fff' } }, /#RRGGBB/],
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
  expect(cssVarName('surface')).toBe('--ork-surface');
});
