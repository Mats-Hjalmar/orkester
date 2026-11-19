// The user's settings, next to auth.json: settings.json holds the appearance and
// the theme chosen for light and for dark; themes/<name>.json each custom theme,
// so dropping a file into themes/ adds one. Hand-editable, so every load is
// validated; a broken file throws rather than being replaced with defaults.

import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  BUILTIN_THEMES,
  DEFAULT_SETTINGS,
  parseSettings,
  parseTheme,
  themeNameProblem,
  type Settings,
  type StoredSettings,
  type Theme,
} from '../theme';
import { configDir, readConfigFile, writeConfigJson } from './configStore';

const THEME_EXT = '.json';

export function settingsPath(): string {
  return join(configDir(), 'settings.json');
}

export function themesDir(): string {
  return join(configDir(), 'themes');
}

export function themePath(name: string): string {
  const problem = themeNameProblem(name);
  if (problem) throw new Error(problem);
  const path = join(themesDir(), name + THEME_EXT);
  if (dirname(resolve(path)) !== resolve(themesDir())) throw new Error(`theme name "${name}" escapes ${themesDir()}`);
  return path;
}

/** Parses a config file's JSON with `parse`, prefixing any problem with the file's path. */
function parseFile<T>(path: string, data: string, parse: (raw: unknown) => T): T {
  try {
    return parse(JSON.parse(data));
  } catch (err) {
    throw new Error(`${path}: ${(err as Error).message}`);
  }
}

function themeFileNames(): string[] {
  try {
    return readdirSync(themesDir()).filter((f) => f.endsWith(THEME_EXT)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

function loadThemes(): Record<string, Theme> {
  const themes: Record<string, Theme> = {};
  for (const file of themeFileNames()) {
    const path = join(themesDir(), file);
    const name = file.slice(0, -THEME_EXT.length);
    const problem = themeNameProblem(name);
    if (problem) throw new Error(`${path}: ${problem}`);
    themes[name] = parseFile(path, readFileSync(path, 'utf8'), parseTheme);
  }
  return themes;
}

/** The saved settings; a missing settings.json or themes/ means the defaults. */
export function loadSettings(): Settings {
  const themes = loadThemes();
  const path = settingsPath();
  const data = readConfigFile(path);
  if (data === null) return { ...DEFAULT_SETTINGS, themes };
  const all: Record<string, Theme> = { ...BUILTIN_THEMES, ...themes };
  return { ...parseFile(path, data, (raw) => parseSettings(raw, (name) => all[name])), themes };
}

// Reads only the named theme, so a write works even while some other theme file is broken.
function lookupTheme(name: string): Theme | undefined {
  if (Object.hasOwn(BUILTIN_THEMES, name)) return BUILTIN_THEMES[name];
  const path = themePath(name);
  const data = readConfigFile(path);
  return data === null ? undefined : parseFile(path, data, parseTheme);
}

/** Validates and writes settings.json; the themes it names must exist with the right appearance. */
export function saveSettings(settings: StoredSettings): void {
  writeConfigJson(settingsPath(), parseSettings(settings, lookupTheme));
}

/** Writes themes/<name>.json only. */
export function saveTheme(name: string, theme: Theme): void {
  writeConfigJson(themePath(name), parseTheme(theme));
}

export function deleteTheme(name: string): void {
  rmSync(themePath(name));
}
