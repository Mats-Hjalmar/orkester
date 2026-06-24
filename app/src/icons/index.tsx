import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

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

// orkester wordmark glyph — concentric "broadcast" arcs around a dot.
export function Wave({ size = 24, color = '#1A1814' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round">
      <Circle cx={12} cy={12} r={2.4} fill={color} stroke="none" />
      <Path d="M7.2 8.4a6 6 0 000 7.2M16.8 8.4a6 6 0 010 7.2M4.4 5.4a10 10 0 000 13.2M19.6 5.4a10 10 0 010 13.2" />
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

export function Heart({ size = 24, color = '#1A1814', fill = 'none' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 20.5S4 15.5 4 9.8A4.3 4.3 0 0112 7a4.3 4.3 0 018 2.8c0 5.7-8 10.7-8 10.7z" />
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

export function Home({ size = 22, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M3 11l9-8 9 8" />
      <Path d="M5 10v10h14V10" />
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

export function Plus({ size = 18, color = '#1A1814' }: IconProps) {
  return (
    <Svg {...stroke(size, color)}>
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
