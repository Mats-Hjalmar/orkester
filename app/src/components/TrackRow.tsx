import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import { Track } from '../state/types';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { colors, radii } from '../theme/tokens';
import { fmt, useStore } from '../state/store';

// List row used for "Recently played" and the "Up next" queue.
export default function TrackRow({ track, onPress, coverSize = 48 }: { track: Track; onPress: () => void; coverSize?: number }) {
  const { config } = useStore();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9, opacity: pressed ? 0.7 : 1 })}
    >
      <CoverArt size={coverSize} coverBg={track.coverBg} coverShape={track.coverShape} motif={config.coverMotif} radius={radii.md} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[type.body, { fontFamily: font.bodyMedium }]}>{track.title}</Text>
        <Text numberOfLines={1} style={[type.small, { marginTop: 2 }]}>{track.artist}</Text>
      </View>
      <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgSubtle }}>{fmt(track.dur)}</Text>
    </Pressable>
  );
}
