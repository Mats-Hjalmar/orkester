import React from 'react';
import { Text, View } from 'react-native';
import { Search, Wave } from '../icons';
import { colors, ink, radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';

// Wordmark + search affordance.
export default function TopBar() {
  return (
    <View style={{ height: 60, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: ink(0.07) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Wave size={22} color={colors.fg} />
        <Text style={[type.wordmark, { fontSize: 24 }]}>orkester</Text>
        <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgSubtle, paddingBottom: 1 }}>multi-room sound</Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ width: 380, height: 38, borderRadius: radii.pill, backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: ink(0.1), flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Search size={17} color={colors.fgSubtle} />
          <Text style={{ fontFamily: font.body, fontSize: 14, color: colors.fgSubtle }}>Search artists, albums, stations</Text>
        </View>
      </View>
    </View>
  );
}
