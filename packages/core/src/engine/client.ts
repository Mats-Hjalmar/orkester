// SonosClient — the rich facade tying discovery, topology and control together.
//
// PURE engine code: it consumes an injected { http: HttpTransport, discovery:
// DiscoveryTransport } and touches the network ONLY through them, so this module
// imports NO node:* and stays part of the RN-facing core surface. The concrete
// Node adapters (NodeHttpTransport / NodeDiscoveryTransport) live under
// ../node and are injected by the caller; the offline test injects MOCK
// transports instead.
//
// Routing rule (ported from the Go CLI's command wiring): AVTransport actions
// (play/pause/next/previous/now-playing) target the GROUP COORDINATOR's base
// URL, while RenderingControl actions (volume/mute) target the NAMED PLAYER's
// own base URL. The facade resolves both base URLs from a resolved room so
// callers never re-derive the rule.
//
// No silent fallbacks: discoverOne throws when no speaker answers; resolveRoom
// throws on an unknown / ambiguous query (via topology.resolve); coordinatorIP /
// memberBaseURL surface an unresolvable address as a thrown error.

import type { DiscoveryTransport, HttpTransport, SSDPResult } from '../sonos';
import { SonosDevice, type AlarmClockCreateAlarmRequest } from '@orkester/sonos-api';
import { HTTPPort } from './device';
import {
  type Household,
  type Member,
  type Group,
  coordinatorMember,
  fetchTopology,
  memberBaseURL,
  resolve,
} from './topology';
import {
  type NowPlaying,
  type PlaySettings,
  type QueueTrack,
  type QueuePosition,
  getNowPlaying as controlGetNowPlaying,
  getQueue as controlGetQueue,
  clearQueue as controlClearQueue,
  reorderQueue as controlReorderQueue,
  getVolume as controlGetVolume,
  getMute as controlGetMute,
  next as controlNext,
  pause as controlPause,
  play as controlPlay,
  previous as controlPrevious,
  setMute as controlSetMute,
  setVolume as controlSetVolume,
  seek as controlSeek,
  getTransportSettings as controlGetTransportSettings,
  setPlayMode as controlSetPlayMode,
  joinGroup as controlJoinGroup,
  leaveGroup as controlLeaveGroup,
  addURIToQueue as controlAddURIToQueue,
  getQueueTrackNumber as controlGetQueueTrackNumber,
  playFromQueue as controlPlayFromQueue,
  type EnqueueItem,
  playItem as controlPlayItem,
  parseRelTime,
} from './control';
import {
  type Alarm,
  type BrowseItem,
  type BrowseResult,
  parseAlarmList,
  parseBrowseResult,
} from './library';
import {
  type MusicServiceInfo,
  listAvailableServices,
  findService,
  getHouseholdId,
} from './musicservices';
import {
  type AppLink,
  type SMAPICredentials,
  type SMAPIService,
  type SMAPIItem,
  getAppLink,
  getDeviceAuthToken,
  search as smapiSearch,
} from './smapi';

/** The RenderingControl EQ settings a player may expose (availability varies by model). */
export type EQType =
  | 'DialogLevel'
  | 'SpeechEnhanceEnabled'
  | 'MusicSurroundLevel'
  | 'NightMode'
  | 'SubGain'
  | 'SurroundEnable'
  | 'SurroundLevel'
  | 'SurroundMode'
  | 'HeightChannelLevel';

/** A player's tone settings. */
export interface AudioSettings {
  /** Bass level, -10..10. */
  bass: number;
  /** Treble level, -10..10. */
  treble: number;
  /** Whether loudness compensation is on. */
  loudness: boolean;
}

/** The injected transports a SonosClient is constructed with. */
export interface SonosTransports {
  http: HttpTransport;
  discovery: DiscoveryTransport;
}

/**
 * A resolved room: the named visible player plus the group it coordinates with.
 * Returned by resolveRoom and accepted by every control helper, which routes
 * RenderingControl to `member` and AVTransport to the group coordinator.
 */
export interface ResolvedRoom {
  member: Member;
  group: Group;
}

/**
 * SonosClient is the high-level entry point: discover a speaker, load the
 * household topology, resolve a room by fuzzy query, then drive transport /
 * volume / now-playing on it, plus queue, audio, library, alarm and device
 * settings. coordinatorDevice / playerDevice expose every UPnP service directly.
 */
export class SonosClient {
  private readonly http: HttpTransport;
  private readonly discovery: DiscoveryTransport;

  constructor(transports: SonosTransports) {
    this.http = transports.http;
    this.discovery = transports.discovery;
  }

  /**
   * Runs SSDP discovery and resolves with the FIRST ZonePlayer that answers,
   * aborting the listen window early via an AbortSignal so we do not wait the
   * full `waitMs` once a responder is in hand. THROWS "no Sonos speakers
   * answered SSDP" when the window closes with zero results — never resolves to
   * a sentinel/empty result (mirrors Go's DiscoverOne).
   */
  async discoverOne(waitMs: number): Promise<SSDPResult> {
    const controller = new AbortController();
    let first: SSDPResult | undefined;

    await this.discovery.discover({
      waitMs,
      signal: controller.signal,
      onResult: (result) => {
        if (first === undefined) {
          first = result;
          // Short-circuit the remaining listen window; adapters that honor the
          // signal stop early, the rest simply run out the clock.
          controller.abort();
        }
      },
    });

    if (first === undefined) {
      throw new Error('no Sonos speakers answered SSDP');
    }
    return first;
  }

  /**
   * Discovers one speaker and fetches the FULL household topology from it. Any
   * single household ZonePlayer returns the entire ZoneGroupState, so one
   * responder is enough. THROWS on no responder (via discoverOne) or any SOAP
   * fault / unparseable state (via fetchTopology).
   */
  async loadHousehold(waitMs: number): Promise<Household> {
    const responder = await this.discoverOne(waitMs);
    const base = responderBaseURL(responder);
    return fetchTopology(this.http, base);
  }

  /**
   * Fetches the whole household topology from an ALREADY-KNOWN speaker base URL,
   * skipping discovery. Any single speaker reports the entire household (see
   * findings/sonos-topology.md), so a periodic refresh need not re-run a
   * discovery sweep. Throws when that speaker no longer answers — the caller
   * decides whether to escalate to a full discovery.
   */
  fetchHouseholdFrom(base: string): Promise<Household> {
    return fetchTopology(this.http, base);
  }

  /**
   * Maps a fuzzy room query to a single resolved room. Delegates to
   * topology.resolve, which THROWS on an unknown query (listing the rooms) or an
   * ambiguous one (AmbiguousError with the candidates) — no silent fallback.
   */
  resolveRoom(household: Household, query: string): ResolvedRoom {
    return resolve(household, query);
  }

  // --- transport (AVTransport -> group coordinator base) ------------------

  /** Starts/resumes playback on the room's group coordinator. */
  play(room: ResolvedRoom): Promise<void> {
    return controlPlay(this.http, this.coordinatorBase(room));
  }

  /** Pauses playback on the room's group coordinator. */
  pause(room: ResolvedRoom): Promise<void> {
    return controlPause(this.http, this.coordinatorBase(room));
  }

  /** Skips to the next track on the room's group coordinator. */
  next(room: ResolvedRoom): Promise<void> {
    return controlNext(this.http, this.coordinatorBase(room));
  }

  /** Skips to the previous track on the room's group coordinator. */
  previous(room: ResolvedRoom): Promise<void> {
    return controlPrevious(this.http, this.coordinatorBase(room));
  }

  /** Reports the coordinator's transport state + current track + position. */
  getNowPlaying(room: ResolvedRoom): Promise<NowPlaying> {
    return controlGetNowPlaying(this.http, this.coordinatorBase(room));
  }

  /** Reads the coordinator's current play queue (in order). */
  getQueue(room: ResolvedRoom): Promise<QueueTrack[]> {
    return controlGetQueue(this.http, this.coordinatorBase(room));
  }

  /** Empties the coordinator's queue. */
  clearQueue(room: ResolvedRoom): Promise<void> {
    return controlClearQueue(this.http, this.coordinatorBase(room));
  }

  /** Moves the track at fromIndex to toIndex (0-based) in the coordinator's queue. */
  reorderQueue(room: ResolvedRoom, fromIndex: number, toIndex: number): Promise<void> {
    return controlReorderQueue(this.http, this.coordinatorBase(room), fromIndex, toIndex);
  }

  /**
   * Plays the queue entry at `index` (0-based). Routed through playFromQueue
   * rather than a bare TRACK_NR seek because the group may currently be on a
   * stream rather than its own queue, which a seek alone would not switch.
   */
  playQueueIndex(room: ResolvedRoom, index: number): Promise<void> {
    return controlPlayFromQueue(
      this.http,
      this.coordinatorBase(room),
      room.group.coordinator,
      index + 1,
    );
  }

  /** Seeks to an absolute position (seconds) in the current track (coordinator). */
  seek(room: ResolvedRoom, positionSeconds: number): Promise<void> {
    return controlSeek(this.http, this.coordinatorBase(room), positionSeconds);
  }

  /** Reads the coordinator's {shuffle, repeat} play settings. */
  getPlaySettings(room: ResolvedRoom): Promise<PlaySettings> {
    return controlGetTransportSettings(this.http, this.coordinatorBase(room));
  }

  /** Sets the coordinator's {shuffle, repeat} play settings. */
  setPlaySettings(room: ResolvedRoom, settings: PlaySettings): Promise<void> {
    return controlSetPlayMode(this.http, this.coordinatorBase(room), settings);
  }

  // --- grouping (SetAVTransportURI / Become... -> the MEMBER's own base) ---

  /**
   * Makes `room`'s player join the group coordinated by `coordinatorUUID`. The
   * x-rincon: SetAVTransportURI is sent to the joining MEMBER's own base (not
   * the coordinator's) — that is the player being told whom to follow.
   */
  joinGroup(room: ResolvedRoom, coordinatorUUID: string): Promise<void> {
    return controlJoinGroup(this.http, this.playerBase(room), coordinatorUUID);
  }

  /**
   * Detaches `room`'s player into its own standalone group. Sent to the member's
   * own base. Detaching a coordinator of a multi-member group promotes a new
   * coordinator for the rest — the caller should refresh topology afterwards.
   */
  leaveGroup(room: ResolvedRoom): Promise<void> {
    return controlLeaveGroup(this.http, this.playerBase(room));
  }

  // --- volume / mute (RenderingControl -> player base) --------------------

  /** Reads the master-channel volume (0–100) off the room's own player. */
  getVolume(room: ResolvedRoom): Promise<number> {
    return controlGetVolume(this.http, this.playerBase(room));
  }

  /**
   * Sets the master-channel volume on the room's own player. vol must be in
   * [0,100]; out-of-range values are REJECTED by the control layer before any
   * request is sent (no silent clamp).
   */
  setVolume(room: ResolvedRoom, vol: number): Promise<void> {
    return controlSetVolume(this.http, this.playerBase(room), vol);
  }

  /** Reports whether the room's own player is muted. */
  getMute(room: ResolvedRoom): Promise<boolean> {
    return controlGetMute(this.http, this.playerBase(room));
  }

  /** Mutes/unmutes the room's own player. */
  setMute(room: ResolvedRoom, mute: boolean): Promise<void> {
    return controlSetMute(this.http, this.playerBase(room), mute);
  }

  // --- Spotify catalog search (SMAPI) -------------------------------------
  //
  // Discovery (services list, household id, device link) talks to the LOCAL
  // device (the room's player base). The search itself talks to the service's
  // own absolute HTTPS endpoint. Enqueue/play routes to the group coordinator,
  // reusing the same playItem path as a browsed favorite.

  /**
   * Finds the named content service + household id off the room's player. THROWS
   * (listing what IS available) when the service is absent — no silent fallback.
   */
  async findMusicService(
    room: ResolvedRoom,
    name: string,
  ): Promise<{ service: MusicServiceInfo; householdId: string }> {
    const base = this.playerBase(room);
    const services = await listAvailableServices(this.http, base);
    const service = findService(services, name);
    const householdId = await getHouseholdId(this.http, base);
    return { service, householdId };
  }

  /** Starts the SMAPI device-link flow (getAppLink). */
  startAppLink(service: SMAPIService, householdId: string): Promise<AppLink> {
    return getAppLink(this.http, service, householdId);
  }

  /**
   * Claims the device-link token. Throws LinkPendingError until the user
   * authorizes in the browser (the caller polls).
   */
  claimDeviceToken(
    service: SMAPIService,
    householdId: string,
    link: AppLink,
  ): Promise<{ authToken: string; privateKey: string }> {
    return getDeviceAuthToken(this.http, service, householdId, link.linkCode, link.linkDeviceId);
  }

  /** Runs a Spotify catalog search against the service endpoint. */
  searchService(
    service: SMAPIService,
    creds: SMAPICredentials,
    category: string,
    term: string,
    count: number,
  ): Promise<SMAPIItem[]> {
    return smapiSearch(this.http, service, creds, category, term, 0, count);
  }

  /**
   * Adds an item to the group's queue WITHOUT changing what is currently
   * playing, at the slot named by `where`. For a container URI Sonos expands it
   * into the queue from that slot. AddURIToQueue's EnqueueAsNext flag alone only
   * affects the shuffle order, so 'next' resolves the slot from the
   * coordinator's current queue position; when it is not on its queue at all
   * (a stream) that position is 0 and 'next' means the top of the queue.
   */
  async enqueue(room: ResolvedRoom, item: EnqueueItem, where: QueuePosition = 'end'): Promise<void> {
    const base = this.coordinatorBase(room);
    const desiredFirstTrack =
      where === 'next' ? (await controlGetQueueTrackNumber(this.http, base)) + 1 : 0;
    await controlAddURIToQueue(
      this.http,
      base,
      item.uri,
      item.metadata,
      where === 'next',
      desiredFirstTrack,
    );
  }

  /**
   * Plays an item NOW by REPLACING the queue: clears the current queue, adds the
   * item, and starts it from the top (the "play now" action). Destructive to the
   * existing queue by design — use enqueue() to append without interrupting.
   */
  async playNow(room: ResolvedRoom, item: EnqueueItem): Promise<void> {
    const base = this.coordinatorBase(room);
    await controlClearQueue(this.http, base);
    const track = await controlAddURIToQueue(this.http, base, item.uri, item.metadata, false);
    await controlPlayFromQueue(this.http, base, room.group.coordinator, track);
  }

  // --- full service access (@orkester/sonos-api) -------------------------

  /** Every UPnP service of the room's group coordinator (AVTransport routing). */
  coordinatorDevice(room: ResolvedRoom): SonosDevice {
    return new SonosDevice(this.http, this.coordinatorBase(room));
  }

  /** Every UPnP service of the room's own player (RenderingControl routing). */
  playerDevice(room: ResolvedRoom): SonosDevice {
    return new SonosDevice(this.http, this.playerBase(room));
  }

  // --- transport & queue (coordinator) -----------------------------------

  /** Stops playback on the room's group coordinator. */
  async stop(room: ResolvedRoom): Promise<void> {
    await this.coordinatorDevice(room).AVTransport.Stop({ InstanceID: 0 });
  }

  /** Reports whether crossfade is on for the room's group. */
  async getCrossfade(room: ResolvedRoom): Promise<boolean> {
    const out = await this.coordinatorDevice(room).AVTransport.GetCrossfadeMode({ InstanceID: 0 });
    return out.CrossfadeMode;
  }

  /** Turns crossfade on/off for the room's group. */
  async setCrossfade(room: ResolvedRoom, on: boolean): Promise<void> {
    await this.coordinatorDevice(room).AVTransport.SetCrossfadeMode({ InstanceID: 0, CrossfadeMode: on });
  }

  /** Seconds left on the group's sleep timer, 0 when none is set. */
  async getSleepTimer(room: ResolvedRoom): Promise<number> {
    const out = await this.coordinatorDevice(room).AVTransport.GetRemainingSleepTimerDuration({
      InstanceID: 0,
    });
    return parseRelTime(out.RemainingSleepTimerDuration);
  }

  /** Sets the group's sleep timer to `seconds` from now; 0 cancels it. */
  async setSleepTimer(room: ResolvedRoom, seconds: number): Promise<void> {
    await this.coordinatorDevice(room).AVTransport.ConfigureSleepTimer({
      InstanceID: 0,
      NewSleepTimerDuration: seconds === 0 ? '' : formatSleepDuration(seconds),
    });
  }

  /** Removes the queue entry at `index` (0-based). */
  async removeQueueTrack(room: ResolvedRoom, index: number): Promise<void> {
    if (!Number.isInteger(index) || index < 0) {
      throw new RangeError(`queue index must be a non-negative integer, got ${index}`);
    }
    await this.coordinatorDevice(room).AVTransport.RemoveTrackFromQueue({
      InstanceID: 0,
      ObjectID: `Q:0/${index + 1}`,
      UpdateID: 0,
    });
  }

  /** Saves the group's queue as a Sonos playlist; returns the playlist's object id. */
  async saveQueue(room: ResolvedRoom, title: string): Promise<string> {
    const out = await this.coordinatorDevice(room).AVTransport.SaveQueue({
      InstanceID: 0,
      Title: title,
      ObjectID: '',
    });
    return out.AssignedObjectID;
  }

  /** Plays the line-in of the player `sourceUuid` on the room's group. */
  playLineIn(room: ResolvedRoom, sourceUuid: string): Promise<void> {
    return this.playSource(room, `x-rincon-stream:${sourceUuid}`);
  }

  /** Plays the TV input of the room's group coordinator (home-theater players only). */
  playTv(room: ResolvedRoom): Promise<void> {
    return this.playSource(room, `x-sonos-htastream:${room.group.coordinator}:spdif`);
  }

  /** Reads the group volume (0–100) off the coordinator. */
  async getGroupVolume(room: ResolvedRoom): Promise<number> {
    const out = await this.coordinatorDevice(room).GroupRenderingControl.GetGroupVolume({ InstanceID: 0 });
    return out.CurrentVolume;
  }

  /**
   * Sets the group volume (0–100), scaling each member relative to the others.
   * The snapshot fixes those proportions before the change.
   */
  async setGroupVolume(room: ResolvedRoom, volume: number): Promise<void> {
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
      throw new RangeError(`group volume must be an integer in [0, 100], got ${volume}`);
    }
    const grc = this.coordinatorDevice(room).GroupRenderingControl;
    await grc.SnapshotGroupVolume({ InstanceID: 0 });
    await grc.SetGroupVolume({ InstanceID: 0, DesiredVolume: volume });
  }

  /** Reports whether the whole group is muted. */
  async getGroupMute(room: ResolvedRoom): Promise<boolean> {
    const out = await this.coordinatorDevice(room).GroupRenderingControl.GetGroupMute({ InstanceID: 0 });
    return out.CurrentMute;
  }

  /** Mutes/unmutes the whole group. */
  async setGroupMute(room: ResolvedRoom, muted: boolean): Promise<void> {
    await this.coordinatorDevice(room).GroupRenderingControl.SetGroupMute({
      InstanceID: 0,
      DesiredMute: muted,
    });
  }

  // --- audio settings (player) -------------------------------------------

  /** Reads the room's bass, treble and loudness. */
  async getAudioSettings(room: ResolvedRoom): Promise<AudioSettings> {
    const rc = this.playerDevice(room).RenderingControl;
    const [bass, treble, loudness] = await Promise.all([
      rc.GetBass({ InstanceID: 0 }),
      rc.GetTreble({ InstanceID: 0 }),
      rc.GetLoudness({ InstanceID: 0, Channel: 'Master' }),
    ]);
    return { bass: bass.CurrentBass, treble: treble.CurrentTreble, loudness: loudness.CurrentLoudness };
  }

  /** Sets the room's bass (-10..10). */
  async setBass(room: ResolvedRoom, bass: number): Promise<void> {
    await this.playerDevice(room).RenderingControl.SetBass({ InstanceID: 0, DesiredBass: bass });
  }

  /** Sets the room's treble (-10..10). */
  async setTreble(room: ResolvedRoom, treble: number): Promise<void> {
    await this.playerDevice(room).RenderingControl.SetTreble({ InstanceID: 0, DesiredTreble: treble });
  }

  /** Turns the room's loudness compensation on/off. */
  async setLoudness(room: ResolvedRoom, on: boolean): Promise<void> {
    await this.playerDevice(room).RenderingControl.SetLoudness({
      InstanceID: 0,
      Channel: 'Master',
      DesiredLoudness: on,
    });
  }

  /** Reads one EQ setting; booleans read as 1/0. Faults when the model lacks it. */
  async getEQ(room: ResolvedRoom, type: EQType): Promise<number> {
    const out = await this.playerDevice(room).RenderingControl.GetEQ({ InstanceID: 0, EQType: type });
    return out.CurrentValue;
  }

  /** Writes one EQ setting; booleans as 1/0. Faults when the model lacks it. */
  async setEQ(room: ResolvedRoom, type: EQType, value: number): Promise<void> {
    await this.playerDevice(room).RenderingControl.SetEQ({ InstanceID: 0, EQType: type, DesiredValue: value });
  }

  // --- library (ContentDirectory, any player) ----------------------------

  /**
   * Lists the children of a ContentDirectory object: `FV:2` favorites, `SQ:`
   * Sonos playlists, `R:0/0` radio, `A:ARTIST` / `A:ALBUM` / `A:TRACKS` /
   * `A:GENRE` the music library, `S:` shares, or any id a previous browse returned.
   */
  async browse(room: ResolvedRoom, objectId: string, start = 0, count = 100): Promise<BrowseResult> {
    const base = this.playerBase(room);
    const out = await new SonosDevice(this.http, base).ContentDirectory.Browse({
      ObjectID: objectId,
      BrowseFlag: 'BrowseDirectChildren',
      Filter: '*',
      StartingIndex: start,
      RequestedCount: count,
      SortCriteria: '',
    });
    return { items: parseBrowseResult(out.Result, base), total: out.TotalMatches };
  }

  /** Plays a browse entry now: streams directly, everything else via the queue. */
  playBrowseItem(room: ResolvedRoom, item: BrowseItem): Promise<void> {
    return controlPlayItem(this.http, this.coordinatorBase(room), room.group.coordinator, {
      uri: this.browseItemUri(room, item),
      metadata: item.metadata,
    });
  }

  /** Adds a browse entry to the group's queue at `where`. */
  enqueueBrowseItem(room: ResolvedRoom, item: BrowseItem, where: QueuePosition = 'end'): Promise<void> {
    return this.enqueue(room, { uri: this.browseItemUri(room, item), metadata: item.metadata }, where);
  }

  /** Deletes a Sonos playlist (an `SQ:` object id). */
  async deletePlaylist(room: ResolvedRoom, objectId: string): Promise<void> {
    if (!objectId.startsWith('SQ:')) {
      throw new Error(`"${objectId}" is not a Sonos playlist id`);
    }
    await this.playerDevice(room).ContentDirectory.DestroyObject({ ObjectID: objectId });
  }

  // --- alarms (AlarmClock, household-wide via any player) ------------------

  /** Lists every alarm in the household. */
  async listAlarms(room: ResolvedRoom): Promise<Alarm[]> {
    const out = await this.playerDevice(room).AlarmClock.ListAlarms();
    return parseAlarmList(out.CurrentAlarmList);
  }

  /** Creates an alarm; returns its id. */
  async createAlarm(room: ResolvedRoom, alarm: Omit<Alarm, 'id'>): Promise<number> {
    const out = await this.playerDevice(room).AlarmClock.CreateAlarm(SonosClient.alarmArgs(alarm));
    return out.AssignedID;
  }

  /** Replaces every field of the alarm `alarm.id`. */
  async updateAlarm(room: ResolvedRoom, alarm: Alarm): Promise<void> {
    await this.playerDevice(room).AlarmClock.UpdateAlarm({ ID: alarm.id, ...SonosClient.alarmArgs(alarm) });
  }

  /** Deletes the alarm `id`. */
  async deleteAlarm(room: ResolvedRoom, id: number): Promise<void> {
    await this.playerDevice(room).AlarmClock.DestroyAlarm({ ID: id });
  }

  // --- device settings (DeviceProperties, player) -------------------------

  /** Renames the room, keeping its icon and configuration. */
  async setRoomName(room: ResolvedRoom, name: string): Promise<void> {
    if (name.trim() === '') {
      throw new Error('room name must not be empty');
    }
    const dp = this.playerDevice(room).DeviceProperties;
    const cur = await dp.GetZoneAttributes();
    await dp.SetZoneAttributes({
      DesiredZoneName: name,
      DesiredIcon: cur.CurrentIcon,
      DesiredConfiguration: cur.CurrentConfiguration,
      DesiredTargetRoomName: cur.CurrentTargetRoomName,
    });
  }

  /** Reports whether the player's status light is on. */
  async getLed(room: ResolvedRoom): Promise<boolean> {
    const out = await this.playerDevice(room).DeviceProperties.GetLEDState();
    return out.CurrentLEDState === 'On';
  }

  /** Turns the player's status light on/off. */
  async setLed(room: ResolvedRoom, on: boolean): Promise<void> {
    await this.playerDevice(room).DeviceProperties.SetLEDState({ DesiredLEDState: on ? 'On' : 'Off' });
  }

  /** Reports whether the player's physical buttons are locked. */
  async getButtonLock(room: ResolvedRoom): Promise<boolean> {
    const out = await this.playerDevice(room).DeviceProperties.GetButtonLockState();
    return out.CurrentButtonLockState === 'On';
  }

  /** Locks/unlocks the player's physical buttons. */
  async setButtonLock(room: ResolvedRoom, locked: boolean): Promise<void> {
    await this.playerDevice(room).DeviceProperties.SetButtonLockState({
      DesiredButtonLockState: locked ? 'On' : 'Off',
    });
  }

  /** Resolves the AVTransport base URL: the room's group coordinator. */
  private coordinatorBase(room: ResolvedRoom): string {
    return requireBaseURL(coordinatorMember(room.group), 'coordinator');
  }

  /** Resolves the RenderingControl base URL: the room's own player. */
  private playerBase(room: ResolvedRoom): string {
    return requireBaseURL(room.member, 'player');
  }

  /** Sets the group's source to a URI and starts playback. */
  private async playSource(room: ResolvedRoom, uri: string): Promise<void> {
    const av = this.coordinatorDevice(room).AVTransport;
    await av.SetAVTransportURI({ InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: '' });
    await av.Play({ InstanceID: 0, Speed: '1' });
  }

  /**
   * The URI to enqueue a browse entry by. A library container without its own
   * `res` is addressed as a playlist of the coordinator's ContentDirectory.
   */
  private browseItemUri(room: ResolvedRoom, item: BrowseItem): string {
    if (item.uri !== '') return item.uri;
    if (item.isContainer) return `x-rincon-playlist:${room.group.coordinator}#${item.id}`;
    throw new Error(`"${item.title}" has no playable URI`);
  }

  /** Projects an alarm onto the AlarmClock create/update argument names. */
  private static alarmArgs(alarm: Omit<Alarm, 'id'>) {
    return {
      StartLocalTime: alarm.startTime,
      Duration: alarm.duration,
      Recurrence: alarm.recurrence as AlarmClockCreateAlarmRequest['Recurrence'],
      Enabled: alarm.enabled,
      RoomUUID: alarm.roomUuid,
      ProgramURI: alarm.programUri,
      ProgramMetaData: alarm.programMetadata,
      PlayMode: alarm.playMode,
      Volume: alarm.volume,
      IncludeLinkedZones: alarm.includeLinkedZones,
    };
  }
}

/** Formats whole seconds as the zero-padded `HH:MM:SS` ConfigureSleepTimer expects. */
function formatSleepDuration(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds >= 24 * 3600) {
    throw new RangeError(`sleep timer must be whole seconds in [0, 86399], got ${seconds}`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
}

/**
 * http://{address}:1400 — the device base URL for an SSDP responder. THROWS when
 * the responder reported no address (an empty base would silently mis-route the
 * very first topology fetch), mirroring the engine's no-silent-fallback rule.
 */
function responderBaseURL(result: SSDPResult): string {
  if (result.address === '') {
    throw new Error(`SSDP responder ${result.usn || result.location} has no address`);
  }
  return `http://${result.address}:${HTTPPort}`;
}

/**
 * Resolves a member's base URL, throwing (rather than returning "") when the IP
 * is unresolvable — so a routing failure surfaces instead of POSTing to a
 * malformed URL.
 */
function requireBaseURL(member: Member, role: string): string {
  const base = memberBaseURL(member);
  if (base === '') {
    throw new Error(`${role} ${member.uuid || member.zoneName} has no resolvable IP`);
  }
  return base;
}
