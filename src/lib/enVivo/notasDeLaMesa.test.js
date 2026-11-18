// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { MAX_SENALADORES } from '../lectura';
import { lecturaDeLaMesa, notasDeLaMesa } from './notasDeLaMesa';

const ana = { id: 'p-ana', nombre: 'Ana', color: '#c2410c' };
const beto = { id: 'p-beto', nombre: 'Beto', color: '#1d6fb8' };
const mesa = () => {
  const doc = new Y.Doc();
  return { doc, datos: doc.getMap('h:abc') };
};
const resaltado = (notas, extra = {}) => ({ id: notas.nuevoId(), pagina: 2, cajas: [[0.1, 0.2, 0.3, 0.02]], desde: 5, hasta: 20, color: 'verde', nota: '', texto: 'la ley de Ohm', creado: 1, ...extra });

describe('Notas del lector en la mesa', () => {
  it('lo que resalta cada uno lo ven todos, con su autor, su color y dónde está el texto', () => {
    const { doc, datos } = mesa();
    const deAna = notasDeLaMesa(doc, datos, ana);
    const r = resaltado(deAna);
    expect(deAna.resaltar(r)).toBe(true);
    const vista = lecturaDeLaMesa(datos, beto);
    expect(vista.resaltados).toHaveLength(1);
    expect(vista.resaltados[0]).toMatchObject({ id: r.id, pagina: 2, desde: 5, hasta: 20, texto: 'la ley de Ohm', autor: { de: 'p-ana', nombre: 'Ana', color: '#c2410c', propio: false } });
    expect(lecturaDeLaMesa(datos, ana).resaltados[0].autor.propio).toBe(true);
  });

  it('la nota la escribe solo su autor; cualquiera lo borra, y «Deshacer» lo vuelve con su autor', () => {
    const { doc, datos } = mesa();
    const deAna = notasDeLaMesa(doc, datos, ana);
    const deBeto = notasDeLaMesa(doc, datos, beto);
    const r = resaltado(deAna);
    deAna.resaltar(r);
    expect(deBeto.cambiar(r.id, { nota: 'mía' })).toBe(false);
    expect(deAna.cambiar(r.id, { nota: 'entra' })).toBe(true);
    const visto = lecturaDeLaMesa(datos, beto).resaltados[0];
    expect(visto.nota).toBe('entra');
    deBeto.borrar(r.id);
    expect(lecturaDeLaMesa(datos, beto).resaltados).toEqual([]);
    expect(deBeto.resaltar(visto)).toBe(true);
    expect(lecturaDeLaMesa(datos, beto).resaltados[0].autor).toMatchObject({ de: 'p-ana', nombre: 'Ana' });
  });

  it('los señaladores son de la mesa, con nombre y tope', () => {
    const { doc, datos } = mesa();
    const n = notasDeLaMesa(doc, datos, ana);
    expect(n.senalar(3)).toBe(true);
    expect(n.nombrar(3, '  Ejercicio\u0000 4 ')).toBe(true);
    expect(lecturaDeLaMesa(datos, beto).senaladores).toEqual([{ pagina: 3, creado: expect.any(Number), nombre: 'Ejercicio 4' }]);
    expect(n.sacar(3)).toBe(true);
    expect(n.sacar(3)).toBe(false);
    for (let p = 1; p <= MAX_SENALADORES; p++) n.senalar(p);
    expect(n.senalar(MAX_SENALADORES + 1)).toBe(false);
  });

  it('lo que llega mal armado de otro no se muestra', () => {
    const { datos } = mesa();
    datos.set('m:zzz', { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], de: 'x' });
    datos.set('m:0123456789ab', { pagina: 1, cajas: [[0, 0, 2, 0.1]], de: 'x' });
    datos.set('m:0123456789ac', { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], de: 'x', color: 'url(javascript:1)', desde: 9, hasta: 3 });
    datos.set('s:-1', { cuando: 1 });
    const l = lecturaDeLaMesa(datos, ana);
    expect(l.resaltados).toHaveLength(1);
    expect(l.resaltados[0]).toMatchObject({ desde: null, hasta: null, autor: { color: '#5b5bd6' } });
    expect(l.senaladores).toEqual([]);
  });
});
