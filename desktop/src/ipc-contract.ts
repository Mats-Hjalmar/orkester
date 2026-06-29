// The single source of truth for the Api surface bridged over IPC.
//
// Main registers one `ipcMain.handle(channel)` per name; preload exposes one
// `ipcRenderer.invoke(channel)` per name on `window.orkester`; the renderer's
// IpcApi calls them. Keeping the list here means all three stay in lockstep —
// add a method in ONE place. Every name matches an @orkester/core `Api` method
// (1:1), so the renderer can present `window.orkester` AS an `Api`.

/** Every Api method, bridged 1:1. Order is irrelevant; names are the contract. */
export const API_METHODS = [
  'loadTopology',
  'refreshTopology',
  'getNowPlaying',
  'getQueue',
  'clearQueue',
  'reorderQueue',
  'play',
  'pause',
  'next',
  'previous',
  'seek',
  'setShuffle',
  'setRepeat',
  'getVolume',
  'setVolume',
  'getMute',
  'setMute',
  'joinGroup',
  'leaveGroup',
  'startGroup',
  'isSpotifyLinked',
  'startSpotifyLink',
  'pollSpotifyLink',
  'searchSpotify',
  'enqueueSearchItem',
  'playSearchItem',
] as const;

export type ApiMethod = (typeof API_METHODS)[number];

/** The IPC channel prefix, so Sonos channels never collide with Electron's own. */
export const CHANNEL_PREFIX = 'orkester:';

export function channelFor(method: ApiMethod): string {
  return CHANNEL_PREFIX + method;
}
