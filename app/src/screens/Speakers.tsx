import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SpeakerChip from '../components/SpeakerChip';
import TrackBar from '../components/TrackBar';
import { tapCommit, tapSelection } from '../components/phone/haptics';
import { Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { useGroupRoute } from '../navigation';
import { chipsFor } from '../state/selectors';

// Room-scoped speaker management, presented as a SHEET over the room so its
// now-playing context stays put behind it.
//
// Two levels of volume: the group slider moves every member to the same absolute
// value (which flattens the balance between rooms — see findings/volume-control.md),
// and a per-speaker slider + mute below it, which is the only way to set the
// balance at all. Both hide until backed by a real reading, never a guess.
export default function Speakers() {
  const store = useStore();
  const { groupId } = useGroupRoute<'Speakers'>().params;
  const insets = useSafeAreaInsets();
  const {
    groupById,
    roomName,
    groupVol,
    volumeSettling,
    setGroupVol,
    roomVolume,
    roomMuted,
    volumeSettlingRoom,
    setRoomVolume,
    toggleRoomMute,
    groupingPending,
    roomMutePending,
  } = store;

  const g = groupById(groupId);

  if (!g) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
        <Speaker size={28} color={colors.fgSubtle} />
        <Text style={{ fontFamily: font.bodySemiBold, fontSize: 15, color: colors.fg, textAlign: 'center' }}>
          This group is gone
        </Text>
        <Text style={[type.bodyMuted, { textAlign: 'center' }]}>
          Its speakers were regrouped. Close this and pick a group.
        </Text>
      </View>
    );
  }

  const groupLabel = g.roomIds.map(roomName).join(' · ');
  const chips = chipsFor(store, g);
  const groupVolume = groupVol(g);
  const multi = g.roomIds.length > 1;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: 18, paddingHorizontal: 22, paddingBottom: insets.bottom + 28, gap: 18 }}
      showsVerticalScrollIndicator={false}
    >
      <View>
        <Text maxFontSizeMultiplier={1.6} style={[type.displayMd]}>Speakers</Text>
        <Text numberOfLines={2} style={[type.bodyMuted, { marginTop: 4 }]}>
          {groupLabel}
        </Text>
      </View>

      {/* All members together. */}
      {groupVolume !== null && (
        <View style={{ gap: 8 }}>
          {multi && <Text style={type.eyebrow}>All together</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <VolumeHigh size={20} color={colors.fgMuted} />
            <TrackBar
              value={(g.muted ? 0 : groupVolume) / 100}
              onScrub={(f) => setGroupVol(g.id, f)}
              onCommit={tapSelection}
              label="Group volume"
              trackColor={ink(0.12)}
              fillColor={colors.fg}
              height={5}
              thumb
              grabThumbOnly
              loading={volumeSettling(g)}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}

      {/* One row per member speaker: its own level and its own mute. */}
      {multi && (
        <View style={{ gap: 6 }}>
          <Text style={type.eyebrow}>Each speaker</Text>
          {g.roomIds.map((roomId) => (
            <SpeakerLevel
              key={roomId}
              name={roomName(roomId)}
              volume={roomVolume(roomId)}
              muted={roomMuted(roomId)}
              settling={volumeSettlingRoom(roomId)}
              muting={roomMutePending(roomId)}
              busy={groupingPending(roomId) !== null}
              onScrub={(f) => setRoomVolume(roomId, f)}
              onToggleMute={() => {
                toggleRoomMute(roomId);
                tapCommit();
              }}
            />
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Text style={type.eyebrow}>Grouping</Text>
        <Text style={[type.bodyMuted, { marginTop: -4 }]}>
          Tap a speaker to add it to this group or move it out.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 2 }}>
          {chips.map((c) => (
            <SpeakerChip key={c.id} chip={c} showIcon />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function SpeakerLevel({
  name,
  volume,
  muted,
  settling,
  muting,
  busy,
  onScrub,
  onToggleMute,
}: {
  name: string;
  volume: number | null;
  muted: boolean;
  settling: boolean;
  muting: boolean;
  busy: boolean;
  onScrub: (frac: number) => void;
  onToggleMute: () => void;
}) {
  return (
    <View style={{ paddingVertical: 6, opacity: busy ? 0.6 : 1 }}>
      <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>
        {name}
      </Text>
      {volume === null ? (
        // No real reading for this speaker yet — no slider to guess at.
        <Text style={[type.small, { marginTop: 4, color: colors.fgFaint }]}>Reading level…</Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Pressable
            onPress={onToggleMute}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`${muted ? 'Unmute' : 'Mute'} ${name}`}
            accessibilityState={{ selected: muted }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            {muting ? (
              <ActivityIndicator size="small" color={colors.fg} />
            ) : muted ? (
              <VolumeLow size={18} color={colors.fgMuted} />
            ) : (
              <VolumeHigh size={18} color={colors.fg} />
            )}
          </Pressable>
          <TrackBar
            value={(muted ? 0 : volume) / 100}
            onScrub={onScrub}
            onCommit={tapSelection}
            label={`${name} volume`}
            trackColor={ink(0.12)}
            fillColor={colors.fg}
            height={5}
            thumb
            grabThumbOnly
            loading={settling}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </View>
  );
}
