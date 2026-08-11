// Remembers which speakers the desktop was last opened on, across restarts.
//
// A Sonos GROUP id is not stable — it carries a counter that changes whenever the
// group's membership does — so the selection is stored as the group's ROOM ids
// and matched back by overlap on the next launch. Stored newline-joined rather
// than as JSON so a stale/garbled value can't throw on read.

const KEY = 'orkester.desktop.lastSelection';

/** The room ids of the last selected group; [] when nothing is remembered. */
export function readLastSelection(): string[] {
  return (localStorage.getItem(KEY) ?? '').split('\n').filter((id) => id !== '');
}

export function writeLastSelection(roomIds: string[]): void {
  localStorage.setItem(KEY, roomIds.join('\n'));
}

/**
 * The group that best matches the remembered speakers — the one sharing the most
 * rooms with them. undefined when nothing is remembered or those speakers are
 * gone, so the caller decides its own default.
 */
export function groupForRooms<T extends { id: string; roomIds: string[] }>(
  groups: T[],
  roomIds: string[],
): T | undefined {
  if (roomIds.length === 0) return undefined;
  const remembered = new Set(roomIds);
  let best: T | undefined;
  let bestOverlap = 0;
  for (const g of groups) {
    const overlap = g.roomIds.filter((r) => remembered.has(r)).length;
    if (overlap > bestOverlap) {
      best = g;
      bestOverlap = overlap;
    }
  }
  return best;
}
