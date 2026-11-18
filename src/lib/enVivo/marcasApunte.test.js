// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { anotar, borrarMarca, leerCajas, leerMarcas, marcar, marcasEnTexto, MAX_MARCAS, MAX_NOTA } from './marcasApunte';
import { CADA_CAMBIOS, crearSesion, redesLocales } from './sesion';

const abiertas = [];
function armar(n) {
  const redes = redesLocales(n);
  const sesiones = redes.map((red, k) => crearSesion({ red, yo: { nombre: `Alumno ${k}`, color: '#123456' } }));
  abiertas.push(...sesiones);
  return sesiones;
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
});

const yo = { id: 'r0', nombre: 'Ana', color: '#c0392b' };
const otro = { id: 'r1', nombre: 'Beto', color: '#2471a3' };
const solo = () => {
  const doc = new Y.Doc();
  return { doc, datos: doc.getMap('h:p1') };
};

describe('Marcas del apunte', () => {
  it('lo que resalta uno le llega al otro con su color, su nombre y su nota, y cualquiera la borra', async () => {
    const [a, b] = armar(2);
    const da = a.doc.getMap('h:p1');
    const db = b.doc.getMap('h:p1');
    const id = marcar(a.doc, da, a.yo, { pagina: 2, cajas: [[0.1, 0.2, 0.5, 0.03]], texto: 'Ley de Ohm', nota: 'Entra en el parcial' });
    await esperar(CADA_CAMBIOS + 30);
    expect(leerMarcas(db)).toMatchObject([{ id, pagina: 2, texto: 'Ley de Ohm', nota: 'Entra en el parcial', de: a.yo.id, nombre: 'Alumno 0', color: '#123456' }]);

    // Only its author writes its note; anyone deletes it.
    expect(anotar(db, id, b.yo, 'otra cosa')).toBe(false);
    borrarMarca(db, id);
    await esperar(CADA_CAMBIOS + 30);
    expect(leerMarcas(da)).toEqual([]);
  });

  it('una zona de una foto o de una página escaneada va sin texto', () => {
    const { doc, datos } = solo();
    marcar(doc, datos, yo, { pagina: 1, cajas: [[0.2, 0.3, 0.4, 0.2]] });
    const [m] = leerMarcas(datos);
    expect(m).toMatchObject({ pagina: 1, texto: '', nota: '' });
    expect(marcasEnTexto([m])).toContain('Ana marcó una zona');
  });

  it('la nota la cambia solo quien hizo la marca, cortada', () => {
    const { doc, datos } = solo();
    const id = marcar(doc, datos, yo, { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], texto: 'algo' });
    expect(anotar(datos, id, otro, 'no')).toBe(false);
    expect(anotar(datos, id, yo, 'x'.repeat(MAX_NOTA + 50))).toBe(true);
    expect(leerMarcas(datos)[0].nota).toHaveLength(MAX_NOTA);
  });

  it('lo que manda otro mal armado no se dibuja, y lo largo se corta', () => {
    const { datos } = solo();
    datos.set('m:zzzzzzzzzzzz', { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], de: 'r1' });
    datos.set('m:000000000001', { pagina: 0, cajas: [[0, 0, 0.1, 0.1]], de: 'r1' });
    datos.set('m:000000000002', { pagina: 1, cajas: [[0.9, 0, 0.5, 0.1]], de: 'r1' });
    datos.set('m:000000000003', { pagina: 1, cajas: 'nada', de: 'r1' });
    datos.set('m:000000000004', { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], de: '<script>' });
    datos.set('m:000000000005', { pagina: 1, cajas: [[0, 0, 0.1, 0.1], [NaN, 0, 1, 1]], de: 'r1', nombre: 'B'.repeat(500), texto: `a\u0000b${'c'.repeat(900)}`, color: 'url(javascript:alert(1))' });
    const marcas = leerMarcas(datos);
    expect(marcas).toHaveLength(1);
    expect(marcas[0].cajas).toEqual([[0, 0, 0.1, 0.1]]);
    expect(marcas[0].nombre).toHaveLength(60);
    expect(marcas[0].texto.startsWith('a b')).toBe(true);
    expect(marcas[0].texto.length).toBeLessThanOrEqual(300);
    expect(leerCajas([[0, 0, 0, 0.1]])).toBeNull();
  });

  it('no pasa del tope de marcas por apunte', () => {
    const { doc, datos } = solo();
    for (let i = 0; i < MAX_MARCAS; i += 1) expect(marcar(doc, datos, yo, { pagina: 1, cajas: [[0, 0, 0.1, 0.1]] })).not.toBeNull();
    expect(marcar(doc, datos, yo, { pagina: 1, cajas: [[0, 0, 0.1, 0.1]] })).toBeNull();
    expect(leerMarcas(datos)).toHaveLength(MAX_MARCAS);
  });

  it('Consultron lee las marcas con su página, quién y su nota', () => {
    const { doc, datos } = solo();
    marcar(doc, datos, otro, { pagina: 3, cajas: [[0, 0, 0.1, 0.1]], texto: 'V = I R' });
    const id = marcar(doc, datos, yo, { pagina: 1, cajas: [[0, 0, 0.1, 0.1]], texto: 'resistencia' });
    anotar(datos, id, yo, 'Repasar');
    expect(marcasEnTexto(leerMarcas(datos))).toBe('Marcas de la mesa en este apunte:\n[Página 1] Ana resaltó «resistencia». Nota: Repasar\n[Página 3] Beto resaltó «V = I R».');
  });
});
