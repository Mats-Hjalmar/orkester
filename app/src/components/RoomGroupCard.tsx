import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import TrackBar from './TrackBar';
import { ChevronRight, VolumeHigh } from '../icons';
import { Group } from '../state/types';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { useNav } from '../navigation';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

// A group row on the rooms-first list: cover, name, what it's playing, and a
// quick group-volume bar. Tapping it drills into the room's DETAIL (NowPlaying),
// where transport/queue/search/speaker-grouping live. The volume bar stays here
// for at-a-glance adjustment without drilling in; its press is isolated so it
// doesn't trigger the row's navigation.
export default function RoomGroupCard({ group }: { group: Group }) {
  const store = useStore();
  const nav = useNav();
  const { config, getTrack, groupName, roomName, groupVol, selectGroup, setGroupVol } = store;
  const tr = getTrack(group.trackId);
  const accent = config.accentColor;
  const nothing = tr.id === PLACEHOLDER_TRACK_ID;
  // A real group may be idle (nothing queued yet) — read "Nothing playing"
  // rather than "Paused · Nothing playing · ".
  const playingText = nothing
    ? 'Nothing playing'
    : (group.isPlaying ? '' : 'Paused · ') + tr.title + ' · ' + tr.artist;
  const groupVolume = groupVol(group); // 0–100, or null when no real reading yet
  // Full room list under the name (so the card shows the whole group, not "+N").
  const roomsLine = group.roomIds.map(roomName).join(' · ');

  return (
    <Pressable
      onPress={() => {
        // Select the group (sets the active group the detail/search/speakers
        // screens read) then push its detail — the stack owns the back nav.
        selectGroup(group.id);
        nav.navigate('Room');
      }}
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
        <ChevronRight size={20} color={colors.fgSubtle} />
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
            trackColor={ink(0.1)}
            fillColor={colors.fg}
            height={5}
            thumb
            grabThumbOnly
            style={{ flex: 1 }}
          />
        </View>
      )}
    </Pressable>
  );
}
