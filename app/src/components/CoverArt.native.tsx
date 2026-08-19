import React from 'react';
import { View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Motif } from '../state/types';
import { radii } from '../theme/tokens';

// The DEVICE implementation of CoverArt. Metro resolves this over CoverArt.tsx,
// which the Electron renderer keeps (it uses a plain RN Image — expo-image is not
// in that bundle).
//
// Album art is served by the speaker over the LAN and re-requested on every poll
// that changes the track id. expo-image gives it a memory+disk cache and a
// cross-fade, so a re-render doesn't flash an empty square. `recyclingKey` resets
// the view when the URL changes so a recycled row can't show the previous cover.

interface Props {
  size: number;
  coverBg: string;
  coverShape: string;
  motif: Motif;
  radius?: number;
  shadow?: string;
  ring?: string;
  artUrl?: string;
  children?: React.ReactNode;
}

export default function CoverArt({ size, coverBg, coverShape, motif, radius = radii.lg, shadow, ring, artUrl, children }: Props) {
  const shape: ViewStyle =
    motif === 'arc'
      ? { width: size * 1.28, height: size * 1.28, left: size * -0.14, bottom: size * -0.58 }
      : { width: size * 0.6, height: size * 0.6, left: size * 0.2, top: size * 0.16 };

  const outer: ViewStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    ...(shadow ? ({ boxShadow: shadow } as ViewStyle) : null),
    ...(ring ? { borderWidth: 2, borderColor: ring } : null),
  };

  return (
    <View style={outer}>
      <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: coverBg }}>
        {artUrl ? (
          <Image
            source={{ uri: artUrl }}
            style={{ width: size, height: size }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={180}
            recyclingKey={artUrl}
          />
        ) : (
          <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: coverShape }, shape]} />
        )}
        {children}
      </View>
    </View>
  );
}
