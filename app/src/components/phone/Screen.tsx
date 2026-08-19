import React from 'react';
import { RefreshControl, ScrollView, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';

// PHONE ONLY — imports react-native-safe-area-context, which the Electron
// renderer does not bundle. Never import this from app/src/desktop.
//
// Every screen used to hardcode `paddingTop: 56` and ignore the bottom inset,
// which collides with the Dynamic Island at the top and the home indicator at
// the bottom (Android draws under both system bars — app.json sets
// edgeToEdgeEnabled). These resolve the real insets once, in one place.

/** Content padding that clears the system bars, plus the layout's own breathing room. */
function useScreenPadding(): { paddingTop: number; paddingBottom: number } {
  const insets = useSafeAreaInsets();
  return { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 24 };
}

/**
 * A scrolling screen with the safe-area insets folded into its content padding.
 * `onRefresh` adds pull-to-refresh — the gesture a phone user reaches for first,
 * where the desktop only ever had a button.
 */
export function ScreenScroll({
  children,
  bg = colors.bg,
  horizontal = 22,
  refreshing,
  onRefresh,
  contentStyle,
}: {
  children: React.ReactNode;
  bg?: string;
  horizontal?: number;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const pad = useScreenPadding();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[{ ...pad, paddingHorizontal: horizontal }, contentStyle]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.fgMuted}
            colors={[colors.fgMuted]}
            progressBackgroundColor={colors.bgPaper}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}
