import { createContext, useContext, useEffect, useState } from 'react';
import { colors, ink } from '../theme/tokens';

// The dominant colour of a cover (an average weighted toward saturated pixels,
// so greys don't muddy it), for theming the pane around the playing track.
// Reading pixels needs the image server to allow CORS; when it doesn't (the
// canvas is tainted) or there is no art, the caller's fallback colour is used.

const cache = new Map<string, string | null>();

function sample(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const max = Math.max(data[i], data[i + 1], data[i + 2]);
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          const w = 0.05 + (max === 0 ? 0 : (max - min) / max) ** 2;
          r += data[i] * w;
          g += data[i + 1] * w;
          b += data[i + 2] * w;
          n += w;
        }
        resolve(`rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useCoverTone(artUrl: string | undefined, fallback: string): string {
  const [tone, setTone] = useState<string | null>(() => (artUrl ? cache.get(artUrl) ?? null : null));
  useEffect(() => {
    if (!artUrl) return setTone(null);
    if (cache.has(artUrl)) return setTone(cache.get(artUrl) ?? null);
    let cancelled = false;
    void sample(artUrl).then((c) => {
      cache.set(artUrl, c);
      if (!cancelled) setTone(c);
    });
    return () => {
      cancelled = true;
    };
  }, [artUrl]);
  return tone ?? fallback;
}

export interface Tone {
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  subtle: string;
  faint: string;
  line: (alpha: number) => string;
}

export const baseTone: Tone = {
  bg: colors.bg,
  surface: colors.bgPaper,
  fg: colors.fg,
  muted: colors.fgMuted,
  subtle: colors.fgSubtle,
  faint: colors.fgFaint,
  line: ink,
};

function rgbOf(color: string): number[] {
  return color.startsWith('#')
    ? [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16))
    : (color.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
}

/** A full palette on `color`: black or white text, whichever reads better, and a lifted surface. */
export function toneFrom(color: string): Tone {
  const rgb = rgbOf(color);
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.4;
  const on = dark ? '255, 255, 255' : '26, 24, 20';
  const lift = dark ? 0.12 : 0.4;
  const surface = rgb.map((v) => Math.round(v + (255 - v) * lift));
  return {
    bg: color,
    surface: `rgb(${surface.join(', ')})`,
    fg: dark ? '#ffffff' : colors.fg,
    muted: `rgba(${on}, ${dark ? 0.72 : 0.64})`,
    subtle: `rgba(${on}, ${dark ? 0.56 : 0.5})`,
    faint: `rgba(${on}, ${dark ? 0.3 : 0.26})`,
    line: (alpha) => `rgba(${on}, ${dark ? Math.min(1, alpha * 1.6) : alpha})`,
  };
}

const ToneContext = createContext<Tone>(baseTone);
export const ToneProvider = ToneContext.Provider;
export const useTone = () => useContext(ToneContext);
