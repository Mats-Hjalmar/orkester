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
  style?: ViewStyle;
}

// Tap or drag anywhere on the bar to set a 0..1 fraction. Width is measured via
// onLayout; the Responder system reads locationX — no gesture-handler dependency.
export default function TrackBar({ value, onScrub, trackColor, fillColor, height = 4, hitSlop = 8, thumb = false, style }: Props) {
  const width = useRef(0);

  const handle = (e: GestureResponderEvent) => {
    const w = width.current;
    if (w <= 0) return;
    const x = e.nativeEvent.locationX;
    onScrub(Math.max(0, Math.min(1, x / w)));
  };

  const pct = `${Math.max(0, Math.min(1, value)) * 100}%`;

  return (
    <View
      onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={handle}
      onResponderMove={handle}
      hitSlop={{ top: hitSlop, bottom: hitSlop }}
      style={[{ justifyContent: 'center' }, style]}
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
