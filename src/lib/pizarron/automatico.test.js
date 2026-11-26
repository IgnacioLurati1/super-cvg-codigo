import { describe, expect, it } from 'vitest';
import { elegir, medir } from './automatico';

// A green board 300 x 200 with chalk drawn by `pintar(x, y)`: a number from 0 (board) to 1 (full chalk).
function pizarron(pintar) {
  const W = 300;
  const H = 200;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = pintar(x, y);
      const c = [40, 80, 60].map((v) => v + (230 - v) * t);
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}
// The same on a white board, in black marker.
function blanco(pintar) {
  const W = 300;
  const H = 200;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = 235 - 205 * pintar(x, y);
      data.set([c, c, c + 4, 255], (y * W + x) * 4);
    }
  }
  return { data, width: W, height: H };
}
// Six lines across, three pixels thick.
const enLinea = (y) => y % 30 >= 14 && y % 30 < 17;

describe('el modo automático', () => {
  it('la tiza que se lee bien va remarcada, nunca en birome', () => {
    expect(elegir(pizarron((x, y) => (x > 20 && x < 280 && enLinea(y) ? 1 : 0)), 'verde')).toMatchObject({ tiza: 'remarcada', intensidad: 0.5 });
  });

  it('la tiza débil en puntos va remarcada y con más intensidad', () => {
    const r = elegir(pizarron((x, y) => (x > 20 && x < 280 && enLinea(y) && x % 3 === 0 ? 0.3 : 0)), 'verde');
    expect(r).toMatchObject({ tiza: 'remarcada', intensidad: 0.75 });
  });

  it('el fibrón que se lee bien queda como está, también la letra chica de una filmina', () => {
    expect(elegir(blanco((x, y) => (x > 20 && x < 280 && enLinea(y) ? 1 : 0)), 'blanco')).toMatchObject({ tiza: 'como' });
    // Rows of small «o», 7 px across with a 3 px hole.
    const o = (x, y) => {
      if (x < 20 || x > 280 || y % 14 > 8) return 0;
      const dx = (x % 10) - 4;
      const dy = (y % 14) - 4;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      return d >= 2 && d <= 3 ? 1 : 0;
    };
    expect(elegir(blanco(o), 'blanco')).toMatchObject({ tiza: 'como' });
  });

  it('mide los trazos largos y los puntos sueltos por separado', () => {
    const W = 100;
    const H = 60;
    const data = new Uint8ClampedArray(W * H * 4).fill(255);
    const negro = (x, y) => data.set([0, 0, 0], (y * W + x) * 4);
    for (let x = 10; x < 90; x++) negro(x, 30);
    negro(5, 5);
    negro(50, 50);
    const m = medir({ data, width: W, height: H });
    expect(m.sueltos).toBe(2);
    expect(m.trazos * W * H).toBeCloseTo(80);
    expect(m.manchas).toBe(0);
  });
});
