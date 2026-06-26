import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Refresh, Search, Wave } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import { useStore } from '../state/store';

// Wordmark + search affordance + a manual refresh (the Sonos connection drifts).
export default function TopBar() {
  const { refresh, refreshing } = useStore();
  return (
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: ink(0.07) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Wave size={22} color={colors.fg} />
        <Text style={[type.wordmark, { fontSize: 24 }]}>orkester</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgSubtle, paddingBottom: 1 }}>multi-room sound</Text>
      </View>
      {/* Search/browse is deferred with the real engine — the field is inert. */}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ width: 380, height: 38, borderRadius: radii.pill, backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: ink(0.1), flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, opacity: 0.6 }}>
          <Search size={17} color={colors.fgSubtle} />
          <Text style={{ fontFamily: font.body, fontSize: 14, color: colors.fgSubtle }}>Search artists, albums, stations</Text>
        </View>
      </View>
      {/* Manual reconnect + reload. Disabled (with a spinner) while in flight. */}
      <Pressable
        testID="refresh-button"
        onPress={refresh}
        disabled={refreshing}
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 8,
          height: 38, paddingHorizontal: 14, borderRadius: radii.pill,
          borderWidth: 1, borderColor: ink(0.12), backgroundColor: colors.bgPaper,
          opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
        })}
      >
        {refreshing ? <ActivityIndicator size="small" color={colors.fgMuted} /> : <Refresh size={17} color={colors.fg} />}
        <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Text>
      </Pressable>
    </View>
  );
}
