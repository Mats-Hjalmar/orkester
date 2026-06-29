import React from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import CoverArt from '../components/CoverArt';
import TrackBar from '../components/TrackBar';
import TransportRow from '../components/TransportRow';
import { ChevronDown, Heart, Queue, Search, Speaker, VolumeHigh, VolumeLow } from '../icons';
import { colors, ink, paper, shadow, radii, FRAME } from '../theme/tokens';
import { font } from '../theme/fonts';
import { fmt, useStore } from '../state/store';
import { useNav } from '../navigation';
import { groupCount } from '../state/selectors';
import { progressOf } from '../components/trackProgress';
import { synthesizeArt } from '@orkester/core/state';
import type { Motif, QueueItem } from '../state/types';

// One "Up next" row: cover + title + artist, with up/down reorder controls on the
// right. Mobile uses tappable chevrons rather than the desktop's pointer-capture
// drag — pointer capture is web-only and breaks mid-drag under native touch, so a
// dependency-free, platform-robust control gives the same reorder capability.
function QueueRow({
  item,
  motif,
  fg,
  muted,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  item: QueueItem;
  motif: Motif;
  fg: string;
  muted: string;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 52 }}>
      <CoverArt size={40} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={8} artUrl={item.artUrl} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 14, color: fg }}>{title}</Text>
        {!!item.artist && <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: muted, marginTop: 1 }}>{item.artist}</Text>}
      </View>
      <Pressable onPress={onUp} disabled={!canUp} hitSlop={6} style={{ padding: 4, opacity: canUp ? 1 : 0.25 }}>
        <View style={{ transform: [{ rotate: '180deg' }] }}>
          <ChevronDown size={18} color={fg} />
        </View>
      </Pressable>
      <Pressable onPress={onDown} disabled={!canDown} hitSlop={6} style={{ padding: 4, opacity: canDown ? 1 : 0.25 }}>
        <ChevronDown size={18} color={fg} />
      </Pressable>
    </View>
  );
}

// A bordered pill action (Search / Speakers) on the room detail. Themed by `fg`
// + `border` so it works on both the light and dark Now Playing.
function ActionPill({ icon, label, onPress, fg, border }: { icon: React.ReactNode; label: string; onPress: () => void; fg: string; border: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 46,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ fontFamily: font.bodyMedium, fontSize: 14, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export default function NowPlaying() {
  const store = useStore();
  const nav = useNav();
  const { activeGroup, activeTrack, roomName, groupVol, isLiked, config, seek, setActiveVol, toggleLike, queueFor, clearQueue, reorderQueue } = store;
  const { width } = useWindowDimensions();
  const frameW = Math.min(FRAME.width, width);
  const cover = frameW - 48;

  const g = activeGroup();
  const tr = activeTrack();
  const liked = isLiked(tr.id);

  const dark = config.mobileNowDark;
  const fg = dark ? colors.fgOnPhoto : colors.fg;
  const muted = dark ? paper(0.6) : colors.fgMuted;
  const trackBg = dark ? paper(0.22) : ink(0.12);
  const bg = dark ? colors.bgDeep : colors.bg;

  const prog = progressOf(g, tr);
  const vol = (g.muted ? 0 : groupVol(g)) / 100;

  // "Up next" = the queue AFTER the currently-playing track (the current one is
  // shown big above). qStart is the absolute index of the first up-next item, so
  // reorder maps local -> absolute through it. Mirrors the desktop NowPlaying.
  const fullQueue = queueFor(g.id);
  const qStart = g.queueIndex >= 0 ? g.queueIndex + 1 : 0;
  const upNext = fullQueue.slice(qStart);

  // Header context: "Playing in <room>" only makes sense when a real group is
  // active; otherwise show a calm, speaker-agnostic label.
  const headerLabel = prog.isNothing ? 'Orkester' : `${roomName(g.roomIds[0])} ${groupCount(g)}`;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={{ paddingTop: 56, paddingHorizontal: 24, paddingBottom: 26 }}
      showsVerticalScrollIndicator={false}
    >
      {/* header — back to the rooms list (up the drill-down tree), with this
          room's name as the screen title. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10} accessibilityLabel="Back to rooms" style={{ transform: [{ rotate: '90deg' }] }}>
          <ChevronDown size={24} color={fg} />
        </Pressable>
        <View>
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: muted }}>{prog.isNothing ? 'Connected to' : 'Playing in'}</Text>
          <Text style={{ fontFamily: font.bodySemiBold, fontSize: 14, marginTop: 2, color: fg }}>{headerLabel}</Text>
        </View>
      </View>

      {/* cover */}
      <View style={{ marginTop: 24 }}>
        <CoverArt size={cover} coverBg={tr.coverBg} coverShape={tr.coverShape} motif={config.coverMotif} radius={radii.xl} shadow={shadow.lg}>
          <Text style={{ position: 'absolute', left: 16, top: 14, fontFamily: font.mono, fontSize: 11, color: 'rgba(26,24,20,0.5)' }}>{tr.cat}</Text>
        </CoverArt>
      </View>

      {/* title + like */}
      <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 32, lineHeight: 34, letterSpacing: -0.6, color: fg }}>{tr.title}</Text>
          <Text style={{ fontFamily: font.body, fontSize: 15, color: muted, marginTop: 6 }}>{tr.artist}</Text>
        </View>
        <Pressable onPress={() => toggleLike(tr.id)} hitSlop={8} style={{ marginTop: 4 }}>
          <Heart size={24} color={liked ? colors.danger : fg} fill={liked ? colors.danger : 'none'} />
        </Pressable>
      </View>

      {/* progress — finite tracks scrub; live streams show LIVE + a neutral bar
          (no scrubber math on dur<=0); nothing-playing shows an inert empty bar */}
      <View style={{ marginTop: 22 }}>
        <TrackBar
          value={prog.fraction}
          onScrub={prog.isLive || prog.isNothing ? () => {} : seek}
          trackColor={trackBg}
          fillColor={fg}
          height={4}
          thumb={!prog.isLive && !prog.isNothing}
          disabled={prog.isLive || prog.isNothing}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }}>
          <Text style={{ fontFamily: font.mono, fontSize: 11, color: muted }}>
            {prog.isNothing ? '0:00' : fmt(prog.elapsed)}
          </Text>
          {prog.isLive ? (
            <Text style={{ fontFamily: font.mono, fontSize: 11, color: fg, letterSpacing: 1.2 }}>● LIVE</Text>
          ) : (
            <Text style={{ fontFamily: font.mono, fontSize: 11, color: muted }}>
              {prog.remaining === null ? '--:--' : `-${fmt(prog.remaining)}`}
            </Text>
          )}
        </View>
      </View>

      {/* transport */}
      <View style={{ marginTop: 20 }}>
        <TransportRow fg={fg} muted={muted} />
      </View>

      {/* volume */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24 }}>
        <VolumeLow size={18} color={muted} />
        <TrackBar value={vol} onScrub={setActiveVol} trackColor={trackBg} fillColor={fg} height={4} disabled={prog.isNothing} style={{ flex: 1 }} />
        <VolumeHigh size={20} color={muted} />
      </View>

      {/* Room-scoped actions: search to play/queue onto THIS group, or manage
          which speakers are grouped with it. */}
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
        <ActionPill icon={<Search size={18} color={fg} />} label="Search" onPress={() => nav.navigate('Search')} fg={fg} border={trackBg} />
        <ActionPill icon={<Speaker size={18} color={fg} />} label="Speakers" onPress={() => nav.navigate('Speakers')} fg={fg} border={trackBg} />
      </View>

      {/* Up next — the coordinator's queue after the current track. Hidden when
          empty (some streaming sources play without a queue). Reorder via the
          per-row chevrons; the store re-reads from Sonos on each change. */}
      {upNext.length > 0 && (
        <View style={{ marginTop: 30 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Queue size={16} color={muted} />
            <Text style={{ flex: 1, fontFamily: font.bodyMedium, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: muted }}>Up next · {upNext.length}</Text>
            <Pressable onPress={() => clearQueue(g.id)} hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
              <Text style={{ fontFamily: font.bodyMedium, fontSize: 12, color: muted }}>Clear</Text>
            </Pressable>
          </View>
          {upNext.map((item, index) => (
            <QueueRow
              key={`${index}:${item.title}:${item.artist}`}
              item={item}
              motif={config.coverMotif}
              fg={fg}
              muted={muted}
              canUp={index > 0}
              canDown={index < upNext.length - 1}
              onUp={() => reorderQueue(g.id, qStart + index, qStart + index - 1)}
              onDown={() => reorderQueue(g.id, qStart + index, qStart + index + 1)}
            />
          ))}
        </View>
      )}

      {/* footer — room context */}
      <View style={{ marginTop: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => nav.navigate('Speakers')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Speaker size={18} color={muted} />
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 12.5, color: muted }}>
            {g.roomIds.length === 1 ? '1 room' : `${g.roomIds.length} rooms`}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
