import React from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { fontMap } from './src/theme/fonts';
import { colors, radii, shadow, FRAME } from './src/theme/tokens';
import { StoreProvider, useStore } from './src/state/store';
import DesktopApp from './src/desktop/DesktopApp';
import NowPlaying from './src/screens/NowPlaying';
import Home from './src/screens/Home';
import Rooms from './src/screens/Rooms';
import Search from './src/screens/Search';
import MiniPlayer from './src/components/MiniPlayer';
import TabBar from './src/components/TabBar';

// Web ships the desktop controller; the native app ships the phone UI. On web a
// `?m=1` query forces the phone UI for previewing it in a browser during dev.
const isWeb = Platform.OS === 'web';
const forceMobileOnWeb = isWeb && typeof window !== 'undefined' && /[?&]m=1\b/.test(window.location.search);
const useDesktop = isWeb && !forceMobileOnWeb;

// Phone composition. Full Now Playing owns the frame; the other tabs share it
// with a persistent mini-player + tab bar (the mockup's mShowMini).
function MobileShell() {
  const { state } = useStore();
  const v = state.mView;
  if (v === 'nowplaying') return <NowPlaying />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, minHeight: 0 }}>
        {v === 'home' && <Home />}
        {v === 'rooms' && <Rooms />}
        {v === 'search' && <Search />}
      </View>
      <MiniPlayer />
      <TabBar />
    </View>
  );
}

// On a device the phone UI fills the screen; on web (dev preview) it sits inside
// a centred 390×844 phone frame.
function MobileApp() {
  const { width, height } = useWindowDimensions();
  if (!isWeb) return <View style={{ flex: 1, backgroundColor: colors.bg }}><MobileShell /></View>;
  const w = Math.min(FRAME.width, width);
  const h = Math.min(FRAME.height, height - 24);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgCream, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: w, height: h, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.bg, boxShadow: shadow.lg } as any}>
        <MobileShell />
      </View>
    </View>
  );
}

export default function App() {
  const [loaded] = useFonts(fontMap);

  // Gate on fonts so nothing flashes in a system fallback before the brand
  // faces load.
  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <StoreProvider>
      {useDesktop ? <DesktopApp /> : <MobileApp />}
      <StatusBar style="dark" />
    </StoreProvider>
  );
}
