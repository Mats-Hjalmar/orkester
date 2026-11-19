import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Cog, OrkesterMark, Refresh } from '../icons';
import { colors, ink, radii, TOP_BAR_HEIGHT } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { NO_DRAG, orkesterShell } from './shell';

// Clears the traffic lights that desktop/src/main/index.ts places at x=20.
const MAC_TRAFFIC_LIGHT_INSET = 88;

const pill = { ...NO_DRAG, height: 38, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12), backgroundColor: colors.surface } as const;

// Wordmark + a manual refresh (the Sonos connection drifts) + settings.
export default function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { refresh, refreshing } = useStore();
  const { isMac } = orkesterShell();
  return (
    <View
      style={{
        height: TOP_BAR_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: ink(0.07),
        ...(isMac ? { paddingLeft: MAC_TRAFFIC_LIGHT_INSET, WebkitAppRegion: 'drag' } : null),
      } as object}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <OrkesterMark size={26} />
        <Text style={[type.wordmark, { fontSize: 24 }]}>orkester</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.textTertiary, paddingBottom: 1 }}>multi-room sound</Text>
      </View>
      <View style={{ flex: 1 }} />
      {/* Manual reconnect + reload. Disabled (with a spinner) while in flight. */}
      <Pressable
        testID="refresh-button"
        onPress={refresh}
        disabled={refreshing}
        hitSlop={8}
        style={({ pressed }) => ({
          ...pill, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14,
          opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
        })}
      >
        {refreshing ? <ActivityIndicator size="small" color={colors.textSecondary} /> : <Refresh size={17} color={colors.text} />}
        <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.text }}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Text>
      </Pressable>
      <Pressable
        testID="settings-button"
        onPress={onOpenSettings}
        hitSlop={8}
        accessibilityLabel="Settings"
        style={({ pressed }) => ({ ...pill, width: 38, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
      >
        <Cog size={17} color={colors.text} />
      </Pressable>
    </View>
  );
}
