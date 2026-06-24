import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import TrackBar from './TrackBar';
import SpeakerChip from './SpeakerChip';
import { ChevronRight, VolumeHigh } from '../icons';
import { Group } from '../state/types';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { chipsFor } from '../state/selectors';

// A group on the Rooms screen: its cover/name/now-playing, a group volume bar,
// and tappable speaker chips that move rooms between groups.
export default function RoomGroupCard({ group }: { group: Group }) {
  const store = useStore();
  const { state, config, getTrack, groupName, groupVol, selectGroup, setGroupVol } = store;
  const tr = getTrack(group.trackId);
  const accent = config.accentColor;
  const active = group.id === state.activeGroupId;
  const playingText = (group.isPlaying ? '' : 'Paused · ') + tr.title + ' · ' + tr.artist;
  const vol = (group.muted ? 0 : groupVol(group)) / 100;
  const chips = chipsFor(store, group);

  return (
    <View style={{ backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: active ? accent : ink(0.1), borderRadius: 20, padding: 16 }}>
      <Pressable onPress={() => selectGroup(group.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <CoverArt size={48} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text numberOfLines={1} style={[type.title, { flexShrink: 1 }]}>{groupName(group)}</Text>
            {group.isPlaying && <View style={{ width: 6, height: 6, borderRadius: radii.pill, backgroundColor: accent }} />}
          </View>
          <Text numberOfLines={1} style={[type.small, { marginTop: 2, color: colors.fgSubtle }]}>{playingText}</Text>
        </View>
        <ChevronRight size={20} color={colors.fgSubtle} />
      </Pressable>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 }}>
        <VolumeHigh size={16} color={colors.fgMuted} />
        <TrackBar
          value={vol}
          onScrub={(f) => setGroupVol(group.id, f)}
          trackColor={ink(0.1)}
          fillColor={colors.fg}
          height={5}
          style={{ flex: 1 }}
        />
      </View>

      <Text style={[type.eyebrow, { fontSize: 10, marginTop: 16, marginBottom: 9 }]}>Speakers</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map((c) => (
          <SpeakerChip key={c.id} chip={c} />
        ))}
      </View>
    </View>
  );
}
