import { describe, expect, it } from 'vitest';
import { frac } from '../../lib/calculadoras/racional';
import { aproximado, conM, fraccion, miles } from './formato';

describe('cómo se escriben los números en la hoja', () => {
  it('fracciones con coma y con el menos de verdad', () => {
    expect(fraccion(frac(5, 8))).toBe('0,625');
    expect(fraccion(frac(-3, 4))).toBe('−0,75');
    expect(fraccion(frac(1, 3))).toBe('1/3');
    expect(fraccion(frac(1, 2), { decimales: false })).toBe('1/2');
  });

  it('la M grande del simplex', () => {
    expect(conM({ a: frac(3), m: frac(0) })).toBe('3');
    expect(conM({ a: frac(0), m: frac(-1) })).toBe('−M');
    expect(conM({ a: frac(-3), m: frac(2) })).toBe('2M − 3');
    expect(conM({ a: frac(1), m: frac(1, 2) })).toBe('M/2 + 1');
  });

  it('miles con un espacio fino', () => {
    expect(miles(16777214)).toBe('16 777 214');
    expect(miles(62)).toBe('62');
  });

  it('el error de IEEE 754, redondeado y con su potencia de diez', () => {
    // 0,1 en simple guarda 0,100000001490116119384765625.
    expect(aproximado(frac(1490116119384765625n, 10n ** 27n))).toBe('1.49e-9');
    expect(aproximado(frac(1, 4))).toBe('2.5e-1');
    expect(aproximado(frac(9995, 1000))).toBe('1e1');
    expect(aproximado(frac(12345))).toBe('1.23e4');
    expect(aproximado(frac(7))).toBe('7');
  });
});
