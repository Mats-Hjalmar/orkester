import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View, type PointerEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import CoverArt from '../components/CoverArt';
import { showContextMenu } from './contextMenu';
import { Dots, Grip, Play, QueueBottom, QueueTop, Trash } from '../icons';
import { font } from '../theme/fonts';
import { synthesizeArt } from '@orkester/core/state';
import { useTone } from './tone';
import type { Motif, QueueItem } from '../state/types';

// The queue as one breathing column. The playing track takes 60% of the height
// with a huge cover ringed by its progress; played tracks above collapse into
// slim muted text strips; upcoming tracks below are clear but desaturated rows.
// Every size is a function of one animated position, so when the track changes
// the old one folds down while the new one opens up, with no hard cuts.

const STRIP = 34;
const PAST_SHOWN = 3;
const NOW_SHARE = 0.6;
const NEXT_SHARE = 0.13;
const PAD = 44;
const COVER_MAX = 560;
const RING = 4;
const FLOW_MS = 900;
const RETURN_MS = 3000;
const WINDOW = 40;
const TRAIL_W = 64;
const SCRUB_SLOP = 4;
const SETTLE_MS = 300;
const UNSTUCK_MS = 4000;

interface Flow {
  nowH: number;
  nextH: number;
  ks: number[];
  height: number[];
  cover: number[];
  coverTop: number[];
  title: number[];
  artist: number[];
  textLeft: number[];
  opacity: number[];
  filter: string[];
  strip: number[];
  main: number[];
  ring: number[];
}

function flowFor(height: number, width: number): Flow {
  const now = height * NOW_SHARE;
  const next = Math.max(64, height * NEXT_SHARE);
  const coverNow = Math.min(now - 24, (width - PAD * 2) * 0.48, COVER_MAX);
  const coverNext = next - 18;
  const ks = [-2, -1, -0.6, 0, 1, 2];
  const pick = <T,>(past: T, fading: T, cur: T, fut: T): T[] => ks.map((k) => (k <= -1 ? past : k === -0.6 ? fading : k === 0 ? cur : fut));
  return {
    nowH: now,
    nextH: next,
    ks,
    height: pick(STRIP, STRIP + (now - STRIP) * 0.25, now, next),
    cover: pick(14, 40, coverNow, coverNext),
    coverTop: pick((STRIP - 14) / 2, 8, (now - coverNow) / 2, 9),
    title: pick(12, 20, 54, 18),
    artist: pick(12, 14, 22, 14),
    textLeft: pick(14 + 12, 40 + 18, coverNow + 40, coverNext + 18),
    opacity: pick(0.5, 0.7, 1, 0.92),
    filter: pick('saturate(0.5)', 'saturate(0.7)', 'saturate(1)', 'saturate(0.22)'),
    strip: pick(1, 0, 0, 0),
    main: pick(0, 0, 1, 1),
    ring: ks.map((k) => (k === 0 ? 1 : 0)),
  };
}

export default function QueueCascade({ items, current, progress, motif, accent, readOnly = false, onPlay, onReorder, onRemove }: {
  items: QueueItem[];
  current: number;
  progress: number | null;
  motif: Motif;
  accent: string;
  readOnly?: boolean;
  onPlay: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const tone = useTone();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const flow = useMemo(() => (size.height > 0 ? flowFor(size.height, size.width) : null), [size.height, size.width]);
  const center = Math.max(0, current);

  const pos = useRef(new Animated.Value(center)).current;
  const posNow = useRef(center);
  useEffect(() => {
    const id = pos.addListener(({ value }) => (posNow.current = value));
    return () => pos.removeListener(id);
  }, [pos]);
  const flowTo = (to: number, duration = FLOW_MS) =>
    Animated.timing(pos, { toValue: to, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  useEffect(() => flowTo(center), [center]);

  // Click-and-drag scrubs through the queue: the column flows live under the
  // pointer, and on release it settles on the nearest track and plays it. If the
  // speaker never switches, it flows back to the playing track.
  const scrub = useRef<{ startY: number; startPos: number; moved: boolean } | null>(null);
  const scrubbed = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const unstuck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const centerRef = useRef(center);
  centerRef.current = center;
  useEffect(() => () => clearTimeout(unstuck.current), []);
  const onScrubDown = (e: PointerEvent) => {
    if (readOnly || !flow || e.nativeEvent.button !== 0) return;
    pos.stopAnimation();
    clearTimeout(unstuck.current);
    scrub.current = { startY: e.nativeEvent.pageY, startPos: posNow.current, moved: false };
    scrubbed.current = false;
  };
  const onScrubMove = (e: PointerEvent) => {
    const d = scrub.current;
    if (!d || !flow) return;
    const dy = e.nativeEvent.pageY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < SCRUB_SLOP) return;
      d.moved = true;
      scrubbed.current = true;
      setScrubbing(true);
      (e.currentTarget as unknown as HTMLElement).setPointerCapture?.(e.nativeEvent.pointerId);
    }
    pos.setValue(Math.max(Math.max(0, center - WINDOW), Math.min(Math.min(items.length - 1, center + WINDOW), d.startPos - dy / flow.nextH)));
  };
  const onScrubUp = () => {
    const d = scrub.current;
    scrub.current = null;
    if (!d?.moved) return;
    setScrubbing(false);
    const target = Math.round(posNow.current);
    flowTo(target, SETTLE_MS);
    if (target === centerRef.current) return;
    onPlay(target);
    unstuck.current = setTimeout(() => {
      if (centerRef.current !== target) flowTo(centerRef.current);
    }, UNSTUCK_MS);
  };

  const browse = useRef(new Animated.Value(0)).current;
  const browseNow = useRef(0);
  useEffect(() => {
    const id = browse.addListener(({ value }) => (browseNow.current = value));
    return () => browse.removeListener(id);
  }, [browse]);
  const containerRef = useRef<View>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(returnTimer.current), []);
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener || !flow) return;
    const min = -center * STRIP;
    const max = Math.max(0, items.length - 1 - center) * (size.height * NEXT_SHARE);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      browse.stopAnimation();
      browse.setValue(Math.max(min, Math.min(max, browseNow.current + e.deltaY)));
      clearTimeout(returnTimer.current);
      returnTimer.current = setTimeout(() => {
        Animated.spring(browse, { toValue: 0, friction: 9, tension: 40, useNativeDriver: false }).start();
      }, RETURN_MS);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [browse, center, flow, items.length, size.height]);

  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const playNextTarget = (index: number) => (current < 0 ? 0 : index < current ? current : current + 1);
  const openMenu = (index: number) => {
    if (readOnly) return;
    setMenuIndex(index);
    void showContextMenu([
      { label: 'Play now', icon: <Play size={16} />, onPress: () => onPlay(index), enabled: index !== current },
      { label: 'Play next', icon: <QueueTop size={16} />, onPress: () => onReorder(index, playNextTarget(index)), enabled: index !== current && index !== playNextTarget(index) },
      { label: 'Move to end of queue', icon: <QueueBottom size={16} />, onPress: () => onReorder(index, items.length - 1), enabled: index < items.length - 1 },
      { label: 'Remove from queue', icon: <Trash size={16} />, onPress: () => onRemove(index) },
    ]).finally(() => setMenuIndex(null));
  };

  // Reordering by a row's grip. The row follows the pointer and an accent line
  // marks where it will land; rows have different heights, so the target comes
  // from the resting layout rather than a fixed row height.
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const dragStartY = useRef(0);
  const restTop = (j: number) =>
    !flow ? 0 : j <= center ? j * STRIP : center * STRIP + flow.nowH + (j - center - 1) * flow.nextH;
  const restHeight = (j: number) => (!flow ? 0 : j < center ? STRIP : j === center ? flow.nowH : flow.nextH);
  const targetOf = (from: number, dy: number) => {
    const mid = restTop(from) + restHeight(from) / 2 + dy;
    let to = from;
    while (to < items.length - 1 && mid > restTop(to + 1)) to++;
    while (to > 0 && mid < restTop(to)) to--;
    return to;
  };
  const gripHandlers = (index: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      const t = e.currentTarget as unknown as { setPointerCapture?: (id: number) => void };
      try { t.setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* capture optional */ }
      dragStartY.current = e.nativeEvent.pageY;
      setDrag({ from: index, dy: 0 });
    },
    onPointerMove: (e: PointerEvent) => {
      if (dragRef.current?.from !== index) return;
      setDrag({ from: index, dy: e.nativeEvent.pageY - dragStartY.current });
    },
    onPointerUp: () => {
      const d = dragRef.current;
      setDrag(null);
      if (d && d.from === index) {
        const to = targetOf(d.from, d.dy);
        if (to !== d.from) onReorder(d.from, to);
      }
    },
    onPointerCancel: () => setDrag(null),
  });
  const dropTo = drag ? targetOf(drag.from, drag.dy) : null;
  const dropLine = drag && dropTo !== null && dropTo !== drag.from
    ? (dropTo > drag.from ? restTop(dropTo) + restHeight(dropTo) : restTop(dropTo))
    : null;

  const first = Math.max(0, center - WINDOW);
  const last = Math.min(items.length - 1, center + WINDOW);
  const lift = useMemo(
    () =>
      Animated.add(Animated.multiply(Animated.add(pos, -PAST_SHOWN), -STRIP), Animated.multiply(browse, -1))
        .interpolate({ inputRange: [-1e6, 0, 1e6], outputRange: [-1e6, 0, 0] }),
    [pos, browse],
  );

  return (
    <View
      ref={containerRef}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onPointerDown={onScrubDown}
      onPointerMove={onScrubMove}
      onPointerUp={onScrubUp}
      onPointerCancel={onScrubUp}
      style={{ flex: 1, minHeight: 0, overflow: 'hidden', userSelect: 'none', touchAction: 'none', cursor: scrubbing ? 'grabbing' : 'default' } as object}
    >
      {flow && (
        <Animated.View style={{ transform: [{ translateY: lift }] }}>
          <View style={{ height: first * STRIP }} />
          {items.slice(first, last + 1).map((item, i) => (
            <Row
              key={`${first + i}:${item.title}:${item.artist}`}
              item={item}
              index={first + i}
              flow={flow}
              pos={pos}
              motif={motif}
              accent={accent}
              fg={tone.fg}
              muted={tone.muted}
              hover={tone.line(0.05)}
              lifted={menuIndex === first + i || drag?.from === first + i}
              dragDy={drag?.from === first + i ? drag.dy : 0}
              progress={first + i === current ? progress : null}
              readOnly={readOnly}
              grip={gripHandlers(first + i)}
              onPlay={readOnly ? undefined : () => {
                if (!scrubbed.current) onPlay(first + i);
              }}
              onMenu={() => openMenu(first + i)}
            />
          ))}
          {dropLine !== null && (
            <View pointerEvents="none" style={{ position: 'absolute', left: PAD - 12, right: PAD - 12, top: dropLine - 1, height: 2, borderRadius: 1, backgroundColor: accent }} />
          )}
        </Animated.View>
      )}
    </View>
  );
}

function Row({ item, index, flow, pos, motif, accent, fg, muted, hover, lifted, dragDy, progress, readOnly, grip, onPlay, onMenu }: {
  item: QueueItem;
  index: number;
  flow: Flow;
  pos: Animated.Value;
  motif: Motif;
  accent: string;
  fg: string;
  muted: string;
  hover: string;
  lifted: boolean;
  dragDy: number;
  progress: number | null;
  readOnly: boolean;
  grip: Record<string, (e: PointerEvent) => void>;
  onPlay?: () => void;
  onMenu: () => void;
}) {
  const anim = useMemo(() => {
    const inputRange = flow.ks.map((k) => index - k);
    const at = <T extends number | string>(outputRange: T[]) =>
      pos.interpolate({ inputRange: [...inputRange].reverse(), outputRange: [...outputRange].reverse() as number[] | string[], extrapolate: 'clamp' });
    const cover = at(flow.cover);
    return {
      height: at(flow.height),
      coverScale: Animated.multiply(cover, 1 / COVER_MAX),
      coverTop: at(flow.coverTop),
      title: at(flow.title),
      artist: at(flow.artist),
      textLeft: at(flow.textLeft),
      opacity: at(flow.opacity),
      filter: at(flow.filter),
      strip: at(flow.strip),
      main: at(flow.main),
      ring: at(flow.ring),
    };
  }, [index, flow, pos]);

  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';
  const [hovered, setHovered] = useState(false);
  const perimeter = 4 * (COVER_MAX - 2 * 28) + 2 * Math.PI * 28;

  return (
    <Animated.View
      {...{ onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        onMenu();
      } }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{
        height: anim.height, opacity: anim.opacity, marginHorizontal: PAD - 12, paddingHorizontal: 12, borderRadius: 14,
        backgroundColor: lifted || hovered ? hover : 'transparent',
        transform: [{ translateY: dragDy }], zIndex: dragDy !== 0 ? 5 : 1,
      }}
    >
      <Pressable
        onPress={onPlay}
        disabled={!onPlay}
        accessibilityRole="button"
        accessibilityLabel={item.artist ? `Play ${title} by ${item.artist}` : `Play ${title}`}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={{ position: 'absolute', left: 0, top: anim.coverTop, width: COVER_MAX, height: COVER_MAX, transform: [{ scale: anim.coverScale }], transformOrigin: 'left top', filter: anim.filter } as object}
        >
          <CoverArt size={COVER_MAX} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={28} artUrl={item.artUrl} />
          {progress !== null && (
            <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -RING * 2.5, left: -RING * 2.5, opacity: anim.ring }}>
              <Svg width={COVER_MAX + RING * 5} height={COVER_MAX + RING * 5}>
                <Rect x={RING * 2.5} y={RING * 2.5} width={COVER_MAX} height={COVER_MAX} rx={28} fill="none" stroke={fg} strokeOpacity={0.15} strokeWidth={RING} />
                <Rect
                  x={RING * 2.5}
                  y={RING * 2.5}
                  width={COVER_MAX}
                  height={COVER_MAX}
                  rx={28}
                  fill="none"
                  stroke={accent}
                  strokeWidth={RING}
                  strokeLinecap="round"
                  strokeDasharray={`${perimeter * progress} ${perimeter}`}
                />
              </Svg>
            </Animated.View>
          )}
        </Animated.View>

        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: anim.textLeft, right: TRAIL_W, top: 0, bottom: 0, justifyContent: 'center', opacity: anim.main }}>
          <Animated.Text numberOfLines={2} style={{ fontFamily: font.display, fontSize: anim.title, color: fg, letterSpacing: -0.4 }}>{title}</Animated.Text>
          {!!item.artist && <Animated.Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: anim.artist, color: muted, marginTop: 4 }}>{item.artist}</Animated.Text>}
        </Animated.View>

        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 26, right: TRAIL_W, top: 0, height: STRIP, justifyContent: 'center', opacity: anim.strip }}>
          <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, letterSpacing: 0.3, color: muted }}>
            {item.artist ? <Text style={{ fontFamily: font.bodySemiBold, color: fg }}>{item.artist}</Text> : null}
            {item.artist ? '  ·  ' : ''}
            {title}
          </Text>
        </Animated.View>
      </Pressable>

      {!readOnly && (
        <View style={{ position: 'absolute', right: 6, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <View
            {...grip}
            accessibilityLabel={`Drag to move ${title}`}
            style={{ padding: 6, cursor: dragDy !== 0 ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none' } as object}
          >
            <Grip size={16} color={muted} />
          </View>
          <Pressable
            accessibilityLabel={`More options for ${title}`}
            onPress={onMenu}
            hitSlop={4}
            style={({ pressed }) => ({ padding: 6, opacity: pressed ? 0.5 : 1 })}
          >
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <Dots size={16} color={muted} />
            </View>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}
