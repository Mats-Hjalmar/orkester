import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import QueueRotor from './QueueRotor';
import QueueCascade from './QueueCascade';
import QueueTunnel from './QueueTunnel';
import { progressOf } from '../components/trackProgress';
import type { QueueDesign } from './queueDesign';
import { ChevronRight, Play, Queue, Speaker } from '../icons';
import { colors, radii } from '../theme/tokens';
import { type } from '../theme/type';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';
import { accentTextOf, groupCount } from '../state/selectors';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';
import { useTone } from './tone';

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
  const tone = useTone();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, marginLeft: 32, marginTop: 24, borderRadius: radii.pill, borderWidth: 1, borderColor: tone.line(0.12), backgroundColor: tone.surface, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ transform: [{ rotate: '180deg' }] }}>
        <ChevronRight size={16} color={tone.fg} />
      </View>
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, color: tone.fg }}>Rooms</Text>
    </Pressable>
  );
}

// The three queue designs under trial, picked by the top bar's A/B/C switch.
const QUEUE_VIEWS = { a: QueueRotor, b: QueueCascade, c: QueueTunnel } as const;

// The FOCUSED Now Playing for ONE group. It takes the group (and, on narrow
// layouts, an optional onBack) rather than reading any global active-group
// singleton — every control here is routed through groupControls(group.id), so
// it drives exactly this group. In the desktop master–detail the list is always
// present, so onBack is omitted and no back button renders.
export default function DesktopNowPlaying({ group, design, onBack, onSearch }: { group?: Group; design: QueueDesign; onBack?: () => void; onSearch?: () => void }) {
  const tone = useTone();
  const store = useStore();
  const { state, getTrack, roomName, config, queueFor, clearQueue, reorderQueue, removeQueueItem, playQueueIndex } = store;
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
          <View style={{ width: 64, height: 64, borderRadius: radii.pill, backgroundColor: tone.surface, borderWidth: 1, borderColor: tone.line(0.1), alignItems: 'center', justifyContent: 'center' }}>
            <Speaker size={30} color={tone.muted} />
          </View>
          <Text style={[type.displaySm, { color: tone.fg, textAlign: 'center' }]}>{heading}</Text>
          {status === 'loading' || status === 'idle' ? (
            <Text style={[type.bodyMuted, { color: tone.muted, textAlign: 'center' }]}>Listening for Sonos on this network…</Text>
          ) : (
            <>
              <Text style={[type.bodyMuted, { color: tone.muted, textAlign: 'center', lineHeight: 20 }]}>
                Make sure this device is on the same Wi‑Fi network as your Sonos, and that
                Local Network access is allowed:
              </Text>
              <Text style={[type.bodyMuted, { color: tone.muted, textAlign: 'center', fontFamily: font.mono, fontSize: 12 }]}>
                System Settings → Privacy & Security → Local Network → enable Orkester
              </Text>
              {!!state.topologyError && (
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.danger, textAlign: 'center' }}>
                  {state.topologyError}
                </Text>
              )}
              <Text style={[type.small, { textAlign: 'center', color: tone.subtle }]}>Retrying automatically…</Text>
            </>
          )}
        </Centered>
      </View>
    );
  }

  const g = group;
  const tr = getTrack(g.trackId);
  const idle = g.id === '' || tr.id === PLACEHOLDER_TRACK_ID;
  const here = g.roomIds.length ? `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim() : 'this group';
  const fullQueue = queueFor(g.id);
  // A group with a loaded queue is controllable even when it reports no
  // now-playing metadata — Play resumes the queue.
  const controllable = !idle || fullQueue.length > 0;
  const queueBusy = store.queuePending(g.id);
  // A stream plays without a queue; the queue view then holds just the current track.
  const streamOnly = fullQueue.length === 0 && !idle;
  const queueItems = streamOnly ? [{ title: tr.title, artist: tr.artist, album: tr.album, artUrl: tr.artUrl }] : fullQueue;
  const prog = progressOf(g, tr);
  const QueueView = QUEUE_VIEWS[design];
  const queueProps = {
    items: queueItems,
    current: streamOnly ? 0 : g.queueIndex,
    progress: prog.finite ? prog.fraction : null,
    motif: config.coverMotif,
    accent,
    readOnly: streamOnly,
    onPlay: (index: number) => playQueueIndex(g.id, index),
    onReorder: (from: number, to: number) => reorderQueue(g.id, from, to),
    onRemove: (index: number) => removeQueueItem(g.id, index),
  };

  return (
    <View style={{ flex: 1 }}>
      {onBack && <BackButton onPress={onBack} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 44, paddingTop: 28, paddingBottom: 12 }}>
        <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: idle ? tone.faint : accent }} />
        <Text style={[type.eyebrow, { flex: 1, color: tone.subtle }]}>{here}</Text>
        {fullQueue.length > 0 && (
          <>
            <Queue size={16} color={tone.subtle} />
            <Text style={[type.eyebrow, { color: tone.subtle }]}>Queue · {fullQueue.length}</Text>
            <Pressable onPress={() => clearQueue(g.id)} hitSlop={6} style={({ pressed }) => ({ marginLeft: 10, opacity: pressed ? 0.5 : 1 })}>
              {queueBusy ? (
                <ActivityIndicator size="small" color={tone.muted} />
              ) : (
                <Text style={{ fontFamily: font.bodyMedium, fontSize: 12, color: tone.fg }}>Clear</Text>
              )}
            </Pressable>
          </>
        )}
      </View>

      {queueItems.length > 0 ? (
        <QueueView
          key={`${design}:${g.id}:${streamOnly}`}
          {...queueProps}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {!controllable && onSearch && (
            <Pressable
              onPress={onSearch}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 18, borderRadius: radii.pill, backgroundColor: accent, opacity: pressed ? 0.8 : 1 })}
            >
              <Play size={15} fill={accentText} />
              <Text style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: accentText }}>Play something here</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}
