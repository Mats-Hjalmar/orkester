import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import SpeakerChip from '../components/SpeakerChip';
import { ChevronRight, Dots, Next, Pause, Play, Plus, Prev, Queue, Repeat, Shuffle, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { accentTextOf, chipsFor, groupCount } from '../state/selectors';
import { progressOf } from '../components/trackProgress';
import { PLACEHOLDER_TRACK_ID, synthesizeArt } from '@orkester/core/state';
import type { Group, QueueItem } from '../state/types';
import type { Motif } from '../state/types';

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

// One row in the queue list: real album art (or a synthesized cover) + title +
// artist. The currently-playing entry is marked with an accent dot + bolder title.
function QueueRow({ item, motif, accent, current }: { item: QueueItem; motif: Motif; accent: string; current: boolean }) {
  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <CoverArt size={40} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={8} artUrl={item.artUrl} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: current ? font.bodySemiBold : font.bodyMedium, fontSize: 14, color: colors.fg }}>{title}</Text>
        {!!item.artist && <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: colors.fgMuted, marginTop: 1 }}>{item.artist}</Text>}
      </View>
      {current && <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: accent }} />}
    </View>
  );
}

// The FOCUSED Now Playing for ONE group. It takes the group (and, on narrow
// layouts, an optional onBack) rather than reading any global active-group
// singleton — every control here is routed through groupControls(group.id), so
// it drives exactly this group. In the desktop master–detail the list is always
// present, so onBack is omitted and no back button renders.
export default function DesktopNowPlaying({ group, onBack }: { group?: Group; onBack?: () => void }) {
  const store = useStore();
  const { state, getTrack, roomName, config, groupControls, queueFor } = store;
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const status = state.topologyStatus;
  const connected = status === 'ready' && state.groups.length > 0;

  // --- Not connected: discovering / connect instructions ------------------
  if (!connected || !group) {
    const heading = status === 'loading' || status === 'idle' ? 'Finding your speakers' : 'No Sonos speakers found';
    return (
      <View style={{ flex: 1 }}>
        {onBack && <BackButton onPress={onBack} />}
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
  const chips = chipsFor(store, g);
  const idle = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const here = g.roomIds.length ? `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim() : 'this group';
  const ctrl = groupControls(g.id);
  const prog = progressOf(g, tr);
  const vol = (g.muted ? 0 : store.groupVol(g)) / 100;
  const queue = queueFor(g.id);

  return (
    <View style={{ flex: 1 }}>
      {onBack && <BackButton onPress={onBack} />}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexDirection: 'row', gap: 44, padding: 44, paddingTop: 44 }} showsVerticalScrollIndicator={false}>
        {/* cover */}
        <View style={{ width: 374 }}>
          <CoverArt size={374} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={24} shadow={shadow.lg} artUrl={idle ? undefined : tr.artUrl}>
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

          {/* Nothing playing → show no title and no transport. The empty cover +
              the room context already say it; people understand. Controls only
              appear when there's actually something to control. */}
          {!idle && (
            <>
              {/* Title only when the speaker reports one — no fabricated label. */}
              {!!tr.title && (
                <Text testID="np-title" style={{ fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -1.1, color: colors.fg, marginTop: 14 }}>{tr.title}</Text>
              )}
              {!!tr.artist && <Text style={{ fontFamily: font.body, fontSize: 19, color: colors.fgMuted, marginTop: 10 }}>{tr.artist}</Text>}
              {!!tr.album && (
                <Text style={{ fontFamily: font.body, fontSize: 13, color: colors.fg, marginTop: 18 }}>{tr.album}</Text>
              )}
              {/* Add-to-queue / more actions are deferred — visible but inert. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, opacity: 0.4 }}>
                <CircleButton><Plus size={19} color={colors.fg} /></CircleButton>
                <CircleButton><Dots size={19} color={colors.fg} /></CircleButton>
              </View>

              {/* Inline transport for THIS group. */}
              <View style={{ marginTop: 30, gap: 14, maxWidth: 560 }}>
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
            </>
          )}

          <Text style={[type.eyebrow, { marginTop: 34, marginBottom: 11 }]}>Speakers — tap to group</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {chips.map((c) => <SpeakerChip key={c.id} chip={c} showIcon />)}
          </View>

          {/* The coordinator's queue, below now playing. Hidden when empty (some
              streaming sources play without a queue) — no placeholder chrome. */}
          {queue.length > 0 && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 30, marginBottom: 8 }}>
                <Queue size={16} color={colors.fgSubtle} />
                <Text style={type.eyebrow}>Queue · {queue.length}</Text>
              </View>
              <View>
                {queue.map((q, i) => (
                  <QueueRow
                    key={`${i}:${q.title}:${q.artist}`}
                    item={q}
                    motif={config.coverMotif}
                    accent={accent}
                    current={!idle && q.title === tr.title && q.artist === tr.artist}
                  />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
