// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { pestanas } from './mesa';
import { datosDeResumen, leerDesplazamiento, llevarResumen } from './resumenMesa';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const sesion = () => ({ doc: new Y.Doc(), yo: { id: 'r0', nombre: 'Ana', color: '#123456' } });

describe('Resumen en la mesa', () => {
  it('a la mesa va solo qué resumen es, y la página de El Santo Resumen se arma acá', () => {
    const s = sesion();
    const id = llevarResumen(s, { id: ID, titulo: 'Ley de Ohm', formato: 'html', materia: 'fisica-2', url: 'https://malo.example/', js: true });
    expect(pestanas(s.doc)).toMatchObject([{ id, tipo: 'resumen', titulo: 'Ley de Ohm', por: 'Ana' }]);
    const datos = s.doc.getMap(`h:${id}`);
    expect(Object.fromEntries(datos.entries())).toEqual({ id: ID, titulo: 'Ley de Ohm', formato: 'html', js: true, materia: 'fisica-2' });
    expect(datosDeResumen(datos)).toMatchObject({ id: ID, formato: 'html', js: true, url: `https://lutastudios.com/utn/banco.html?materia=fisica-2#r-${ID}` });
  });

  it('lo que manda otro mal armado no se abre', () => {
    const d = new Y.Doc().getMap('h');
    d.set('id', '../../a?id=1');
    d.set('formato', 'pdf');
    expect(datosDeResumen(d)).toBeNull();
    d.set('id', ID);
    d.set('formato', 'exe');
    expect(datosDeResumen(d)).toBeNull();
    d.set('formato', 'pdf');
    d.set('materia', 'https://malo.example/');
    d.set('titulo', `a\u0000b${'c'.repeat(500)}`);
    const r = datosDeResumen(d);
    expect(r).toMatchObject({ id: ID, materia: '', url: '' });
    expect(r.titulo.startsWith('a b')).toBe(true);
    expect(r.titulo).toHaveLength(120);
    expect(() => llevarResumen(sesion(), { id: 'x', formato: 'pdf' })).toThrow('no se puede llevar');
  });

  it('seguir a otro en un HTML es cuán abajo está', () => {
    expect(leerDesplazamiento({ y: 0.4 })).toEqual({ y: 0.4 });
    expect(leerDesplazamiento({ y: 7 })).toEqual({ y: 1 });
    expect(leerDesplazamiento({ y: 'x' })).toBeNull();
    expect(leerDesplazamiento({ pagina: 2, y: 0.1, zoom: 'ancho' })).toBeNull();
  });
});
