import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import { Heart, Next, Pause, Play, Prev, Queue, Repeat, Shuffle, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { accentTextOf, groupCount } from '../state/selectors';

export default function TransportBar() {
  const store = useStore();
  const { activeGroup, activeTrack, roomName, groupVol, isLiked, config, togglePlay, next, prev, seek, setActiveVol, toggleMute, toggleShuffle, toggleRepeat, toggleLike, setView } = store;
  const g = activeGroup();
  const tr = activeTrack();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const liked = isLiked(tr.id);
  const progress = g.progress / tr.dur;
  const vol = (g.muted ? 0 : groupVol(g)) / 100;

  return (
    <View style={{ height: 94, borderTopWidth: 1, borderTopColor: ink(0.08), flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, gap: 24, backgroundColor: colors.bgPaper }}>
      {/* now playing mini */}
      <Pressable onPress={() => setView('nowplaying')} style={{ width: 300, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <CoverArt size={54} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: colors.fg }}>{tr.title}</Text>
          <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgMuted, marginTop: 2 }}>{tr.artist}</Text>
        </View>
        <Pressable onPress={(e) => { e.stopPropagation(); toggleLike(tr.id); }} hitSlop={8}>
          <Heart size={18} color={liked ? colors.danger : colors.fg} fill={liked ? colors.danger : 'none'} />
        </Pressable>
      </Pressable>

      {/* center transport */}
      <View style={{ flex: 1, gap: 9, maxWidth: 560, alignSelf: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <Pressable onPress={toggleShuffle} hitSlop={8}><Shuffle size={19} color={g.shuffle ? colors.fg : colors.fgSubtle} /></Pressable>
          <Pressable onPress={prev} hitSlop={8}><Prev size={22} fill={colors.fg} /></Pressable>
          <Pressable onPress={togglePlay} style={{ width: 48, height: 48, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.sm } as any}>
            {g.isPlaying ? <Pause size={20} fill={accentText} /> : <Play size={20} fill={accentText} />}
          </Pressable>
          <Pressable onPress={next} hitSlop={8}><Next size={22} fill={colors.fg} /></Pressable>
          <Pressable onPress={toggleRepeat} hitSlop={8}><Repeat size={19} color={g.repeat ? colors.fg : colors.fgSubtle} /></Pressable>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 34, textAlign: 'right' }}>{fmt(g.progress)}</Text>
          <TrackBar value={progress} onScrub={seek} trackColor={ink(0.12)} fillColor={colors.fg} height={4} thumb style={{ flex: 1 }} />
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 38 }}>-{fmt(tr.dur - g.progress)}</Text>
        </View>
      </View>

      {/* right: volume + queue + group pill */}
      <View style={{ width: 300, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
        <Pressable onPress={toggleMute} hitSlop={8}>
          {g.muted ? <VolumeLow size={19} color={colors.fg} /> : <VolumeHigh size={19} color={colors.fg} />}
        </Pressable>
        <View style={{ width: 96 }}>
          <TrackBar value={vol} onScrub={setActiveVol} trackColor={ink(0.12)} fillColor={colors.fg} height={4} />
        </View>
        <Queue size={19} color={colors.fgMuted} />
        <Pressable onPress={() => setView('nowplaying')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.14) }}>
          <Speaker size={16} color={colors.fg} />
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 12.5, color: colors.fg }}>{roomName(g.roomIds[0])} {groupCount(g)}</Text>
        </Pressable>
      </View>
    </View>
  );
}
