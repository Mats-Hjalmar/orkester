// MockApi — an in-memory Api implementation backing demo / web mode (no
// speakers). It mirrors the real Api's contract (async, rejects on bad ids) so
// the store behaves identically whether wired to a speaker or to this mock, and
// `expo export --platform web` keeps working with zero hardware.
//
// It models a small household: a few rooms, two groups, each playing a track
// from MOCK_LIBRARY with locally-advancing progress. Grouping moves rooms
// between groups in memory. node-free, react-free.

import type { Api, ApiGroup, ApiNowPlaying, ApiRoom, ApiTopology } from '../api';
import type { RepeatMode } from '../engine';
import { MOCK_LIBRARY, MOCK_ROOMS, type MockTrack } from './mockLibrary';

interface MockGroup {
  id: string;
  coordinatorUuid: string;
  roomIds: string[];
  trackIndex: number;
  isPlaying: boolean;
  positionSeconds: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export class MockApi implements Api {
  private rooms: ApiRoom[];
  private roomUuid: Record<string, string> = {};
  private groups: MockGroup[];
  private roomVol: Record<string, number>;
  private roomMute: Record<string, boolean> = {};
  private nextGroupNum = 3;
  /** Wall-clock anchor so getNowPlaying advances position even without a poll loop. */
  private lastAdvance = Date.now();

  constructor() {
    this.rooms = MOCK_ROOMS.map((r) => ({ id: r.id, name: r.name }));
    for (const r of MOCK_ROOMS) this.roomUuid[r.id] = r.uuid;
    this.roomVol = { living: 40, kitchen: 26, studio: 44, bedroom: 30, patio: 20, bath: 15 };
    this.groups = [
      { id: 'g1', coordinatorUuid: this.roomUuid.living, roomIds: ['living', 'kitchen', 'studio'], trackIndex: 0, isPlaying: true, positionSeconds: 74, shuffle: false, repeat: 'none' },
      { id: 'g2', coordinatorUuid: this.roomUuid.bedroom, roomIds: ['bedroom'], trackIndex: 5, isPlaying: true, positionSeconds: 38, shuffle: false, repeat: 'none' },
    ];
  }

  /** Advances every playing group by the wall-clock elapsed since last call. */
  private advance(): void {
    const now = Date.now();
    const elapsed = Math.floor((now - this.lastAdvance) / 1000);
    if (elapsed <= 0) return;
    this.lastAdvance = now - ((now - this.lastAdvance) % 1000);
    for (const g of this.groups) {
      if (!g.isPlaying) continue;
      const tr = MOCK_LIBRARY[g.trackIndex];
      let pos = g.positionSeconds + elapsed;
      while (pos >= tr.dur) {
        pos -= tr.dur;
        g.trackIndex = (g.trackIndex + 1) % MOCK_LIBRARY.length;
      }
      g.positionSeconds = pos;
    }
  }

  private groupOrThrow(groupId: string): MockGroup {
    const g = this.groups.find((x) => x.id === groupId);
    if (!g) throw new Error(`unknown group "${groupId}"`);
    return g;
  }

  private requireRoom(roomId: string): void {
    if (!this.rooms.find((r) => r.id === roomId)) throw new Error(`unknown room "${roomId}"`);
  }

  private track(g: MockGroup): MockTrack {
    return MOCK_LIBRARY[g.trackIndex];
  }

  private groupName(g: MockGroup): string {
    const names = g.roomIds.map((id) => this.rooms.find((r) => r.id === id)?.name ?? id);
    if (!names.length) return 'Empty';
    return names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '');
  }

  private topology(): ApiTopology {
    const groups: ApiGroup[] = this.groups
      .filter((g) => g.roomIds.length > 0)
      .map((g) => ({ id: g.id, name: this.groupName(g), roomIds: [...g.roomIds], coordinatorUuid: g.coordinatorUuid }));
    return { rooms: this.rooms.map((r) => ({ ...r })), groups };
  }

  async loadTopology(): Promise<ApiTopology> {
    return this.topology();
  }

  async refreshTopology(): Promise<ApiTopology> {
    return this.topology();
  }

  async getNowPlaying(groupId: string): Promise<ApiNowPlaying> {
    this.advance();
    const g = this.groupOrThrow(groupId);
    const tr = this.track(g);
    return {
      isPlaying: g.isPlaying,
      title: tr.title,
      artist: tr.artist,
      album: tr.album,
      positionSeconds: Math.round(g.positionSeconds),
      durationSeconds: tr.dur,
      shuffle: g.shuffle,
      repeat: g.repeat,
      artUrl: '', // the mock has no real album art; the drawn cover shows
    };
  }

  async play(groupId: string): Promise<void> {
    this.groupOrThrow(groupId).isPlaying = true;
  }

  async pause(groupId: string): Promise<void> {
    this.advance();
    this.groupOrThrow(groupId).isPlaying = false;
  }

  async next(groupId: string): Promise<void> {
    const g = this.groupOrThrow(groupId);
    g.trackIndex = (g.trackIndex + 1) % MOCK_LIBRARY.length;
    g.positionSeconds = 0;
    this.lastAdvance = Date.now();
  }

  async previous(groupId: string): Promise<void> {
    const g = this.groupOrThrow(groupId);
    g.trackIndex = (g.trackIndex - 1 + MOCK_LIBRARY.length) % MOCK_LIBRARY.length;
    g.positionSeconds = 0;
    this.lastAdvance = Date.now();
  }

  async seek(groupId: string, positionSeconds: number): Promise<void> {
    const g = this.groupOrThrow(groupId);
    g.positionSeconds = Math.max(0, Math.min(this.track(g).dur, positionSeconds));
    this.lastAdvance = Date.now();
  }

  async setShuffle(groupId: string, shuffle: boolean): Promise<void> {
    this.groupOrThrow(groupId).shuffle = shuffle;
  }

  async setRepeat(groupId: string, repeat: RepeatMode): Promise<void> {
    this.groupOrThrow(groupId).repeat = repeat;
  }

  async getVolume(roomId: string): Promise<number> {
    this.requireRoom(roomId);
    return this.roomVol[roomId] ?? 0;
  }

  async setVolume(roomId: string, volume: number): Promise<void> {
    this.requireRoom(roomId);
    this.roomVol[roomId] = Math.max(0, Math.min(100, Math.round(volume)));
    this.roomMute[roomId] = false;
  }

  async getMute(roomId: string): Promise<boolean> {
    this.requireRoom(roomId);
    return !!this.roomMute[roomId];
  }

  async setMute(roomId: string, muted: boolean): Promise<void> {
    this.requireRoom(roomId);
    this.roomMute[roomId] = muted;
  }

  async joinGroup(roomId: string, coordinatorUuid: string): Promise<void> {
    this.requireRoom(roomId);
    const target = this.groups.find((g) => g.coordinatorUuid === coordinatorUuid);
    if (!target) throw new Error(`unknown coordinator "${coordinatorUuid}"`);
    this.detach(roomId);
    target.roomIds.push(roomId);
    this.prune();
  }

  async leaveGroup(roomId: string): Promise<void> {
    this.requireRoom(roomId);
    this.startGroup(roomId);
  }

  async startGroup(roomId: string): Promise<void> {
    this.requireRoom(roomId);
    this.detach(roomId);
    const id = 'g' + this.nextGroupNum++;
    this.groups.push({
      id,
      coordinatorUuid: this.roomUuid[roomId],
      roomIds: [roomId],
      trackIndex: 2,
      isPlaying: true,
      positionSeconds: 0,
      shuffle: false,
      repeat: 'none',
    });
    this.prune();
  }

  /** Removes a room from whatever group currently holds it. */
  private detach(roomId: string): void {
    for (const g of this.groups) g.roomIds = g.roomIds.filter((r) => r !== roomId);
  }

  /** Drops now-empty groups. */
  private prune(): void {
    this.groups = this.groups.filter((g) => g.roomIds.length > 0);
  }
}
