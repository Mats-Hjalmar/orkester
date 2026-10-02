import React from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { colors, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import { useStore } from '../state/store';

const VISIBLE_MS = 6000;
const SLIDE_MS = 220;

// The store's latest failed action, dropped down from the top edge of the window.
// Click to dismiss early.
export default function ErrorToast() {
  const { actionError, dismissError } = useStore();
  const slide = React.useRef(new Animated.Value(0)).current;
  // Kept after dismissal so the text stays put while the toast slides away.
  const [message, setMessage] = React.useState('');
  const [height, setHeight] = React.useState(80);

  React.useEffect(() => {
    Animated.timing(slide, {
      toValue: actionError ? 1 : 0,
      duration: SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    if (!actionError) return;
    setMessage(actionError.message);
    const timer = setTimeout(dismissError, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [actionError, dismissError, slide]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
      <Animated.View
        pointerEvents={actionError ? 'auto' : 'none'}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        style={{
          maxWidth: 560,
          marginHorizontal: 24,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-height - 24, 0] }) }],
        }}
      >
        <Pressable
          testID="error-toast"
          onPress={dismissError}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            backgroundColor: colors.danger,
            borderBottomLeftRadius: radii.lg,
            borderBottomRightRadius: radii.lg,
            boxShadow: shadow.md,
          } as any}
        >
          <Text style={{ fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.bgPaper }}>{message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
