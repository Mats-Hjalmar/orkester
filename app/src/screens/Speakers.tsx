import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import SpeakerChip from '../components/SpeakerChip';
import TrackBar from '../components/TrackBar';
import { ChevronRight, VolumeHigh } from '../icons';
import { colors, ink } from '../theme/tokens';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { useNav } from '../navigation';
import { chipsFor } from '../state/selectors';

// Room-scoped speaker management — reached from a room's detail. Shows every
// speaker as a chip (member / in another group / free) so you can group rooms
// into THIS group or move them out, plus the group's shared volume. Grouping
// logic is the shared store (toggleRoomInGroup via chipsFor); this is just the
// phone presentation of the same controls the desktop shows inline.
export default function Speakers() {
  const store = useStore();
  const nav = useNav();
  const { activeGroup, roomName, groupVol, setGroupVol } = store;
  const g = activeGroup();
  const groupLabel = g.roomIds.map(roomName).join(' · ') || 'this group';
  const chips = chipsFor(store, g);
  const groupVolume = groupVol(g); // 0–100, or null when no real reading yet

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 22, paddingBottom: 28, gap: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back to this room's detail. */}
      <Pressable
        onPress={() => nav.goBack()}
        hitSlop={8}
        accessibilityLabel="Back to room"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronRight size={18} color={colors.fgMuted} />
        </View>
        <Text style={type.bodyMuted}>{groupLabel}</Text>
      </Pressable>

      <Text style={type.displayXL}>Speakers</Text>
      <Text style={[type.bodyMuted, { marginTop: -6 }]}>Tap a speaker to add it to this group or move it out.</Text>

      {/* Shared group volume — all member speakers move together. Shown only when
          backed by a real reading; hidden until then so a guess can't be dragged. */}
      {groupVolume !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <VolumeHigh size={18} color={colors.fgMuted} />
          <TrackBar value={(g.muted ? 0 : groupVolume) / 100} onScrub={(f) => setGroupVol(g.id, f)} trackColor={ink(0.12)} fillColor={colors.fg} height={5} style={{ flex: 1 }} />
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 4 }}>
        {chips.map((c) => (
          <SpeakerChip key={c.id} chip={c} showIcon />
        ))}
      </View>
    </ScrollView>
  );
}
