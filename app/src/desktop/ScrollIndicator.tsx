import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { ink, radii } from '../theme/tokens';

const HIT_W = 14;
const BAR_W = 7;
const MIN_THUMB = 28;
const MARKER_W = BAR_W + 4;
const MARKER_H = 6;

type PointerTarget = {
  getBoundingClientRect: () => { top: number };
  setPointerCapture?: (id: number) => void;
  releasePointerCapture?: (id: number) => void;
};

// An always-visible scrollbar drawn over the right edge of a ScrollView (macOS's
// native one auto-hides and is too thin to aim for). Drag the thumb to scroll;
// press anywhere else on the track to jump the thumb's centre there and keep
// dragging. Pointer capture keeps the drag alive when the cursor leaves the bar,
// as with the queue's drag handles. `right` is the bar's gap to the right edge.
// An optional `marker` (a content y, e.g. the playing row) is drawn as a tick at
// the matching spot on the track. Renders nothing when everything fits.
export default function ScrollIndicator({ viewport, content, offset, onScrollTo, right, marker }: {
  viewport: number;
  content: number;
  offset: number;
  onScrollTo: (y: number) => void;
  right: number;
  marker?: { y: number; color: string };
}) {
  // Where on the thumb the pointer holds it, or null when not dragging.
  const grab = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [hovered, setHovered] = useState(false);

  const scrollable = content - viewport;
  if (viewport <= 0 || scrollable <= 0) return null;
  const thumbH = Math.max(MIN_THUMB, (viewport * viewport) / content);
  const travel = viewport - thumbH;
  const thumbTop = (Math.min(Math.max(offset, 0), scrollable) / scrollable) * travel;

  const scrollToPointer = (clientY: number, target: PointerTarget, hold: number) => {
    const top = Math.min(Math.max(clientY - target.getBoundingClientRect().top - hold, 0), travel);
    onScrollTo((top / travel) * scrollable);
  };

  return (
    <View
      onPointerDown={(e) => {
        const t = e.currentTarget as unknown as PointerTarget;
        try { t.setPointerCapture?.(e.nativeEvent.pointerId); } catch { /* capture optional */ }
        const y = e.nativeEvent.clientY - t.getBoundingClientRect().top;
        const onThumb = y >= thumbTop && y <= thumbTop + thumbH;
        grab.current = onThumb ? y - thumbTop : thumbH / 2;
        setActive(true);
        if (!onThumb) scrollToPointer(e.nativeEvent.clientY, t, grab.current);
      }}
      onPointerMove={(e) => {
        if (grab.current === null) return;
        scrollToPointer(e.nativeEvent.clientY, e.currentTarget as unknown as PointerTarget, grab.current);
      }}
      onPointerUp={(e) => {
        const t = e.currentTarget as unknown as PointerTarget;
        try { t.releasePointerCapture?.(e.nativeEvent.pointerId); } catch { /* noop */ }
        grab.current = null;
        setActive(false);
      }}
      onPointerCancel={() => {
        grab.current = null;
        setActive(false);
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={{ position: 'absolute', top: 0, bottom: 0, right: right - (HIT_W - BAR_W) / 2, width: HIT_W, alignItems: 'center', userSelect: 'none', touchAction: 'none' } as any}
    >
      <View style={{ position: 'absolute', top: 0, bottom: 0, width: BAR_W, borderRadius: radii.pill, backgroundColor: ink(0.05) }} />
      <View
        style={{
          position: 'absolute', top: thumbTop, height: thumbH, width: BAR_W, borderRadius: radii.pill,
          backgroundColor: active ? ink(0.45) : hovered ? ink(0.32) : ink(0.2),
        }}
      />
      {marker && (
        <View
          style={{
            position: 'absolute', top: (marker.y / content) * viewport - MARKER_H / 2, width: MARKER_W, height: MARKER_H,
            borderRadius: radii.pill, backgroundColor: marker.color, boxShadow: `0px 1px 3px ${ink(0.3)}`,
          }}
        />
      )}
    </View>
  );
}
