import React from 'react';
import { View } from 'react-native';
import { ink, radii } from '../theme/tokens';

export const QUEUE_SCROLL_ID = 'queue-scroll';
export const HIT_W = 14;
export const BAR_W = 7;
const MIN_THUMB = 28;
const MARKER_W = BAR_W + 4;
const MARKER_H = 6;
const INSET = (HIT_W - BAR_W) / 2;

// The queue uses the native scrollbar, so the browser moves the thumb with the
// scroll itself (a JS-positioned thumb lagged behind long queues). Styling it via
// ::-webkit-scrollbar makes it a classic one that stays visible on macOS instead
// of auto-hiding. It is HIT_W wide to be easy to grab, with transparent side
// borders leaving a BAR_W pill; the elliptical radius keeps that inner part round
// because only the sides have a border. The gutter stays reserved so the rows
// don't widen when the queue fits. RN styles can't reach pseudo-elements, hence
// the stylesheet; the ScrollView forwards `id` to its scrolling element.
const style = document.createElement('style');
style.textContent = `
#${QUEUE_SCROLL_ID} { scrollbar-gutter: stable; }
#${QUEUE_SCROLL_ID}::-webkit-scrollbar { width: ${HIT_W}px; }
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-track,
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-thumb {
  border: solid transparent;
  border-width: 0 ${INSET}px;
  border-radius: ${HIT_W / 2}px / ${BAR_W / 2}px;
  background-clip: padding-box;
}
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-track { background-color: ${ink(0.05)}; }
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-thumb { min-height: ${MIN_THUMB}px; background-color: ${ink(0.2)}; }
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-thumb:hover { background-color: ${ink(0.32)}; }
#${QUEUE_SCROLL_ID}::-webkit-scrollbar-thumb:active { background-color: ${ink(0.45)}; }
`;
document.head.append(style);

// A tick on the queue's scrollbar track at the playing row (`y`, a content y).
// `right` is the visible bar's gap to the right edge. Renders nothing when
// everything fits, as the scrollbar then isn't shown.
export function ScrollMarker({ viewport, content, right, y, color }: {
  viewport: number;
  content: number;
  right: number;
  y: number;
  color: string;
}) {
  if (viewport <= 0 || content <= viewport) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, bottom: 0, right: right - INSET, width: HIT_W, alignItems: 'center' }}
    >
      <View
        style={{
          position: 'absolute', top: (y / content) * viewport - MARKER_H / 2, width: MARKER_W, height: MARKER_H,
          borderRadius: radii.pill, backgroundColor: color, boxShadow: `0px 1px 3px ${ink(0.3)}`,
        }}
      />
    </View>
  );
}
