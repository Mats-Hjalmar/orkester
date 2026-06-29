// SonosApi — the real engine-backed Api, wrapping a SonosClient.
//
// Bridges the UI/store id space (room = RoomRef.handle, group = engine Group.id)
// onto the engine's ResolvedRoom model, parses/formats the position strings, and
// synthesizes nothing here (art is synthesized in the reducer). Holds the last
// Household so handle/id lookups resolve without a re-fetch. node-free: it talks
// only through the SonosClient, whose transports are injected by the host.
//
// No silent fallbacks: an unknown room/group id THROWS (a stale id is a real
// bug); a discovery/topology failure propagates out of load/refresh.

import type {
  Api,
  ApiGroup,
  ApiNowPlaying,
  ApiQueueItem,
  ApiRoom,
  ApiSearchItem,
  ApiSpotifyLink,
  ApiTopology,
  CredentialStore,
  SpotifySearchKind,
} from '../api';
import type { RepeatMode } from '../engine';
import {
  type Household,
  type Member,
  type Group as SonosGroupT,
  type ResolvedRoom,
  type MusicServiceInfo,
  type AppLink,
  coordinatorMember,
  groupName as engineGroupName,
  parseRelTime,
  rooms as engineRooms,
  serviceSeed,
  spotifyEnqueueItem,
  NotLinkedError,
} from '../engine';
// Import the SonosClient type directly from its module (not the barrel): it is
// used only as a type here, and reexporting the class through ../engine creates
// a circular-chunk warning in the tsup/rollup build.
import type { SonosClient } from '../engine/client';

/** How long to listen for SSDP on the initial discovery, in ms. */
const DISCOVER_WAIT_MS = 3000;

// Spotify's SMAPI search categories are SINGULAR ids (artist/album/track/
// playlist), discovered via getMetadata("search"); the plural user-facing
// SpotifySearchKind maps onto them. Sending the plural form returns a
// "Action not found" fault. (Spotify-specific; we only support Spotify today.)
const SPOTIFY_SEARCH_CATEGORY: Record<SpotifySearchKind, string> = {
  tracks: 'track',
  albums: 'album',
  artists: 'artist',
  playlists: 'playlist',
};

export class SonosApi implements Api {
  private readonly client: SonosClient;
  /** The most-recent topology + a responder base for cheap refresh. */
  private household: Household | undefined;
  /** roomId (handle) -> { member, group } for the current household. */
  private roomIndex = new Map<string, ResolvedRoom>();
  /** groupId -> SonosGroup for the current household. */
  private groupIndex = new Map<string, SonosGroupT>();
  /** Persists the Spotify token; undefined disables the Spotify methods. */
  private readonly credentials: CredentialStore | undefined;
  /** In-progress device link (set by startSpotifyLink, consumed by pollSpotifyLink). */
  private pendingLink:
    | { service: MusicServiceInfo; householdId: string; link: AppLink }
    | undefined;

  constructor(client: SonosClient, credentials?: CredentialStore) {
    this.client = client;
    this.credentials = credentials;
  }

  /** The injected store, or a thrown error when Spotify support wasn't wired. */
  private requireCredentials(): CredentialStore {
    if (!this.credentials) {
      throw new Error('Spotify support is not configured (no CredentialStore injected)');
    }
    return this.credentials;
  }

  // --- topology ---

  async loadTopology(): Promise<ApiTopology> {
    const household = await this.client.loadHousehold(DISCOVER_WAIT_MS);
    return this.index(household);
  }

  async refreshTopology(): Promise<ApiTopology> {
    // Re-discovering is the only portable way without caching a base here; the
    // client's loadHousehold discovers + fetches in one step. (A future optimization
    // could cache the responder base; correctness first.)
    const household = await this.client.loadHousehold(DISCOVER_WAIT_MS);
    return this.index(household);
  }

  /** Indexes a household into the id maps and projects it to an ApiTopology. */
  private index(household: Household): ApiTopology {
    this.household = household;
    this.roomIndex.clear();
    this.groupIndex.clear();

    const refs = engineRooms(household);
    const rooms: ApiRoom[] = refs.map((r) => {
      this.roomIndex.set(r.handle, { member: r.member, group: r.group });
      return { id: r.handle, name: r.member.zoneName };
    });

    const groups: ApiGroup[] = household.groups.map((g) => {
      this.groupIndex.set(g.id, g);
      // The group's rooms, as handles (only the visible ones appear in refs).
      const roomIds = refs.filter((r) => r.group.id === g.id).map((r) => r.handle);
      return {
        id: g.id,
        name: engineGroupName(g),
        roomIds,
        coordinatorUuid: g.coordinator,
      };
    });

    return { rooms, groups };
  }

  // --- id resolution ---

  private roomFor(roomId: string): ResolvedRoom {
    const r = this.roomIndex.get(roomId);
    if (!r) throw new Error(`unknown room "${roomId}"`);
    return r;
  }

  /** Resolves a group id to a ResolvedRoom anchored on the group's coordinator. */
  private groupFor(groupId: string): ResolvedRoom {
    const g = this.groupIndex.get(groupId);
    if (!g) throw new Error(`unknown group "${groupId}"`);
    const coord = coordinatorMember(g);
    return { member: coord, group: g };
  }

  // --- per active group ---

  async getNowPlaying(groupId: string): Promise<ApiNowPlaying> {
    const room = this.groupFor(groupId);
    const [np, settings] = await Promise.all([
      this.client.getNowPlaying(room),
      this.client.getPlaySettings(room),
    ]);
    return {
      isPlaying: np.state === 'PLAYING' || np.state === 'TRANSITIONING',
      title: np.title,
      artist: np.artist,
      album: np.album,
      positionSeconds: parseRelTime(np.position),
      durationSeconds: parseRelTime(np.duration),
      shuffle: settings.shuffle,
      repeat: settings.repeat,
      artUrl: np.albumArtUrl,
      queueIndex: np.queueIndex,
    };
  }

  async getQueue(groupId: string): Promise<ApiQueueItem[]> {
    const room = this.groupFor(groupId);
    const queue = await this.client.getQueue(room);
    return queue.map((q) => ({
      title: q.title,
      artist: q.artist,
      album: q.album,
      artUrl: q.albumArtUrl,
    }));
  }

  clearQueue(groupId: string): Promise<void> {
    return this.client.clearQueue(this.groupFor(groupId));
  }

  reorderQueue(groupId: string, fromIndex: number, toIndex: number): Promise<void> {
    return this.client.reorderQueue(this.groupFor(groupId), fromIndex, toIndex);
  }

  play(groupId: string): Promise<void> {
    return this.client.play(this.groupFor(groupId));
  }

  pause(groupId: string): Promise<void> {
    return this.client.pause(this.groupFor(groupId));
  }

  next(groupId: string): Promise<void> {
    return this.client.next(this.groupFor(groupId));
  }

  previous(groupId: string): Promise<void> {
    return this.client.previous(this.groupFor(groupId));
  }

  seek(groupId: string, positionSeconds: number): Promise<void> {
    return this.client.seek(this.groupFor(groupId), positionSeconds);
  }

  async setShuffle(groupId: string, shuffle: boolean): Promise<void> {
    const room = this.groupFor(groupId);
    const cur = await this.client.getPlaySettings(room);
    await this.client.setPlaySettings(room, { shuffle, repeat: cur.repeat });
  }

  async setRepeat(groupId: string, repeat: RepeatMode): Promise<void> {
    const room = this.groupFor(groupId);
    const cur = await this.client.getPlaySettings(room);
    await this.client.setPlaySettings(room, { shuffle: cur.shuffle, repeat });
  }

  // --- per room ---

  getVolume(roomId: string): Promise<number> {
    return this.client.getVolume(this.roomFor(roomId));
  }

  setVolume(roomId: string, volume: number): Promise<void> {
    return this.client.setVolume(this.roomFor(roomId), volume);
  }

  getMute(roomId: string): Promise<boolean> {
    return this.client.getMute(this.roomFor(roomId));
  }

  setMute(roomId: string, muted: boolean): Promise<void> {
    return this.client.setMute(this.roomFor(roomId), muted);
  }

  // --- grouping ---

  joinGroup(roomId: string, coordinatorUuid: string): Promise<void> {
    return this.client.joinGroup(this.roomFor(roomId), coordinatorUuid);
  }

  leaveGroup(roomId: string): Promise<void> {
    return this.client.leaveGroup(this.roomFor(roomId));
  }

  startGroup(roomId: string): Promise<void> {
    // A "start" is just detaching the room into its own standalone group.
    return this.client.leaveGroup(this.roomFor(roomId));
  }

  // --- Spotify catalog search ---

  /** How many catalog hits to request/show per search. */
  private static readonly SEARCH_LIMIT = 20;

  async isSpotifyLinked(): Promise<boolean> {
    const auth = await this.requireCredentials().load();
    return auth !== null;
  }

  async startSpotifyLink(roomId: string): Promise<ApiSpotifyLink> {
    this.requireCredentials(); // fail fast if Spotify support isn't wired
    const room = this.roomFor(roomId);
    const { service, householdId } = await this.client.findMusicService(room, 'Spotify');
    const link = await this.client.startAppLink(
      { id: service.id, endpoint: service.endpoint },
      householdId,
    );
    this.pendingLink = { service, householdId, link };
    return { regUrl: link.regUrl, linkCode: link.linkCode, showLinkCode: link.showLinkCode };
  }

  async pollSpotifyLink(): Promise<boolean> {
    const store = this.requireCredentials();
    if (!this.pendingLink) {
      throw new Error('no Spotify link in progress; call startSpotifyLink first');
    }
    const { service, householdId, link } = this.pendingLink;
    let token: { authToken: string; privateKey: string };
    try {
      token = await this.client.claimDeviceToken(
        { id: service.id, endpoint: service.endpoint },
        householdId,
        link,
      );
    } catch (err) {
      // LinkPendingError means "user hasn't authorized yet" — keep polling.
      if (err instanceof Error && err.name === 'LinkPendingError') return false;
      throw err;
    }
    await store.save({
      serviceId: service.id,
      seed: serviceSeed(service),
      endpoint: service.endpoint,
      authToken: token.authToken,
      privateKey: token.privateKey,
      householdId,
      accountSn: '1',
    });
    this.pendingLink = undefined;
    return true;
  }

  async searchSpotify(query: string, kind: SpotifySearchKind): Promise<ApiSearchItem[]> {
    const auth = await this.requireCredentials().load();
    if (auth === null) throw new NotLinkedError();

    const hits = await this.client.searchService(
      { id: auth.serviceId, endpoint: auth.endpoint },
      { authToken: auth.authToken, privateKey: auth.privateKey, householdId: auth.householdId },
      SPOTIFY_SEARCH_CATEGORY[kind],
      query,
      SonosApi.SEARCH_LIMIT,
    );

    const out: ApiSearchItem[] = [];
    for (const h of hits) {
      let enqueue;
      try {
        enqueue = spotifyEnqueueItem(h, auth.serviceId, auth.seed, auth.accountSn);
      } catch {
        // Skip item types we can't enqueue rather than failing the whole search.
        continue;
      }
      out.push({
        id: h.id,
        title: h.title,
        artist: h.artist,
        album: h.album,
        artUrl: h.artUrl,
        isContainer: h.isContainer,
        uri: enqueue.uri,
        metadata: enqueue.metadata,
      });
    }
    return out;
  }

  enqueueSearchItem(groupId: string, item: ApiSearchItem): Promise<void> {
    return this.client.enqueue(this.groupFor(groupId), { uri: item.uri, metadata: item.metadata });
  }

  playSearchItem(groupId: string, item: ApiSearchItem): Promise<void> {
    return this.client.playNow(this.groupFor(groupId), { uri: item.uri, metadata: item.metadata });
  }

  /** Exposed for tests/diagnostics: the household the maps were built from. */
  currentHousehold(): Household | undefined {
    return this.household;
  }

  /** Resolves a member by room handle (diagnostics). */
  memberFor(roomId: string): Member {
    return this.roomFor(roomId).member;
  }
}
