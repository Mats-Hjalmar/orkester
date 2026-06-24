import React from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import TransportRow from '../components/TransportRow';
import { ChevronDown, Dots, Heart, Queue, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, paper, shadow, radii, FRAME } from '../theme/tokens';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { groupCount } from '../state/selectors';

export default function NowPlaying() {
  const store = useStore();
  const { activeGroup, activeTrack, roomName, groupVol, isLiked, config, setView, seek, setActiveVol, toggleLike } = store;
  const { width } = useWindowDimensions();
  const frameW = Math.min(FRAME.width, width);
  const cover = frameW - 48;

  const g = activeGroup();
  const tr = activeTrack();
  const liked = isLiked(tr.id);

  const dark = config.mobileNowDark;
  const fg = dark ? colors.fgOnPhoto : colors.fg;
  const muted = dark ? paper(0.6) : colors.fgMuted;
  const trackBg = dark ? paper(0.22) : ink(0.12);
  const bg = dark ? colors.bgDeep : colors.bg;

  const dur = tr.dur;
  const progress = g.progress / dur;
  const vol = (g.muted ? 0 : groupVol(g)) / 100;

  return (
    <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 24, paddingBottom: 26, backgroundColor: bg }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => setView('home')} hitSlop={10}>
          <ChevronDown size={24} color={fg} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: muted }}>Playing in</Text>
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 13, marginTop: 2, color: fg }}>{roomName(g.roomIds[0])} {groupCount(g)}</Text>
        </View>
        <Dots size={22} color={fg} />
      </View>

      {/* cover */}
      <View style={{ marginTop: 24 }}>
        <CoverArt size={cover} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.xl} shadow={shadow.lg}>
          <Text style={{ position: 'absolute', left: 16, top: 14, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.cat}</Text>
        </CoverArt>
      </View>

      {/* title + like */}
      <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: fg }}>{tr.title}</Text>
          <Text style={{ fontFamily: font.body, fontSize: 15, color: muted, marginTop: 6 }}>{tr.artist}</Text>
        </View>
        <Pressable onPress={() => toggleLike(tr.id)} hitSlop={8} style={{ marginTop: 4 }}>
          <Heart size={24} color={liked ? colors.danger : fg} fill={liked ? colors.danger : 'none'} />
        </Pressable>
      </View>

      {/* progress */}
      <View style={{ marginTop: 22 }}>
        <TrackBar value={progress} onScrub={seek} trackColor={trackBg} fillColor={fg} height={4} thumb />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }}>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: muted }}>{fmt(g.progress)}</Text>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: muted }}>-{fmt(dur - g.progress)}</Text>
        </View>
      </View>

      {/* transport */}
      <View style={{ marginTop: 20 }}>
        <TransportRow fg={fg} muted={muted} />
      </View>

      {/* volume */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <VolumeLow size={18} color={muted} />
        <TrackBar value={vol} onScrub={setActiveVol} trackColor={trackBg} fillColor={fg} height={4} style={{ flex: 1 }} />
        <VolumeHigh size={20} color={muted} />
      </View>

      {/* footer */}
      <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 22 }}>
        <Pressable onPress={() => setView('rooms')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Speaker size={18} color={muted} />
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 12.5, color: muted }}>{g.roomIds.length} rooms</Text>
        </Pressable>
        <Queue size={20} color={muted} />
      </View>
    </View>
  );
}
