// What the painted skies are made of (escenas.js, particulas.js): a random that always gives the same numbers for the
// same seed, so a sky doesn't change between visits, and a smooth noise for clouds, nebulas, mist and wood.

/** Numbers between 0 and 1, always the same ones for the same seed (mulberry32). */
export function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suave = (t) => t * t * (3 - 2 * t);

/** A smooth noise between 0 and 1 over the plane, the same for the same seed. `ruido(x, y)`; `capas(x, y, n)` adds n
 * octaves (fbm), each half as strong and twice as fine. */
export function crearRuido(semilla) {
  const r = azar(semilla);
  const LADO = 256;
  const valores = Float32Array.from({ length: LADO * LADO }, () => r());
  const en = (x, y) => valores[(y & (LADO - 1)) * LADO + (x & (LADO - 1))];
  const ruido = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = suave(x - xi);
    const ty = suave(y - yi);
    const a = en(xi, yi) + (en(xi + 1, yi) - en(xi, yi)) * tx;
    const b = en(xi, yi + 1) + (en(xi + 1, yi + 1) - en(xi, yi + 1)) * tx;
    return a + (b - a) * ty;
  };
  const capas = (x, y, n = 5) => {
    let total = 0;
    let peso = 0.5;
    let escala = 1;
    let suma = 0;
    for (let i = 0; i < n; i++) {
      total += ruido(x * escala + i * 17.3, y * escala - i * 9.1) * peso;
      suma += peso;
      peso /= 2;
      escala *= 2;
    }
    return total / suma;
  };
  return { ruido, capas };
}

/** '#rrggbb' or 'rgb(r g b)' (what getComputedStyle gives) as [r, g, b]. Anything else, black. */
export function aRgb(color) {
  const texto = String(color ?? '').trim();
  const hex = texto.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
  const rgb = texto.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (rgb) return rgb.slice(1, 4).map(Number);
  return [0, 0, 0];
}

/** Between two colors [r, g, b], `t` from 0 to 1. */
export const mezcla = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** [r, g, b] and an alpha as a canvas color. */
export const css = ([r, g, b], alfa = 1) => `rgb(${r} ${g} ${b} / ${alfa})`;

/** Between 0 and 1. */
export const entre01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
