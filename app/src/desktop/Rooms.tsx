import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import GroupCard from './GroupCard';
import { Play, Plus, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, idleRooms } from '../state/selectors';
import { TopologyNotice, topologyPhase } from '../components/TopologyState';

// The rooms-first HOME surface: every active group is a card controlled in place,
// and every idle room offers "Play here". No global Now Playing, no transport
// singleton — the whole household is visible and controllable at once.
export default function DesktopRooms({ onOpenGroup }: { onOpenGroup: (gid: string) => void }) {
  const store = useStore();
  const { state, config, roomName, startGroup } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const phase = topologyPhase(state.topologyStatus, state.rooms.length > 0);
  const idle = idleRooms(store);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 32, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Text style={type.eyebrow}>Your home</Text>
      <Text style={{ fontFamily: font.display, fontSize: 46, lineHeight: 48, letterSpacing: -1, color: colors.fg, marginTop: 8 }}>Rooms</Text>
      <Text style={{ fontFamily: font.body, fontSize: 15, color: colors.fgMuted, marginTop: 8, maxWidth: 560 }}>
        Every group, controlled in place. Open a card for the full Now Playing.
      </Text>

      {phase !== 'ready' && (
        <View style={{ marginTop: 28, maxWidth: 520 }}>
          <TopologyNotice phase={phase} error={state.topologyError} />
        </View>
      )}

      {phase === 'ready' && (
        <>
          {state.groups.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 22, marginTop: 28 }}>
              {state.groups.map((g) => (
                <View key={g.id} style={{ width: 420, maxWidth: '100%' } as any}>
                  <GroupCard group={g} onOpen={() => onOpenGroup(g.id)} />
                </View>
              ))}
            </View>
          )}

          {idle.length > 0 && (
            <>
              <Text style={[type.eyebrow, { marginTop: 38, marginBottom: 12 }]}>Not playing</Text>
              <View style={{ gap: 10, maxWidth: 520 }}>
                {idle.map((r) => (
                  <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: ink(0.08), backgroundColor: colors.bgPaper }}>
                    <Speaker size={20} color={colors.fgSubtle} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14.5, color: colors.fg }}>{r.name}</Text>
                      <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.fgSubtle, marginTop: 1 }}>Not playing</Text>
                    </View>
                    <Pressable onPress={() => startGroup(r.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: accent, opacity: pressed ? 0.8 : 1 })}>
                      <Play size={13} fill={accentText} />
                      <Text style={{ fontFamily: font.bodyMedium, fontSize: 12.5, color: accentText }}>Play here</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* "Add a room" (pairing a new speaker) is deferred — visible but inert. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, marginTop: 18, opacity: 0.45 }}>
            <Plus size={18} color={colors.fgMuted} />
            <Text style={{ fontFamily: font.body, fontSize: 13.5, color: colors.fgMuted }}>Add a room</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}
