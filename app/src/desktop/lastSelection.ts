// Remembers which speakers the desktop was last opened on, across restarts.
//
// Stored newline-joined rather than as JSON so a stale/garbled value can't throw
// on read. The room-ids-not-group-id rationale, and the matcher itself, live in
// ../state/selectors (groupForRooms) — the phone client remembers the same thing
// against a different storage backend.

const KEY = 'orkester.desktop.lastSelection';

/** The room ids of the last selected group; [] when nothing is remembered. */
export function readLastSelection(): string[] {
  return (localStorage.getItem(KEY) ?? '').split('\n').filter((id) => id !== '');
}

export function writeLastSelection(roomIds: string[]): void {
  localStorage.setItem(KEY, roomIds.join('\n'));
}
