import React from 'react';
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import TransportRow from '../components/TransportRow';
import QueueList from '../components/phone/QueueList';
import { ScreenScroll } from '../components/phone/Screen';
import { tapCommit, tapSelection, tapWarn } from '../components/phone/haptics';
import { TopologyNotice, topologyPhase } from '../components/TopologyState';
import { ChevronDown, Play, Queue, Search, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { useGroupRoute, useNav } from '../navigation';
import { accentTextOf, groupCount } from '../state/selectors';
import { progressOf } from '../components/trackProgress';
import { writeLastRoom } from '../state/lastRoom';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';

// The display faces are set oversized (32px+) and would break the layout at the
// largest accessibility text sizes. Cap their growth instead of disabling scaling —
// body text stays fully scalable.
const DISPLAY_SCALE_CAP = 1.6;

// A bordered pill action (Search / Speakers) on the room detail.
function ActionPill({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 48,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: ink(0.12),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 14, color: colors.fg }}>{label}</Text>
    </Pressable>
  );
}

function BackRow({ label }: { label: string }) {
  const nav = useNav();
  return (
    <Pressable
      onPress={() => nav.goBack()}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Back to rooms"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ transform: [{ rotate: '90deg' }] }}>
        <ChevronDown size={24} color={colors.fg} />
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.bodySemiBold, fontSize: 14, color: colors.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function NowPlaying() {
  const store = useStore();
  const nav = useNav();
  const { groupId } = useGroupRoute<'Room'>().params;
  const {
    state,
    groupById,
    getTrack,
    roomName,
    groupVol,
    volumeSettling,
    config,
    focusGroup,
    groupControls,
    transportPending,
    queuePending,
    queueFor,
    clearQueue,
    reorderQueue,
    playQueueIndex,
  } = store;
  const { width } = useWindowDimensions();

  // Resolve the group FRESH from topology every render. If it was regrouped — by us
  // in the Speakers sheet, or by anyone in the official Sonos app — it is gone, and
  // we say so rather than silently retargeting at a different room the user would
  // then keep controlling by mistake.
  const g = groupById(groupId);

  // Focus loads this group atomically and pins it to the fast poll cadence.
  React.useEffect(() => {
    focusGroup(groupId);
    // focusGroup is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Remember the speakers behind this room so the next launch opens on them.
  // Keyed on the room set, so a regroup re-records it.
  const roomKey = g ? g.roomIds.join('\n') : '';
  React.useEffect(() => {
    if (roomKey !== '') void writeLastRoom(roomKey.split('\n'));
  }, [roomKey]);

  if (!g) {
    const phase = topologyPhase(state.topologyStatus, state.groups.length > 0);
    return (
      <ScreenScroll>
        <BackRow label="Rooms" />
        <View style={{ marginTop: 24 }}>
          {phase === 'ready' ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 16, borderWidth: 1, borderColor: ink(0.1), borderRadius: radii.lg, backgroundColor: colors.bgPaper }}>
              <Speaker size={28} color={colors.fgSubtle} />
              <Text style={{ fontFamily: font.bodySemiBold, fontSize: 15, color: colors.fg, textAlign: 'center' }}>
                This group is gone
              </Text>
              <Text style={{ fontFamily: font.body, fontSize: 12.5, lineHeight: 17, color: colors.fgMuted, textAlign: 'center' }}>
                Its speakers were regrouped. Go back to pick a group.
              </Text>
            </View>
          ) : (
            <TopologyNotice phase={phase} error={state.topologyError} />
          )}
        </View>
      </ScreenScroll>
    );
  }

  const tr = getTrack(g.trackId);
  const idle = tr.id === PLACEHOLDER_TRACK_ID;
  const cover = Math.min(width - 48, 420);
  const accent = config.accentColor;
  const accentText = accentTextOf(accent);
  const ctrl = groupControls(g.id);
  const pending = transportPending(g.id);
  const prog = progressOf(g, tr);
  const groupVolume = groupVol(g); // 0–100, or null when no real reading yet

  // "Up next" = the queue AFTER the currently-playing track (the current one is
  // shown big above). qStart is the absolute index of the first up-next item, so
  // reorder/play map local -> absolute through it.
  const fullQueue = queueFor(g.id);
  const qStart = g.queueIndex >= 0 ? g.queueIndex + 1 : 0;
  const upNext = fullQueue.slice(qStart);

  // A group with a loaded queue is controllable even with no now-playing metadata —
  // Play resumes the queue. With neither there is nothing to transport, so we offer
  // a way to put music on instead of a Play button that does nothing.
  const controllable = !idle || fullQueue.length > 0;
  const headerLabel = `${roomName(g.roomIds[0])} ${groupCount(g)}`.trim();

  return (
    <ScreenScroll horizontal={24}>
      <BackRow label={headerLabel} />

      <View style={{ marginTop: 22 }}>
        <CoverArt
          size={cover}
          coverBg={tr.coverBg}
          coverShape={tr.coverShape}
          motif={config.coverMotif}
          radius={radii.xl}
          shadow={shadow.lg}
          artUrl={idle ? undefined : tr.artUrl}
        >
          {idle && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Speaker size={56} color="rgba(26,24,20,0.35)" />
            </View>
          )}
        </CoverArt>
      </View>

      {/* Title / artist / album only when the speaker reports them — never a
          fabricated label. */}
      <View style={{ marginTop: 24 }}>
        {!!tr.title && (
          <Text
            maxFontSizeMultiplier={DISPLAY_SCALE_CAP}
            style={{ fontFamily: font.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: colors.fg }}
          >
            {tr.title}
          </Text>
        )}
        {!!tr.artist && (
          <Text style={{ fontFamily: font.body, fontSize: 15, color: colors.fgMuted, marginTop: 6 }}>{tr.artist}</Text>
        )}
        {!!tr.album && (
          <Text style={{ fontFamily: font.body, fontSize: 12.5, color: colors.fgSubtle, marginTop: 4 }}>{tr.album}</Text>
        )}
      </View>

      {!controllable && (
        <Pressable
          onPress={() => nav.navigate('Search', { groupId: g.id })}
          accessibilityRole="button"
          accessibilityLabel="Play something here"
          style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 20, marginTop: 22, borderRadius: radii.pill, backgroundColor: accent, opacity: pressed ? 0.8 : 1 })}
        >
          <Play size={15} fill={accentText} />
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 14, color: accentText }}>Play something here</Text>
        </Pressable>
      )}

      {controllable && (
        <>
          {/* Timeline ONLY for a real finite track. A live stream has no duration and
              nothing-playing has no position, so we show no scrubber rather than an
              inert one reading 0:00 / --:--. */}
          {prog.finite ? (
            <View style={{ marginTop: 22 }}>
              <TrackBar
                value={prog.fraction}
                onScrub={ctrl.seek}
                label="Seek"
                trackColor={ink(0.12)}
                fillColor={colors.fg}
                height={4}
                thumb
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }}>
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted }}>{fmt(prog.elapsed)}</Text>
                <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fgMuted }}>
                  {prog.remaining === null ? '' : `-${fmt(prog.remaining)}`}
                </Text>
              </View>
            </View>
          ) : (
            prog.isLive && (
              <Text style={{ fontFamily: font.mono, fontSize: 11, color: colors.fg, letterSpacing: 1.2, marginTop: 20 }}>
                ● LIVE
              </Text>
            )
          )}

          <View style={{ marginTop: 22 }}>
            <TransportRow group={g} fg={colors.fg} muted={colors.fgSubtle} onAct={tapCommit} />
          </View>

          {/* Volume — only when backed by a real reading from every member. The left
              icon is the mute toggle. */}
          {groupVolume !== null && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}>
              <Pressable
                onPress={() => {
                  ctrl.toggleMute();
                  tapCommit();
                }}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={g.muted ? 'Unmute' : 'Mute'}
                accessibilityState={{ selected: g.muted }}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                {pending === 'mute' ? (
                  <ActivityIndicator size="small" color={colors.fg} />
                ) : g.muted ? (
                  <VolumeLow size={20} color={colors.fg} />
                ) : (
                  <VolumeHigh size={20} color={colors.fg} />
                )}
              </Pressable>
              <TrackBar
                value={(g.muted ? 0 : groupVolume) / 100}
                onScrub={(f) => store.setGroupVol(g.id, f)}
                onCommit={tapSelection}
                label="Group volume"
                trackColor={ink(0.12)}
                fillColor={colors.fg}
                height={4}
                thumb
                grabThumbOnly
                loading={volumeSettling(g)}
                style={{ flex: 1 }}
              />
            </View>
          )}
        </>
      )}

      {/* Room-scoped actions: search to play/queue onto THIS group, or manage which
          speakers are grouped with it. Both open over this screen. */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <ActionPill
          icon={<Search size={18} color={colors.fg} />}
          label="Search"
          onPress={() => nav.navigate('Search', { groupId: g.id })}
        />
        <ActionPill
          icon={<Speaker size={18} color={colors.fg} />}
          label="Speakers"
          onPress={() => nav.navigate('Speakers', { groupId: g.id })}
        />
      </View>

      {/* Up next — the coordinator's queue after the current track. Hidden when
          empty (some streaming sources play without a queue). Tap a row to jump to
          it; long-press and drag, or use the chevrons, to reorder. */}
      {upNext.length > 0 && (
        <View style={{ marginTop: 30 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Queue size={16} color={colors.fgMuted} />
            <Text style={{ flex: 1, fontFamily: font.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.fgMuted }}>
              Up next · {upNext.length}
            </Text>
            <Pressable
              onPress={() => {
                clearQueue(g.id);
                tapWarn();
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Clear queue"
              style={({ pressed }) => ({ minHeight: 32, justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
            >
              {queuePending(g.id) ? (
                <ActivityIndicator size="small" color={colors.fgMuted} />
              ) : (
                <Text style={{ fontFamily: font.bodyMedium, fontSize: 12, color: colors.fgMuted }}>Clear</Text>
              )}
            </Pressable>
          </View>
          <QueueList
            items={upNext}
            motif={config.coverMotif}
            fg={colors.fg}
            muted={colors.fgMuted}
            onReorder={(from, to) => reorderQueue(g.id, qStart + from, qStart + to)}
            onPlay={(index) => {
              playQueueIndex(g.id, qStart + index);
              tapCommit();
            }}
          />
        </View>
      )}
    </ScreenScroll>
  );
}
