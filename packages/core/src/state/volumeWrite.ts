// Per-room volume writer: coalescing, strictly serialized, with a quiet window.
//
// Dragging a slider produces a scrub event every few milliseconds, but a SOAP
// setVolume is a LAN round trip. Firing one per event both floods the network and
// lets writes overtake each other — the speaker applies whichever arrives last, so
// the volume can settle on a value the user only dragged past. So: at most ONE
// write per room is in flight, and while it runs only the NEWEST requested value is
// kept. The last position the user chose is therefore always the one that lands.
//
// A read of the same room started before a write lands returns the old volume. For
// `quietMs` after a write the room counts as busy, so the provider can drop such a
// reading instead of snapping the slider back under the user's finger.
//
// Pure — no React. The provider hands in the Api call and the state mirrors.

export interface VolumeWriter {
  /** Requests `volume` for `roomId`, superseding any value not yet sent. */
  set(roomId: string, volume: number): void;
  /**
   * True while a write is in flight or queued for the room, or one landed within
   * the quiet window — i.e. any volume read now is older than what the UI shows.
   */
  isBusy(roomId: string): boolean;
}

export function createVolumeWriter({
  write,
  onFailed,
  onChange,
  quietMs,
}: {
  write: (roomId: string, volume: number) => Promise<void>;
  /**
   * A write REJECTED and nothing newer is queued behind it — the provider must
   * reconcile the room from the speaker. Required: `set` returns nothing, so this
   * is the only way a failed write stays visible instead of being swallowed.
   */
  onFailed: (roomId: string) => void;
  /** Mirrors the rooms with a write in flight or queued out (for the spinners). */
  onChange: (settling: Record<string, boolean>) => void;
  quietMs: number;
}): VolumeWriter {
  const queued = new Map<string, number>();
  const writing = new Set<string>();
  const lastWriteAt = new Map<string, number>();
  let settling: Record<string, boolean> = {};

  const publish = () => {
    const next: Record<string, boolean> = {};
    for (const roomId of queued.keys()) next[roomId] = true;
    for (const roomId of writing) next[roomId] = true;
    const keys = Object.keys(next);
    if (keys.length === Object.keys(settling).length && keys.every((k) => settling[k])) return;
    settling = next;
    onChange(settling);
  };

  const pump = (roomId: string) => {
    if (writing.has(roomId)) return;
    const volume = queued.get(roomId);
    if (volume === undefined) return;
    queued.delete(roomId);
    writing.add(roomId);
    publish();
    void (async () => {
      let failed = false;
      try {
        await write(roomId, volume);
      } catch {
        failed = true;
      } finally {
        lastWriteAt.set(roomId, Date.now());
        writing.delete(roomId);
        publish();
      }
      if (failed && !queued.has(roomId)) onFailed(roomId);
      pump(roomId);
    })();
  };

  return {
    set(roomId, volume) {
      lastWriteAt.set(roomId, Date.now());
      queued.set(roomId, volume);
      pump(roomId);
    },
    isBusy(roomId) {
      if (writing.has(roomId) || queued.has(roomId)) return true;
      const at = lastWriteAt.get(roomId);
      return at !== undefined && Date.now() - at < quietMs;
    },
  };
}
