// Desktop settings state: the saved settings (via the shell bridge), which theme
// is shown, and unsaved colour edits. A theme reaches the UI by setting the CSS
// variables that `colors` in ../theme/tokens points at.

import React from 'react';
import {
  COLOR_TOKENS,
  CORE_COLOR_TOKENS,
  DEFAULT_SETTINGS,
  DEFAULT_THEME_NAMES,
  THEME_SETTING_KEYS,
  cssVarName,
  resolveAppearance,
  resolveColors,
  selectedTheme,
  themeColors,
  themeNameProblem,
  type AppearanceSetting,
  type ColorToken,
  type Settings,
  type StoredSettings,
  type ThemeAppearance,
  type ThemeColorInput,
  type ThemeColors,
} from '@orkester/core/theme';
import { orkesterShell } from './shell';

export interface LoadedSettings {
  settings: Settings;
  /** Why the settings could not be loaded; the defaults are in use meanwhile. */
  loadError: string | null;
}

// With main forcing nativeTheme.themeSource this follows the forced appearance,
// but a forced appearance is resolved without it, so the two never disagree.
const systemDarkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function applyColors(themeColors: ThemeColors): void {
  const root = document.documentElement.style;
  for (const token of COLOR_TOKENS) root.setProperty(cssVarName(token), themeColors[token]);
}

async function readSettings(): Promise<LoadedSettings> {
  const shell = orkesterShell();
  try {
    return { settings: await shell.loadSettings(), loadError: null };
  } catch (err) {
    // A broken hand-edited file must not keep the app from starting: run on the
    // defaults and let the settings modal show the error.
    return { settings: DEFAULT_SETTINGS, loadError: (err as Error).message };
  }
}

/** Loads the settings and applies the theme to show. Call before the first render. */
export async function loadSettings(): Promise<LoadedSettings> {
  const loaded = await readSettings();
  const appearance = resolveAppearance(loaded.settings.appearance, systemDarkQuery().matches);
  applyColors(themeColors(selectedTheme(loaded.settings, appearance)));
  return loaded;
}

function stored({ appearance, lightTheme, darkTheme }: Settings): StoredSettings {
  return { appearance, lightTheme, darkTheme };
}

export function useSettings(initial: LoadedSettings) {
  const [settings, setSettings] = React.useState(initial.settings);
  const [loadError, setLoadError] = React.useState(initial.loadError);
  const [systemDark, setSystemDark] = React.useState(() => systemDarkQuery().matches);
  // The appearance whose theme is being picked or edited. While set, its theme
  // is previewed even if the app currently resolves to the other appearance.
  const [editing, setEditing] = React.useState<ThemeAppearance | null>(null);
  // Unsaved edits to the edited theme's stored colours: core three plus overrides.
  const [draft, setDraft] = React.useState<ThemeColorInput | null>(null);
  // Derived colours fine-tuned in this edit. Only these survive a change to a core
  // colour: overrides inherited from the theme being edited are derived again, so
  // the fine-tune section follows the core colours.
  const [fineTuned, setFineTuned] = React.useState<ColorToken[]>([]);
  const clearDraft = () => {
    setDraft(null);
    setFineTuned([]);
  };
  const [message, setMessage] = React.useState<string | null>(null);
  const shownAppearance = editing ?? resolveAppearance(settings.appearance, systemDark);
  const input = draft ?? selectedTheme(settings, shownAppearance).colors;
  const shown = React.useMemo(() => resolveColors(input, shownAppearance), [input, shownAppearance]);

  React.useEffect(() => {
    const query = systemDarkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  React.useEffect(() => applyColors(shown), [shown]);

  // Runs a write, then re-reads from disk so a load error clears only once the
  // files really load (a save fixes settings.json, not some other broken theme).
  const write = async (op: () => Promise<void>, next: Settings) => {
    try {
      await op();
    } catch (err) {
      setMessage((err as Error).message);
      return;
    }
    clearDraft();
    setMessage(null);
    const reloaded = await readSettings();
    setSettings(reloaded.loadError ? next : reloaded.settings);
    setLoadError(reloaded.loadError);
  };

  const choose = (next: Settings) => {
    // Files that failed to load are only overwritten by an explicit save.
    if (loadError) {
      setSettings(next);
      clearDraft();
      return;
    }
    void write(() => orkesterShell().saveSettings(stored(next)), next);
  };

  const setAppearance = (appearance: AppearanceSetting) => choose({ ...settings, appearance });

  const select = (appearance: ThemeAppearance, name: string) => choose({ ...settings, [THEME_SETTING_KEYS[appearance]]: name });

  /** Saves the edited colours (core three plus overrides) as a theme of the appearance being edited, and picks it for that appearance. */
  const saveAs = (rawName: string) => {
    if (!editing) return;
    const name = rawName.trim();
    const problem = themeNameProblem(name);
    if (problem) return setMessage(problem);
    const theme = { appearance: editing, colors: input };
    const next = { ...settings, [THEME_SETTING_KEYS[editing]]: name, themes: { ...settings.themes, [name]: theme } };
    void write(async () => {
      await orkesterShell().saveTheme(name, theme);
      await orkesterShell().saveSettings(stored(next));
    }, next);
  };

  const remove = (name: string) => {
    const { [name]: removed, ...rest } = settings.themes;
    const key = THEME_SETTING_KEYS[removed.appearance];
    const wasSelected = settings[key] === name;
    const next = { ...settings, [key]: wasSelected ? DEFAULT_THEME_NAMES[removed.appearance] : settings[key], themes: rest };
    void write(async () => {
      // Reset first, so settings.json never names a theme whose file is gone.
      if (wasSelected) await orkesterShell().saveSettings(stored(next));
      await orkesterShell().deleteTheme(name);
    }, next);
  };

  const setColor = (token: ColorToken, value: string) => {
    if (!(CORE_COLOR_TOKENS as readonly ColorToken[]).includes(token)) {
      setFineTuned((tokens) => [...new Set([...tokens, token])]);
      return setDraft({ ...input, [token]: value });
    }
    const kept = Object.fromEntries(fineTuned.filter((t) => Object.hasOwn(input, t)).map((t) => [t, input[t]]));
    setDraft({ background: input.background, text: input.text, primary: input.primary, ...kept, [token]: value });
  };

  /** Drops an override, so the token is derived again. */
  const resetColor = (token: ColorToken) => {
    const { [token]: _dropped, ...rest } = input;
    setFineTuned((tokens) => tokens.filter((t) => t !== token));
    setDraft(rest as ThemeColorInput);
  };

  /** Drops every override, so all derived tokens follow the core colours again. */
  const resetAllColors = () => {
    setFineTuned([]);
    setDraft({ background: input.background, text: input.text, primary: input.primary });
  };

  /** Starts (or, with null, ends) picking and editing the theme for one appearance; unsaved edits are dropped. */
  const edit = (appearance: ThemeAppearance | null) => {
    setEditing(appearance);
    clearDraft();
    setMessage(null);
  };

  return { settings, loadError, editing, draft, input, shown, message, setAppearance, select, saveAs, remove, setColor, resetColor, resetAllColors, edit };
}

export type SettingsState = ReturnType<typeof useSettings>;
