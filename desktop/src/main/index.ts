// Electron MAIN process — owns the Sonos engine.
//
// The engine + SonosClient + SonosApi live HERE (Node side), constructed from
// the @orkester/core/node transports (the only node:* entry point). Each Api
// method is exposed to the renderer via `ipcMain.handle` (one channel per
// method, derived from the shared contract). The renderer runs with
// contextIsolation:true and nodeIntegration:false, so it can ONLY reach the
// engine through these typed IPC calls — no node:* ever ships in the renderer.
//
// No silent fallbacks: an Api rejection propagates back across IPC and rejects
// the renderer's invoke() (the store's optimistic-revert handles it). The single
// SonosApi instance keeps the topology id-maps warm across calls.

import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { SonosClient } from '@orkester/core';
import { SonosApi } from '@orkester/core/state';
import { NodeHttpTransport, NodeDiscoveryTransport } from '@orkester/core/node';
import type { Api } from '@orkester/core';
import { API_METHODS, channelFor, type ApiMethod } from '../ipc-contract';

// One engine, one Api, for the whole app lifetime.
const client = new SonosClient({
  http: new NodeHttpTransport(),
  discovery: new NodeDiscoveryTransport(),
});
const api: Api = new SonosApi(client);

/**
 * Registers every Api method as an ipcMain.handle channel. Each handler forwards
 * its args straight to the Api method and returns the promise — Electron
 * serializes the resolved value and propagates a rejection back to the renderer.
 * The cast is sound because API_METHODS is derived from the Api type and every
 * method takes JSON-serializable args + returns a JSON-serializable value.
 */
function registerApiHandlers(): void {
  for (const method of API_METHODS) {
    ipcMain.handle(channelFor(method), (_event, ...args: unknown[]) => {
      const fn = api[method as ApiMethod] as (...a: unknown[]) => Promise<unknown>;
      return fn.apply(api, args);
    });
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F2EFE8',
    title: 'Orkester',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload needs require('electron') for contextBridge/ipcRenderer
    },
  });

  // Diagnostics: renderer console + load/preload failures normally only show in
  // the DevTools console — forward them to the terminal so headless runs surface
  // the real cause of a blank window.
  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message}  (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[renderer] did-fail-load ${code} ${desc} ${url}`);
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    console.log(`[renderer] process-gone ${JSON.stringify(details)}`);
  });
  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    console.log(`[preload-error] ${preloadPath} ${err && err.stack ? err.stack : err}`);
  });

  // electron-vite injects ELECTRON_RENDERER_URL in dev; load the built file otherwise.
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerApiHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Standard macOS convention: stay alive until Cmd-Q. Elsewhere, quit.
  if (process.platform !== 'darwin') app.quit();
});
