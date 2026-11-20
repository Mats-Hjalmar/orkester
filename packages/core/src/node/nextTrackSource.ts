// Node.js NextTrackSource: the Spotify Connect next track, read from AVTransport
// GENA events (the only place a speaker reports it; see
// findings/spotify-connect-up-next.md).

import { createSocket } from 'node:dgram';
import type { SonosDevice } from '@orkester/sonos-api';
import type { NextTrackSource } from '../api';
import { upNextFromLastChange, type UpNext } from '../engine';
import { NodeEventListener, type EventNotification } from './eventListener';

/** How long the first request for a coordinator waits for its initial (seq 0) event. */
const INITIAL_EVENT_WAIT_MS = 1500;

interface Subscription {
  device: SonosDevice;
  sid: string;
  upNext: UpNext | null;
  renewal: ReturnType<typeof setTimeout> | undefined;
  /** Settles once the subscription is made (or has failed); never rejects. */
  ready: Promise<void>;
  /** Settles on the first event, so the first poll can wait for it. */
  firstEvent: Promise<void>;
  gotFirstEvent: () => void;
}

/**
 * Subscribes to each Spotify Connect group coordinator's AVTransport events and
 * caches the next track each one reports. Subscribe/renew/unsubscribe failures
 * and malformed events go to `onError`; they never make `nextTrack` throw.
 */
export class NodeNextTrackSource implements NextTrackSource {
  private readonly listener = new NodeEventListener(
    (event) => this.onEvent(event),
    (err) => this.onError(err),
  );
  private callbackURL: Promise<string> | undefined;
  /** Keyed by the coordinator's base URL. */
  private readonly subs = new Map<string, Subscription>();
  private readonly baseBySid = new Map<string, string>();
  /** Events that arrived before their SUBSCRIBE response did. */
  private readonly early = new Map<string, EventNotification>();

  constructor(private readonly onError: (error: Error) => void) {}

  async nextTrack(coordinator: SonosDevice): Promise<UpNext | null> {
    const known = this.subs.get(coordinator.baseURL);
    if (known) return known.upNext;
    const sub = this.track(coordinator);
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      sub.ready.then(() => (sub.sid === '' ? undefined : sub.firstEvent)),
      new Promise<void>((resolve) => (timer = setTimeout(resolve, INITIAL_EVENT_WAIT_MS))),
    ]);
    clearTimeout(timer);
    return sub.upNext;
  }

  release(coordinator: SonosDevice): void {
    const sub = this.subs.get(coordinator.baseURL);
    if (sub) void this.drop(sub);
  }

  /** Unsubscribes every coordinator and stops the event listener. */
  async close(): Promise<void> {
    await Promise.all([...this.subs.values()].map((sub) => this.drop(sub)));
    if (this.callbackURL) await this.listener.close();
    this.callbackURL = undefined;
  }

  private track(device: SonosDevice): Subscription {
    let gotFirstEvent!: () => void;
    const firstEvent = new Promise<void>((resolve) => (gotFirstEvent = resolve));
    const sub: Subscription = {
      device,
      sid: '',
      upNext: null,
      renewal: undefined,
      ready: Promise.resolve(),
      firstEvent,
      gotFirstEvent,
    };
    this.subs.set(device.baseURL, sub);
    sub.ready = this.subscribe(sub);
    return sub;
  }

  private async subscribe(sub: Subscription): Promise<void> {
    try {
      const { sid, timeoutSeconds } = await sub.device.AVTransport.subscribe(
        await this.callbackFor(sub.device.baseURL),
      );
      if (this.subs.get(sub.device.baseURL) !== sub) {
        // Released while the SUBSCRIBE was in flight.
        await sub.device.AVTransport.unsubscribe(sid);
        return;
      }
      sub.sid = sid;
      this.baseBySid.set(sid, sub.device.baseURL);
      const early = this.early.get(sid);
      this.early.delete(sid);
      if (early) this.onEvent(early);
      sub.renewal = setTimeout(() => void this.renew(sub, timeoutSeconds), (timeoutSeconds * 1000) / 2);
      sub.renewal.unref();
    } catch (err) {
      // Forget it so the next poll subscribes afresh.
      if (this.subs.get(sub.device.baseURL) === sub) this.subs.delete(sub.device.baseURL);
      this.onError(asError(err));
    }
  }

  private async renew(sub: Subscription, timeoutSeconds: number): Promise<void> {
    try {
      const renewed = await sub.device.AVTransport.renewSubscription(sub.sid, timeoutSeconds);
      sub.renewal = setTimeout(() => void this.renew(sub, renewed.timeoutSeconds), (renewed.timeoutSeconds * 1000) / 2);
      sub.renewal.unref();
    } catch (err) {
      this.onError(asError(err));
      this.baseBySid.delete(sub.sid);
      sub.sid = '';
      sub.ready = this.subscribe(sub);
    }
  }

  private async drop(sub: Subscription): Promise<void> {
    if (this.subs.get(sub.device.baseURL) === sub) this.subs.delete(sub.device.baseURL);
    clearTimeout(sub.renewal);
    await sub.ready;
    if (sub.sid === '') return;
    this.baseBySid.delete(sub.sid);
    try {
      await sub.device.AVTransport.unsubscribe(sub.sid);
    } catch (err) {
      this.onError(asError(err));
    }
  }

  private onEvent(event: EventNotification): void {
    const base = this.baseBySid.get(event.sid);
    if (base === undefined) {
      this.early.set(event.sid, event);
      return;
    }
    const sub = this.subs.get(base);
    const lastChange = event.properties['LastChange'];
    if (!sub || lastChange === undefined) return;
    try {
      sub.upNext = upNextFromLastChange(lastChange);
    } catch (err) {
      this.onError(asError(err));
    }
    sub.gotFirstEvent();
  }

  /** Starts the listener on first use, bound to the address `speakerBase` reaches us on. */
  private callbackFor(speakerBase: string): Promise<string> {
    this.callbackURL ??= localAddressFor(new URL(speakerBase))
      .then((host) => this.listener.listen(host))
      .catch((err: unknown) => {
        this.callbackURL = undefined;
        throw err;
      });
    return this.callbackURL;
  }
}

/**
 * The local address the OS routes to `speaker` from. A connected UDP socket
 * sends nothing; it only picks the route, which is right on any subnet size
 * (matching octets is not: a /16 LAN puts speakers on other /24s).
 */
function localAddressFor(speaker: URL): Promise<string> {
  const socket = createSocket('udp4');
  return new Promise<string>((resolve, reject) => {
    socket.once('error', reject);
    socket.connect(Number(speaker.port), speaker.hostname, () => resolve(socket.address().address));
  }).finally(() => socket.close());
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
