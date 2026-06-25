// The renderer-side Api: `window.orkester`, exposed by the preload, IS the Api
// (every method bridges 1:1 to the engine in main). We assert it's present and
// every method exists, then hand it to StoreProvider. No silent fallback: a
// missing bridge throws at startup rather than rendering a dead UI.

import type { Api } from '@orkester/core';
import { API_METHODS } from '../ipc-contract';

declare global {
  interface Window {
    orkester?: Record<string, (...args: unknown[]) => Promise<unknown>>;
  }
}

export function getIpcApi(): Api {
  const bridge = window.orkester;
  if (!bridge) {
    throw new Error('window.orkester is missing — the Electron preload did not run');
  }
  for (const method of API_METHODS) {
    if (typeof bridge[method] !== 'function') {
      throw new Error(`window.orkester.${method} is not a function — preload/IPC contract drift`);
    }
  }
  // Structurally satisfies Api: every Api method is present and async.
  return bridge as unknown as Api;
}
