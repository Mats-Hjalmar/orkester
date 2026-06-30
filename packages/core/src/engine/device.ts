// Sonos device-description parsing + S1/S2 generation heuristics.
//
// Ported from backend/internal/sonos/device.go — PURE parsing only. The
// networked FetchDevice (HTTP GET of device_description.xml) lives in a later
// chunk on top of an injected HttpTransport; nothing here touches the network
// or node:*, so this module is part of the RN-facing core surface.
//
// Uses the SHARED fast-xml-parser config from ./soap (parseTagValue:false), so
// every text node — including firmware versions like "15.9" — arrives as a
// Go-faithful string.

import { makeParser } from './soap';
import { textOf, asArray } from './xml';
import type { HttpTransport, Service } from '../sonos';

/**
 * The unencrypted HTTP port every Sonos ZonePlayer exposes for SOAP control,
 * the description XML, GENA event subscriptions and /status/*.
 */
export const HTTPPort = 1400;

/**
 * A discovered Sonos ZonePlayer, populated from its device_description.xml. It
 * is the per-physical-speaker handle; room/group layout comes separately from
 * ZoneGroupTopology.
 */
export interface Device {
  /** Source IP address of the speaker. */
  ip: string;
  /** uuid:RINCON_xxxxxxxxxxxx01400 */
  udn: string;
  friendlyName: string;
  /** e.g. "Sonos PLAY:1" */
  modelName: string;
  /** e.g. "S13" */
  modelNumber: string;
  /** displayVersion (preferred) else softwareVersion, e.g. "15.9" */
  softwareVersion: string;
  /** zone/room name if present in the description */
  roomName: string;
  /**
   * Services indexed by short name (the trailing segment of the serviceId,
   * e.g. "AVTransport", "RenderingControl", "Queue").
   */
  services: Map<string, Service>;
}

/**
 * Returns the bare RINCON UUID (without the "uuid:" prefix) used in x-rincon
 * grouping URIs and topology coordinator references.
 */
export function rincon(device: Device): string {
  return device.udn.startsWith('uuid:') ? device.udn.slice('uuid:'.length) : device.udn;
}

/** http://{ip}:1400 — the root every service path hangs off. */
export function baseURL(device: Device): string {
  return `http://${device.ip}:${HTTPPort}`;
}

/**
 * Reports a best-effort S1/S2 guess. Sonos splits its ecosystem into S1
 * (legacy) and S2 (modern). The dedicated Queue service
 * (urn:schemas-sonos-com:service:Queue:1) is present on S2 players, so we use
 * it as the primary signal and fall back to the firmware major version. The
 * returned string is one of "S2", "S1", or "unknown" — never silently
 * defaulted; callers should show the raw softwareVersion alongside it.
 */
export function generation(device: Device): 'S2' | 'S1' | 'unknown' {
  if (device.services.has('Queue')) {
    return 'S2';
  }
  // Firmware major version: S1 caps out around v11.x; S2 is v12+.
  const maj = firmwareMajor(device.softwareVersion);
  if (maj !== null) {
    return maj >= 12 ? 'S2' : 'S1';
  }
  return 'unknown';
}

/**
 * Parses the leading dotted segment of a firmware version into its major
 * integer. Returns null for empty input or any non-digit in the major segment
 * (mirroring Go's explicit rune scan — no Number() coercion that would accept
 * "11abc" or whitespace).
 */
export function firmwareMajor(version: string): number | null {
  if (version === '') {
    return null;
  }
  const dot = version.indexOf('.');
  const part = dot >= 0 ? version.slice(0, dot) : version;
  if (part === '') {
    return null;
  }
  let n = 0;
  for (const ch of part) {
    if (ch < '0' || ch > '9') {
      return null;
    }
    n = n * 10 + (ch.charCodeAt(0) - 48);
  }
  return n;
}

/**
 * Turns a serviceId like "urn:upnp-org:serviceId:AVTransport" into
 * "AVTransport" (the trailing :segment).
 */
export function shortServiceName(serviceId: string): string {
  const i = serviceId.lastIndexOf(':');
  return i >= 0 ? serviceId.slice(i + 1) : serviceId;
}

// --- description XML parsing ---

function collectServices(device: unknown, into: Map<string, Service>): void {
  if (device === null || typeof device !== 'object') return;
  const node = device as Record<string, unknown>;

  const serviceList = node.serviceList as Record<string, unknown> | undefined;
  if (serviceList) {
    for (const svc of asArray(serviceList.service)) {
      if (svc === null || typeof svc !== 'object') continue;
      const s = svc as Record<string, unknown>;
      const serviceId = textOf(s.serviceId);
      const name = shortServiceName(serviceId);
      into.set(name, {
        serviceType: textOf(s.serviceType),
        serviceId,
        controlURL: textOf(s.controlURL),
        eventSubURL: textOf(s.eventSubURL),
        scpdURL: textOf(s.SCPDURL),
      });
    }
  }

  const deviceList = node.deviceList as Record<string, unknown> | undefined;
  if (deviceList) {
    for (const child of asArray(deviceList.device)) {
      collectServices(child, into);
    }
  }
}

/**
 * Parses a device_description.xml body into a Device. THROWS when the body is
 * unparseable or the root device carries no UDN — never returns a
 * half-populated Device. Prefers displayVersion over softwareVersion for the
 * reported softwareVersion field, matching the Go reference.
 */
export function parseDescription(ip: string, body: string): Device {
  let parsed: Record<string, unknown>;
  try {
    parsed = makeParser().parse(body) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`parse device description: ${(err as Error).message}`);
  }

  const root = parsed.root as Record<string, unknown> | undefined;
  const device = root?.device as Record<string, unknown> | undefined;
  const udn = textOf(device?.UDN);
  if (udn === '') {
    throw new Error(`device description for ${ip} has no UDN`);
  }

  const services = new Map<string, Service>();
  collectServices(device, services);

  const displayVersion = textOf(device?.displayVersion);
  const softwareVersion = displayVersion !== '' ? displayVersion : textOf(device?.softwareVersion);

  return {
    ip,
    udn,
    friendlyName: textOf(device?.friendlyName),
    modelName: textOf(device?.modelName),
    modelNumber: textOf(device?.modelNumber),
    softwareVersion,
    roomName: textOf(device?.roomName),
    services,
  };
}

// --- transport-driven device fetch ---

/**
 * fetchDevice retrieves and parses
 * http://{ip}:1400/xml/device_description.xml via the injected HttpTransport.
 * Ported from Go's FetchDevice. THROWS on a non-200 status or unparseable
 * body — no silent fallback.
 */
export async function fetchDevice(transport: HttpTransport, ip: string): Promise<Device> {
  const descURL = `http://${ip}:${HTTPPort}/xml/device_description.xml`;
  return fetchDeviceURL(transport, ip, descURL);
}

/**
 * fetchDeviceFromLocation parses an SSDP LOCATION URL (which points at the
 * description document), extracts the host IP from it, and fetches it. Ported
 * from Go's FetchDeviceFromLocation. THROWS when the LOCATION host is not an IP
 * literal — no silent fallback.
 */
export async function fetchDeviceFromLocation(
  transport: HttpTransport,
  location: string,
): Promise<Device> {
  const ip = hostFromLocation(location);
  if (ip === null) {
    throw new Error(`LOCATION host in ${location} is not an IP`);
  }
  return fetchDeviceURL(transport, ip, location);
}

async function fetchDeviceURL(
  transport: HttpTransport,
  ip: string,
  descURL: string,
): Promise<Device> {
  const resp = await transport.request({ method: 'GET', url: descURL });
  if (resp.status !== 200) {
    throw new Error(`GET ${descURL}: unexpected status ${resp.status}`);
  }
  return parseDescription(ip, resp.body);
}

/**
 * Extracts a literal-IP host from an `http://{host}[:port]/...` URL using the
 * global URL parser (available in RN/browser/node — no node:* import). Returns
 * the host only when it parses as an IPv4 or bracketed-IPv6 literal; otherwise
 * null (a hostname is rejected, mirroring Go's net.ParseIP gate).
 */
function hostFromLocation(location: string): string | null {
  let host: string;
  try {
    host = new URL(location).hostname;
  } catch {
    return null;
  }
  // URL strips the brackets off an IPv6 host; re-detect both families.
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host)) {
    return host.split('.').every((o) => Number(o) <= 255) ? host : null;
  }
  if (host.includes(':') && /^[0-9a-fA-F:.]+$/.test(host)) {
    return host;
  }
  return null;
}
