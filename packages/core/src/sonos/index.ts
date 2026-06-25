// Transport-layer contracts for talking to Sonos devices.
// TYPES ONLY — zero runtime values. The concrete engine lives elsewhere.

/** A single HTTP request the transport must perform. */
export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'SUBSCRIBE' | 'UNSUBSCRIBE';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

/** The response surfaced back from a performed HTTP request. */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/**
 * Performs HTTP(-ish) requests against a Sonos device's control endpoints.
 * Implementations live outside @orkester/core (RN fetch, node http, etc.).
 */
export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}

/** A device discovered on the local network via SSDP. */
export interface SSDPResult {
  /** Source IP address of the responding device. */
  address: string;
  /** The `LOCATION` header — URL of the device description document. */
  location: string;
  /** The `USN` header uniquely identifying the device. */
  usn: string;
  /** The `ST`/`NT` search target the device matched. */
  searchTarget: string;
  /** Raw response headers, lowercased keys. */
  headers: Record<string, string>;
}

/** A UPnP service exposed by a discovered device. */
export interface Service {
  /** The UPnP service type URN, e.g. `urn:schemas-upnp-org:service:AVTransport:1`. */
  serviceType: string;
  /** The service identifier URN. */
  serviceId: string;
  /** Relative control endpoint URL. */
  controlURL: string;
  /** Relative event subscription endpoint URL. */
  eventSubURL: string;
  /** Relative service description (SCPD) URL. */
  scpdURL: string;
}

/** Parameters for a discovery run. */
export interface DiscoverOptions {
  /** How long to listen for SSDP responses, in milliseconds. */
  waitMs: number;
  /** Invoked for each device as it responds. */
  onResult: (result: SSDPResult) => void;
  /** Allows the caller to abort the discovery early. */
  signal?: AbortSignal;
}

/**
 * Discovers Sonos devices on the local network.
 * Implementations live outside @orkester/core (node dgram, RN UDP, etc.).
 */
export interface DiscoveryTransport {
  discover(options: DiscoverOptions): Promise<void>;
}
