import { describe, expect, it } from 'vitest';
import { esAnimada } from './imagenQuieta';

const bytes = (...partes) => new Uint8Array(partes.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const n32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

// A GIF of 1 by 1 with a color table of two, and `cuadros` images, each with its pause before it.
const PAUSA = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00];
const CUADRO = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
const gif = (cuadros, { comentario = false, tablaLocal = false } = {}) =>
  bytes(
    'GIF89a',
    [1, 0, 1, 0, 0x80, 0, 0],
    [0, 0, 0, 255, 255, 255],
    comentario ? [0x21, 0xfe, 3, 0x2c, 0x2c, 0x2c, 0] : [],
    ...Array.from({ length: cuadros }, () =>
      tablaLocal ? [...PAUSA, ...CUADRO.slice(0, 9), 0x80, 0, 0, 0, 0x2c, 0x2c, 0x2c, ...CUADRO.slice(10)] : [...PAUSA, ...CUADRO],
    ),
    [0x3b],
  );

const trozo = (tipo, datos = []) => [...n32(datos.length), ...[...tipo].map((c) => c.charCodeAt(0)), ...datos, 0, 0, 0, 0];
const png = (...trozos) => bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], ...trozos);
const webp = (banderas) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', 'VP8X', [10, 0, 0, 0], [banderas, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const avif = (...marcas) => bytes(n32(20 + 4 * marcas.length), 'ftyp', marcas[0], [0, 0, 0, 0], ...marcas, [0, 0, 0, 0]);

describe('esAnimada', () => {
  it('un GIF con un solo cuadro está quieto; con dos o más, se mueve', () => {
    expect(esAnimada(gif(1))).toBe(false);
    expect(esAnimada(gif(2))).toBe(true);
    expect(esAnimada(gif(3, { tablaLocal: true }))).toBe(true);
  });

  it('en un GIF, lo que parece un cuadro adentro de un comentario o de su tabla de colores no cuenta', () => {
    expect(esAnimada(gif(1, { comentario: true }))).toBe(false);
    expect(esAnimada(gif(1, { tablaLocal: true }))).toBe(false);
  });

  it('un PNG se mueve solo si trae su animación antes de la imagen', () => {
    expect(esAnimada(png(trozo('IHDR', Array(13).fill(0)), trozo('IDAT', [1, 2]), trozo('IEND')))).toBe(false);
    expect(esAnimada(png(trozo('IHDR', Array(13).fill(0)), trozo('acTL', Array(8).fill(0)), trozo('IDAT', [1, 2]), trozo('IEND')))).toBe(true);
    expect(esAnimada(png(trozo('IHDR', Array(13).fill(0)), trozo('IDAT', [1, 2]), trozo('acTL', Array(8).fill(0))))).toBe(false);
  });

  it('un WebP o un AVIF, por lo que dicen de sí mismos', () => {
    expect(esAnimada(webp(0x02))).toBe(true);
    expect(esAnimada(webp(0x10))).toBe(false);
    expect(esAnimada(avif('avif', 'mif1'))).toBe(false);
    expect(esAnimada(avif('avis', 'msf1'))).toBe(true);
  });

  it('lo que no es una imagen, cortado o vacío, queda como quieto', () => {
    expect(esAnimada(bytes('%PDF-1.7 hola, mundo'))).toBe(false);
    expect(esAnimada(gif(2).slice(0, 30))).toBe(false);
    expect(esAnimada(new Uint8Array())).toBe(false);
    expect(esAnimada(null)).toBe(false);
    expect(esAnimada(gif(2).buffer)).toBe(true);
  });
});
