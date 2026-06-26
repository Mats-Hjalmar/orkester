import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import SpeakerChip from '../components/SpeakerChip';
import { Dots, Heart, Plus, Queue, Speaker } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { chipsFor, groupCount } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

function CircleButton({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ width: 42, height: 42, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.14), alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      {children}
    </Pressable>
  );
}

// Centered guidance shown when there is nothing to control yet: still discovering,
// couldn't reach any speakers (connect instructions), or connected-but-idle
// (prompt to start playback, since picking tracks in-app is deferred).
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 48 }}>
      <View style={{ maxWidth: 460, alignItems: 'center', gap: 14 }}>{children}</View>
    </View>
  );
}

export default function DesktopNowPlaying() {
  const store = useStore();
  const { state, activeGroup, activeTrack, roomName, isLiked, config, toggleLike } = store;
  const accent = config.accentColor;
  const status = state.topologyStatus;
  const connected = status === 'ready' && state.groups.length > 0;

  // --- Not connected: discovering / connect instructions ------------------
  if (!connected) {
    const heading = status === 'loading' || status === 'idle' ? 'Finding your speakers' : 'No Sonos speakers found';
    return (
      <Centered>
        <View style={{ width: 64, height: 64, borderRadius: radii.pill, backgroundColor: colors.bgPaper, borderWidth: 1, borderColor: ink(0.1), alignItems: 'center', justifyContent: 'center' }}>
          <Speaker size={30} color={colors.fgMuted} />
        </View>
        <Text style={[type.displaySm, { textAlign: 'center' }]}>{heading}</Text>
        {status === 'loading' || status === 'idle' ? (
          <Text style={[type.bodyMuted, { textAlign: 'center' }]}>Listening for Sonos on this network…</Text>
        ) : (
          <>
            <Text style={[type.bodyMuted, { textAlign: 'center', lineHeight: 20 }]}>
              Make sure this device is on the same Wi‑Fi network as your Sonos, and that
              Local Network access is allowed:
            </Text>
            <Text style={[type.bodyMuted, { textAlign: 'center', fontFamily: font.mono, fontSize: 12 }]}>
              System Settings → Privacy & Security → Local Network → enable Orkester
            </Text>
            {!!state.topologyError && (
              <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.danger, textAlign: 'center' }}>
                {state.topologyError}
              </Text>
            )}
            <Text style={[type.small, { textAlign: 'center', color: colors.fgSubtle }]}>Retrying automatically…</Text>
          </>
        )}
      </Centered>
    );
  }

  const g = activeGroup();
  const tr = activeTrack();
  const liked = isLiked(tr.id);
  const chips = chipsFor(store, g);
  const idle = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const here = g.roomIds.length ? `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim() : 'this group';

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 44, padding: 44 }} showsVerticalScrollIndicator={false}>
      {/* cover */}
      <View style={{ width: 374 }}>
        <CoverArt size={374} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={24} shadow={shadow.lg}>
          {!idle && (
            <>
              <Text style={{ position: 'absolute', left: 18, top: 16, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.cat}</Text>
              <Text style={{ position: 'absolute', left: 18, bottom: 16, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.year}</Text>
            </>
          )}
          {idle && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Speaker size={64} color="rgba(26,24,20,0.35)" />
            </View>
          )}
        </CoverArt>
      </View>

      {/* details */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: idle ? colors.fgFaint : accent }} />
          <Text style={type.eyebrow}>{idle ? `Connected · ${here}` : `Playing in ${here}`}</Text>
        </View>

        {idle ? (
          <>
            <Text style={{ fontFamily: font.display, fontSize: 48, lineHeight: 52, letterSpacing: -1, color: colors.fg, marginTop: 14 }}>Nothing playing here</Text>
            <Text style={{ fontFamily: font.body, fontSize: 16, color: colors.fgMuted, marginTop: 12, lineHeight: 23, maxWidth: 460 }}>
              Start something from the Sonos app (or AirPlay/line‑in) and Orkester takes over the
              controls — play/pause, skip, seek, volume and grouping all work here. Picking tracks
              and stations inside Orkester is coming in a later pass.
            </Text>
          </>
        ) : (
          <>
            <Text testID="np-title" style={{ fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -1.1, color: colors.fg, marginTop: 14 }}>{tr.title}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 19, color: colors.fgMuted, marginTop: 10 }}>{tr.artist}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 }}>
              <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fg }}>{tr.album}</Text>
              <View style={{ width: 3, height: 3, borderRadius: radii.pill, backgroundColor: colors.fgFaint }} />
              <Text style={{ fontFamily: font.mono, fontSize: 12, color: colors.fgMuted }}>{tr.cat}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 }}>
              <CircleButton onPress={() => toggleLike(tr.id)}>
                <Heart size={19} color={liked ? colors.danger : colors.fg} fill={liked ? colors.danger : 'none'} />
              </CircleButton>
              {/* Add-to-queue / more actions are deferred — visible but inert. */}
              <View style={{ flexDirection: 'row', gap: 10, opacity: 0.4 }}>
                <CircleButton><Plus size={19} color={colors.fg} /></CircleButton>
                <CircleButton><Dots size={19} color={colors.fg} /></CircleButton>
              </View>
            </View>
          </>
        )}

        <Text style={[type.eyebrow, { marginTop: 34, marginBottom: 11 }]}>Speakers — tap to group</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
          {chips.map((c) => <SpeakerChip key={c.id} chip={c} showIcon />)}
        </View>

        {!idle && (
          <>
            {/* The queue is empty with the real engine (browsing is deferred). */}
            <Text style={[type.eyebrow, { marginTop: 30, marginBottom: 8 }]}>Up next</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radii.lg, borderWidth: 1, borderColor: ink(0.08), backgroundColor: colors.bgPaper, opacity: 0.7 }}>
              <Queue size={20} color={colors.fgSubtle} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: font.bodyMedium, fontSize: 14, color: colors.fg }}>Queue & browsing coming soon</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12, color: colors.fgMuted, marginTop: 2 }}>Up-next and library browsing land in a later pass.</Text>
              </View>
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}
