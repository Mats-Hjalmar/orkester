import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Home, Search, Speaker } from '../icons';
import { colors, ink } from '../theme/tokens';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';

function Tab({ label, active, onPress, children }: { label: string; active: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      {children}
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 10.5, color: active ? colors.fg : colors.fgSubtle }}>{label}</Text>
    </Pressable>
  );
}

// Listen · Search · Rooms — shown on Home/Rooms (hidden in full Now Playing).
export default function TabBar() {
  const { state, setView } = useStore();
  const v = state.mView;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 30,
        paddingHorizontal: 24,
        borderTopWidth: 1,
        borderTopColor: ink(0.07),
        backgroundColor: colors.bg,
      }}
    >
      <Tab label="Listen" active={v === 'home'} onPress={() => setView('home')}>
        <Home size={22} color={v === 'home' ? colors.fg : colors.fgSubtle} />
      </Tab>
      <Tab label="Search" active={v === 'search'} onPress={() => setView('search')}>
        <Search size={22} color={v === 'search' ? colors.fg : colors.fgSubtle} />
      </Tab>
      <Tab label="Rooms" active={v === 'rooms'} onPress={() => setView('rooms')}>
        <Speaker size={22} color={v === 'rooms' ? colors.fg : colors.fgSubtle} />
      </Tab>
    </View>
  );
}
