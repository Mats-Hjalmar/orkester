import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import RoomGroupCard from '../components/RoomGroupCard';
import { Play, Refresh, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, idleRooms } from '../state/selectors';
import { TopologyNotice, topologyPhase } from '../components/TopologyState';

export default function Rooms() {
  const store = useStore();
  const { state, config, startGroup, refresh, refreshing } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const idle = idleRooms(store);
  const phase = topologyPhase(state.topologyStatus, state.rooms.length > 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      {/* Title + a manual reconnect/reload — the Sonos connection drifts, so the
          user can force a re-discover + re-fetch (mirrors the desktop TopBar). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text style={type.displayXL}>Rooms</Text>
        <Pressable
          onPress={refresh}
          disabled={refreshing}
          hitSlop={8}
          accessibilityLabel="Refresh"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 40,
            paddingHorizontal: 14,
            borderRadius: radii.pill,
            borderWidth: 1,
            borderColor: ink(0.12),
            backgroundColor: colors.bgPaper,
            opacity: refreshing ? 0.6 : pressed ? 0.7 : 1,
          })}
        >
          {refreshing ? <ActivityIndicator size="small" color={colors.fgMuted} /> : <Refresh size={16} color={colors.fg} />}
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Text>
        </Pressable>
      </View>
      <Text style={[type.bodyMuted, { marginTop: 8 }]}>
        Each group plays its own thing. Tap a group to control it; tap a speaker to move it.
      </Text>

      {phase !== 'ready' && (
        <View style={{ marginTop: 22 }}>
          <TopologyNotice phase={phase} error={state.topologyError} />
        </View>
      )}

      {phase === 'ready' && (
      <View style={{ gap: 14, marginTop: 22 }}>
        {state.groups.map((g) => (
          <RoomGroupCard key={g.id} group={g} />
        ))}

        {idle.length > 0 && <Text style={[type.eyebrow, { marginTop: 6 }]}>Not playing</Text>}
        {idle.map((r) => (
          <View
            key={r.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: ink(0.1), borderRadius: 18 }}
          >
            <Speaker size={20} color={colors.fgSubtle} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.title, { fontSize: 15 }]}>{r.name}</Text>
              <Text style={[type.small, { marginTop: 2, color: colors.fgSubtle }]}>Not playing</Text>
            </View>
            <Pressable
              onPress={() => startGroup(r.id)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: accent, opacity: pressed ? 0.8 : 1 })}
            >
              <Play size={13} fill={accentText} />
              <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: accentText }}>Play here</Text>
            </Pressable>
          </View>
        ))}
      </View>
      )}
    </ScrollView>
  );
}
