import React from 'react';
import { Pressable, View } from 'react-native';
import { Next, Pause, Play, Prev, Repeat, Shuffle } from '../icons';
import { radii } from '../theme/tokens';
import { useStore } from '../state/store';
import { accentTextOf } from '../state/selectors';

// shuffle · prev · play/pause · next · repeat, themed for light or dark Now Playing.
export default function TransportRow({ fg, muted }: { fg: string; muted: string }) {
  const { activeGroup, togglePlay, next, prev, toggleShuffle, toggleRepeat, config } = useStore();
  const g = activeGroup();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 }}>
      <Pressable onPress={toggleShuffle} hitSlop={10}>
        <Shuffle size={22} color={g.shuffle ? fg : muted} />
      </Pressable>
      <Pressable onPress={prev} hitSlop={10}>
        <Prev size={28} fill={fg} />
      </Pressable>
      <Pressable
        onPress={togglePlay}
        style={{ width: 68, height: 68, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 8px 24px rgba(26,24,20,0.06)' } as any}
      >
        {g.isPlaying ? <Pause size={28} fill={accentText} /> : <Play size={28} fill={accentText} />}
      </Pressable>
      <Pressable onPress={next} hitSlop={10}>
        <Next size={28} fill={fg} />
      </Pressable>
      <Pressable onPress={toggleRepeat} hitSlop={10}>
        <Repeat size={22} color={g.repeat ? fg : muted} />
      </Pressable>
    </View>
  );
}
