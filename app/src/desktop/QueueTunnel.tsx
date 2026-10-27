import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View, type PointerEvent } from 'react-native';
import CoverArt from '../components/CoverArt';
import { showContextMenu } from './contextMenu';
import { Grip, Play, QueueBottom, QueueTop, Trash } from '../icons';
import { font } from '../theme/fonts';
import { synthesizeArt } from '@orkester/core/state';
import { useTone } from './tone';
import type { Motif, QueueItem } from '../state/types';

// The queue as a tunnel seen down its length. The playing track stands full
// size in front; upcoming tracks are staggered behind it toward a vanishing
// point, their covers shrinking with depth while their names shrink much less,
// like road signs. Played tracks fly past the camera and rest blurred and
// translucent at the edges, as in a rear-view mirror. Every placement follows
// one animated depth, so a skip flies the camera through the cover into the
// next track.

const COVER = 600;
const AHEAD = 6;
const BEHIND = 3;
const FLOW_MS = 950;
const SCRUB_STEP = 120;
const SCRUB_SLOP = 4;
const SETTLE_MS = 350;
const UNSTUCK_MS = 4000;
const WHEEL_STEP = 140;
const RETURN_MS = 2500;
const HOLD_MS = 200;
const HOLD_SLOP = 6;
const TILT_IN_MS = 380;
const TILT_OUT_MS = 450;
const RAIL_SIZE = 150;
const RAIL_STEP = { x: 120, y: -78 };
const RAIL_REACH = 7;
const RAIL_LABEL = 1.7;

interface Tunnel {
  ks: number[];
  x: number[];
  y: number[];
  scale: number[];
  opacity: number[];
  blur: string[];
  label: number[];
  sign: number[];
  labelScale: number[];
}

function tunnelFor(width: number, height: number): Tunnel {
  const size = Math.min(height * 0.56, width * 0.36);
  const front = { x: width * 0.32, y: height * 0.44 };
  const vanish = { x: width * 0.94, y: height * 0.16 };
  const ks = [-3, -2, -1, -0.5, 0, 1, 2, 3, 4, 5, 6, 7];
  const depth = (k: number) => 1 / (1 + 0.42 * k);
  const place = (k: number) => {
    if (k >= 0) {
      const s = depth(k);
      return { x: vanish.x + (front.x - vanish.x) * s, y: vanish.y + (front.y - vanish.y) * s, s: (size / COVER) * s };
    }
    if (k === -0.5) return { x: front.x - width * 0.12, y: front.y + height * 0.06, s: (size / COVER) * 1.9 };
    if (k === -1) return { x: -size * 0.45, y: height * 0.6, s: (size / COVER) * 1.45 };
    if (k === -2) return { x: width + size * 0.05, y: height * 0.82, s: (size / COVER) * 1.3 };
    return { x: width + size * 0.6, y: height * 1.1, s: (size / COVER) * 1.3 };
  };
  const at = ks.map(place);
  return {
    ks,
    x: at.map((p) => p.x - COVER / 2),
    y: at.map((p) => p.y - COVER / 2),
    scale: at.map((p) => p.s),
    opacity: ks.map((k) => (k > AHEAD ? 0 : k >= 0 ? 1 - 0.11 * k : k === -0.5 ? 0.55 : k === -1 ? 0.32 : k === -2 ? 0.22 : 0)),
    blur: ks.map((k) => `blur(${k >= 0 ? 0 : k === -0.5 ? 6 : 12}px)`),
    label: ks.map((k) => (k === 0 ? 1 : 0)),
    sign: ks.map((k) => (k < 1 || k > 3 ? 0 : k === 1 ? 1 : k === 2 ? 0.8 : 0.5)),
    labelScale: ks.map((k) => {
      const s = k >= 0 ? depth(k) : 1;
      return Math.max(0.5, Math.sqrt(s)) / s;
    }),
  };
}

export default function QueueTunnel({ items, current, motif, readOnly = false, onPlay, onReorder, onRemove }: {
  items: QueueItem[];
  current: number;
  motif: Motif;
  readOnly?: boolean;
  onPlay: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const tone = useTone();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const tunnel = useMemo(() => (size.width > 0 ? tunnelFor(size.width, size.height) : null), [size.width, size.height]);
  const center = Math.max(0, current);
  const centerRef = useRef(center);
  centerRef.current = center;

  const pos = useRef(new Animated.Value(center)).current;
  const posNow = useRef(center);
  const [focus, setFocus] = useState(center);
  useEffect(() => {
    const id = pos.addListener(({ value }) => {
      posNow.current = value;
      setFocus(Math.round(value));
    });
    return () => pos.removeListener(id);
  }, [pos]);
  const flyTo = (to: number, duration = FLOW_MS) =>
    Animated.timing(pos, { toValue: to, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  useEffect(() => flyTo(center), [center]);
  const clampPos = (v: number) => Math.max(0, Math.min(items.length - 1, v));

  // Wheel flies through the queue to look ahead or back; after a pause the
  // camera returns to the playing track.
  const containerRef = useRef<View>(null);
  const returnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unstuck = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => {
    clearTimeout(returnTimer.current);
    clearTimeout(unstuck.current);
  }, []);
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pos.stopAnimation();
      pos.setValue(clampPos(posNow.current + e.deltaY / WHEEL_STEP));
      clearTimeout(returnTimer.current);
      returnTimer.current = setTimeout(() => flyTo(centerRef.current), RETURN_MS);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });

  // Click-and-drag flies through the queue too; on release the camera settles on
  // the nearest track and plays it.
  const scrub = useRef<{ startY: number; startPos: number; moved: boolean } | null>(null);
  const scrubbed = useRef(false);
  const [scrubbing, setScrubbing] = useState(false);
  const onScrubDown = (e: PointerEvent) => {
    if (readOnly || e.nativeEvent.button !== 0) return;
    pos.stopAnimation();
    clearTimeout(returnTimer.current);
    clearTimeout(unstuck.current);
    scrub.current = { startY: e.nativeEvent.pageY, startPos: posNow.current, moved: false };
    scrubbed.current = false;
  };
  const onScrubMove = (e: PointerEvent) => {
    const d = scrub.current;
    if (!d) return;
    const dy = e.nativeEvent.pageY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < SCRUB_SLOP) return;
      d.moved = true;
      scrubbed.current = true;
      setScrubbing(true);
      (e.currentTarget as unknown as HTMLElement).setPointerCapture?.(e.nativeEvent.pointerId);
    }
    pos.setValue(clampPos(d.startPos - dy / SCRUB_STEP));
  };
  const onScrubUp = () => {
    const d = scrub.current;
    scrub.current = null;
    if (!d?.moved) return;
    setScrubbing(false);
    const target = Math.round(posNow.current);
    flyTo(target, SETTLE_MS);
    if (target === centerRef.current) return;
    onPlay(target);
    unstuck.current = setTimeout(() => {
      if (centerRef.current !== target) flyTo(centerRef.current);
    }, UNSTUCK_MS);
  };

  const playNextTarget = (index: number) => (current < 0 ? 0 : index < current ? current : current + 1);
  const openMenu = (index: number) => {
    if (readOnly) return;
    void showContextMenu([
      { label: 'Play now', icon: <Play size={16} />, onPress: () => onPlay(index), enabled: index !== current },
      { label: 'Play next', icon: <QueueTop size={16} />, onPress: () => onReorder(index, playNextTarget(index)), enabled: index !== current && index !== playNextTarget(index) },
      { label: 'Move to end of queue', icon: <QueueBottom size={16} />, onPress: () => onReorder(index, items.length - 1), enabled: index < items.length - 1 },
      { label: 'Remove from queue', icon: <Trash size={16} />, onPress: () => onRemove(index) },
    ]);
  };

  // Tilt-to-edit: holding a cover's grip for a moment tilts the stage to the
  // side and lines the queue up on an even diagonal, like records in a slanted
  // crate. The held card follows the pointer, up the diagonal for later and down
  // for earlier, while the others make room; letting go reorders and swings the
  // camera back into the tunnel.
  const tilt = useRef(new Animated.Value(0)).current;
  const [edit, setEdit] = useState<{ from: number; dx: number; dy: number } | null>(null);
  const [tilted, setTilted] = useState(false);
  const hold = useRef<{ index: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | undefined } | null>(null);
  useEffect(() => () => clearTimeout(hold.current?.timer), []);
  const stepLen = Math.hypot(RAIL_STEP.x, RAIL_STEP.y);
  const targetOf = (e: { from: number; dx: number; dy: number }) =>
    Math.max(0, Math.min(items.length - 1, e.from + Math.round((e.dx * RAIL_STEP.x + e.dy * RAIL_STEP.y) / stepLen / stepLen)));
  const startEdit = (index: number) => {
    pos.stopAnimation();
    clearTimeout(returnTimer.current);
    setEdit({ from: index, dx: 0, dy: 0 });
    setTilted(true);
    Animated.timing(tilt, { toValue: 1, duration: TILT_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };
  const gripHandlers = (index: number) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      if (e.nativeEvent.button !== 0) return;
      const t = e.currentTarget as unknown as { setPointerCapture?: (id: number) => void };
      try { t.setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* capture optional */ }
      clearTimeout(hold.current?.timer);
      hold.current = { index, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, timer: setTimeout(() => startEdit(index), HOLD_MS) };
    },
    onPointerMove: (e: PointerEvent) => {
      const h = hold.current;
      if (!h || h.index !== index) return;
      const dx = e.nativeEvent.pageX - h.x;
      const dy = e.nativeEvent.pageY - h.y;
      if (edit?.from === index) setEdit({ from: index, dx, dy });
      else if (Math.hypot(dx, dy) > HOLD_SLOP) {
        clearTimeout(h.timer);
        hold.current = null;
      }
    },
    onPointerUp: () => {
      const h = hold.current;
      hold.current = null;
      clearTimeout(h?.timer);
      if (!edit || edit.from !== index) return;
      const to = targetOf(edit);
      setEdit(null);
      if (to !== edit.from) onReorder(edit.from, to);
      Animated.timing(tilt, { toValue: 0, duration: TILT_OUT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }).start(() => setTilted(false));
    },
  });

  const editTo = edit ? targetOf(edit) : null;
  const railCenter = { x: size.width * 0.45, y: size.height * 0.58 };
  const railFor = (index: number) => {
    const anchor = edit?.from ?? focus;
    let slot = index;
    if (edit && editTo !== null && index !== edit.from) {
      if (edit.from < editTo && index > edit.from && index <= editTo) slot = index - 1;
      else if (editTo < edit.from && index >= editTo && index < edit.from) slot = index + 1;
    }
    const r = slot - anchor;
    const held = edit?.from === index;
    return {
      x: railCenter.x + r * RAIL_STEP.x - COVER / 2 + (held ? edit.dx : 0),
      y: railCenter.y + r * RAIL_STEP.y - COVER / 2 + (held ? edit.dy : 0),
      opacity: Math.abs(r) > RAIL_REACH ? 0 : 1 - Math.abs(r) * 0.08,
      held,
    };
  };

  const anchor = edit?.from ?? focus;
  const first = Math.max(0, Math.min(focus - BEHIND, tilted ? anchor - RAIL_REACH : Infinity));
  const last = Math.min(items.length - 1, Math.max(focus + AHEAD + 1, tilted ? anchor + RAIL_REACH : -Infinity));
  const layers: React.ReactNode[] = [];
  for (let index = last; index >= first && tunnel; index--) {
    const item = items[index];
    layers.push(
      <Layer
        key={`${index}:${item.title}:${item.artist}`}
        item={item}
        index={index}
        tunnel={tunnel}
        pos={pos}
        tilt={tilt}
        tilted={tilted}
        rail={railFor(index)}
        motif={motif}
        fg={tone.fg}
        muted={tone.muted}
        plate={tone.surface}
        past={index < focus && !tilted}
        front={index === focus}
        grip={readOnly ? undefined : gripHandlers(index)}
        onPlay={readOnly ? undefined : () => {
          if (!scrubbed.current) onPlay(index);
        }}
        onMenu={() => openMenu(index)}
      />,
    );
  }
  const stageTurn = useMemo(
    () => ({
      rotateY: tilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-28deg'] }),
      rotateX: tilt.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '6deg'] }),
    }),
    [tilt],
  );

  return (
    <View
      ref={containerRef}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      onPointerDown={onScrubDown}
      onPointerMove={onScrubMove}
      onPointerUp={onScrubUp}
      onPointerCancel={onScrubUp}
      style={{ flex: 1, minHeight: 0, overflow: 'hidden', userSelect: 'none', touchAction: 'none', cursor: scrubbing || edit ? 'grabbing' : 'default' } as object}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ perspective: 1400 }, { rotateY: stageTurn.rotateY }, { rotateX: stageTurn.rotateX }] }}
      >
        {layers}
      </Animated.View>
    </View>
  );
}

function Layer({ item, index, tunnel, pos, tilt, tilted, rail, motif, fg, muted, plate, past, front, grip, onPlay, onMenu }: {
  item: QueueItem;
  index: number;
  tunnel: Tunnel;
  pos: Animated.Value;
  tilt: Animated.Value;
  tilted: boolean;
  rail: { x: number; y: number; opacity: number; held: boolean };
  grip?: Record<string, (e: PointerEvent) => void>;
  motif: Motif;
  fg: string;
  muted: string;
  plate: string;
  past: boolean;
  front: boolean;
  onPlay?: () => void;
  onMenu: () => void;
}) {
  const anim = useMemo(() => {
    const inputRange = tunnel.ks.map((k) => index - k).reverse();
    const at = <T extends number | string>(outputRange: T[]) =>
      pos.interpolate({ inputRange, outputRange: [...outputRange].reverse() as number[] | string[], extrapolate: 'clamp' });
    return {
      x: at(tunnel.x),
      y: at(tunnel.y),
      scale: at(tunnel.scale),
      opacity: at(tunnel.opacity),
      blur: at(tunnel.blur),
      label: at(tunnel.label),
      sign: at(tunnel.sign),
      labelScale: at(tunnel.labelScale),
    };
  }, [index, tunnel, pos]);

  // Each placement blends from the tunnel into the rail as the stage tilts.
  const railX = useRef(new Animated.Value(rail.x)).current;
  const railY = useRef(new Animated.Value(rail.y)).current;
  useEffect(() => {
    if (rail.held || !tilted) {
      railX.setValue(rail.x);
      railY.setValue(rail.y);
    } else {
      Animated.spring(railX, { toValue: rail.x, friction: 8, tension: 70, useNativeDriver: false }).start();
      Animated.spring(railY, { toValue: rail.y, friction: 8, tension: 70, useNativeDriver: false }).start();
    }
  }, [rail.x, rail.y, rail.held, tilted, railX, railY]);
  const blend = useMemo(() => {
    const inv = Animated.subtract(1, tilt);
    const mix = (from: Animated.AnimatedInterpolation<number>, to: Animated.Value | number) =>
      Animated.add(Animated.multiply(from, inv), Animated.multiply(to, tilt));
    const shown = rail.opacity > 0 ? 1 : 0;
    return {
      x: mix(anim.x, railX),
      y: mix(anim.y, railY),
      scale: mix(anim.scale, RAIL_SIZE / COVER),
      opacity: mix(anim.opacity, rail.opacity),
      label: Animated.multiply(anim.label, inv),
      sign: mix(anim.sign, shown),
      labelScale: mix(anim.labelScale, RAIL_LABEL),
    };
  }, [anim, tilt, railX, railY, rail.opacity]);

  const art = synthesizeArt(item.title || item.album, item.artist);
  const title = item.title || item.album || '';
  const [hovered, setHovered] = useState(false);

  return (
    <Animated.View
      pointerEvents={past ? 'none' : 'box-none'}
      style={{
        position: 'absolute', left: 0, top: 0, width: COVER, height: COVER,
        opacity: blend.opacity,
        transform: [{ translateX: blend.x }, { translateY: blend.y }, { scale: blend.scale }],
        filter: tilted ? 'none' : anim.blur,
        zIndex: rail.held ? 10 : 1,
      } as object}
    >
      <Pressable
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPress={onPlay}
        disabled={!onPlay}
        accessibilityRole="button"
        accessibilityLabel={item.artist ? `Play ${title} by ${item.artist}` : `Play ${title}`}
        {...{ onContextMenu: (e: MouseEvent) => {
          e.preventDefault();
          onMenu();
        } }}
        style={{ borderRadius: 40, boxShadow: '0 40px 90px rgba(0, 0, 0, 0.28)' } as object}
      >
        <CoverArt size={COVER} coverBg={art.coverBg} coverShape={art.coverShape} motif={motif} radius={40} artUrl={item.artUrl} />
      </Pressable>

      <Animated.View
        pointerEvents={front && !tilted ? 'auto' : 'none'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          position: 'absolute', left: -COVER * 0.2, right: -COVER * 0.2, top: COVER + 36,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28,
          opacity: blend.label,
        } as object}
      >
        <View pointerEvents="none" style={{ flexShrink: 1, alignItems: 'center' }}>
          <Animated.Text numberOfLines={2} style={{ fontFamily: font.display, fontSize: 76, lineHeight: 80, letterSpacing: -1, color: fg, textAlign: 'center' }}>
            {title}
          </Animated.Text>
          {!!item.artist && (
            <Animated.Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 34, color: muted, marginTop: 8, textAlign: 'center' }}>
              {item.artist}
            </Animated.Text>
          )}
        </View>
        {grip && <GripHandle grip={grip} title={title} color={muted} size={52} held={rail.held} shown={hovered || rail.held} />}
      </Animated.View>

      <Animated.View
        pointerEvents={!front || tilted ? 'auto' : 'none'}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        style={{
          position: 'absolute', left: 0, bottom: COVER + 24, maxWidth: COVER * 1.4,
          flexDirection: 'row', alignItems: 'center', gap: 22,
          paddingHorizontal: 26, paddingVertical: 16, borderRadius: 22, backgroundColor: plate,
          boxShadow: '0 12px 30px rgba(0, 0, 0, 0.18)',
          opacity: blend.sign,
          transform: [{ scale: blend.labelScale }],
          transformOrigin: 'left bottom',
        } as object}
      >
        <View pointerEvents="none" style={{ flexShrink: 1 }}>
          <Animated.Text numberOfLines={1} style={{ fontFamily: font.bodySemiBold, fontSize: 40, color: fg }}>{title}</Animated.Text>
          {!!item.artist && <Animated.Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 28, color: muted, marginTop: 2 }}>{item.artist}</Animated.Text>}
        </View>
        {grip && <GripHandle grip={grip} title={title} color={muted} size={40} held={rail.held} shown={hovered || rail.held} />}
      </Animated.View>

    </Animated.View>
  );
}

function GripHandle({ grip, title, color, size, held, shown }: {
  grip: Record<string, (e: PointerEvent) => void>;
  title: string;
  color: string;
  size: number;
  held: boolean;
  shown: boolean;
}) {
  return (
    <View
      {...grip}
      accessibilityLabel={`Hold to move ${title}`}
      pointerEvents={shown ? 'auto' : 'none'}
      style={{ padding: size * 0.3, margin: -size * 0.3, opacity: shown ? 1 : 0, cursor: held ? 'grabbing' : 'grab', touchAction: 'none' } as object}
    >
      <Grip size={size} color={color} />
    </View>
  );
}
