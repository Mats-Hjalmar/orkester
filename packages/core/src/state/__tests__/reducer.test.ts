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

  it('empty title/artist maps to the placeholder track (dur 0)', () => {
    let s = reducer(initialState(), { type: 'topologyReady', topology: TOPO });
    s = reducer(s, {
      type: 'nowPlaying',
      groupId: 'g1',
      np: { ...NP, title: '', artist: '', durationSeconds: 0 },
    });
    expect(s.groups[0].trackId).toBe(PLACEHOLDER_TRACK_ID);
    expect(s.tracks[s.groups[0].trackId].dur).toBe(0);
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
