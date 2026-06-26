import { describe, expect, it } from 'vitest';
import { MockApi } from '../mockApi';
import { reducer, initialState, type State } from '../reducer';
import type { Api } from '../../api';

// The rooms-first desktop drives `groupControls(gid)` — a per-group transport.
// The store wires those to the per-group Api + optimistic reducer patches. These
// tests prove the two contracts that make in-place control correct:
//   1. Acting on one group does NOT change another group's state (no singleton).
//   2. The optimistic patch the store dispatches always carries the SAME groupId
//      the Api call targets, so the right card updates and reverts.
// We drive the same Api + reducer the provider uses, so this exercises the real
// per-group routing without a React renderer.

async function topologyState(api: Api): Promise<State> {
  const topology = await api.loadTopology();
  let s = reducer(initialState(), { type: 'topologyReady', topology });
  for (const g of topology.groups) {
    const np = await api.getNowPlaying(g.id);
    s = reducer(s, { type: 'nowPlaying', groupId: g.id, np });
  }
  return s;
}

describe('group-targeted control isolation', () => {
  it('pausing one group leaves the other group playing (per-group, no singleton)', async () => {
    const api = new MockApi();
    let s = await topologyState(api);
    expect(s.groups).toHaveLength(2);
    const [g1, g2] = s.groups;
    expect(g1.isPlaying).toBe(true);
    expect(g2.isPlaying).toBe(true);

    // Optimistic pause of g1 ONLY (what controlsFor(g1).togglePlay dispatches).
    s = reducer(s, { type: 'setPlayingOptimistic', groupId: g1.id, isPlaying: false });
    await api.pause(g1.id);

    expect(s.groups.find((g) => g.id === g1.id)!.isPlaying).toBe(false);
    expect(s.groups.find((g) => g.id === g2.id)!.isPlaying).toBe(true);

    // A real now-playing reconcile of each group confirms the speaker agrees.
    const np1 = await api.getNowPlaying(g1.id);
    const np2 = await api.getNowPlaying(g2.id);
    expect(np1.isPlaying).toBe(false);
    expect(np2.isPlaying).toBe(true);
  });

  it('setting volume on one group only touches that group\'s rooms', async () => {
    const api = new MockApi();
    const s = await topologyState(api);
    const [g1, g2] = s.groups;
    const g2Room = g2.roomIds[0];
    const before = await api.getVolume(g2Room);

    for (const roomId of g1.roomIds) await api.setVolume(roomId, 11);

    // g1 rooms changed; g2's room is untouched.
    for (const roomId of g1.roomIds) expect(await api.getVolume(roomId)).toBe(11);
    expect(await api.getVolume(g2Room)).toBe(before);
  });

  it('shuffle/repeat are per-group', async () => {
    const api = new MockApi();
    const s = await topologyState(api);
    const [g1, g2] = s.groups;
    await api.setShuffle(g1.id, true);
    await api.setRepeat(g1.id, 'all');

    expect((await api.getNowPlaying(g1.id)).shuffle).toBe(true);
    expect((await api.getNowPlaying(g1.id)).repeat).toBe('all');
    // g2 unaffected.
    expect((await api.getNowPlaying(g2.id)).shuffle).toBe(false);
    expect((await api.getNowPlaying(g2.id)).repeat).toBe('none');
  });

  it('an optimistic patch for an unknown group is a no-op on real groups', async () => {
    const api = new MockApi();
    let s = await topologyState(api);
    const before = s.groups.map((g) => g.isPlaying);
    // groupControls('') resolves the placeholder group (id ''); its actions early
    // -return, but even a stray optimistic patch with a bogus id must not mutate
    // any real group.
    s = reducer(s, { type: 'setPlayingOptimistic', groupId: '__nope__', isPlaying: false });
    expect(s.groups.map((g) => g.isPlaying)).toEqual(before);
  });
});
