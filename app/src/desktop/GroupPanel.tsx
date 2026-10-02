import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Check } from '../icons';
import { colors, ink, radii, shadow } from '../theme/tokens';
import { font } from '../theme/fonts';
import { type } from '../theme/type';
import { useStore } from '../state/store';
import { accentTextOf, chipsFor } from '../state/selectors';
import type { Group } from '../state/types';
import { Spinner } from './controls';
import { MINI_PLAYER_H } from './MiniPlayer';

// A checklist of every speaker, popped up above the mini player's speakers button:
// checked = in this group. Toggling goes through the same join/leave as the
// speaker chips. A click outside or Escape closes it.
export default function GroupPanel({ group, onClose }: { group: Group; onClose: () => void }) {
  const store = useStore();
  const accent = store.config.accentColor;
  const accentText = accentTextOf(accent);
  const chips = chipsFor(store, group);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Pressable testID="group-panel-backdrop" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, cursor: 'default' } as any} />
      <View
        testID="group-panel"
        style={{
          position: 'absolute', right: 20, bottom: MINI_PLAYER_H + 8, width: 300, maxHeight: 420,
          borderRadius: radii.lg, borderWidth: 1, borderColor: ink(0.1), backgroundColor: colors.bgPaper,
          boxShadow: shadow.md,
        } as any}
      >
        <Text style={[type.eyebrow, { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }]}>Group speakers</Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
          {chips.map((c) => (
            <Pressable
              key={c.id}
              onPress={c.onPress}
              disabled={c.busy}
              style={({ pressed, hovered }: any) => ({
                flexDirection: 'row', alignItems: 'center', gap: 12,
                paddingVertical: 9, paddingHorizontal: 8, borderRadius: radii.md,
                backgroundColor: pressed ? ink(0.06) : hovered ? ink(0.03) : 'transparent',
              })}
            >
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: c.member ? accent : ink(0.25), backgroundColor: c.member ? accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {c.busy ? <Spinner size={14} color={c.member ? accentText : colors.fgMuted} /> : c.member && <Check size={14} color={accentText} />}
              </View>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: font.bodyMedium, fontSize: 13.5, color: colors.fg }}>{c.name}</Text>
              {!!c.tag && <Text numberOfLines={1} style={{ maxWidth: 120, fontFamily: font.mono, fontSize: 10.5, color: colors.fgSubtle }}>{c.tag}</Text>}
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}
