import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import { ChevronRight, Pause, Play } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, sortedGroups } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';

// The now-playing one-liner for a compact row: the real title (— artist) when
// known. When idle — or playing without metadata — we show NOTHING (no second
// line). The cover and the playing dot already say it; no fabricated status text.
function lineFor(idle: boolean, title: string, artist: string): string {
  if (idle || !title) return '';
  return artist ? `${title} — ${artist}` : title;
}

function GroupRow({ group, selected, onSelect }: { group: Group; selected: boolean; onSelect: () => void }) {
  const store = useStore();
  const { config, getTrack, groupName, roomName, groupControls } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const tr = getTrack(group.trackId);
  const idle = group.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const ctrl = groupControls(group.id);

  // Every speaker in the group, by name — so you can see the whole group, not a
  // "+N" summary. The 320px rail can't fit many names on one line, so a
  // multi-speaker group collapses to a single ellipsized line with a chevron;
  // tapping the chevron rolls it open to wrap and reveal every speaker. A
  // single-speaker group has nothing hidden → no chevron.
  const names = group.roomIds.map(roomName);
  const multi = names.length > 1;
  const label = names.length ? names.join('   ·   ') : groupName(group);
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        borderRadius: radii.lg,
        backgroundColor: selected ? colors.bgPaper : pressed ? ink(0.04) : 'transparent',
        borderWidth: 1,
        borderColor: selected ? ink(0.12) : 'transparent',
      })}
    >
      <CoverArt size={46} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} artUrl={tr.artUrl} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={expanded ? undefined : 1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: colors.fg, flex: 1 }}>
            {label}
          </Text>
          {group.isPlaying && <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: accent }} />}
          {multi && (
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); setExpanded((v) => !v); }}
              hitSlop={6}
              style={({ pressed }) => ({ padding: 2, opacity: pressed ? 0.5 : 1, transform: [{ rotate: expanded ? '90deg' : '0deg' }] })}
            >
              <ChevronRight size={14} color={colors.fgSubtle} />
            </Pressable>
          )}
        </View>
        {(() => {
          const line = lineFor(idle, tr.title, tr.artist);
          return line ? (
            <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgSubtle, marginTop: 2 }}>{line}</Text>
          ) : null;
        })()}
      </View>
      {/* Quick play/pause for this group, without leaving the list. */}
      {!idle && (
        <Pressable
          onPress={(e) => { e.stopPropagation(); ctrl.togglePlay(); }}
          hitSlop={8}
          style={{ width: 34, height: 34, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}
        >
          {store.transportPending(group.id) !== null ? (
            <ActivityIndicator size="small" color={accentText} />
          ) : group.isPlaying ? (
            <Pause size={15} fill={accentText} />
          ) : (
            <Play size={15} fill={accentText} />
          )}
        </Pressable>
      )}
    </Pressable>
  );
}

// A STABLE, single-column list of the household's groups, sorted by name so a
// topology poll never reorders it under the cursor. Selecting a row sticks; the
// detail pane shows that group's full controls.
//
// There is no separate "not playing" section: Sonos reports a standalone speaker as
// its own one-member group, so every room is always in a group (pinned by
// sonosApi.test.ts). An idle group is a row here like any other, and its detail
// pane offers "Play something here".
export default function RoomList({ selectedId, onSelect }: { selectedId: string | null; onSelect: (gid: string) => void }) {
  const store = useStore();
  const groups = sortedGroups(store);

  return (
    <View style={{ width: 320, flex: 'none' as any, borderRightWidth: 1, borderRightColor: ink(0.07), backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 4 }} showsVerticalScrollIndicator={false}>
        <Text style={[type.eyebrow, { paddingHorizontal: 10, paddingTop: 6, paddingBottom: 8 }]}>Groups</Text>
        {groups.map((g) => (
          <GroupRow key={g.id} group={g} selected={g.id === selectedId} onSelect={() => onSelect(g.id)} />
        ))}

      </ScrollView>
    </View>
  );
}
