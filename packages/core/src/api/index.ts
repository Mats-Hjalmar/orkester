// The control-surface contract the engine-backed store talks to.
//
// TYPES ONLY in this barrel — zero runtime values, so it stays node-free and the
// RN-no-node guard never trips on it. The concrete implementation (SonosApi over a
// SonosClient) lives alongside in ../state and is constructed by each runtime
// (Electron main, Android in-process).
//
// The Api is the ONLY per-runtime difference: the StoreProvider drives the same
// reducer regardless of which Api it was handed.

import type { AlarmPlayMode, AlarmRecurrence, EQType, QueuePosition, RepeatMode } from '../engine';

export type { AlarmPlayMode, AlarmRecurrence, EQType };

/**
 * A room the network exposes. `id` is the engine RoomRef.handle — a stable,
 * URL-safe slug the UI uses as the room key.
 */
export interface ApiRoom {
  id: string;
  name: string;
}

/**
 * A playback group as the store sees it. `id` is the engine Group.id. `roomIds`
 * are ApiRoom ids (handles). `coordinatorUuid` is the bare RINCON UUID a join
 * targets. The store never invents these — they come straight from topology.
 */
export interface ApiGroup {
  id: string;
  name: string;
  roomIds: string[];
  coordinatorUuid: string;
}

/** A topology snapshot: every visible room + every active group. */
export interface ApiTopology {
  rooms: ApiRoom[];
  groups: ApiGroup[];
}

/**
 * Flattened now-playing for a group's coordinator. `positionSeconds` /
 * `durationSeconds` are already bridged from the speaker's "H:MM:SS" strings;
 * `durationSeconds` is 0 for live streams (NOT_IMPLEMENTED). `title`/`artist`
 * may be "" when nothing is playing.
 */
export interface ApiNowPlaying {
  isPlaying: boolean;
  title: string;
  artist: string;
  album: string;
  positionSeconds: number;
  durationSeconds: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Absolute album-art URL for the current track, "" if none. */
  artUrl: string;
  /** 0-based index of the current track in the queue, or -1 if not a queue. */
  queueIndex: number;
}

/** One track in a group's play queue. */
export interface ApiQueueItem {
  title: string;
  artist: string;
  album: string;
  /** Absolute album-art URL, "" if none. */
  artUrl: string;
}

/** A Spotify catalog search category. */
export type SpotifySearchKind = 'tracks' | 'albums' | 'artists' | 'playlists';

/**
 * One Spotify catalog search hit. `uri`/`metadata` are OPAQUE playback fields
 * (the Sonos enqueue URI + DIDL) the UI must pass back verbatim to
 * enqueueSearchItem — it should never construct or inspect them.
 */
export interface ApiSearchItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Absolute album/playlist art URL, "" if none. */
  artUrl: string;
  isContainer: boolean;
  /** Opaque: the Sonos enqueue/transport URI. */
  uri: string;
  /** Opaque: the DIDL-Lite metadata to enqueue alongside `uri`. */
  metadata: string;
}

/**
 * What the UI shows the user to complete a one-time Spotify device link: open
 * `regUrl` in a browser, optionally display `linkCode`. After the user
 * authorizes, the host polls Api.pollSpotifyLink until it resolves true.
 */
export interface ApiSpotifyLink {
  regUrl: string;
  linkCode: string;
  showLinkCode: boolean;
}

/**
 * The persisted Spotify SMAPI auth, minted by the device-link flow. Shared shape
 * across the Go CLI's auth.json and the TS CredentialStore implementations.
 */
export interface SpotifyAuth {
  /** Raw Sonos music-service id (e.g. 9) — the enqueue URI's `sid`. */
  serviceId: number;
  /** serviceId*256+7 — the SA_RINCON{seed} account seed used in DIDL metadata. */
  seed: number;
  /** The SMAPI HTTPS endpoint (the service's own URL). */
  endpoint: string;
  authToken: string;
  privateKey: string;
  householdId: string;
  /** Per-household account serial in the enqueue URI's `sn` (default "1"). */
  accountSn: string;
}

/** A room's tone settings. `bass`/`treble` are -10..10. */
export interface ApiAudioSettings {
  /** Bass level, -10..10. */
  bass: number;
  /** Treble level, -10..10. */
  treble: number;
  /** Whether loudness compensation is on. */
  loudness: boolean;
}

/**
 * One library entry (favorite, Sonos playlist, radio station, library artist /
 * album / track). `id` is browsable when `isContainer`; `uri`/`metadata` are
 * OPAQUE playback fields to pass back verbatim to playBrowseItem /
 * enqueueBrowseItem.
 */
export interface ApiBrowseItem {
  /** Library object id; pass to browse() when `isContainer`. */
  id: string;
  /** Display title (track, album, station, playlist or favorite name). */
  title: string;
  /** Artist or creator, "" if none. */
  artist: string;
  /** Album name, "" if none. */
  album: string;
  /** Absolute art URL, "" if none. */
  artUrl: string;
  /** True when the entry can be browsed into. */
  isContainer: boolean;
  /** Opaque: the parent object id. */
  parentId: string;
  /** Opaque: the DIDL upnp:class. */
  upnpClass: string;
  /** Opaque: the transport/enqueue URI ("" for a library container). */
  uri: string;
  /** Opaque: the DIDL-Lite metadata to send alongside `uri`. */
  metadata: string;
}

/** One page of a browse plus the container's total entry count. */
export interface ApiBrowseResult {
  /** The entries of this page, containers first. */
  items: ApiBrowseItem[];
  /** How many entries the container holds in total, across all pages. */
  total: number;
}

/** A household alarm. `roomId` is the room it sounds in. */
export interface ApiAlarm {
  /** The alarm's id. */
  id: number;
  /** The room (handle) the alarm sounds in. */
  roomId: string;
  /** Local start time, `HH:MM:SS`. */
  startTime: string;
  /** Play duration, `HH:MM:SS`. */
  duration: string;
  /** Which days the alarm fires on: a named schedule or `ON_` + weekday digits (0 = Sunday). */
  recurrence: AlarmRecurrence;
  /** Whether the alarm is armed. */
  enabled: boolean;
  /** What plays: `x-rincon-buzzer:0` for the chime, or a browse item's uri. */
  programUri: string;
  /** DIDL-Lite metadata for `programUri`, "" for the chime. */
  programMetadata: string;
  /** Shuffle/repeat mode the alarm plays in. */
  playMode: AlarmPlayMode;
  /** Volume the alarm plays at, 0–100. */
  volume: number;
  /** Whether the players grouped with the room also sound. */
  includeLinkedZones: boolean;
}

/**
 * Persists the Spotify auth token across sessions. Injected into SonosApi so the
 * engine stays node-free: a Node host backs it with ~/.config/orkester/auth.json
 * (see ../node/configStore), an RN host with secure storage, the mock with
 * memory. load() returns null when nothing is saved (never throws for absence).
 */
export interface CredentialStore {
  load(): Promise<SpotifyAuth | null>;
  save(auth: SpotifyAuth): Promise<void>;
}

/**
 * The high-level control API the engine-backed store drives. Every method is
 * async and surfaces faults by REJECTING (no silent swallow): the store applies
 * optimistic updates and reverts on rejection.
 *
 * Id contract: room ids are engine RoomRef handles; group ids are engine
 * Group.ids. Both are resolved against the most-recent topology the Api loaded.
 */
export interface Api {
  // --- topology ---
  /** Discovers + loads the full household topology. THROWS when none is found. */
  loadTopology(): Promise<ApiTopology>;
  /** Re-fetches topology from a known speaker (cheaper than re-discovering). */
  refreshTopology(): Promise<ApiTopology>;

  // --- per active group (routed to its coordinator) ---
  getNowPlaying(groupId: string): Promise<ApiNowPlaying>;
  /** Reads the group coordinator's current play queue, in order. */
  getQueue(groupId: string): Promise<ApiQueueItem[]>;
  /** Removes every track from the group's queue. */
  clearQueue(groupId: string): Promise<void>;
  /** Moves the track at fromIndex to toIndex (0-based) within the group's queue. */
  reorderQueue(groupId: string, fromIndex: number, toIndex: number): Promise<void>;
  /**
   * Plays the group's queue entry at `index` (0-based). Also switches the group
   * onto its own queue, so it works when a stream is playing instead.
   */
  playQueueIndex(groupId: string, index: number): Promise<void>;
  play(groupId: string): Promise<void>;
  pause(groupId: string): Promise<void>;
  next(groupId: string): Promise<void>;
  previous(groupId: string): Promise<void>;
  /** Seeks to an absolute position in seconds within the current track. */
  seek(groupId: string, positionSeconds: number): Promise<void>;
  setShuffle(groupId: string, shuffle: boolean): Promise<void>;
  setRepeat(groupId: string, repeat: RepeatMode): Promise<void>;

  // --- per room (routed to the room's own player) ---
  getVolume(roomId: string): Promise<number>;
  setVolume(roomId: string, volume: number): Promise<void>;
  getMute(roomId: string): Promise<boolean>;
  setMute(roomId: string, muted: boolean): Promise<void>;

  // --- grouping ---
  /** Makes `roomId` join the group coordinated by `coordinatorUuid`. */
  joinGroup(roomId: string, coordinatorUuid: string): Promise<void>;
  /** Detaches `roomId` into its own standalone group. */
  leaveGroup(roomId: string): Promise<void>;

  // --- Spotify catalog search ---
  /** True once a Spotify token has been minted + persisted (device-linked). */
  isSpotifyLinked(): Promise<boolean>;
  /**
   * Starts the one-time Spotify device link via `roomId`'s player (any room
   * works; the token is household-wide). Returns the URL/code to show the user.
   */
  startSpotifyLink(roomId: string): Promise<ApiSpotifyLink>;
  /**
   * Polls whether the in-progress link has completed; on success it persists the
   * token and resolves true. Resolves false while still pending. THROWS if no
   * link was started or the link failed/expired.
   */
  pollSpotifyLink(): Promise<boolean>;
  /**
   * Searches the Spotify catalog. THROWS (NotLinkedError) when not yet linked.
   * Returns hits carrying opaque playback fields for enqueue/play.
   */
  searchSpotify(query: string, kind: SpotifySearchKind): Promise<ApiSearchItem[]>;
  /**
   * Queues a search hit WITHOUT changing what is currently playing, at the
   * slot named by `where` (default 'end').
   */
  enqueueSearchItem(groupId: string, item: ApiSearchItem, where?: QueuePosition): Promise<void>;
  /**
   * Plays a search hit NOW, REPLACING the group's queue ("play now"). Destructive
   * to the existing queue by design; use enqueueSearchItem to append instead.
   */
  playSearchItem(groupId: string, item: ApiSearchItem): Promise<void>;

  // --- transport & queue extras (per active group) ---
  stop(groupId: string): Promise<void>;
  getCrossfade(groupId: string): Promise<boolean>;
  setCrossfade(groupId: string, on: boolean): Promise<void>;
  /** Seconds left on the group's sleep timer, 0 when none is set. */
  getSleepTimer(groupId: string): Promise<number>;
  /** Sets the sleep timer to `seconds` from now; 0 cancels it. */
  setSleepTimer(groupId: string, seconds: number): Promise<void>;
  /** Removes the queue entry at `index` (0-based). */
  removeQueueItem(groupId: string, index: number): Promise<void>;
  /** Saves the queue as a Sonos playlist; resolves with its browse id. */
  saveQueue(groupId: string, title: string): Promise<string>;
  /** Plays `sourceRoomId`'s line-in on the group. */
  playLineIn(groupId: string, sourceRoomId: string): Promise<void>;
  /** Plays the coordinator's TV input (home-theater players only). */
  playTv(groupId: string): Promise<void>;
  getGroupVolume(groupId: string): Promise<number>;
  /** Sets the group volume (0–100), keeping members' relative levels. */
  setGroupVolume(groupId: string, volume: number): Promise<void>;
  getGroupMute(groupId: string): Promise<boolean>;
  setGroupMute(groupId: string, muted: boolean): Promise<void>;

  // --- audio settings (per room) ---
  getAudioSettings(roomId: string): Promise<ApiAudioSettings>;
  setBass(roomId: string, bass: number): Promise<void>;
  setTreble(roomId: string, treble: number): Promise<void>;
  setLoudness(roomId: string, on: boolean): Promise<void>;
  /** Reads one EQ setting (booleans as 1/0). REJECTS when the model lacks it. */
  getEQ(roomId: string, type: EQType): Promise<number>;
  /** Writes one EQ setting (booleans as 1/0). REJECTS when the model lacks it. */
  setEQ(roomId: string, type: EQType, value: number): Promise<void>;

  // --- library ---
  /**
   * Lists the children of a library object: `FV:2` favorites, `SQ:` Sonos
   * playlists, `R:0/0` radio, `A:ARTIST`/`A:ALBUM`/`A:TRACKS`/`A:GENRE` the
   * music library, or any container id a previous browse returned.
   */
  browse(objectId: string, start?: number, count?: number): Promise<ApiBrowseResult>;
  getFavorites(): Promise<ApiBrowseItem[]>;
  getPlaylists(): Promise<ApiBrowseItem[]>;
  /** Plays a library entry now: a stream becomes the source, anything else is added to the queue and played from there. */
  playBrowseItem(groupId: string, item: ApiBrowseItem): Promise<void>;
  /** Queues a library entry without changing what is playing. */
  enqueueBrowseItem(groupId: string, item: ApiBrowseItem, where?: QueuePosition): Promise<void>;
  /** Deletes a Sonos playlist by its `SQ:` id. */
  deletePlaylist(playlistId: string): Promise<void>;

  // --- alarms ---
  listAlarms(): Promise<ApiAlarm[]>;
  /** Creates an alarm; resolves with its id. */
  createAlarm(alarm: Omit<ApiAlarm, 'id'>): Promise<number>;
  updateAlarm(alarm: ApiAlarm): Promise<void>;
  deleteAlarm(alarmId: number): Promise<void>;

  // --- device settings (per room) ---
  setRoomName(roomId: string, name: string): Promise<void>;
  getLed(roomId: string): Promise<boolean>;
  setLed(roomId: string, on: boolean): Promise<void>;
  getButtonLock(roomId: string): Promise<boolean>;
  setButtonLock(roomId: string, locked: boolean): Promise<void>;
}
