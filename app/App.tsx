import React from 'react';
import { AppState, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fontMap } from './src/theme/fonts';
import { colors, radii } from './src/theme/tokens';
import { StoreProvider, useStore } from './src/state/store';
import type { MobileStackParamList } from './src/navigation';
import NowPlaying from './src/screens/NowPlaying';
import Rooms from './src/screens/Rooms';
import Search from './src/screens/Search';
import Speakers from './src/screens/Speakers';

// This is the native (iOS / Android) phone app. The desktop/web controller is the
// Electron app (desktop/), which reuses app/src/desktop and injects its own
// IPC-backed engine — it does not go through this entry. The browser can't discover
// or control speakers, so there is no web target here.

// Phone composition — a rooms-first drill-down owned by React Navigation, which
// handles the back stack, the Android hardware back button, and iOS swipe-back.
// There is no global tab bar or mini-player: in a multi-room manager nothing is
// globally "now playing".
//
// Speakers and Search are presented OVER the room rather than pushed past it,
// because both act ON that room — Speakers as a native sheet sized to its content,
// Search as a full-height modal (it owns a keyboard and an unbounded result list, so
// a detented sheet fights it).
const Stack = createNativeStackNavigator<MobileStackParamList>();

function MobileNav() {
  return (
    <Stack.Navigator
      initialRouteName="Rooms"
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
    >
      <Stack.Screen name="Rooms" component={Rooms} />
      <Stack.Screen name="Room" component={NowPlaying} />
      <Stack.Screen
        name="Speakers"
        component={Speakers}
        options={{
          presentation: 'formSheet',
          // Explicit detents rather than 'fitToContents': the content height varies a
          // lot (one speaker vs eight with their own sliders), and a flexing
          // ScrollView has no intrinsic height to fit to.
          sheetAllowedDetents: [0.6, 0.95],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: radii.xl,
        }}
      />
      <Stack.Screen name="Search" component={Search} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}

// Polling is the ONLY freshness mechanism (the engine has no UPnP eventing), so it
// keeps hitting the speakers from a screen nobody is looking at — and every topology
// tick can escalate to a discovery sweep. Suspend it while the app is away and let
// the store run one atomic refresh on the way back.
function PollingGate() {
  const { setPollingEnabled } = useStore();
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setPollingEnabled(next === 'active');
    });
    return () => sub.remove();
  }, [setPollingEnabled]);
  return null;
}

function MobileApp() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
        <PollingGate />
        <NavigationContainer>
          <MobileNav />
        </NavigationContainer>
      </GestureHandlerRootView>
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
      {/* Every surface is the light Noira paper, so the bars stay dark-on-light. */}
      <StatusBar style="dark" />
    </StoreProvider>
  );
}
