import React from 'react';
import { Image, View, ViewStyle } from 'react-native';
import { Motif } from '../state/types';
import { radii } from '../theme/tokens';

interface Props {
  size: number; // square side, px
  coverBg: string;
  coverShape: string;
  motif: Motif;
  radius?: number;
  shadow?: string; // optional boxShadow, applied to an OUTER wrapper (never on the clip)
  ring?: string; // optional accent ring color (now-playing track highlight)
  artUrl?: string; // real album art from the speaker; when set it replaces the drawn motif
  children?: React.ReactNode; // overlay labels (cat/year), positioned by caller
}

// A cover: the speaker's real album art when we have a URL, otherwise a drawn
// pastel field with one oversized circle "motif" clipped by the rounded square
// (`sun` = a disc high-centred; `arc` = a big disc rising from the bottom edge).
// Shadow and overflow:'hidden' must never share a node, so the shadow lives on
// the outer wrapper and the clip on the inner view.
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
          <Image source={{ uri: artUrl }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: coverShape }, shape]} />
        )}
        {children}
      </View>
    </View>
  );
}
