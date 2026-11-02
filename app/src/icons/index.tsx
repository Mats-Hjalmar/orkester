import React from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { colors } from '../theme/tokens';
import { ICON_MARK_WIDTH, MARK_SHAPES, markTransform, type MarkTone } from './orkesterMark';

export interface IconProps {
  size?: number;
  color?: string;
  fill?: string; // for filled glyphs (play/pause/heart)
}

const stroke = (size: number, color: string, sw = 1.75) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: color,
  strokeWidth: sw,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

// The app icon, drawn live: the orkester mark on its dark rounded tile.
export function OrkesterMark({ size = 24 }: { size?: number }) {
  const tone = (t: MarkTone) => (t === 'fg' ? colors.bgPaper : colors.accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Rect width={1024} height={1024} rx={225} fill={colors.bgDeep} />
      <G transform={markTransform(1024, ICON_MARK_WIDTH)}>
        {MARK_SHAPES.map((s, i) => {
          switch (s.kind) {
            case 'rect':
              return <Rect key={i} x={s.x} y={s.y} width={s.width} height={s.height} rx={s.rx} fill={tone(s.tone)} />;
            case 'circle':
              return <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={tone(s.tone)} />;
            case 'path':
              return (
                <Path key={i} d={s.d} fill="none" stroke={tone(s.tone)} strokeWidth={s.strokeWidth}
                  strokeLinecap="round" strokeLinejoin="round" opacity={s.opacity} />
              );
          }
        })}
      </G>
    </Svg>
  );
}

export function ChevronDown({ size = 24, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color, 1.9)}>
      <Path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function ChevronRight({ size = 20, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function Play({ size = 24, fill = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

export function Pause({ size = 24, fill = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Rect x={6.5} y={5} width={3.8} height={14} rx={1.4} />
      <Rect x={13.7} y={5} width={3.8} height={14} rx={1.4} />
    </Svg>
  );
}

export function Prev({ size = 28, fill = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path d="M7 5h2.2v14H7zM20 5L9.5 12 20 19z" />
    </Svg>
  );
}

export function Next({ size = 28, fill = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path d="M17 5h-2.2v14H17zM4 5l10.5 7L4 19z" />
    </Svg>
  );
}

export function Shuffle({ size = 22, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M16 3h5v5" />
      <Path d="M4 20L21 3" />
      <Path d="M21 16v5h-5" />
      <Path d="M15 15l6 6" />
      <Path d="M4 4l5 5" />
    </Svg>
  );
}

export function Repeat({ size = 22, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M17 2l4 4-4 4" />
      <Path d="M3 11v-1a4 4 0 014-4h14" />
      <Path d="M7 22l-4-4 4-4" />
      <Path d="M21 13v1a4 4 0 01-4 4H3" />
    </Svg>
  );
}

export function Speaker({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color, 1.6)}>
      <Rect x={6.5} y={3} width={11} height={18} rx={3} />
      <Circle cx={12} cy={14.5} r={3.2} />
      <Circle cx={12} cy={7} r={1} />
    </Svg>
  );
}

export function Search({ size = 22, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Circle cx={11} cy={11} r={7} />
      <Path d="M21 21l-4-4" />
    </Svg>
  );
}

export function VolumeLow({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M11 5L6 9H2v6h4l5 4z" />
    </Svg>
  );
}

export function VolumeHigh({ size = 20, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M11 5L6 9H2v6h4l5 4z" />
      <Path d="M15.5 8.5a5 5 0 010 7" />
      <Path d="M19 5a9 9 0 010 14" />
    </Svg>
  );
}

export function Dots({ size = 22, color = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={5} cy={12} r={1.6} />
      <Circle cx={12} cy={12} r={1.6} />
      <Circle cx={19} cy={12} r={1.6} />
    </Svg>
  );
}

export function Queue({ size = 20, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M4 6h11M4 12h11M4 18h7" />
      <Circle cx={19} cy={17} r={2.4} />
      <Path d="M21.4 17V8.5l-2.4 1" />
    </Svg>
  );
}

export function QueueTop({ size = 20, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M4 6h16M4 12h9M4 18h9" />
      <Path d="M17 20V9M14.2 11.8 17 9l2.8 2.8" />
    </Svg>
  );
}

export function QueueBottom({ size = 20, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M4 6h9M4 12h9M4 18h16" />
      <Path d="M17 4v11M14.2 12.2 17 15l2.8-2.8" />
    </Svg>
  );
}

export function Trash({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M4 7h16M9 7V4.5h6V7M6 7l1 12.5h10L18 7M10 11v5.5M14 11v5.5" />
    </Svg>
  );
}

export function Plus({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function Close({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function Check({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color, 2.25)}>
      <Path d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

// Drag handle — six dots (2×3). Grab to reorder a queue row.
export function Grip({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={9} cy={6} r={1.5} />
      <Circle cx={15} cy={6} r={1.5} />
      <Circle cx={9} cy={12} r={1.5} />
      <Circle cx={15} cy={12} r={1.5} />
      <Circle cx={9} cy={18} r={1.5} />
      <Circle cx={15} cy={18} r={1.5} />
    </Svg>
  );
}

// Circular refresh — two arrows chasing round, with arrowheads. Used by the
// manual "reconnect" button (the Sonos connection can drift).
export function Refresh({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M21 12a9 9 0 11-2.64-6.36" />
      <Path d="M21 3v5h-5" />
    </Svg>
  );
}

// Spotify's brand mark (Wikimedia Commons, File:Spotify_icon.svg). Brand colours are fixed, so no color prop.
// The source viewBox is 496×512 around a circle at y 8–504; cropping to that circle makes it square.
export function Spotify({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 8 496 496">
      <Path fill="#1ed760" d="M248 8C111.1 8 0 119.1 0 256s111.1 248 248 248 248-111.1 248-248S384.9 8 248 8Z" />
      <Path fill="#000" d="M406.6 231.1c-5.2 0-8.4-1.3-12.9-3.9-71.2-42.5-198.5-52.7-280.9-29.7-3.6 1-8.1 2.6-12.9 2.6-13.2 0-23.3-10.3-23.3-23.6 0-13.6 8.4-21.3 17.4-23.9 35.2-10.3 74.6-15.2 117.5-15.2 73 0 149.5 15.2 205.4 47.8 7.8 4.5 12.9 10.7 12.9 22.6 0 13.6-11 23.3-23.2 23.3zm-31 76.2c-5.2 0-8.7-2.3-12.3-4.2-62.5-37-155.7-51.9-238.6-29.4-4.8 1.3-7.4 2.6-11.9 2.6-10.7 0-19.4-8.7-19.4-19.4s5.2-17.8 15.5-20.7c27.8-7.8 56.2-13.6 97.8-13.6 64.9 0 127.6 16.1 177 45.5 8.1 4.8 11.3 11 11.3 19.7-.1 10.8-8.5 19.5-19.4 19.5zm-26.9 65.6c-4.2 0-6.8-1.3-10.7-3.6-62.4-37.6-135-39.2-206.7-24.5-3.9 1-9 2.6-11.9 2.6-9.7 0-15.8-7.7-15.8-15.8 0-10.3 6.1-15.2 13.6-16.8 81.9-18.1 165.6-16.5 237 26.2 6.1 3.9 9.7 7.4 9.7 16.5s-7.1 15.4-15.2 15.4z" />
    </Svg>
  );
}
