// Themes: named light or dark palettes over the token names in `colors`, plus
// the user settings that pick one theme per appearance and hold hand-made themes.
// Pure and RN-safe; the file I/O lives in src/node/settingsStore.ts.

import { contrast, luminance, mix } from './color';
import { colors } from './tokens';

export type ColorToken = keyof typeof colors;
/** A full palette: every token, as applied to the UI. */
export type ThemeColors = Record<ColorToken, string>;

export const COLOR_TOKENS = Object.keys(colors) as ColorToken[];

/** The colours a theme must set; every other token is derived from them unless the theme overrides it. */
export const CORE_COLOR_TOKENS = ['background', 'text', 'primary'] as const satisfies readonly ColorToken[];
export type CoreColorToken = (typeof CORE_COLOR_TOKENS)[number];
export const DERIVED_COLOR_TOKENS = COLOR_TOKENS.filter((t) => !(CORE_COLOR_TOKENS as readonly ColorToken[]).includes(t));

/** A theme's stored colours: the core three plus overrides of any derived ones. */
export type ThemeColorInput = Pick<ThemeColors, CoreColorToken> & Partial<ThemeColors>;

export const THEME_APPEARANCES = ['light', 'dark'] as const;
export type ThemeAppearance = (typeof THEME_APPEARANCES)[number];

/** The appearance setting: a fixed one, or whichever the system uses. */
export const APPEARANCE_SETTINGS = ['system', ...THEME_APPEARANCES] as const;
export type AppearanceSetting = (typeof APPEARANCE_SETTINGS)[number];

export interface Theme {
  appearance: ThemeAppearance;
  colors: ThemeColorInput;
}

export const DEFAULT_THEME_NAMES: Readonly<Record<ThemeAppearance, string>> = { light: 'Noira', dark: 'Noira Night' };

/** The settings key holding the theme chosen for each appearance. */
export const THEME_SETTING_KEYS = { light: 'lightTheme', dark: 'darkTheme' } as const satisfies Record<ThemeAppearance, string>;

// Secondary content on a primary fill (icons, meta) is onPrimary at this opacity,
// never a grey text* token: those are tuned for the surfaces and can vanish on primary.
export const ON_PRIMARY_SECONDARY_OPACITY = 0.85;

// How far `surface` is lifted from the background: toward white in a light theme,
// toward the text in a dark one. Where that can't separate it (a near-white
// background has no room left), it is deepened instead: toward the text in a
// light theme, toward black in a dark one.
const SURFACE_LIFT: Readonly<Record<ThemeAppearance, number>> = { light: 0.4, dark: 0.07 };
const SURFACE_DEEPEN = 0.03;
export const MIN_SURFACE_CONTRAST = 1.04;

// A dark theme's logo tile is the background deepened toward black; on a
// near-black background that can't separate it, so it is lifted toward the text.
const LOGO_DEEPEN = 0.5;
const LOGO_LIFT = 0.12;
export const MIN_LOGO_TILE_CONTRAST = 1.2;

const WHITE = '#FFFFFF';
const BLACK = '#000000';

/** `preferred` if it stands at least `min` apart from `base`, otherwise `fallback`. */
function separated(base: string, preferred: string, fallback: string, min: number): string {
  return contrast(base, preferred) >= min ? preferred : fallback;
}

// How far each quieter text level is mixed from the text toward the background.
const TEXT_FADE = { textSecondary: 0.35, textTertiary: 0.55, textHint: 0.8 } as const;

export const DEFAULT_DANGER: Readonly<Record<ThemeAppearance, string>> = { light: colors.danger, dark: '#E08F84' };

/** The full palette for a theme's stored colours: derived tokens fill in what it doesn't override. */
export function resolveColors(input: ThemeColorInput, appearance: ThemeAppearance): ThemeColors {
  const { background, text, primary } = input;
  const [darker, lighter] = luminance(background) < luminance(text) ? [background, text] : [text, background];
  const derived: ThemeColors = {
    background,
    text,
    primary,
    surface:
      appearance === 'light'
        ? separated(background, mix(background, WHITE, SURFACE_LIFT.light), mix(background, text, SURFACE_DEEPEN), MIN_SURFACE_CONTRAST)
        : separated(background, mix(background, text, SURFACE_LIFT.dark), mix(background, BLACK, SURFACE_DEEPEN), MIN_SURFACE_CONTRAST),
    textSecondary: mix(text, background, TEXT_FADE.textSecondary),
    textTertiary: mix(text, background, TEXT_FADE.textTertiary),
    textHint: mix(text, background, TEXT_FADE.textHint),
    onPrimary: contrast(darker, primary) >= contrast(lighter, primary) ? darker : lighter,
    danger: DEFAULT_DANGER[appearance],
    logoBackground:
      appearance === 'light' ? darker : separated(background, mix(background, BLACK, LOGO_DEEPEN), mix(background, text, LOGO_LIFT), MIN_LOGO_TILE_CONTRAST),
    logoForeground: lighter,
  };
  return { ...derived, ...input };
}

export function themeColors(theme: Theme): ThemeColors {
  return resolveColors(theme.colors, theme.appearance);
}

const light = (colors: ThemeColorInput): Theme => ({ appearance: 'light', colors });
const dark = (colors: ThemeColorInput): Theme => ({ appearance: 'dark', colors });

// Noira is `colors` itself; its danger and logo tile are exactly what would be derived.
const { danger: _danger, logoBackground: _logoBackground, ...noira } = colors;

// Each built-in stores the core three plus only the colours it sets differently from the derived ones.
export const BUILTIN_THEMES: Readonly<Record<string, Theme>> = {
  [DEFAULT_THEME_NAMES.light]: light(noira),
  [DEFAULT_THEME_NAMES.dark]: dark({
    background: '#1C1915',
    surface: '#2A2620',
    text: '#EEE8DC',
    textSecondary: '#A89F8E',
    textTertiary: '#7F7767',
    textHint: '#4A443A',
    primary: '#E4F289',
    onPrimary: '#2A3308',
    logoBackground: '#100E0B',
    logoForeground: '#F7F4ED',
  }),
  Fjord: light({
    background: '#EEF2F4',
    surface: '#F8FAFB',
    text: '#16222D',
    textSecondary: '#56677A',
    textTertiary: '#8796A5',
    textHint: '#C3CDD6',
    primary: '#7FD1C7',
    onPrimary: '#0B3631',
    danger: '#B4545A',
    logoBackground: '#14202B',
    logoForeground: '#F4F7F9',
  }),
  Velvet: dark({
    background: '#1E1824',
    surface: '#2C2434',
    text: '#ECE4F0',
    textSecondary: '#A797B0',
    textTertiary: '#7C6E86',
    textHint: '#463C4E',
    primary: '#F5C451',
    onPrimary: '#3A2A00',
    danger: '#EF8A8A',
    logoBackground: '#120E16',
    logoForeground: '#F7F2F9',
  }),
  'Monokai Dark Vibrant': dark({
    background: '#1E1F1C',
    surface: '#2F3029',
    text: '#F8F8F2',
    textSecondary: '#A6A28C',
    textTertiary: '#75715E',
    textHint: '#49483E',
    primary: '#F92672',
    onPrimary: '#FFFFFF',
    danger: '#FD971F',
    logoBackground: '#141411',
  }),
  'Catppuccin Frappé': dark({
    background: '#303446',
    surface: '#414559',
    text: '#C6D0F5',
    textSecondary: '#A5ADCE',
    textTertiary: '#838BA7',
    textHint: '#51576D',
    primary: '#CA9EE6',
    onPrimary: '#232634',
    danger: '#E78284',
    logoBackground: '#232634',
    logoForeground: '#DCE3FA',
  }),
  'Tokyo Night': dark({
    background: '#1A1B26',
    surface: '#202330',
    text: '#C0CAF5',
    textSecondary: '#FF9E64',
    textTertiary: '#73DACA',
    textHint: '#363B54',
    primary: '#BB9AF7',
    onPrimary: '#16161E',
    danger: '#F7768E',
    logoBackground: '#16161E',
    logoForeground: '#DDE2FA',
  }),
  'One Dark Vivid': dark({
    background: '#282C34',
    surface: '#323844',
    text: '#BBBBBB',
    textSecondary: '#E5C07B',
    textTertiary: '#9DA5B4',
    textHint: '#333841',
    primary: '#D55FDE',
    onPrimary: '#202329',
    danger: '#EF596F',
    logoBackground: '#202329',
    logoForeground: '#E6E9EF',
  }),
};

/** What settings.json holds. */
export interface StoredSettings {
  appearance: AppearanceSetting;
  lightTheme: string;
  darkTheme: string;
}

/** In memory: the stored settings plus every custom theme, from themes/<name>.json. */
export interface Settings extends StoredSettings {
  themes: Record<string, Theme>;
}

export const DEFAULT_SETTINGS: Settings = {
  appearance: 'system',
  lightTheme: DEFAULT_THEME_NAMES.light,
  darkTheme: DEFAULT_THEME_NAMES.dark,
  themes: {},
};

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_COLOR.test(value);
}

/** The CSS custom property a token is exposed as, e.g. `surface` -> `--ork-surface`. */
export function cssVarName(token: ColorToken): string {
  return `--ork-${token}`;
}

export function allThemes(settings: Settings): Record<string, Theme> {
  return { ...BUILTIN_THEMES, ...settings.themes };
}

/** The theme chosen for `appearance`. */
export function selectedTheme(settings: Settings, appearance: ThemeAppearance): Theme {
  return allThemes(settings)[settings[THEME_SETTING_KEYS[appearance]]];
}

export function resolveAppearance(setting: AppearanceSetting, systemIsDark: boolean): ThemeAppearance {
  if (setting !== 'system') return setting;
  return systemIsDark ? 'dark' : 'light';
}

/** The theme to show, given whether the system is currently dark. */
export function resolveTheme(settings: Settings, systemIsDark: boolean): Theme {
  return selectedTheme(settings, resolveAppearance(settings.appearance, systemIsDark));
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

/** Why `name` can't name a custom theme, or null if it can. A custom theme's name is its file name. */
export function themeNameProblem(name: string): string | null {
  if (name.trim() === '') return 'A theme needs a name.';
  if (Object.hasOwn(BUILTIN_THEMES, name)) return `“${name}” is a built-in theme. Pick another name.`;
  if (/[/\\]/.test(name)) return 'A theme name can’t contain / or \\.';
  if (name.startsWith('.')) return 'A theme name can’t start with a dot.';
  if (CONTROL_CHARS.test(name)) return 'A theme name can’t contain control characters.';
  return null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Throws unless `raw` has every `required` key and nothing outside `allowed`. */
function requireKeys(raw: Record<string, unknown>, allowed: readonly string[], what: string, required = allowed): void {
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) throw new Error(`unknown ${what} "${key}"`);
  }
  for (const key of required) {
    if (raw[key] === undefined) throw new Error(`missing ${what} "${key}"`);
  }
}

function parseColors(raw: unknown): ThemeColorInput {
  if (!isObject(raw)) throw new Error('"colors" must be an object of colours');
  requireKeys(raw, COLOR_TOKENS, 'colour', CORE_COLOR_TOKENS);
  for (const [token, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !isHexColor(value)) {
      throw new Error(`${token} must be a #RRGGBB colour, got ${JSON.stringify(value)}`);
    }
  }
  return raw as ThemeColorInput;
}

function isOneOf<T extends string>(values: readonly T[], v: unknown): v is T {
  return (values as readonly unknown[]).includes(v);
}

/** Validates one theme file's contents; throws naming the first problem found. */
export function parseTheme(raw: unknown): Theme {
  if (!isObject(raw)) throw new Error('a theme must be a JSON object');
  requireKeys(raw, ['appearance', 'colors'], 'theme key');
  if (!isOneOf(THEME_APPEARANCES, raw.appearance)) {
    throw new Error(`"appearance" must be "light" or "dark", got ${JSON.stringify(raw.appearance)}`);
  }
  return { appearance: raw.appearance, colors: parseColors(raw.colors) };
}

/** Validates settings.json, looking up the themes it names; throws naming the first problem. */
export function parseSettings(raw: unknown, lookup: (name: string) => Theme | undefined): StoredSettings {
  if (!isObject(raw)) throw new Error('settings must be a JSON object');
  requireKeys(raw, ['appearance', ...THEME_APPEARANCES.map((a) => THEME_SETTING_KEYS[a])], 'setting');
  if (!isOneOf(APPEARANCE_SETTINGS, raw.appearance)) {
    throw new Error(`"appearance" must be "system", "light" or "dark", got ${JSON.stringify(raw.appearance)}`);
  }
  for (const appearance of THEME_APPEARANCES) {
    const key = THEME_SETTING_KEYS[appearance];
    const name = raw[key];
    if (typeof name !== 'string') throw new Error(`"${key}" must be the name of a theme`);
    const theme = lookup(name);
    if (!theme) throw new Error(`"${key}" names an unknown theme "${name}"`);
    if (theme.appearance !== appearance) throw new Error(`"${key}" names "${name}", which is a ${theme.appearance} theme`);
  }
  return { appearance: raw.appearance, lightTheme: raw.lightTheme as string, darkTheme: raw.darkTheme as string };
}
