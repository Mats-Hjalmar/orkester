import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Speaker } from '../icons';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { radii } from '../theme/tokens';

export interface ChipModel {
  id: string;
  name: string;
  member: boolean;
  other: boolean;
  tag: string;
  bg: string;
  fg: string;
  border: string;
  onPress: () => void;
}

export default function SpeakerChip({ chip, showIcon = false }: { chip: ChipModel; showIcon?: boolean }) {
  return (
    <Pressable
      onPress={chip.onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderRadius: radii.pill,
        backgroundColor: chip.bg,
        borderWidth: 1,
        borderColor: chip.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {showIcon && <Speaker size={15} color={chip.fg} />}
      <Text style={[type.body, { fontSize: 12.5, color: chip.fg }]}>{chip.name}</Text>
      {chip.other && chip.tag ? (
        <View>
          <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: chip.fg, opacity: 0.7 }}>{chip.tag}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
