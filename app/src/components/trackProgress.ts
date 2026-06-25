// Shared real-data helpers for the transport scrubber. With a real Sonos engine
// a track's `dur` is SECONDS and is 0 for live streams (radio/line-in). The
// scrubber must NOT divide by dur in that case (NaN/Infinity) and the store's
// seek already no-ops for dur<=0 — so we surface a live/indeterminate state and
// neutralise the drag rather than computing a bogus fraction.

import { PLACEHOLDER_TRACK_ID } from '@orkester/core/state';
import type { Group, Track } from '../state/types';

export interface ProgressModel {
  /** True when the active track is a live stream (no finite duration). */
  isLive: boolean;
  /** True when there is genuinely nothing playing (placeholder track/group). */
  isNothing: boolean;
  /** 0..1 fill for the scrubber; 0 for live/nothing (no math on dur<=0). */
  fraction: number;
  /** Elapsed label (mm:ss). Counts up even for live streams. */
  elapsed: number;
  /** Remaining seconds for a finite track; null when live/unknown. */
  remaining: number | null;
}

export function progressOf(group: Group, track: Track): ProgressModel {
  const isNothing = group.id === '' || track.id === PLACEHOLDER_TRACK_ID;
  const isLive = !isNothing && track.dur <= 0;
  const finite = !isNothing && track.dur > 0;
  return {
    isNothing,
    isLive,
    fraction: finite ? Math.max(0, Math.min(1, group.progress / track.dur)) : 0,
    elapsed: group.progress,
    remaining: finite ? Math.max(0, track.dur - group.progress) : null,
  };
}
