// The engine-backed StoreProvider + useStore — drives an injected Api while
// keeping the SAME useStore() surface the mock store exposed, so the UI does not
// churn. Imports ONLY `react` (a peerDependency; tsup `external`), no node:* —
// so this stays on the RN-facing core surface and the RN-no-node guard is green.
//
// The provider owns all side effects: it dispatches OPTIMISTIC patches to the
// reducer immediately, fires the matching Api call, and REVERTS + records an
// error on rejection (no silent swallow). It also runs the polling loop:
//   - active now-playing every ~1s, with a 1s local `tick` interpolating progress
//   - per-room volume/mute every ~2.5s
//   - topology every ~10s (and immediately after a grouping change)

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { Config, Group, QueueItem, Track } from './types';
import {
  type Action,
  type State,
  PLACEHOLDER_TRACK_ID,
  initialState,
  placeholderTrack,
  reducer,
} from './reducer';
import type { Api, ApiSearchItem, ApiSpotifyLink, SpotifySearchKind } from '../api';
import type { RepeatMode } from '../engine';

const DEFAULT_CONFIG: Config = { accentColor: '#E4F289', coverMotif: 'sun', mobileNowDark: false };

// Poll cadences (ms). The FOCUSED/just-acted group's now-playing is fastest so
// its transport changes reconcile within ~1s. Every OTHER group is polled
// round-robin — one group per BACKGROUND tick — so request volume stays bounded
// regardless of household size. Volume is slower; topology slowest.
const NOWPLAYING_POLL_MS = 1000;
const BACKGROUND_NP_POLL_MS = 2500;
const VOLUME_POLL_MS = 2500;
// Min gap between setVolume writes to one speaker while dragging a slider (the UI
// still updates optimistically every scrub event; only the network write is paced).
const VOLUME_WRITE_MS = 120;
// After a local volume write, ignore the room in the volume poll for this long so a
// stale real reading doesn't snap the slider back during/just after a drag.
const VOLUME_QUIET_MS = 1500;
const TOPOLOGY_POLL_MS = 10000;
const QUEUE_POLL_MS = 5000;
const TICK_MS = 1000;

/**
 * Group-targeted transport controls. The rooms-first desktop UI controls every
 * group IN PLACE — without changing any global selection — by calling
 * `groupControls(groupId)` and driving these. Each method applies an optimistic
 * patch + the per-group Api call + revert-by-reconcile, identical to the legacy
 * active-group actions (which now delegate to the very same factory).
 */
export interface GroupControls {
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (frac: number) => void;
  setVolume: (frac: number) => void;
  toggleMute: () => void;
  setShuffle: (shuffle: boolean) => void;
  setRepeat: (repeat: boolean) => void;
}

export interface Store {
  state: State;
  config: Config;
  rooms: State['rooms'];
  // derived helpers (stable shapes)
  getTrack: (id: string) => Track;
  activeGroup: () => Group;
  activeTrack: () => Track;
  roomName: (id: string) => string;
  groupName: (g: Group) => string;
  /** The group's volume (0–100), or null when not backed by a real reading from
   * every member speaker. null means hide the control — never show a guessed slider. */
  groupVol: (g: Group) => number | null;
  /** True while a volume change for any member speaker is being written/applied
   * (drives the loading spinner on the slider thumb). */
  volumeSettling: (g: Group) => boolean;
  isLiked: (id: string) => boolean;
  /** The group coordinator's play queue (fetched on focus/refresh); [] if none. */
  queueFor: (gid: string) => QueueItem[];
  /** Clears the group's queue on the speaker, then re-reads it (Sonos is truth). */
  clearQueue: (gid: string) => void;
  /** Moves a queue track on the speaker (0-based), then re-reads it (Sonos is truth). */
  reorderQueue: (gid: string, fromIndex: number, toIndex: number) => void;
  // --- Spotify catalog search (imperative; the search panel owns its results) ---
  /** True once a Spotify token is saved (device-linked). */
  isSpotifyLinked: () => Promise<boolean>;
  /** Starts the one-time device link via a room; returns the URL/code to show. */
  startSpotifyLink: (roomId: string) => Promise<ApiSpotifyLink>;
  /** Polls whether the link completed (persists the token on success). */
  pollSpotifyLink: () => Promise<boolean>;
  /** Searches the Spotify catalog (THROWS NotLinkedError when not yet linked). */
  searchSpotify: (query: string, kind: SpotifySearchKind) => Promise<ApiSearchItem[]>;
  /** Appends a hit to the group's queue (no playback change), then re-reads the queue. */
  enqueueSearchItem: (gid: string, item: ApiSearchItem) => Promise<void>;
  /** Plays a hit now, REPLACING the queue, then refreshes now-playing + queue. */
  playSearchItem: (gid: string, item: ApiSearchItem) => Promise<void>;
  // GROUP-TARGETED controls (rooms-first desktop) — control any group in place.
  groupControls: (gid: string) => GroupControls;
  /** Marks a group as "focused" so its now-playing polls at the fast cadence. */
  focusGroup: (gid: string) => void;
  /**
   * Manual "reconnect + reload" the user can trigger when the (flaky) Sonos
   * connection drifts: re-runs topology discovery, then atomically re-fetches the
   * focused group. `refreshing` is true while it runs (drives the button spinner).
   */
  refresh: () => void;
  refreshing: boolean;
  // legacy active-group actions (stable names/signatures; back-compat for mobile)
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleMute: () => void;
  toggleLike: (id: string) => void;
  selectTrack: (id: string) => void; // no-op (deferred)
  seek: (frac: number) => void;
  setActiveVol: (frac: number) => void;
  setGroupVol: (gid: string, frac: number) => void;
  toggleRoomInGroup: (gid: string, roomId: string) => void;
  startGroup: (roomId: string) => void;
  selectGroup: (gid: string) => void;
}

const StoreContext = createContext<Store | null>(null);

/** The safe placeholder group returned when no groups exist (never throws). */
function placeholderGroup(): Group {
  return {
    id: '',
    roomIds: [],
    trackId: PLACEHOLDER_TRACK_ID,
    isPlaying: false,
    progress: 0,
    shuffle: false,
    repeat: false,
    muted: false,
    queueIds: [],
    queueIndex: -1,
  };
}

export function StoreProvider({
  api,
  children,
  config,
}: {
  api: Api;
  children: React.ReactNode;
  config?: Partial<Config>;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // True while a manual refresh (re-discover + atomic re-fetch) is in flight, so
  // the refresh button can show a spinner. Transient UI only — not in the reducer.
  const [refreshing, setRefreshing] = useState(false);

  // roomId -> true while a volume write for that room is in flight or queued, so the
  // slider thumb can show a loading spinner until the change is applied. Transient
  // UI only. Driven off the volWrite throttle + volInFlight counter below.
  const [volSettling, setVolSettling] = useState<Record<string, boolean>>({});
  const volInFlight = useRef(new Map<string, number>());

  // Refs so the long-lived poll/effect closures always see the latest state +
  // dispatch without re-subscribing every render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // The "focused" group (the rooms-first desktop view the user is looking at, or
  // the group they just acted on). Its now-playing polls at the fast cadence;
  // every other group is polled round-robin in the background. Decoupled from
  // activeGroupId so the desktop never needs a global active-group singleton.
  const focusedGroupId = useRef('');
  // Single-flight per group: a groupId is in this set while its now-playing
  // request is outstanding, so overlapping ticks never double-fire one group.
  const inFlightNp = useRef(new Set<string>());
  // Separate single-flight for the ATOMIC group refresh (now-playing + all member
  // volumes/mutes in one shot). Kept distinct from inFlightNp so a cheap 1s np
  // poll never blocks the user's manual/focus atomic refresh, or vice-versa.
  const inFlightRefresh = useRef(new Set<string>());
  // Round-robin cursor over non-focused groups for background now-playing polls.
  const rrCursor = useRef(0);
  // Per-room volume-write throttle. Dragging a slider fires many scrub events per
  // second; we update the UI optimistically on every one but send at most one
  // setVolume to the speaker per VOLUME_WRITE_MS (leading + trailing latest), so we
  // don't flood the LAN and lag the drag. `latest` is the most recent target; a
  // running `timer` means the throttle window is open.
  const volWrite = useRef(new Map<string, { latest: number; pending: boolean; timer: ReturnType<typeof setTimeout> }>());
  // When a room's volume was last written locally (ms). The volume poll skips a
  // room inside VOLUME_QUIET_MS of a write so a slightly-stale real reading can't
  // yank the thumb back mid- or just-after a drag.
  const lastVolWriteAt = useRef(new Map<string, number>());

  // --- side-effect helpers ------------------------------------------------

  // Runs an optimistic patch, fires the Api call, and reverts on rejection by
  // re-reconciling from the speaker (no silent swallow — the revert IS the
  // surfaced error path; topology stays ready, the real value re-polls in).
  const optimistic = useRef(
    async (
      patch: Action,
      call: () => Promise<void>,
      reconcile: () => Promise<void>,
    ) => {
      dispatchRef.current(patch);
      try {
        await call();
      } catch {
        // Revert by re-reading the truth from the speaker.
        try {
          await reconcile();
        } catch {
          // If even the reconcile fails the network is down; a topology poll
          // will surface it. Nothing to silently swallow here.
        }
      }
    },
  );

  // Polls ONE group's now-playing. Single-flight: if a request for this group is
  // already outstanding it is skipped (the in-flight one will dispatch). The flag
  // is always cleared in `finally` so a thrown poll can never strand a group.
  const pollNowPlaying = useRef(async (groupId: string) => {
    if (groupId === '') return;
    if (inFlightNp.current.has(groupId)) return;
    inFlightNp.current.add(groupId);
    try {
      const np = await api.getNowPlaying(groupId);
      dispatchRef.current({ type: 'nowPlaying', groupId, np });
    } catch {
      // A transient now-playing failure is bounded by the next poll; do not
      // tear down the whole topology for it.
    } finally {
      inFlightNp.current.delete(groupId);
    }
  });

  // ATOMICALLY refresh ONE group: fetch its now-playing AND every member's
  // volume/mute together, then apply the WHOLE thing in a single `groupSnapshot`
  // dispatch — or, if ANY of those fetches reject, apply NOTHING (the last good
  // snapshot stays). "Either it all loads and is accurate, or not at all." Used on
  // focus (opening a room) and by the manual refresh. Single-flight per group.
  const refreshGroup = useRef(async (gid: string) => {
    if (gid === '') return;
    if (inFlightRefresh.current.has(gid)) return;
    const g = stateRef.current.groups.find((x) => x.id === gid);
    if (!g) return;
    inFlightRefresh.current.add(gid);
    try {
      const [np, rooms] = await Promise.all([
        api.getNowPlaying(gid),
        Promise.all(
          g.roomIds.map(async (roomId) => {
            const [volume, muted] = await Promise.all([
              api.getVolume(roomId),
              api.getMute(roomId),
            ]);
            return { roomId, volume, muted };
          }),
        ),
      ]);
      // We only reach here if EVERY fetch above resolved — so the snapshot is
      // internally consistent. A partial result is never dispatched.
      dispatchRef.current({ type: 'groupSnapshot', groupId: gid, np, rooms });
    } catch {
      // All-or-nothing: keep the last good snapshot. Bounded by the next poll or
      // a manual refresh — never paints a half-loaded room.
    } finally {
      inFlightRefresh.current.delete(gid);
    }
  });

  // Fetches a group's play queue and reconciles it into the store. Best-effort:
  // a transient failure keeps the last queue (bounded by the next focus/refresh).
  const fetchQueue = useRef(async (gid: string) => {
    if (gid === '') return;
    try {
      const items = await api.getQueue(gid);
      dispatchRef.current({ type: 'groupQueue', groupId: gid, items });
    } catch {
      // Bounded by the next focus/refresh; do not tear down the UI for it.
    }
  });

  // Background now-playing: poll exactly ONE non-focused group per tick,
  // advancing a round-robin cursor — so every card refreshes, but request volume
  // stays bounded (one extra getNowPlaying per BACKGROUND_NP_POLL_MS) regardless
  // of how many groups exist.
  const pollNextBackgroundGroup = useRef(() => {
    const s = stateRef.current;
    const others = s.groups.filter((g) => g.id !== focusedGroupId.current);
    if (others.length === 0) return;
    if (rrCursor.current >= others.length) rrCursor.current = 0;
    const g = others[rrCursor.current];
    rrCursor.current += 1;
    void pollNowPlaying.current(g.id);
  });

  // Polls volume + mute for EVERY room across all groups, so every card's volume
  // slider reflects the real speaker (not just the focused group's rooms).
  const pollVolumes = useRef(async () => {
    const s = stateRef.current;
    const roomIds = new Set<string>();
    for (const g of s.groups) for (const r of g.roomIds) roomIds.add(r);
    for (const roomId of roomIds) {
      // Skip a room we just wrote to: a slightly-stale real reading here would snap
      // the slider back during or right after a drag. The next poll reconciles it.
      if (Date.now() - (lastVolWriteAt.current.get(roomId) ?? 0) < VOLUME_QUIET_MS) continue;
      try {
        const [volume, muted] = await Promise.all([api.getVolume(roomId), api.getMute(roomId)]);
        dispatchRef.current({ type: 'roomVolume', roomId, volume });
        dispatchRef.current({ type: 'roomMute', roomId, muted });
      } catch {
        // Bounded by the next volume poll.
      }
    }
  });

  const loadTopology = useRef(async (mode: 'load' | 'refresh') => {
    // Only the INITIAL load shows the "Finding your speakers" loading state. The
    // ~10s background refresh must NOT flip status back to 'loading' (that blanked
    // the sidebar every poll while the now-playing chips kept showing rooms — the
    // two views disagreeing on the same shared store). A refresh updates silently
    // on success and keeps the current topology on failure (bounded by next poll).
    if (mode === 'load') dispatchRef.current({ type: 'topologyLoading' });
    try {
      const topology = mode === 'load' ? await api.loadTopology() : await api.refreshTopology();
      dispatchRef.current({ type: 'topologyReady', topology });
      // Prime now-playing for EVERY group right away so the rooms grid shows each
      // group's real state on first paint (not just the focused one).
      await Promise.all(topology.groups.map((g) => pollNowPlaying.current(g.id)));
      await pollVolumes.current();
    } catch (err) {
      // Surface the failure only for the first load; a transient refresh miss
      // (SSDP/discovery is racy) must not wipe an already-ready UI.
      if (mode === 'load') dispatchRef.current({ type: 'topologyError', message: (err as Error).message });
    }
  });

  // --- bootstrap + polling loops ------------------------------------------

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadTopology.current('load');
    })();

    // Fast: the focused group (falls back to the first group until something is
    // focused, so a single-group household still updates at 1s).
    const npTimer = setInterval(() => {
      if (cancelled) return;
      const focused = focusedGroupId.current || stateRef.current.groups[0]?.id || '';
      void pollNowPlaying.current(focused);
    }, NOWPLAYING_POLL_MS);

    // Slower: one non-focused group per tick, round-robin.
    const bgNpTimer = setInterval(() => {
      if (cancelled) return;
      pollNextBackgroundGroup.current();
    }, BACKGROUND_NP_POLL_MS);

    const tickTimer = setInterval(() => {
      if (cancelled) return;
      dispatchRef.current({ type: 'tick' });
    }, TICK_MS);

    const volTimer = setInterval(() => {
      if (cancelled) return;
      void pollVolumes.current();
    }, VOLUME_POLL_MS);

    const topoTimer = setInterval(() => {
      if (cancelled) return;
      const st = stateRef.current.topologyStatus;
      // When ready, silently refresh. When the initial discovery failed (SSDP is
      // racy), keep retrying a full load so a transient miss self-heals instead
      // of leaving the UI stuck on the error/connect screen.
      if (st === 'ready') void loadTopology.current('refresh');
      else if (st === 'error') void loadTopology.current('load');
    }, TOPOLOGY_POLL_MS);

    // The FOCUSED group's queue. Sonos has no cheap push for this, so we poll —
    // slowly, since the queue changes only when someone (us or the Sonos app)
    // adds/removes/reorders. The reducer drops a no-op when the queue is unchanged,
    // so this is free when nothing happened (and won't disturb an in-progress drag).
    const queueTimer = setInterval(() => {
      if (cancelled) return;
      const focused = focusedGroupId.current || stateRef.current.groups[0]?.id || '';
      if (focused) void fetchQueue.current(focused);
    }, QUEUE_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(npTimer);
      clearInterval(bgNpTimer);
      clearInterval(tickTimer);
      clearInterval(volTimer);
      clearInterval(topoTimer);
      clearInterval(queueTimer);
    };
    // api is stable for the provider's lifetime; do not re-subscribe on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- derived helpers + actions ------------------------------------------

  const value = useMemo<Store>(() => {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    const getTrack = (id: string): Track => state.tracks[id] ?? placeholderTrack();

    const activeGroup = (): Group =>
      state.groups.find((g) => g.id === state.activeGroupId) ?? state.groups[0] ?? placeholderGroup();

    const activeTrack = (): Track => getTrack(activeGroup().trackId);

    const roomName = (id: string) => state.rooms.find((r) => r.id === id)?.name ?? id;

    const groupName = (g: Group) => {
      const names = g.roomIds.map(roomName);
      if (!names.length) return 'Empty';
      return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
    };

    // The group's volume (0–100), or null when it isn't backed by a real reading
    // from EVERY member speaker (none fetched yet, or a fetch failed). null means
    // "hide the control" — we never show a guessed slider the user could drag,
    // because the write sends an absolute volume from where they tapped relative
    // to that fake position, which is how an unknown room could jump to max.
    // A genuine 0 stays 0; only undefined readings make the group null.
    const groupVol = (g: Group): number | null => {
      if (!g.roomIds.length) return null;
      if (g.roomIds.some((r) => state.roomVol[r] === undefined)) return null;
      return Math.round(
        g.roomIds.reduce((acc, r) => acc + state.roomVol[r], 0) / g.roomIds.length,
      );
    };

    // A room is "settling" while a write is in flight OR a throttle window is open
    // (more paced writes may follow). Recompute and only setState on a transition so
    // we don't re-render on every paced send.
    const syncSettling = (roomId: string) => {
      const busy = (volInFlight.current.get(roomId) ?? 0) > 0 || volWrite.current.has(roomId);
      setVolSettling((prev) => {
        if (!!prev[roomId] === busy) return prev;
        const next = { ...prev };
        if (busy) next[roomId] = true;
        else delete next[roomId];
        return next;
      });
    };

    // Push one paced setVolume to the speaker, reverting (re-read) only on failure.
    // The optimistic UI update is done by the caller on every scrub; this is just
    // the network write, so it carries no optimistic dispatch of its own.
    const sendVolume = (roomId: string, v: number) => {
      lastVolWriteAt.current.set(roomId, Date.now());
      volInFlight.current.set(roomId, (volInFlight.current.get(roomId) ?? 0) + 1);
      syncSettling(roomId);
      void (async () => {
        try {
          await api.setVolume(roomId, v);
        } catch {
          try {
            const real = await api.getVolume(roomId);
            dispatchRef.current({ type: 'roomVolume', roomId, volume: real });
          } catch {
            // Bounded by the next volume poll.
          }
        } finally {
          volInFlight.current.set(roomId, Math.max(0, (volInFlight.current.get(roomId) ?? 1) - 1));
          syncSettling(roomId);
        }
      })();
    };

    const setVolForRooms = (roomIds: string[], frac: number) => {
      const v = Math.max(0, Math.min(100, Math.round(frac * 100)));
      for (const roomId of roomIds) {
        // Immediate, network-free UI update so the fill tracks the thumb smoothly.
        dispatchRef.current({ type: 'setRoomVolOptimistic', roomId, volume: v });
        // Pace the actual speaker write: send the leading edge now, then at most one
        // more per VOLUME_WRITE_MS carrying the latest value (incl. a trailing send
        // after the drag stops), instead of one SOAP call per scrub event.
        const slot = volWrite.current.get(roomId);
        if (slot) {
          slot.latest = v;
          slot.pending = true;
          continue;
        }
        sendVolume(roomId, v);
        const tick = () => {
          const s = volWrite.current.get(roomId);
          if (s && s.pending) {
            s.pending = false;
            sendVolume(roomId, s.latest);
            s.timer = setTimeout(tick, VOLUME_WRITE_MS);
          } else {
            volWrite.current.delete(roomId);
            syncSettling(roomId);
          }
        };
        volWrite.current.set(roomId, { latest: v, pending: false, timer: setTimeout(tick, VOLUME_WRITE_MS) });
        syncSettling(roomId);
      }
    };

    // The single source of transport behaviour. Both the GROUP-TARGETED
    // `groupControls(gid)` and the legacy active-group actions build on this, so
    // there is exactly ONE optimistic+revert implementation. It takes a Group
    // captured from the CURRENT `state` (this useMemo re-runs on every state
    // change), so a control never acts on a stale group. Acting on a group also
    // FOCUSES it, so its now-playing snaps to the fast cadence.
    const controlsFor = (g: Group): GroupControls => {
      const touch = () => { focusedGroupId.current = g.id; };
      return {
        togglePlay: () => {
          if (g.id === '') return;
          touch();
          const next = !g.isPlaying;
          void optimistic.current(
            { type: 'setPlayingOptimistic', groupId: g.id, isPlaying: next },
            () => (next ? api.play(g.id) : api.pause(g.id)),
            () => pollNowPlaying.current(g.id),
          );
        },
        next: () => {
          if (g.id === '') return;
          touch();
          void (async () => {
            try {
              await api.next(g.id);
            } finally {
              await pollNowPlaying.current(g.id);
            }
          })();
        },
        prev: () => {
          if (g.id === '') return;
          touch();
          void (async () => {
            try {
              await api.previous(g.id);
            } finally {
              await pollNowPlaying.current(g.id);
            }
          })();
        },
        seek: (frac: number) => {
          if (g.id === '') return;
          touch();
          const tr = getTrack(g.trackId);
          if (tr.dur <= 0) return; // no scrubbing a live stream
          const sec = Math.max(0, Math.min(tr.dur, Math.round(frac * tr.dur)));
          void optimistic.current(
            { type: 'setProgressOptimistic', groupId: g.id, progress: sec },
            () => api.seek(g.id, sec),
            () => pollNowPlaying.current(g.id),
          );
        },
        setVolume: (frac: number) => {
          if (g.id === '') return;
          touch();
          setVolForRooms(g.roomIds, frac);
        },
        toggleMute: () => {
          if (g.id === '') return;
          touch();
          const next = !g.muted;
          for (const roomId of g.roomIds) {
            void optimistic.current(
              { type: 'setRoomMuteOptimistic', roomId, muted: next },
              () => api.setMute(roomId, next),
              async () => {
                const real = await api.getMute(roomId);
                dispatchRef.current({ type: 'roomMute', roomId, muted: real });
              },
            );
          }
        },
        setShuffle: (shuffle: boolean) => {
          if (g.id === '') return;
          touch();
          void optimistic.current(
            { type: 'setShuffleOptimistic', groupId: g.id, shuffle },
            () => api.setShuffle(g.id, shuffle),
            () => pollNowPlaying.current(g.id),
          );
        },
        setRepeat: (repeat: boolean) => {
          if (g.id === '') return;
          touch();
          const mode: RepeatMode = repeat ? 'all' : 'none';
          void optimistic.current(
            { type: 'setRepeatOptimistic', groupId: g.id, repeat },
            () => api.setRepeat(g.id, mode),
            () => pollNowPlaying.current(g.id),
          );
        },
      };
    };

    // Group-targeted entry point: resolve the group fresh from current state so
    // the returned controls always act on the live group (or no-op for unknown).
    const groupControls = (gid: string): GroupControls =>
      controlsFor(state.groups.find((g) => g.id === gid) ?? placeholderGroup());

    return {
      state,
      config: cfg,
      rooms: state.rooms,
      getTrack,
      activeGroup,
      activeTrack,
      roomName,
      groupName,
      groupVol,
      volumeSettling: (g: Group) => g.roomIds.some((r) => volSettling[r]),
      isLiked: (id: string) => !!state.liked[id],

      groupControls,
      // Opening a room ATOMICALLY loads it (now-playing + volumes + mutes in one
      // snapshot) so it never shows half-loaded, then the 1s poll keeps it fresh.
      // Also pull its queue so the detail pane can show what's up next.
      focusGroup: (gid: string) => {
        focusedGroupId.current = gid;
        void refreshGroup.current(gid);
        void fetchQueue.current(gid);
      },

      queueFor: (gid: string) => state.queues[gid] ?? [],

      // Queue edits go to the SPEAKER and we re-read from it — the Sonos queue is
      // the source of truth, never an optimistic local splice. The re-fetch runs
      // in `finally` so a failure still resyncs the UI to the speaker's real state.
      clearQueue: (gid: string) => {
        if (gid === '') return;
        void (async () => {
          try {
            await api.clearQueue(gid);
          } finally {
            await fetchQueue.current(gid);
          }
        })();
      },
      reorderQueue: (gid: string, fromIndex: number, toIndex: number) => {
        if (gid === '' || fromIndex === toIndex) return;
        void (async () => {
          try {
            await api.reorderQueue(gid, fromIndex, toIndex);
          } finally {
            await fetchQueue.current(gid);
          }
        })();
      },

      // Spotify search is imperative request/response (not polled state): the
      // panel calls these and holds its own result list. Errors PROPAGATE so the
      // panel can show "not linked" / failures (no silent swallow).
      isSpotifyLinked: () => api.isSpotifyLinked(),
      startSpotifyLink: (roomId: string) => api.startSpotifyLink(roomId),
      pollSpotifyLink: () => api.pollSpotifyLink(),
      searchSpotify: (query: string, kind: SpotifySearchKind) => api.searchSpotify(query, kind),
      enqueueSearchItem: async (gid: string, item: ApiSearchItem) => {
        if (gid === '') throw new Error('no group selected to add to');
        await api.enqueueSearchItem(gid, item);
        // Add-to-queue does not change playback — only re-read the queue.
        await fetchQueue.current(gid);
      },
      playSearchItem: async (gid: string, item: ApiSearchItem) => {
        if (gid === '') throw new Error('no group selected to play on');
        await api.playSearchItem(gid, item);
        // Play-now changes the current track + queue: focus + atomic refresh + requeue.
        focusedGroupId.current = gid;
        await refreshGroup.current(gid);
        await fetchQueue.current(gid);
      },

      refresh: () => {
        void (async () => {
          setRefreshing(true);
          try {
            // Re-discover (the connection is flaky) then atomically re-fetch the
            // group the user is looking at.
            await loadTopology.current('refresh');
            const target = focusedGroupId.current || stateRef.current.groups[0]?.id || '';
            if (target) {
              await refreshGroup.current(target);
              await fetchQueue.current(target);
            }
          } finally {
            setRefreshing(false);
          }
        })();
      },
      refreshing,

      // Legacy active-group actions — delegate to the same factory, acting on the
      // active group resolved at call time (back-compat for the mobile UI).
      togglePlay: () => controlsFor(activeGroup()).togglePlay(),
      next: () => controlsFor(activeGroup()).next(),
      prev: () => controlsFor(activeGroup()).prev(),
      toggleShuffle: () => { const g = activeGroup(); controlsFor(g).setShuffle(!g.shuffle); },
      toggleRepeat: () => { const g = activeGroup(); controlsFor(g).setRepeat(!g.repeat); },
      toggleMute: () => controlsFor(activeGroup()).toggleMute(),

      toggleLike: (id: string) => dispatchRef.current({ type: 'toggleLike', id }),

      // Picking arbitrary tracks is deferred — keep the signature, do nothing.
      selectTrack: (_id: string) => {},

      seek: (frac: number) => controlsFor(activeGroup()).seek(frac),

      setActiveVol: (frac: number) => setVolForRooms(activeGroup().roomIds, frac),

      setGroupVol: (gid: string, frac: number) => {
        const g = state.groups.find((x) => x.id === gid);
        if (!g) return;
        setVolForRooms(g.roomIds, frac);
      },

      toggleRoomInGroup: (gid: string, roomId: string) => {
        const g = state.groups.find((x) => x.id === gid);
        if (!g) return;
        const isMember = g.roomIds.includes(roomId);
        void (async () => {
          try {
            if (isMember) {
              if (g.roomIds.length <= 1) return; // a group keeps at least one room
              await api.leaveGroup(roomId);
            } else {
              const coordUuid = state.coordinatorUuid[gid];
              if (!coordUuid) return;
              await api.joinGroup(roomId, coordUuid);
            }
          } finally {
            await loadTopology.current('refresh');
          }
        })();
      },

      startGroup: (roomId: string) => {
        void (async () => {
          try {
            await api.startGroup(roomId);
          } finally {
            await loadTopology.current('refresh');
          }
        })();
      },

      selectGroup: (gid: string) => {
        focusedGroupId.current = gid;
        dispatchRef.current({ type: 'selectGroup', gid });
        void pollNowPlaying.current(gid);
      },
    };
  }, [state, config, api, refreshing, volSettling]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

/** mm:ss formatter (kept on the store surface; the UI imports it from here). */
export function fmt(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return m + ':' + String(s).padStart(2, '0');
}
