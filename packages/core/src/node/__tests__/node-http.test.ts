import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NodeHttpTransport } from '../httpTransport';

// Offline loopback test: a real http.Server on 127.0.0.1 stands in for a Sonos
// control endpoint. NO real speaker is contacted. We assert the request method,
// headers and body reach the server intact, and that the response is mapped to
// { status, headers (keys lowercased), body }.

// Canned SOAP envelope a Sonos device would return from a GetPositionInfo call.
const CANNED_SOAP_BODY =
  '<?xml version="1.0"?>' +
  '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
  '<s:Body><u:GetPositionInfoResponse>OK</u:GetPositionInfoResponse></s:Body>' +
  '</s:Envelope>';

interface CapturedRequest {
  method?: string;
  url?: string;
  soapAction?: string | string[];
  contentType?: string | string[];
  contentLength?: string | string[];
  transferEncoding?: string | string[];
  body: string;
}

describe('NodeHttpTransport (loopback http.Server)', () => {
  let baseUrl: string;
  let captured: CapturedRequest;
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      captured = {
        method: req.method,
        url: req.url,
        soapAction: req.headers['soapaction'],
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        transferEncoding: req.headers['transfer-encoding'],
        body: Buffer.concat(chunks).toString('utf8'),
      };
      // Mixed-case response header to exercise the lowercased-key contract.
      res.writeHead(200, {
        'Content-Type': 'text/xml; charset="utf-8"',
        'X-Sonos-Test': 'yes',
      });
      res.end(CANNED_SOAP_BODY);
    });
  });

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('round-trips a POST with SOAPACTION and maps the response', async () => {
    const transport = new NodeHttpTransport();
    const soapAction =
      '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"';
    const requestBody =
      '<?xml version="1.0"?><s:Envelope><s:Body>request</s:Body></s:Envelope>';

    const res = await transport.request({
      method: 'POST',
      url: `${baseUrl}/MediaRenderer/AVTransport/Control`,
      headers: {
        SOAPACTION: soapAction,
        'Content-Type': 'text/xml; charset="utf-8"',
      },
      body: requestBody,
      timeoutMs: 5000,
    });

    // Request reached the server intact.
    expect(captured.method).toBe('POST');
    expect(captured.url).toBe('/MediaRenderer/AVTransport/Control');
    expect(captured.soapAction).toBe(soapAction);
    expect(captured.body).toBe(requestBody);

    // Sonos's UPnP server hangs on a chunked request body — the transport MUST
    // send an explicit Content-Length and NOT Transfer-Encoding: chunked.
    expect(captured.contentLength).toBe(String(Buffer.byteLength(requestBody)));
    expect(captured.transferEncoding).toBeUndefined();

    // Response is mapped: status, lowercased headers, body.
    expect(res.status).toBe(200);
    expect(res.body).toBe(CANNED_SOAP_BODY);
    expect(res.headers['content-type']).toBe('text/xml; charset="utf-8"');
    expect(res.headers['x-sonos-test']).toBe('yes');
    // Header keys must be lowercased — the original mixed-case keys are absent.
    expect(res.headers['X-Sonos-Test']).toBeUndefined();
  });

  it('returns non-2xx verbatim instead of throwing (no silent fault swallowing)', async () => {
    const transport = new NodeHttpTransport();
    // Spin up a second server that always 500s with a UPnP fault body.
    const faultServer = createServer((_req, faultRes) => {
      faultRes.writeHead(500, { 'Content-Type': 'text/xml' });
      faultRes.end('<s:Fault>upnp error</s:Fault>');
    });
    await new Promise<void>((resolve) =>
      faultServer.listen(0, '127.0.0.1', resolve),
    );
    const { port } = faultServer.address() as AddressInfo;
    try {
      const res = await transport.request({
        method: 'POST',
        url: `http://127.0.0.1:${port}/Control`,
        body: 'x',
      });
      expect(res.status).toBe(500);
      expect(res.body).toContain('upnp error');
    } finally {
      await new Promise<void>((resolve) => faultServer.close(() => resolve()));
    }
  });
});
