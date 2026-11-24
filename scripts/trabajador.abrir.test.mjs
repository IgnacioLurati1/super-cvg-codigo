// @vitest-environment node
// Opening the site with the built worker: dist/sw.js evaluated whole, with a fake `self`, fake caches and a fake network.
// The kept shell opens at once, the previous version's cache stays for a page of it, and older ones go.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { armarTrabajador } from './trabajador.mjs';

const MANIFIESTO = { 'index.html': { file: 'assets/index-a1.js', src: 'index.html', isEntry: true } };
for (const f of ['Materias', 'Materia', 'Calendario', 'Mensajes', 'Carrera']) MANIFIESTO[`src/pages/${f}.jsx`] = { file: `assets/${f}-x.js`, src: `src/pages/${f}.jsx` };
for (const f of ['PreviaHoja', 'VisorPdf']) MANIFIESTO[`src/components/${f}.jsx`] = { file: `assets/${f}-x.js`, src: `src/components/${f}.jsx` };
const SITIO = 'https://supercvg.lutastudios.com/';

let dist;
// A same-origin answer, as the browser hands it to the worker and keeps it.
const basica = (cuerpo, headers) => {
  const r = new Response(cuerpo, { headers });
  Object.defineProperty(r, 'type', { value: 'basic' });
  return r;
};
afterEach(() => {
  vi.unstubAllGlobals();
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});
function construir() {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-sw-abrir-'));
  for (const f of ['index.html', '404.html', 'ajustes.js', ...Object.values(MANIFIESTO).map((e) => e.file)]) {
    fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
    fs.writeFileSync(path.join(dist, f), f);
  }
  return armarTrabajador(dist, MANIFIESTO);
}

// A kept answer keeps its type, like the browser's cache.
const copia = (r) => {
  const otra = r.clone();
  Object.defineProperty(otra, 'type', { value: r.type });
  return otra;
};

// CacheStorage by address, enough for the worker. Like the browser, it honors `Vary: Origin` unless told to ignore it.
function almacen() {
  const cajas = new Map();
  const clave = (p) => (typeof p === 'string' ? p : p.url);
  const origen = (p) => (typeof p === 'string' ? null : p.headers?.get('origin') ?? null);
  const sirve = (entrada, p, opciones) =>
    entrada && (opciones?.ignoreVary || !/origin/i.test(entrada.respuesta.headers.get('vary') ?? '') || entrada.origen === origen(p));
  const caja = (nombre) => {
    if (!cajas.has(nombre)) cajas.set(nombre, new Map());
    const m = cajas.get(nombre);
    return {
      match: async (p, opciones) => {
        const entrada = m.get(clave(p));
        return sirve(entrada, p, opciones) ? copia(entrada.respuesta) : undefined;
      },
      put: async (p, r) => void m.set(clave(p), { respuesta: copia(r), origen: origen(p) }),
    };
  };
  return {
    cajas,
    open: async (n) => caja(n),
    keys: async () => [...cajas.keys()],
    delete: async (n) => cajas.delete(n),
    match: async (p, opciones) => {
      for (const m of cajas.values()) if (sirve(m.get(clave(p)), p, opciones)) return copia(m.get(clave(p)).respuesta);
      return undefined;
    },
  };
}

function trabajador(sw, cajas) {
  const oyentes = {};
  const red = [];
  vi.stubGlobal('fetch', vi.fn(async (p) => {
    const url = typeof p === 'string' ? p : p.url;
    red.push(url);
    // What the preview server did with a file it didn't have: the site's page, with a 200.
    if (url.endsWith('-falta.js')) return basica('<!doctype html>', { 'content-type': 'text/html' });
    return basica(`red:${url}`);
  }));
  const yo = { location: new URL(`${SITIO}sw.js`), addEventListener: (t, f) => (oyentes[t] = f), clients: { claim: async () => {} }, skipWaiting: async () => {} };
  new Function('self', 'caches', sw)(yo, cajas);
  const esperar = async (tipo, extra = {}) => {
    let espera = Promise.resolve();
    oyentes[tipo]({ waitUntil: (p) => (espera = p), ...extra });
    await espera;
  };
  const pedir = async (url, mode = 'no-cors', headers = new Headers()) => {
    let respuesta = null;
    oyentes.fetch({ request: { url, method: 'GET', mode, headers }, respondWith: (p) => (respuesta = p) });
    return respuesta && (await (await respuesta).text());
  };
  return { red, esperar, pedir };
}

describe('opening with the worker', () => {
  it('opens the kept shell and ajustes.js at once, without waiting for the network', async () => {
    const cajas = almacen();
    const { red, esperar, pedir } = trabajador(construir(), cajas);
    await esperar('install');
    red.length = 0;
    expect(await pedir(SITIO, 'navigate')).toBe(`red:${SITIO}`);
    // The shell came from the install's request: what was kept, not a new one.
    expect(red).toEqual([]);
    expect(await pedir(`${SITIO}materias/5`, 'navigate')).toBe(`red:${SITIO}404.html`);
    expect(await pedir(`${SITIO}ajustes.js`)).toBe(`red:${SITIO}ajustes.js`);
    expect(red).toEqual([]);
  });

  it('without a kept shell, asks the network', async () => {
    const { red, pedir } = trabajador(construir(), almacen());
    expect(await pedir(`${SITIO}materias`, 'navigate')).toBe(`red:${SITIO}materias`);
    expect(red).toEqual([`${SITIO}materias`]);
  });

  it('keeps the previous version for a page of it, and deletes the older ones', async () => {
    const cajas = almacen();
    const vieja = await cajas.open('cvg-sitio-vieja');
    await vieja.put(`${SITIO}__instalada`, new Response('100'));
    const anterior = await cajas.open('cvg-sitio-anterior');
    await anterior.put(`${SITIO}__instalada`, new Response('200'));
    await anterior.put(`${SITIO}assets/Foros-viejo.js`, basica('foros de la anterior'));
    await cajas.open('otra-app');
    const { red, esperar, pedir } = trabajador(construir(), cajas);
    await esperar('install');
    await esperar('activate');
    expect([...cajas.cajas.keys()].filter((n) => n.startsWith('cvg-sitio-'))).toHaveLength(2);
    expect(cajas.cajas.has('cvg-sitio-anterior')).toBe(true);
    expect(cajas.cajas.has('cvg-sitio-vieja')).toBe(false);
    expect(cajas.cajas.has('otra-app')).toBe(true);
    red.length = 0;
    expect(await pedir(`${SITIO}assets/Foros-viejo.js`)).toBe('foros de la anterior');
    expect(red).toEqual([]);
  });

  it('finds a kept module by its address alone, also when the server answered with Vary: Origin', async () => {
    const cajas = almacen();
    const anterior = await cajas.open('cvg-sitio-anterior');
    await anterior.put(`${SITIO}__instalada`, new Response('200'));
    await anterior.put(`${SITIO}assets/index-viejo.js`, basica('el de la anterior', { vary: 'Origin' }));
    const { red, esperar, pedir } = trabajador(construir(), cajas);
    await esperar('install');
    await esperar('activate');
    red.length = 0;
    const modulo = new Headers({ origin: 'https://supercvg.lutastudios.com' });
    expect(await pedir(`${SITIO}assets/index-viejo.js`, 'cors', modulo)).toBe('el de la anterior');
    expect(red).toEqual([]);
  });

  it('never keeps a page in place of code, and never serves one kept before', async () => {
    const cajas = almacen();
    const anterior = await cajas.open('cvg-sitio-anterior');
    await anterior.put(`${SITIO}__instalada`, new Response('200'));
    await anterior.put(`${SITIO}assets/app-envenenado.js`, basica('<!doctype html>', { 'content-type': 'text/html' }));
    const { red, esperar, pedir } = trabajador(construir(), cajas);
    await esperar('install');
    await esperar('activate');
    expect(await pedir(`${SITIO}assets/app-falta.js`)).toBe('<!doctype html>');
    expect(await pedir(`${SITIO}assets/app-falta.js`)).toBe('<!doctype html>');
    expect(red.filter((u) => u.endsWith('app-falta.js'))).toHaveLength(2);
    red.length = 0;
    expect(await pedir(`${SITIO}assets/app-envenenado.js`)).toBe(`red:${SITIO}assets/app-envenenado.js`);
    expect(red).toEqual([`${SITIO}assets/app-envenenado.js`]);
  });
});
