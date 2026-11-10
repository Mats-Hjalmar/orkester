import React from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import CoverArt from '../components/CoverArt';
import { radii, shadow } from '../theme/tokens';
import { useStore } from '../state/store';
import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group } from '../state/types';

const MARGIN = 48;
const FADE_MS = 200;

// The group's current cover blown up over the area it is rendered in. DesktopApp
// places it over the content row, so the mini player below stays usable. It follows
// track changes and closes when playback goes idle. A click anywhere or Escape closes it.
//
// The animated layer is ALWAYS mounted: an Animated.Value stops its animation when
// detached from every view, so mounting it alongside the fade-in cut the fade off
// after a frame. Only the cover inside mounts and unmounts (after the fade-out),
// and the layer ignores pointer events while closed.
export default function ArtOverlay({ group, open, onClose }: { group: Group; open: boolean; onClose: () => void }) {
  const { getTrack, config } = useStore();
  const tr = getTrack(group.trackId);
  const idle = tr.id === PLACEHOLDER_TRACK_ID;
  // Kept while idle so the cover doesn't swap to a placeholder mid fade-out.
  const shown = React.useRef(tr);
  if (!idle) shown.current = tr;
  const [area, setArea] = React.useState({ width: 0, height: 0 });
  const size = Math.max(0, Math.min(area.width, area.height) - 2 * MARGIN);
  const fade = React.useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = React.useState(open);

  React.useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(fade, {
      toValue: open ? 1 : 0,
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, fade]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Close for good on idle, or the overlay would pop back up when playback resumes.
  React.useEffect(() => {
    if (open && idle) onClose();
  }, [open, idle, onClose]);

  const art = shown.current;

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: fade }}
    >
      {mounted && (
        <Pressable
          testID="art-overlay"
          onPress={onClose}
          onLayout={(e) => setArea(e.nativeEvent.layout)}
          accessibilityRole="button"
          accessibilityLabel="Close album art"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,13,10,0.85)', cursor: 'zoom-out' } as any}
        >
          {size > 0 && (
            <CoverArt size={size} coverBg={art.coverBg} coverShape={art.coverShape} motif={config.coverMotif} radius={radii.xl} shadow={shadow.lg} artUrl={art.artUrl} large />
          )}
        </Pressable>
      )}
    </Animated.View>
  );
}
