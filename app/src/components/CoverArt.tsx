import React, { useEffect, useRef, useState } from 'react';
import { Image, View, ViewStyle } from 'react-native';
import type { ApiArt } from '@orkester/core';
import { useStore } from '../state/store';
import { Motif } from '../state/types';
import { radii } from '../theme/tokens';

// Covers this size or larger load the 640 px image; smaller ones the 300 px one.
const LARGE_MIN_SIZE = 150;

// Shared across instances so a remounted row (the queue re-keys rows on reorder)
// shows its cover at once instead of looking it up again.
const resolvedArt = new Map<string, ApiArt>();

// The speaker's own art URL is slow (seconds per cover) and always full size, so
// a cover is only looked up once it scrolls into view, then loaded at the size it
// is drawn. A failed lookup falls back to the speaker's URL, which still works.
function useSizedArt(artUrl: string | undefined, large: boolean, ref: React.RefObject<View | null>): string | undefined {
  const { resolveArt } = useStore();
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<{ artUrl: string; art: ApiArt }>();

  useEffect(() => {
    // react-native-web renders a View as a DOM element.
    const node = ref.current as unknown as Element | null;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  // resolveArt is left out of the deps: the store value is rebuilt on every state
  // change, but every instance forwards to the same api.
  useEffect(() => {
    if (!artUrl || !visible || resolvedArt.has(artUrl)) return;
    let live = true;
    resolveArt(artUrl).then(
      (art) => {
        resolvedArt.set(artUrl, art);
        if (live) setResult({ artUrl, art });
      },
      () => {
        if (live) setResult({ artUrl, art: { small: artUrl, large: artUrl } });
      },
    );
    return () => {
      live = false;
    };
  }, [artUrl, visible]);

  if (!artUrl) return undefined;
  const art = resolvedArt.get(artUrl) ?? (result?.artUrl === artUrl ? result.art : undefined);
  if (!art) return undefined;
  return large ? art.large : art.small;
}

interface Props {
  size: number; // square side, px
  coverBg: string;
  coverShape: string;
  motif: Motif;
  radius?: number;
  shadow?: string; // optional boxShadow, applied to an OUTER wrapper (never on the clip)
  ring?: string; // optional accent ring color (now-playing track highlight)
  artUrl?: string; // real album art from the speaker; when set it replaces the drawn motif
  large?: boolean; // load the full-size cover even when drawn small (it's already loaded elsewhere)
  children?: React.ReactNode; // optional overlay, positioned by the caller
}

// A cover: the speaker's real album art when we have a URL, otherwise a drawn
// pastel field with one oversized circle "motif" clipped by the rounded square
// (`sun` = a disc high-centred; `arc` = a big disc rising from the bottom edge).
// Shadow and overflow:'hidden' must never share a node, so the shadow lives on
// the outer wrapper and the clip on the inner view.
export default function CoverArt({ size, coverBg, coverShape, motif, radius = radii.lg, shadow, ring, artUrl, large, children }: Props) {
  const ref = useRef<View>(null);
  const src = useSizedArt(artUrl, large || size >= LARGE_MIN_SIZE, ref);
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
    <View ref={ref} style={outer}>
      <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: coverBg }}>
        {src ? (
          <Image source={{ uri: src }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: coverShape }, shape]} />
        )}
        {children}
      </View>
    </View>
  );
}
