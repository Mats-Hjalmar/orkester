// Geometry of the orkester mark: an O with a dot at its centre, playing out like a
// speaker — sound waves radiate from the dot. Shared by the in-app <OrkesterMark>
// and branding/generate-icons.ts so both draw one shape.

export type MarkTone = 'fg' | 'accent';

export type MarkShape =
  | { kind: 'rect'; tone: MarkTone; x: number; y: number; width: number; height: number; rx: number }
  | { kind: 'circle'; tone: MarkTone; cx: number; cy: number; r: number }
  // Paths are stroked (round caps/joins), never filled.
  | { kind: 'path'; tone: MarkTone; d: string; strokeWidth: number; opacity: number };

// The centre of the O, where the waves radiate from.
const CENTER = { x: 440, y: 512 };
const RING = { radius: 160, strokeWidth: 80 };
const WAVE_STROKE = 52;
const WAVES = [
  { radius: 270, halfAngle: 25, opacity: 1 },
  { radius: 370, halfAngle: 28, opacity: 0.55 },
];

export const MARK_BOUNDS = {
  left: CENTER.x - RING.radius - RING.strokeWidth / 2,
  right: CENTER.x + WAVES[WAVES.length - 1].radius + WAVE_STROKE / 2,
  top: CENTER.y - RING.radius - RING.strokeWidth / 2,
  bottom: CENTER.y + RING.radius + RING.strokeWidth / 2,
};

/** Draws the O as a full circle stroked through two half arcs. */
function ring(): MarkShape {
  const { x, y } = CENTER;
  const r = RING.radius;
  const d = `M${x - r} ${y}A${r} ${r} 0 1 1 ${x + r} ${y}A${r} ${r} 0 1 1 ${x - r} ${y}Z`;
  return { kind: 'path', tone: 'fg', d, strokeWidth: RING.strokeWidth, opacity: 1 };
}

/** Draws one sound wave as an arc around the centre of the O. */
function wave({ radius, halfAngle, opacity }: (typeof WAVES)[number]): MarkShape {
  const t = (halfAngle * Math.PI) / 180;
  const x = (CENTER.x + radius * Math.cos(t)).toFixed(1);
  const dy = radius * Math.sin(t);
  const d = `M${x} ${(CENTER.y - dy).toFixed(1)}A${radius} ${radius} 0 0 1 ${x} ${(CENTER.y + dy).toFixed(1)}`;
  return { kind: 'path', tone: 'accent', d, strokeWidth: WAVE_STROKE, opacity };
}

export const MARK_SHAPES: MarkShape[] = [
  ring(),
  { kind: 'circle', tone: 'accent', cx: CENTER.x, cy: CENTER.y, r: 44 },
  ...WAVES.map(wave),
];

// Width of the mark on the full-bleed 1024px app icon tile.
export const ICON_MARK_WIDTH = 640;

// SVG transform that centres the mark on a `canvas`-sized square, `width` wide.
export function markTransform(canvas: number, width: number): string {
  const { left, right, top, bottom } = MARK_BOUNDS;
  const s = width / (right - left);
  return `translate(${canvas / 2} ${canvas / 2}) scale(${s}) translate(${-(left + right) / 2} ${-(top + bottom) / 2})`;
}
