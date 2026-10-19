import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import { ChevronDown, Next, Pause, Play, Prev, Speaker } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';
import { ProgressRow, Spinner, VolumeRow } from './controls';

export const MINI_PLAYER_H = 84;

// Pinned to the bottom of the window so the selected group's track, transport and
// volume stay in reach while the right pane shows something else (e.g. search).
// The speakers button opens the grouping panel, which DesktopApp renders as an
// overlay above this bar.
export default function MiniPlayer({ group, groupsOpen, onToggleGroups }: { group: Group; groupsOpen: boolean; onToggleGroups: () => void }) {
  const store = useStore();
  const { config, getTrack, groupName, groupControls, queueFor } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const tr = getTrack(group.trackId);
  const idle = tr.id === PLACEHOLDER_TRACK_ID;
  // Same rule as the full Now Playing: a loaded queue is playable even without metadata.
  const controllable = !idle || queueFor(group.id).length > 0;
  const ctrl = groupControls(group.id);
  const pending = store.transportPending(group.id);

  return (
    <View style={{ height: MINI_PLAYER_H, flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: ink(0.07), backgroundColor: colors.bgPaper }}>
      <View style={{ width: 280, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CoverArt size={52} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} artUrl={idle ? undefined : tr.artUrl} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: idle ? colors.fgMuted : colors.fg }}>
            {idle || !tr.title ? 'Nothing playing' : tr.title}
          </Text>
          {!idle && !!tr.artist && (
            <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgSubtle, marginTop: 2 }}>{tr.artist}</Text>
          )}
        </View>
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6, opacity: controllable ? 1 : 0.4, pointerEvents: controllable ? 'auto' : 'none' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: pending !== null ? 0.55 : 1 }}>
          <Pressable onPress={ctrl.prev} hitSlop={8}>
            {pending === 'prev' ? <Spinner size={18} /> : <Prev size={18} fill={colors.fg} />}
          </Pressable>
          <Pressable onPress={ctrl.togglePlay} style={{ width: 38, height: 38, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
            {pending === 'play' || pending === 'pause' ? (
              <Spinner size={16} color={accentText} />
            ) : group.isPlaying ? (
              <Pause size={16} fill={accentText} />
            ) : (
              <Play size={16} fill={accentText} />
            )}
          </Pressable>
          <Pressable onPress={ctrl.next} hitSlop={8}>
            {pending === 'next' ? <Spinner size={18} /> : <Next size={18} fill={colors.fg} />}
          </Pressable>
        </View>
        <ProgressRow group={group} />
      </View>

      <View style={{ width: 280, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1 }}>
          <VolumeRow group={group} />
        </View>
        <Pressable
          testID="mini-groups-toggle"
          onPress={onToggleGroups}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', gap: 6,
            maxWidth: 150, height: 34, paddingHorizontal: 12, borderRadius: radii.pill,
            borderWidth: 1, borderColor: groupsOpen ? 'transparent' : ink(0.12),
            backgroundColor: groupsOpen ? colors.fg : colors.bg,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Speaker size={15} color={groupsOpen ? colors.bgPaper : colors.fg} />
          <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.bodyMedium, fontSize: 12.5, color: groupsOpen ? colors.bgPaper : colors.fg }}>
            {groupName(group)}
          </Text>
          <View style={{ transform: [{ rotate: groupsOpen ? '0deg' : '180deg' }] }}>
            <ChevronDown size={14} color={groupsOpen ? colors.bgPaper : colors.fgSubtle} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
