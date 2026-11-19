import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { colors, DEFAULT_SETTINGS, type StoredSettings, type Theme } from '../../theme';
import {
  deleteTheme,
  loadSettings,
  saveSettings,
  saveTheme,
  settingsPath,
  themePath,
  themesDir,
} from '../settingsStore';

const mine: Theme = { appearance: 'dark', colors: { ...colors, bg: '#000000' } };
const stored: StoredSettings = { appearance: 'system', lightTheme: 'Noira', darkTheme: 'Noira Night' };

describe('settings store', () => {
  let dir: string;
  const prevXdg = process.env.XDG_CONFIG_HOME;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'orkester-settings-'));
    process.env.XDG_CONFIG_HOME = dir;
  });
  afterEach(() => {
    process.env.XDG_CONFIG_HOME = prevXdg;
    rmSync(dir, { recursive: true, force: true });
  });

  const writeTheme = (file: string, content: string) => {
    mkdirSync(themesDir(), { recursive: true });
    writeFileSync(join(themesDir(), file), content);
  };
  const writeSettings = (content: unknown) => {
    mkdirSync(join(dir, 'orkester'), { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(content));
  };

  it('lives in the orkester config dir', () => {
    expect(settingsPath()).toBe(join(dir, 'orkester', 'settings.json'));
    expect(themePath('Mine')).toBe(join(dir, 'orkester', 'themes', 'Mine.json'));
  });

  it('returns the defaults when neither settings.json nor themes/ exists', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('saves a theme as its own pretty-printed file, selectable for its appearance', () => {
    saveTheme('Mine', mine);
    expect(readFileSync(themePath('Mine'), 'utf8')).toBe(JSON.stringify(mine, null, 2));
    expect(existsSync(settingsPath())).toBe(false);
    saveSettings({ ...stored, appearance: 'dark', darkTheme: 'Mine' });
    expect(readFileSync(settingsPath(), 'utf8')).toBe(JSON.stringify({ ...stored, appearance: 'dark', darkTheme: 'Mine' }, null, 2));
    expect(loadSettings()).toEqual({ ...stored, appearance: 'dark', darkTheme: 'Mine', themes: { Mine: mine } });
  });

  it('loads a theme file dropped into themes/ and ignores non-.json entries', () => {
    writeTheme('Dropped.json', JSON.stringify(mine));
    writeTheme('.DS_Store', 'junk');
    writeTheme('Other.json.tmp', 'junk');
    expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, themes: { Dropped: mine } });
  });

  it('saving settings writes settings.json only, and works while another theme file is broken', () => {
    writeTheme('Broken.json', '{ not touched');
    saveSettings({ ...stored, lightTheme: 'Fjord' });
    expect(readFileSync(themePath('Broken'), 'utf8')).toBe('{ not touched');
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))).toEqual({ ...stored, lightTheme: 'Fjord' });
  });

  it.each<[string, StoredSettings, RegExp]>([
    ['an unknown theme', { ...stored, darkTheme: 'Gone' }, /"darkTheme" names an unknown theme "Gone"/],
    ['a theme of the wrong appearance', { ...stored, lightTheme: 'Mine' }, /"lightTheme" names "Mine", which is a dark theme/],
  ])('refuses to save settings naming %s', (_label, settings, message) => {
    saveTheme('Mine', mine);
    expect(() => saveSettings(settings)).toThrow(message);
    expect(existsSync(settingsPath())).toBe(false);
  });

  it('deletes only the theme file', () => {
    saveTheme('Mine', mine);
    saveTheme('Keep', mine);
    deleteTheme('Mine');
    expect(readdirSync(themesDir())).toEqual(['Keep.json']);
  });

  it('throws naming the file on malformed settings.json', () => {
    saveSettings(stored);
    writeFileSync(settingsPath(), '{ nope');
    expect(() => loadSettings()).toThrow(settingsPath());
  });

  it('throws naming the file on the old settings shape', () => {
    writeSettings({ theme: 'Noira' });
    expect(() => loadSettings()).toThrow(`${settingsPath()}: unknown setting "theme"`);
  });

  it('throws naming the file when settings.json picks a theme of the wrong appearance', () => {
    writeSettings({ ...stored, darkTheme: 'Fjord' });
    expect(() => loadSettings()).toThrow(`${settingsPath()}: "darkTheme" names "Fjord", which is a light theme`);
  });

  it('throws naming the theme file and the problem on a broken theme', () => {
    writeTheme('Bad.json', JSON.stringify({ ...mine, colors: { ...mine.colors, bg: 'red' } }));
    expect(() => loadSettings()).toThrow(`${themePath('Bad')}: bg must be a #RRGGBB colour`);
  });

  it('throws naming the theme file on the old flat shape', () => {
    writeTheme('Flat.json', JSON.stringify(mine.colors));
    expect(() => loadSettings()).toThrow(`${themePath('Flat')}: unknown theme key "bg"`);
  });

  it('throws naming the theme file when it is named like a built-in', () => {
    writeTheme('Noira.json', JSON.stringify(mine));
    expect(() => loadSettings()).toThrow(`${join(themesDir(), 'Noira.json')}: “Noira” is a built-in theme`);
  });

  it.each(['../escape', 'a/b', '.hidden', 'Noira', ''])('refuses the theme name %j', (name) => {
    expect(() => saveTheme(name, mine)).toThrow();
    expect(existsSync(join(dir, 'orkester'))).toBe(false);
  });

  it('refuses to save an invalid theme', () => {
    expect(() => saveTheme('Mine', { ...mine, colors: { ...mine.colors, fg: 'red' } })).toThrow(/#RRGGBB/);
    expect(existsSync(themePath('Mine'))).toBe(false);
  });
});
