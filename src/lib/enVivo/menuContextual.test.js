import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { abreMenu, aplanar, atajo, esCampo, porLetra, primero, siguiente, ultimo } from './menuContextual';
import { agregar, apilar, leerElementos } from './pizarra';
import * as flujo from './flujo';

const datosNuevos = () => new Y.Doc().getMap('datos');

describe('the menu of the right click', () => {
  it('says each shortcut as on this computer', () => {
    expect(atajo('Mod+B', false)).toBe('Ctrl+B');
    expect(atajo('Mod+Shift+8', false)).toBe('Ctrl+Mayús+8');
    expect(atajo('Mod+Alt+1', true)).toBe('⌘⌥1');
    expect(atajo('', false)).toBe('');
  });

  it('goes through the items with the arrows, skipping the ones that cannot be used and going round', () => {
    const items = aplanar([
      { etiqueta: 'Negrita' },
      '-',
      { fila: 'Color', items: [{ etiqueta: 'Tinta' }, { etiqueta: 'Rojo', deshabilitado: true }] },
      { etiqueta: 'Pegar' },
    ]);
    expect(items.map((i) => i.etiqueta)).toEqual(['Negrita', 'Tinta', 'Rojo', 'Pegar']);
    expect(siguiente(items, 1, 1)).toBe(3);
    expect(siguiente(items, 3, 1)).toBe(0);
    expect(siguiente(items, 0, -1)).toBe(3);
    expect(primero(items)).toBe(0);
    expect(ultimo(items)).toBe(3);
    expect(siguiente([{ etiqueta: 'x', deshabilitado: true }], 0, 1)).toBe(-1);
  });

  it('a letter goes to the next item that starts with it, with or without its accent', () => {
    const items = [{ etiqueta: 'Título' }, { etiqueta: 'Texto' }, { etiqueta: 'Código' }, { etiqueta: 'Cursiva' }];
    expect(porLetra(items, 0, 't')).toBe(1);
    expect(porLetra(items, 1, 'T')).toBe(0);
    expect(porLetra(items, 0, 'c')).toBe(2);
    expect(porLetra(items, 0, 'z')).toBe(-1);
  });

  it('leaves the browser its own menu in text fields, and opens with the menu key or Shift+F10', () => {
    const campo = document.createElement('textarea');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.className = 'ProseMirror';
    expect(esCampo(campo)).toBe(true);
    expect(esCampo(editor)).toBe(false);
    expect(esCampo(document.createElement('svg'))).toBe(false);
    expect(abreMenu({ key: 'ContextMenu' })).toBe(true);
    expect(abreMenu({ key: 'F10', shiftKey: true })).toBe(true);
    expect(abreMenu({ key: 'F10', shiftKey: false })).toBe(false);
  });
});

describe('what the menus do', () => {
  it('Pizarra: brings an element in front of everything or sends it behind', () => {
    const datos = datosNuevos();
    const a = agregar(datos, { t: 'rect', c: 0, g: 0, x1: 0, y1: 0, x2: 10, y2: 10 });
    const b = agregar(datos, { t: 'elipse', c: 0, g: 0, x1: 0, y1: 0, x2: 10, y2: 10 });
    const c = agregar(datos, { t: 'linea', c: 0, g: 0, x1: 0, y1: 0, x2: 10, y2: 10 });
    apilar(datos, a, true);
    expect(leerElementos(datos).map((el) => el.id)).toEqual([b, c, a]);
    apilar(datos, c, false);
    expect(leerElementos(datos).map((el) => el.id)).toEqual([c, b, a]);
    apilar(datos, 'nada', true);
    expect(leerElementos(datos)).toHaveLength(3);
  });

  it('Diagrama de flujo: duplicates a shape with its text and turns an arrow around', () => {
    const datos = datosNuevos();
    const a = flujo.agregarNodo(datos, 'decision', { x: 0, y: 0, txt: '¿Aprobó?' });
    const b = flujo.agregarNodo(datos, 'proceso', { x: 0, y: 200, txt: 'Anotar' });
    const copia = flujo.duplicarNodo(datos, a);
    const nodo = flujo.leerFlujo(datos).nodos.find((n) => n.id === copia);
    expect(nodo).toMatchObject({ t: 'decision', txt: '¿Aprobó?', x: 24, y: 24 });
    const f = flujo.conectar(datos, { de: a, sd: 'b', a: b, ad: 't' });
    flujo.invertirFlecha(datos, f);
    expect(flujo.leerFlujo(datos).flechas.find((x) => x.id === f)).toMatchObject({ de: b, sd: 't', a, ad: 'b', txt: 'Sí' });
    expect(flujo.duplicarNodo(datos, 'nada')).toBeNull();
  });

});
