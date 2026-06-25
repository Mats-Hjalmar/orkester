import React from 'react';
import { Pressable, Text, View } from 'react-native';
import CoverArt from './CoverArt';
import { Pause, Play } from '../icons';
import { colors, radii, shadow, paper } from '../theme/tokens';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, groupCount } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

// Dark pill on Home/Rooms: tap to open Now Playing; the button toggles play.
export default function MiniPlayer() {
  const { activeGroup, activeTrack, roomName, togglePlay, setView, config } = useStore();
  const g = activeGroup();
  const tr = activeTrack();
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const nothing = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  // With nothing playing there is no room context — show a calm subtitle and an
  // inert play button (togglePlay no-ops for the placeholder group anyway).
  const subtitle = nothing ? 'Tap to see your speakers' : `${tr.artist} · ${roomName(g.roomIds[0])} ${groupCount(g)}`;

  return (
    <Pressable
      onPress={() => setView('nowplaying')}
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        backgroundColor: colors.fg,
        borderRadius: radii.xl,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 10,
        boxShadow: shadow.md,
      } as any}
    >
      <CoverArt size={42} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.md} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 13.5, color: colors.bgPaper }}>{tr.title}</Text>
        <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 11.5, color: paper(0.6), marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <Pressable
        onPress={(e) => { e.stopPropagation(); togglePlay(); }}
        style={{ width: 38, height: 38, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', opacity: nothing ? 0.5 : 1 }}
      >
        {g.isPlaying ? <Pause size={17} fill={accentText} /> : <Play size={17} fill={accentText} />}
      </Pressable>
    </Pressable>
  );
}
