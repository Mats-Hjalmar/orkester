// The engine-backed store reducer — pure, no I/O, no react.
//
// Holds an engine-shaped projection of the household: rooms + groups (UI shape),
// per-track synthesized metadata keyed by a stable id, per-room volume/mute, the
// local `liked` set, and the topology lifecycle. The provider (./store) owns the
// side effects: it calls the Api, dispatches OPTIMISTIC patches immediately, and
// dispatches RECONCILE actions from the polling loop (and on error-revert).
//
// No silent fallbacks: a missing track id throws (it is a real wiring bug), and
// the provider surfaces Api rejections by reverting + recording topologyError.

import type { Config, Group, MView, Room, Track, TopologyStatus } from './types';
import type { ApiNowPlaying, ApiTopology } from '../api';
import { synthesizeArt } from './art';

export interface State {
  mView: MView;
  /** Local-only UI state — the engine has no "liked" concept. */
  liked: Record<string, boolean>;
  /** roomId -> 0..100. */
  roomVol: Record<string, number>;
  /** roomId -> muted. */
  roomMute: Record<string, boolean>;
  rooms: Room[];
  groups: Group[];
  /** trackId -> Track (synthesized from now-playing). */
  tracks: Record<string, Track>;
  /** Per group, the coordinator UUID a join targets. */
  coordinatorUuid: Record<string, string>;
  activeGroupId: string;
  topologyStatus: TopologyStatus;
  topologyError: string;
}

export const PLACEHOLDER_TRACK_ID = '__nothing__';

/** The safe placeholder track returned when a group has nothing playing. */
export function placeholderTrack(): Track {
  return {
    id: PLACEHOLDER_TRACK_ID,
    title: 'Nothing playing',
    artist: '',
    album: '',
    year: '',
    cat: '',
    dur: 0,
    ...synthesizeArt('Nothing playing', ''),
  };
}

export function initialState(): State {
  return {
    mView: 'nowplaying',
    liked: {},
    roomVol: {},
    roomMute: {},
    rooms: [],
    groups: [],
    tracks: { [PLACEHOLDER_TRACK_ID]: placeholderTrack() },
    coordinatorUuid: {},
    activeGroupId: '',
    topologyStatus: 'idle',
    topologyError: '',
  };
}

/**
 * True only when a group is GENUINELY idle: not playing AND no metadata at all.
 * A group that IS playing but reports sparse/empty metadata (some streaming DIDL
 * shapes parse with empty title/artist) is NOT idle — it is playing something we
 * just can't fully label yet, so it must keep a real track id.
 */
function isIdle(np: ApiNowPlaying): boolean {
  return !np.isPlaying && np.title === '' && np.artist === '';
}

/**
 * Display title from the speaker's metadata, or '' when it reports none. We do
 * NOT fabricate a 'Playing' label — the UI decides how to present a playing-but-
 * untitled group (it shows the room + a muted "track details unavailable" rather
 * than a fake song). isIdle (transport state) — not this — decides playing vs not.
 */
function labelFor(np: ApiNowPlaying): string {
  return np.title || np.album || '';
}

/** A synthesized, stable track id for a group's current now-playing. */
function trackIdFor(groupId: string, np: ApiNowPlaying): string {
  if (isIdle(np)) return PLACEHOLDER_TRACK_ID;
  // Stable per (group, title, artist) so the id (and its synthesized art) does
  // not churn between identical polls. Playing-but-sparse collapses to a stable
  // `np:gid:|` — distinct per group, so two cards never share an id.
  return `np:${groupId}:${np.title}|${np.artist}`;
}

/** Builds a UI Track from a now-playing snapshot. */
function trackFromNowPlaying(id: string, np: ApiNowPlaying): Track {
  if (id === PLACEHOLDER_TRACK_ID) return placeholderTrack();
  // Honest label: title, else album, else 'Playing' — so a playing-but-sparse
  // stream reads as playing (never "Nothing playing") across every consumer.
  const title = labelFor(np);
  return {
    id,
    title,
    artist: np.artist,
    album: np.album,
    year: '',
    cat: '',
    dur: np.durationSeconds,
    ...synthesizeArt(title, np.artist),
  };
}

export type Action =
  // lifecycle / topology
  | { type: 'topologyLoading' }
  | { type: 'topologyError'; message: string }
  | { type: 'topologyReady'; topology: ApiTopology }
  // now-playing reconcile (from poll)
  | { type: 'nowPlaying'; groupId: string; np: ApiNowPlaying }
  | { type: 'tick' } // 1s local progress interpolation
  // volume/mute reconcile (from poll)
  | { type: 'roomVolume'; roomId: string; volume: number }
  | { type: 'roomMute'; roomId: string; muted: boolean }
  // optimistic patches (mirrored by an Api call in the provider)
  | { type: 'setPlayingOptimistic'; groupId: string; isPlaying: boolean }
  | { type: 'setProgressOptimistic'; groupId: string; progress: number }
  | { type: 'setShuffleOptimistic'; groupId: string; shuffle: boolean }
  | { type: 'setRepeatOptimistic'; groupId: string; repeat: boolean }
  | { type: 'setRoomVolOptimistic'; roomId: string; volume: number }
  | { type: 'setRoomMuteOptimistic'; roomId: string; muted: boolean }
  // local-only
  | { type: 'toggleLike'; id: string }
  | { type: 'selectGroup'; gid: string }
  | { type: 'setView'; view: MView };

function patchGroup(s: State, gid: string, patch: Partial<Group>): Group[] {
  return s.groups.map((g) => (g.id === gid ? { ...g, ...patch } : g));
}

function activeOf(s: State): Group | undefined {
  return s.groups.find((g) => g.id === s.activeGroupId) ?? s.groups[0];
}

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'topologyLoading':
      return { ...s, topologyStatus: 'loading', topologyError: '' };

    case 'topologyError':
      return { ...s, topologyStatus: 'error', topologyError: a.message };

    case 'topologyReady': {
      const rooms: Room[] = a.topology.rooms.map((r) => ({ id: r.id, name: r.name }));
      const coordinatorUuid: Record<string, string> = {};
      // Preserve prior per-group transport flags + trackId across a refresh so a
      // topology poll doesn't blow away now-playing the poll loop will refill.
      const groups: Group[] = a.topology.groups.map((g) => {
        coordinatorUuid[g.id] = g.coordinatorUuid;
        const prior = s.groups.find((x) => x.id === g.id);
        return {
          id: g.id,
          roomIds: g.roomIds,
          trackId: prior?.trackId ?? PLACEHOLDER_TRACK_ID,
          isPlaying: prior?.isPlaying ?? false,
          progress: prior?.progress ?? 0,
          shuffle: prior?.shuffle ?? false,
          repeat: prior?.repeat ?? false,
          muted: prior?.muted ?? false,
          queueIds: [],
        };
      });
      // Keep the active group if it still exists, else fall back to the first.
      let activeGroupId = s.activeGroupId;
      if (!groups.find((g) => g.id === activeGroupId)) {
        activeGroupId = groups[0]?.id ?? '';
      }
      return {
        ...s,
        rooms,
        groups,
        coordinatorUuid,
        activeGroupId,
        topologyStatus: 'ready',
        topologyError: '',
      };
    }

    case 'nowPlaying': {
      const id = trackIdFor(a.groupId, a.np);
      const track = trackFromNowPlaying(id, a.np);
      const groups = patchGroup(s, a.groupId, {
        trackId: id,
        isPlaying: a.np.isPlaying,
        progress: a.np.positionSeconds,
        shuffle: a.np.shuffle,
        repeat: a.np.repeat !== 'none',
      });
      return { ...s, groups, tracks: { ...s.tracks, [id]: track } };
    }

    case 'tick': {
      let changed = false;
      const groups = s.groups.map((g) => {
        if (!g.isPlaying) return g;
        const tr = s.tracks[g.trackId];
        // Live streams (dur 0) keep counting up; finite tracks clamp at dur.
        const next = g.progress + 1;
        if (tr && tr.dur > 0 && next >= tr.dur) return g; // hold at end; poll corrects
        changed = true;
        return { ...g, progress: next };
      });
      return changed ? { ...s, groups } : s;
    }

    case 'roomVolume':
      return { ...s, roomVol: { ...s.roomVol, [a.roomId]: a.volume } };

    case 'roomMute':
      return { ...s, roomMute: { ...s.roomMute, [a.roomId]: a.muted } };

    case 'setPlayingOptimistic':
      return { ...s, groups: patchGroup(s, a.groupId, { isPlaying: a.isPlaying }) };

    case 'setProgressOptimistic':
      return { ...s, groups: patchGroup(s, a.groupId, { progress: a.progress }) };

    case 'setShuffleOptimistic':
      return { ...s, groups: patchGroup(s, a.groupId, { shuffle: a.shuffle }) };

    case 'setRepeatOptimistic':
      return { ...s, groups: patchGroup(s, a.groupId, { repeat: a.repeat }) };

    case 'setRoomVolOptimistic':
      return { ...s, roomVol: { ...s.roomVol, [a.roomId]: a.volume } };

    case 'setRoomMuteOptimistic':
      return { ...s, roomMute: { ...s.roomMute, [a.roomId]: a.muted } };

    case 'toggleLike':
      return { ...s, liked: { ...s.liked, [a.id]: !s.liked[a.id] } };

    case 'selectGroup':
      return { ...s, activeGroupId: a.gid, mView: 'nowplaying' };

    case 'setView':
      return { ...s, mView: a.view };

    default:
      return s;
  }
}

export { activeOf };
