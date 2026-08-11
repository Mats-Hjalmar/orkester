// Single-flight registry for user-fired requests, keyed by "slot".
//
// The Sonos system answers one command at a time and a slow round trip is
// normal, so a user clicking a control repeatedly must not enqueue a backlog of
// commands that fire (or get lost) long after they stopped caring. A slot holds
// at most one in-flight request; a second `run` on a busy slot is DROPPED and
// says so via its return value. While a slot is busy it carries the op name, so
// the UI can spin exactly the control that fired.
//
// Pure — no React. The provider hands in `onChange` to mirror the map into
// component state.

export interface SingleFlight<Op extends string> {
  /**
   * Starts `fn` on `slot` tagged `op`, unless the slot is already busy — in
   * which case nothing runs and this returns false. The slot is released when
   * `fn` settles, a rejection included, so a failed command never wedges it.
   */
  run(slot: string, op: Op, fn: () => Promise<void>): boolean;
  /** The op in flight on `slot`, or null. */
  opFor(slot: string): Op | null;
}

/**
 * `onChange` mirrors the slot map out (into React state, for the spinners).
 * `onError` receives a request that REJECTED — required, because nothing else
 * can observe it: `run` returns a boolean, so the in-flight promise has no
 * caller to reject to. Reporting it is the only way a failed command stays
 * visible instead of vanishing into an unhandled rejection.
 */
export function createSingleFlight<Op extends string>(
  onChange: (ops: Record<string, Op>) => void,
  onError: (slot: string, op: Op, error: unknown) => void,
): SingleFlight<Op> {
  let ops: Record<string, Op> = {};

  const publish = (next: Record<string, Op>) => {
    ops = next;
    onChange(ops);
  };

  return {
    opFor: (slot) => ops[slot] ?? null,
    run(slot, op, fn) {
      if (ops[slot]) return false;
      publish({ ...ops, [slot]: op });
      void (async () => {
        try {
          await fn();
        } catch (e) {
          onError(slot, op, e);
        } finally {
          const next = { ...ops };
          delete next[slot];
          publish(next);
        }
      })();
      return true;
    },
  };
}
