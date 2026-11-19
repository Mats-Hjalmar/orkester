// Themes: named light or dark palettes over the token names in `colors`, plus
// the user settings that pick one theme per appearance and hold hand-made themes.
// Pure and RN-safe; the file I/O lives in src/node/settingsStore.ts.

import { colors } from './tokens';

export type ColorToken = keyof typeof colors;
export type ThemeColors = Record<ColorToken, string>;

export const COLOR_TOKENS = Object.keys(colors) as ColorToken[];

export const THEME_APPEARANCES = ['light', 'dark'] as const;
export type ThemeAppearance = (typeof THEME_APPEARANCES)[number];

/** The appearance setting: a fixed one, or whichever the system uses. */
export const APPEARANCE_SETTINGS = ['system', ...THEME_APPEARANCES] as const;
export type AppearanceSetting = (typeof APPEARANCE_SETTINGS)[number];

export interface Theme {
  appearance: ThemeAppearance;
  colors: ThemeColors;
}

export const DEFAULT_THEME_NAMES: Readonly<Record<ThemeAppearance, string>> = { light: 'Noira', dark: 'Noira Night' };

/** The settings key holding the theme chosen for each appearance. */
export const THEME_SETTING_KEYS = { light: 'lightTheme', dark: 'darkTheme' } as const satisfies Record<ThemeAppearance, string>;

// Secondary content on an accent fill (icons, meta) is accentText at this opacity,
// never a grey fg* token: those are tuned for the surfaces and can vanish on an accent.
export const ON_ACCENT_SECONDARY_OPACITY = 0.85;

const light = (colors: ThemeColors): Theme => ({ appearance: 'light', colors });
const dark = (colors: ThemeColors): Theme => ({ appearance: 'dark', colors });

// fgOnPhoto stays light and bgDeep dark in every theme: both sit over photos
// and hero tiles whatever the surfaces around them are.
export const BUILTIN_THEMES: Readonly<Record<string, Theme>> = {
  [DEFAULT_THEME_NAMES.light]: light(colors),
  [DEFAULT_THEME_NAMES.dark]: dark({
    bg: '#1C1915',
    bgCream: '#24201B',
    bgPaper: '#2A2620',
    bgDeep: '#100E0B',
    fg: '#EEE8DC',
    fgStrong: '#FAF6EE',
    fgMuted: '#A89F8E',
    fgSubtle: '#7F7767',
    fgFaint: '#4A443A',
    fgOnPhoto: '#F7F4ED',
    accent: '#E4F289',
    accentDeep: '#C9D96B',
    accentText: '#2A3308',
    danger: '#E08F84',
  }),
  Fjord: light({
    bg: '#EEF2F4',
    bgCream: '#E3E9ED',
    bgPaper: '#F8FAFB',
    bgDeep: '#14202B',
    fg: '#16222D',
    fgStrong: '#0A131B',
    fgMuted: '#56677A',
    fgSubtle: '#8796A5',
    fgFaint: '#C3CDD6',
    fgOnPhoto: '#F4F7F9',
    accent: '#7FD1C7',
    accentDeep: '#5DB8AD',
    accentText: '#0B3631',
    danger: '#B4545A',
  }),
  Velvet: dark({
    bg: '#1E1824',
    bgCream: '#261F2D',
    bgPaper: '#2C2434',
    bgDeep: '#120E16',
    fg: '#ECE4F0',
    fgStrong: '#FAF5FC',
    fgMuted: '#A797B0',
    fgSubtle: '#7C6E86',
    fgFaint: '#463C4E',
    fgOnPhoto: '#F7F2F9',
    accent: '#F5C451',
    accentDeep: '#DDA935',
    accentText: '#3A2A00',
    danger: '#EF8A8A',
  }),
  'Monokai Dark Vibrant': dark({
    bg: '#1E1F1C',
    bgCream: '#272822',
    bgPaper: '#2F3029',
    bgDeep: '#141411',
    fg: '#F8F8F2',
    fgStrong: '#FFFFFF',
    fgMuted: '#A6A28C',
    fgSubtle: '#75715E',
    fgFaint: '#49483E',
    fgOnPhoto: '#F8F8F2',
    accent: '#F92672',
    accentDeep: '#D61A5E',
    accentText: '#FFFFFF',
    danger: '#FD971F',
  }),
  'Catppuccin Frappé': dark({
    bg: '#303446',
    bgCream: '#393D50',
    bgPaper: '#414559',
    bgDeep: '#232634',
    fg: '#C6D0F5',
    fgStrong: '#DCE3FA',
    fgMuted: '#A5ADCE',
    fgSubtle: '#838BA7',
    fgFaint: '#51576D',
    fgOnPhoto: '#DCE3FA',
    accent: '#CA9EE6',
    accentDeep: '#B584D6',
    accentText: '#232634',
    danger: '#E78284',
  }),
  'Tokyo Night': dark({
    bg: '#1A1B26',
    bgCream: '#1E202E',
    bgPaper: '#202330',
    bgDeep: '#16161E',
    fg: '#C0CAF5',
    fgStrong: '#DDE2FA',
    fgMuted: '#FF9E64',
    fgSubtle: '#73DACA',
    fgFaint: '#363B54',
    fgOnPhoto: '#DDE2FA',
    accent: '#BB9AF7',
    accentDeep: '#9D7CD8',
    accentText: '#16161E',
    danger: '#F7768E',
  }),
  'One Dark Vivid': dark({
    bg: '#282C34',
    bgCream: '#2C313A',
    bgPaper: '#323844',
    bgDeep: '#202329',
    fg: '#BBBBBB',
    fgStrong: '#D7DAE0',
    fgMuted: '#E5C07B',
    fgSubtle: '#9DA5B4',
    fgFaint: '#333841',
    fgOnPhoto: '#E6E9EF',
    accent: '#D55FDE',
    accentDeep: '#B84BC1',
    accentText: '#202329',
    danger: '#EF596F',
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

/** The CSS custom property a token is exposed as, e.g. `bgPaper` -> `--ork-bgPaper`. */
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

/** Throws unless `raw` has exactly `keys` (all present, nothing else). */
function requireKeys(raw: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(raw)) {
    if (!keys.includes(key)) throw new Error(`unknown ${what} "${key}"`);
  }
  for (const key of keys) {
    if (raw[key] === undefined) throw new Error(`missing ${what} "${key}"`);
  }
}

function parseColors(raw: unknown): ThemeColors {
  if (!isObject(raw)) throw new Error('"colors" must be an object of colours');
  requireKeys(raw, COLOR_TOKENS, 'colour');
  for (const token of COLOR_TOKENS) {
    const value = raw[token];
    if (typeof value !== 'string' || !isHexColor(value)) {
      throw new Error(`${token} must be a #RRGGBB colour, got ${JSON.stringify(value)}`);
    }
  }
  return raw as ThemeColors;
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
