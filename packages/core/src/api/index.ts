// The control-surface contract the UI talks to.
// TYPES ONLY — zero runtime values. The concrete engine lives elsewhere.

import type { Group, Room, Track } from '../state';

/**
 * The high-level control API the app drives. A concrete implementation
 * (real Sonos engine, mock, etc.) lives outside @orkester/core.
 */
export interface Api {
  /** Returns the rooms currently known on the network. */
  listRooms(): Promise<Room[]>;
  /** Returns the active playback groups. */
  listGroups(): Promise<Group[]>;
  /** Resolves a track by id. */
  getTrack(trackId: string): Promise<Track | undefined>;

  /** Begins or resumes playback for a group. */
  play(groupId: string): Promise<void>;
  /** Pauses playback for a group. */
  pause(groupId: string): Promise<void>;
  /** Advances to the next track in a group's queue. */
  next(groupId: string): Promise<void>;
  /** Returns to the previous track in a group's queue. */
  previous(groupId: string): Promise<void>;
  /** Seeks to an absolute position, in seconds, within the current track. */
  seek(groupId: string, positionSeconds: number): Promise<void>;

  /** Sets the volume (0–100) for a single room. */
  setVolume(roomId: string, volume: number): Promise<void>;
  /** Mutes or unmutes a single room. */
  setMute(roomId: string, muted: boolean): Promise<void>;
}
