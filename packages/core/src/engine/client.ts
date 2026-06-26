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
} from './control';

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

/**
 * SonosClient is the high-level entry point: discover a speaker, load the
 * household topology, resolve a room by fuzzy query, then drive transport /
 * volume / now-playing on it. Grouping (join/leave) is deliberately deferred to
 * a later feature.
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
   * Maps a fuzzy room query to a single resolved room. Delegates to
   * topology.resolve, which THROWS on an unknown query (listing the rooms) or an
   * ambiguous one (AmbiguousError with the candidates) — no silent fallback.
   */
  resolveRoom(household: Household, query: string): ResolvedRoom {
    return resolve(household, query);
  }

  // --- transport (AVTransport -> group coordinator base) ------------------

  /** Resolves the AVTransport base URL: the room's group coordinator. */
  private coordinatorBase(room: ResolvedRoom): string {
    return requireBaseURL(coordinatorMember(room.group), 'coordinator');
  }

  /** Resolves the RenderingControl base URL: the room's own player. */
  private playerBase(room: ResolvedRoom): string {
    return requireBaseURL(room.member, 'player');
  }

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
}
