// The control-surface contract the engine-backed store talks to.
//
// TYPES ONLY in this barrel — zero runtime values, so it stays node-free and the
// RN-no-node guard never trips on it. Concrete implementations (SonosApi over a
// SonosClient, MockApi for demo/web) live alongside in ../state and are imported
// by the runtime that constructs them (Electron main, Android in-process, web).
//
// The Api is the ONLY per-runtime difference: the StoreProvider drives the same
// reducer regardless of which Api it was handed.

import type { RepeatMode } from '../engine';

/**
 * A room the network exposes. `id` is the engine RoomRef.handle — a stable,
 * URL-safe slug the UI uses as the room key.
 */
export interface ApiRoom {
  id: string;
  name: string;
}

/**
 * A playback group as the store sees it. `id` is the engine Group.id. `roomIds`
 * are ApiRoom ids (handles). `coordinatorUuid` is the bare RINCON UUID a join
 * targets. The store never invents these — they come straight from topology.
 */
export interface ApiGroup {
  id: string;
  name: string;
  roomIds: string[];
  coordinatorUuid: string;
}

/** A topology snapshot: every visible room + every active group. */
export interface ApiTopology {
  rooms: ApiRoom[];
  groups: ApiGroup[];
}

/**
 * Flattened now-playing for a group's coordinator. `positionSeconds` /
 * `durationSeconds` are already bridged from the speaker's "H:MM:SS" strings;
 * `durationSeconds` is 0 for live streams (NOT_IMPLEMENTED). `title`/`artist`
 * may be "" when nothing is playing.
 */
export interface ApiNowPlaying {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  positionSeconds: number;
  durationSeconds: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Absolute album-art URL for the current track, "" if none. */
  artUrl: string;
  /** 0-based index of the current track in the queue, or -1 if not a queue. */
  queueIndex: number;
}

/** One track in a group's play queue. */
export interface ApiQueueItem {
  title: string;
  artist: string;
  album: string;
  /** Absolute album-art URL, "" if none. */
  artUrl: string;
}

/**
 * The high-level control API the engine-backed store drives. Every method is
 * async and surfaces faults by REJECTING (no silent swallow): the store applies
 * optimistic updates and reverts on rejection.
 *
 * Id contract: room ids are engine RoomRef handles; group ids are engine
 * Group.ids. Both are resolved against the most-recent topology the Api loaded.
 */
export interface Api {
  // --- topology ---
  /** Discovers + loads the full household topology. THROWS when none is found. */
  loadTopology(): Promise<ApiTopology>;
  /** Re-fetches topology from a known speaker (cheaper than re-discovering). */
  refreshTopology(): Promise<ApiTopology>;

  // --- per active group (routed to its coordinator) ---
  getNowPlaying(groupId: string): Promise<ApiNowPlaying>;
  /** Reads the group coordinator's current play queue, in order. */
  getQueue(groupId: string): Promise<ApiQueueItem[]>;
  /** Removes every track from the group's queue. */
  clearQueue(groupId: string): Promise<void>;
  /** Moves the track at fromIndex to toIndex (0-based) within the group's queue. */
  reorderQueue(groupId: string, fromIndex: number, toIndex: number): Promise<void>;
  play(groupId: string): Promise<void>;
  pause(groupId: string): Promise<void>;
  next(groupId: string): Promise<void>;
  previous(groupId: string): Promise<void>;
  /** Seeks to an absolute position in seconds within the current track. */
  seek(groupId: string, positionSeconds: number): Promise<void>;
  setShuffle(groupId: string, shuffle: boolean): Promise<void>;
  setRepeat(groupId: string, repeat: RepeatMode): Promise<void>;

  // --- per room (routed to the room's own player) ---
  getVolume(roomId: string): Promise<number>;
  setVolume(roomId: string, volume: number): Promise<void>;
  getMute(roomId: string): Promise<boolean>;
  setMute(roomId: string, muted: boolean): Promise<void>;

  // --- grouping ---
  /** Makes `roomId` join the group coordinated by `coordinatorUuid`. */
  joinGroup(roomId: string, coordinatorUuid: string): Promise<void>;
  /** Detaches `roomId` into its own standalone group. */
  leaveGroup(roomId: string): Promise<void>;
  /** Detaches `roomId` into a fresh standalone group (alias of leaveGroup). */
  startGroup(roomId: string): Promise<void>;
}
