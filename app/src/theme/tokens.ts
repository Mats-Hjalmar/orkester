// Desktop (Vite/react-native-web) tokens: every colour is a CSS custom property,
// so switching theme is just setting variables on the document root (see
// src/desktop/settings.ts). Metro takes tokens.native.ts, the static palette.
import { COLOR_TOKENS, cssVarName, type ColorToken, type ThemeColors } from '@orkester/core/theme';

export { radii, shadow, space, FRAME, TOP_BAR_HEIGHT, FIXED_DARK } from '@orkester/core/theme';

const cssVar = (token: ColorToken) => `var(${cssVarName(token)})`;

export const colors = Object.fromEntries(COLOR_TOKENS.map((t) => [t, cssVar(t)])) as ThemeColors;

// react-native-web passes a colour through untouched only if it starts with
// `var(`, and drops color-mix(). --ork-mix is never set, so its fallback wins.
export const ink = (a: number) => `var(--ork-mix, color-mix(in srgb, ${cssVar('text')} ${a * 100}%, transparent))`;
