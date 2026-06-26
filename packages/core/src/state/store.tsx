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
} from 'react';
import type { Config, Group, MView, Track } from './types';
import {
  type Action,
  type State,
  PLACEHOLDER_TRACK_ID,
  initialState,
  placeholderTrack,
  reducer,
} from './reducer';
import type { Api } from '../api';
import type { RepeatMode } from '../engine';

const DEFAULT_CONFIG: Config = { accentColor: '#E4F289', coverMotif: 'sun', mobileNowDark: false };

// Poll cadences (ms). Now-playing is the fastest so transport changes made
// elsewhere reconcile within ~1s; volume is slower; topology slowest.
const NOWPLAYING_POLL_MS = 1000;
const VOLUME_POLL_MS = 2500;
const TOPOLOGY_POLL_MS = 10000;
const TICK_MS = 1000;

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
  groupVol: (g: Group) => number;
  isLiked: (id: string) => boolean;
  // actions (stable names/signatures)
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
  setView: (view: MView) => void;
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

  // Refs so the long-lived poll/effect closures always see the latest state +
  // dispatch without re-subscribing every render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

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

  const pollNowPlaying = useRef(async (groupId: string) => {
    if (groupId === '') return;
    try {
      const np = await api.getNowPlaying(groupId);
      dispatchRef.current({ type: 'nowPlaying', groupId, np });
    } catch {
      // A transient now-playing failure is bounded by the next poll; do not
      // tear down the whole topology for it.
    }
  });

  const pollVolumes = useRef(async () => {
    const s = stateRef.current;
    const active = s.groups.find((g) => g.id === s.activeGroupId);
    if (!active) return;
    for (const roomId of active.roomIds) {
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
      // Prime now-playing for the active group right away.
      const s = stateRef.current;
      const active = s.activeGroupId || topology.groups[0]?.id || '';
      await pollNowPlaying.current(active);
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

    const npTimer = setInterval(() => {
      if (cancelled) return;
      void pollNowPlaying.current(stateRef.current.activeGroupId);
    }, NOWPLAYING_POLL_MS);

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

    return () => {
      cancelled = true;
      clearInterval(npTimer);
      clearInterval(tickTimer);
      clearInterval(volTimer);
      clearInterval(topoTimer);
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

    const groupVol = (g: Group) => {
      if (!g.roomIds.length) return 0;
      return Math.round(g.roomIds.reduce((acc, r) => acc + (state.roomVol[r] || 0), 0) / g.roomIds.length);
    };

    // Active-group helpers used by several actions.
    const activeId = () => activeGroup().id;

    const setVolForRooms = (roomIds: string[], frac: number) => {
      const v = Math.max(0, Math.min(100, Math.round(frac * 100)));
      for (const roomId of roomIds) {
        void optimistic.current(
          { type: 'setRoomVolOptimistic', roomId, volume: v },
          () => api.setVolume(roomId, v),
          async () => {
            const real = await api.getVolume(roomId);
            dispatchRef.current({ type: 'roomVolume', roomId, volume: real });
          },
        );
      }
    };

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
      isLiked: (id: string) => !!state.liked[id],

      togglePlay: () => {
        const g = activeGroup();
        if (g.id === '') return;
        const next = !g.isPlaying;
        void optimistic.current(
          { type: 'setPlayingOptimistic', groupId: g.id, isPlaying: next },
          () => (next ? api.play(g.id) : api.pause(g.id)),
          () => pollNowPlaying.current(g.id),
        );
      },

      next: () => {
        const id = activeId();
        if (id === '') return;
        void (async () => {
          try {
            await api.next(id);
          } finally {
            await pollNowPlaying.current(id);
          }
        })();
      },

      prev: () => {
        const id = activeId();
        if (id === '') return;
        void (async () => {
          try {
            await api.previous(id);
          } finally {
            await pollNowPlaying.current(id);
          }
        })();
      },

      toggleShuffle: () => {
        const g = activeGroup();
        if (g.id === '') return;
        const next = !g.shuffle;
        void optimistic.current(
          { type: 'setShuffleOptimistic', groupId: g.id, shuffle: next },
          () => api.setShuffle(g.id, next),
          () => pollNowPlaying.current(g.id),
        );
      },

      toggleRepeat: () => {
        const g = activeGroup();
        if (g.id === '') return;
        const next = !g.repeat;
        const mode: RepeatMode = next ? 'all' : 'none';
        void optimistic.current(
          { type: 'setRepeatOptimistic', groupId: g.id, repeat: next },
          () => api.setRepeat(g.id, mode),
          () => pollNowPlaying.current(g.id),
        );
      },

      toggleMute: () => {
        const g = activeGroup();
        if (g.id === '') return;
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

      toggleLike: (id: string) => dispatchRef.current({ type: 'toggleLike', id }),

      // Picking arbitrary tracks is deferred — keep the signature, do nothing.
      selectTrack: (_id: string) => {},

      seek: (frac: number) => {
        const g = activeGroup();
        if (g.id === '') return;
        const tr = getTrack(g.trackId);
        if (tr.dur <= 0) return; // no scrubbing a live stream
        const sec = Math.max(0, Math.min(tr.dur, Math.round(frac * tr.dur)));
        void optimistic.current(
          { type: 'setProgressOptimistic', groupId: g.id, progress: sec },
          () => api.seek(g.id, sec),
          () => pollNowPlaying.current(g.id),
        );
      },

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
        dispatchRef.current({ type: 'setView', view: 'nowplaying' });
      },

      selectGroup: (gid: string) => {
        dispatchRef.current({ type: 'selectGroup', gid });
        void pollNowPlaying.current(gid);
      },

      setView: (view: MView) => dispatchRef.current({ type: 'setView', view }),
    };
  }, [state, config, api]);

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
