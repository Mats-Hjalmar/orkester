// Stable UI-facing state types. These mirror app/src/state/types.ts exactly so
// the UI's useStore() surface does not churn when the implementation is swapped
// from mock to engine-backed. TYPES ONLY — zero runtime values.

export type Motif = 'sun' | 'arc';

/**
 * A track as the UI consumes it. With the engine there is no music library, so a
 * "track" is just the coordinator's current now-playing flattened into this
 * shape (id is synthesized, dur is SECONDS and may be 0 for live streams, cover*
 * are synthesized from hash(title|artist)).
 */
export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  year: string;
  cat: string; // catalogue number, e.g. NOI-114 (synthesized/empty with engine)
  dur: number; // seconds (0 for live streams)
  coverBg: string;
  coverShape: string;
}

export interface Room {
  id: string;
  name: string;
}

/**
 * A playback group as the UI consumes it. `progress` is SECONDS into the current
 * track (locally interpolated between polls). `trackId` points at a Track the
 * store holds. `queueIds` is empty with the engine (queue browsing is deferred).
 */
export interface Group {
  id: string;
  roomIds: string[];
  trackId: string;
  isPlaying: boolean;
  progress: number; // seconds
  shuffle: boolean;
  repeat: boolean;
  muted: boolean;
  queueIds: string[];
}

export interface Config {
  accentColor: string;
  coverMotif: Motif;
  mobileNowDark: boolean;
}

export type MView = 'nowplaying' | 'home' | 'rooms' | 'search';

/** Topology load lifecycle, surfaced to the UI for empty/loading/error states. */
export type TopologyStatus = 'idle' | 'loading' | 'ready' | 'error';
