// Geometry of the orkester mark: a C-clef (the alto clef violas read) playing out
// like a speaker — sound waves radiate from its middle-C point. Shared by the
// in-app <OrkesterMark> and branding/generate-icons.ts so both draw one shape.

export type MarkTone = 'fg' | 'accent';

export type MarkShape =
  | { kind: 'rect'; tone: MarkTone; x: number; y: number; width: number; height: number; rx: number }
  | { kind: 'circle'; tone: MarkTone; cx: number; cy: number; r: number }
  // Paths are stroked (round caps/joins), never filled.
  | { kind: 'path'; tone: MarkTone; d: string; strokeWidth: number; opacity: number };

// The notch the two curls meet at.
const MIDDLE_C = { x: 430, y: 512 };
const STROKE = 56;
const WAVES = [
  { radius: 500, halfAngle: 24, opacity: 1 },
  { radius: 600, halfAngle: 22, opacity: 0.55 },
];

export const MARK_BOUNDS = {
  left: 250,
  right: MIDDLE_C.x + WAVES[WAVES.length - 1].radius + STROKE / 2,
  top: 182,
  bottom: 842,
};

// dir 1 is the upper curl, -1 mirrors it below.
function curl(dir: 1 | -1): MarkShape[] {
  const y = (dy: number) => MIDDLE_C.y - dir * dy;
  const d = `M${MIDDLE_C.x} ${MIDDLE_C.y} L520 ${y(60)} C560 ${y(100)} 610 ${y(110)} 640 ${y(110)} C730 ${y(110)} 780 ${y(170)} 780 ${y(230)} C780 ${y(300)} 720 ${y(330)} 650 ${y(330)} C590 ${y(330)} 560 ${y(300)} 560 ${y(270)}`;
  return [
    { kind: 'path', tone: 'fg', d, strokeWidth: STROKE, opacity: 1 },
    { kind: 'circle', tone: 'fg', cx: 582, cy: y(262), r: 52 },
  ];
}

function wave({ radius, halfAngle, opacity }: (typeof WAVES)[number]): MarkShape {
  const t = (halfAngle * Math.PI) / 180;
  const x = (MIDDLE_C.x + radius * Math.cos(t)).toFixed(1);
  const dy = radius * Math.sin(t);
  const d = `M${x} ${(MIDDLE_C.y - dy).toFixed(1)}A${radius} ${radius} 0 0 1 ${x} ${(MIDDLE_C.y + dy).toFixed(1)}`;
  return { kind: 'path', tone: 'accent', d, strokeWidth: STROKE * 0.8, opacity };
}

export const MARK_SHAPES: MarkShape[] = [
  { kind: 'rect', tone: 'fg', x: 250, y: 182, width: 100, height: 660, rx: 14 },
  { kind: 'rect', tone: 'fg', x: 384, y: 182, width: 32, height: 660, rx: 10 },
  ...curl(1),
  ...curl(-1),
  { kind: 'circle', tone: 'accent', cx: MIDDLE_C.x, cy: MIDDLE_C.y, r: 40 },
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
