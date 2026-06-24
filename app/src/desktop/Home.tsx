import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import { Track } from '../state/types';
import { colors, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { HOME_MORNING, HOME_RECENT } from '../state/library';
import { useStore } from '../state/store';

function Card({ track, onPress, active }: { track: Track; onPress: () => void; active: boolean }) {
  const { config } = useStore();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 166, opacity: pressed ? 0.85 : 1 })}>
      <CoverArt size={166} coverBg={track.coverBg} coverShape={track.coverShape} motif={config.coverMotif} radius={radii.lg} ring={active ? config.accentColor : undefined}>
        <Text style={{ position: 'absolute', left: 12, bottom: 11, fontFamily: font.mono, fontSize: 10, color: 'rgba(26,24,20,0.55)' }}>{track.cat}</Text>
      </CoverArt>
      <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 14, marginTop: 11, color: colors.fg }}>{track.title}</Text>
      <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 13, marginTop: 2, color: colors.fgMuted }}>{track.artist}</Text>
    </Pressable>
  );
}

function Shelf({ title, ids, activeId, onPlay }: { title: string; ids: string[]; activeId: string; onPlay: (id: string) => void }) {
  const { getTrack } = useStore();
  return (
    <View style={{ marginTop: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={type.displayMd}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fgMuted }}>See all</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 22, paddingTop: 20, paddingBottom: 6 }}>
        {ids.map((id) => {
          const t = getTrack(id);
          return <Card key={id} track={t} onPress={() => onPlay(id)} active={id === activeId} />;
        })}
      </ScrollView>
    </View>
  );
}

export default function DesktopHome() {
  const { activeGroup, selectTrack } = useStore();
  const activeId = activeGroup().trackId;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 36, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Text style={type.eyebrow}>Tuesday — 8:24</Text>
      <Text style={{ fontFamily: font.display, fontSize: 54, lineHeight: 55, letterSpacing: -1, color: colors.fg, marginTop: 10 }}>Good morning.</Text>
      <Text style={{ fontFamily: font.body, fontSize: 16, color: colors.fgMuted, marginTop: 8, maxWidth: 520 }}>
        A slow start, three rooms awake. Here's something to ease into the day.
      </Text>
      <Shelf title="Made for the morning" ids={HOME_MORNING} activeId={activeId} onPlay={selectTrack} />
      <Shelf title="Recently played" ids={HOME_RECENT} activeId={activeId} onPlay={selectTrack} />
    </ScrollView>
  );
}
