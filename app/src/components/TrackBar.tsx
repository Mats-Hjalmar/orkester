import React, { useRef } from 'react';
import { View, GestureResponderEvent, ViewStyle } from 'react-native';
import { radii } from '../theme/tokens';

interface Props {
  value: number; // 0..1
  onScrub: (frac: number) => void;
  trackColor: string;
  fillColor: string;
  height?: number; // bar thickness
  hitSlop?: number; // vertical touch padding
  thumb?: boolean; // draggable dot at the head
  // Only grab when the touch lands on/near the thumb, not anywhere on the track.
  // Stops a scroll-drag (touch) or a stray click (desktop) over the wide bar from
  // scrubbing — e.g. jerking the volume to max. Implies a thumb to aim for.
  grabThumbOnly?: boolean;
  disabled?: boolean; // inert: no drag/tap, dimmed (live stream / nothing playing)
  style?: ViewStyle;
}

// How far (px) from the thumb centre still counts as grabbing it, when
// grabThumbOnly is set. Generous so it stays easy to hit on touch and mouse.
const THUMB_GRAB_RADIUS = 22;

// Tap or drag the bar to set a 0..1 fraction. Width is measured via onLayout; the
// Responder system reads locationX — no gesture-handler dependency. With
// `grabThumbOnly` the bar only responds near the thumb, so a scroll or stray click
// on the rest of the track is ignored. When `disabled` (a live stream has no finite
// duration, or nothing is playing) the bar is inert and dimmed.
export default function TrackBar({ value, onScrub, trackColor, fillColor, height = 4, hitSlop = 8, thumb = false, grabThumbOnly = false, disabled = false, style }: Props) {
  const width = useRef(0);

  const handle = (e: GestureResponderEvent) => {
    if (disabled) return;
    const w = width.current;
    if (w <= 0) return;
    const x = e.nativeEvent.locationX;
    onScrub(Math.max(0, Math.min(1, x / w)));
  };

  // Whether a touch should claim the bar. With grabThumbOnly, only when it lands
  // within THUMB_GRAB_RADIUS of the thumb; otherwise anywhere on the track.
  const shouldGrab = (e: GestureResponderEvent) => {
    if (disabled) return false;
    if (!grabThumbOnly) return true;
    const w = width.current;
    if (w <= 0) return false;
    const thumbX = Math.max(0, Math.min(1, value)) * w;
    return Math.abs(e.nativeEvent.locationX - thumbX) <= THUMB_GRAB_RADIUS;
  };

  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;

  return (
    <View
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
      onStartShouldSetResponder={shouldGrab}
      onMoveShouldSetResponder={shouldGrab}
      onResponderGrant={handle}
      onResponderMove={handle}
      hitSlop={{ top: hitSlop, bottom: hitSlop }}
      style={[{ justifyContent: 'center', opacity: disabled ? 0.55 : 1 }, style]}
    >
      <View style={{ height, borderRadius: radii.pill, backgroundColor: trackColor, width: '100%' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill, backgroundColor: fillColor, width: pct as any }} />
        {thumb && (
          <View
            style={{
              position: 'absolute',
              top: '50%',
              left: pct as any,
              width: 12,
              height: 12,
              borderRadius: radii.pill,
              backgroundColor: fillColor,
              transform: [{ translateX: -6 }, { translateY: -6 }],
            }}
          />
        )}
      </View>
    </View>
  );
}
