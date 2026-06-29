// MusicServices discovery + household id (ported from musicservices.go).
//
// PURE engine code: it talks to the network ONLY through the injected
// HttpTransport, so it imports NO node:* and stays on the RN-facing surface.
// Reuses the shared parser/SOAP primitives from ./soap.
//
// This reaches the LOCAL Sonos device (the MusicServices + DeviceProperties UPnP
// services) to enumerate available content services and read the household id —
// the inputs the SMAPI device-link flow in ./smapi needs. The SMAPI calls
// themselves go to the service's own HTTPS endpoint (see ./smapi), not here.

import { makeParser, SOAPCall, extractResponseArg, type SOAPService } from './soap';
import type { HttpTransport } from '../sonos';

export const MUSIC_SERVICES_TYPE = 'urn:schemas-upnp-org:service:MusicServices:1';
export const MUSIC_SERVICES_CONTROL_URL = '/MusicServices/Control';
export const DEVICE_PROPERTIES_TYPE = 'urn:schemas-upnp-org:service:DeviceProperties:1';
export const DEVICE_PROPERTIES_CONTROL_URL = '/DeviceProperties/Control';

function musicServices(): SOAPService {
  return { type: MUSIC_SERVICES_TYPE, controlURL: MUSIC_SERVICES_CONTROL_URL };
}

function deviceProperties(): SOAPService {
  return { type: DEVICE_PROPERTIES_TYPE, controlURL: DEVICE_PROPERTIES_CONTROL_URL };
}

/**
 * A content-service descriptor. `id` is the raw Sonos service id (Spotify is
 * commonly 9, but varies per household — never hardcode it); `endpoint` is the
 * SMAPI URL (secure preferred); `auth` is the policy (e.g. "AppLink").
 */
export interface MusicServiceInfo {
  id: number;
  name: string;
  endpoint: string;
  auth: string;
}

/**
 * seed is the SA_RINCON{seed} account seed and the serviceType used in enqueue
 * URIs/metadata: serviceId*256+7 (Spotify id 9 -> 2311). Distinct from the raw
 * id, which is the URI's `sid`.
 */
export function serviceSeed(svc: MusicServiceInfo): number {
  return svc.id * 256 + 7;
}

function attrOf(node: unknown, name: string): string {
  if (node && typeof node === 'object') {
    const v = (node as Record<string, unknown>)[`@_${name}`];
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  }
  return '';
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * parseAvailableServices parses the (already SOAP-unescaped) <Services>
 * descriptor document into MusicServiceInfo records, preferring each service's
 * secure endpoint. Exported for fixture tests (no network).
 */
export function parseAvailableServices(listXML: string): MusicServiceInfo[] {
  const parsed = makeParser().parse(listXML.trim()) as Record<string, unknown>;
  const services = asArray((parsed?.Services as Record<string, unknown> | undefined)?.Service);
  return services.map((s) => {
    const secure = attrOf(s, 'SecureUri');
    const plain = attrOf(s, 'Uri');
    const policy = (s as Record<string, unknown>).Policy;
    return {
      id: Number(attrOf(s, 'Id')) || 0,
      name: attrOf(s, 'Name'),
      endpoint: secure !== '' ? secure : plain,
      auth: attrOf(policy, 'Auth'),
    };
  });
}

/**
 * listAvailableServices asks a device for the content services configured on the
 * system. THROWS on SOAP fault or a missing descriptor list.
 */
export async function listAvailableServices(
  transport: HttpTransport,
  base: string,
): Promise<MusicServiceInfo[]> {
  const resp = await SOAPCall(transport, base, musicServices(), 'ListAvailableServices', []);
  const listXML = extractResponseArg(resp, 'AvailableServiceDescriptorList');
  return parseAvailableServices(listXML);
}

/**
 * findService returns the service whose name matches (case-insensitive),
 * THROWING — and listing what IS available — when absent (no silent fallback).
 */
export function findService(svcs: MusicServiceInfo[], name: string): MusicServiceInfo {
  const want = name.trim().toLowerCase();
  const hit = svcs.find((s) => s.name.toLowerCase() === want);
  if (hit) return hit;
  const avail = svcs.length ? svcs.map((s) => s.name).join(', ') : 'none';
  throw new Error(
    `music service "${name}" not found on this system; available: ${avail}. ` +
      'Add it in the Sonos app (Settings > Services & Voice) first.',
  );
}

/**
 * getHouseholdId returns the system's household id, required by the SMAPI
 * device-link calls. THROWS on fault or empty id.
 */
export async function getHouseholdId(transport: HttpTransport, base: string): Promise<string> {
  const resp = await SOAPCall(transport, base, deviceProperties(), 'GetHouseholdID', []);
  const id = extractResponseArg(resp, 'CurrentHouseholdID').trim();
  if (id === '') {
    throw new Error('GetHouseholdID: empty household id');
  }
  return id;
}
