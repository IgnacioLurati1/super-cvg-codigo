// The maps of the Drive folders the student sees (drivePublico.js): kept for the visit, and in this browser's database,
// by student, so a folder is walked again only when they ask for it. The career's comes made with the site
// (`/drive/carrera.json`, scripts/drive/carrera.mjs); one made later by the student wins while it is newer. Salir
// deletes them all (sesion.js). Nothing here throws: without the database, a map stays only for the visit.
import { useEffect, useSyncExternalStore } from 'react';
import { armarMapa, CARRERA, clienteDrivePublico, contenidoDe, enlaceDe, esDeGoogle, indiceDe, leerEnlace, MAX_DRIVES, sanearMapa, visorDe } from './drivePublico';
import { textoError } from './errores';
import { esDemo } from './modoDemo';
import { cambiarMio, mioActual, usuarioActual } from './mio';
import { falla } from './paquete';
import { tokenActual } from './sesion';

const BASE = 'super-cvg-drive';
const MAPAS = 'mapas';
export const DEL_SITIO = '/drive/carrera.json';
// For the tab: whether Buscar is on Drive (Buscar.jsx) and which folders are closed (BuscarEnDrive.jsx). Salir deletes them.
export const EN_DRIVE = 'cl.buscar.drive';
export const CERRADAS = 'cl.buscar.drive.cerradas';

let abierta = null;
function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(MAPAS);
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Salir in another tab deletes the database: this one lets go of it.
        db.onversionchange = () => {
          db.close();
          if (abierta === esta) abierta = null;
        };
        ok(db);
      };
      pedido.onerror = () => mal(pedido.error);
      pedido.onblocked = () => mal(new Error('bloqueada'));
    });
    abierta = esta;
    esta.catch(() => {
      if (abierta === esta) abierta = null;
    });
  }
  return abierta;
}

async function hacer(modo, fn) {
  try {
    const db = await abrir();
    return await new Promise((ok) => {
      let pedido;
      let tx;
      try {
        tx = db.transaction(MAPAS, modo);
        pedido = fn(tx.objectStore(MAPAS));
      } catch {
        abierta = null;
        ok(null);
        return;
      }
      tx.oncomplete = () => ok(pedido?.result ?? null);
      tx.onerror = () => ok(null);
      tx.onabort = () => ok(null);
    });
  } catch {
    return null;
  }
}

const clave = (id) => `${usuarioActual()}:${id}`;

// By folder id: { estado: 'cargando' | 'armando' | 'listo' | 'sin-mapa' | 'error', indice, cuantos, error }. A new Map
// on every change, so React sees it.
let estados = new Map();
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
const poner = (id, estado) => {
  estados = new Map(estados).set(id, estado);
  avisar();
};
const armando = new Map();
// Bumped by Salir: a map that was on its way doesn't come back.
let generacion = 0;

async function delSitio() {
  try {
    const r = await fetch(DEL_SITIO, { cache: 'no-cache' });
    return r.ok ? sanearMapa(await r.json()) : null;
  } catch {
    return null;
  }
}

async function cargar(drive) {
  const vez = generacion;
  poner(drive.id, { estado: 'cargando' });
  const [guardado, sitio] = await Promise.all([
    hacer('readonly', (s) => s.get(clave(drive.id))).then(sanearMapa),
    drive.id === CARRERA.id ? delSitio() : null,
  ]);
  if (vez !== generacion || armando.has(drive.id)) return;
  const mapa = [guardado, sitio].filter(Boolean).sort((a, b) => b.armado - a.armado)[0];
  if (mapa) poner(drive.id, { estado: 'listo', indice: indiceDe(mapa) });
  else if (drive.id === CARRERA.id) poner(drive.id, { estado: 'error', error: 'No se pudo traer el mapa del Drive de la carrera. Probá de nuevo.' });
  // One added that has no map yet on this device: it is made now.
  else armarDrive(drive);
}

function clienteDeAhora() {
  if (import.meta.env.DEV && esDemo(tokenActual())) return import('./demoDrivePublico').then((m) => m.clienteDeEjemplo());
  return Promise.resolve(clienteDrivePublico());
}

/** Walks the folder again, showing what comes while it comes. What was there stays in view until the new one is whole. */
export async function armarDrive(drive) {
  if (armando.has(drive.id)) return;
  const vez = generacion;
  const control = new AbortController();
  armando.set(drive.id, control);
  const antes = estados.get(drive.id);
  const previo = antes?.indice ?? null;
  poner(drive.id, { estado: 'armando', indice: previo, cuantos: 0 });
  let ultimo = 0;
  try {
    const mapa = await armarMapa(drive, {
      cliente: await clienteDeAhora(),
      senal: control.signal,
      alAvanzar: (nodos) => {
        if (vez !== generacion || nodos.length - ultimo < 50) return;
        ultimo = nodos.length;
        // Without a map before, what came so far is the map in view.
        poner(drive.id, { estado: 'armando', indice: previo ?? indiceDe({ id: drive.id, nombre: drive.nombre, armado: 0, nodos: [...nodos] }), cuantos: nodos.length });
      },
    });
    if (vez !== generacion) return;
    await hacer('readwrite', (s) => s.put(mapa, clave(drive.id)));
    poner(drive.id, { estado: 'listo', indice: indiceDe(mapa) });
  } catch (e) {
    if (vez !== generacion) return;
    if (e?.name === 'AbortError') poner(drive.id, previo ? { estado: 'listo', indice: previo } : { estado: 'sin-mapa' });
    else poner(drive.id, { estado: 'error', indice: previo, error: textoError(e) });
  } finally {
    if (armando.get(drive.id) === control) armando.delete(drive.id);
  }
}

export const cancelarArmado = (id) => armando.get(id)?.abort();

/** Forgets a folder's map on this device, when the student takes the folder away. */
export function olvidarMapa(id) {
  cancelarArmado(id);
  estados = new Map(estados);
  estados.delete(id);
  avisar();
  return hacer('readwrite', (s) => s.delete(clave(id)));
}

/** The state of the map of each folder given, loading the ones not asked for yet. */
export function useMapasDrive(drives) {
  const ahora = useSyncExternalStore(escuchar, () => estados, () => estados);
  const ids = drives.map((d) => d.id).join(' ');
  useEffect(() => {
    for (const d of drives) if (!estados.has(d.id)) cargar(d);
    // `ids` stands for the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return ahora;
}

function escuchar(f) {
  avisados.add(f);
  return () => avisados.delete(f);
}

/** Salir: every student's maps go away from this browser. Never fails. */
export async function borrarMapasDrive() {
  generacion += 1;
  for (const c of armando.values()) c.abort();
  armando.clear();
  fichas.clear();
  try {
    sessionStorage.removeItem(EN_DRIVE);
    sessionStorage.removeItem(CERRADAS);
  } catch {
    // Without storage there is nothing to delete.
  }
  estados = new Map();
  avisar();
  const antes = abierta;
  abierta = null;
  try {
    (await antes)?.close();
  } catch {
    // It never opened.
  }
  if (typeof indexedDB === 'undefined') return;
  await new Promise((ok) => {
    try {
      const pedido = indexedDB.deleteDatabase(BASE);
      pedido.onsuccess = () => ok();
      pedido.onerror = () => ok();
    } catch {
      ok();
    }
  });
}

const NO_ES = 'Ese link no es de una carpeta de Google Drive.';
const ES_ARCHIVO = 'Ese link es de un archivo. Pegá el de la carpeta que lo tiene.';
const YA_ESTA = 'Esa carpeta ya está en tu lista.';
const LLENO = `Ya tenés ${MAX_DRIVES} carpetas. Quitá alguna que no uses.`;

/** Adds the folder of a Drive link, after asking Drive that it is a public folder. Gives back its id. */
export async function sumarDrive(texto) {
  const enlace = leerEnlace(texto);
  if (!enlace) throw falla(NO_ES);
  if (enlace.carpeta === false) throw falla(ES_ARCHIVO);
  const { drive } = mioActual();
  if (enlace.id === CARRERA.id) {
    if (!drive.sinCarrera) throw falla(YA_ESTA);
    cambiarMio((m) => ({ ...m, drive: { ...m.drive, sinCarrera: false } }));
    return CARRERA.id;
  }
  if (drive.propios.some((d) => d.id === enlace.id)) throw falla(YA_ESTA);
  if (drive.propios.length >= MAX_DRIVES) throw falla(LLENO);
  const ficha = await (await clienteDeAhora()).ficha(enlace.id, enlace.k);
  if (!ficha.carpeta) throw falla(ES_ARCHIVO);
  cambiarMio((m) => ({ ...m, drive: { ...m.drive, propios: [...m.drive.propios, { id: ficha.id, nombre: ficha.nombre, k: enlace.k }] } }));
  return ficha.id;
}

/** Takes a folder away from the list. The career's can come back by pasting its link. */
export function quitarDrive(id) {
  if (id === CARRERA.id) cambiarMio((m) => ({ ...m, drive: { ...m.drive, sinCarrera: true } }));
  else cambiarMio((m) => ({ ...m, drive: { ...m.drive, propios: m.drive.propios.filter((d) => d.id !== id) } }));
  olvidarMapa(id);
}

/** Hides a folder or file of a Drive, or shows it again. */
export const alternarEscondido = (id) =>
  cambiarMio((m) => ({ ...m, drive: { ...m.drive, ocultos: m.drive.ocultos.includes(id) ? m.drive.ocultos.filter((x) => x !== id) : [...m.drive.ocultos, id] } }));

// Google's own apps open as a PDF: the name says so.
const nombreDeArchivo = (nodo) => (esDeGoogle(nodo.m) && !/\.pdf$/i.test(nodo.n) ? `${nodo.n}.pdf` : nodo.n);

/** A file of a Drive as the preview sheet (Previa.jsx) takes it: its bytes come from Drive when it opens. `donde`: the
 * folders it is in. */
export function itemDeNodo(nodo, donde = '') {
  const visor = visorDe(nodo);
  const archivo = nombreDeArchivo(nodo);
  return {
    id: `drive:${nodo.id}`,
    tipo: 'archivo',
    nombre: nodo.n,
    archivo,
    mime: visor === 'pdf' ? 'application/pdf' : nodo.m ?? '',
    peso: nodo.s ?? 0,
    modificado: nodo.f ? Math.floor(nodo.f / 1000) : null,
    materia: donde,
    origen: 'drive',
    campus: enlaceDe(nodo),
    drive: { visor, nodo },
    traer: async () => (await clienteDeAhora()).bajar(nodo),
  };
}

/** The file a Drive link of a course points to, as a node, with the name it was saved with. Null for anything else. */
export function nodoDeEnlace(url, nombre) {
  const enlace = leerEnlace(url);
  if (!enlace || enlace.carpeta !== false) return null;
  const app = /^https:\/\/docs\.google\.com\/(document|presentation|spreadsheets|drawings)\//.exec(url)?.[1];
  const m = app ? `application/vnd.google-apps.${{ spreadsheets: 'spreadsheet', drawings: 'drawing' }[app] ?? app}` : undefined;
  return { id: enlace.id, n: String(nombre ?? ''), p: '', ...(m ? { m } : {}), ...(enlace.k ? { k: enlace.k } : {}) };
}

// What each linked file turned out to be, for the visit: a link opened again is not asked again.
const fichas = new Map();

/** What a Drive link points to, asked to Drive when the link doesn't say what it is: { nodo } for a file, { carpeta }
 * ({ id, k, nombre }) for a folder, or null for one that isn't shared with anyone who has the link (and when Drive can't
 * be reached, to ask again later). */
export function destinoDeEnlace(url) {
  const enlace = leerEnlace(url);
  if (!enlace || enlace.carpeta === true) return Promise.resolve(null);
  if (!fichas.has(enlace.id)) {
    fichas.set(enlace.id, clienteDeAhora()
      .then((cliente) => cliente.ficha(enlace.id, enlace.k))
      .then((ficha) => (ficha.carpeta ? { carpeta: { id: ficha.id, k: enlace.k, nombre: ficha.nombre } } : ficha.nodo ? { nodo: ficha.nodo } : null), () => {
        fichas.delete(enlace.id);
        return null;
      }));
  }
  return fichas.get(enlace.id);
}

// What each folder opened from a link holds, for the visit: going back up doesn't ask again.
const contenidos = new Map();

/** What is right inside a folder of Drive ({ id, k }), as `contenidoDe` gives it. A failure is asked again next time. */
export function contenidoDeCarpeta(carpeta) {
  if (!contenidos.has(carpeta.id)) {
    const pedido = clienteDeAhora().then((cliente) => contenidoDe(carpeta, { cliente }));
    pedido.catch(() => contenidos.delete(carpeta.id));
    contenidos.set(carpeta.id, pedido);
  }
  return contenidos.get(carpeta.id);
}

/** Asks again for a map that could not be read. */
export function volverACargar(drive) {
  estados = new Map(estados);
  estados.delete(drive.id);
  cargar(drive);
}

/** The name of a folder ({ id, k }) in Drive, for a link that only says its address. Empty when Drive doesn't answer. */
export function nombreDeCarpeta(carpeta) {
  return clienteDeAhora()
    .then((cliente) => cliente.ficha(carpeta.id, carpeta.k ?? null))
    .then((ficha) => ficha.nombre, () => '');
}
