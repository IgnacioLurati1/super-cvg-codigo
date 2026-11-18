// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { nuevoCodigo } from './codigo';
import { borrarGuardadas, guardadaLeida, idDeSesion, leerGuardada, listarGuardadas, olvidarGuardada, ponerGuardada } from './guardadas';
import { guardarMientras, prepararVuelta } from './guardadoSesion';
import { leerCarpeta, sumarArchivo, textosDeLaCarpeta } from './laboratorioCompartido';
import { abrirPestana, escribir, mensajes, pestanas } from './mesa';
import { anotarOrigen, origenAnotado } from './origenes';
import { crearSesion, redesLocales } from './sesion';
import { leerDeDrive, nombreEnDrive, unaVueltaSesiones } from './sesionesEnDrive';

// A database of the browser, enough for guardadas.js (the same as charlas.test.js).
function baseFalsa() {
  const bases = new Map();
  const copia = (v) => (v === undefined ? undefined : structuredClone(v));
  function transaccion(datos, nombre) {
    const tx = {};
    let pendientes = 0;
    let terminada = false;
    const revisar = () => {
      if (pendientes || terminada) return;
      terminada = true;
      queueMicrotask(() => tx.oncomplete?.());
    };
    const hacer = (f) => {
      const pedido = {};
      pendientes += 1;
      queueMicrotask(() => {
        pedido.result = f();
        pendientes -= 1;
        pedido.onsuccess?.();
        revisar();
      });
      return pedido;
    };
    tx.objectStore = () => {
      const m = datos.almacenes.get(nombre);
      return {
        get: (k) => hacer(() => copia(m.get(k))),
        put: (v, k) => hacer(() => m.set(k, copia(v)) && k),
        delete: (k) => hacer(() => {
          m.delete(k);
        }),
        getAll: (r) => hacer(() => [...m.entries()].filter(([k]) => k >= r.lower && k <= r.upper).map(([, v]) => copia(v))),
      };
    };
    queueMicrotask(revisar);
    return tx;
  }
  return {
    open: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        let datos = bases.get(nombre);
        const nueva = !datos;
        if (nueva) bases.set(nombre, (datos = { almacenes: new Map() }));
        pedido.result = {
          objectStoreNames: { contains: (n) => datos.almacenes.has(n) },
          createObjectStore: (n) => datos.almacenes.set(n, new Map()),
          close: () => {},
          transaction: (n) => transaccion(datos, n),
        };
        if (nueva) pedido.onupgradeneeded?.();
        pedido.onsuccess?.();
      });
      return pedido;
    },
    deleteDatabase: (nombre) => {
      const pedido = {};
      queueMicrotask(() => {
        bases.delete(nombre);
        pedido.onsuccess?.();
      });
      return pedido;
    },
    crudo: (alumno, id) => bases.get('super-cvg-en-vivo')?.almacenes.get('sesiones')?.get(`${alumno}:${id}`),
  };
}

// The hidden folder of a Drive, in memory, with the shape of drive.js.
function driveFalso() {
  const archivos = new Map();
  let n = 0;
  return {
    archivos,
    async listar() {
      return [...archivos].map(([id, f]) => ({ id, name: f.name, version: String(f.version), modifiedTime: f.modifiedTime }));
    },
    async mirar(id) {
      return { id, version: String(archivos.get(id).version) };
    },
    async bajar(id) {
      return new Response(archivos.get(id).texto);
    },
    async subir({ id, nombre, blob }) {
      const texto = await blob.text();
      if (id) {
        const f = archivos.get(id);
        Object.assign(f, { texto, version: f.version + 1, modifiedTime: new Date().toISOString() });
        return id;
      }
      n += 1;
      archivos.set(`f${n}`, { name: nombre, texto, version: 1, modifiedTime: new Date().toISOString() });
      return `f${n}`;
    },
    async borrar(id) {
      archivos.delete(id);
    },
  };
}

const ALUMNO = 7;
const TITULOS = ['Guía 1.pdf', 'Laboratorio', 'Resumen del TP'];
const nada = () => {};
const sinDrive = async () => [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const abiertas = [];
let base;

function guardando(sesion, codigo, extra = {}) {
  return guardarMientras(sesion, codigo, { alumno: ALUMNO, vigente: () => true, alGuardar: nada, deDrive: sinDrive, ...extra });
}
function unaSesion(red, { nueva = true, nombre = 'Ana G.', id, anfitrion = false } = {}) {
  const s = crearSesion({ red, nueva, yo: { id, nombre, color: '#1d6fb8', anfitrion } });
  abiertas.push(s);
  return s;
}
const textoDelDocumento = (doc) => {
  const p = pestanas(doc).find((x) => x.tipo === 'documento');
  return p ? doc.getMap(`h:${p.id}`).get('texto').toString() : '';
};

// Ana works on a table with a document, the Laboratorio, a course of the campus and the chat; then everyone leaves.
async function sesionQueSeFue(codigo) {
  const [red] = redesLocales(1);
  const ana = unaSesion(red);
  guardando(ana, codigo);
  await esperar(20);
  const doc = ana.doc;
  const documento = abrirPestana(doc, 'documento', { titulo: 'Resumen del TP', por: 'Ana G.' });
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText('Teorema de Thevenin')]);
  doc.getMap(`h:${documento}`).get('texto').insert(0, [p]);
  const lab = abrirPestana(doc, 'laboratorio', { titulo: 'Laboratorio', por: 'Ana G.' });
  const datosLab = doc.getMap(`h:${lab}`);
  sumarArchivo(datosLab, leerCarpeta(datosLab)[0].id, { nombre: 'serie', ext: 'py', codigo: 'print("resistencias en serie")' });
  abrirPestana(doc, 'materia', { titulo: 'Análisis Matemático II', datos: { materia: { nombre: 'Análisis Matemático II', secciones: [{ nombre: 'Integrales dobles', items: [] }] }, de: ana.yo.id }, por: 'Ana G.' });
  abrirPestana(doc, 'apunte', { titulo: 'Guía 1.pdf', datos: { archivo: '0123456789abcdef', nombre: 'Guía 1.pdf', de: ana.yo.id }, por: 'Ana G.' });
  escribir(doc, ana.yo, 'Nos vemos a las 18');
  ana.cerrar();
  await esperar(20);
  return ana;
}

beforeEach(async () => {
  await borrarGuardadas();
  base = baseFalsa();
  const almacen = new Map();
  vi.stubGlobal('indexedDB', base);
  vi.stubGlobal('IDBKeyRange', { bound: (lower, upper) => ({ lower, upper }) });
  vi.stubGlobal('sessionStorage', { getItem: (k) => almacen.get(k) ?? null, setItem: (k, v) => almacen.set(k, String(v)), removeItem: (k) => almacen.delete(k) });
});
afterEach(() => {
  abiertas.splice(0).forEach((s) => s.cerrar());
  vi.unstubAllGlobals();
});

describe('volver a una sesión', () => {
  it('quien vuelve con el código encuentra el documento, el Laboratorio y el chat', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    expect((await listarGuardadas(ALUMNO)).map((s) => [...s.pestanas].sort())).toEqual([TITULOS]);
    const [red] = redesLocales(1);
    const vuelta = unaSesion(red, { nombre: 'Beto' });
    guardando(vuelta, codigo);
    await esperar(30);
    expect(textoDelDocumento(vuelta.doc)).toContain('Teorema de Thevenin');
    const lab = pestanas(vuelta.doc).find((p) => p.tipo === 'laboratorio');
    expect(textosDeLaCarpeta(vuelta.doc.getMap(`h:${lab.id}`)).join('\n')).toContain('resistencias en serie');
    expect(mensajes(vuelta.doc).map((m) => m.texto)).toEqual(['Nos vemos a las 18']);
    // The Apunte tab comes back (its file is brought again by who shared it); the course of the campus does not.
    expect(pestanas(vuelta.doc).map((p) => p.tipo).sort()).toEqual(['apunte', 'documento', 'laboratorio']);
  });

  it('en el navegador no queda nada del campus, y la clave es otra cosa que el código', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    const id = await idDeSesion(codigo);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(id).not.toContain(codigo.toLowerCase());
    const crudo = base.crudo(ALUMNO, id);
    expect(new TextDecoder().decode(crudo.y)).not.toMatch(/Análisis|Integrales/);
    expect(JSON.stringify(crudo.pestanas)).not.toMatch(/Análisis/);
  });

  it('el primero que vuelve se la trae a todos, y no le saca nada a quien seguía adentro', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    const [ra, rb, rc] = redesLocales(3);
    // Carla was in the session from another computer, with a course of the campus; she never left.
    const carla = unaSesion(ra, { nombre: 'Carla' });
    const materia = abrirPestana(carla.doc, 'materia', { titulo: 'Física II', datos: { materia: { nombre: 'Física II', secciones: [] }, de: carla.yo.id }, por: 'Carla' });
    const vuelta = unaSesion(rb, { nueva: false });
    guardando(vuelta, codigo);
    const otro = unaSesion(rc, { nueva: false, nombre: 'Dani' });
    await esperar(400);
    expect(textoDelDocumento(otro.doc)).toContain('Teorema de Thevenin');
    expect(textoDelDocumento(carla.doc)).toContain('Teorema de Thevenin');
    expect(carla.doc.getMap(`h:${materia}`).get('materia').nombre).toBe('Física II');
    expect(pestanas(vuelta.doc).map((p) => p.titulo)).toContain('Física II');
  });

  it('vuelve como la misma persona, con de dónde trajo sus archivos', async () => {
    const codigo = nuevoCodigo();
    const [red] = redesLocales(1);
    const ana = unaSesion(red, { id: 'a1b2c3d4e5f60718' });
    guardando(ana, codigo);
    await esperar(20);
    anotarOrigen('0123456789abcdef', { m: 123, c: 'guia1.pdf' });
    abrirPestana(ana.doc, 'apunte', { titulo: 'Guía 1.pdf', datos: { archivo: '0123456789abcdef', nombre: 'Guía 1.pdf', de: ana.yo.id }, por: 'Ana G.' });
    ana.cerrar();
    await esperar(20);
    sessionStorage.removeItem('cl.envivo.origen');
    expect(await prepararVuelta(codigo, ALUMNO)).toEqual({ persona: ana.yo.id, anfitrion: false });
    expect(origenAnotado('0123456789abcdef')).toEqual({ m: 123, c: 'guia1.pdf' });
    expect(await prepararVuelta(nuevoCodigo(), ALUMNO)).toBeNull();
  });

  it('quien la armó vuelve pudiendo terminarla para todos', async () => {
    const codigo = nuevoCodigo();
    const [red] = redesLocales(1);
    const ana = unaSesion(red, { id: 'a1b2c3d4e5f60718', anfitrion: true });
    guardando(ana, codigo);
    await esperar(20);
    escribir(ana.doc, ana.yo, 'Hola');
    ana.cerrar();
    await esperar(20);
    expect(await prepararVuelta(codigo, ALUMNO)).toEqual({ persona: ana.yo.id, anfitrion: true });
  });

  it('una sesión terminada para todos queda anotada y no se vuelve a abrir', async () => {
    const codigo = nuevoCodigo();
    const [ra, rb] = redesLocales(2);
    const ana = unaSesion(ra, { anfitrion: true });
    const beto = unaSesion(rb, { nueva: false, nombre: 'Beto' });
    guardando(beto, codigo);
    await esperar(20);
    escribir(beto.doc, beto.yo, 'Nos vemos');
    const id = await idDeSesion(codigo);
    await esperar(400);
    beto.alTerminar(() => beto.cerrar());
    await ana.terminar({ por: 'Ana G.', cuando: 1_700_000_000_000 });
    ana.cerrar();
    await esperar(50);
    expect((await leerGuardada(ALUMNO, id)).terminada).toEqual({ por: 'Ana G.', cuando: 1_700_000_000_000 });
    expect((await listarGuardadas(ALUMNO))[0].terminada).toEqual({ por: 'Ana G.', cuando: 1_700_000_000_000 });
    // It does not open again: its copy does, in a new session that takes its place in the list.
    const vuelta = await prepararVuelta(codigo, ALUMNO);
    expect(vuelta.terminada).toEqual({ por: 'Ana G.', cuando: 1_700_000_000_000 });
    expect(vuelta.copia.reemplaza).toBe(id);
    const otroCodigo = nuevoCodigo();
    const [rc] = redesLocales(1);
    const sola = unaSesion(rc, { nombre: 'Beto', anfitrion: true });
    guardando(sola, otroCodigo, { copia: vuelta.copia });
    await esperar(50);
    expect(mensajes(sola.doc).map((m) => m.texto)).toEqual(['Nos vemos']);
    sola.cerrar();
    await esperar(50);
    const lista = await listarGuardadas(ALUMNO);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id: await idDeSesion(otroCodigo), anfitrion: true, terminada: null });
  });

  it('Salir borra las copias, y lo que se cierra después no las trae de vuelta', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    const [red] = redesLocales(1);
    const otra = unaSesion(red);
    let adentro = true;
    guardando(otra, nuevoCodigo(), { vigente: () => adentro });
    await esperar(20);
    escribir(otra.doc, otra.yo, 'algo');
    await borrarGuardadas();
    adentro = false;
    otra.cerrar();
    await esperar(20);
    expect(await listarGuardadas(ALUMNO)).toEqual([]);
  });

  it('una copia rota se ignora: la mesa arranca vacía y anda', async () => {
    const codigo = nuevoCodigo();
    const id = await idDeSesion(codigo);
    await ponerGuardada(ALUMNO, { id, codigo, cuando: Date.now(), pestanas: ['Documento'], y: crypto.getRandomValues(new Uint8Array(200)) });
    expect(guardadaLeida({ id, codigo: 'no', cuando: 1, y: new Uint8Array(3) })).toBeNull();
    expect(guardadaLeida({ id: 'x', codigo, cuando: 1, y: new Uint8Array(3) })).toBeNull();
    const [red] = redesLocales(1);
    const s = unaSesion(red);
    guardando(s, codigo);
    await esperar(30);
    expect(pestanas(s.doc)).toEqual([]);
    escribir(s.doc, s.yo, 'hola');
    expect(mensajes(s.doc).map((m) => m.texto)).toEqual(['hola']);
  });
});

describe('las sesiones en el Drive', () => {
  it('van y vuelven: otra compu la retoma, sin el campus ni quién era', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    const id = await idDeSesion(codigo);
    const drive = driveFalso();
    await unaVueltaSesiones(ALUMNO, drive);
    const [archivo] = [...drive.archivos.values()];
    expect(archivo.name).toBe(nombreEnDrive(ALUMNO, id));
    const json = JSON.parse(archivo.texto);
    expect(json.codigo).toBe(codigo);
    expect(json).not.toHaveProperty('persona');
    expect(json).not.toHaveProperty('origenes');
    expect(new TextDecoder().decode(Uint8Array.from(atob(json.y), (c) => c.charCodeAt(0)))).not.toMatch(/Análisis|Integrales/);

    // Another computer: nothing here, the copy comes from Drive.
    await borrarGuardadas();
    expect(await unaVueltaSesiones(ALUMNO, drive)).toEqual([id]);
    const r = await leerGuardada(ALUMNO, id);
    expect(r).toMatchObject({ codigo, persona: null });
    expect([...r.pestanas].sort()).toEqual(TITULOS);
    const [red] = redesLocales(1);
    const s = unaSesion(red);
    guardando(s, codigo);
    await esperar(30);
    expect(textoDelDocumento(s.doc)).toContain('Teorema de Thevenin');

    // What changes on this one goes up, joined.
    escribir(s.doc, s.yo, 'desde la otra compu');
    s.cerrar();
    await esperar(20);
    await unaVueltaSesiones(ALUMNO, drive);
    expect((await leerDeDrive([...drive.archivos.values()][0].texto, ALUMNO, id)).pestanas).toHaveLength(3);
    const vuelta = await leerDeDrive([...drive.archivos.values()][0].texto, ALUMNO, id);
    const doc = new Y.Doc();
    Y.applyUpdate(doc, vuelta.y);
    expect(mensajes(doc).map((m) => m.texto)).toEqual(['Nos vemos a las 18', 'desde la otra compu']);
  });

  it('una sesión borrada se borra en todos lados, salvo que se haya usado después', async () => {
    const codigo = nuevoCodigo();
    await sesionQueSeFue(codigo);
    const id = await idDeSesion(codigo);
    const drive = driveFalso();
    await unaVueltaSesiones(ALUMNO, drive);
    const enLaOtra = await leerGuardada(ALUMNO, id);
    await olvidarGuardada(ALUMNO, id, Date.now() + 1000);
    expect(await listarGuardadas(ALUMNO)).toEqual([]);
    await unaVueltaSesiones(ALUMNO, drive);
    const json = JSON.parse([...drive.archivos.values()][0].texto);
    expect(json.borrada).toBeGreaterThan(0);
    expect(json).not.toHaveProperty('codigo');
    expect(await leerGuardada(ALUMNO, id)).toBeNull();
    // The other computer still had it, older than the forgetting: it goes there too.
    await ponerGuardada(ALUMNO, { ...enLaOtra });
    await unaVueltaSesiones(ALUMNO, drive);
    expect(await listarGuardadas(ALUMNO)).toEqual([]);
  });

  it('lo que llega roto del Drive no entra, y la copia de acá lo reemplaza', async () => {
    const codigo = nuevoCodigo();
    const id = await idDeSesion(codigo);
    const drive = driveFalso();
    // A file with the right name but the code of another session, and one that doesn't read.
    const otroCodigo = nuevoCodigo();
    drive.archivos.set('x1', { name: nombreEnDrive(ALUMNO, id), texto: JSON.stringify({ tipo: 'super-cvg-en-vivo', version: 1, alumno: ALUMNO, id, codigo: otroCodigo, cuando: 5, y: 'AAAA' }), version: 1 });
    expect(await leerDeDrive(drive.archivos.get('x1').texto, ALUMNO, id)).toBeNull();
    expect(await leerDeDrive('{roto', ALUMNO, id)).toBeNull();
    expect(await leerDeDrive(JSON.stringify({ tipo: 'super-cvg-en-vivo', version: 1, alumno: ALUMNO, id, codigo, cuando: 5, y: btoa('basura que no es una copia') }), ALUMNO, id)).toBeNull();
    expect(await leerDeDrive(JSON.stringify({ tipo: 'super-cvg-en-vivo', version: 9, alumno: ALUMNO, id }), ALUMNO, id)).toEqual({ nueva: true });
    expect(await unaVueltaSesiones(ALUMNO, drive)).toEqual([]);
    expect(await listarGuardadas(ALUMNO)).toEqual([]);

    await sesionQueSeFue(codigo);
    await unaVueltaSesiones(ALUMNO, drive);
    const vuelta = await leerDeDrive(drive.archivos.get('x1').texto, ALUMNO, id);
    expect(vuelta.codigo).toBe(codigo);
    expect([...vuelta.pestanas].sort()).toEqual(TITULOS);
  });
});
