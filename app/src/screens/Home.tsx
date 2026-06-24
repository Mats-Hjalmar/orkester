import React from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import AlbumCard from '../components/AlbumCard';
import TrackRow from '../components/TrackRow';
import { type } from '../theme/type';
import { FRAME } from '../theme/tokens';
import { HOME_MORNING, HOME_RECENT } from '../state/library';
import { useStore } from '../state/store';

export default function Home() {
  const { getTrack, activeGroup, selectTrack, setView } = useStore();
  const { width } = useWindowDimensions();
  const frameW = Math.min(FRAME.width, width);
  const card = (frameW - 44 - 16) / 2; // padding 22 each side, 16 gap

  const play = (id: string) => { selectTrack(id); setView('nowplaying'); };
  const activeTrackId = activeGroup().trackId;
  const morning = HOME_MORNING.slice(0, 4).map(getTrack);
  const recent = HOME_RECENT.map(getTrack);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={type.eyebrow}>Tuesday — 8:24</Text>
      <Text style={[type.displayXL, { marginTop: 8 }]}>Good morning.</Text>

      <Text style={[type.displaySm, { marginTop: 30 }]}>Made for the morning</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 }}>
        {morning.map((t) => (
          <AlbumCard key={t.id} track={t} size={card} onPress={() => play(t.id)} active={t.id === activeTrackId} />
        ))}
      </View>

      <Text style={[type.displaySm, { marginTop: 34 }]}>Recently played</Text>
      <View style={{ marginTop: 10 }}>
        {recent.map((t, i) => (
          <TrackRow key={`${t.id}-${i}`} track={t} onPress={() => play(t.id)} />
        ))}
      </View>
    </ScrollView>
  );
}
