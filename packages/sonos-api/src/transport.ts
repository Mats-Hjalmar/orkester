// The HTTP transport contract every Sonos call goes through.
// TYPES ONLY — zero runtime values. Hosts inject a concrete implementation
// (React Native fetch, node:http, a test mock), so this package never touches
// the network or a platform builtin itself.

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
  /** Response headers, keys lowercased. */
  headers: Record<string, string>;
  body: string;
}

/**
 * Performs HTTP(-ish) requests against a Sonos device's control and event
 * endpoints. Implementations live outside this package.
 */
export interface HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse>;
}
