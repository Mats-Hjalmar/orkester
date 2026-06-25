import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Search as SearchIcon } from '../icons';
import { type } from '../theme/type';
import { colors, ink, radii } from '../theme/tokens';
import { font } from '../theme/fonts';

// Browsing/picking a track from the library (the mockup's "Made for the morning"
// and "Recently played" shelves) is DEFERRED with the real engine: there is no
// music library to read and `selectTrack` is a no-op, so the old mock ids resolve
// to the placeholder track. Rather than render shelves of "Nothing playing", Home
// presents a calm coming-soon state — the layout/altitude is preserved, it is
// just clearly non-interactive.
export default function Home() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 22, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
      <Text style={type.eyebrow}>Good to see you</Text>
      <Text style={[type.displayXL, { marginTop: 8 }]}>Listen.</Text>
      <Text style={[type.bodyMuted, { marginTop: 10 }]}>
        Control whatever is already playing from the Now Playing and Rooms tabs.
      </Text>

      <View
        style={{
          marginTop: 28,
          padding: 20,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: ink(0.1),
          backgroundColor: colors.bgPaper,
          gap: 10,
          opacity: 0.85,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <SearchIcon size={18} color={colors.fgSubtle} />
          <Text style={[type.title, { fontSize: 15 }]}>Browsing your library</Text>
          <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: ink(0.06) }}>
            <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.fgSubtle }}>SOON</Text>
          </View>
        </View>
        <Text style={[type.bodyMuted, { lineHeight: 18 }]}>
          Picking tracks, albums and stations to start lands in a later pass. For now Orkester
          controls live playback — play/pause, skip, volume, grouping and shuffle all work.
        </Text>
      </View>

      {/* Disabled preview shelves: keep the editorial layout but make it clearly
          non-interactive (dimmed, no press handlers, placeholder tiles). */}
      <Text style={[type.displaySm, { marginTop: 34, opacity: 0.4 }]}>Made for the morning</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16, opacity: 0.4 }}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{ width: '47%', aspectRatio: 1, borderRadius: radii.lg, backgroundColor: ink(0.06), borderWidth: 1, borderColor: ink(0.08) }}
          />
        ))}
      </View>
    </ScrollView>
  );
}
