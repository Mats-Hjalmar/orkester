import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import TrackBar from '../components/TrackBar';
import { VolumeHigh, VolumeLow } from '../icons';
import { colors, ink } from '../theme/tokens';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { progressOf } from '../components/trackProgress';
import type { Group } from '../state/types';

// A spinner in a fixed-size slot, so a control doesn't resize while its request is in flight.
export function Spinner({ size, color = colors.fg }: { size: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="small" color={color} />
    </View>
  );
}

// Timeline + scrub — ONLY for a real finite track. For live/unknown metadata
// there's no accurate position, so we show no scrubber rather than an
// interpolated, inaccurate one.
export function ProgressRow({ group }: { group: Group }) {
  const { getTrack, groupControls } = useStore();
  const prog = progressOf(group, getTrack(group.trackId));
  if (!prog.finite) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 34, textAlign: 'right' }}>{fmt(prog.elapsed)}</Text>
      <TrackBar value={prog.fraction} onScrub={groupControls(group.id).seek} trackColor={ink(0.12)} fillColor={colors.fg} height={4} thumb style={{ flex: 1 }} />
      <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 38 }}>
        {prog.remaining === null ? '' : `-${fmt(prog.remaining)}`}
      </Text>
    </View>
  );
}

// A mute button + volume slider, for a whole group or one speaker.
export function LevelRow({ label, volume, muted, muting, settling, onToggleMute, onScrub }: {
  label: string;
  volume: number;
  muted: boolean;
  muting: boolean;
  settling: boolean;
  onToggleMute: () => void;
  onScrub: (frac: number) => void;
}) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable onPress={onToggleMute} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${muted ? 'Unmute' : 'Mute'} ${label}`}>
        {muting ? (
          <Spinner size={19} />
        ) : muted ? <VolumeLow size={19} color={colors.fg} /> : <VolumeHigh size={19} color={colors.fg} />}
      </Pressable>
      <TrackBar value={(muted ? 0 : volume) / 100} onScrub={onScrub} label={`${label} volume`} trackColor={ink(0.12)} fillColor={colors.fg} height={4} thumb grabThumbOnly loading={settling} style={{ flex: 1 }} />
    </View>
  );
}

// Group mute + volume. Hidden until every member has a real volume reading.
export function VolumeRow({ group }: { group: Group }) {
  const store = useStore();
  const groupVolume = store.groupVol(group);
  if (groupVolume === null) return null;
  const ctrl = store.groupControls(group.id);
  return (
    <LevelRow
      label={store.groupName(group)}
      volume={groupVolume}
      muted={store.groupMuted(group)}
      muting={store.transportPending(group.id) === 'mute'}
      settling={store.volumeSettling(group)}
      onToggleMute={ctrl.toggleMute}
      onScrub={ctrl.setVolume}
    />
  );
}
