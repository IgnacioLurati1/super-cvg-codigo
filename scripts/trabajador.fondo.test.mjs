// @vitest-environment node
// The night downloads as the built worker runs them: dist/sw.js evaluated whole, with a fake `self`, the campus behind a
// fake fetch and the browser's database faked (src/lib/baseFalsa.fixture.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { baseFalsa } from '../src/lib/baseFalsa.fixture.js';
import { borrarDescargas, claveDelDia, guardarLlave, ponerDato } from '../src/lib/descargasFondo.js';
import { borrarSinInternet, fichaGuardada, recuperar } from '../src/lib/sinInternetDisco.js';
import { armarTrabajador } from './trabajador.mjs';

const MANIFIESTO = { 'index.html': { file: 'assets/index-a1.js', src: 'index.html', isEntry: true } };
for (const f of ['Materias', 'Materia', 'Calendario']) MANIFIESTO[`src/pages/${f}.jsx`] = { file: `assets/${f}-x.js`, src: `src/pages/${f}.jsx` };
for (const f of ['PreviaHoja', 'VisorPdf']) MANIFIESTO[`src/components/${f}.jsx`] = { file: `assets/${f}-x.js`, src: `src/components/${f}.jsx` };

let dist;
function construir() {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-sw-fondo-'));
  for (const f of ['index.html', '404.html', ...Object.values(MANIFIESTO).map((e) => e.file)]) {
    fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
    fs.writeFileSync(path.join(dist, f), f);
  }
  return armarTrabajador(dist, MANIFIESTO);
}

const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const ARCHIVO = `${CAMPUS}/webservice/pluginfile.php/9/mod_resource/content/1/apunte.pdf`;
const SECCIONES = [{ id: 1, name: 'Unidad 1', modules: [{ id: 11, modname: 'resource', contents: [{ type: 'file', fileurl: ARCHIVO, filesize: 4, timemodified: 1000 }] }] }];

// The worker, running: its listeners, and what it asked the network.
function trabajador(sw, conexion) {
  const oyentes = {};
  const pedidos = [];
  vi.stubGlobal('fetch', vi.fn(async (url, opciones = {}) => {
    const cuerpo = new URLSearchParams(String(opciones.body ?? ''));
    pedidos.push({ url: String(url), metodo: opciones.method, cuerpo });
    if (String(url) === `${CAMPUS}/webservice/rest/server.php`) return new Response(JSON.stringify(SECCIONES), { headers: { 'content-type': 'application/json' } });
    if (String(url).startsWith(`${CAMPUS}/webservice/pluginfile.php/`)) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'application/pdf' } });
    return new Response('', { status: 404 });
  }));
  const yo = {
    location: new URL('https://supercvg.lutastudios.com/sw.js'),
    addEventListener: (tipo, f) => {
      oyentes[tipo] = f;
    },
    registration: { periodicSync: { unregister: vi.fn(async () => true) } },
    navigator: { connection: conexion },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
  };
  new Function('self', 'caches', sw)(yo, { open: async () => ({}), keys: async () => [], match: async () => undefined, delete: async () => true });
  const sincronizar = async (tag) => {
    let espera = Promise.resolve();
    oyentes.periodicsync?.({ tag, waitUntil: (p) => (espera = p) });
    await espera;
  };
  return { oyentes, pedidos, sincronizar };
}

beforeEach(async () => {
  vi.stubGlobal('indexedDB', baseFalsa());
  await guardarLlave('clave-del-alumno', 7);
  await ponerDato('plan', { alumno: 7, dias: { [claveDelDia(new Date())]: [5], [claveDelDia(new Date(Date.now() + 86_400_000))]: [5] }, ahorro: 'auto' });
});
afterEach(async () => {
  await borrarSinInternet();
  await borrarDescargas();
  vi.unstubAllGlobals();
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

describe('the night downloads in the built worker', () => {
  it('has from moodle.js only the reads, and nothing of the page that writes', () => {
    const sw = construir();
    const de = (nombre) => new Function('self', 'caches', `${sw}\nreturn Object.keys(${nombre}).sort();`)({ location: new URL('https://x.test/sw.js'), addEventListener() {} }, {});
    expect(de('Moodle')).toEqual(['LECTURA', 'llamar', 'pedirArchivo']);
    expect(de('Disco')).toEqual(['ARCHIVO_MAXIMO', 'fichaGuardada', 'guardarDeNoche', 'recordar']);
    expect(de('Fondo')).toEqual(['TAG', 'correr']);
    expect(sw).not.toMatch(/^export /m);
  });

  it('on wifi, asks the campus only for the course of the day and its file, with the key in the body, and keeps them', async () => {
    const { pedidos, sincronizar } = trabajador(construir(), { type: 'wifi', effectiveType: '4g' });
    await sincronizar('cvg-descargas');
    expect(pedidos.map((p) => p.url)).toEqual([`${CAMPUS}/webservice/rest/server.php`, ARCHIVO]);
    expect(pedidos[0].cuerpo.get('wsfunction')).toBe('core_course_get_contents');
    expect(pedidos[0].cuerpo.get('courseid')).toBe('5');
    for (const p of pedidos) {
      expect(p.metodo).toBe('POST');
      expect(p.url).not.toContain('clave-del-alumno');
    }
    expect((await recuperar('noche.contenido.5', 'clave-del-alumno')).datos.secciones).toEqual(SECCIONES);
    expect(await fichaGuardada(ARCHIVO, 'clave-del-alumno')).toEqual({ sello: '1000:4', entero: true, noche: true });
  });

  it('on mobile data, with an unknown connection or another tag, asks nothing', async () => {
    const sw = construir();
    for (const conexion of [{ type: 'cellular' }, {}, undefined]) {
      const { pedidos, sincronizar } = trabajador(sw, conexion);
      await sincronizar('cvg-descargas');
      expect(pedidos).toEqual([]);
    }
    const { pedidos, sincronizar } = trabajador(sw, { type: 'wifi' });
    await sincronizar('otra-cosa');
    expect(pedidos).toEqual([]);
  });
});
