import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Next, Pause, Play, Prev, Repeat, Shuffle } from '../icons';
import { radii } from '../theme/tokens';
import { useStore } from '../state/store';
import { accentTextOf } from '../state/selectors';
import type { Group } from '../state/types';

// shuffle · prev · play/pause · next · repeat for ONE group, themed for light or
// dark. Takes the group rather than reading a global selection, so it drives
// exactly the room the screen is showing.
//
// Transport is single-flight per group in the store: while a request is out, the
// control that fired shows a spinner and further taps are DROPPED. Without the
// spinner those dropped taps read as a dead button, which is how this looked
// before.
export default function TransportRow({
  group,
  fg,
  muted,
  onAct,
}: {
  group: Group;
  fg: string;
  muted: string;
  onAct?: () => void;
}) {
  const { groupControls, transportPending, config } = useStore();
  const ctrl = groupControls(group.id);
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const pending = transportPending(group.id);
  const busy = pending !== null;

  const spinning = (op: typeof pending, size: number, color: string) =>
    pending === op ? (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="small" color={color} />
      </View>
    ) : null;

  const act = (fn: () => void) => () => {
    fn();
    onAct?.();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 6,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <Pressable
        onPress={act(() => ctrl.setShuffle(!group.shuffle))}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Shuffle"
        accessibilityState={{ selected: group.shuffle }}
      >
        {spinning('shuffle', 22, fg) ?? <Shuffle size={22} color={group.shuffle ? fg : muted} />}
      </Pressable>
      <Pressable onPress={act(ctrl.prev)} hitSlop={14} accessibilityRole="button" accessibilityLabel="Previous track">
        {spinning('prev', 28, fg) ?? <Prev size={28} fill={fg} />}
      </Pressable>
      <Pressable
        onPress={act(ctrl.togglePlay)}
        accessibilityRole="button"
        accessibilityLabel={group.isPlaying ? 'Pause' : 'Play'}
        style={{ width: 68, height: 68, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 24px rgba(26,24,20,0.06)' } as any}
      >
        {pending === 'play' || pending === 'pause' ? (
          <ActivityIndicator size="small" color={accentText} />
        ) : group.isPlaying ? (
          <Pause size={28} fill={accentText} />
        ) : (
          <Play size={28} fill={accentText} />
        )}
      </Pressable>
      <Pressable onPress={act(ctrl.next)} hitSlop={14} accessibilityRole="button" accessibilityLabel="Next track">
        {spinning('next', 28, fg) ?? <Next size={28} fill={fg} />}
      </Pressable>
      <Pressable
        onPress={act(() => ctrl.setRepeat(!group.repeat))}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Repeat"
        accessibilityState={{ selected: group.repeat }}
      >
        {spinning('repeat', 22, fg) ?? <Repeat size={22} color={group.repeat ? fg : muted} />}
      </Pressable>
    </View>
  );
}
