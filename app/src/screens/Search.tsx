import React from 'react';
import { Text, View } from 'react-native';
import { Search as SearchIcon } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';

// The mockup ships the Search tab as a destination without content yet.
export default function Search() {
  return (
    <View style={{ flex: 1, paddingTop: 56, paddingHorizontal: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={type.displayXL}>Search</Text>
        <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: ink(0.06) }}>
          <Text style={{ fontFamily: font.mono, fontSize: 10, color: colors.fgSubtle }}>SOON</Text>
        </View>
      </View>
      {/* Search/browse is deferred with the real engine — the field is inert. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          marginTop: 22,
          height: 44,
          paddingHorizontal: 16,
          borderRadius: radii.pill,
          backgroundColor: colors.bgPaper,
          borderWidth: 1,
          borderColor: ink(0.1),
          opacity: 0.6,
        }}
      >
        <SearchIcon size={18} color={colors.fgSubtle} />
        <Text style={{ fontFamily: font.body, fontSize: 14, color: colors.fgSubtle }}>Artists, albums, stations</Text>
      </View>
      <Text style={[type.bodyMuted, { marginTop: 28 }]}>Nothing here yet — search lands in a later pass.</Text>
    </View>
  );
}
