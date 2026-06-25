// Electron PRELOAD — the ONLY bridge between the sandboxed renderer and the
// engine in main. With contextIsolation:true, contextBridge.exposeInMainWorld
// copies a frozen, function-only surface onto `window.orkester`; the renderer
// never gets `require`, `ipcRenderer`, or any node:* handle. Each exposed method
// just `ipcRenderer.invoke`s the matching channel, so the renderer's IpcApi can
// be treated as a structural `Api`.

import { contextBridge, ipcRenderer } from 'electron';
import { API_METHODS, channelFor } from '../ipc-contract';

// Build { methodName: (...args) => ipcRenderer.invoke(channel, ...args) }.
const bridge: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
for (const method of API_METHODS) {
  const channel = channelFor(method);
  bridge[method] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('orkester', bridge);
