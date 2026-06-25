// Transport / volume / now-playing control descriptors + DIDL-Lite parsing.
//
// Ported from the in-scope subset of backend/internal/sonos/control.go — PURE
// logic only. The networked SOAPCall lives in a later chunk on top of an
// injected HttpTransport; nothing here touches the network or node:*, so this
// module is part of the RN-facing core surface.
//
// Uses the SHARED fast-xml-parser config from ./soap (parseTagValue:false), so
// every text node stays a Go-faithful string. That is load-bearing here: a
// numeric track title like "2112" arrives as the STRING "2112", so the
// subsequent .trim() never throws.
//
// SCOPE: grouping (join/leave/SetAVTransportURI), TRACK_NR + REL_TIME seek, and
// shuffle/repeat (SetPlayMode/GetTransportSettings) are now in-scope. Track
// browsing / favorites / queue building (AddURIToQueue, PlayItem) stay deferred.

import { makeParser, instanceArg, SOAPCall, extractResponseArg, type Arg } from './soap';
import type { HttpTransport } from '../sonos';

export { instanceArg };

/**
 * The minimal control-service descriptor: a UPnP service type URN plus its
 * hardcoded control endpoint path. Mirrors the Go `Service{Type, ControlURL}`
 * the control layer uses — distinct from the richer device-description
 * `Service` in ../sonos, which also carries event/scpd URLs.
 *
 * Sonos exposes the same service control paths on every model, so we hardcode
 * them and skip a per-call device-description fetch. AVTransport owns the
 * queue/transport and lives on the group coordinator; RenderingControl owns
 * per-player volume/mute.
 */
export interface ControlService {
  /** The UPnP service type URN, e.g. urn:schemas-upnp-org:service:AVTransport:1. */
  type: string;
  /** The hardcoded control endpoint path, relative to the device base URL. */
  controlURL: string;
}

export const AV_TRANSPORT_TYPE = 'urn:schemas-upnp-org:service:AVTransport:1';
export const AV_TRANSPORT_CONTROL_URL = '/MediaRenderer/AVTransport/Control';
export const RENDERING_CONTROL_TYPE = 'urn:schemas-upnp-org:service:RenderingControl:1';
export const RENDERING_CONTROL_CONTROL_URL = '/MediaRenderer/RenderingControl/Control';

/** The AVTransport service (queue/transport; lives on the group coordinator). */
export function avTransport(): ControlService {
  return { type: AV_TRANSPORT_TYPE, controlURL: AV_TRANSPORT_CONTROL_URL };
}

/** The RenderingControl service (per-player volume/mute). */
export function renderingControl(): ControlService {
  return { type: RENDERING_CONTROL_TYPE, controlURL: RENDERING_CONTROL_CONTROL_URL };
}

/**
 * Which device base URL a control request must be sent to:
 *  - "coordinator": AVTransport actions go to the group coordinator's base URL.
 *  - "player":      RenderingControl (Channel=Master) actions go to the named
 *                   player's own base URL.
 * Surfaced so the networked layer (later chunk) can route without re-deriving
 * the rule per action.
 */
export type BaseTarget = 'coordinator' | 'player';

/**
 * A fully-described control request: everything the networked SOAPCall needs
 * EXCEPT the resolved base URL, which the caller supplies per the `base` rule.
 * Pure data — no I/O.
 */
export interface ControlRequest {
  service: ControlService;
  action: string;
  args: Arg[];
  /** Whether to send to the group coordinator or the named player. */
  base: BaseTarget;
}

/** Play starts/resumes playback. Speed=1 is normal playback rate. */
export function playRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'Play',
    args: [instanceArg(), { name: 'Speed', value: '1' }],
    base: 'coordinator',
  };
}

/** Pause pauses playback. */
export function pauseRequest(): ControlRequest {
  return { service: avTransport(), action: 'Pause', args: [instanceArg()], base: 'coordinator' };
}

/** Next skips to the next track. */
export function nextRequest(): ControlRequest {
  return { service: avTransport(), action: 'Next', args: [instanceArg()], base: 'coordinator' };
}

/** Previous skips to the previous track. */
export function previousRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'Previous',
    args: [instanceArg()],
    base: 'coordinator',
  };
}

/** GetTransportInfo — reads CurrentTransportState off the coordinator. */
export function getTransportInfoRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'GetTransportInfo',
    args: [instanceArg()],
    base: 'coordinator',
  };
}

/** GetPositionInfo — reads TrackDuration / RelTime / TrackMetaData. */
export function getPositionInfoRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'GetPositionInfo',
    args: [instanceArg()],
    base: 'coordinator',
  };
}

/** GetVolume — reads the master-channel volume off the named player. */
export function getVolumeRequest(): ControlRequest {
  return {
    service: renderingControl(),
    action: 'GetVolume',
    args: [instanceArg(), { name: 'Channel', value: 'Master' }],
    base: 'player',
  };
}

/**
 * SetVolume sets the master channel volume. vol must be in [0,100]; out-of-range
 * values are REJECTED (thrown) rather than silently clamped — the low-level
 * setter stays strict (relative-volume clamping is a deliberate higher-level
 * concern, ported separately).
 */
export function setVolumeRequest(vol: number): ControlRequest {
  if (vol < 0 || vol > 100) {
    throw new Error(`volume ${vol} out of range (0-100)`);
  }
  return {
    service: renderingControl(),
    action: 'SetVolume',
    args: [
      instanceArg(),
      { name: 'Channel', value: 'Master' },
      { name: 'DesiredVolume', value: String(vol) },
    ],
    base: 'player',
  };
}

/** GetMute — reads the master-channel mute state off the named player. */
export function getMuteRequest(): ControlRequest {
  return {
    service: renderingControl(),
    action: 'GetMute',
    args: [instanceArg(), { name: 'Channel', value: 'Master' }],
    base: 'player',
  };
}

/** SetMute mutes/unmutes the player's master channel. */
export function setMuteRequest(mute: boolean): ControlRequest {
  return {
    service: renderingControl(),
    action: 'SetMute',
    args: [
      instanceArg(),
      { name: 'Channel', value: 'Master' },
      { name: 'DesiredMute', value: mute ? '1' : '0' },
    ],
    base: 'player',
  };
}

/**
 * SetAVTransportURI points a coordinator's transport at `uri` (with optional
 * DIDL metadata). It underlies grouping (x-rincon:) and direct stream playback.
 * `metadata` may be "" — Sonos accepts an empty CurrentURIMetaData and some
 * firmware in fact requires the element be PRESENT-BUT-EMPTY rather than
 * omitted, so buildEnvelope always emits `<CurrentURIMetaData></CurrentURIMetaData>`.
 * Routes to the coordinator base. Ported from queue.go's SetAVTransportURI.
 */
export function setAVTransportURIRequest(uri: string, metadata: string): ControlRequest {
  return {
    service: avTransport(),
    action: 'SetAVTransportURI',
    args: [
      instanceArg(),
      { name: 'CurrentURI', value: uri },
      { name: 'CurrentURIMetaData', value: metadata },
    ],
    base: 'coordinator',
  };
}

/**
 * BecomeCoordinatorOfStandaloneGroup detaches a player into its own standalone
 * group (the LeaveGroup primitive). Sent to the MEMBER's OWN base — note `base`
 * is 'player' here: leaving is a per-player action, not a coordinator one.
 * Ported from control.go's LeaveGroup.
 */
export function becomeCoordinatorRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'BecomeCoordinatorOfStandaloneGroup',
    args: [instanceArg()],
    base: 'player',
  };
}

/**
 * Seek to a queue position (TRACK_NR) — a 1-based track number. Ported from
 * queue.go's seekTrack. Routes to the coordinator base.
 */
export function seekTrackRequest(track: number): ControlRequest {
  return {
    service: avTransport(),
    action: 'Seek',
    args: [
      instanceArg(),
      { name: 'Unit', value: 'TRACK_NR' },
      { name: 'Target', value: String(track) },
    ],
    base: 'coordinator',
  };
}

/**
 * Seek to an absolute position within the current track (REL_TIME). NOT in the
 * Go reference — authored against UPnP AVTransport:1. `target` is an "H:MM:SS"
 * string (see formatRelTime). Routes to the coordinator base.
 */
export function seekRelTimeRequest(target: string): ControlRequest {
  return {
    service: avTransport(),
    action: 'Seek',
    args: [
      instanceArg(),
      { name: 'Unit', value: 'REL_TIME' },
      { name: 'Target', value: target },
    ],
    base: 'coordinator',
  };
}

/** GetTransportSettings — reads the current PlayMode off the coordinator. */
export function getTransportSettingsRequest(): ControlRequest {
  return {
    service: avTransport(),
    action: 'GetTransportSettings',
    args: [instanceArg()],
    base: 'coordinator',
  };
}

/** SetPlayMode sets the transport's PlayMode (shuffle/repeat) on the coordinator. */
export function setPlayModeRequest(playMode: PlayMode): ControlRequest {
  return {
    service: avTransport(),
    action: 'SetPlayMode',
    args: [instanceArg(), { name: 'NewPlayMode', value: playMode }],
    base: 'coordinator',
  };
}

// --- PlayMode <-> {shuffle, repeat} mapping --------------------------------
//
// UPnP AVTransport:1 collapses shuffle and repeat into a single PlayMode enum.
// Sonos uses these six values. We expose the orthogonal {shuffle:boolean,
// repeat:'none'|'all'|'one'} the UI wants and map both ways, THROWING on any
// unrecognized string (no silent fallback to NORMAL).

/** The six Sonos PlayMode strings we round-trip. */
export type PlayMode =
  | 'NORMAL'
  | 'REPEAT_ALL'
  | 'REPEAT_ONE'
  | 'SHUFFLE'
  | 'SHUFFLE_NOREPEAT'
  | 'SHUFFLE_REPEAT_ONE';

/** The orthogonal repeat mode the UI/Api speaks. */
export type RepeatMode = 'none' | 'all' | 'one';

/** Decoded transport play settings. */
export interface PlaySettings {
  shuffle: boolean;
  repeat: RepeatMode;
}

const PLAYMODE_TO_SETTINGS: Record<PlayMode, PlaySettings> = {
  NORMAL: { shuffle: false, repeat: 'none' },
  REPEAT_ALL: { shuffle: false, repeat: 'all' },
  REPEAT_ONE: { shuffle: false, repeat: 'one' },
  // SHUFFLE == shuffle on + repeat all (Sonos's legacy "shuffle" toggle).
  SHUFFLE: { shuffle: true, repeat: 'all' },
  SHUFFLE_NOREPEAT: { shuffle: true, repeat: 'none' },
  SHUFFLE_REPEAT_ONE: { shuffle: true, repeat: 'one' },
};

/**
 * Maps a Sonos PlayMode string to {shuffle, repeat}. THROWS on an unknown value
 * (a new/garbage PlayMode must surface, never be coerced to NORMAL).
 */
export function playModeToSettings(playMode: string): PlaySettings {
  const s = PLAYMODE_TO_SETTINGS[playMode as PlayMode];
  if (s === undefined) {
    throw new Error(`unknown PlayMode "${playMode}"`);
  }
  return s;
}

/**
 * Maps {shuffle, repeat} to the canonical Sonos PlayMode string. THROWS on an
 * unknown repeat value. shuffle+repeat:'all' maps to the modern 'SHUFFLE'
 * (== shuffle + repeat all), the inverse of PLAYMODE_TO_SETTINGS.SHUFFLE.
 */
export function settingsToPlayMode(settings: PlaySettings): PlayMode {
  const { shuffle, repeat } = settings;
  if (repeat !== 'none' && repeat !== 'all' && repeat !== 'one') {
    throw new Error(`unknown repeat mode "${repeat}"`);
  }
  if (!shuffle) {
    return repeat === 'all' ? 'REPEAT_ALL' : repeat === 'one' ? 'REPEAT_ONE' : 'NORMAL';
  }
  return repeat === 'all' ? 'SHUFFLE' : repeat === 'one' ? 'SHUFFLE_REPEAT_ONE' : 'SHUFFLE_NOREPEAT';
}

// --- REL_TIME formatting / parsing -----------------------------------------

/**
 * formatRelTime renders whole seconds as the "H:MM:SS" string Sonos's REL_TIME
 * Seek expects (hours unpadded, minutes and seconds zero-padded to 2). Negative
 * input is clamped to 0; fractional seconds are floored. The inverse of
 * parseRelTime.
 */
export function formatRelTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * parseRelTime parses a Sonos position/duration string ("H:MM:SS" or "MM:SS")
 * into whole seconds. Returns 0 for "" / "NOT_IMPLEMENTED" (live streams) and
 * any non-numeric/empty input — the single deliberate non-throw on the display
 * path, since a live stream legitimately reports no position. The inverse of
 * formatRelTime.
 */
export function parseRelTime(value: string): number {
  const v = value.trim();
  if (v === '' || v === 'NOT_IMPLEMENTED') return 0;
  const parts = v.split(':');
  if (parts.length < 2 || parts.length > 3) return 0;
  let total = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) return 0;
    total = total * 60 + n;
  }
  return Math.max(0, Math.floor(total));
}

/** A flattened view of what a coordinator is currently playing. */
export interface NowPlaying {
  /** CurrentTransportState (PLAYING / PAUSED_PLAYBACK / STOPPED / TRANSITIONING). */
  state: string;
  title: string;
  artist: string;
  album: string;
  /** RelTime, e.g. "0:01:23". */
  position: string;
  /** TrackDuration; "NOT_IMPLEMENTED" for live streams. */
  duration: string;
}

/** Parsed title/artist/album triple from a DIDL-Lite document. */
export interface TrackMetadata {
  title: string;
  artist: string;
  album: string;
}

// --- DIDL-Lite metadata parsing ---

/** Coerces a parsed text node to a string; absent/object values become "". */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

/**
 * Normalizes a fast-xml-parser child node into an array: a single element comes
 * back as a bare object, repeated elements as an array, absent as undefined.
 * Mirrors Go taking d.Items[0] off the first <item>.
 */
function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * parseTrackMetadata extracts title/artist/album from an (already
 * entity-decoded) DIDL-Lite string. The caller passes the decoded DIDL from
 * extractResponseArg(resp, "TrackMetaData") (fast-xml-parser already unescaped
 * the entities), so this is the SECOND stage of the two-stage parse.
 *
 * For radio/line-in/TV, dc:title is often the station and the live track lives
 * in r:streamContent, which is used as a fallback. With removeNSPrefix the DIDL
 * tags arrive as bare local names (dc:title -> title, upnp:artist -> artist).
 *
 * Empty / unparseable / item-less input returns an all-empty triple WITHOUT
 * throwing — this is the single deliberate non-throw on the display path,
 * mirroring Go's `if err != nil || len(d.Items)==0 { return "","","" }`.
 */
export function parseTrackMetadata(meta: string): TrackMetadata {
  const empty: TrackMetadata = { title: '', artist: '', album: '' };
  const trimmed = meta.trim();
  if (trimmed === '') {
    return empty;
  }

  let parsed: unknown;
  try {
    parsed = makeParser().parse(trimmed);
  } catch {
    return empty;
  }

  // removeNSPrefix strips the DIDL-Lite namespace prefix to the bare local name.
  const didl = (parsed as Record<string, unknown> | null | undefined)?.['DIDL-Lite'];
  const items = asArray((didl as Record<string, unknown> | undefined)?.item);
  if (items.length === 0) {
    return empty;
  }

  const it = items[0] as Record<string, unknown>;
  // parseTagValue:false keeps text nodes as strings, so a numeric title like
  // "2112" arrives as the string "2112" and .trim() is always safe.
  let title = textOf(it.title).trim();
  let artist = textOf(it.artist).trim();
  if (artist === '') {
    artist = textOf(it.creator).trim();
  }
  const album = textOf(it.album).trim();

  const sc = textOf(it.streamContent).trim();
  if (sc !== '') {
    const { title: t, artist: a } = parseStreamContent(sc);
    if (t !== '' || a !== '') {
      if (t !== '') title = t;
      if (a !== '') artist = a;
    }
  }

  return { title, artist, album };
}

/**
 * parseStreamContent pulls a title/artist out of an r:streamContent value.
 * Sonos radio uses "TYPE=SNG|TITLE The Song|ARTIST The Band|ALBUM ..." while
 * many stations just send "Artist - Title". An unknown format surfaces the raw
 * content as the title (never silently dropped).
 */
export function parseStreamContent(sc: string): { title: string; artist: string } {
  if (sc.includes('|') && sc.includes('TITLE')) {
    let title = '';
    let artist = '';
    for (const rawPart of sc.split('|')) {
      const part = rawPart.trim();
      if (part.startsWith('TITLE')) {
        title = part.slice('TITLE'.length).trim();
      } else if (part.startsWith('ARTIST')) {
        artist = part.slice('ARTIST'.length).trim();
      }
    }
    return { title, artist };
  }
  const i = sc.indexOf(' - ');
  if (i >= 0) {
    return { title: sc.slice(i + 3).trim(), artist: sc.slice(0, i).trim() };
  }
  // Unknown format: surface the raw content rather than nothing.
  return { title: sc, artist: '' };
}

// --- transport-driven control ops ----------------------------------------
//
// These wrap the pure request descriptors above in a SOAPCall over the injected
// HttpTransport. They mirror the Go networked control functions one-for-one.
// `base` is the resolved device base URL the caller routes to per the request's
// `base` target (coordinator for transport, player for volume/mute) — these
// low-level ops do not resolve it themselves.

/** Play starts/resumes playback on the coordinator. */
export async function play(transport: HttpTransport, coordinatorBase: string): Promise<void> {
  const req = playRequest();
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/** Pause pauses playback on the coordinator. */
export async function pause(transport: HttpTransport, coordinatorBase: string): Promise<void> {
  const req = pauseRequest();
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/** Next skips to the next track on the coordinator. */
export async function next(transport: HttpTransport, coordinatorBase: string): Promise<void> {
  const req = nextRequest();
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/** Previous skips to the previous track on the coordinator. */
export async function previous(transport: HttpTransport, coordinatorBase: string): Promise<void> {
  const req = previousRequest();
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/**
 * getTransportState returns the raw CurrentTransportState
 * (PLAYING / PAUSED_PLAYBACK / STOPPED / TRANSITIONING) off the coordinator.
 */
export async function getTransportState(
  transport: HttpTransport,
  coordinatorBase: string,
): Promise<string> {
  const req = getTransportInfoRequest();
  const resp = await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
  return extractResponseArg(resp, 'CurrentTransportState');
}

/**
 * getNowPlaying reports the coordinator's transport state plus the current
 * track's metadata and position — a two-stage call (GetTransportInfo, then
 * GetPositionInfo whose TrackMetaData is parsed through parseTrackMetadata).
 */
export async function getNowPlaying(
  transport: HttpTransport,
  coordinatorBase: string,
): Promise<NowPlaying> {
  const state = await getTransportState(transport, coordinatorBase);

  const posReq = getPositionInfoRequest();
  const resp = await SOAPCall(transport, coordinatorBase, posReq.service, posReq.action, posReq.args);
  const duration = extractResponseArg(resp, 'TrackDuration');
  const position = extractResponseArg(resp, 'RelTime');
  const meta = extractResponseArg(resp, 'TrackMetaData');
  const { title, artist, album } = parseTrackMetadata(meta);

  return { state, title, artist, album, position, duration };
}

/** getVolume returns the master-channel volume (0–100) for a player. */
export async function getVolume(transport: HttpTransport, playerBase: string): Promise<number> {
  const req = getVolumeRequest();
  const resp = await SOAPCall(transport, playerBase, req.service, req.action, req.args);
  const s = extractResponseArg(resp, 'CurrentVolume');
  const v = parseInt(s.trim(), 10);
  if (Number.isNaN(v)) {
    throw new Error(`parse volume "${s}"`);
  }
  return v;
}

/**
 * setVolume sets the master-channel volume on a player. vol must be in [0,100];
 * out-of-range values are REJECTED by setVolumeRequest before any request is
 * sent (no silent clamp at this level).
 */
export async function setVolume(
  transport: HttpTransport,
  playerBase: string,
  vol: number,
): Promise<void> {
  const req = setVolumeRequest(vol);
  await SOAPCall(transport, playerBase, req.service, req.action, req.args);
}

/** getMute reports whether the player's master channel is muted. */
export async function getMute(transport: HttpTransport, playerBase: string): Promise<boolean> {
  const req = getMuteRequest();
  const resp = await SOAPCall(transport, playerBase, req.service, req.action, req.args);
  return extractResponseArg(resp, 'CurrentMute').trim() === '1';
}

/** setMute mutes/unmutes the player's master channel. */
export async function setMute(
  transport: HttpTransport,
  playerBase: string,
  mute: boolean,
): Promise<void> {
  const req = setMuteRequest(mute);
  await SOAPCall(transport, playerBase, req.service, req.action, req.args);
}

// --- grouping / seek / playmode (transport-driven) -------------------------

/**
 * setAVTransportURI points a coordinator's transport at `uri` with optional DIDL
 * metadata. `coordinatorBase` is the resolved coordinator base URL.
 */
export async function setAVTransportURI(
  transport: HttpTransport,
  coordinatorBase: string,
  uri: string,
  metadata: string,
): Promise<void> {
  const req = setAVTransportURIRequest(uri, metadata);
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/**
 * joinGroup makes the player at `memberBase` join the group coordinated by
 * `coordinatorUUID` (a bare RINCON_xxxx01400, as carried in topology
 * Member.uuid). It sets the member's OWN transport to `x-rincon:<coordUUID>` —
 * so the request targets the MEMBER's base, not the coordinator's. CurrentURIMetaData
 * is sent as an empty element on purpose (omitting it can trip a UPnP 402).
 * Ported from control.go's JoinGroup.
 */
export async function joinGroup(
  transport: HttpTransport,
  memberBase: string,
  coordinatorUUID: string,
): Promise<void> {
  await setAVTransportURI(transport, memberBase, `x-rincon:${coordinatorUUID}`, '');
}

/**
 * leaveGroup detaches the player at `memberBase` into its own standalone group
 * (BecomeCoordinatorOfStandaloneGroup), sent to the member's OWN base. Ported
 * from control.go's LeaveGroup.
 */
export async function leaveGroup(transport: HttpTransport, memberBase: string): Promise<void> {
  const req = becomeCoordinatorRequest();
  await SOAPCall(transport, memberBase, req.service, req.action, req.args);
}

/** seekTrack jumps the coordinator's queue to a 1-based track number (TRACK_NR). */
export async function seekTrack(
  transport: HttpTransport,
  coordinatorBase: string,
  track: number,
): Promise<void> {
  const req = seekTrackRequest(track);
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/**
 * seek jumps to an absolute position (seconds) within the current track via a
 * REL_TIME Seek on the coordinator. Authored against UPnP AVTransport:1 (not in
 * the Go reference); seconds are formatted with formatRelTime.
 */
export async function seek(
  transport: HttpTransport,
  coordinatorBase: string,
  positionSeconds: number,
): Promise<void> {
  const req = seekRelTimeRequest(formatRelTime(positionSeconds));
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}

/**
 * getTransportSettings reads the coordinator's current PlayMode and decodes it
 * into {shuffle, repeat}. THROWS on an unknown PlayMode (via playModeToSettings).
 */
export async function getTransportSettings(
  transport: HttpTransport,
  coordinatorBase: string,
): Promise<PlaySettings> {
  const req = getTransportSettingsRequest();
  const resp = await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
  const playMode = extractResponseArg(resp, 'PlayMode');
  return playModeToSettings(playMode);
}

/**
 * setPlayMode sets the coordinator's PlayMode from {shuffle, repeat}. THROWS on
 * an unknown repeat value (via settingsToPlayMode).
 */
export async function setPlayMode(
  transport: HttpTransport,
  coordinatorBase: string,
  settings: PlaySettings,
): Promise<void> {
  const req = setPlayModeRequest(settingsToPlayMode(settings));
  await SOAPCall(transport, coordinatorBase, req.service, req.action, req.args);
}
