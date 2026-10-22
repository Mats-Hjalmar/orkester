// The base every generated service client extends: one device base URL, one
// service descriptor, a typed SOAP invoke and GENA subscription management.

import type { HttpTransport } from './transport';
import { SOAPCall, parseResponseArgs, type Arg } from './soap';
import {
  renewSubscription,
  subscribe,
  unsubscribe,
  type EventSubscription,
} from './events';

/** The default GENA subscription lifetime requested, in seconds. */
export const DEFAULT_SUBSCRIPTION_SECONDS = 1800;

/** Identifies a UPnP service and its endpoints on a device. */
export interface ServiceDescriptor {
  /** Short service name, e.g. `AVTransport`. */
  name: string;
  /** Service type URN, used as the SOAP namespace and SOAPACTION prefix. */
  serviceType: string;
  /** Service id URN. */
  serviceId: string;
  /** Control endpoint path, appended to the device base URL. */
  controlURL: string;
  /** Event subscription endpoint path, appended to the device base URL. */
  eventSubURL: string;
}

/**
 * A client for one UPnP service on one Sonos device. Every action call and
 * subscription goes to `baseURL` (`http://{ip}:1400`) through the injected
 * transport.
 */
export abstract class SonosService {
  /** The service this client talks to. */
  abstract readonly descriptor: ServiceDescriptor;

  /**
   * @param transport - Performs the HTTP requests.
   * @param baseURL - The device base URL, e.g. `http://192.168.1.10:1400`.
   */
  constructor(
    protected readonly transport: HttpTransport,
    readonly baseURL: string,
  ) {}

  /** Subscribes `callbackURL` to this service's events. */
  subscribe(
    callbackURL: string,
    timeoutSeconds = DEFAULT_SUBSCRIPTION_SECONDS,
  ): Promise<EventSubscription> {
    return subscribe(this.transport, this.baseURL, this.descriptor.eventSubURL, callbackURL, timeoutSeconds);
  }

  /** Renews the subscription `sid` on this service. */
  renewSubscription(
    sid: string,
    timeoutSeconds = DEFAULT_SUBSCRIPTION_SECONDS,
  ): Promise<EventSubscription> {
    return renewSubscription(this.transport, this.baseURL, this.descriptor.eventSubURL, sid, timeoutSeconds);
  }

  /** Cancels the subscription `sid` on this service. */
  unsubscribe(sid: string): Promise<void> {
    return unsubscribe(this.transport, this.baseURL, this.descriptor.eventSubURL, sid);
  }

  /**
   * Calls `action` with the encoded arguments and returns its output arguments
   * as text. A UPnP fault is thrown as a SonosFault.
   */
  protected async invoke(action: string, args: Arg[]): Promise<Record<string, string>> {
    const body = await SOAPCall(
      this.transport,
      this.baseURL,
      { type: this.descriptor.serviceType, controlURL: this.descriptor.controlURL },
      action,
      args,
    );
    return parseResponseArgs(body, action);
  }
}
