import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import { Track } from '../state/types';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { colors, radii } from '../theme/tokens';
import { useStore } from '../state/store';

// Grid card used on Home — square cover with a catalogue label, title, artist.
export default function AlbumCard({ track, size, onPress, active }: { track: Track; size: number; onPress: () => void; active?: boolean }) {
  const { config } = useStore();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: size, opacity: pressed ? 0.85 : 1 })}>
      <CoverArt
        size={size}
        coverBg={track.coverBg}
        coverShape={track.coverShape}
        motif={config.coverMotif}
        radius={radii.lg}
        ring={active ? config.accentColor : undefined}
      >
        <Text style={{ position: 'absolute', left: 11, bottom: 10, fontFamily: font.mono, fontSize: 10, color: 'rgba(26,24,20,0.55)' }}>
          {track.cat}
        </Text>
      </CoverArt>
      <Text numberOfLines={1} style={[type.title, { marginTop: 9, fontSize: 14 }]}>{track.title}</Text>
      <Text numberOfLines={1} style={[type.small, { marginTop: 2, color: colors.fgMuted }]}>{track.artist}</Text>
    </Pressable>
  );
}
