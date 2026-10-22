// UPnP GENA event subscriptions and NOTIFY body parsing.
//
// Subscribing, renewing and cancelling go through the injected HttpTransport
// (SUBSCRIBE / UNSUBSCRIBE). Receiving the NOTIFY callbacks needs an HTTP
// listener, which is a host capability and lives outside this package; the
// host hands each NOTIFY body to parsePropertySet / parseLastChange.

import type { HttpResponse, HttpTransport } from './transport';
import { makeParser } from './soap';
import { asArray, textOf } from './xml';

/** An active event subscription on one service of one device. */
export interface EventSubscription {
  /** The subscription id (`SID` header) used to renew or cancel it. */
  sid: string;
  /** Seconds until the device drops the subscription unless renewed. */
  timeoutSeconds: number;
}

/** Variables of one LastChange instance, keyed by name (`name/channel` when channel-qualified). */
export type LastChangeValues = Record<string, string>;

/**
 * Subscribes `callbackURL` to the events of the service whose event endpoint is
 * `eventSubURL` on the device at `baseURL`.
 */
export async function subscribe(
  transport: HttpTransport,
  baseURL: string,
  eventSubURL: string,
  callbackURL: string,
  timeoutSeconds: number,
): Promise<EventSubscription> {
  const resp = await transport.request({
    method: 'SUBSCRIBE',
    url: baseURL + eventSubURL,
    headers: {
      CALLBACK: `<${callbackURL}>`,
      NT: 'upnp:event',
      TIMEOUT: timeoutHeader(timeoutSeconds),
    },
  });
  return subscriptionFrom(resp, `SUBSCRIBE ${eventSubURL}`);
}

/** Renews an existing subscription before it times out. */
export async function renewSubscription(
  transport: HttpTransport,
  baseURL: string,
  eventSubURL: string,
  sid: string,
  timeoutSeconds: number,
): Promise<EventSubscription> {
  const resp = await transport.request({
    method: 'SUBSCRIBE',
    url: baseURL + eventSubURL,
    headers: { SID: sid, TIMEOUT: timeoutHeader(timeoutSeconds) },
  });
  return subscriptionFrom(resp, `renew ${eventSubURL}`);
}

/** Cancels a subscription. THROWS on a non-200 status. */
export async function unsubscribe(
  transport: HttpTransport,
  baseURL: string,
  eventSubURL: string,
  sid: string,
): Promise<void> {
  const resp = await transport.request({
    method: 'UNSUBSCRIBE',
    url: baseURL + eventSubURL,
    headers: { SID: sid },
  });
  if (resp.status !== 200) {
    throw new Error(`UNSUBSCRIBE ${eventSubURL}: HTTP ${resp.status}`);
  }
}

/**
 * Parses a NOTIFY body (`<e:propertyset>`) into its evented variables, keyed by
 * variable name. Values are decoded text; XML-valued variables such as
 * `LastChange` or `ZoneGroupState` come back as the inner XML string.
 */
export function parsePropertySet(body: string): Record<string, string> {
  const parsed = makeParser().parse(body) as { propertyset?: { property?: unknown } };
  if (parsed.propertyset === undefined) {
    throw new Error('NOTIFY body has no propertyset');
  }
  const out: Record<string, string> = {};
  for (const property of asArray(parsed.propertyset.property)) {
    if (property === null || typeof property !== 'object') continue;
    for (const [key, value] of Object.entries(property as Record<string, unknown>)) {
      out[key] = textOf(value);
    }
  }
  return out;
}

/**
 * Parses a `LastChange` event document into its variables per InstanceID.
 * Each variable's `val` attribute is its value; a channel-qualified variable
 * (e.g. RenderingControl's per-channel `Volume`) is keyed `name/channel`.
 */
export function parseLastChange(xml: string): Record<string, LastChangeValues> {
  const parsed = makeParser().parse(xml) as { Event?: { InstanceID?: unknown } };
  if (parsed.Event === undefined) {
    throw new Error('LastChange document has no Event element');
  }
  const out: Record<string, LastChangeValues> = {};
  for (const instance of asArray(parsed.Event.InstanceID)) {
    if (instance === null || typeof instance !== 'object') continue;
    const entry = instance as Record<string, unknown>;
    const values: LastChangeValues = {};
    for (const [key, raw] of Object.entries(entry)) {
      if (key.startsWith('@_')) continue;
      for (const variable of asArray(raw)) {
        if (variable === null || typeof variable !== 'object') continue;
        const attrs = variable as Record<string, unknown>;
        const channel = textOf(attrs['@_channel']);
        values[channel === '' ? key : `${key}/${channel}`] = textOf(attrs['@_val']);
      }
    }
    out[textOf(entry['@_val'])] = values;
  }
  return out;
}

/** Formats a GENA `TIMEOUT` header. */
function timeoutHeader(timeoutSeconds: number): string {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new RangeError(`timeoutSeconds must be a positive integer, got ${timeoutSeconds}`);
  }
  return `Second-${timeoutSeconds}`;
}

/**
 * Reads the subscription out of a SUBSCRIBE response. THROWS on a non-200
 * status or a response without a `SID` / parseable `TIMEOUT` header.
 */
function subscriptionFrom(resp: HttpResponse, what: string): EventSubscription {
  if (resp.status !== 200) {
    throw new Error(`${what}: HTTP ${resp.status}`);
  }
  const sid = resp.headers['sid'];
  if (!sid) {
    throw new Error(`${what}: response carried no SID`);
  }
  const timeout = resp.headers['timeout'] ?? '';
  const match = /^Second-(\d+)$/i.exec(timeout.trim());
  if (!match) {
    throw new Error(`${what}: unparseable TIMEOUT "${timeout}"`);
  }
  return { sid, timeoutSeconds: Number(match[1]) };
}
