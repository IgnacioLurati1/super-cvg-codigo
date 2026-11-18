import { describe, expect, it } from 'vitest';
import { BORDE, TOPE, velocidad } from './autoDesplazar';

// A screen of 800 px with a header of 64.
const v = (y) => velocidad(y, 64, 800);

describe('la página va sola cerca de un borde', () => {
  it('lejos de los bordes no se mueve', () => {
    expect(v(400)).toBe(0);
    expect(v(64 + BORDE)).toBe(0);
    expect(v(800 - BORDE)).toBe(0);
  });

  it('cerca de arriba sube y cerca de abajo baja, más rápido cuanto más cerca', () => {
    expect(v(64 + BORDE - 10)).toBeLessThan(0);
    expect(v(800 - BORDE + 10)).toBeGreaterThan(0);
    expect(Math.abs(v(70))).toBeGreaterThan(Math.abs(v(120)));
    expect(v(795)).toBeGreaterThan(v(750));
  });

  it('sobre la cabecera o fuera de la ventana, a toda velocidad', () => {
    expect(v(10)).toBe(-TOPE);
    expect(v(-50)).toBe(-TOPE);
    expect(v(900)).toBe(TOPE);
  });

  it('en una pantalla baja el borde se achica, para que quede lugar en el medio', () => {
    expect(velocidad(60, 0, 200)).toBe(0);
    expect(velocidad(30, 0, 200)).toBeLessThan(0);
  });

  it('sin posición no se mueve', () => {
    expect(v(Number.NaN)).toBe(0);
    expect(velocidad(10, 100, 100)).toBe(0);
  });
});
