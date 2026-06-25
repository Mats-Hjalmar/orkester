import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import { ChevronRight, Home, Play, Plus, Search, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, groupCount, idleRooms } from '../state/selectors';
import { TopologyNotice, topologyPhase } from '../components/TopologyState';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

function NavItem({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: radii.md,
        backgroundColor: active ? colors.fg : pressed ? ink(0.04) : 'transparent',
      })}
    >
      {icon}
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 14, color: active ? colors.bgPaper : colors.fg }}>{label}</Text>
    </Pressable>
  );
}

export default function Sidebar() {
  const store = useStore();
  const { state, config, getTrack, groupName, groupVol, roomName, setView, selectGroup, setGroupVol, startGroup } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const home = state.mView === 'home';
  const now = state.mView === 'nowplaying';
  const idle = idleRooms(store);
  const phase = topologyPhase(state.topologyStatus, state.rooms.length > 0);

  return (
    <View style={{ width: 250, borderRightWidth: 1, borderRightColor: ink(0.07), backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 3 }} showsVerticalScrollIndicator={false}>
        <NavItem label="Listen" active={home} onPress={() => setView('home')} icon={<Home size={19} color={home ? colors.bgPaper : colors.fg} />} />
        <NavItem label="Now Playing" active={now} onPress={() => setView('nowplaying')} icon={<Speaker size={19} color={now ? colors.bgPaper : colors.fg} />} />
        {/* Search/browse is deferred — visible but inert. */}
        <View style={{ opacity: 0.45 }}>
          <NavItem label="Search" icon={<Search size={19} color={colors.fg} />} />
        </View>

        <Text style={[type.eyebrow, { paddingHorizontal: 12, paddingTop: 22, paddingBottom: 8 }]}>Rooms</Text>

        {phase !== 'ready' && (
          <View style={{ paddingHorizontal: 8, paddingBottom: 6 }}>
            <TopologyNotice phase={phase} error={state.topologyError} compact />
          </View>
        )}

        {phase === 'ready' && state.groups.map((g) => {
          const tr = getTrack(g.trackId);
          const tActive = g.id === state.activeGroupId;
          const playingText = tr.id === PLACEHOLDER_TRACK_ID
            ? 'Nothing playing'
            : (g.isPlaying ? '' : 'Paused · ') + tr.title + ' · ' + tr.artist;
          const vol = (g.muted ? 0 : groupVol(g)) / 100;
          return (
            <View key={g.id} style={{ borderRadius: radii.lg, backgroundColor: tActive ? colors.bgPaper : 'transparent', borderWidth: 1, borderColor: tActive ? ink(0.12) : 'transparent', marginBottom: 6, padding: 5 }}>
              <Pressable onPress={() => selectGroup(g.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 7, borderRadius: 11 }}>
                <CoverArt size={36} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.sm} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 13.5, color: colors.fg, flexShrink: 1 }}>{groupName(g)}</Text>
                    {g.isPlaying && <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: accent }} />}
                  </View>
                  <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 11, color: colors.fgSubtle, marginTop: 2 }}>{playingText}</Text>
                </View>
              </Pressable>
              <View style={{ marginLeft: 54, marginRight: 8, marginBottom: 4 }}>
                <TrackBar value={vol} onScrub={(f) => setGroupVol(g.id, f)} trackColor={ink(0.1)} fillColor={colors.fg} height={4} />
              </View>
            </View>
          );
        })}

        {phase === 'ready' && idle.length > 0 && <Text style={[type.eyebrow, { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }]}>Not playing</Text>}
        {phase === 'ready' && idle.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radii.md }}>
            <Speaker size={18} color={colors.fgSubtle} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 13.5, color: colors.fg }}>{r.name}</Text>
              <Text style={{ fontFamily: font.body, fontSize: 11, color: colors.fgSubtle, marginTop: 1 }}>Not playing</Text>
            </View>
            <Pressable onPress={() => startGroup(r.id)} style={({ pressed }) => ({ width: 28, height: 28, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Play size={13} fill={accentText} />
            </Pressable>
          </View>
        ))}

        {/* "Add a room" (pairing a new speaker) is deferred — visible but inert. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, marginTop: 6, opacity: 0.45 }}>
          <Plus size={18} color={colors.fgMuted} />
          <Text style={{ fontFamily: font.body, fontSize: 13.5, color: colors.fgMuted }}>Add a room</Text>
        </View>
      </ScrollView>
    </View>
  );
}
