import { describe, expect, it } from 'vitest';
import { puedeBajarTodo, yaCargadas } from './trabajador';

describe('puedeBajarTodo', () => {
  it('follows the setting «Ahorro de datos» before the connection', () => {
    expect(puedeBajarTodo({ type: 'wifi', effectiveType: '4g' }, 'siempre')).toBe(false);
    expect(puedeBajarTodo(undefined, 'siempre')).toBe(false);
    expect(puedeBajarTodo({ type: 'cellular', effectiveType: '3g', saveData: true }, 'nunca')).toBe(true);
    expect(puedeBajarTodo({ type: 'cellular', effectiveType: '4g' }, 'auto')).toBe(false);
  });

  it('downloads the rest on wifi, on a cable and where the browser does not say (a computer)', () => {
    expect(puedeBajarTodo(undefined)).toBe(true);
    expect(puedeBajarTodo({ type: 'wifi', effectiveType: '4g' })).toBe(true);
    expect(puedeBajarTodo({ type: 'ethernet', effectiveType: '4g' })).toBe(true);
    expect(puedeBajarTodo({ effectiveType: '4g', saveData: false })).toBe(true);
  });

  it('never on mobile data, with data saving or on a slow connection, even on wifi', () => {
    expect(puedeBajarTodo({ type: 'cellular', effectiveType: '4g' })).toBe(false);
    expect(puedeBajarTodo({ type: 'unknown', effectiveType: '4g' })).toBe(false);
    expect(puedeBajarTodo({ type: 'wifi', effectiveType: '4g', saveData: true })).toBe(false);
    expect(puedeBajarTodo({ type: 'wifi', effectiveType: '3g' })).toBe(false);
    expect(puedeBajarTodo({ effectiveType: '2g' })).toBe(false);
  });
});

describe('yaCargadas', () => {
  it('names only the files of assets/ of this site, once and without their query', () => {
    const o = location.origin;
    const entradas = [`${o}/assets/a-1.js`, `${o}/assets/a-1.js`, `${o}/assets/b-2.css?x=1`, `${o}/ajustes.js`, 'https://frro.cvg.utn.edu.ar/assets/c.js', `${o}/motores/python/x.wasm`].map((name) => ({ name }));
    expect(yaCargadas('/', entradas)).toEqual(['assets/a-1.js', 'assets/b-2.css']);
  });
});
