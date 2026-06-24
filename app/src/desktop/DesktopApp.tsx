import React from 'react';
import { View } from 'react-native';
import TopBar from './TopBar';
import Sidebar from './Sidebar';
import DesktopHome from './Home';
import DesktopNowPlaying from './NowPlaying';
import TransportBar from './TransportBar';
import { colors } from '../theme/tokens';
import { useStore } from '../state/store';

// The full controller as a real web app: top bar, Rooms sidebar, Home/Now-Playing
// main panel, and a persistent transport bar — filling the browser viewport.
export default function DesktopApp() {
  const { state } = useStore();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TopBar />
      <View style={{ flex: 1, flexDirection: 'row', minHeight: 0 }}>
        <Sidebar />
        <View style={{ flex: 1, minWidth: 0 }}>
          {state.mView === 'home' ? <DesktopHome /> : <DesktopNowPlaying />}
        </View>
      </View>
      <TransportBar />
    </View>
  );
}
