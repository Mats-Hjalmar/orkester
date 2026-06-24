import React, { createContext, useContext, useEffect, useReducer, useMemo, useRef } from 'react';
import { Config, Group, MView, Track } from './types';
import { LIBRARY, ROOMS } from './library';

// ----------------------------------------------------------------------------
// State shape
// ----------------------------------------------------------------------------
interface State {
  mView: MView;
  liked: Record<string, boolean>;
  roomVol: Record<string, number>; // roomId -> 0..100
  groups: Group[];
  activeGroupId: string;
  nextGroupId: number;
}

const initialState: State = {
  mView: 'nowplaying',
  liked: { t1: true, t3: true },
  roomVol: { living: 40, kitchen: 26, studio: 44, bedroom: 30, patio: 20, bath: 15 },
  groups: [
    { id: 'g1', roomIds: ['living', 'kitchen', 'studio'], trackId: 't1', isPlaying: true, progress: 74, shuffle: false, repeat: false, muted: false, queueIds: ['t2', 't5', 't7', 't4', 't8'] },
    { id: 'g2', roomIds: ['bedroom'], trackId: 't6', isPlaying: true, progress: 38, shuffle: false, repeat: false, muted: false, queueIds: ['t3', 't8', 't2'] },
  ],
  activeGroupId: 'g1',
  nextGroupId: 3,
};

// ----------------------------------------------------------------------------
// Pure helpers — no silent fallbacks: a missing id is a real bug, so throw.
// ----------------------------------------------------------------------------
const trackById = (id: string): Track => {
  const t = LIBRARY.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown track id: ${id}`);
  return t;
};

const advance = (g: Group): Group => {
  const q = g.queueIds.slice();
  if (q.length) {
    const nid = q.shift()!;
    return { ...g, trackId: nid, progress: 0, queueIds: q };
  }
  return { ...g, isPlaying: false, progress: 0 };
};

const patchActive = (s: State, patch: Partial<Group>): Group[] =>
  s.groups.map((g) => (g.id === s.activeGroupId ? { ...g, ...patch } : g));

const activeOf = (s: State): Group => {
  const g = s.groups.find((x) => x.id === s.activeGroupId) ?? s.groups[0];
  if (!g) throw new Error('No groups exist');
  return g;
};

const applyGroupVol = (s: State, gid: string, frac: number): State => {
  const g = s.groups.find((x) => x.id === gid);
  if (!g) return s;
  const v = Math.round(frac * 100);
  const roomVol = { ...s.roomVol };
  g.roomIds.forEach((r) => { roomVol[r] = v; });
  return { ...s, roomVol, groups: s.groups.map((x) => (x.id === gid ? { ...x, muted: false } : x)) };
};

// ----------------------------------------------------------------------------
// Actions / reducer
// ----------------------------------------------------------------------------
type Action =
  | { type: 'tick' }
  | { type: 'togglePlay' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'toggleShuffle' }
  | { type: 'toggleRepeat' }
  | { type: 'toggleMute' }
  | { type: 'toggleLike'; id: string }
  | { type: 'selectTrack'; id: string }
  | { type: 'seek'; frac: number }
  | { type: 'setActiveVol'; frac: number }
  | { type: 'setGroupVol'; gid: string; frac: number }
  | { type: 'toggleRoomInGroup'; gid: string; roomId: string }
  | { type: 'startGroup'; roomId: string }
  | { type: 'selectGroup'; gid: string }
  | { type: 'setView'; view: MView };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'tick': {
      let changed = false;
      const groups = s.groups.map((g) => {
        if (!g.isPlaying) return g;
        changed = true;
        const tr = trackById(g.trackId);
        const p = g.progress + 1;
        return p >= tr.dur ? advance(g) : { ...g, progress: p };
      });
      return changed ? { ...s, groups } : s;
    }
    case 'togglePlay':
      return { ...s, groups: patchActive(s, { isPlaying: !activeOf(s).isPlaying }) };
    case 'next':
      return { ...s, groups: s.groups.map((g) => (g.id === s.activeGroupId ? advance(g) : g)) };
    case 'prev':
      return { ...s, groups: patchActive(s, { progress: 0 }) };
    case 'toggleShuffle':
      return { ...s, groups: patchActive(s, { shuffle: !activeOf(s).shuffle }) };
    case 'toggleRepeat':
      return { ...s, groups: patchActive(s, { repeat: !activeOf(s).repeat }) };
    case 'toggleMute':
      return { ...s, groups: patchActive(s, { muted: !activeOf(s).muted }) };
    case 'toggleLike':
      return { ...s, liked: { ...s.liked, [a.id]: !s.liked[a.id] } };
    case 'selectTrack':
      return {
        ...s,
        groups: s.groups.map((g) =>
          g.id === s.activeGroupId
            ? { ...g, trackId: a.id, progress: 0, isPlaying: true, queueIds: g.queueIds.filter((x) => x !== a.id) }
            : g
        ),
      };
    case 'seek': {
      const tr = trackById(activeOf(s).trackId);
      return { ...s, groups: patchActive(s, { progress: a.frac * tr.dur }) };
    }
    case 'setActiveVol':
      return applyGroupVol(s, s.activeGroupId, a.frac);
    case 'setGroupVol':
      return applyGroupVol(s, a.gid, a.frac);
    case 'toggleRoomInGroup': {
      const g = s.groups.find((x) => x.id === a.gid);
      if (!g) return s;
      const isMember = g.roomIds.includes(a.roomId);
      let groups: Group[];
      if (isMember) {
        if (g.roomIds.length <= 1) return s; // a group keeps at least one room
        groups = s.groups.map((x) => (x.id === a.gid ? { ...x, roomIds: x.roomIds.filter((r) => r !== a.roomId) } : x));
      } else {
        groups = s.groups
          .map((x) => {
            if (x.id === a.gid) return { ...x, roomIds: [...x.roomIds, a.roomId] };
            if (x.roomIds.includes(a.roomId)) return { ...x, roomIds: x.roomIds.filter((r) => r !== a.roomId) };
            return x;
          })
          .filter((x) => x.roomIds.length > 0);
      }
      let activeGroupId = s.activeGroupId;
      if (!groups.find((x) => x.id === activeGroupId)) activeGroupId = groups[0]?.id ?? activeGroupId;
      return { ...s, groups, activeGroupId };
    }
    case 'startGroup': {
      let groups = s.groups
        .map((x) => (x.roomIds.includes(a.roomId) ? { ...x, roomIds: x.roomIds.filter((r) => r !== a.roomId) } : x))
        .filter((x) => x.roomIds.length > 0);
      const id = 'g' + s.nextGroupId;
      groups = [
        ...groups,
        { id, roomIds: [a.roomId], trackId: 't3', progress: 0, isPlaying: true, shuffle: false, repeat: false, muted: false, queueIds: ['t1', 't5', 't4'] },
      ];
      return { ...s, groups, activeGroupId: id, nextGroupId: s.nextGroupId + 1, mView: 'nowplaying' };
    }
    case 'selectGroup':
      return { ...s, activeGroupId: a.gid, mView: 'nowplaying' };
    case 'setView':
      return { ...s, mView: a.view };
    default:
      return s;
  }
}

// ----------------------------------------------------------------------------
// Context
// ----------------------------------------------------------------------------
const DEFAULT_CONFIG: Config = { accentColor: '#E4F289', coverMotif: 'sun', mobileNowDark: false };

export interface Store {
  state: State;
  config: Config;
  rooms: typeof ROOMS;
  // derived helpers
  getTrack: (id: string) => Track;
  activeGroup: () => Group;
  activeTrack: () => Track;
  roomName: (id: string) => string;
  groupName: (g: Group) => string;
  groupVol: (g: Group) => number;
  isLiked: (id: string) => boolean;
  // actions
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
  toggleMute: () => void;
  toggleLike: (id: string) => void;
  selectTrack: (id: string) => void;
  seek: (frac: number) => void;
  setActiveVol: (frac: number) => void;
  setGroupVol: (gid: string, frac: number) => void;
  toggleRoomInGroup: (gid: string, roomId: string) => void;
  startGroup: (roomId: string) => void;
  selectGroup: (gid: string) => void;
  setView: (view: MView) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children, config }: { children: React.ReactNode; config?: Partial<Config> }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // 1s playback clock: advances every playing group, auto-advancing the queue.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  useEffect(() => {
    const t = setInterval(() => dispatchRef.current({ type: 'tick' }), 1000);
    return () => clearInterval(t);
  }, []);

  const value = useMemo<Store>(() => {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const roomName = (id: string) => ROOMS.find((r) => r.id === id)?.name ?? id;
    const groupName = (g: Group) => {
      const names = g.roomIds.map(roomName);
      if (!names.length) return 'Empty';
      return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
    };
    const groupVol = (g: Group) => {
      if (!g.roomIds.length) return 0;
      return Math.round(g.roomIds.reduce((acc, r) => acc + (state.roomVol[r] || 0), 0) / g.roomIds.length);
    };
    return {
      state,
      config: cfg,
      rooms: ROOMS,
      getTrack: trackById,
      activeGroup: () => activeOf(state),
      activeTrack: () => trackById(activeOf(state).trackId),
      roomName,
      groupName,
      groupVol,
      isLiked: (id: string) => !!state.liked[id],
      togglePlay: () => dispatch({ type: 'togglePlay' }),
      next: () => dispatch({ type: 'next' }),
      prev: () => dispatch({ type: 'prev' }),
      toggleShuffle: () => dispatch({ type: 'toggleShuffle' }),
      toggleRepeat: () => dispatch({ type: 'toggleRepeat' }),
      toggleMute: () => dispatch({ type: 'toggleMute' }),
      toggleLike: (id: string) => dispatch({ type: 'toggleLike', id }),
      selectTrack: (id: string) => dispatch({ type: 'selectTrack', id }),
      seek: (frac: number) => dispatch({ type: 'seek', frac }),
      setActiveVol: (frac: number) => dispatch({ type: 'setActiveVol', frac }),
      setGroupVol: (gid: string, frac: number) => dispatch({ type: 'setGroupVol', gid, frac }),
      toggleRoomInGroup: (gid: string, roomId: string) => dispatch({ type: 'toggleRoomInGroup', gid, roomId }),
      startGroup: (roomId: string) => dispatch({ type: 'startGroup', roomId }),
      selectGroup: (gid: string) => dispatch({ type: 'selectGroup', gid }),
      setView: (view: MView) => dispatch({ type: 'setView', view }),
    };
  }, [state, config]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

// mm:ss
export function fmt(sec: number): string {
  const v = Math.max(0, Math.round(sec));
  const m = Math.floor(v / 60);
  const s = v % 60;
  return m + ':' + String(s).padStart(2, '0');
}
