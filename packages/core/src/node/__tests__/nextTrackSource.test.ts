import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { SonosDevice, escapeXMLText } from '@orkester/sonos-api';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../sonos';
import { NodeNextTrackSource } from '../nextTrackSource';

// Offline loopback test: a scripted transport stands in for the speaker's
// SUBSCRIBE/UNSUBSCRIBE endpoint and the test POSTs NOTIFYs to the real
// listener on 127.0.0.1. NO real speaker is contacted.

const BASE = 'http://127.0.0.1:1400';

function didl(title: string): string {
  return (
    '<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
    `<item><dc:title>${title}</dc:title><dc:creator>James Horner</dc:creator><upnp:album>A Beautiful Mind</upnp:album></item></DIDL-Lite>`
  );
}

function notifyBody(title: string): string {
  const lastChange =
    '<Event xmlns="urn:schemas-upnp-org:metadata-1-0/AVT/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/">' +
    `<InstanceID val="0"><r:NextTrackMetaData val="${escapeXMLText(didl(title))}"/></InstanceID></Event>`;
  return `<e:propertyset xmlns:e="urn:schemas-upnp-org:event-1-0"><e:property><LastChange>${escapeXMLText(lastChange)}</LastChange></e:property></e:propertyset>`;
}

function notify(callbackURL: string, sid: string, seq: number, body: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(callbackURL, { method: 'NOTIFY', headers: { SID: sid, SEQ: String(seq) } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Answers SUBSCRIBE/UNSUBSCRIBE like a speaker, optionally sending the seq 0 event. */
class FakeSpeaker implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  callbackURL = '';
  initialTitle: string | null = 'All Love Can Be';
  failSubscribe = false;
  private sids = 0;

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    if (req.method === 'UNSUBSCRIBE') return Promise.resolve({ status: 200, headers: {}, body: '' });
    if (this.failSubscribe) return Promise.resolve({ status: 500, headers: {}, body: '' });
    const sid = `uuid:sub-${++this.sids}`;
    this.callbackURL = /^<(.*)>$/.exec(req.headers?.CALLBACK ?? '')?.[1] ?? '';
    if (this.initialTitle !== null) {
      setTimeout(() => void notify(this.callbackURL, sid, 0, notifyBody(this.initialTitle!)), 10);
    }
    return Promise.resolve({ status: 200, headers: { sid, timeout: 'Second-1800' }, body: '' });
  }

  of(method: string): HttpRequest[] {
    return this.requests.filter((r) => r.method === method);
  }
}

describe('NodeNextTrackSource', () => {
  let source: NodeNextTrackSource;
  let errors: Error[];
  afterEach(() => source.close());

  function setup(): { speaker: FakeSpeaker; device: SonosDevice } {
    errors = [];
    source = new NodeNextTrackSource((err) => errors.push(err));
    const speaker = new FakeSpeaker();
    return { speaker, device: new SonosDevice(speaker, BASE) };
  }

  it('subscribes once and the first request already has the initial event', async () => {
    const { speaker, device } = setup();
    expect(await source.nextTrack(device)).toEqual({ title: 'All Love Can Be', artist: 'James Horner', album: 'A Beautiful Mind' });
    await source.nextTrack(device);
    expect(speaker.of('SUBSCRIBE')).toHaveLength(1);
    expect(speaker.callbackURL).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
    expect(errors).toEqual([]);
  });

  it('updates the cached track on a later event', async () => {
    const { speaker, device } = setup();
    await source.nextTrack(device);
    expect(await notify(speaker.callbackURL, 'uuid:sub-1', 1, notifyBody('Kiss'))).toBe(200);
    expect((await source.nextTrack(device))?.title).toBe('Kiss');
  });

  it('does not hang when no initial event arrives', async () => {
    const { speaker, device } = setup();
    speaker.initialTitle = null;
    expect(await source.nextTrack(device)).toBeNull();
  });

  it('unsubscribes a released coordinator', async () => {
    const { speaker, device } = setup();
    await source.nextTrack(device);
    source.release(device);
    await source.close();
    expect(speaker.of('UNSUBSCRIBE').map((r) => r.headers?.SID)).toEqual(['uuid:sub-1']);
  });

  it('reports a failed subscribe and retries on the next request', async () => {
    const { speaker, device } = setup();
    speaker.failSubscribe = true;
    expect(await source.nextTrack(device)).toBeNull();
    expect(errors).toHaveLength(1);
    speaker.failSubscribe = false;
    expect((await source.nextTrack(device))?.title).toBe('All Love Can Be');
    expect(speaker.of('SUBSCRIBE')).toHaveLength(2);
  });

  it('reports a malformed NOTIFY', async () => {
    const { speaker, device } = setup();
    await source.nextTrack(device);
    expect(await notify(speaker.callbackURL, 'uuid:sub-1', 1, '<garbage/>')).toBe(400);
    expect(errors).toHaveLength(1);
  });
});
