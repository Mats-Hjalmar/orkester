import React from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  APPEARANCE_SETTINGS,
  COLOR_TOKENS,
  THEME_APPEARANCES,
  THEME_SETTING_KEYS,
  allThemes,
  isHexColor,
  selectedTheme,
  type AppearanceSetting,
  type ColorToken,
  type ThemeAppearance,
  type ThemeColors,
} from '@orkester/core/theme';
import { Check, ChevronRight, Close, Monitor, Moon, Sun, Trash } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import type { SettingsState } from './settings';
import { NO_DRAG } from './shell';

// One fixed card size, so moving between pages (or a banner appearing) never resizes it.
const CARD_WIDTH = 640;
const CARD_HEIGHT = 640;

const APPEARANCE_LABELS: Record<AppearanceSetting, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const APPEARANCE_ICONS = { system: Monitor, light: Sun, dark: Moon } satisfies Record<AppearanceSetting, unknown>;

// Settings: a short list whose theme rows open a page in the same card. Which
// page is open is the state's `editing` appearance, so leaving a page (back,
// Escape, backdrop, ×) also ends its preview and drops unsaved theme edits.
export default function SettingsModal({ state, onClose }: { state: SettingsState; onClose: () => void }) {
  const { settings, loadError, editing, edit, setAppearance } = state;

  const close = React.useCallback(() => {
    edit(null);
    onClose();
  }, [edit, onClose]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <View style={{ ...NO_DRAG, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable testID="settings-backdrop" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bgDeep, opacity: 0.5, cursor: 'default' } as any} />
      <View
        testID="settings-modal"
        style={{
          width: CARD_WIDTH, height: CARD_HEIGHT, maxWidth: '90%', maxHeight: '86%',
          borderRadius: radii.xl, borderWidth: 1, borderColor: ink(0.1), backgroundColor: colors.bgPaper,
          boxShadow: shadow.lg, overflow: 'hidden',
        } as any}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 }}>
          {editing && (
            <Pressable testID="settings-back" onPress={() => edit(null)} hitSlop={8} accessibilityLabel="Back to settings" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, transform: [{ rotate: '180deg' }] })}>
              <ChevronRight size={22} color={colors.fgMuted} />
            </Pressable>
          )}
          <Text style={[type.displayMd, { flex: 1 }]}>{editing ? `${APPEARANCE_LABELS[editing]} theme` : 'Settings'}</Text>
          <Pressable testID="settings-close" onPress={close} hitSlop={8} accessibilityLabel="Close settings" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Close size={20} color={colors.fgMuted} />
          </Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12 }}>
          {loadError && (
            <View testID="settings-load-error" style={{ padding: 12, borderRadius: radii.md, borderWidth: 1, borderColor: colors.danger, gap: 4 }}>
              <Text style={{ fontFamily: font.mono, fontSize: 11, lineHeight: 16, color: colors.danger }}>{loadError}</Text>
              <Text style={type.small}>Using the default themes. Fix the file and restart. Saving a theme here writes only that theme’s file and settings.json.</Text>
            </View>
          )}
          {editing ? (
            <ThemePage state={state} appearance={editing} />
          ) : (
            <>
              <View style={{ ...row, justifyContent: 'space-between' }}>
                <Text style={type.title}>Appearance</Text>
                <View style={{ flexDirection: 'row', borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12), padding: 3, gap: 2 }}>
                  {APPEARANCE_SETTINGS.map((appearance) => {
                    const on = settings.appearance === appearance;
                    const Icon = APPEARANCE_ICONS[appearance];
                    const color = on ? colors.bgPaper : colors.fgMuted;
                    return (
                      <Pressable
                        key={appearance}
                        testID={`appearance-${appearance}`}
                        onPress={() => setAppearance(appearance)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        style={({ pressed }) => ({
                          height: 28, paddingHorizontal: 12, borderRadius: radii.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
                          backgroundColor: on ? colors.fg : pressed ? ink(0.06) : 'transparent',
                        })}
                      >
                        <Icon size={14} color={color} />
                        <Text style={{ fontFamily: font.bodyMedium, fontSize: 12, color }}>{APPEARANCE_LABELS[appearance]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              {THEME_APPEARANCES.map((appearance) => (
                <Pressable
                  key={appearance}
                  testID={`settings-${appearance}-theme-row`}
                  onPress={() => edit(appearance)}
                  style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({ ...row, backgroundColor: rowBg(pressed, hovered) })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={type.title}>{APPEARANCE_LABELS[appearance]} theme</Text>
                    <Text numberOfLines={1} style={type.small}>{settings[THEME_SETTING_KEYS[appearance]]}</Text>
                  </View>
                  <Swatches themeColors={selectedTheme(settings, appearance).colors} />
                  <ChevronRight size={18} color={colors.fgMuted} />
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const row = {
  flexDirection: 'row', alignItems: 'center', gap: 12,
  paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1, borderColor: ink(0.1),
} as const;

const rowBg = (pressed: boolean, hovered?: boolean) => (pressed ? ink(0.06) : hovered ? ink(0.03) : 'transparent');

// Pick the theme for one appearance, or edit the shown colours live and save them
// as a custom theme of that appearance.
function ThemePage({ state, appearance }: { state: SettingsState; appearance: ThemeAppearance }) {
  const { settings, draft, shown, message, select, saveAs, remove, setColor } = state;
  const selected = settings[THEME_SETTING_KEYS[appearance]];
  const [name, setName] = React.useState(Object.hasOwn(settings.themes, selected) ? selected : '');

  return (
    <>
      <Text style={type.eyebrow}>Themes</Text>
      <View style={{ gap: 6 }}>
        {Object.entries(allThemes(settings)).filter(([, theme]) => theme.appearance === appearance).map(([themeName, theme]) => {
          const active = themeName === selected;
          const custom = Object.hasOwn(settings.themes, themeName);
          return (
            <Pressable
              key={themeName}
              testID={`theme-${themeName}`}
              onPress={() => select(appearance, themeName)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                ...row, borderColor: active ? colors.fg : row.borderColor, backgroundColor: rowBg(pressed, hovered),
              })}
            >
              <View style={{ width: 18 }}>{active && <Check size={18} />}</View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={type.title}>{themeName}</Text>
                <Text style={type.small}>{custom ? (active && draft ? 'Custom · edited' : 'Custom') : 'Built-in'}</Text>
              </View>
              <Swatches themeColors={active && draft ? draft : theme.colors} />
              {custom ? (
                <Pressable testID={`delete-theme-${themeName}`} onPress={() => remove(themeName)} hitSlop={6} accessibilityLabel={`Delete ${themeName}`} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                  <Trash size={16} color={colors.fgMuted} />
                </Pressable>
              ) : (
                <View style={{ width: 16 }} />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={[type.eyebrow, { marginTop: 8 }]}>Colours{draft ? ' · unsaved' : ''}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
        {COLOR_TOKENS.map((token) => (
          <ColorField key={token} token={token} value={shown[token]} onChange={(v) => setColor(token, v)} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <TextInput
          testID="theme-name-input"
          value={name}
          onChangeText={setName}
          onSubmitEditing={() => saveAs(name)}
          placeholder="Theme name"
          placeholderTextColor={colors.fgSubtle}
          style={{
            flex: 1, height: 38, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12),
            fontFamily: font.body, fontSize: 13, color: colors.fg, outlineStyle: 'none',
          } as object}
        />
        <Pressable
          testID="save-theme-button"
          onPress={() => saveAs(name)}
          style={({ pressed }) => ({
            height: 38, paddingHorizontal: 16, borderRadius: radii.pill, justifyContent: 'center',
            backgroundColor: colors.accent, opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 13, color: colors.accentText }}>Save theme</Text>
        </Pressable>
      </View>
      {message && <Text testID="settings-message" style={{ fontFamily: font.bodyMedium, fontSize: 12, color: colors.danger }}>{message}</Text>}
    </>
  );
}

function Swatches({ themeColors }: { themeColors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', borderRadius: radii.sm, overflow: 'hidden', borderWidth: 1, borderColor: ink(0.1) }}>
      {COLOR_TOKENS.map((token) => (
        <View key={token} style={{ width: 12, height: 22, backgroundColor: themeColors[token] }} />
      ))}
    </View>
  );
}

// A token's colour as a native picker plus a hex field. The field keeps what is
// typed and only commits a complete #RRGGBB.
function ColorField({ token, value, onChange }: { token: ColorToken; value: string; onChange: (value: string) => void }) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  const commit = (v: string) => {
    setText(v);
    if (isHexColor(v)) onChange(v.toUpperCase());
  };

  return (
    <View style={{ width: '50%', flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 }}>
      <input
        type="color"
        data-testid={`color-input-${token}`}
        value={value}
        onChange={(e) => commit(e.target.value)}
        style={{ width: 28, height: 28, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
      />
      <Text numberOfLines={1} style={[type.body, { flex: 1 }]}>{token}</Text>
      <TextInput
        testID={`color-hex-${token}`}
        value={text}
        onChangeText={commit}
        maxLength={7}
        autoCapitalize="characters"
        style={{
          width: 84, height: 30, paddingHorizontal: 10, borderRadius: radii.sm, borderWidth: 1,
          borderColor: isHexColor(text) ? ink(0.12) : colors.danger,
          fontFamily: font.mono, fontSize: 12, color: colors.fg, outlineStyle: 'none',
        } as object}
      />
    </View>
  );
}
