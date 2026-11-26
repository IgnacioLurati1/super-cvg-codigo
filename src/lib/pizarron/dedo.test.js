import { describe, expect, it } from 'vitest';
import { aBarrer, seguirTiza } from './dedo';
import { limpiar } from './limpiar';

const W = 400;
const H = 300;
// A mask 1/0 with `pintar(x, y)`.
const mascara = (pintar) => {
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pintar(x, y)) m[y * W + x] = 1;
  return m;
};
// Writing: four lines 3 px thick, long like strokes.
const escritura = (x, y) => x > 60 && x < 340 && [80, 120, 160, 200].some((l) => y >= l && y < l + 3);

describe('la escoba', () => {
  it('barre una mancha ancha pegada al borde y deja la escritura', () => {
    const tinta = mascara((x, y) => escritura(x, y) || (x < 50 && y > 200));
    const sale = aBarrer(tinta, W, H, { todo: true });
    expect(sale[250 * W + 20]).toBe(1);
    expect(sale[81 * W + 200]).toBe(0);
    expect(sale[201 * W + 100]).toBe(0);
  });

  it('barre un punto suelto lejos de todo, pero no uno entre la escritura', () => {
    const lejos = (x, y) => x >= 370 && x < 372 && y >= 20 && y < 22;
    const entre = (x, y) => x >= 200 && x < 202 && y >= 112 && y < 114;
    const sale = aBarrer(mascara((x, y) => escritura(x, y) || lejos(x, y) || entre(x, y)), W, H, { todo: true });
    expect(sale[20 * W + 370]).toBe(1);
    expect(sale[112 * W + 200]).toBe(0);
  });

  it('en toda la foto saca lo mismo que pasándola entera a mano', () => {
    const polvo = (x, y) => (x === 150 || x === 370) && y >= 20 && y < 23;
    const tinta = mascara((x, y) => escritura(x, y) || polvo(x, y) || (x < 50 && y > 200));
    expect(aBarrer(tinta, W, H, { todo: true })).toEqual(aBarrer(tinta, W, H, { zona: mascara(() => true) }));
  });

  it('con el dedo saca lo chico que tapó, no la línea que cruzó', () => {
    const polvo = (x, y) => (x === 150 || x === 250) && y >= 100 && y < 103;
    const tinta = mascara((x, y) => escritura(x, y) || polvo(x, y));
    const zona = mascara((x, y) => y > 90 && y < 130);
    const sale = aBarrer(tinta, W, H, { zona });
    expect(sale[100 * W + 150]).toBe(1);
    expect(sale[121 * W + 200]).toBe(0);
  });

  it('sin nada para barrer no marca nada', () => {
    expect(aBarrer(mascara(escritura), W, H, { todo: true })).toBeNull();
    expect(aBarrer(mascara(escritura), W, H)).toBeNull();
  });
});

describe('el lápiz', () => {
  // Faint chalk along y = 150 (60 out of 255), and the finger 8 px below it.
  const cuanto = new Uint8Array(W * H);
  for (let x = 40; x < 360; x++) for (let y = 149; y <= 151; y++) cuanto[y * W + x] = 60;
  const repaso = { puntos: [[100 / W, 158 / H], [300 / W, 158 / H]], r: 0.03 };

  it('sigue la tiza y no el dedo', () => {
    const { lineas } = seguirTiza(cuanto, W, H, [repaso]);
    expect(lineas).toHaveLength(1);
    for (const c of lineas[0]) expect(Math.abs(c.y - 150)).toBeLessThan(1.5);
  });

  it('donde no hay tiza, no inventa una línea', () => {
    const { lineas, sinTiza } = seguirTiza(new Uint8Array(W * H), W, H, [repaso]);
    expect(lineas).toHaveLength(0);
    expect(sinTiza.length).toBeGreaterThan(0);
  });
});

describe('limpiar con la escoba', () => {
  // A green board with writing and a wide light band along an edge (narrower than the blocks the board is read by).
  const img = { data: new Uint8ClampedArray(W * H * 4), width: W, height: H };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tiza = escritura(x, y) || (x < 12 && y > 150);
      img.data.set(tiza ? [235, 235, 230, 255] : [40, 80, 60, 255], (y * W + x) * 4);
    }
  }
  const oscuro = (r, x, y) => r.data[(y * W + x) * 4] < 128;

  it('«Arreglar todo» dibuja la línea débil junto a la escritura, no la suelta ni el polvo', () => {
    const debil = { data: new Uint8ClampedArray(img.data), width: W, height: H };
    const trazo = (x, y) => debil.data.set([75, 105, 85], (y * W + x) * 4);
    // Under the writing, faint; far from it, a faint ghost and a speck of dust.
    for (let x = 60; x < 340; x++) for (let y = 222; y < 225; y++) trazo(x, y);
    for (let x = 200; x < 340; x++) for (let y = 285; y < 288; y++) trazo(x, y);
    for (let y = 30; y < 32; y++) trazo(30, y);
    const comun = limpiar(debil, 'verde', 'hoja');
    const auto = limpiar(debil, 'verde', 'hoja', { repasos: [{ auto: true }] });
    const gris = (r, x, y) => r.data[(y * W + x) * 4];
    expect(gris(auto, 200, 223)).toBeLessThan(gris(comun, 200, 223) - 40);
    expect(Math.abs(gris(auto, 270, 286) - gris(comun, 270, 286))).toBeLessThan(20);
    expect(oscuro(auto, 30, 30)).toBe(false);
    expect(oscuro(auto, 5, 260)).toBe(false);
  });

  it('«Barrer toda la foto» muestra en rojo lo que se va y después lo saca', () => {
    const marcada = limpiar(img, 'verde', 'hoja', { repasos: [{ barre: true, todo: true }], marcar: true });
    expect(marcada.marcados).toBe(true);
    const o = (260 * W + 5) * 4;
    expect([...marcada.data.slice(o, o + 3)]).toEqual([214, 40, 57]);
    const barrida = limpiar(img, 'verde', 'hoja', { repasos: [{ barre: true, todo: true }] });
    expect(oscuro(barrida, 5, 260)).toBe(false);
    expect(oscuro(barrida, 200, 81)).toBe(true);
  });
});
