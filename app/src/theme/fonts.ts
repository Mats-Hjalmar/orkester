import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import {
  Manrope_200ExtraLight,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { FragmentMono_400Regular } from '@expo-google-fonts/fragment-mono';

// The map handed to useFonts(). Keys are the fontFamily names referenced in styles.
export const fontMap = {
  InstrumentSerif_400Regular,
  Manrope_200ExtraLight,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  FragmentMono_400Regular,
};

// Display (Instrument Serif) and mono (Fragment Mono) ship 400 only — size and
// letter-spacing carry the emphasis, never a heavier weight.
export const font = {
  display: 'InstrumentSerif_400Regular',
  mono: 'FragmentMono_400Regular',
  body: 'Manrope_400Regular',
  bodyExtraLight: 'Manrope_200ExtraLight',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
} as const;
