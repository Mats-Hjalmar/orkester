import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Search } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';

// Library browsing/track-picking is DEFERRED with the real engine (no library to
// read, `selectTrack` is a no-op). Rather than render shelves of placeholder
// "Nothing playing" tiles, Home keeps the editorial layout but presents it as a
// clearly non-interactive coming-soon state. Live control (play/volume/grouping/
// shuffle) all live in the sidebar + transport bar and keep working.
function DisabledShelf({ title }: { title: string }) {
  return (
    <View style={{ marginTop: 40, opacity: 0.4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Text style={type.displayMd}>{title}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fgMuted }}>See all</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 22, paddingTop: 20 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: 166, height: 166, borderRadius: radii.lg, backgroundColor: ink(0.06), borderWidth: 1, borderColor: ink(0.08) }} />
        ))}
      </View>
    </View>
  );
}

export default function DesktopHome() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 36, paddingBottom: 48 }} showsVerticalScrollIndicator={false}>
      <Text style={type.eyebrow}>Good to see you</Text>
      <Text style={{ fontFamily: font.display, fontSize: 54, lineHeight: 55, letterSpacing: -1, color: colors.fg, marginTop: 10 }}>Listen.</Text>
      <Text style={{ fontFamily: font.body, fontSize: 16, color: colors.fgMuted, marginTop: 8, maxWidth: 520 }}>
        Control whatever is already playing from the sidebar and the transport bar below.
      </Text>

      <View
        style={{
          marginTop: 28,
          maxWidth: 560,
          padding: 22,
          borderRadius: radii.xl,
          borderWidth: 1,
          borderColor: ink(0.1),
          backgroundColor: colors.bgPaper,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Search size={18} color={colors.fgSubtle} />
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 16, color: colors.fg }}>Browsing your library</Text>
          <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: ink(0.06) }}>
            <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.fgSubtle }}>SOON</Text>
          </View>
        </View>
        <Text style={{ fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colors.fgMuted }}>
          Picking tracks, albums and stations to start lands in a later pass. For now Orkester
          controls live playback — play/pause, skip, volume, grouping and shuffle all work.
        </Text>
      </View>

      <DisabledShelf title="Made for the morning" />
      <DisabledShelf title="Recently played" />
    </ScrollView>
  );
}
