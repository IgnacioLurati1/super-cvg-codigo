import { describe, expect, it } from 'vitest';
import { MAX_IMAGEN, pngValido } from './graficos';

describe('el PNG de un gráfico', () => {
  const png = (largo) => {
    const b = new Uint8Array(largo);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return b;
  };

  it('con su firma y hasta 4 MB, se muestra', () => {
    expect(pngValido(png(100))).toBe(true);
    expect(pngValido(png(MAX_IMAGEN))).toBe(true);
  });

  it('otra cosa, no', () => {
    expect(pngValido(png(MAX_IMAGEN + 1))).toBe(false);
    expect(pngValido(new TextEncoder().encode('<svg onload="x()"></svg>'))).toBe(false);
    expect(pngValido(png(10))).toBe(false);
    expect(pngValido(png(100).buffer)).toBe(false);
    expect(pngValido(null)).toBe(false);
  });
});
