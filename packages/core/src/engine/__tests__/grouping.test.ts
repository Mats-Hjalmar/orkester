import { describe, expect, it } from 'vitest';
import type { HttpRequest, HttpResponse, HttpTransport } from '../../sonos';
import { AV_TRANSPORT_TYPE } from '../control';
import * as control from '../control';
import { SonosClient, type ResolvedRoom } from '../client';
import type { Group, Member } from '../topology';

// Mock-transport coverage for the newly-ported engine ops: grouping
// (join/leave/SetAVTransportURI), TRACK_NR + REL_TIME seek, and shuffle/repeat
// (Get/SetPlayMode). Asserts the exact envelopes + the base-routing rule
// (join/leave -> member base; seek/playmode -> coordinator base). No node:*, no
// network: a hand-rolled recording transport returns canned bodies.

class RecordingTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];
  private readonly responses: HttpResponse[];

  constructor(responses: HttpResponse[] = []) {
    this.responses = [...responses];
  }

  request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    const next = this.responses.shift();
    // Most state-changing ops return an empty 200 body; default to that.
    return Promise.resolve(next ?? { status: 200, headers: {}, body: '' });
  }
}

function ok(body: string): HttpResponse {
  return { status: 200, headers: {}, body };
}

function soapResponse(action: string, inner: string): string {
  return (
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    `<s:Body><u:${action}Response xmlns:u="${AV_TRANSPORT_TYPE}">` +
    inner +
    `</u:${action}Response></s:Body></s:Envelope>`
  );
}

const COORD_BASE = 'http://192.168.1.10:1400';
const MEMBER_BASE = 'http://192.168.1.11:1400';
const AV_CONTROL = '/MediaRenderer/AVTransport/Control';

describe('PlayMode <-> {shuffle, repeat} mapping', () => {
  it('round-trips every canonical PlayMode', () => {
    const cases: Array<[string, boolean, control.RepeatMode]> = [
      ['NORMAL', false, 'none'],
      ['REPEAT_ALL', false, 'all'],
      ['REPEAT_ONE', false, 'one'],
      ['SHUFFLE', true, 'all'],
      ['SHUFFLE_NOREPEAT', true, 'none'],
      ['SHUFFLE_REPEAT_ONE', true, 'one'],
    ];
    for (const [mode, shuffle, repeat] of cases) {
      expect(control.playModeToSettings(mode)).toEqual({ shuffle, repeat });
      expect(control.settingsToPlayMode({ shuffle, repeat })).toBe(mode);
    }
  });

  it('throws on an unknown PlayMode rather than coercing to NORMAL', () => {
    expect(() => control.playModeToSettings('WAT')).toThrow(/unknown PlayMode/);
    expect(() => control.playModeToSettings('')).toThrow(/unknown PlayMode/);
  });

  it('throws on an unknown repeat mode', () => {
    expect(() =>
      control.settingsToPlayMode({ shuffle: false, repeat: 'sometimes' as control.RepeatMode }),
    ).toThrow(/unknown repeat/);
  });
});

describe('formatRelTime / parseRelTime', () => {
  it('formats whole seconds as H:MM:SS', () => {
    expect(control.formatRelTime(0)).toBe('0:00:00');
    expect(control.formatRelTime(83)).toBe('0:01:23');
    expect(control.formatRelTime(3661)).toBe('1:01:01');
    expect(control.formatRelTime(-5)).toBe('0:00:00'); // clamped
    expect(control.formatRelTime(83.9)).toBe('0:01:23'); // floored
  });

  it('parses H:MM:SS and MM:SS back to seconds (inverse of format)', () => {
    expect(control.parseRelTime('0:01:23')).toBe(83);
    expect(control.parseRelTime('1:01:01')).toBe(3661);
    expect(control.parseRelTime('01:23')).toBe(83);
  });

  it('returns 0 for live-stream / empty / garbage positions (no throw)', () => {
    expect(control.parseRelTime('NOT_IMPLEMENTED')).toBe(0);
    expect(control.parseRelTime('')).toBe(0);
    expect(control.parseRelTime('   ')).toBe(0);
    expect(control.parseRelTime('abc')).toBe(0);
  });

  it('round-trips format(parse(x)) for a real position', () => {
    expect(control.formatRelTime(control.parseRelTime('0:01:23'))).toBe('0:01:23');
  });
});

describe('setAVTransportURI envelope', () => {
  it('POSTs to the coordinator base with CurrentURI + an empty metadata element', async () => {
    const t = new RecordingTransport([ok(soapResponse('SetAVTransportURI', ''))]);
    await control.setAVTransportURI(t, COORD_BASE, 'x-rincon:RINCON_AAAA01400', '');

    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.url).toBe(COORD_BASE + AV_CONTROL);
    expect(req.headers?.['SOAPACTION']).toBe(`"${AV_TRANSPORT_TYPE}#SetAVTransportURI"`);
    expect(req.body).toContain('<CurrentURI>x-rincon:RINCON_AAAA01400</CurrentURI>');
    expect(req.body).toContain('<CurrentURIMetaData></CurrentURIMetaData>');
    expect(req.body).not.toContain('<CurrentURIMetaData/>');
  });
});

describe('joinGroup', () => {
  it('sends x-rincon:<coordUUID> to the MEMBER base (not the coordinator)', async () => {
    const t = new RecordingTransport();
    await control.joinGroup(t, MEMBER_BASE, 'RINCON_AAAA01400');

    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.url).toBe(MEMBER_BASE + AV_CONTROL);
    expect(req.body).toContain('<CurrentURI>x-rincon:RINCON_AAAA01400</CurrentURI>');
    expect(req.body).toContain('<u:SetAVTransportURI');
  });
});

describe('leaveGroup', () => {
  it('sends BecomeCoordinatorOfStandaloneGroup to the MEMBER base', async () => {
    const t = new RecordingTransport();
    await control.leaveGroup(t, MEMBER_BASE);

    expect(t.requests).toHaveLength(1);
    const req = t.requests[0];
    expect(req.url).toBe(MEMBER_BASE + AV_CONTROL);
    expect(req.headers?.['SOAPACTION']).toBe(
      `"${AV_TRANSPORT_TYPE}#BecomeCoordinatorOfStandaloneGroup"`,
    );
    expect(req.body).toContain('<u:BecomeCoordinatorOfStandaloneGroup');
    expect(req.body).toContain('<InstanceID>0</InstanceID>');
  });
});

describe('seek (REL_TIME) + seekTrack (TRACK_NR)', () => {
  it('REL_TIME seek formats seconds and POSTs to the coordinator', async () => {
    const t = new RecordingTransport();
    await control.seek(t, COORD_BASE, 83);

    const req = t.requests[0];
    expect(req.url).toBe(COORD_BASE + AV_CONTROL);
    expect(req.headers?.['SOAPACTION']).toBe(`"${AV_TRANSPORT_TYPE}#Seek"`);
    expect(req.body).toContain('<Unit>REL_TIME</Unit>');
    expect(req.body).toContain('<Target>0:01:23</Target>');
  });

  it('TRACK_NR seek targets a 1-based track on the coordinator', async () => {
    const t = new RecordingTransport();
    await control.seekTrack(t, COORD_BASE, 4);

    const req = t.requests[0];
    expect(req.body).toContain('<Unit>TRACK_NR</Unit>');
    expect(req.body).toContain('<Target>4</Target>');
  });
});

describe('getTransportSettings / setPlayMode', () => {
  it('decodes a canned PlayMode into {shuffle, repeat}', async () => {
    const t = new RecordingTransport([
      ok(soapResponse('GetTransportSettings', '<PlayMode>SHUFFLE_NOREPEAT</PlayMode><RecQualityMode>NOT_IMPLEMENTED</RecQualityMode>')),
    ]);
    const settings = await control.getTransportSettings(t, COORD_BASE);
    expect(settings).toEqual({ shuffle: true, repeat: 'none' });
    expect(t.requests[0].url).toBe(COORD_BASE + AV_CONTROL);
  });

  it('throws when the speaker reports an unknown PlayMode', async () => {
    const t = new RecordingTransport([ok(soapResponse('GetTransportSettings', '<PlayMode>WAT</PlayMode>'))]);
    await expect(control.getTransportSettings(t, COORD_BASE)).rejects.toThrow(/unknown PlayMode/);
  });

  it('setPlayMode sends the mapped NewPlayMode to the coordinator', async () => {
    const t = new RecordingTransport();
    await control.setPlayMode(t, COORD_BASE, { shuffle: true, repeat: 'one' });

    const req = t.requests[0];
    expect(req.headers?.['SOAPACTION']).toBe(`"${AV_TRANSPORT_TYPE}#SetPlayMode"`);
    expect(req.body).toContain('<NewPlayMode>SHUFFLE_REPEAT_ONE</NewPlayMode>');
  });
});

// --- SonosClient base-routing: join/leave -> member, seek/playmode -> coord ---

function member(uuid: string, ip: string, zoneName: string): Member {
  return { uuid, zoneName, ip, location: `http://${ip}:1400/x`, softwareVersion: '15.9', invisible: false };
}

function resolvedRoom(): ResolvedRoom {
  // member (Bedroom, .11) is part of a group coordinated by Living Room (.10).
  const coord = member('RINCON_AAAA01400', '192.168.1.10', 'Living Room');
  const bedroom = member('RINCON_BBBB01400', '192.168.1.11', 'Bedroom');
  const group: Group = { id: 'g1', coordinator: coord.uuid, members: [coord, bedroom] };
  return { member: bedroom, group };
}

describe('SonosClient grouping/seek base routing', () => {
  const transports = (t: HttpTransport) => ({
    http: t,
    discovery: { discover: async () => {} },
  });

  it('joinGroup routes to the joining member base, not the coordinator', async () => {
    const t = new RecordingTransport();
    const client = new SonosClient(transports(t));
    await client.joinGroup(resolvedRoom(), 'RINCON_CCCC01400');

    expect(t.requests[0].url).toBe(MEMBER_BASE + AV_CONTROL);
    expect(t.requests[0].body).toContain('<CurrentURI>x-rincon:RINCON_CCCC01400</CurrentURI>');
  });

  it('leaveGroup routes to the member base', async () => {
    const t = new RecordingTransport();
    const client = new SonosClient(transports(t));
    await client.leaveGroup(resolvedRoom());

    expect(t.requests[0].url).toBe(MEMBER_BASE + AV_CONTROL);
    expect(t.requests[0].body).toContain('<u:BecomeCoordinatorOfStandaloneGroup');
  });

  it('seek routes to the COORDINATOR base', async () => {
    const t = new RecordingTransport();
    const client = new SonosClient(transports(t));
    await client.seek(resolvedRoom(), 83);

    expect(t.requests[0].url).toBe(COORD_BASE + AV_CONTROL);
    expect(t.requests[0].body).toContain('<Target>0:01:23</Target>');
  });

  it('setPlaySettings routes to the COORDINATOR base', async () => {
    const t = new RecordingTransport();
    const client = new SonosClient(transports(t));
    await client.setPlaySettings(resolvedRoom(), { shuffle: false, repeat: 'all' });

    expect(t.requests[0].url).toBe(COORD_BASE + AV_CONTROL);
    expect(t.requests[0].body).toContain('<NewPlayMode>REPEAT_ALL</NewPlayMode>');
  });
});
