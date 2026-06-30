import React from 'react';
import { Text, View } from 'react-native';
import CoverArt from './CoverArt';
import { radii } from '../theme/tokens';
import { font } from '../theme/fonts';
import { synthesizeArt } from '@orkester/core/state';
import type { Motif, QueueItem } from '../state/types';

// One "Up next" row, shared by the phone and desktop Now Playing: cover + title +
// artist, with a platform-specific affordance in the `trailing` slot (phone passes
// chevron reorder buttons; desktop passes a drag handle). `current` bolds the title
// and shows an accent dot — desktop's current-track marker; the phone leaves it off.
//
// The row owns NO fixed height: the desktop drag math applies translateY to a
// fixed-height wrapper, and the phone wraps each row for spacing, so each caller
// controls row height itself.
export default function QueueRow({
  item,
  motif,
  fg,
  muted,
  current = false,
  accent,
  trailing,
}: {
  item: QueueItem;
  motif: Motif;
  fg: string;
  muted: string;
  current?: boolean;
  accent?: string;
  trailing?: React.ReactNode;
}) {
  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <CoverArt size={40} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={8} artUrl={item.artUrl} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: current ? font.bodySemiBold : font.bodyMedium, fontSize: 14, color: fg }}>{title}</Text>
        {!!item.artist && <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: muted, marginTop: 1 }}>{item.artist}</Text>}
      </View>
      {current && !!accent && <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: accent }} />}
      {trailing}
    </View>
  );
}
