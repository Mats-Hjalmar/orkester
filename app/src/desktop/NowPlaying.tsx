import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import SpeakerChip from '../components/SpeakerChip';
import { ChevronRight, Dots, Heart, Next, Pause, Play, Plus, Prev, Queue, Repeat, Shuffle, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { accentTextOf, chipsFor, groupCount } from '../state/selectors';
import { progressOf } from '../components/trackProgress';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';

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

// A small back affordance to return to the rooms grid. Reuses the chevron motif.
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 32, marginTop: 24, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.12), backgroundColor: colors.bgPaper, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <ChevronRight size={16} color={colors.fg} />
      </View>
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.fg }}>Rooms</Text>
    </Pressable>
  );
}

// The FOCUSED Now Playing for ONE group. It takes the group + an onBack callback
// rather than reading any global active-group singleton — every control here is
// routed through groupControls(group.id), so it drives exactly this group.
export default function DesktopNowPlaying({ group, onBack }: { group?: Group; onBack: () => void }) {
  const store = useStore();
  const { state, getTrack, roomName, isLiked, config, toggleLike, groupControls } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const status = state.topologyStatus;
  const connected = status === 'ready' && state.groups.length > 0;

  // --- Not connected: discovering / connect instructions ------------------
  if (!connected || !group) {
    const heading = status === 'loading' || status === 'idle' ? 'Finding your speakers' : 'No Sonos speakers found';
    return (
      <View style={{ flex: 1 }}>
        <BackButton onPress={onBack} />
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
      </View>
    );
  }

  const g = group;
  const tr = getTrack(g.trackId);
  const liked = isLiked(tr.id);
  const chips = chipsFor(store, g);
  const idle = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const here = g.roomIds.length ? `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim() : 'this group';
  const ctrl = groupControls(g.id);
  const prog = progressOf(g, tr);
  const vol = (g.muted ? 0 : store.groupVol(g)) / 100;

  return (
    <View style={{ flex: 1 }}>
      <BackButton onPress={onBack} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 44, padding: 44, paddingTop: 24 }} showsVerticalScrollIndicator={false}>
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
            <Text style={type.eyebrow}>{here}</Text>
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
              {tr.title ? (
                <Text testID="np-title" style={{ fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -1.1, color: colors.fg, marginTop: 14 }}>{tr.title}</Text>
              ) : (
                // Playing, but the speaker reported no track metadata — honest,
                // not a fabricated song title.
                <Text testID="np-title" style={{ fontFamily: font.display, fontSize: 40, lineHeight: 46, letterSpacing: -0.6, color: colors.fgMuted, marginTop: 14 }}>Track details unavailable</Text>
              )}
              {!!tr.artist && <Text style={{ fontFamily: font.body, fontSize: 19, color: colors.fgMuted, marginTop: 10 }}>{tr.artist}</Text>}
              {!!tr.album && (
                <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fg, marginTop: 18 }}>{tr.album}</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22 }}>
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

          {/* Inline transport for THIS group. */}
          <View style={{ marginTop: 30, gap: 14, maxWidth: 560, opacity: idle ? 0.55 : 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 26 }}>
              <Pressable onPress={() => ctrl.setShuffle(!g.shuffle)} hitSlop={8}><Shuffle size={20} color={g.shuffle ? colors.fg : colors.fgSubtle} /></Pressable>
              <Pressable onPress={ctrl.prev} hitSlop={8}><Prev size={24} fill={colors.fg} /></Pressable>
              <Pressable onPress={ctrl.togglePlay} style={{ width: 56, height: 56, borderRadius: radii.pill, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.sm } as any}>
                {g.isPlaying ? <Pause size={22} fill={accentText} /> : <Play size={22} fill={accentText} />}
              </Pressable>
              <Pressable onPress={ctrl.next} hitSlop={8}><Next size={24} fill={colors.fg} /></Pressable>
              <Pressable onPress={() => ctrl.setRepeat(!g.repeat)} hitSlop={8}><Repeat size={20} color={g.repeat ? colors.fg : colors.fgSubtle} /></Pressable>
            </View>
            {/* Timeline + scrub — ONLY for a real finite track. For live/unknown
                metadata there's no accurate position, so we show no scrubber
                rather than an interpolated, inaccurate one. */}
            {prog.finite && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 34, textAlign: 'right' }}>{fmt(prog.elapsed)}</Text>
                <TrackBar value={prog.fraction} onScrub={ctrl.seek} trackColor={ink(0.12)} fillColor={colors.fg} height={4} thumb style={{ flex: 1 }} />
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted, width: 38 }}>
                  {prog.remaining === null ? '' : `-${fmt(prog.remaining)}`}
                </Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={ctrl.toggleMute} hitSlop={8}>
                {g.muted ? <VolumeLow size={19} color={colors.fg} /> : <VolumeHigh size={19} color={colors.fg} />}
              </Pressable>
              <TrackBar value={vol} onScrub={ctrl.setVolume} trackColor={ink(0.12)} fillColor={colors.fg} height={4} style={{ flex: 1 }} />
            </View>
          </View>

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
    </View>
  );
}
