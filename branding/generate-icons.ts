// Renders every platform icon from the shared orkester mark (see
// app/src/icons/orkesterMark.ts). Run with `bun run icons`; needs `rsvg-convert`
// (brew install librsvg).
import { colors } from '../packages/core/src/theme/tokens';
import { ICON_MARK_WIDTH, MARK_SHAPES, markTransform, type MarkShape } from '../app/src/icons/orkesterMark';

const ROOT = new URL('..', import.meta.url).pathname;
const SIZE = 1024;

function shape(s: MarkShape, fg: string, accent: string): string {
  const color = s.tone === 'fg' ? fg : accent;
  switch (s.kind) {
    case 'rect':
      return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}" rx="${s.rx}" fill="${color}"/>`;
    case 'circle':
      return `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${color}"/>`;
    case 'path':
      return `<path d="${s.d}" fill="none" stroke="${color}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${s.opacity}"/>`;
  }
}

// Centres the mark in the canvas, scaled to `width` px.
function placed(width: number, fg: string, accent: string): string {
  return `<g transform="${markTransform(SIZE, width)}">${MARK_SHAPES.map((s) => shape(s, fg, accent)).join('')}</g>`;
}

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;

const fullBleed = `<rect width="${SIZE}" height="${SIZE}" fill="${colors.bgDeep}"/>${placed(ICON_MARK_WIDTH, colors.bgPaper, colors.accent)}`;

// macOS doesn't mask icons: the squircle tile and its padding are part of the
// artwork (Apple's grid: 824px tile on a 1024px canvas).
const TILE = 824;
const tile = (shadow: boolean) => {
  const o = (SIZE - TILE) / 2;
  const filter = shadow
    ? `<defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/></filter></defs>`
    : '';
  return `${filter}<rect x="${o}" y="${o}" width="${TILE}" height="${TILE}" rx="185" fill="${colors.bgDeep}"${shadow ? ' filter="url(#s)"' : ''}/>${placed(TILE * 0.62, colors.bgPaper, colors.accent)}`;
};

// Android adaptive icons keep only the centre 66% safe zone visible.
const ANDROID_MARK = 430;

const outputs: Record<string, string> = {
  'app/assets/icon.png': svg(fullBleed),
  'app/assets/adaptive-icon.png': svg(placed(ANDROID_MARK, colors.bgPaper, colors.accent)),
  'app/assets/monochrome-icon.png': svg(placed(ANDROID_MARK, '#FFFFFF', '#FFFFFF')),
  'app/assets/splash-icon.png': svg(tile(false)),
  'desktop/build/icon.png': svg(tile(true)),
};

for (const [path, source] of Object.entries(outputs)) {
  const proc = Bun.spawn(['rsvg-convert', '-o', ROOT + path], { stdin: new Blob([source]) });
  if ((await proc.exited) !== 0) throw new Error(`rsvg-convert failed for ${path}`);
  console.log(`wrote ${path}`);
}
