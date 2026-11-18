// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { abrirPestana, cerrarPestana, enPantalla, escribir, leerCerrada, mensajes, pestanas, renombrarPestana, tituloNuevo, MAX_CHAT, MAX_PESTANAS } from './mesa';

const yo = { id: 'r0', nombre: 'Ana', color: '#b4235a' };

describe('la mesa', () => {
  it('abre una pestaña con sus datos de arranque y la cierra con todo', () => {
    const doc = new Y.Doc();
    const id = abrirPestana(doc, 'calculadora', { titulo: 'Matrices', datos: { cual: 'matrices' }, por: 'Ana' });
    expect(pestanas(doc)).toEqual([expect.objectContaining({ id, tipo: 'calculadora', titulo: 'Matrices', por: 'Ana' })]);
    expect(doc.getMap(`h:${id}`).get('cual')).toBe('matrices');
    renombrarPestana(doc, id, 'Ejercicio 3');
    expect(pestanas(doc)[0].titulo).toBe('Ejercicio 3');
    cerrarPestana(doc, id);
    expect(pestanas(doc)).toEqual([]);
    expect(doc.getMap(`h:${id}`).size).toBe(0);
  });

  it('no abre un tipo que no existe ni pasa del tope', () => {
    const doc = new Y.Doc();
    expect(abrirPestana(doc, 'script')).toBeNull();
    for (let i = 0; i < MAX_PESTANAS; i += 1) abrirPestana(doc, 'documento');
    expect(abrirPestana(doc, 'documento')).toBeNull();
  });

  it('lo que otro puso a mano en las pestañas se descarta si no tiene forma', () => {
    const doc = new Y.Doc();
    doc.getMap('pestanas').set('../x', { tipo: 'documento' });
    doc.getMap('pestanas').set('aaaaaaaaaaaa', { tipo: 'html' });
    doc.getMap('pestanas').set('bbbbbbbbbbbb', { tipo: 'pizarra', titulo: 'x'.repeat(500) });
    expect(pestanas(doc).map((p) => [p.id, p.titulo.length])).toEqual([['bbbbbbbbbbbb', 60]]);
  });

  it('el chat guarda lo escrito, sin vacíos, y se queda con los últimos', () => {
    const doc = new Y.Doc();
    expect(escribir(doc, yo, '   ')).toBe(false);
    escribir(doc, yo, ' hola ');
    expect(mensajes(doc)).toEqual([expect.objectContaining({ de: 'r0', nombre: 'Ana', texto: 'hola' })]);
    for (let i = 0; i < MAX_CHAT + 5; i += 1) escribir(doc, yo, `m${i}`);
    expect(mensajes(doc)).toHaveLength(MAX_CHAT);
    expect(mensajes(doc).at(-1).texto).toBe(`m${MAX_CHAT + 4}`);
  });

  it('una herramienta repetida se numera, y cerrar una dice quién y cuál', () => {
    const doc = new Y.Doc();
    abrirPestana(doc, 'documento', { titulo: tituloNuevo(doc, 'Documento') });
    expect(tituloNuevo(doc, 'Documento')).toBe('Documento 2');
    abrirPestana(doc, 'documento', { titulo: tituloNuevo(doc, 'Documento') });
    expect(tituloNuevo(doc, 'Documento')).toBe('Documento 3');
    expect(tituloNuevo(doc, 'Pizarra')).toBe('Pizarra');
    const [primera] = pestanas(doc);
    cerrarPestana(doc, primera.id, { id: 'r1', nombre: 'Ana' });
    expect(leerCerrada(doc)).toEqual({ pestana: primera.id, titulo: primera.titulo, de: 'r1', nombre: 'Ana' });
    doc.getMap('meta').set('cerrada', { pestana: '<b>', titulo: 'x' });
    expect(leerCerrada(doc)).toBeNull();
  });

  it('dejar de seguir queda en la pestaña que se seguía, no en la elegida antes', () => {
    const ids = ['lab', 'calc', 'pizarra'];
    // Juan was on Laboratorio; Ana presents and goes to Calculadora.
    let elegida = 'lab';
    const paso = (guia) => {
      const { activa, propia } = enPantalla(ids, guia, elegida);
      elegida = propia;
      return activa;
    };
    expect(paso({ p: 'pizarra' })).toBe('pizarra');
    expect(paso({ p: 'calc' })).toBe('calc');
    // He acts in the calculator, or goes on his own, or she stops presenting: still on Calculadora.
    expect(paso(null)).toBe('calc');
    // The guide on a tab not here yet (or just closed): the one he had; a closed one gives the first.
    elegida = 'pizarra';
    expect(paso({ p: 'nueva' })).toBe('pizarra');
    expect(enPantalla(['lab', 'calc'], null, 'pizarra')).toEqual({ activa: 'lab', propia: 'pizarra' });
    expect(enPantalla([], null, null)).toEqual({ activa: null, propia: null });
  });
});
