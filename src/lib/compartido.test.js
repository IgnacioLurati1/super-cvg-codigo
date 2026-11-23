import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { borrarCompartido, comoTexto, LEE_CONSULTRON, leerCompartido, limpiarCompartidoViejo, tomarVencido } from './compartido';
import { MAX_ADJUNTOS } from './consultron/adjuntar';
import { COMPARTIDO } from './compartidoSaneo';

// Cache Storage as the service worker leaves it: what's kept by address, as the bytes and type it had.
let cajas;
const respuesta = (cuerpo, tipo) => ({ json: async () => JSON.parse(cuerpo), blob: async () => new Blob([cuerpo], { type: tipo }) });
function cacheFalso() {
  const guardado = new Map();
  return {
    guardado,
    put: async (url, { cuerpo, tipo }) => guardado.set(url, { cuerpo, tipo }),
    match: async (url) => (guardado.has(url) ? respuesta(guardado.get(url).cuerpo, guardado.get(url).tipo) : undefined),
  };
}
const lugar = (i) => new URL(`/${COMPARTIDO.ruta}${i}`, window.location.origin).href;

async function dejar(datos, archivos = []) {
  const cache = cacheFalso();
  cajas.set(COMPARTIDO.cache, cache);
  for (const [i, a] of archivos.entries()) await cache.put(lugar(i), a);
  await cache.put(lugar('datos'), { cuerpo: JSON.stringify(datos), tipo: 'application/json' });
}

beforeEach(() => {
  cajas = new Map();
  globalThis.caches = {
    has: async (n) => cajas.has(n),
    open: async (n) => cajas.get(n) ?? (cajas.set(n, cacheFalso()), cajas.get(n)),
    delete: async (n) => cajas.delete(n),
  };
});
afterEach(() => {
  delete globalThis.caches;
});

describe('what another app shared, read back', () => {
  it('gives the files with their names and types, and the link apart', async () => {
    await dejar(
      { cuando: Date.now(), titulo: 'Física', texto: '', enlace: 'https://lutastudios.com/utn/ver?id=1', archivos: [{ nombre: 'TP.pdf', tipo: 'pdf' }, { nombre: '../x.exe', tipo: 'jpg' }], fuera: [{ nombre: 'a.docx', por: 'tipo' }, { nombre: 'b', por: 'otro' }] },
      [{ cuerpo: '%PDF-1', tipo: 'application/pdf' }, { cuerpo: 'jpg', tipo: 'image/jpeg' }],
    );
    const l = await leerCompartido();
    expect(l.archivos.map((a) => [a.name, a.type])).toEqual([
      ['TP.pdf', 'application/pdf'],
      ['x.jpg', 'image/jpeg'],
    ]);
    expect(l.enlace).toBe('https://lutastudios.com/utn/ver?id=1');
    expect(l.fuera).toEqual([{ nombre: 'a.docx', por: 'tipo' }]);
  });

  it('a type that is not a PDF or a photo is left out, even if the list says so', async () => {
    await dejar({ cuando: Date.now(), archivos: [{ nombre: 'x.html', tipo: 'html' }], enlace: 'javascript:alert(1)' }, [{ cuerpo: '<script>', tipo: 'text/html' }]);
    expect(await leerCompartido()).toBeNull();
    expect(cajas.has(COMPARTIDO.cache)).toBe(false);
  });

  it('after half an hour it is gone, also when the site opens', async () => {
    const viejo = { cuando: Date.now() - COMPARTIDO.vida - 1, texto: 'hola', archivos: [] };
    await dejar(viejo);
    expect(await leerCompartido()).toBeNull();
    expect(cajas.has(COMPARTIDO.cache)).toBe(false);
    // Its screen can tell it apart from nothing at all, once.
    expect(tomarVencido()).toBe(true);
    expect(tomarVencido()).toBe(false);
    await dejar(viejo);
    await limpiarCompartidoViejo();
    expect(cajas.has(COMPARTIDO.cache)).toBe(false);
    expect(tomarVencido()).toBe(true);
    await dejar({ ...viejo, cuando: Date.now() });
    await limpiarCompartidoViejo();
    expect(cajas.has(COMPARTIDO.cache)).toBe(true);
  });

  it('deleting it leaves nothing, and without Cache Storage nothing breaks', async () => {
    await dejar({ cuando: Date.now(), texto: 'hola', archivos: [] });
    await borrarCompartido();
    expect(cajas.size).toBe(0);
    delete globalThis.caches;
    expect(await leerCompartido()).toBeNull();
    await expect(borrarCompartido()).resolves.toBeUndefined();
  });

  it('says what Consultron reads per question', () => {
    expect(LEE_CONSULTRON).toBe(MAX_ADJUNTOS);
  });

  it('the link and the text go to Consultron as a text file', async () => {
    const f = comoTexto({ titulo: 'Física', texto: '', enlace: 'https://a.com/x' });
    expect(f.name).toBe('Lo que compartiste.txt');
    expect(f.size).toBe(new TextEncoder().encode('Física\n\nhttps://a.com/x').length);
    expect(await new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.readAsText(f);
    })).toBe('Física\n\nhttps://a.com/x');
  });
});
