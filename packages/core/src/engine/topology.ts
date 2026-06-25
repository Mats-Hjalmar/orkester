// ZoneGroupTopology parsing + room/group resolution.
//
// Ported from backend/internal/sonos/topology.go — PURE logic only. The
// networked FetchTopology (a GetZoneGroupState SOAP call) lives in a later
// chunk on top of an injected HttpTransport; nothing here touches the network
// or node:*, so this module is part of the RN-facing core surface.
//
// Uses the SHARED fast-xml-parser config from ./soap (parseTagValue:false), so
// every text/attribute node — including SoftwareVersion like "15.9" and the
// Invisible "1"/"0" flag — arrives as a Go-faithful string.

import { makeParser, SOAPCall, extractResponseArg } from './soap';
import { HTTPPort } from './device';
import type { HttpTransport } from '../sonos';

/**
 * The proprietary Sonos service type for topology, and the fixed control path
 * for the topology service (it lives on the root device, not an embedded one).
 * Used by FetchTopology in a later chunk; exported here alongside the parser.
 */
export const ZONE_GROUP_TOPOLOGY_TYPE = 'urn:schemas-upnp-org:service:ZoneGroupTopology:1';
export const ZONE_GROUP_TOPOLOGY_CONTROL_URL = '/ZoneGroupTopology/Control';

/**
 * Member is one ZonePlayer within the household topology.
 *
 * `ip` is the resolved dotted/colon address, or "" when it could not be
 * resolved from the topology Location (mirroring Go's nil net.IP). `invisible`
 * marks bonded/satellite players hidden from the room list.
 */
export interface Member {
  /** RINCON_xxxxxxxxxxxx01400 */
  uuid: string;
  zoneName: string;
  /** Resolved IP, or "" if it could not be parsed from `location`. */
  ip: string;
  /** description XML URL */
  location: string;
  softwareVersion: string;
  /** bonded/satellite players hidden from the room list */
  invisible: boolean;
}

/**
 * http://{ip}:1400 — the root every service path hangs off. Returns "" when
 * the member's IP could not be resolved from the topology.
 */
export function memberBaseURL(member: Member): string {
  if (member.ip === '') {
    return '';
  }
  return `http://${member.ip}:${HTTPPort}`;
}

/**
 * Group is a set of members coordinated by one ZonePlayer. The coordinator owns
 * the queue/transport; transport commands must be sent to it.
 */
export interface Group {
  id: string;
  /** UUID of the coordinating member */
  coordinator: string;
  members: Member[];
}

/**
 * Returns the coordinating member, or the first member as a fallback, or a
 * zero-value member when the group is empty (mirroring Go's coordinatorMember).
 */
export function coordinatorMember(group: Group): Member {
  for (const m of group.members) {
    if (m.uuid === group.coordinator) {
      return m;
    }
  }
  if (group.members.length > 0) {
    return group.members[0];
  }
  return { uuid: '', zoneName: '', ip: '', location: '', softwareVersion: '', invisible: false };
}

/**
 * Returns a display name for the group: the coordinator's zone name, suffixed
 * with "+N" when N other VISIBLE rooms are grouped in. Falls back to the
 * coordinator UUID when the coordinator has no zone name.
 */
export function groupName(group: Group): string {
  const coord = coordinatorMember(group);
  let base = coord.zoneName;
  if (base === '') {
    base = group.coordinator;
  }
  let extra = 0;
  for (const m of group.members) {
    if (m.uuid !== group.coordinator && !m.invisible) {
      extra++;
    }
  }
  if (extra > 0) {
    return `${base} +${extra}`;
  }
  return base;
}

/**
 * Returns the IP of the group's coordinator — the address transport/queue
 * commands must target. THROWS when the coordinator IP is unresolvable; no
 * silent fallback.
 */
export function coordinatorIP(group: Group): string {
  const m = coordinatorMember(group);
  if (m.ip === '') {
    throw new Error(`group ${group.id} has no resolvable coordinator IP`);
  }
  return m.ip;
}

/** Household is the full topology snapshot: every group and its members. */
export interface Household {
  groups: Group[];
}

/**
 * RoomRef pairs a visible room with its unique, stable handle (a slug used as
 * the target / completion candidate) and the group it belongs to.
 */
export interface RoomRef {
  handle: string;
  member: Member;
  group: Group;
}

/**
 * Returns every visible room paired with a unique handle, sorted by handle.
 * Handles come from Slug(zoneName); an empty slug falls back to a UUID-derived
 * name, and a slug that collides with another room or a reserved subcommand
 * name gets a deterministic numeric suffix. Invisible members (bonded
 * surrounds, sub, stereo-pair secondaries) are excluded.
 */
export function rooms(household: Household): RoomRef[] {
  interface Pair {
    member: Member;
    group: Group;
  }
  const all: Pair[] = [];
  for (const g of household.groups) {
    for (const m of g.members) {
      if (m.invisible) {
        continue;
      }
      all.push({ member: m, group: g });
    }
  }
  // Stable input order so suffix assignment is deterministic regardless of how
  // the topology happened to be ordered: by zoneName then uuid.
  all.sort((a, b) => {
    if (a.member.zoneName !== b.member.zoneName) {
      return a.member.zoneName < b.member.zoneName ? -1 : 1;
    }
    if (a.member.uuid !== b.member.uuid) {
      return a.member.uuid < b.member.uuid ? -1 : 1;
    }
    return 0;
  });

  const used = new Set<string>();
  const refs: RoomRef[] = [];
  for (const p of all) {
    let base = slug(p.member.zoneName);
    if (base === '') {
      base = 'room-' + uuidSuffix(p.member.uuid);
    }
    const handle = uniqueHandle(base, used);
    used.add(handle);
    refs.push({ handle, member: p.member, group: p.group });
  }
  refs.sort((a, b) => (a.handle < b.handle ? -1 : a.handle > b.handle ? 1 : 0));
  return refs;
}

/**
 * AmbiguousError is thrown by resolve() when a query matches more than one
 * room. It carries the candidates so an interactive caller can offer a picker;
 * a non-interactive caller can just read the message.
 */
export class AmbiguousError extends Error {
  readonly query: string;
  readonly matches: RoomRef[];

  constructor(query: string, matches: RoomRef[]) {
    super(`"${query}" matches ${matches.length} rooms: ${handlesOf(matches).join(', ')}`);
    this.name = 'AmbiguousError';
    this.query = query;
    this.matches = matches;
  }
}

/**
 * Maps a query to a single visible room, forgivingly. An exact handle or
 * room-name match wins outright; otherwise any room whose handle or name
 * *contains* the query (case-insensitive) is a candidate. Exactly one candidate
 * is returned. Multiple candidates THROW an AmbiguousError listing them; zero
 * candidates THROW an error listing every room. No silent fallback.
 */
export function resolve(household: Household, query: string): { member: Member; group: Group } {
  const all = rooms(household);
  const q = query.trim().toLowerCase();
  if (q === '') {
    throw new Error('empty room query');
  }

  // Exact handle or name wins, even if it's also a substring of others.
  for (const r of all) {
    if (r.handle === q || r.member.zoneName.toLowerCase() === q) {
      return { member: r.member, group: r.group };
    }
  }

  const matches: RoomRef[] = [];
  for (const r of all) {
    if (r.handle.includes(q) || r.member.zoneName.toLowerCase().includes(q)) {
      matches.push(r);
    }
  }
  if (matches.length === 1) {
    return { member: matches[0].member, group: matches[0].group };
  }
  if (matches.length === 0) {
    throw new Error(`no room matching "${query}"; rooms: ${handlesOf(all).join(', ')}`);
  }
  throw new AmbiguousError(query, matches);
}

function handlesOf(refs: RoomRef[]): string[] {
  return refs.map((r) => r.handle);
}

/**
 * reservedHandles are subcommand names a room handle must never equal, so a
 * room can't shadow a command in dispatch / completion.
 */
const reservedHandles = new Set<string>([
  'list',
  'status',
  'play',
  'pause',
  'next',
  'prev',
  'volume',
  'mute',
  'unmute',
  'group',
  'ungroup',
  'help',
  'completion',
  '__handles',
]);

/**
 * Returns base, or base with the smallest -N suffix (N>=2) that is neither
 * already used nor a reserved subcommand name.
 */
function uniqueHandle(base: string, used: Set<string>): string {
  if (!reservedHandles.has(base) && !used.has(base)) {
    return base;
  }
  for (let n = 2; ; n++) {
    const cand = `${base}-${n}`;
    if (!reservedHandles.has(cand) && !used.has(cand)) {
      return cand;
    }
  }
}

/** Yields a short stable token from a RINCON UUID for fallback handles. */
function uuidSuffix(uuid: string): string {
  const s = uuid.replace(/^RINCON_/, '').toLowerCase();
  if (s.length >= 8) {
    return s.slice(4, 8);
  }
  if (s !== '') {
    return s;
  }
  return 'x';
}

/**
 * foldRunes maps lowercase accented Latin letters to ASCII. The input has
 * already been lowercased before lookup, so only lowercase keys are needed.
 */
const foldRunes: Record<string, string> = {
  á: 'a',
  à: 'a',
  â: 'a',
  ä: 'a',
  ã: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  ö: 'o',
  õ: 'o',
  ø: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ý: 'y',
  ÿ: 'y',
  ñ: 'n',
  ç: 'c',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
};

/**
 * Converts a room name into a stable, ASCII, shell-friendly handle: lowercase,
 * common Latin/Nordic diacritics folded to ASCII, every run of other
 * non-alphanumeric characters collapsed to a single '-', with leading/trailing
 * '-' trimmed (so a handle never starts with '-', which would break flag
 * parsing). Returns "" only when the name has no mappable alphanumerics; rooms()
 * substitutes a UUID-based fallback in that case.
 */
export function slug(name: string): string {
  let out = '';
  let dash = false;
  // Iterate by code point (Unicode-aware), matching Go's range-over-string.
  for (const r of name.toLowerCase()) {
    const folded = foldRunes[r];
    if (folded !== undefined) {
      out += folded;
      dash = false;
      continue;
    }
    if ((r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
      out += r;
      dash = false;
    } else {
      if (out.length > 0 && !dash) {
        out += '-';
        dash = true;
      }
    }
  }
  // Trim leading/trailing '-' (only '-' is ever produced as separator).
  return out.replace(/^-+/, '').replace(/-+$/, '');
}

// --- transport-driven topology fetch ---

/**
 * fetchTopology issues a GetZoneGroupState SOAP action against the topology
 * service on the device at `base` and parses the returned ZoneGroupState into a
 * Household. Ported from Go's FetchTopology. Any single household speaker
 * returns the entire topology, so one responder is enough. THROWS on SOAP fault
 * / missing ZoneGroupState / unparseable state — no silent fallback.
 */
export async function fetchTopology(
  transport: HttpTransport,
  base: string,
): Promise<Household> {
  const svc = {
    type: ZONE_GROUP_TOPOLOGY_TYPE,
    controlURL: ZONE_GROUP_TOPOLOGY_CONTROL_URL,
  };
  const resp = await SOAPCall(transport, base, svc, 'GetZoneGroupState', []);
  const stateXML = extractResponseArg(resp, 'ZoneGroupState');
  return parseZoneGroupState(stateXML);
}

// --- ZoneGroupState XML parsing ---

/** Coerces a parsed text/attribute node to a string; absent/object -> "". */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

/**
 * Normalizes a fast-xml-parser child node into an array: single elements come
 * back as a bare object, repeated elements as an array, absent as undefined.
 */
function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parses an extracted ZoneGroupState XML string into a Household. THROWS when
 * the body is unparseable. The Invisible attribute compares to the string '1'
 * (parseTagValue:false keeps it a string). Locations that don't yield an IP
 * leave `ip` as "" — coordinatorIP() / memberBaseURL surface that downstream.
 */
export function parseZoneGroupState(stateXML: string): Household {
  let parsed: Record<string, unknown>;
  try {
    parsed = makeParser().parse(stateXML.trim()) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`parse ZoneGroupState: ${(err as Error).message}`);
  }

  const state = parsed.ZoneGroupState as Record<string, unknown> | undefined;
  const zoneGroups = state?.ZoneGroups as Record<string, unknown> | undefined;

  const household: Household = { groups: [] };
  for (const zgRaw of asArray(zoneGroups?.ZoneGroup)) {
    if (zgRaw === null || typeof zgRaw !== 'object') continue;
    const zg = zgRaw as Record<string, unknown>;
    const group: Group = {
      id: textOf(zg['@_ID']),
      coordinator: textOf(zg['@_Coordinator']),
      members: [],
    };
    for (const mRaw of asArray(zg.ZoneGroupMember)) {
      if (mRaw === null || typeof mRaw !== 'object') continue;
      const m = mRaw as Record<string, unknown>;
      const location = textOf(m['@_Location']);
      group.members.push({
        uuid: textOf(m['@_UUID']),
        zoneName: textOf(m['@_ZoneName']),
        ip: ipFromLocation(location),
        location,
        softwareVersion: textOf(m['@_SoftwareVersion']),
        invisible: textOf(m['@_Invisible']) === '1',
      });
    }
    household.groups.push(group);
  }
  return household;
}

/** Returns the resolved IP from a Location URL, or "" when unparseable. */
export function ipFromLocation(location: string): string {
  if (location === '') {
    return '';
  }
  return parseHost(location) ?? '';
}

/**
 * Extracts the host of an `http://{ip}:1400/...` Location and validates it as
 * an IP. Returns null when no valid IP is present (mirroring Go's parseHost
 * error path). Accepts both IPv4 (with optional :port / path) and bracketed
 * IPv6, but the host segment must parse as an IP — hostnames return null.
 */
export function parseHost(location: string): string | null {
  const scheme = 'http://';
  let s = location.startsWith(scheme) ? location.slice(scheme.length) : location;
  const colon = s.indexOf(':');
  const slash = s.indexOf('/');
  if (colon >= 0) {
    s = s.slice(0, colon);
  } else if (slash >= 0) {
    s = s.slice(0, slash);
  }
  return isIP(s) ? s : null;
}

/** Reports whether s is a valid IPv4 or IPv6 literal (Go net.ParseIP-ish). */
function isIP(s: string): boolean {
  if (s === '') return false;
  // IPv4: four 0-255 octets.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    return v4.slice(1).every((o) => {
      const n = Number(o);
      return n >= 0 && n <= 255 && String(n) === String(Number(o));
    });
  }
  // IPv6: must contain ':' and only hex/':'/'.' (embedded v4) characters.
  if (s.includes(':')) {
    return /^[0-9a-fA-F:.]+$/.test(s) && /[0-9a-fA-F]/.test(s);
  }
  return false;
}
