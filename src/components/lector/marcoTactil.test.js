import { describe, expect, it } from 'vitest';
import { acotarLetra, LETRA_MAX, LETRA_MIN, pasoDeLetra, scrollQueQueda } from './marcoTactil';

describe('la letra de un resumen HTML en el celular', () => {
  it('no se pasa de sus topes', () => {
    expect(acotarLetra(10)).toBe(LETRA_MAX);
    expect(acotarLetra(0.1)).toBe(LETRA_MIN);
    expect(acotarLetra(1.234)).toBe(1.23);
  });

  it('sube y baja de a pasos, sin pasarse', () => {
    expect(pasoDeLetra(1, 1)).toBe(1.15);
    expect(pasoDeLetra(1, -1)).toBe(0.9);
    expect(pasoDeLetra(1.2, 1)).toBe(1.3);
    expect(pasoDeLetra(LETRA_MAX, 1)).toBe(LETRA_MAX);
    expect(pasoDeLetra(LETRA_MIN, -1)).toBe(LETRA_MIN);
  });

  it('deja el texto que estaba bajo los dedos en su lugar', () => {
    // At 1000 of 4000, with the fingers 200 below the top: the page twice as tall puts that text at 2400, still 200 below.
    expect(scrollQueQueda(1000, 200, 4000, 8000)).toBe(2200);
    expect(scrollQueQueda(0, 0, 4000, 8000)).toBe(0);
    expect(scrollQueQueda(10, 300, 4000, 2000)).toBe(0);
    expect(scrollQueQueda(500, 0, 0, 2000)).toBe(500);
  });
});
