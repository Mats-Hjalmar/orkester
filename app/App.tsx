import React from 'react';
import { Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { fontMap } from './src/theme/fonts';
import { colors } from './src/theme/tokens';
import { StoreProvider } from './src/state/store';
import type { MobileStackParamList } from './src/navigation';
import NowPlaying from './src/screens/NowPlaying';
import Rooms from './src/screens/Rooms';
import Search from './src/screens/Search';
import Speakers from './src/screens/Speakers';

// This is the native (iOS / Android) phone app. The desktop/web controller is the
// Electron app (desktop/), which reuses app/src/desktop and injects its own
// IPC-backed engine — it does not go through this entry. The browser can't discover
// or control speakers, so there is no web target here.

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

function MobileApp() {
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <NavigationContainer>
          <MobileNav />
        </NavigationContainer>
      </View>
    </SafeAreaProvider>
  );
}

// The app runs the Sonos engine IN-PROCESS via app/src/native — Metro resolves the
// react-native-zeroconf-backed impl on a device (discovery is mDNS/Bonjour, not
// SSDP; see app/src/native/README.md). Per findings/mobile-discovery-mdns.md the
// mDNS spike passed on both platforms (2026-06-29). There is no mock fallback:
// without speakers on the LAN the UI surfaces an empty/error state, never fake data.
function makeApi() {
  // Lazy require so the native discovery module is only pulled in at runtime on a
  // device; the web build resolves the throwing stub (web is unsupported).
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { makeNativeApi } = require('./src/native/makeNativeApi');
  return makeNativeApi();
}

const api = makeApi();

// Dev gate for the mDNS discovery spike (findings/mobile-discovery-mdns.md). Build
// with EXPO_PUBLIC_RUN_SPIKE=1 to boot straight into SpikeScreen, which auto-runs
// react-native-zeroconf discovery and logs `[SPIKE] …` to logcat. Default off.
const RUN_SPIKE = process.env.EXPO_PUBLIC_RUN_SPIKE === '1';

export default function App() {
  const [loaded] = useFonts(fontMap);

  // Spike entry — native only (the .native SpikeScreen never enters a bundle on
  // web; the lazy require keeps react-native-zeroconf out). RUN_SPIKE is a
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
      <MobileApp />
      <StatusBar style="dark" />
    </StoreProvider>
  );
}
