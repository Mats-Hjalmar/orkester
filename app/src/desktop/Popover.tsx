import React from 'react';
import { Pressable, View } from 'react-native';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { MINI_PLAYER_H } from './MiniPlayer';

// A card popped up above the mini player's right-hand controls. A click outside
// or Escape closes it.
export default function Popover({ testID, onClose, children }: { testID: string; onClose: () => void; children: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Pressable testID={`${testID}-backdrop`} onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'default' } as any} />
      <View
        testID={testID}
        style={{
          position: 'absolute', right: 20, bottom: MINI_PLAYER_H + 8, width: 300, maxHeight: 420,
          borderRadius: radii.lg, borderWidth: 1, borderColor: ink(0.1), backgroundColor: colors.bgPaper,
          boxShadow: shadow.md,
        } as any}
      >
        {children}
      </View>
    </View>
  );
}
