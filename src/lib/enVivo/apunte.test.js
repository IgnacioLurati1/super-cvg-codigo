// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { armarPdf } from '../pdfDeEjemplo';
import { colorSeguro, datosDeApunte, leerMarca, leerVista, llevarALaSesion, mismaVista, tipoDeBytes } from './apunte';
import { pestanas } from './mesa';
import { CADA_CAMBIOS, CADA_CONCIENCIA, crearSesion, redesLocales } from './sesion';

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

const pdf = () => new Blob([armarPdf([{ titulo: 'Ley de Ohm', parrafos: ['La corriente es la tensión sobre la resistencia.'] }, { parrafos: ['Segunda página.'] }])], { type: 'application/pdf' });

describe('Apunte de la mesa', () => {
  it('un PDF que lleva uno le llega al otro y se abre', async () => {
    const [a, b] = armar(2);
    const id = llevarALaSesion(a, pdf(), 'Ohm.pdf');
    await esperar(CADA_CAMBIOS + 30);
    expect(pestanas(b.doc)).toMatchObject([{ id, tipo: 'apunte', titulo: 'Ohm.pdf', por: 'Alumno 0' }]);
    const datos = datosDeApunte(b.doc.getMap(`h:${id}`));
    expect(datos).toMatchObject({ nombre: 'Ohm.pdf', de: a.yo.id });

    const llego = await b.archivos.pedir(datos.archivo, datos.de);
    expect(await tipoDeBytes(llego)).toBe('pdf');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const documento = await pdfjs.getDocument({ data: new Uint8Array(await llego.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
    expect(documento.numPages).toBe(2);
    const texto = (await (await documento.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
    expect(texto).toContain('Ley de Ohm');
    await documento.cleanup();
  });

  it('quien sigue al otro recibe su página y su zoom, y una igual no lo mueve', async () => {
    const [a, b] = armar(2);
    a.marcarLocal('p', 'p1');
    a.marcarLocal('v', { p1: { pagina: 2, y: 0.25, zoom: 150 } });
    a.marcarLocal('h', { p1: { pagina: 2, x: 0.5, y: 0.1 } });
    await esperar(CADA_CONCIENCIA + 50);
    const guia = b.otros().find((o) => o.id === a.yo.id);
    expect(leerVista(guia.v.p1)).toEqual({ pagina: 2, y: 0.25, zoom: 150 });
    expect(leerMarca(guia.h.p1)).toEqual({ pagina: 2, x: 0.5, y: 0.1 });
    expect(mismaVista(leerVista(guia.v.p1), { pagina: 2, y: 0.26, zoom: 150 })).toBe(true);
    expect(mismaVista(leerVista(guia.v.p1), { pagina: 2, y: 0.25, zoom: 'ancho' })).toBe(false);
  });

  it('lo que manda otro mal armado no se usa', async () => {
    const d = new Y.Doc().getMap('h');
    d.set('archivo', '../../etc');
    d.set('de', 'r0');
    expect(datosDeApunte(d)).toBeNull();
    d.set('archivo', '0123456789abcdef');
    d.set('de', '<img onerror=x>');
    expect(datosDeApunte(d)).toBeNull();
    d.set('de', 'r1');
    d.set('nombre', `a\u0000b${'x'.repeat(500)}`);
    expect(datosDeApunte(d).nombre).toMatch(/^a bx+$/);
    expect(datosDeApunte(d).nombre.length).toBeLessThanOrEqual(120);

    expect(leerVista({ pagina: '2', y: 0.1, zoom: 100 })).toBeNull();
    expect(leerVista({ pagina: 2, y: NaN, zoom: 100 })).toBeNull();
    expect(leerVista({ pagina: 2, y: 0.1, zoom: 9000 })).toBeNull();
    expect(leerVista({ pagina: 2, y: 7, zoom: 'ancho' })).toEqual({ pagina: 2, y: 1, zoom: 'ancho' });
    expect(leerMarca({ pagina: 0, x: 0.1, y: 0.1 })).toBeNull();
    expect(leerMarca('hola')).toBeNull();
    expect(colorSeguro('#b4235a')).toBe('#b4235a');
    expect(colorSeguro('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)');
    expect(colorSeguro('red;background:url(https://x)')).toBeNull();
    expect(colorSeguro('var(--x)')).toBeNull();
  });

  it('un archivo que no es PDF ni foto no se abre, diga el tipo que diga', async () => {
    expect(await tipoDeBytes(new Blob(['<script>alert(1)</script>'], { type: 'application/pdf' }))).toBeNull();
    expect(await tipoDeBytes(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0])], { type: 'text/html' }))).toBe('image/png');
  });

  it('solo se llevan PDF o fotos, y no pasa de 25 MB', () => {
    const [a] = armar(1);
    expect(() => llevarALaSesion(a, new Blob(['x'], { type: 'text/html' }), 'x.html')).toThrow(/PDF o fotos/);
    const grande = { size: 26 * 1024 * 1024, type: 'application/pdf' };
    Object.setPrototypeOf(grande, Blob.prototype);
    expect(() => llevarALaSesion(a, grande, 'grande.pdf')).toThrow(/25 MB/);
    expect(pestanas(a.doc)).toEqual([]);
  });
});
