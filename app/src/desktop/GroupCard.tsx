import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import SpeakerChip from '../components/SpeakerChip';
import { ChevronRight, Next, Pause, Play, Prev, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { accentTextOf, chipsFor, groupCount } from '../state/selectors';
import { progressOf } from '../components/trackProgress';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';

// A single GROUP on the rooms-first desktop home: controlled fully IN PLACE.
// Cover + now-playing, prev/play-pause/next, a group volume slider, and the
// speaker chips for grouping — all routed through groupControls(group.id), so
// this card never touches a global active-group singleton. Tapping the card BODY
// (cover + titles) opens the focused Now Playing for this group; the controls
// stop propagation so they act without navigating.
export default function GroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  const store = useStore();
  const { config, getTrack, groupName, groupVol, roomName, groupControls } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const tr = getTrack(group.trackId);
  const idle = group.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const ctrl = groupControls(group.id);
  const prog = progressOf(group, tr);
  const vol = (group.muted ? 0 : groupVol(group)) / 100;
  const chips = chipsFor(store, group);
  const here = group.roomIds.length ? `${roomName(group.roomIds[0])} ${groupCount(group)}`.trim() : 'Empty';

  return (
    <View style={{ backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: ink(0.1), borderRadius: 22, padding: 18, boxShadow: shadow.sm, gap: 16 } as any}>
      {/* Body — opens the focused Now Playing for this group. */}
      <Pressable onPress={onOpen} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.85 : 1 })}>
        <CoverArt size={68} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.lg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text numberOfLines={1} style={[type.title, { fontSize: 16, flexShrink: 1 }]}>{groupName(group)}</Text>
            {group.isPlaying && <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: accent }} />}
          </View>
          {idle ? (
            <Text numberOfLines={1} style={[type.small, { marginTop: 3, color: colors.fgSubtle }]}>Nothing playing · {here}</Text>
          ) : (
            <>
              <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: colors.fg, marginTop: 3 }}>{tr.title}</Text>
              <Text numberOfLines={1} style={[type.small, { marginTop: 1, color: colors.fgMuted }]}>{(group.isPlaying ? '' : 'Paused · ') + (tr.artist || here)}</Text>
            </>
          )}
        </View>
        <ChevronRight size={20} color={colors.fgSubtle} />
      </Pressable>

      {/* Transport for THIS group. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26, opacity: idle ? 0.5 : 1 }}>
        <Pressable onPress={ctrl.prev} hitSlop={8}><Prev size={20} fill={colors.fg} /></Pressable>
        <Pressable onPress={ctrl.togglePlay} style={{ width: 46, height: 46, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.sm } as any}>
          {group.isPlaying ? <Pause size={18} fill={accentText} /> : <Play size={18} fill={accentText} />}
        </Pressable>
        <Pressable onPress={ctrl.next} hitSlop={8}><Next size={20} fill={colors.fg} /></Pressable>
      </View>

      {/* Progress (read-only here; scrub lives in the focused view). */}
      {!idle && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ fontFamily: font.mono, fontSize: 10.5, color: colors.fgMuted, width: 30, textAlign: 'right' }}>{fmt(prog.elapsed)}</Text>
          <TrackBar value={prog.fraction} onScrub={() => {}} trackColor={ink(0.1)} fillColor={ink(0.4)} height={3} disabled style={{ flex: 1 }} />
          <Text style={{ fontFamily: font.mono, fontSize: 10.5, color: colors.fgMuted, width: 34 }}>
            {prog.isLive ? 'LIVE' : prog.remaining === null ? '' : `-${fmt(prog.remaining)}`}
          </Text>
        </View>
      )}

      {/* Group volume. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={ctrl.toggleMute} hitSlop={8}>
          {group.muted ? <VolumeLow size={17} color={colors.fgMuted} /> : <VolumeHigh size={17} color={colors.fgMuted} />}
        </Pressable>
        <TrackBar value={vol} onScrub={ctrl.setVolume} trackColor={ink(0.1)} fillColor={colors.fg} height={5} style={{ flex: 1 }} />
      </View>

      {/* Grouping chips. */}
      <View>
        <Text style={[type.eyebrow, { fontSize: 10, marginBottom: 9 }]}>Speakers — tap to group</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {chips.map((c) => <SpeakerChip key={c.id} chip={c} />)}
        </View>
      </View>
    </View>
  );
}
