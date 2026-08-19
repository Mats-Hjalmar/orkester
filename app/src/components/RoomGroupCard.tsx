import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import TrackBar from './TrackBar';
import { tapCommit, tapSelection } from './phone/haptics';
import { ChevronRight, Pause, Play, VolumeHigh } from '../icons';
import { Group } from '../state/types';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { useNav } from '../navigation';
import { accentTextOf } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

// A group row on the rooms-first list: cover, name, what it's playing, an inline
// play/pause, and a group-volume bar. Tapping the row drills into the room's
// DETAIL, where transport/queue/search/speaker-grouping live. Play/pause and volume
// stay here so the common action — pause the kitchen — is one tap, as it is on the
// desktop rail; both stop propagation so they don't also navigate.
export default function RoomGroupCard({ group }: { group: Group }) {
  const store = useStore();
  const nav = useNav();
  const { config, getTrack, groupName, roomName, groupVol, volumeSettling, focusGroup, setGroupVol, groupControls, transportPending, queueFor } = store;
  const tr = getTrack(group.trackId);
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const nothing = tr.id === PLACEHOLDER_TRACK_ID;
  // A group with a queue is controllable even when it reports no now-playing
  // metadata — Play resumes the queue. One with neither has nothing to start.
  const controllable = !nothing || queueFor(group.id).length > 0;
  const playingText = nothing
    ? 'Nothing playing'
    : (group.isPlaying ? '' : 'Paused · ') + tr.title + ' · ' + tr.artist;
  const groupVolume = groupVol(group); // 0–100, or null when no real reading yet
  const roomsLine = group.roomIds.map(roomName).join(' · ');
  const pending = transportPending(group.id);

  const open = () => {
    // Focus loads the group ATOMICALLY (now-playing + every member's volume/mute in
    // one snapshot) and pulls its queue, so the detail paints complete rather than
    // filling in over the next few seconds of polling.
    focusGroup(group.id);
    nav.navigate('Room', { groupId: group.id });
  };

  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={`Open ${groupName(group)}`}
      style={({ pressed }) => ({ backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: ink(0.1), borderRadius: 20, padding: 16, opacity: pressed ? 0.85 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <CoverArt size={48} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} artUrl={nothing ? undefined : tr.artUrl} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text numberOfLines={1} style={[type.title, { flexShrink: 1 }]}>{groupName(group)}</Text>
            {group.isPlaying && <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: accent }} />}
          </View>
          <Text numberOfLines={1} style={[type.small, { marginTop: 2, color: colors.fgSubtle }]}>{playingText}</Text>
          {group.roomIds.length > 1 && (
            <Text numberOfLines={1} style={[type.small, { marginTop: 1, color: colors.fgFaint }]}>{roomsLine}</Text>
          )}
        </View>
        {controllable ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              groupControls(group.id).togglePlay();
              tapCommit();
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${group.isPlaying ? 'Pause' : 'Play'} ${groupName(group)}`}
            style={{ width: 44, height: 44, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}
          >
            {pending === 'play' || pending === 'pause' ? (
              <ActivityIndicator size="small" color={accentText} />
            ) : group.isPlaying ? (
              <Pause size={16} fill={accentText} />
            ) : (
              <Play size={16} fill={accentText} />
            )}
          </Pressable>
        ) : (
          <ChevronRight size={20} color={colors.fgSubtle} />
        )}
      </View>

      {/* Volume bar only when backed by a REAL reading from every member speaker.
          Until then we hide it rather than show a guessed position the user could
          drag — moving a guessed slider writes an absolute volume and can jump to max. */}
      {groupVolume !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <VolumeHigh size={16} color={colors.fgMuted} />
          <TrackBar
            value={(group.muted ? 0 : groupVolume) / 100}
            onScrub={(f) => setGroupVol(group.id, f)}
            onCommit={tapSelection}
            label={`${groupName(group)} volume`}
            trackColor={ink(0.1)}
            fillColor={colors.fg}
            height={5}
            thumb
            grabThumbOnly
            loading={volumeSettling(group)}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </Pressable>
  );
}
