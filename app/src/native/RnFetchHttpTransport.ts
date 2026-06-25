// React Native HttpTransport — speaks UPnP SOAP to a speaker over RN's fetch.
//
// Mirrors NodeHttpTransport's CONTRACT exactly: a non-2xx status is NOT thrown —
// it is returned verbatim ({ status, headers, body }) so the engine's SOAP layer
// can decode a UPnP fault out of a 500. Only transport-level failures (no route,
// timeout, abort) reject. Headers are lowercased to match the engine's contract.
//
// node-free (RN fetch only) — but this file lives under app/src/native and is
// imported ONLY behind Platform.OS !== 'web', so the web bundle never pulls it.

import type { HttpRequest, HttpResponse, HttpTransport } from '@orkester/core';

const DEFAULT_TIMEOUT_MS = 5000;

export class RnFetchHttpTransport implements HttpTransport {
  async request(req: HttpRequest): Promise<HttpResponse> {
    const controller = new AbortController();
    const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Speakers serve plain HTTP on :1400 — usesCleartextTraffic must be on
      // (see app.json expo-build-properties). fetch surfaces any non-2xx as a
      // normal Response, so we read it instead of throwing (contract parity with
      // NodeHttpTransport).
      const resp = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
      });
      const body = await resp.text();
      const headers: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { status: resp.status, headers, body };
    } finally {
      clearTimeout(timer);
    }
  }
}
