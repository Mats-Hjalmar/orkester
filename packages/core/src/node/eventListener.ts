// Node.js receiver for UPnP GENA event NOTIFYs.
//
// Subscriptions are made through any @orkester/sonos-api service client
// (`device.AVTransport.subscribe(callbackURL)`); the speaker then POSTs NOTIFY
// requests to that callback URL, which this listener serves.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parsePropertySet } from '@orkester/sonos-api';

/** One event a speaker delivered. */
export interface EventNotification {
  /** The subscription id the event belongs to. */
  sid: string;
  /** The per-subscription event sequence number (0 for the initial state). */
  seq: number;
  /** The evented variables, keyed by name, as decoded text. */
  properties: Record<string, string>;
}

/**
 * An HTTP server that accepts GENA NOTIFY requests and hands each parsed event
 * to `onEvent`. A malformed NOTIFY is answered 400 and reported to `onError`
 * rather than dropped silently.
 */
export class NodeEventListener {
  private server: Server | undefined;

  /**
   * @param onEvent - Receives every well-formed event.
   * @param onError - Receives every NOTIFY that could not be parsed.
   */
  constructor(
    private readonly onEvent: (event: EventNotification) => void,
    private readonly onError: (error: Error) => void,
  ) {}

  /**
   * Starts listening and resolves with the callback URL to subscribe with.
   * `host` must be this machine's LAN address as the speakers reach it; port 0
   * picks a free port.
   */
  listen(host: string, port = 0): Promise<string> {
    if (this.server) {
      throw new Error('event listener is already listening');
    }
    const server = createServer((req, res) => void this.handle(req, res));
    this.server = server;
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve(`http://${host}:${(server.address() as AddressInfo).port}/`);
      });
    });
  }

  /** Stops the server. */
  close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }

  /** Answers one request: parses a NOTIFY, rejects anything else. */
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'NOTIFY') {
      res.writeHead(405).end();
      return;
    }
    const sid = req.headers['sid'];
    try {
      if (typeof sid !== 'string' || sid === '') {
        throw new Error('NOTIFY without SID');
      }
      const properties = parsePropertySet(await readBody(req));
      res.writeHead(200).end();
      this.onEvent({ sid, seq: Number(req.headers['seq'] ?? 0), properties });
    } catch (err) {
      res.writeHead(400).end();
      this.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}

/** Reads a request body as UTF-8 text. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
