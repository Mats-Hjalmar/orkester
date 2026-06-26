// Node.js HttpTransport adapter.
//
// This is one of the ONLY two places in @orkester/core allowed to import
// node:* (the other being discoveryTransport.ts). Everything under src/node/**
// is the Node platform adapter layer; the RN-facing core surface (src/index.ts,
// src/sonos, src/engine, src/api, src/state, src/theme) must stay node:*-free so
// it bundles for React Native. The static import-graph guard (chunk-9) enforces
// that boundary.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { IncomingMessage } from 'node:http';

import type { HttpRequest, HttpResponse, HttpTransport } from '../sonos';

/**
 * Concrete {@link HttpTransport} backed by node:http / node:https. Honors the
 * request method, headers, body and timeoutMs, and surfaces the response as
 * `{ status, headers (keys lowercased), body }`.
 *
 * No silent fallbacks: a non-2xx status is NOT an error here — it is returned
 * verbatim so the SOAP layer can decode UPnP faults. Transport-level failures
 * (connection refused, timeout, abort) reject the returned promise.
 */
export class NodeHttpTransport implements HttpTransport {
  request(req: HttpRequest): Promise<HttpResponse> {
    const url = new URL(req.url);
    const isHttps = url.protocol === 'https:';
    const doRequest = isHttps ? httpsRequest : httpRequest;

    // Sonos's UPnP/SOAP server does NOT accept a chunked request body: Node uses
    // Transfer-Encoding: chunked whenever a body is write()n without a known
    // length, and the speaker then hangs waiting for a Content-Length — so every
    // control call timed out. Buffer the body and send it with an explicit
    // Content-Length via end(body): one measured POST, no chunked encoding.
    const bodyBuf = req.body !== undefined ? Buffer.from(req.body, 'utf8') : undefined;
    const headers: Record<string, string | number> = { ...req.headers };
    if (bodyBuf !== undefined) headers['Content-Length'] = bodyBuf.length;

    return new Promise<HttpResponse>((resolve, reject) => {
      const clientReq = doRequest(
        url,
        {
          method: req.method,
          headers,
        },
        (res: IncomingMessage) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              // res.statusCode is only undefined before the response head has
              // been received; in the 'response' callback it is always set.
              status: res.statusCode ?? 0,
              headers: lowercaseHeaders(res.headers),
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
          res.on('error', reject);
        },
      );

      if (req.timeoutMs !== undefined) {
        clientReq.setTimeout(req.timeoutMs, () => {
          // setTimeout does not abort the socket on its own; destroy with an
          // explicit error so the promise rejects rather than hanging.
          clientReq.destroy(
            new Error(`request to ${req.url} timed out after ${req.timeoutMs}ms`),
          );
        });
      }

      clientReq.on('error', reject);

      // end(body) with the Content-Length set above — never a chunked write().
      clientReq.end(bodyBuf);
    });
  }
}

/**
 * Flattens node:http's `IncomingHttpHeaders` (string | string[] | undefined)
 * into a `Record<string,string>` with lowercased keys. Multi-valued headers are
 * joined with ", " (matching how a single header line would appear). Mirrors the
 * lowercased-key contract used everywhere else in the engine.
 */
function lowercaseHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}
