import { describe, expect, it } from 'vitest';
import { createSingleFlight } from '../singleFlight';

type Op = 'play' | 'next' | 'join';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSingleFlight', () => {
  it('drops a second call on a busy slot instead of queueing it', async () => {
    const sf = createSingleFlight<Op>(() => {}, () => {});
    const d = deferred();
    let calls = 0;

    expect(sf.run('transport:g1', 'play', () => { calls += 1; return d.promise; })).toBe(true);
    expect(sf.run('transport:g1', 'next', () => { calls += 1; return d.promise; })).toBe(false);
    expect(sf.run('transport:g1', 'next', () => { calls += 1; return d.promise; })).toBe(false);
    expect(calls).toBe(1);

    d.resolve();
    await d.promise;
    await Promise.resolve();

    // Released once it settles — the NEXT click gets through.
    expect(sf.run('transport:g1', 'next', async () => { calls += 1; })).toBe(true);
    expect(calls).toBe(2);
  });

  it('keeps slots independent', () => {
    const sf = createSingleFlight<Op>(() => {}, () => {});
    const d = deferred();
    expect(sf.run('transport:g1', 'play', () => d.promise)).toBe(true);
    expect(sf.run('transport:g2', 'play', () => d.promise)).toBe(true);
    expect(sf.run('room:kitchen', 'join', () => d.promise)).toBe(true);
    expect(sf.opFor('transport:g1')).toBe('play');
    expect(sf.opFor('room:kitchen')).toBe('join');
    expect(sf.opFor('room:living')).toBeNull();
  });

  it('reports the op in flight and publishes every change', async () => {
    const seen: Record<string, Op>[] = [];
    const sf = createSingleFlight<Op>((ops) => seen.push(ops), () => {});
    const d = deferred();

    sf.run('transport:g1', 'next', () => d.promise);
    expect(sf.opFor('transport:g1')).toBe('next');
    expect(seen).toEqual([{ 'transport:g1': 'next' }]);

    d.resolve();
    await d.promise;
    await Promise.resolve();

    expect(sf.opFor('transport:g1')).toBeNull();
    expect(seen).toEqual([{ 'transport:g1': 'next' }, {}]);
  });

  it('reports a REJECTED request and releases the slot (a failed join never sticks)', async () => {
    const errors: Array<{ slot: string; op: Op; error: unknown }> = [];
    const sf = createSingleFlight<Op>(() => {}, (slot, op, error) => errors.push({ slot, op, error }));
    const d = deferred();
    sf.run('room:kitchen', 'join', () => d.promise);
    expect(sf.opFor('room:kitchen')).toBe('join');

    d.reject(new Error('UPnP fault 501'));
    await expect(d.promise).rejects.toThrow('501');
    await Promise.resolve();

    expect(errors).toHaveLength(1);
    expect(errors[0].slot).toBe('room:kitchen');
    expect(errors[0].op).toBe('join');
    expect((errors[0].error as Error).message).toContain('501');
    expect(sf.opFor('room:kitchen')).toBeNull();
    expect(sf.run('room:kitchen', 'join', async () => {})).toBe(true);
  });
});
