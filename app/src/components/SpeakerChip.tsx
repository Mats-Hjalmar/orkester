import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
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
  /** True while this speaker's join/leave is in flight on the Sonos system. */
  busy: boolean;
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
        opacity: chip.busy ? 0.6 : pressed ? 0.7 : 1,
      })}
    >
      {/* The spinner takes the icon's slot so the chip doesn't resize mid-regroup. */}
      {chip.busy ? (
        <View style={{ width: 15, height: 15, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={chip.fg} />
        </View>
      ) : (
        showIcon && <Speaker size={15} color={chip.fg} />
      )}
      <Text style={[type.body, { fontSize: 12.5, color: chip.fg }]}>{chip.name}</Text>
      {chip.other && chip.tag ? (
        <View>
          <Text style={{ fontFamily: font.mono, fontSize: 9.5, color: chip.fg, opacity: 0.7 }}>{chip.tag}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
