import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { colors } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import type { Group } from '../state/types';
import { LevelRow } from './controls';
import Popover from './Popover';

// Each member speaker's own level and mute, popped up centered over the mini
// player's group volume.
export default function SpeakerVolumes({ group, centerRight, onClose }: { group: Group; centerRight: number; onClose: () => void }) {
  const store = useStore();
  return (
    <Popover testID="speaker-volumes" centerRight={centerRight} onClose={onClose}>
      <Text style={[type.eyebrow, { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }]}>Each speaker</Text>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 12 }} showsVerticalScrollIndicator={false}>
        {group.roomIds.map((roomId) => {
          const name = store.roomName(roomId);
          const volume = store.roomVolume(roomId);
          return (
            <View key={roomId} style={{ gap: 6, opacity: store.groupingPending(roomId) !== null ? 0.6 : 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>{name}</Text>
              {volume === null ? (
                // No real reading for this speaker yet — no slider to guess at.
                <Text style={[type.small, { color: colors.fgFaint }]}>Reading level…</Text>
              ) : (
                <LevelRow
                  label={name}
                  volume={volume}
                  muted={store.roomMuted(roomId)}
                  muting={store.roomMutePending(roomId)}
                  settling={store.volumeSettlingRoom(roomId)}
                  onToggleMute={() => store.toggleRoomMute(roomId)}
                  onScrub={(f) => store.setRoomVolume(roomId, f)}
                />
              )}
            </View>
          );
        })}
      </ScrollView>
    </Popover>
  );
}
