import React from 'react';
import { View } from 'react-native';
import { Spotify } from '../icons';

// Marks a group the Spotify app is casting to. Playback (and what's "up next")
// is then owned by Spotify, not the Sonos queue.
export default function SpotifyConnectBadge({ size = 14 }: { size?: number }) {
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Playing from Spotify Connect">
      <Spotify size={size} />
    </View>
  );
}
