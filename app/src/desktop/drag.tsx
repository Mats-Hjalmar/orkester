import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { Text, View } from 'react-native';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import type { ApiSearchItem, QueuePosition } from '@orkester/core';

// Pointer drags for the desktop columns. react-native-web forwards pointer events
// but none of HTML5 drag-and-drop's props (draggable, onDragStart, ...), so both
// the queue's row drag and dragging a search hit onto the queue are built on
// pointer events with capture.

/** Pointer travel (px) before a press becomes a drag; below it the press stays a click. */
export const DRAG_THRESHOLD = 4;

export interface DragPoint {
  x: number;
  y: number;
}

export interface DragCallbacks {
  onStart: () => void;
  /** `delta` is the pointer's travel since the press. */
  onMove: (at: DragPoint, delta: DragPoint) => void;
  onEnd: (at: DragPoint, delta: DragPoint) => void;
  onCancel: () => void;
}

type PointerEvt = {
  currentTarget: unknown;
  nativeEvent: { pointerId: number; button: number; clientX: number; clientY: number };
};
type CaptureTarget = {
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};

/**
 * Tells a press from a drag. `bind(callbacks)` gives an element's pointer
 * handlers; one press is tracked at a time, so several elements can share a
 * hook. A drag still ends in a click on the element, which the caller drops via
 * `consumeDragClick()`.
 */
export function usePressDrag() {
  const press = useRef<{ start: DragPoint; el: CaptureTarget; cb: DragCallbacks; dragging: boolean } | null>(null);
  const dragged = useRef(false);

  const travel = (p: { start: DragPoint }, e: PointerEvt) => {
    const at = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY };
    return { at, delta: { x: at.x - p.start.x, y: at.y - p.start.y } };
  };

  const bind = (cb: DragCallbacks) => ({
    onPointerDown: (e: PointerEvt) => {
      dragged.current = false;
      if (e.nativeEvent.button !== 0) return;
      press.current = { start: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }, el: e.currentTarget as CaptureTarget, cb, dragging: false };
    },
    onPointerMove: (e: PointerEvt) => {
      const p = press.current;
      if (!p) return;
      const { at, delta } = travel(p, e);
      if (!p.dragging) {
        if (Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD) return;
        p.dragging = true;
        // Captured only once it IS a drag: capturing on press would retarget the
        // following click to this element, swallowing a child's own click.
        try { p.el.setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* capture optional */ }
        p.cb.onStart();
      }
      p.cb.onMove(at, delta);
    },
    onPointerUp: (e: PointerEvt) => {
      const p = press.current;
      press.current = null;
      if (!p?.dragging) return;
      try { p.el.releasePointerCapture?.(e.nativeEvent.pointerId); } catch { /* noop */ }
      dragged.current = true;
      const { at, delta } = travel(p, e);
      p.cb.onEnd(at, delta);
    },
    onPointerCancel: () => {
      const p = press.current;
      press.current = null;
      if (p?.dragging) p.cb.onCancel();
    },
  });

  const consumeDragClick = () => {
    const d = dragged.current;
    dragged.current = false;
    return d;
  };

  return { bind, consumeDragClick };
}

// The search hit being dragged towards the queue, shared by both columns.
export interface SearchDrag {
  item: ApiSearchItem;
  at: DragPoint;
}

let searchDrag: SearchDrag | null = null;
const listeners = new Set<() => void>();
const setSearchDrag = (d: SearchDrag | null) => {
  searchDrag = d;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useSearchDrag(): SearchDrag | null {
  return useSyncExternalStore(subscribe, () => searchDrag);
}

/** Where a hit dropped at a window point would land in the queue, or null when not over it. */
type DropResolver = (at: DragPoint) => QueuePosition | null;
let dropTarget: DropResolver | null = null;

/** Registers the queue's drop resolver while mounted; null offers no drop. */
export function useQueueDropTarget(resolve: DropResolver | null) {
  const ref = useRef(resolve);
  ref.current = resolve;
  const active = resolve !== null;
  useEffect(() => {
    if (!active) return;
    const target: DropResolver = (at) => ref.current?.(at) ?? null;
    dropTarget = target;
    return () => {
      if (dropTarget === target) dropTarget = null;
    };
  }, [active]);
}

/**
 * Pointer handlers for a search hit: dropping it over the queue calls `onDrop`
 * with its slot. The click a drag ends in lands on the captured row, not on the
 * hit's own buttons, so there is no click to drop here.
 */
export function useSearchItemDrag(item: ApiSearchItem, onDrop: (where: QueuePosition) => void) {
  return usePressDrag().bind({
    onStart: () => {},
    onMove: (at) => setSearchDrag({ item, at }),
    onEnd: (at) => {
      setSearchDrag(null);
      const where = dropTarget?.(at) ?? null;
      if (where !== null) onDrop(where);
    },
    onCancel: () => setSearchDrag(null),
  });
}

const GHOST_OFFSET = 12;

/** The dragged hit's title, following the cursor. Mount once, above every column. */
export function SearchDragGhost() {
  const drag = useSearchDrag();
  if (!drag) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'fixed', left: drag.at.x + GHOST_OFFSET, top: drag.at.y + GHOST_OFFSET, maxWidth: 260,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: ink(0.1),
        backgroundColor: colors.surface, boxShadow: shadow.md,
      } as any}
    >
      <Text numberOfLines={1} style={{ fontFamily: font.bodyMedium, fontSize: 13, color: colors.text }}>{drag.item.title}</Text>
    </View>
  );
}
