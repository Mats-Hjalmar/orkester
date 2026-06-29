import React from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontMap } from './src/theme/fonts';
import { colors, radii, shadow, FRAME } from './src/theme/tokens';
import { StoreProvider } from './src/state/store';
import { MockApi } from '@orkester/core/state';
import type { MobileStackParamList } from './src/navigation';
import DesktopApp from './src/desktop/DesktopApp';
import NowPlaying from './src/screens/NowPlaying';
import Rooms from './src/screens/Rooms';
import Search from './src/screens/Search';
import Speakers from './src/screens/Speakers';

// Web ships the desktop controller; the native app ships the phone UI. On web a
// `?m=1` query forces the phone UI for previewing it in a browser during dev.
const isWeb = Platform.OS === 'web';
const forceMobileOnWeb = isWeb && typeof window !== 'undefined' && /[?&]m=1\b/.test(window.location.search);
const useDesktop = isWeb && !forceMobileOnWeb;

// Phone composition — rooms-first drill-down owned by React Navigation. The stack
// (Rooms root → Room detail → Search / Speakers) handles the back button, Android
// hardware back, and iOS swipe-back automatically. There is no global tab bar or
// mini-player: in a multi-room manager nothing is globally "now playing", so each
// screen is full-frame and the stack navigates rooms → room → action.
const Stack = createNativeStackNavigator<MobileStackParamList>();

function MobileNav() {
  return (
    <Stack.Navigator
      initialRouteName="Rooms"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="Rooms" component={Rooms} />
      <Stack.Screen name="Room" component={NowPlaying} />
      <Stack.Screen name="Search" component={Search} />
      <Stack.Screen name="Speakers" component={Speakers} />
    </Stack.Navigator>
  );
}

// On a device the phone UI fills the screen; on web (dev preview) it sits inside
// a centred 390×844 phone frame. NavigationContainer has no `linking` config, so
// the web preview keeps an in-memory stack (it does not rewrite the URL).
function MobileApp() {
  const { width, height } = useWindowDimensions();
  const nav = (
    <SafeAreaProvider>
      <NavigationContainer>
        <MobileNav />
      </NavigationContainer>
    </SafeAreaProvider>
  );
  if (!isWeb) return <View style={{ flex: 1, backgroundColor: colors.bg }}>{nav}</View>;
  const w = Math.min(FRAME.width, width);
  const h = Math.min(FRAME.height, height - 24);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgCream, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: w, height: h, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.bg, boxShadow: shadow.lg } as any}>
        {nav}
      </View>
    </View>
  );
}

// The app defaults to MockApi so `expo export --platform web` and on-device demo
// runs work with NO speakers. The native, in-process engine Api lives behind
// app/src/native (Metro resolves the node-free stub on web, the
// react-native-zeroconf-backed real one on a device — discovery is mDNS/Bonjour,
// not SSDP; see app/src/native/README.md). It is SPIKE-GATED PER PLATFORM: turn a
// platform on below only after the mDNS spike passes on that platform's hardware.
// The Electron desktop injects its own IPC-backed engine Api instead.
const NATIVE_ENGINE_PLATFORMS: Record<string, boolean> = {
  // Both enabled 2026-06-29 after the mDNS spike passed: react-native-zeroconf
  // loaded under RN 0.81 New Arch and found all 13 Sonos speakers on the LAN
  // (findings/mobile-discovery-mdns.md) — Android on real hardware, iOS on the
  // Simulator (which shares the Mac's LAN). CAVEAT: the iOS Simulator does NOT
  // enforce the Local Network privacy prompt; on a real iPhone the first launch
  // shows it (NSLocalNetworkUsageDescription is set) and discovery returns nothing
  // until the user taps Allow — surface that "no speakers" state, never silently.
  ios: true,
  android: true,
};

function makeApi() {
  if (Platform.OS !== 'web' && NATIVE_ENGINE_PLATFORMS[Platform.OS]) {
    // Lazy require so the native discovery module is only pulled in on a device
    // when its platform is enabled; the web bundle resolves the node-free stub.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { makeNativeApi } = require('./src/native/makeNativeApi');
    return makeNativeApi();
  }
  return new MockApi();
}

const api = makeApi();

// Dev gate for the mDNS discovery spike (findings/mobile-discovery-mdns.md). Build
// with EXPO_PUBLIC_RUN_SPIKE=1 to boot straight into SpikeScreen, which auto-runs
// react-native-zeroconf discovery and logs `[SPIKE] …` to logcat — the on-device
// gate before NATIVE_ENGINE_PLATFORMS is turned on. Default off; safe to ship.
const RUN_SPIKE = process.env.EXPO_PUBLIC_RUN_SPIKE === '1';

export default function App() {
  const [loaded] = useFonts(fontMap);

  // Spike entry — native only (the .native SpikeScreen never enters the web
  // bundle; lazy require keeps react-native-zeroconf out of web). RUN_SPIKE is a
  // build-time constant, so this branch is stable across renders (hook order safe).
  if (RUN_SPIKE && Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const SpikeScreen = require('./src/native/SpikeScreen').default;
    return <SpikeScreen />;
  }

  // Gate on fonts so nothing flashes in a system fallback before the brand
  // faces load.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <StoreProvider api={api}>
      {useDesktop ? <DesktopApp /> : <MobileApp />}
      <StatusBar style="dark" />
    </StoreProvider>
  );
}
