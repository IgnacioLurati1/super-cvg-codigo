import { describe, expect, it } from 'vitest';
import { cambiosDelPaso, describirPaso, filasDeObjetos, fotoDelPaso, leerRecorrido, lineasDelPaso, nombreDeMarco, salidaHasta, textoDeValor } from './pasos';

// A trace as rastreo.js writes it, of:
//   1 def agregar(lista, x):
//   2     lista.append(x)
//   3     return len(lista)
//   4 a = [1]
//   5 b = a
//   6 n = agregar(b, int(input("¿Cuántos? ")))
//   7 print(a)
const global = (l, v) => ({ f: '<module>', t: 'g', l, v });
const MARCOS = [
  global(1, []),
  global(4, [['agregar', ['f', 'agregar']]]),
  global(5, [['agregar', ['f', 'agregar']], ['a', ['r', 1]]]),
  global(6, [['agregar', ['f', 'agregar']], ['a', ['r', 1]], ['b', ['r', 1]]]),
  { f: 'agregar', t: 'f', l: 1, v: [['lista', ['r', 1]], ['x', ['v', '7']]] },
  { f: 'agregar', t: 'f', l: 2, v: [['lista', ['r', 1]], ['x', ['v', '7']]] },
  { f: 'agregar', t: 'f', l: 3, v: [['lista', ['r', 1]], ['x', ['v', '7']]] },
  global(7, [['agregar', ['f', 'agregar']], ['a', ['r', 1]], ['b', ['r', 1]], ['n', ['v', '2']]]),
];
const OBJETOS = [
  { i: 1, t: 'lista', k: 1, e: [['v', '1']] },
  { i: 1, t: 'lista', k: 1, e: [['v', '1'], ['v', '7']] },
];
const PASOS = [
  { e: 'line', l: 1, s: 0, m: [0], o: [] },
  { e: 'line', l: 4, s: 0, m: [1], o: [] },
  { e: 'line', l: 5, s: 0, m: [2], o: [0] },
  { e: 'line', l: 6, s: 0, m: [3], o: [0] },
  { e: 'call', l: 1, s: 12, m: [3, 4], o: [0] },
  { e: 'line', l: 2, s: 12, m: [3, 5], o: [0] },
  { e: 'line', l: 3, s: 12, m: [3, 6], o: [1] },
  { e: 'return', l: 3, s: 12, m: [3, 6], o: [1], d: ['v', '2'] },
  { e: 'line', l: 7, s: 12, m: [7], o: [1] },
  { e: 'fin', l: 7, s: 19, m: [7], o: [1] },
];
const SALIDA = [['out', '¿Cuántos? '], ['in', '7\n'], ['out', '[1, 7]\n']];
const texto = (extra = {}) => JSON.stringify({ pasos: PASOS, marcos: MARCOS, objetos: OBJETOS, salida: SALIDA, tope: false, ...extra });

describe('leerRecorrido', () => {
  it('lee lo que manda el worker', () => {
    const r = leerRecorrido(texto());
    expect(r.pasos).toHaveLength(10);
    expect(r.tope).toBe(false);
    expect(leerRecorrido(texto({ tope: true })).tope).toBe(true);
  });

  it('lo que no tiene la forma no entra', () => {
    expect(leerRecorrido('no es json')).toBe(null);
    expect(leerRecorrido('{"pasos":[]}')).toBe(null);
    expect(leerRecorrido(texto({ pasos: [] }))).toBe(null);
    // A step that points to a frame that isn't there is left out.
    expect(leerRecorrido(texto({ pasos: [...PASOS, { e: 'line', l: 1, s: 0, m: [99], o: [] }] })).pasos).toHaveLength(10);
    expect(leerRecorrido(texto({ marcos: [...MARCOS, { f: 3 }] }))).toBe(null);
  });
});

describe('cada paso', () => {
  const r = leerRecorrido(texto());

  it('marca la línea que sigue y la que acaba de correr', () => {
    expect(lineasDelPaso(r, 0)).toEqual({ siguiente: 1, recien: 0, archivo: null });
    expect(lineasDelPaso(r, 3)).toEqual({ siguiente: 6, recien: 5, archivo: null });
    expect(lineasDelPaso(r, 4)).toEqual({ siguiente: 1, recien: 6, archivo: null });
    // Returning, and at the end, only the one that ran.
    expect(lineasDelPaso(r, 7)).toEqual({ siguiente: 0, recien: 3, archivo: null });
    expect(lineasDelPaso(r, 9)).toEqual({ siguiente: 0, recien: 7, archivo: null });
  });

  it('lo cuenta en palabras', () => {
    expect(describirPaso(fotoDelPaso(r, 0))).toBe('Va a correr la línea 1.');
    expect(describirPaso(fotoDelPaso(r, 4))).toBe('Entra a agregar con lista = lista 1 y x = 7.');
    expect(describirPaso(fotoDelPaso(r, 7))).toBe('agregar devuelve 2.');
    expect(describirPaso(fotoDelPaso(r, 9))).toBe('Terminó.');
    const conError = leerRecorrido(texto({ pasos: [...PASOS.slice(0, -1), { ...PASOS.at(-1), x: 'ZeroDivisionError: division by zero' }] }));
    expect(describirPaso(fotoDelPaso(conError, 9))).toBe('Terminó con un error en la línea 7.');
    expect(fotoDelPaso(conError, 9).error).toBe('ZeroDivisionError: division by zero');
    // A return without what it gives back: by an error, or a void function of C (n).
    const sinValor = (n) => leerRecorrido(texto({ pasos: PASOS.map((p, i) => (i === 7 ? { e: p.e, l: p.l, s: p.s, m: p.m, o: p.o, ...n } : p)) }));
    expect(describirPaso(fotoDelPaso(sinValor({}), 7))).toBe('Sale de agregar por un error.');
    expect(describirPaso(fotoDelPaso(sinValor({ n: 1 }), 7))).toBe('Sale de agregar.');
  });

  it('la salida hasta ese paso, con lo que se escribió', () => {
    expect(salidaHasta(r.salida, 0)).toEqual([]);
    expect(salidaHasta(r.salida, 12)).toEqual([{ flujo: 'out', texto: '¿Cuántos? ' }, { flujo: 'in', texto: '7\n' }]);
    expect(salidaHasta(r.salida, 15)).toEqual([{ flujo: 'out', texto: '¿Cuántos? ' }, { flujo: 'in', texto: '7\n' }, { flujo: 'out', texto: '[1,' }]);
  });

  it('dos variables que apuntan a la misma lista dicen el mismo nombre, y la lista va una sola vez', () => {
    const f = fotoDelPaso(r, 6);
    const [a, b] = f.marcos[0].v.slice(1).map(([, v]) => textoDeValor(v, f.porId));
    expect([a, b]).toEqual(['lista 1', 'lista 1']);
    expect(filasDeObjetos(f).map((fila) => fila.map((o) => o.i))).toEqual([[1]]);
  });

  it('marca lo que cambió desde el paso anterior', () => {
    expect([...cambiosDelPaso(fotoDelPaso(r, 2), fotoDelPaso(r, 3))]).toEqual(['m0:b']);
    expect([...cambiosDelPaso(fotoDelPaso(r, 5), fotoDelPaso(r, 6))]).toEqual(['o1:1']);
    expect(cambiosDelPaso(null, fotoDelPaso(r, 0)).size).toBe(0);
  });
});

describe('los nombres', () => {
  it('de cada marco y de cada valor', () => {
    expect(nombreDeMarco({ f: '<module>', t: 'g' })).toBe('Programa principal');
    expect(nombreDeMarco({ f: 'Nodo', t: 'c' })).toBe('clase Nodo');
    expect(nombreDeMarco({ f: '<lambda>', t: 'f' })).toBe('lambda');
    // C: the globals have a frame of their own.
    expect(nombreDeMarco({ f: 'Variables globales', t: 'g' })).toBe('Variables globales');
    const porId = new Map([[3, { i: 3, t: 'objeto', c: 'Alumno', k: 2 }]]);
    expect(textoDeValor(['r', 3], porId)).toBe('Alumno 2');
    expect(textoDeValor(['e', 1234], porId)).toBe('un entero de 1.234 cifras');
    expect(textoDeValor(['f', 'agregar'], porId)).toBe('función agregar');
    expect(textoDeValor(['v', "'hola'"], porId)).toBe("'hola'");
  });

  it('un árbol queda en una fila, con cada hijo a la derecha', () => {
    const objetos = [
      { i: 1, t: 'objeto', c: 'Nodo', k: 1, a: [['v', ['v', '1']], ['izq', ['r', 2]], ['der', ['r', 3]]] },
      { i: 2, t: 'objeto', c: 'Nodo', k: 2, a: [['v', ['v', '0']]] },
      { i: 3, t: 'objeto', c: 'Nodo', k: 3, a: [['v', ['v', '2']]] },
      { i: 4, t: 'lista', k: 1, e: [] },
    ];
    const recorrido = { pasos: [{ e: 'line', l: 1, s: 0, m: [0], o: [0, 1, 2, 3] }], marcos: [global(1, [['raiz', ['r', 1]]])], objetos, salida: [], tope: false };
    expect(filasDeObjetos(fotoDelPaso(recorrido, 0)).map((fila) => fila.map((o) => o.i))).toEqual([[1, 2, 3], [4]]);
  });
});
