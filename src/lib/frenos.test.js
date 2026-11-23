import { describe, expect, it } from 'vitest';
import { armarCarrera, conSupuestas } from './carrera';
import { CURSAR, RENDIR } from './carrera.fixture';
import { cuantoFrena, ordenarFrenos } from './frenos';
import { leerCorrelativas } from './sysacadVistas';

const R = (clave) => ({ accion: 'Regularizar', clave });
const A = (clave) => ({ accion: 'Aprobar o inscribirte a', clave });
const lado = (clave, faltan, { para = 'cursar', abre = true, electiva = false } = {}) => ({ clave, electiva, para, faltan, abre });
const de = (claves) => claves.map((clave) => ({ clave, nombre: clave }));
const como = (lista) => lista.map((f) => [f.clave, f.abre, f.frena]);

describe('ordenarFrenos', () => {
  it('counts the whole chain once, and that changes the order', () => {
    // r lacks q and k; s, t and u lack r. v and w lack p and k.
    const lados = [
      lado('r', [R('q'), R('k')]), lado('s', [R('r')]), lado('t', [R('r')]), lado('u', [R('r')]),
      lado('v', [R('p'), R('k')]), lado('w', [R('p'), R('k')]),
    ];
    // Only the direct ones, p (v, w) went before q (r).
    expect(como(ordenarFrenos(lados, de(['p', 'q'])))).toEqual([['q', 0, 4], ['p', 0, 2]]);
  });

  it('what is nearer weighs more: each step down the chain counts half', () => {
    // a frees b, b frees c, c frees d; e lacks a and x. x frees y; z lacks x and w.
    const lados = [
      lado('b', [R('a')]), lado('c', [R('b')]), lado('d', [R('c')]), lado('e', [R('a'), R('x')]),
      lado('y', [R('x')]), lado('z', [R('x'), R('w')]),
    ];
    // a holds back more (b, c, d, e), but c and d are far: 1 + ½ + ¼ + 1 is less than x's three that ask for it.
    expect(como(ordenarFrenos(lados, de(['a', 'x'])))).toEqual([['x', 1, 3], ['a', 1, 4]]);
    // Started to passed in the same subject is no step: m asks for a passed, as near as b.
    const pasada = [lado('b', [R('a')]), lado('m', [A('a')]), lado('n', [R('y')]), lado('o', [R('y')])];
    expect(como(ordenarFrenos(pasada, de(['a', 'y'])))).toEqual([['a', 2, 2], ['y', 2, 2]]);
  });

  it('first what opens right away, a subject that asks for two things only when it has both', () => {
    const lados = [lado('b', [R('a'), R('x')]), lado('c', [R('a'), R('x')]), lado('d', [R('a')]), lado('y', [R('x')]), lado('z', [R('x')])];
    expect(como(ordenarFrenos(lados, de(['a', 'x'])))).toEqual([['x', 2, 4], ['a', 1, 3]]);
    // Something else missing that Sysacad names (the elective hours), or not regular yet for the final: it doesn't open.
    expect(ordenarFrenos([lado('b', [R('a')], { abre: false })], de(['a']))[0]).toMatchObject({ abre: 0, frena: 1 });
  });

  it('a final that only asks for it passed: what asks for the other one regular is not held back', () => {
    // x is regular. m asks for x passed for its final; n asks for m regular to start; p asks for m passed to start.
    const lados = [lado('m', [A('x')], { para: 'rendir', abre: false }), lado('n', [R('m')]), lado('p', [A('m')])];
    expect(como(ordenarFrenos(lados, de(['x']), { soloAprobada: true }))).toEqual([['x', 0, 2]]);
    // Not having m at all holds back both.
    expect(ordenarFrenos(lados, de(['m']))[0].frena).toBe(2);
    // A requirement of having it regular never counts for a final.
    expect(ordenarFrenos([lado('m', [R('x')])], de(['x']), { soloAprobada: true })[0].frena).toBe(0);
  });

  it('electives never count, but the chain goes through them', () => {
    const lados = [lado('e', [R('a')], { electiva: true }), lado('b', [R('e')])];
    expect(ordenarFrenos(lados, de(['a']))[0]).toMatchObject({ abre: 0, frena: 1 });
  });

  it('says it short', () => {
    expect(cuantoFrena({ abre: 2, frena: 5 })).toBe('abre 2 ya, frena 5');
    expect(cuantoFrena({ abre: 0, frena: 5 })).toBe('frena 5');
    expect(cuantoFrena({ abre: 0, frena: 0 })).toBe('no frena ninguna');
  });
});

describe('with the real Sysacad pages', () => {
  const COLUMNAS = ['Año', 'Materia', 'Correlatividad', 'Plan'];
  const pestana = (clave, filas) => ({ clave, titulo: clave, fecha: 1, bloques: [{ t: 'tabla', titulo: null, columnas: COLUMNAS, filas: filas.filter((f) => f.length) }] });
  const carrera = armarCarrera([pestana('correlativas-cursar', CURSAR), pestana('correlativas-rendir', RENDIR)]);

  it('«abre ya» is what supposing it opens, electives apart', () => {
    for (const f of carrera.frenos) {
      const abren = [...conSupuestas(carrera, new Set([f.clave])).cursar].filter((k) => !carrera.materias.find((m) => m.clave === k).electiva);
      expect(f.abre, f.nombre).toBe(abren.length);
    }
  });

  it('Tu carrera and the Sysacad screen say the same of Correlatividad para cursar', () => {
    const sysacad = leerCorrelativas([pestana('x', CURSAR).bloques[0]], 'cursar').frenos;
    expect(sysacad).toEqual(carrera.frenos.map(({ nombre, abre, frena }) => ({ nombre, abre, frena })));
  });

  it('in Correlatividad para rendir, only finals: the chain goes on through what asks for one passed', () => {
    const { frenos } = leerCorrelativas([pestana('x', RENDIR).bloques[0]], 'rendir');
    // Comunicación de Datos: Redes de Datos and Seguridad lack it, and Proyecto Final asks for both passed.
    expect(frenos.find((f) => f.nombre === 'Comunicación de Datos')).toEqual({ nombre: 'Comunicación de Datos', abre: 0, frena: 3 });
    // None of these finals opens with one alone: each still lacks being regular.
    expect(frenos.every((f) => f.abre === 0)).toBe(true);
  });
});
