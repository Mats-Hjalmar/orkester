// Native context menus via the Electron shell bridge. Native rather than an
// in-page popup because only the OS can draw a menu past the window's edge (and
// keep it on-screen) — an HTML menu is clipped to the window.

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export interface ContextMenuAction {
  label: string;
  onPress: () => void;
  enabled?: boolean;
  /** An icon element from `../icons`, sized for a menu (16). Its colour is ignored: macOS tints it. */
  icon?: ReactElement;
}

declare global {
  interface Window {
    orkesterShell?: {
      showContextMenu: (items: { label: string; enabled?: boolean; icon?: string }[]) => Promise<number | null>;
    };
  }
}

// Main can't rasterize SVG, so draw the icon here and hand over a 2x PNG.
async function iconToPng(icon: ReactElement): Promise<string> {
  const markup = renderToStaticMarkup(icon);
  // An <img> only decodes SVG that declares its namespace.
  const svg = markup.includes('xmlns=') ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.width * 2;
  canvas.height = img.height * 2;
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Pops a native menu at the cursor and runs the chosen action, if any. */
export async function showContextMenu(actions: ContextMenuAction[]): Promise<void> {
  const shell = window.orkesterShell;
  if (!shell) throw new Error('window.orkesterShell is missing — the Electron preload did not run');
  const items = await Promise.all(actions.map(async ({ label, enabled, icon }) => ({
    label,
    enabled,
    icon: icon && await iconToPng(icon),
  })));
  const chosen = await shell.showContextMenu(items);
  if (chosen !== null) actions[chosen].onPress();
}
