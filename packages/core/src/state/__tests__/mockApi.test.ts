import { describe, expect, it } from 'vitest';
import { MockApi } from '../mockApi';

describe('MockApi', () => {
  it('loads a topology with rooms + two groups', async () => {
    const api = new MockApi();
    const topo = await api.loadTopology();
    expect(topo.rooms.length).toBeGreaterThan(0);
    expect(topo.groups.length).toBe(2);
    const g1 = topo.groups.find((g) => g.id === 'g1')!;
    expect(g1.roomIds).toContain('living');
    expect(g1.coordinatorUuid).toMatch(/^RINCON_/);
  });

  it('reports now-playing with bridged seconds (duration > 0 for library tracks)', async () => {
    const api = new MockApi();
    const np = await api.getNowPlaying('g1');
    expect(np.title).not.toBe('');
    expect(np.durationSeconds).toBeGreaterThan(0);
    expect(np.isPlaying).toBe(true);
  });

  it('play/pause flips isPlaying', async () => {
    const api = new MockApi();
    await api.pause('g1');
    expect((await api.getNowPlaying('g1')).isPlaying).toBe(false);
    await api.play('g1');
    expect((await api.getNowPlaying('g1')).isPlaying).toBe(true);
  });

  it('seek clamps within the track', async () => {
    const api = new MockApi();
    await api.seek('g1', 10);
    expect((await api.getNowPlaying('g1')).positionSeconds).toBe(10);
    await api.seek('g1', 99999);
    const np = await api.getNowPlaying('g1');
    expect(np.positionSeconds).toBeLessThanOrEqual(np.durationSeconds);
  });

  it('shuffle/repeat round-trip', async () => {
    const api = new MockApi();
    await api.setShuffle('g1', true);
    await api.setRepeat('g1', 'one');
    const np = await api.getNowPlaying('g1');
    expect(np.shuffle).toBe(true);
    expect(np.repeat).toBe('one');
  });

  it('volume/mute round-trip and setVolume unmutes', async () => {
    const api = new MockApi();
    await api.setMute('living', true);
    expect(await api.getMute('living')).toBe(true);
    await api.setVolume('living', 55);
    expect(await api.getVolume('living')).toBe(55);
    expect(await api.getMute('living')).toBe(false);
  });

  it('grouping: join moves a room and refreshed topology reflects it', async () => {
    const api = new MockApi();
    const g2 = (await api.loadTopology()).groups.find((g) => g.id === 'g2')!;
    // Move bedroom (in g2) into g1.
    const g1coord = (await api.loadTopology()).groups.find((g) => g.id === 'g1')!.coordinatorUuid;
    await api.joinGroup('bedroom', g1coord);
    const topo = await api.refreshTopology();
    expect(topo.groups.find((g) => g.id === 'g1')!.roomIds).toContain('bedroom');
    // g2 had only bedroom, so it should be pruned.
    expect(topo.groups.find((g) => g.id === g2.id)).toBeUndefined();
  });

  it('startGroup detaches a room into a fresh group', async () => {
    const api = new MockApi();
    await api.startGroup('kitchen'); // kitchen was in g1
    const topo = await api.refreshTopology();
    expect(topo.groups.find((g) => g.id === 'g1')!.roomIds).not.toContain('kitchen');
    const fresh = topo.groups.find((g) => g.roomIds.length === 1 && g.roomIds[0] === 'kitchen');
    expect(fresh).toBeDefined();
  });

  it('rejects unknown ids (no silent fallback)', async () => {
    const api = new MockApi();
    await expect(api.getNowPlaying('nope')).rejects.toThrow(/unknown group/);
    await expect(api.getVolume('nope')).rejects.toThrow(/unknown room/);
  });
});
