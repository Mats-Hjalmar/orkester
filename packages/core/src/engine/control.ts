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
// SCOPE: ApplyVolumeArg / JoinGroup / LeaveGroup / SetAVTransportURI are
// deliberately NOT ported in this chunk.

import { makeParser, instanceArg, type Arg } from './soap';

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
