// SMAPI (Sonos Music API) dialect — device-link auth + catalog search + the
// result→enqueue conversion. Ported from smapi.go + smapi_didl.go.
//
// PURE engine code: it talks to the network ONLY through the injected
// HttpTransport (the SMAPI endpoint is an absolute HTTPS URL; the transport
// already handles https), so it imports NO node:* and stays RN-safe. It uses
// string concatenation (NOT Buffer/crypto) for the envelope, so the RN-no-node
// guard never trips.
//
// SMAPI is deliberately NOT the UPnP SOAP shape: it is POSTed to the service's
// own endpoint, the body lives in the http://www.sonos.com/Services/1.1
// namespace, and authenticated calls carry a <credentials> SOAP header. So it
// gets its own envelope builder rather than reusing buildEnvelope.

import { makeParser, extractResponseArg, escapeXMLText } from './soap';
import type { EnqueueItem } from './control';
import type { HttpTransport } from '../sonos';

export const SMAPI_NAMESPACE = 'http://www.sonos.com/Services/1.1';
/** Stable synthetic controller id for the credentials header (players use MACs). */
export const SMAPI_DEVICE_ID = '00:00:00:00:00:00:1';

/**
 * Diagnostic logger for the device-link flow (rare, hard to debug against live
 * hardware). Writes to the host console — in the desktop app that is the main
 * process terminal running `electron-vite dev`. Prefixed so it is greppable.
 */
function smapiDebug(...parts: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn('[orkester:smapi]', ...parts);
}

/** The loginToken minted by the device-link flow. */
export interface SMAPICredentials {
  authToken: string;
  privateKey: string;
  householdId: string;
}

/** Minimal service coordinates for SMAPI calls. */
export interface SMAPIService {
  id: number;
  endpoint: string;
}

/** A parsed SMAPI SOAP fault. The link poll loop keys off isRetry/isFailure. */
export class SMAPIFault extends Error {
  readonly code: string;
  /**
   * On a `Client.TokenRefreshRequired` fault, Spotify returns the refreshed
   * loginToken in the fault's <detail> (refreshAuthTokenResult). The caller must
   * persist these and retry the original call. Undefined for any other fault.
   */
  readonly refreshedToken?: { authToken: string; privateKey: string };
  constructor(code: string, message: string, refreshedToken?: { authToken: string; privateKey: string }) {
    super(`SMAPI fault ${code}: ${message}`);
    this.name = 'SMAPIFault';
    this.code = code;
    this.refreshedToken = refreshedToken;
  }
  isRetry(): boolean {
    return this.code.includes('NOT_LINKED_RETRY') || this.message.includes('NOT_LINKED_RETRY');
  }
  isFailure(): boolean {
    return this.code.includes('NOT_LINKED_FAILURE') || this.message.includes('NOT_LINKED_FAILURE');
  }
  /** The stored token expired; refreshedToken (if present) carries the new one. */
  isTokenRefresh(): boolean {
    return this.code.includes('TokenRefreshRequired') || this.message.includes('tokenRefreshRequired');
  }
}

/** Thrown by getDeviceAuthToken while the user has not finished authorizing. */
export class LinkPendingError extends Error {
  constructor() {
    super('device link not completed yet');
    this.name = 'LinkPendingError';
  }
}

/** Thrown by search/enqueue when no token has been minted yet. */
export class NotLinkedError extends Error {
  constructor() {
    super('Spotify is not linked yet');
    this.name = 'NotLinkedError';
  }
}

/**
 * buildSMAPIEnvelope wraps bodyInner in a SOAP 1.1 envelope with the credentials
 * header. deviceId/deviceProvider are always present; the loginToken is added
 * only when creds is non-null (the link calls send none).
 */
export function buildSMAPIEnvelope(creds: SMAPICredentials | null, bodyInner: string): string {
  let b = '';
  b += '<?xml version="1.0" encoding="utf-8"?>';
  b += '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">';
  b += '<s:Header>';
  b += `<credentials xmlns="${SMAPI_NAMESPACE}">`;
  b += `<deviceId>${escapeXMLText(SMAPI_DEVICE_ID)}</deviceId>`;
  b += '<deviceProvider>Sonos</deviceProvider>';
  if (creds !== null) {
    b += '<loginToken>';
    b += `<token>${escapeXMLText(creds.authToken)}</token>`;
    b += `<key>${escapeXMLText(creds.privateKey)}</key>`;
    b += `<householdId>${escapeXMLText(creds.householdId)}</householdId>`;
    b += '</loginToken>';
  }
  b += '</credentials>';
  b += '</s:Header>';
  b += `<s:Body>${bodyInner}</s:Body>`;
  b += '</s:Envelope>';
  return b;
}

/** Non-throwing element text lookup (extractResponseArg throws when absent). */
function tryExtract(body: string, name: string): string {
  try {
    return extractResponseArg(body, name);
  } catch {
    return '';
  }
}

/** parseSMAPIFault returns a fault when the body is a SOAP fault, else null. */
export function parseSMAPIFault(body: string): SMAPIFault | null {
  const code = tryExtract(body, 'faultcode').trim();
  const msg = tryExtract(body, 'faultstring').trim();
  if (code === '' && msg === '') return null;
  // A TokenRefreshRequired fault carries the new loginToken in its <detail>
  // (refreshAuthTokenResult > authToken/privateKey). Capture it so the caller can
  // persist the refreshed credentials and retry the original call.
  let refreshedToken: { authToken: string; privateKey: string } | undefined;
  if (code.includes('TokenRefreshRequired') || msg.includes('tokenRefreshRequired')) {
    const authToken = tryExtract(body, 'authToken').trim();
    const privateKey = tryExtract(body, 'privateKey').trim();
    if (authToken !== '') refreshedToken = { authToken, privateKey };
  }
  return new SMAPIFault(code, msg, refreshedToken);
}

function truncate(body: string, n: number): string {
  return body.length <= n ? body : body.slice(0, n) + '...';
}

/**
 * smapiCall performs one SMAPI action against the service endpoint. On a SOAP
 * fault it THROWS an SMAPIFault; on any other non-200 it throws a bare HTTP
 * error. No silent fallback.
 */
export async function smapiCall(
  transport: HttpTransport,
  endpoint: string,
  creds: SMAPICredentials | null,
  action: string,
  bodyInner: string,
): Promise<string> {
  const envelope = buildSMAPIEnvelope(creds, bodyInner);
  const resp = await transport.request({
    method: 'POST',
    url: endpoint,
    headers: {
      'Content-Type': 'text/xml; charset="utf-8"',
      SOAPACTION: `"${SMAPI_NAMESPACE}#${action}"`,
    },
    body: envelope,
  });
  if (resp.status !== 200) {
    const fault = parseSMAPIFault(resp.body);
    if (fault !== null) throw fault;
    throw new Error(`SMAPI ${action}: HTTP ${resp.status}: ${truncate(resp.body, 300)}`);
  }
  return resp.body;
}

// --- device-link auth flow -------------------------------------------------

/** getAppLink result: where to send the user + the codes to claim the token. */
export interface AppLink {
  regUrl: string;
  linkCode: string;
  linkDeviceId: string;
  showLinkCode: boolean;
}

/** getAppLink starts the device-link flow (needs no credentials). */
export async function getAppLink(
  transport: HttpTransport,
  svc: SMAPIService,
  householdId: string,
): Promise<AppLink> {
  const body = `<getAppLink xmlns="${SMAPI_NAMESPACE}"><householdId>${escapeXMLText(householdId)}</householdId></getAppLink>`;
  const resp = await smapiCall(transport, svc.endpoint, null, 'getAppLink', body);
  const regUrl = tryExtract(resp, 'regUrl').trim();
  const linkCode = tryExtract(resp, 'linkCode').trim();
  if (regUrl === '' || linkCode === '') {
    throw new Error(`getAppLink: response missing regUrl/linkCode (${truncate(resp, 300)})`);
  }
  return {
    regUrl,
    linkCode,
    linkDeviceId: tryExtract(resp, 'linkDeviceId').trim(),
    showLinkCode: tryExtract(resp, 'showLinkCode').trim().toLowerCase() === 'true',
  };
}

/**
 * getDeviceAuthToken claims the token for a started link. Throws LinkPendingError
 * (NOT_LINKED_RETRY) until the user authorizes; throws on terminal failure.
 */
export async function getDeviceAuthToken(
  transport: HttpTransport,
  svc: SMAPIService,
  householdId: string,
  linkCode: string,
  linkDeviceId: string,
): Promise<{ authToken: string; privateKey: string }> {
  const body =
    `<getDeviceAuthToken xmlns="${SMAPI_NAMESPACE}">` +
    `<householdId>${escapeXMLText(householdId)}</householdId>` +
    `<linkCode>${escapeXMLText(linkCode)}</linkCode>` +
    `<linkDeviceId>${escapeXMLText(linkDeviceId)}</linkDeviceId>` +
    `</getDeviceAuthToken>`;
  let resp: string;
  try {
    resp = await smapiCall(transport, svc.endpoint, null, 'getDeviceAuthToken', body);
  } catch (err) {
    // A DEFINITIVE failure is the only thing that stops polling. Everything else
    // while the user is mid-authorization — the NOT_LINKED_RETRY fault, a
    // service-specific "not ready" fault whose code/string we don't recognize,
    // OR a non-200 we couldn't even parse as a structured fault — is treated as
    // "keep waiting". Otherwise an unrecognized pending response kills the poll
    // and the link silently never completes (which is what happened). The
    // component bounds this with a timeout, and every attempt is logged.
    if (err instanceof SMAPIFault && err.isFailure()) {
      throw new Error(`device link failed or expired (${err.code || err.message}); start the link again`);
    }
    smapiDebug('getDeviceAuthToken not ready — still polling:', err instanceof Error ? err.message : err);
    throw new LinkPendingError();
  }
  const authToken = tryExtract(resp, 'authToken').trim();
  const privateKey = tryExtract(resp, 'privateKey').trim();
  if (authToken === '') {
    // A 200 with no authToken means the response shape differs from what we
    // parse — log the raw body so the real element names are visible.
    smapiDebug('getDeviceAuthToken 200 but no authToken found; raw response:\n', resp.slice(0, 800));
    throw new Error('getDeviceAuthToken: response had no authToken (raw response logged to console)');
  }
  return { authToken, privateKey };
}

// --- search ----------------------------------------------------------------

/** A normalized search hit across mediaMetadata (tracks) and mediaCollection. */
export interface SMAPIItem {
  id: string;
  itemType: string;
  title: string;
  artist: string;
  album: string;
  /** Absolute album/playlist art URL (Spotify CDN), "" if none. */
  artUrl: string;
  isContainer: boolean;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object' && '#text' in value) {
    return textOf((value as { '#text': unknown })['#text']);
  }
  return '';
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Decodes numeric character references (&#1234; / &#x1F600;) that Spotify's
 * SMAPI leaves in title/artist text — notably astral-plane code points (fancy
 * "𝓡𝓮olex"-style names), which our XML parser does NOT decode. BMP chars already
 * arrive as literal UTF-8, so only the entity forms need handling. Invalid /
 * out-of-range refs are left as-is rather than throwing.
 */
function decodeNumericEntities(s: string): string {
  if (!s.includes('&#')) return s;
  const cp = (code: number, original: string): string => {
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return original;
    try {
      return String.fromCodePoint(code);
    } catch {
      return original;
    }
  };
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => cp(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => cp(parseInt(d, 10), m));
}

function mediaToItem(m: Record<string, unknown>, isContainer: boolean): SMAPIItem {
  const track = m.trackMetadata as Record<string, unknown> | undefined;
  const albumMeta = m.albumMetadata as Record<string, unknown> | undefined;
  let artist = textOf(m.artist).trim();
  if (artist === '') artist = textOf(track?.artist).trim();
  if (artist === '') artist = textOf(albumMeta?.artist).trim();
  // Art is direct on a mediaCollection (album/playlist) but nested under
  // trackMetadata for a track.
  let artUrl = textOf(m.albumArtURI).trim();
  if (artUrl === '') artUrl = textOf(track?.albumArtURI).trim();
  return {
    id: textOf(m.id).trim(),
    itemType: textOf(m.itemType).trim(),
    title: decodeNumericEntities(textOf(m.title).trim()),
    artist: decodeNumericEntities(artist),
    album: decodeNumericEntities(textOf(track?.album).trim()),
    artUrl,
    isContainer,
  };
}

/** parseSearchResult flattens a search response into SMAPIItems. Exported for tests. */
export function parseSearchResult(body: string): SMAPIItem[] {
  const parsed = makeParser().parse(body) as Record<string, unknown>;
  // Depth: Envelope > Body > searchResponse > searchResult. removeNSPrefix
  // strips the s:/ns prefixes, so locate searchResult by walking.
  const result = findKey(parsed, 'searchResult') as Record<string, unknown> | undefined;
  if (!result) return [];
  const out: SMAPIItem[] = [];
  for (const m of asArray(result.mediaMetadata)) {
    out.push(mediaToItem(m as Record<string, unknown>, false));
  }
  for (const c of asArray(result.mediaCollection)) {
    out.push(mediaToItem(c as Record<string, unknown>, true));
  }
  return out;
}

function findKey(node: unknown, name: string): unknown {
  if (node === null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) {
      const r = findKey(item, name);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  if (name in obj) return obj[name];
  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_') || key === '#text') continue;
    const r = findKey(obj[key], name);
    if (r !== undefined) return r;
  }
  return undefined;
}

/**
 * search runs an SMAPI search for term in category ("tracks" | "albums" |
 * "artists" | "playlists") and returns up to count items starting at index.
 * Requires credentials minted by the device-link flow.
 */
export async function search(
  transport: HttpTransport,
  svc: SMAPIService,
  creds: SMAPICredentials,
  category: string,
  term: string,
  index: number,
  count: number,
): Promise<SMAPIItem[]> {
  const body =
    `<search xmlns="${SMAPI_NAMESPACE}">` +
    `<id>${escapeXMLText(category)}</id>` +
    `<term>${escapeXMLText(term)}</term>` +
    `<index>${index}</index>` +
    `<count>${count}</count>` +
    `</search>`;
  const resp = await smapiCall(transport, svc.endpoint, creds, 'search', body);
  return parseSearchResult(resp);
}

// --- result -> enqueue conversion (ported from smapi_didl.go) ---------------
//
// The playable URI + DIDL metadata are built from per-(service,item-kind) magic
// prefixes/flags that are NOT derivable from the service id — they are constants
// observed from the Sonos app's own enqueues (source: node-sonos-ts
// MetadataHelper). They MUST be validated against a real favorite on the target
// system before being trusted; a wrong value surfaces as UPnP fault 711/714/800.

interface SpotifyKind {
  uriScheme: string;
  uriPrefix: string;
  metaPrefix: string;
  upnpClass: string;
  isContainer: boolean;
  flags: string;
}

const SPOTIFY_KINDS: Record<string, SpotifyKind> = {
  track: {
    uriScheme: 'x-sonos-spotify:',
    uriPrefix: '',
    metaPrefix: '00032020',
    upnpClass: 'object.item.audioItem.musicTrack',
    isContainer: false,
    flags: '8224',
  },
  album: {
    uriScheme: 'x-rincon-cpcontainer:',
    uriPrefix: '1004206c',
    metaPrefix: '1004206c',
    upnpClass: 'object.container.album.musicAlbum',
    isContainer: true,
    flags: '',
  },
  playlist: {
    uriScheme: 'x-rincon-cpcontainer:',
    uriPrefix: '1006206c',
    metaPrefix: '1006206c',
    upnpClass: 'object.container.playlistContainer',
    isContainer: true,
    flags: '',
  },
  artist: {
    uriScheme: 'x-rincon-cpcontainer:',
    uriPrefix: '100e206c',
    metaPrefix: '100e206c',
    upnpClass: 'object.container.playlistContainer',
    isContainer: true,
    flags: '',
  },
};

/** Percent-encodes ':' the way Sonos does ("spotify:track:x" -> "spotify%3atrack%3ax"). */
export function encodeServiceId(id: string): string {
  return id.split(':').join('%3a');
}

function buildResMD(metaId: string, title: string, upnpClass: string, seed: number, accountSN: string): string {
  let b = '';
  b +=
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">';
  b += `<item id="${metaId}" parentID="0" restricted="true">`;
  b += `<dc:title>${escapeXMLText(title)}</dc:title>`;
  b += `<upnp:class>${upnpClass}</upnp:class>`;
  b += `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON${seed}_X_#Svc${seed}-${accountSN}-Token</desc>`;
  b += '</item></DIDL-Lite>';
  return b;
}

/**
 * spotifyEnqueueItem converts a search hit into the enqueue URI + DIDL metadata
 * the playItem path consumes unchanged. sid is the raw service id (the URI's
 * `sid`), seed is serviceSeed (SA_RINCON account seed), accountSN is the
 * per-household account serial (default "1"). THROWS on an unsupported item type.
 */
export function spotifyEnqueueItem(
  item: SMAPIItem,
  sid: number,
  seed: number,
  accountSN: string,
): EnqueueItem {
  const kind = SPOTIFY_KINDS[item.itemType];
  if (!kind) {
    throw new Error(`unsupported Spotify item type "${item.itemType}" for "${item.title}"`);
  }
  if (item.id === '') {
    throw new Error(`search hit "${item.title}" has no id`);
  }
  const enc = encodeServiceId(item.id);
  const uri = kind.isContainer
    ? `${kind.uriScheme}${kind.uriPrefix}${enc}`
    : `${kind.uriScheme}${enc}?sid=${sid}&flags=${kind.flags}&sn=${accountSN}`;
  const metadata = buildResMD(`${kind.metaPrefix}${enc}`, item.title, kind.upnpClass, seed, accountSN);
  return { uri, metadata };
}
