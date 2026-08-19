import React from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import QueueRow from '../QueueRow';
import { ChevronDown } from '../../icons';
import { tapCommit } from './haptics';
import type { Motif, QueueItem } from '../../state/types';

// PHONE ONLY — imports gesture-handler + reanimated, neither of which is in the
// Electron renderer bundle.
//
// The desktop reorders with W3C pointer capture, which is web-only. This is the
// same interaction in native terms: LONG-PRESS then drag. The pan only activates
// after the long press, so an ordinary vertical drag still scrolls the page.
// Neighbouring rows shift to preview the drop; on release we ask the SPEAKER to
// reorder and the store re-reads (Sonos is the source of truth — no local splice).
//
// The chevrons stay: they are the only reorder path reachable by a screen reader
// or by anyone who can't hold-and-drag.

const ROW_H = 56;

export default function QueueList({
  items,
  motif,
  fg,
  muted,
  onReorder,
  onPlay,
}: {
  items: QueueItem[];
  motif: Motif;
  fg: string;
  muted: string;
  onReorder: (from: number, to: number) => void;
  onPlay: (index: number) => void;
}) {
  // -1 when nothing is being dragged. Shared values so the gesture can drive the
  // layout on the UI thread without a React render per frame.
  const active = useSharedValue(-1);
  const dy = useSharedValue(0);
  const count = items.length;

  return (
    <View>
      {items.map((item, index) => (
        <Row
          key={`${index}:${item.title}:${item.artist}`}
          item={item}
          index={index}
          count={count}
          active={active}
          dy={dy}
          motif={motif}
          fg={fg}
          muted={muted}
          onReorder={onReorder}
          onPlay={onPlay}
        />
      ))}
    </View>
  );
}

function Row({
  item,
  index,
  count,
  active,
  dy,
  motif,
  fg,
  muted,
  onReorder,
  onPlay,
}: {
  item: QueueItem;
  index: number;
  count: number;
  active: { value: number };
  dy: { value: number };
  motif: Motif;
  fg: string;
  muted: string;
  onReorder: (from: number, to: number) => void;
  onPlay: (index: number) => void;
}) {
  const pan = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      active.value = index;
      dy.value = 0;
      runOnJS(tapCommit)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
    })
    .onEnd(() => {
      const raw = index + Math.round(dy.value / ROW_H);
      const to = Math.max(0, Math.min(count - 1, raw));
      if (to !== index) runOnJS(onReorder)(index, to);
      active.value = -1;
      dy.value = 0;
    })
    .onFinalize(() => {
      active.value = -1;
      dy.value = 0;
    });

  const style = useAnimatedStyle(() => {
    const from = active.value;
    if (from === -1) return { transform: [{ translateY: 0 }], zIndex: 1, opacity: 1 };
    if (from === index) {
      return { transform: [{ translateY: dy.value }], zIndex: 5, opacity: 0.92 };
    }
    const raw = from + Math.round(dy.value / ROW_H);
    const to = Math.max(0, Math.min(count - 1, raw));
    let shift = 0;
    if (from < to && index > from && index <= to) shift = -ROW_H;
    else if (from > to && index < from && index >= to) shift = ROW_H;
    return { transform: [{ translateY: shift }], zIndex: 1, opacity: 1 };
  });

  const canUp = index > 0;
  const canDown = index < count - 1;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ height: ROW_H, justifyContent: 'center' }, style]}>
        <QueueRow
          item={item}
          motif={motif}
          fg={fg}
          muted={muted}
          onPress={() => onPlay(index)}
          trailing={
            <>
              <ReorderButton
                label={`Move ${item.title || item.album} up`}
                enabled={canUp}
                up
                onPress={() => onReorder(index, index - 1)}
                fg={fg}
              />
              <ReorderButton
                label={`Move ${item.title || item.album} down`}
                enabled={canDown}
                onPress={() => onReorder(index, index + 1)}
                fg={fg}
              />
            </>
          }
        />
      </Animated.View>
    </GestureDetector>
  );
}

// 44x44 so it clears the minimum touch target; the icon inside stays small.
function ReorderButton({
  label,
  enabled,
  up = false,
  onPress,
  fg,
}: {
  label: string;
  enabled: boolean;
  up?: boolean;
  onPress: () => void;
  fg: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => ({
        width: 40,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !enabled ? 0.25 : pressed ? 0.5 : 1,
      })}
    >
      <View style={up ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <ChevronDown size={18} color={fg} />
      </View>
    </Pressable>
  );
}
