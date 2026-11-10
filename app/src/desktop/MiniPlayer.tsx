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

export type MiniPanel = 'groups' | 'volumes';

// Both sides share one size rule so the transport stays centered; any extra window
// width goes to the transport's position slider. On a narrow window the sides give
// way before the transport drops below its minimum.
const SIDE = { width: 320, flexShrink: 1, minWidth: 240, flexDirection: 'row', alignItems: 'center' } as const;
const TRANSPORT_MIN_W = 300;
// The transport's two rows (buttons over position) and the volume's two rows
// (speaker-volumes toggle over level) share heights so the level slider lines up
// with the position slider.
const TOP_ROW_H = 38;
const SLIDER_ROW_H = 20;
const ROW_GAP = 6;
const PAD_X = 20;
const SIDE_GAP = 16;

// Pinned to the bottom of the window so the selected group's track, transport and
// volume stay in reach; the Now Playing column above shows only the track and queue.
// The speakers button opens the grouping panel and, for a multi-speaker group, the
// chevron by the volume opens each speaker's level; DesktopApp renders whichever
// is open as an overlay above this bar.
// `onVolumesCenter` reports the volume toggle's center, measured from the bar's
// right edge, so the speaker volumes can pop up over it.
export default function MiniPlayer({ group, panel, onTogglePanel, onVolumesCenter }: {
  group: Group; panel: MiniPanel | null; onTogglePanel: (p: MiniPanel) => void; onVolumesCenter: (right: number) => void;
}) {
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
  const groupsOpen = panel === 'groups';
  const volumesOpen = panel === 'volumes';
  const multi = group.roomIds.length > 1;
  // The right side is packed to the bar's right edge, so the toggle's center sits
  // the padding, the groups button and the gap in from it, plus half its own width.
  const [toggleW, setToggleW] = React.useState(0);
  const [groupsW, setGroupsW] = React.useState(0);
  React.useEffect(() => {
    onVolumesCenter(PAD_X + groupsW + SIDE_GAP + toggleW / 2);
  }, [toggleW, groupsW, onVolumesCenter]);

  return (
    <View style={{ height: MINI_PLAYER_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: PAD_X, borderTopWidth: 1, borderTopColor: ink(0.07), backgroundColor: colors.bgPaper }}>
      <View style={[SIDE, { gap: 12 }]}>
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

      <View style={{ flex: 1, minWidth: TRANSPORT_MIN_W, gap: ROW_GAP, opacity: controllable ? 1 : 0.4, pointerEvents: controllable ? 'auto' : 'none' }}>
        <View style={{ height: TOP_ROW_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: pending !== null ? 0.55 : 1 }}>
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
        <View style={{ height: SLIDER_ROW_H, justifyContent: 'center' }}>
          <ProgressRow group={group} />
        </View>
      </View>

      <View style={[SIDE, { gap: SIDE_GAP, justifyContent: 'flex-end' }]}>
        <View
          onLayout={(e) => setToggleW(e.nativeEvent.layout.width)}
          style={{ flex: 1, maxWidth: 180, gap: ROW_GAP, paddingHorizontal: 8, paddingVertical: 4 }}
        >
          {/* The toggle is a backdrop behind the volume rather than its parent: on web a
              click inside a Pressable (a mute, a slider click, the end of a drag) bubbles
              up to its onPress, and only clicks beside the controls should open the
              speaker volumes. */}
          <Pressable
            testID="mini-volumes-toggle"
            onPress={() => onTogglePanel('volumes')}
            disabled={!multi}
            accessibilityRole={multi ? 'button' : undefined}
            accessibilityLabel={multi ? "Each speaker's volume" : undefined}
            style={({ hovered }: any) => ({
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.md,
              backgroundColor: volumesOpen ? ink(0.06) : multi && hovered ? ink(0.03) : 'transparent',
            })}
          />
          <View style={{ height: TOP_ROW_H, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            {multi && (
              <View style={{ transform: [{ rotate: volumesOpen ? '0deg' : '180deg' }] }}>
                <ChevronDown size={14} color={volumesOpen ? colors.fg : colors.fgSubtle} />
              </View>
            )}
          </View>
          <View style={{ height: SLIDER_ROW_H, flexDirection: 'row', alignItems: 'center' }}>
            <VolumeRow group={group} />
          </View>
        </View>
        <Pressable
          testID="mini-groups-toggle"
          onPress={() => onTogglePanel('groups')}
          onLayout={(e) => setGroupsW(e.nativeEvent.layout.width)}
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
