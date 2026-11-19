// The Electron shell bridge (`window.orkesterShell`), exposed by the desktop
// preload for features that are not Sonos Api methods.

import type { Settings, StoredSettings, Theme } from '@orkester/core/theme';

export interface OrkesterShell {
  isMac: boolean;
  showContextMenu: (items: { label: string; enabled?: boolean; icon?: string }[]) => Promise<number | null>;
  loadSettings: () => Promise<Settings>;
  saveSettings: (settings: StoredSettings) => Promise<void>;
  saveTheme: (name: string, theme: Theme) => Promise<void>;
  deleteTheme: (name: string) => Promise<void>;
}

declare global {
  interface Window {
    orkesterShell?: OrkesterShell;
  }
}

export function orkesterShell(): OrkesterShell {
  const shell = window.orkesterShell;
  if (!shell) throw new Error('window.orkesterShell is missing — the Electron preload did not run');
  return shell;
}

// Electron hit-tests window drag regions by layout, not z-order, so anything
// drawn over the macOS top bar (which is a drag region) must opt out to get clicks.
export const NO_DRAG = { WebkitAppRegion: 'no-drag' } as object;
