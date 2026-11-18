import { describe, expect, it } from 'vitest';
import { MAX_PUNTEROS, pedidoDeUbicar, punteroDicho, ubicadosDichos } from './punterosDelLector';

describe('punteroDicho: where this one points, as the reader says it', () => {
  it('is undefined for any other message', () => {
    expect(punteroDicho(null)).toBeUndefined();
    expect(punteroDicho('visor-puntero')).toBeUndefined();
    expect(punteroDicho({ tipo: 'visor-seleccion', texto: 'a', cajas: [] })).toBeUndefined();
  });

  it('takes a place in the shape of resumenMesa, rebuilt', () => {
    const punto = { r: [1, 0, 3], x: 0.25, y: 0.5, n: 0, o: 11, otro: '<b>' };
    const p = punteroDicho({ tipo: 'visor-puntero', punto });
    expect(p).toEqual({ r: [1, 0, 3], x: 0.25, y: 0.5, n: 0, o: 11 });
    expect(p.r).not.toBe(punto.r);
    expect(punteroDicho({ tipo: 'visor-puntero', punto: { r: [], x: 0, y: 1 } })).toEqual({ r: [], x: 0, y: 1 });
  });

  it('is null when the pointer left or the place does not read', () => {
    expect(punteroDicho({ tipo: 'visor-puntero', punto: null })).toBeNull();
    expect(punteroDicho({ tipo: 'visor-puntero' })).toBeNull();
    for (const punto of [
      { r: 'x', x: 0, y: 0 },
      { r: [1.5], x: 0, y: 0 },
      { r: [-1], x: 0, y: 0 },
      { r: [1], x: Number.NaN, y: 0 },
      { r: [1], x: 0, y: Infinity },
      { r: [1], x: '0', y: 0 },
      { r: new Array(41).fill(0), x: 0, y: 0 },
    ]) {
      expect(punteroDicho({ tipo: 'visor-puntero', punto })).toBeNull();
    }
  });

  it('drops a letter that does not read, keeping the place', () => {
    expect(punteroDicho({ tipo: 'visor-puntero', punto: { r: [1], x: 0.5, y: 0.5, n: 0, o: -1 } })).toEqual({ r: [1], x: 0.5, y: 0.5 });
  });
});

describe('ubicadosDichos: where the others land in the frame', () => {
  it('is undefined for any other message', () => {
    expect(ubicadosDichos({ tipo: 'visor-puntero', punto: null })).toBeUndefined();
    expect(ubicadosDichos(undefined)).toBeUndefined();
  });

  it('keeps only the ones it places, with finite numbers', () => {
    const lugares = ubicadosDichos({
      tipo: 'visor-ubicados',
      lista: [
        { id: 0, x: 10, y: 20 },
        { id: 1, fuera: true },
        { id: 2, x: '5', y: 5 },
        { id: 3, x: Number.NaN, y: 5 },
        { id: 4, x: 1e7, y: 5 },
        { id: 1000, x: 1, y: 1 },
        { id: 'a', x: 1, y: 1 },
        { id: 5, x: -3, y: 4, fuera: false },
        null,
      ],
    });
    expect([...lugares]).toEqual([
      [0, { x: 10, y: 20 }],
      [5, { x: -3, y: 4 }],
    ]);
  });

  it('is null when the list does not read or is too long', () => {
    expect(ubicadosDichos({ tipo: 'visor-ubicados', lista: 'x' })).toBeNull();
    expect(ubicadosDichos({ tipo: 'visor-ubicados', lista: new Array(MAX_PUNTEROS + 1).fill({ id: 0, x: 1, y: 1 }) })).toBeNull();
    expect(ubicadosDichos({ tipo: 'visor-ubicados', lista: [] }).size).toBe(0);
  });
});

describe('pedidoDeUbicar: the others to the reader', () => {
  const persona = (id, h) => ({ id, nombre: 'Ana', color: 'red', h });

  it('sends a number per person and their place, never who they are', () => {
    const numeros = new Map();
    const m = pedidoDeUbicar([persona('aaaa', { r: [1, 0], x: 0.5, y: 0.5, n: 0, o: 3 }), persona('bbbb', null), persona('cccc', { r: [2], x: 0, y: 0 })], numeros);
    expect(m).toEqual({ tipo: 'ubicar-punteros', lista: [{ id: 0, punto: { r: [1, 0], x: 0.5, y: 0.5, n: 0, o: 3 } }, { id: 1, punto: { r: [2], x: 0, y: 0 } }] });
    expect(JSON.stringify(m)).not.toMatch(/aaaa|cccc|Ana/);
  });

  it('keeps each person on their number while the reader lives', () => {
    const numeros = new Map();
    pedidoDeUbicar([persona('a', { r: [1], x: 0, y: 0 }), persona('b', { r: [1], x: 0, y: 0 })], numeros);
    const m = pedidoDeUbicar([persona('b', { r: [1], x: 0, y: 0 }), persona('c', { r: [1], x: 0, y: 0 })], numeros);
    expect(m.lista.map((u) => u.id)).toEqual([1, 2]);
  });

  it('sends at most as many as the reader takes', () => {
    const otros = Array.from({ length: MAX_PUNTEROS + 5 }, (_, i) => persona(`p${i}`, { r: [i], x: 0, y: 0 }));
    expect(pedidoDeUbicar(otros, new Map()).lista).toHaveLength(MAX_PUNTEROS);
  });
});
