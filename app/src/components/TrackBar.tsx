import React, { useRef, useState } from 'react';
import { ActivityIndicator, View, GestureResponderEvent, ViewStyle } from 'react-native';
import { radii } from '../theme/tokens';

interface Props {
  value: number; // 0..1
  onScrub: (frac: number) => void;
  trackColor: string;
  fillColor: string;
  height?: number; // bar thickness
  hitSlop?: number; // vertical touch padding
  thumb?: boolean; // draggable dot at the head
  loading?: boolean; // show a spinner at the thumb while the value is being applied
  // Only grab when the touch lands on/near the thumb, not anywhere on the track.
  // Stops a scroll-drag (touch) or a stray click (desktop) over the wide bar from
  // scrubbing — e.g. jerking the volume to max. Implies a thumb to aim for.
  grabThumbOnly?: boolean;
  disabled?: boolean; // inert: no drag/tap, dimmed (live stream / nothing playing)
  /** Screen-reader name for the bar, e.g. "Volume". Required for the a11y actions. */
  label?: string;
  /** Fired when the value is committed by a gesture end, not on every move. */
  onCommit?: (frac: number) => void;
  /** How far one accessibility increment/decrement moves the value (0..1). */
  step?: number;
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
export default function TrackBar({ value, onScrub, trackColor, fillColor, height = 4, hitSlop = 8, thumb = false, loading = false, grabThumbOnly = false, disabled = false, label, onCommit, step = 0.05, style }: Props) {
  const width = useRef(0);
  // While dragging, the bar draws where the finger is rather than what the store
  // says. The write is asynchronous and the speaker is polled meanwhile, so the
  // prop lags and stutters; the gesture must not.
  const [drag, setDrag] = useState<number | null>(null);
  const shown = Math.max(0, Math.min(1, drag ?? value));

  const fracAt = (e: GestureResponderEvent) => {
    const w = width.current;
    if (w <= 0) return null;
    return Math.max(0, Math.min(1, e.nativeEvent.locationX / w));
  };

  const handle = (e: GestureResponderEvent) => {
    if (disabled) return;
    const f = fracAt(e);
    if (f === null) return;
    setDrag(f);
    onScrub(f);
  };

  // Whether a touch should claim the bar. With grabThumbOnly, only when it lands
  // within THUMB_GRAB_RADIUS of the thumb; otherwise anywhere on the track.
  const shouldGrab = (e: GestureResponderEvent) => {
    if (disabled) return false;
    if (!grabThumbOnly) return true;
    const w = width.current;
    if (w <= 0) return false;
    return Math.abs(e.nativeEvent.locationX - shown * w) <= THUMB_GRAB_RADIUS;
  };

  // The drag position is cleared on release so the bar goes back to following the
  // store; onCommit fires with the final value so callers can e.g. buzz once.
  const release = () => {
    if (drag !== null) onCommit?.(drag);
    setDrag(null);
  };

  const pct = `${shown * 100}%`;

  return (
    <View
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
      onStartShouldSetResponder={shouldGrab}
      onMoveShouldSetResponder={shouldGrab}
      // A thumb grab is deliberate, so keep it: an enclosing scroll view asking for
      // the responder mid-gesture would otherwise abort the drag partway. A plain
      // track (the seek bar) still yields, so a scroll starting on it can scroll.
      onResponderTerminationRequest={() => !grabThumbOnly}
      onResponderGrant={handle}
      onResponderMove={handle}
      onResponderRelease={release}
      onResponderTerminate={release}
      hitSlop={{ top: hitSlop, bottom: hitSlop }}
      // An "adjustable" role with increment/decrement is the ONLY way a screen
      // reader can move a custom slider — without it VoiceOver/TalkBack can read
      // the value but never change it.
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(shown * 100) }}
      accessibilityActions={disabled ? undefined : [{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (disabled) return;
        const delta = e.nativeEvent.actionName === 'increment' ? step : -step;
        const next = Math.max(0, Math.min(1, shown + delta));
        onScrub(next);
        onCommit?.(next);
      }}
      style={[{ justifyContent: 'center', opacity: disabled ? 0.55 : 1 }, style]}
    >
      <View style={{ height, borderRadius: radii.pill, backgroundColor: trackColor, width: '100%' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill, backgroundColor: fillColor, width: pct as any }} />
        {thumb ? (
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
        ) : null}
        {loading && drag === null ? (
          // Spinner around the thumb while the value is being written to the
          // speaker. The thumb stays drawn underneath — it is the grab target.
          <View style={{ position: 'absolute', top: '50%', left: pct as any, transform: [{ translateX: -9 }, { translateY: -9 }] }} pointerEvents="none">
            <ActivityIndicator size="small" color={fillColor} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
