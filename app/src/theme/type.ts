import { TextStyle } from 'react-native';
import { colors } from './tokens';
import { font } from './fonts';

// Editorial type presets. clamp()-based fluid sizing in the web mockup is
// flattened to fixed sizes tuned for the 390px frame.
export const type: Record<string, TextStyle> = {
  // Instrument Serif display
  displayXL: { fontFamily: font.display, fontSize: 34, lineHeight: 36, letterSpacing: -0.7, color: colors.text },
  displayLg: { fontFamily: font.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  displayMd: { fontFamily: font.display, fontSize: 26, lineHeight: 28, letterSpacing: -0.5, color: colors.text },
  displaySm: { fontFamily: font.display, fontSize: 21, lineHeight: 24, letterSpacing: -0.3, color: colors.text },
  wordmark: { fontFamily: font.display, fontSize: 22, lineHeight: 22, color: colors.text },

  // Manrope body
  title: { fontFamily: font.bodySemiBold, fontSize: 15, lineHeight: 18, color: colors.text },
  body: { fontFamily: font.body, fontSize: 14, lineHeight: 19, color: colors.text },
  bodyMuted: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary },
  small: { fontFamily: font.body, fontSize: 12, lineHeight: 16, color: colors.textSecondary },

  // All-caps eyebrow label
  eyebrow: {
    fontFamily: font.bodyMedium,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.textTertiary,
  },

  // Fragment Mono
  mono: { fontFamily: font.mono, fontSize: 11, color: colors.textSecondary },
};
