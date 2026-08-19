import AsyncStorage from '@react-native-async-storage/async-storage';

// PHONE ONLY — the desktop's equivalent is localStorage-backed
// (src/desktop/lastSelection.ts). Both remember ROOM ids rather than a group id,
// because a Sonos group id carries a membership counter and goes stale the first
// time the group changes; groupForRooms() in ./selectors matches them back.
//
// Newline-joined rather than JSON so a stale or garbled value can't throw on read.

const KEY = 'orkester.mobile.lastRoom';

/** The room ids of the group last opened; [] when nothing is remembered. */
export async function readLastRoom(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return (raw ?? '').split('\n').filter((id) => id !== '');
}

export async function writeLastRoom(roomIds: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, roomIds.join('\n'));
}
