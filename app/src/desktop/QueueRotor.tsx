import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View, type PointerEvent } from 'react-native';
import CoverArt from '../components/CoverArt';
import { showContextMenu } from './contextMenu';
import { Dots, Grip, Play, QueueBottom, QueueTop, Trash } from '../icons';
import { font } from '../theme/fonts';
import { synthesizeArt } from '@orkester/core/state';
import type { Motif, QueueItem } from '../state/types';
import { useTone } from './tone';

// The queue on the rim of a huge, invisible wheel whose hub sits off to the
// left. The track on the equator is the large "now"; earlier tracks bend away
// upward, later ones downward, shrinking and fading. Only the covers tilt — the
// text stays level. Scrolling turns the wheel one track per notch, and after a
// pause it turns back to the playing track.

const ROW_H = 64;
const COVER = 52;
const COVER_NOW = 128;
const TITLE = 16;
const TITLE_NOW = 34;
const ARTIST = 13;
const ARTIST_NOW = 18;
const LINE_GAP = 28;
const PAD = 28;
const RETURN_MS = 4000;
const DRAG_SLOP = 4;
const FLING_MS = 180;

interface Rotor {
  pad: number;
  rim: number;
  lineY: number;
  ks: number[];
  translateX: number[];
  translateY: number[];
  opacity: number[];
  cover: number[];
  coverScale: number[];
  tilt: string[];
  title: number[];
  artist: number[];
  span: number;
}

function rotorFor(height: number): Rotor {
  const radius = height * 0.8;
  const step = ROW_H / radius;
  const extra = ((COVER_NOW - COVER) / 2 + LINE_GAP) / ROW_H;
  const angle = (k: number) => Math.max(-Math.PI / 2, Math.min(Math.PI / 2, (k === 0 ? 0 : k + Math.sign(k) * extra) * step));
  const y = (k: number) => radius * Math.sin(angle(k));
  const half = height / 2;
  let span = 1;
  while (Math.abs(y(span)) < half + ROW_H && angle(span) < Math.PI / 2) span++;
  const edge = Math.asin(Math.min(1, half / radius));
  const ks: number[] = [];
  for (let k = span + 1; k >= -span - 1; k--) ks.push(k);
  const shrink = (k: number, now: number, base: number, min: number, rate: number) =>
    k === 0 ? now : Math.max(min, base * rate ** (Math.abs(k) - 1));
  const cover = ks.map((k) => shrink(k, COVER_NOW, COVER, 36, 0.94));
  return {
    pad: half - ROW_H / 2,
    rim: PAD + radius * (1 - Math.cos(edge)),
    lineY: (COVER_NOW / 2 + y(1) - COVER / 2) / 2,
    ks,
    translateX: ks.map((k) => -radius * (1 - Math.cos(angle(k)))),
    translateY: ks.map((k) => y(k) - k * ROW_H),
    opacity: ks.map((k) => {
      const base = k === 0 ? 1 : Math.max(0.15, 0.7 * 0.85 ** (Math.abs(k) - 1));
      const fade = Math.max(0, Math.min(1, (half + ROW_H / 2 - Math.abs(y(k))) / (ROW_H * 1.5)));
      return base * fade;
    }),
    cover,
    coverScale: cover.map((c) => c / COVER_NOW),
    tilt: ks.map((k) => `${Math.max(-50, Math.min(50, (-angle(k) * 180) / Math.PI * 0.8))}deg`),
    title: ks.map((k) => shrink(k, TITLE_NOW, TITLE, 13, 0.96)),
    artist: ks.map((k) => shrink(k, ARTIST_NOW, ARTIST, 11, 0.96)),
    span,
  };
}

export default function QueueRotor({ items, current, motif, accent, readOnly = false, onPlay, onReorder, onRemove }: {
  items: QueueItem[];
  current: number;
  motif: Motif;
  accent: string;
  readOnly?: boolean;
  onPlay: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const [height, setHeight] = useState(0);
  const rotor = useMemo(() => (height > 0 ? rotorFor(height) : null), [height]);
  const center = Math.max(0, current);

  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(center * ROW_H)).current;
  const [focus, setFocus] = useState(center);
  const drag = useRef<{ startY: number; startTop: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);
  const centerRef = useRef(center);
  centerRef.current = center;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const id = scrollY.addListener(({ value }) => {
      const at = Math.round(value / ROW_H);
      setFocus(at);
      clearTimeout(timer);
      if (at !== centerRef.current) {
        timer = setTimeout(() => {
          if (!drag.current) scrollRef.current?.scrollTo({ y: centerRef.current * ROW_H, animated: true });
        }, RETURN_MS);
      }
    });
    return () => {
      clearTimeout(timer);
      scrollY.removeListener(id);
    };
  }, [scrollY]);

  const placed = useRef(false);
  useEffect(() => {
    if (!rotor) return;
    scrollRef.current?.scrollTo({ y: center * ROW_H, animated: placed.current });
    placed.current = true;
  }, [center, rotor]);

  const dragged = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const scroller = () => scrollRef.current?.getScrollableNode() as HTMLElement | undefined;
  const onPointerDown = (e: PointerEvent) => {
    const node = scroller();
    if (readOnly || !node || e.nativeEvent.button !== 0) return;
    const { pageY } = e.nativeEvent;
    drag.current = { startY: pageY, startTop: node.scrollTop, lastY: pageY, lastT: performance.now(), velocity: 0, moved: false };
    dragged.current = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    const node = scroller();
    if (!d || !node) return;
    const { pageY, pointerId } = e.nativeEvent;
    const timeStamp = performance.now();
    if (!d.moved) {
      if (Math.abs(pageY - d.startY) < DRAG_SLOP) return;
      d.moved = true;
      dragged.current = true;
      setGrabbing(true);
      node.style.scrollSnapType = 'none';
      (e.currentTarget as unknown as HTMLElement).setPointerCapture?.(pointerId);
    }
    const dt = timeStamp - d.lastT;
    if (dt > 0) d.velocity = (pageY - d.lastY) / dt;
    d.lastY = pageY;
    d.lastT = timeStamp;
    node.scrollTop = d.startTop - (pageY - d.startY);
  };
  const onPointerUp = () => {
    const d = drag.current;
    const node = scroller();
    drag.current = null;
    if (!d?.moved || !node) return;
    setGrabbing(false);
    const velocity = performance.now() - d.lastT > 80 ? 0 : d.velocity;
    const target = Math.max(0, Math.min(items.length - 1, Math.round((node.scrollTop - velocity * FLING_MS) / ROW_H)));
    node.style.scrollSnapType = 'y mandatory';
    scrollRef.current?.scrollTo({ y: target * ROW_H, animated: true });
    if (target !== current) onPlay(target);
  };

  // Reordering by a row's grip: the row follows the pointer while the rows it
  // passes slide over to make room; releasing moves it in the queue.
  const [move, setMove] = useState<{ from: number; dy: number } | null>(null);
  const moveStartY = useRef(0);
  const moveTarget = (m: { from: number; dy: number }) =>
    Math.max(0, Math.min(items.length - 1, m.from + Math.round(m.dy / ROW_H)));
  const gripHandlers = (index: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      if (e.nativeEvent.button !== 0) return;
      const t = e.currentTarget as unknown as { setPointerCapture?: (id: number) => void };
      try { t.setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* capture optional */ }
      moveStartY.current = e.nativeEvent.pageY;
      setMove({ from: index, dy: 0 });
    },
    onPointerMove: (e: PointerEvent) => {
      if (move?.from !== index) return;
      setMove({ from: index, dy: e.nativeEvent.pageY - moveStartY.current });
    },
    onPointerUp: () => {
      if (move?.from !== index) return;
      const to = moveTarget(move);
      setMove(null);
      if (to !== move.from) onReorder(move.from, to);
    },
    onPointerCancel: () => setMove(null),
  });
  const moveTo = move ? moveTarget(move) : null;
  const slotOf = (index: number) => {
    if (!move || moveTo === null || index === move.from) return index;
    if (move.from < moveTo && index > move.from && index <= moveTo) return index - 1;
    if (moveTo < move.from && index >= moveTo && index < move.from) return index + 1;
    return index;
  };

  const [hovered, setHovered] = useState<number | null>(null);
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

  const first = rotor ? Math.max(0, focus - rotor.span - 2) : 0;
  const last = rotor ? Math.min(items.length - 1, focus + rotor.span + 2) : -1;
  const rows: React.ReactNode[] = [];
  for (let index = first; index <= last && rotor; index++) {
    const item = items[index];
    rows.push(
      <RotorRow
        key={`${index}:${item.title}:${item.artist}`}
        item={item}
        index={index}
        slot={slotOf(index)}
        dragDy={move?.from === index ? move.dy : 0}
        grip={readOnly ? undefined : gripHandlers(index)}
        rotor={rotor}
        scrollY={scrollY}
        motif={motif}
        accent={accent}
        playing={index === current}
        showMenu={!readOnly && (hovered === index || menuIndex === index)}
        onPlay={readOnly ? undefined : () => {
          if (!dragged.current) onPlay(index);
        }}
        onMenu={() => openMenu(index)}
        onHover={(on) => setHovered((h) => (on ? index : h === index ? null : h))}
      />,
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {rotor && (
        <>
          <Animated.ScrollView
            ref={scrollRef}
            style={{ flex: 1, scrollSnapType: 'y mandatory', overflowAnchor: 'none' } as object}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          >
            <View
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              style={{ height: rotor.pad * 2 + items.length * ROW_H, userSelect: 'none', cursor: grabbing ? 'grabbing' : readOnly ? 'default' : 'grab', touchAction: 'none' } as object}
            >
              {rows}
            </View>
          </Animated.ScrollView>
          {[-1, 1].map((side) => (
            <View
              key={side}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: rotor.rim - 12,
                right: PAD,
                top: height / 2 + side * rotor.lineY,
                height: 1,
                borderRadius: 1,
                backgroundColor: accent,
                opacity: 0.7,
                boxShadow: `0 0 10px ${accent}`,
              } as object}
            />
          ))}
        </>
      )}
    </View>
  );
}

function RotorRow({ item, index, slot, dragDy, grip, rotor, scrollY, motif, accent, playing, showMenu, onPlay, onMenu, onHover }: {
  item: QueueItem;
  index: number;
  slot: number;
  dragDy: number;
  grip?: Record<string, (e: PointerEvent) => void>;
  rotor: Rotor;
  scrollY: Animated.Value;
  motif: Motif;
  accent: string;
  playing: boolean;
  showMenu: boolean;
  onPlay?: () => void;
  onMenu: () => void;
  onHover: (on: boolean) => void;
}) {
  const tone = useTone();
  // A row making room for a dragged one glides to the drum position of the slot
  // it moves into.
  const shift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(shift, { toValue: (slot - index) * ROW_H, friction: 8, tension: 80, useNativeDriver: false }).start();
  }, [slot, index, shift]);
  const anim = useMemo(() => {
    const inputRange = rotor.ks.map((k) => (index - k) * ROW_H);
    const seen = Animated.subtract(scrollY, shift);
    const at = <T extends number | string>(outputRange: T[]) =>
      seen.interpolate({ inputRange, outputRange: outputRange as number[] | string[], extrapolate: 'clamp' });
    return {
      opacity: at(rotor.opacity),
      translateX: at(rotor.translateX),
      translateY: at(rotor.translateY),
      cover: at(rotor.cover),
      coverScale: at(rotor.coverScale),
      tilt: at(rotor.tilt),
      title: at(rotor.title),
      artist: at(rotor.artist),
    };
  }, [index, rotor, scrollY, shift]);

  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: rotor.rim, right: PAD, top: rotor.pad + index * ROW_H, height: ROW_H, justifyContent: 'center', scrollSnapAlign: 'center', zIndex: dragDy !== 0 ? 5 : 1 } as object}
    >
      <Animated.View
        {...{ onContextMenu: (e: MouseEvent) => {
          e.preventDefault();
          onMenu();
        } }}
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 18, opacity: anim.opacity,
          transform: [{ translateX: anim.translateX }, { translateY: anim.translateY }, { translateY: shift }, { translateY: dragDy }],
        }}
      >
        <Pressable
          onPress={onPlay}
          disabled={!onPlay}
          accessibilityRole="button"
          accessibilityLabel={item.artist ? `Play ${title} by ${item.artist}` : `Play ${title}`}
          style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 18, opacity: pressed ? 0.6 : 1 })}
        >
          <Animated.View style={{ width: anim.cover, height: anim.cover, transform: [{ perspective: 600 }, { rotateX: anim.tilt }] }}>
            <Animated.View style={{ position: 'absolute', top: 0, left: 0, width: COVER_NOW, height: COVER_NOW, transform: [{ scale: anim.coverScale }], transformOrigin: 'left top' } as object}>
              <CoverArt size={COVER_NOW} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={14} artUrl={item.artUrl} />
            </Animated.View>
          </Animated.View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {playing && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent }} />}
              <Animated.Text numberOfLines={1} style={{ flexShrink: 1, fontFamily: font.display, fontSize: anim.title, color: tone.fg }}>
                {title}
              </Animated.Text>
            </View>
            {!!item.artist && (
              <Animated.Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: anim.artist, color: tone.muted, marginTop: 2 }}>
                {item.artist}
              </Animated.Text>
            )}
          </View>
        </Pressable>
        {grip && (
          <View
            {...grip}
            accessibilityLabel={`Drag to move ${title}`}
            pointerEvents={showMenu || dragDy !== 0 ? 'auto' : 'none'}
            style={{ padding: 4, opacity: showMenu || dragDy !== 0 ? 1 : 0, cursor: dragDy !== 0 ? 'grabbing' : 'grab', touchAction: 'none' } as object}
          >
            <Grip size={16} color={tone.subtle} />
          </View>
        )}
        <Pressable
          accessibilityLabel={`More options for ${title}`}
          onPress={onMenu}
          pointerEvents={showMenu ? 'auto' : 'none'}
          hitSlop={4}
          style={({ pressed }) => ({ padding: 4, opacity: showMenu ? (pressed ? 0.5 : 1) : 0 })}
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <Dots size={16} color={tone.subtle} />
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
