import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import SpeakerChip from '../components/SpeakerChip';
import { Dots, Heart, Plus } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { chipsFor, groupCount } from '../state/selectors';

function CircleButton({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.14), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

export default function DesktopNowPlaying() {
  const store = useStore();
  const { activeGroup, activeTrack, roomName, isLiked, config, selectTrack, toggleLike } = store;
  const g = activeGroup();
  const tr = activeTrack();
  const accent = config.accentColor;
  const liked = isLiked(tr.id);
  const chips = chipsFor(store, g);
  const queue = g.queueIds.map((id) => store.getTrack(id));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 44, padding: 44 }} showsVerticalScrollIndicator={false}>
      {/* cover */}
      <View style={{ width: 374 }}>
        <CoverArt size={374} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={24} shadow={shadow.lg}>
          <Text style={{ position: 'absolute', left: 18, top: 16, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.cat}</Text>
          <Text style={{ position: 'absolute', left: 18, bottom: 16, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.year}</Text>
        </CoverArt>
      </View>

      {/* details */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: accent }} />
          <Text style={type.eyebrow}>Playing in {roomName(g.roomIds[0])} {groupCount(g)}</Text>
        </View>
        <Text testID="np-title" style={{ fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -1.1, color: colors.fg, marginTop: 14 }}>{tr.title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 19, color: colors.fgMuted, marginTop: 10 }}>{tr.artist}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fg }}>{tr.album}</Text>
          <View style={{ width: 3, height: 3, borderRadius: radii.pill, backgroundColor: colors.fgFaint }} />
          <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.fgMuted }}>{tr.cat}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 }}>
          <CircleButton onPress={() => toggleLike(tr.id)}>
            <Heart size={19} color={liked ? colors.danger : colors.fg} fill={liked ? colors.danger : 'none'} />
          </CircleButton>
          <CircleButton><Plus size={19} color={colors.fg} /></CircleButton>
          <CircleButton><Dots size={19} color={colors.fg} /></CircleButton>
        </View>

        <Text style={[type.eyebrow, { marginTop: 34, marginBottom: 11 }]}>Speakers — tap to group</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {chips.map((c) => <SpeakerChip key={c.id} chip={c} showIcon />)}
        </View>

        <Text style={[type.eyebrow, { marginTop: 30, marginBottom: 6 }]}>Up next</Text>
        <View>
          {queue.map((t, i) => (
            <Pressable key={`${t.id}-${i}`} onPress={() => selectTrack(t.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: radii.lg, backgroundColor: pressed ? ink(0.04) : 'transparent' })}>
              <CoverArt size={46} coverBg={t.coverBg} coverShape={t.coverShape} motif={config.coverMotif} radius={10} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 14, color: colors.fg }}>{t.title}</Text>
                <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgMuted, marginTop: 2 }}>{t.artist}</Text>
              </View>
              <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.fgSubtle }}>{fmt(t.dur)}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
