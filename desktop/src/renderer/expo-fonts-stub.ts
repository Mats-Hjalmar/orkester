// Renderer stub for the @expo-google-fonts/* packages.
//
// Those packages' entry does `require("./<weight>/<File>.ttf")` — a Metro-only
// asset require. Bundled into the browser renderer it throws
// `ReferenceError: require is not defined` at module-eval, which blanks the whole
// app. The desktop UI never needs the .ttf modules: it only uses the font-FAMILY
// NAME strings (app/src/theme/fonts.ts's `font` map uses string literals; the web
// faces are provided via CSS @font-face). So we alias all three font packages to
// this stub, which exports exactly the named constants fonts.ts imports — as
// their own (harmless) string values — plus a no-op useFonts.
export const InstrumentSerif_400Regular = 'InstrumentSerif_400Regular';
export const Manrope_200ExtraLight = 'Manrope_200ExtraLight';
export const Manrope_300Light = 'Manrope_300Light';
export const Manrope_400Regular = 'Manrope_400Regular';
export const Manrope_500Medium = 'Manrope_500Medium';
export const Manrope_600SemiBold = 'Manrope_600SemiBold';
export const Manrope_700Bold = 'Manrope_700Bold';
export const Manrope_800ExtraBold = 'Manrope_800ExtraBold';
export const FragmentMono_400Regular = 'FragmentMono_400Regular';
export const useFonts = (): [boolean, null] => [true, null];
