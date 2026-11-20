import React from 'react';
import { Text, View } from 'react-native';
import { Queue } from '../icons';
import { colors } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import type { Group } from '../state/types';

// Under Spotify Connect the speaker reports only the single next track; the rest
// of the queue lives in the Spotify app. Shared by the phone and desktop Now Playing.
export default function SpotifyUpNext({ upNext }: { upNext: Group['upNext'] }) {
  return (
    <View>
      {upNext && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Queue size={16} color={colors.textTertiary} />
            <Text style={type.eyebrow}>Up next</Text>
          </View>
          <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 14, color: colors.text }}>{upNext.title}</Text>
          {!!upNext.artist && (
            <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.textSecondary, marginTop: 1 }}>{upNext.artist}</Text>
          )}
        </>
      )}
      <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.textTertiary, marginTop: upNext ? 10 : 0 }}>
        See full queue in the Spotify app
      </Text>
    </View>
  );
}
