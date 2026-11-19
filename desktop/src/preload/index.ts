// Electron PRELOAD — the ONLY bridge between the sandboxed renderer and the
// engine in main. With contextIsolation:true, contextBridge.exposeInMainWorld
// copies a frozen, function-only surface onto `window.orkester`; the renderer
// never gets `require`, `ipcRenderer`, or any node:* handle. Each exposed method
// just `ipcRenderer.invoke`s the matching channel, so the renderer's IpcApi can
// be treated as a structural `Api`.

import { contextBridge, ipcRenderer } from 'electron';
import type { StoredSettings, Theme } from '@orkester/core/theme';
import {
  API_METHODS,
  DELETE_THEME_CHANNEL,
  LOAD_SETTINGS_CHANNEL,
  SAVE_SETTINGS_CHANNEL,
  SAVE_THEME_CHANNEL,
  SHOW_CONTEXT_MENU_CHANNEL,
  channelFor,
  type ContextMenuItem,
} from '../ipc-contract';

// Build { methodName: (...args) => ipcRenderer.invoke(channel, ...args) }.
const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const method of API_METHODS) {
  const channel = channelFor(method);
  bridge[method] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('orkester', bridge);

contextBridge.exposeInMainWorld('orkesterShell', {
  isMac: process.platform === 'darwin',
  showContextMenu: (items: ContextMenuItem[]) => ipcRenderer.invoke(SHOW_CONTEXT_MENU_CHANNEL, items),
  loadSettings: () => ipcRenderer.invoke(LOAD_SETTINGS_CHANNEL),
  saveSettings: (settings: StoredSettings) => ipcRenderer.invoke(SAVE_SETTINGS_CHANNEL, settings),
  saveTheme: (name: string, theme: Theme) => ipcRenderer.invoke(SAVE_THEME_CHANNEL, name, theme),
  deleteTheme: (name: string) => ipcRenderer.invoke(DELETE_THEME_CHANNEL, name),
});
