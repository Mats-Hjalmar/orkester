import { describe, expect, it } from 'vitest';
import { COVER_PALETTE, hashString, synthesizeArt } from '../art';

describe('synthesizeArt', () => {
  it('is deterministic for the same title|artist', () => {
    const a = synthesizeArt('Amber Hours', 'Lena Sorel');
    const b = synthesizeArt('Amber Hours', 'Lena Sorel');
    expect(a).toEqual(b);
  });

  it('always picks a real palette pair', () => {
    const { coverBg, coverShape } = synthesizeArt('x', 'y');
    expect(COVER_PALETTE.some((p) => p.bg === coverBg && p.shape === coverShape)).toBe(true);
  });

  it('differs for different inputs (at least sometimes) and never throws on empty', () => {
    expect(() => synthesizeArt('', '')).not.toThrow();
    const seen = new Set(
      ['a|1', 'b|2', 'c|3', 'd|4', 'e|5', 'f|6', 'g|7'].map((s) => {
        const [t, a] = s.split('|');
        return synthesizeArt(t, a).coverBg;
      }),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it('hashString is a stable non-negative 32-bit integer', () => {
    const h = hashString('Amber Hours|Lena Sorel');
    expect(h).toBe(hashString('Amber Hours|Lena Sorel'));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(h)).toBe(true);
  });
});
