import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_TRACK_ID, initialState, placeholderTrack, reducer } from '../reducer';
import type { ApiNowPlaying, ApiTopology } from '../../api';

const TOPO: ApiTopology = {
  rooms: [
    { id: 'living', name: 'Living Room' },
    { id: 'kitchen', name: 'Kitchen' },
  ],
  groups: [{ id: 'g1', name: 'Living Room +1', roomIds: ['living', 'kitchen'], coordinatorUuid: 'RINCON_X01400' }],
};

const NP: ApiNowPlaying = {
  isPlaying: true,
  title: 'Black Dog',
  artist: 'Led Zeppelin',
  album: 'IV',
  positionSeconds: 83,
  durationSeconds: 295,
  shuffle: true,
  repeat: 'all',
  artUrl: '',
  queueIndex: 0,
};

describe('reducer topology lifecycle', () => {
  it('starts idle with a placeholder track', () => {
    const s = initialState();
    expect(s.topologyStatus).toBe('idle');
    expect(s.tracks[PLACEHOLDER_TRACK_ID]).toEqual(placeholderTrack());
    expect(s.groups).toHaveLength(0);
  });

  it('topologyReady installs rooms + groups and picks an active group', () => {
    let s = initialState();
    s = reducer(s, { type: 'topologyReady', topology: TOPO });
    expect(s.topologyStatus).toBe('ready');
    expect(s.rooms).toHaveLength(2);
    expect(s.groups[0].id).toBe('g1');
    expect(s.activeGroupId).toBe('g1');
    expect(s.coordinatorUuid.g1).toBe('RINCON_X01400');
    // No now-playing yet -> placeholder track.
    expect(s.groups[0].trackId).toBe(PLACEHOLDER_TRACK_ID);
  });

  it('topologyError records the message', () => {
    const s = reducer(initialState(), { type: 'topologyError', message: 'boom' });
    expect(s.topologyStatus).toBe('error');
    expect(s.topologyError).toBe('boom');
  });
});

describe('reducer now-playing', () => {
  it('installs a synthesized track and updates group transport flags', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: NP });
    const g = s.groups[0];
    expect(g.isPlaying).toBe(true);
    expect(g.progress).toBe(83);
    expect(g.shuffle).toBe(true);
    expect(g.repeat).toBe(true); // 'all' -> true
    const tr = s.tracks[g.trackId];
    expect(tr.title).toBe('Black Dog');
    expect(tr.dur).toBe(295);
    expect(tr.coverBg).toMatch(/^#/);
  });

  it('idle (NOT playing + empty metadata) maps to the placeholder track', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'nowPlaying',
      groupId: 'g1',
      np: { ...NP, isPlaying: false, title: '', artist: '', durationSeconds: 0 },
    });
    expect(s.groups[0].trackId).toBe(PLACEHOLDER_TRACK_ID);
    expect(s.groups[0].isPlaying).toBe(false);
    expect(s.tracks[s.groups[0].trackId].dur).toBe(0);
  });

  it('PLAYING with empty metadata is NOT idle: keeps a real id, empty title (UI labels it)', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'nowPlaying',
      groupId: 'g1',
      np: { ...NP, isPlaying: true, title: '', artist: '', album: '', durationSeconds: 0 },
    });
    const g = s.groups[0];
    expect(g.isPlaying).toBe(true);
    expect(g.trackId).not.toBe(PLACEHOLDER_TRACK_ID);
    // No fabricated 'Playing' label — title stays empty; the UI presents it.
    expect(s.tracks[g.trackId].title).toBe('');
  });

  it('PLAYING with only an album falls back to the album as the label', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'nowPlaying',
      groupId: 'g1',
      np: { ...NP, isPlaying: true, title: '', artist: '', album: 'Some Station', durationSeconds: 0 },
    });
    const g = s.groups[0];
    expect(g.trackId).not.toBe(PLACEHOLDER_TRACK_ID);
    expect(s.tracks[g.trackId].title).toBe('Some Station');
  });

  it('two groups playing the same track get distinct, stable ids', () => {
    const topo2: ApiTopology = {
      rooms: [
        { id: 'living', name: 'Living Room' },
        { id: 'bedroom', name: 'Bedroom' },
      ],
      groups: [
        { id: 'g1', name: 'Living Room', roomIds: ['living'], coordinatorUuid: 'RINCON_A' },
        { id: 'g2', name: 'Bedroom', roomIds: ['bedroom'], coordinatorUuid: 'RINCON_B' },
      ],
    };
    let s = reducer(initialState(), { type: 'topologyReady', topology: topo2 });
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: NP });
    s = reducer(s, { type: 'nowPlaying', groupId: 'g2', np: NP });
    expect(s.groups[0].trackId).not.toBe(s.groups[1].trackId);
    // Stable across an identical re-poll.
    const before = s.groups[0].trackId;
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: NP });
    expect(s.groups[0].trackId).toBe(before);
  });
});

describe('reducer atomic groupSnapshot', () => {
  it('applies now-playing AND every member volume/mute in one pass', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'groupSnapshot',
      groupId: 'g1',
      np: NP,
      rooms: [
        { roomId: 'living', volume: 40, muted: false },
        { roomId: 'kitchen', volume: 55, muted: false },
      ],
    });
    const g = s.groups[0];
    // transport from np
    expect(g.isPlaying).toBe(true);
    expect(g.progress).toBe(83);
    expect(s.tracks[g.trackId].title).toBe('Black Dog');
    // per-room volume + mute from the same snapshot
    expect(s.roomVol.living).toBe(40);
    expect(s.roomVol.kitchen).toBe(55);
    expect(s.roomMute.living).toBe(false);
    // group.muted is reconciled here (polls never set it): not all muted -> false
    expect(g.muted).toBe(false);
  });

  it('group.muted is true only when EVERY member is muted', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'groupSnapshot',
      groupId: 'g1',
      np: NP,
      rooms: [
        { roomId: 'living', volume: 40, muted: true },
        { roomId: 'kitchen', volume: 55, muted: true },
      ],
    });
    expect(s.groups[0].muted).toBe(true);
  });
});

describe('reducer groupQueue', () => {
  const Q = [
    { title: 'A', artist: 'X', album: '', artUrl: '' },
    { title: 'B', artist: 'Y', album: '', artUrl: '' },
  ];

  it('stores a group queue', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'groupQueue', groupId: 'g1', items: Q });
    expect(s.queues.g1).toHaveLength(2);
    expect(s.queues.g1[0].title).toBe('A');
  });

  it('is a no-op (same state ref) when the queue is unchanged — slow poll never churns', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'groupQueue', groupId: 'g1', items: Q });
    const after = reducer(s, { type: 'groupQueue', groupId: 'g1', items: Q.map((q) => ({ ...q })) });
    expect(after).toBe(s); // identical content -> no new state
  });

  it('updates when the queue actually changes (reorder/add)', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'groupQueue', groupId: 'g1', items: Q });
    const reordered = [Q[1], Q[0]];
    const after = reducer(s, { type: 'groupQueue', groupId: 'g1', items: reordered });
    expect(after).not.toBe(s);
    expect(after.queues.g1[0].title).toBe('B');
  });
});

describe('reducer tick interpolation', () => {
  it('advances a playing finite track but holds at the end', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: { ...NP, positionSeconds: 293, durationSeconds: 295 } });
    s = reducer(s, { type: 'tick' });
    expect(s.groups[0].progress).toBe(294);
    s = reducer(s, { type: 'tick' });
    expect(s.groups[0].progress).toBe(294); // held at dur-1, poll corrects
  });

  it('a live stream (dur 0) keeps counting up', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: { ...NP, title: 'Radio', artist: 'Live', positionSeconds: 5, durationSeconds: 0 } });
    s = reducer(s, { type: 'tick' });
    expect(s.groups[0].progress).toBe(6);
  });
});

describe('reducer optimistic + reconcile', () => {
  it('optimistic playing patch is overwritten by a later nowPlaying reconcile', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    // user paused optimistically
    s = reducer(s, { type: 'setPlayingOptimistic', groupId: 'g1', isPlaying: false });
    expect(s.groups[0].isPlaying).toBe(false);
    // speaker still says playing -> reconcile wins
    s = reducer(s, { type: 'nowPlaying', groupId: 'g1', np: NP });
    expect(s.groups[0].isPlaying).toBe(true);
  });

  it('roomVolume reconcile overwrites an optimistic volume patch', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, { type: 'setRoomVolOptimistic', roomId: 'living', volume: 80 });
    expect(s.roomVol.living).toBe(80);
    s = reducer(s, { type: 'roomVolume', roomId: 'living', volume: 33 });
    expect(s.roomVol.living).toBe(33);
  });
});

describe('reducer local-only', () => {
  it('toggleLike flips local liked state', () => {
    let s = reducer(initialState(), { type: 'toggleLike', id: 't1' });
    expect(s.liked.t1).toBe(true);
    s = reducer(s, { type: 'toggleLike', id: 't1' });
    expect(s.liked.t1).toBe(false);
  });
});
