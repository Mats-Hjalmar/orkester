import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVolumeWriter } from '../volumeWrite';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function harness(quietMs = 1500) {
  const calls: { roomId: string; volume: number }[] = [];
  const gates: ReturnType<typeof deferred>[] = [];
  const failed: string[] = [];
  let settling: Record<string, boolean> = {};
  const writer = createVolumeWriter({
    write: (roomId, volume) => {
      calls.push({ roomId, volume });
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    },
    onFailed: (roomId) => { failed.push(roomId); },
    onChange: (next) => { settling = next; },
    quietMs,
  });
  return { writer, calls, gates, failed, settling: () => settling };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => { vi.useRealTimers(); });

describe('createVolumeWriter', () => {
  it('sends the first value immediately and never overlaps writes for a room', async () => {
    const h = harness();
    h.writer.set('living', 30);
    h.writer.set('living', 40);
    h.writer.set('living', 50);
    expect(h.calls).toEqual([{ roomId: 'living', volume: 30 }]);

    h.gates[0].resolve();
    await flush();
    // Only the LATEST queued value is sent — 40 was dragged past, never written.
    expect(h.calls).toEqual([
      { roomId: 'living', volume: 30 },
      { roomId: 'living', volume: 50 },
    ]);
  });

  it('lands on the last requested value and then goes idle', async () => {
    const h = harness();
    h.writer.set('living', 10);
    h.gates[0].resolve();
    await flush();
    h.writer.set('living', 80);
    h.writer.set('living', 65);
    h.gates[1].resolve();
    await flush();
    h.gates[2].resolve();
    await flush();

    expect(h.calls.at(-1)).toEqual({ roomId: 'living', volume: 65 });
    expect(h.calls).toHaveLength(3);
    expect(h.settling()).toEqual({});
  });

  it('writes rooms independently — one slow room does not hold up another', async () => {
    const h = harness();
    h.writer.set('living', 20);
    h.writer.set('kitchen', 70);
    expect(h.calls).toEqual([
      { roomId: 'living', volume: 20 },
      { roomId: 'kitchen', volume: 70 },
    ]);
    expect(h.settling()).toEqual({ living: true, kitchen: true });

    h.gates[1].resolve();
    await flush();
    expect(h.settling()).toEqual({ living: true });
  });

  it('reports a room busy while writing, and for the quiet window after', async () => {
    vi.useFakeTimers();
    const h = harness(1500);
    h.writer.set('living', 30);
    expect(h.writer.isBusy('living')).toBe(true);
    expect(h.writer.isBusy('kitchen')).toBe(false);

    h.gates[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.writer.isBusy('living')).toBe(true);

    await vi.advanceTimersByTimeAsync(1500);
    expect(h.writer.isBusy('living')).toBe(false);
  });

  it('reports a failed write once nothing newer is queued', async () => {
    const h = harness();
    h.writer.set('living', 30);
    h.writer.set('living', 55);
    h.gates[0].reject(new Error('SOAP 500'));
    await flush();
    // 55 is still on its way; reverting to the speaker's value now would fight it.
    expect(h.failed).toEqual([]);

    h.gates[1].reject(new Error('SOAP 500'));
    await flush();
    expect(h.failed).toEqual(['living']);
    expect(h.settling()).toEqual({});
  });
});
