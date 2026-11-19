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
  'resolveArt',
  'clearQueue',
  'reorderQueue',
  'playQueueIndex',
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
  'isSpotifyLinked',
  'startSpotifyLink',
  'pollSpotifyLink',
  'searchSpotify',
  'browseSpotify',
  'enqueueSearchItem',
  'playSearchItem',
  'stop',
  'getCrossfade',
  'setCrossfade',
  'getSleepTimer',
  'setSleepTimer',
  'removeQueueItem',
  'removeQueueItems',
  'moveQueueItems',
  'saveQueue',
  'playLineIn',
  'playTv',
  'getGroupVolume',
  'setGroupVolume',
  'getGroupMute',
  'setGroupMute',
  'getAudioSettings',
  'setBass',
  'setTreble',
  'setLoudness',
  'getEQ',
  'setEQ',
  'browse',
  'getFavorites',
  'getPlaylists',
  'playBrowseItem',
  'enqueueBrowseItem',
  'deletePlaylist',
  'listAlarms',
  'createAlarm',
  'updateAlarm',
  'deleteAlarm',
  'setRoomName',
  'getLed',
  'setLed',
  'getButtonLock',
  'setButtonLock',
] as const;

export type ApiMethod = (typeof API_METHODS)[number];

/** The IPC channel prefix, so Sonos channels never collide with Electron's own. */
export const CHANNEL_PREFIX = 'orkester:';

export function channelFor(method: ApiMethod): string {
  return CHANNEL_PREFIX + method;
}

// Shell features that are not Sonos Api methods live on their own bridge
// (`window.orkesterShell`) so `window.orkester` stays exactly an `Api`.

/** One entry of a native context menu, as sent from the renderer. */
export interface ContextMenuItem {
  label: string;
  enabled?: boolean;
  /** A PNG data URL drawn at 2x; shown as a macOS template image. */
  icon?: string;
}

/** Pops a native menu at the cursor; resolves with the chosen item's index, or null. */
export const SHOW_CONTEXT_MENU_CHANNEL = 'orkester-shell:showContextMenu';

/** Resolves with settings.json + every themes/*.json; rejects naming the bad file and the problem. */
export const LOAD_SETTINGS_CHANNEL = 'orkester-shell:loadSettings';

/** (stored settings) — validates and writes settings.json only, and applies its appearance to the native chrome. */
export const SAVE_SETTINGS_CHANNEL = 'orkester-shell:saveSettings';

/** (name, theme) — writes themes/<name>.json only. */
export const SAVE_THEME_CHANNEL = 'orkester-shell:saveTheme';

/** (name) — removes themes/<name>.json. */
export const DELETE_THEME_CHANNEL = 'orkester-shell:deleteTheme';
