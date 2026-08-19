import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import RoomGroupCard from '../components/RoomGroupCard';
import { ScreenScroll } from '../components/phone/Screen';
import { Refresh, Wave } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { sortedGroups } from '../state/selectors';
import { TopologyNotice, topologyPhase } from '../components/TopologyState';

export default function Rooms() {
  const store = useStore();
  const { state, refresh, refreshing } = store;
  const groups = sortedGroups(store);
  const phase = topologyPhase(state.topologyStatus, groups.length > 0);

  const playing = groups.filter((g) => g.isPlaying).length;
  const subtitle =
    phase !== 'ready'
      ? 'multi-room sound'
      : playing === 0
        ? `${groups.length} ${groups.length === 1 ? 'group' : 'groups'} · nothing playing`
        : `${playing} of ${groups.length} playing`;

  return (
    <ScreenScroll refreshing={refreshing} onRefresh={refresh}>
      {/* Wordmark header, mirroring the desktop TopBar's identity. Refresh is a
          compact icon here because pull-to-refresh is the primary gesture — but it
          stays visible, since the Sonos connection genuinely drifts. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Wave size={22} color={colors.fg} />
            <Text maxFontSizeMultiplier={1.6} style={[type.wordmark, { fontSize: 30 }]}>orkester</Text>
          </View>
          <Text numberOfLines={1} style={[type.small, { marginTop: 4, color: colors.fgSubtle }]}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          onPress={refresh}
          disabled={refreshing}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Refresh speakers"
          accessibilityState={{ disabled: refreshing }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: ink(0.12),
            backgroundColor: colors.bgPaper,
            opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
          })}
        >
          {refreshing ? <ActivityIndicator size="small" color={colors.fgMuted} /> : <Refresh size={18} color={colors.fg} />}
        </Pressable>
      </View>

      {phase !== 'ready' ? (
        <View style={{ marginTop: 24 }}>
          <TopologyNotice phase={phase} error={state.topologyError} />
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 24 }}>
          <Text style={type.eyebrow}>Groups</Text>
          {groups.map((g) => (
            <RoomGroupCard key={g.id} group={g} />
          ))}
          <Text style={[type.small, { color: colors.fgFaint, marginTop: 2 }]}>
            Each group plays its own thing. Tap one to control it.
          </Text>
        </View>
      )}
    </ScreenScroll>
  );
}
