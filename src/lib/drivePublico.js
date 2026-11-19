// Public Google Drive folders (shared «anyone with the link»), read with the site's own Google key: a browser key that
// Google accepts only from this site and only for the Drive API, so it reads what anyone could open with the link and
// nothing else. No account of the student's goes in. This file is the only door to them: the link, the map of a folder
// (every folder and file in it, by name), the search in it and the bytes of one file. No React and no storage here.
//
// A map: { id, nombre, armado (ms), nodos: [{ id, n (name), p (parent id), c (1: folder), m (mime), s (bytes), f (ms),
// k (resource key), a (the file a shortcut points to) }] }. The root is not among its nodes.
// No imports: the script that makes the career's map (scripts/drive/carrera.mjs) runs it in Node.

// As in datos.js: no accents, no capitals.
const normalizar = (texto) => (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// As in paquete.js: a message `textoError` shows as it is.
function falla(mensaje) {
  const error = new Error(mensaje);
  error.conocido = true;
  return error;
}

export const API = 'https://www.googleapis.com/drive/v3';
export const CLAVE_DRIVE = import.meta.env?.VITE_DRIVE_CLAVE || '';
export const CARPETA = 'application/vnd.google-apps.folder';
const ATAJO = 'application/vnd.google-apps.shortcut';

/** The Drive of the career, there for every student until they take it away. */
export const CARRERA = Object.freeze({ id: '1ZgKML44drc8Wq3pcbHsc-ozPINv6xSHQ', nombre: 'Drive de la carrera' });

// Far more than a career's Drive (some 1000 folders): past this the map stops, and says so.
export const TOPE_CARPETAS = 4000;
export const TOPE_NODOS = 40_000;
const A_LA_VEZ = 6;

const NO_ES = 'Ese link no es de una carpeta de Google Drive.';
const NO_PUBLICA = 'Esa carpeta no está compartida con cualquiera que tenga el link, o ya no existe.';
const ES_ARCHIVO = 'Ese link es de un archivo. Pegá el de la carpeta que lo tiene.';
const SIN_CLAVE = 'Drive no está disponible en este momento.';
const ARCHIVO_NO_ESTA = 'Este archivo ya no está en Drive o dejó de estar compartido.';
const OCUPADO = 'Google Drive está ocupado. Probá de nuevo en un rato.';
const ESPERA_DESCARGA = 6000;
const FRENADAS_POR = 10 * 60 * 1000;
let frenadasHasta = 0;
export const FRENADO = 'Google frenó por un rato las descargas desde tu conexión. Mientras tanto, abrilo en Drive.';

export const esIdDeDrive = (id) => typeof id === 'string' && /^[\w-]{10,100}$/.test(id);
const esClaveDeRecurso = (k) => typeof k === 'string' && /^[\w-]{1,100}$/.test(k);

/** The folder or file a Drive link points to: { id, carpeta (true, false, or null when the link doesn't say), k }, or
 * null when it isn't a Drive link. */
export function leerEnlace(texto) {
  let url;
  try {
    url = new URL(String(texto ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;
  const k = url.searchParams.get('resourcekey');
  const con = (id, carpeta) => (esIdDeDrive(id) ? { id, carpeta, k: esClaveDeRecurso(k) ? k : null } : null);
  let r;
  if ((r = /^\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)/.exec(url.pathname))) return con(r[1], true);
  if ((r = /^\/(?:file|document|presentation|spreadsheets|drawings)\/(?:u\/\d+\/)?d\/([\w-]+)/.exec(url.pathname))) return con(r[1], false);
  if (/^\/(open|uc)$/.test(url.pathname) && url.searchParams.get('id')) return con(url.searchParams.get('id'), null);
  return null;
}

// Google's own apps: they have no bytes of their own, they are read as a PDF (`exportar`).
const DE_GOOGLE = /^application\/vnd\.google-apps\.(document|presentation|spreadsheet|drawing)$/;
export const esDeGoogle = (mime) => DE_GOOGLE.test(mime ?? '');

const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const XLSX = /^application\/vnd\.(openxmlformats-officedocument\.spreadsheetml\.sheet|ms-excel\.sheet\.macroenabled\.12)$/i;
const extensionDe = (nombre) => /\.([0-9a-z]{1,5})$/i.exec(nombre ?? '')?.[1].toLowerCase() ?? '';

/** How a file opens here: 'pdf' (also Google's own, as PDF), 'imagen', 'html', 'presentacion' (its text), 'planilla' (an
 * Excel or a CSV, its values) or null (it is downloaded). */
export function visorDe({ m: mime, n: nombre }) {
  const ext = extensionDe(nombre);
  if (mime === 'application/pdf' || esDeGoogle(mime) || (!mime && ext === 'pdf')) return 'pdf';
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(mime ?? '') || /^(png|jpe?g|gif|webp|bmp)$/.test(ext)) return 'imagen';
  if (mime === 'text/html' || /^html?$/.test(ext)) return 'html';
  if (mime === PPTX || ext === 'pptx') return 'presentacion';
  // As planillaTipo.js says (a test checks they agree).
  if (XLSX.test(mime ?? '') || mime === 'text/csv' || /^(xlsx|xlsm|csv)$/.test(ext)) return 'planilla';
  return null;
}

/** The kind of a node, for the filters. */
export function tipoDe(nodo) {
  if (nodo.c) return 'carpeta';
  const mime = nodo.m ?? '';
  const ext = extensionDe(nodo.n);
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/presentation|powerpoint/.test(mime) || /^(pptx?|ppsx?|odp|key)$/.test(ext)) return 'presentacion';
  if (/document|msword|wordprocessing|text\/plain|rtf/.test(mime) || /^(docx?|odt|rtf|txt|md)$/.test(ext)) return 'documento';
  if (/spreadsheet|excel|csv/.test(mime) || /^(xlsx?|ods|csv)$/.test(ext)) return 'planilla';
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('video/')) return 'video';
  return 'otro';
}

/** Google's own view of a file, for when Google stops the downloads (`FRENADO`): it opens in a frame of its own. */
export function vistaDeGoogle(nodo) {
  return enlaceDe(nodo).replace(/\/(edit|view)(?=\?|$)/, '/preview');
}

/** The address of a node in Google Drive. */
export function enlaceDe(nodo) {
  const id = nodo.a ?? nodo.id;
  const k = nodo.k ? `?resourcekey=${encodeURIComponent(nodo.k)}` : '';
  if (nodo.c) return `https://drive.google.com/drive/folders/${id}${k}`;
  const app = /^application\/vnd\.google-apps\.(document|presentation|spreadsheet|drawing)$/.exec(nodo.m ?? '')?.[1];
  if (app) return `https://docs.google.com/${app === 'spreadsheet' ? 'spreadsheets' : app === 'drawing' ? 'drawings' : app}/d/${id}/edit${k}`;
  return `https://drive.google.com/file/d/${id}/view${k}`;
}

const CAMPOS = 'id,name,mimeType,size,modifiedTime,resourceKey,shortcutDetails(targetId,targetMimeType,targetResourceKey)';

/** Talks to the Drive API with the site's key. `pedir`: fetch, swapped in tests. */
export function clienteDrivePublico({ clave = CLAVE_DRIVE, pedir = (...a) => fetch(...a) } = {}) {
  // `noEsta`: what to say when Drive says it isn't there or isn't public.
  async function pedirJson(ruta, params, { k = null, id = null, senal, noEsta = NO_PUBLICA } = {}) {
    if (!clave) throw falla(SIN_CLAVE);
    const url = `${API}/${ruta}?${new URLSearchParams({ ...params, key: clave })}`;
    const cabeceras = k && id ? { 'X-Goog-Drive-Resource-Keys': `${id}/${k}` } : {};
    for (let vez = 0; ; vez += 1) {
      const r = await pedir(url, { headers: cabeceras, signal: senal, referrerPolicy: 'strict-origin-when-cross-origin' }).catch((e) => {
        // Online and still no answer: Google refused the key without letting the page read why (another address).
        if (e?.name === 'AbortError' || typeof navigator === 'undefined' || navigator.onLine === false) throw e;
        throw falla(SIN_CLAVE);
      });
      if (r.ok) return r;
      // Too many at once: it waits and goes again, a few times.
      if ((r.status === 429 || r.status === 403 || r.status >= 500) && vez < 4 && (await esPorApuro(r))) {
        await esperar(500 * 2 ** vez, senal);
        continue;
      }
      // The key itself refused (another address, or a key that changed): nothing the student can fix.
      if (r.status === 400 || (r.status === 403 && (await esDeLaClave(r)))) throw falla(SIN_CLAVE);
      // Google's page for too much traffic from one connection comes as HTML, not as Drive's JSON: it isn't the file.
      if (r.status === 403 && !/json/.test(r.headers.get('content-type') ?? '')) throw falla(OCUPADO);
      if (r.status === 404 || r.status === 403) throw falla(noEsta);
      throw falla(OCUPADO);
    }
  }

  return {
    /** What a folder or file is: { id, nombre, carpeta, nodo (as in a map, without a parent) }. */
    async ficha(id, k = null) {
      const r = await pedirJson(`files/${id}`, { fields: CAMPOS, supportsAllDrives: 'true' }, { k, id });
      const f = await r.json();
      const nodo = nodoDe(f, '');
      return { id: f.id, nombre: String(f.name ?? ''), carpeta: Boolean(nodo?.c), nodo };
    },
    /** Everything right inside a folder, page by page. With `tope`, it stops once it has that many. */
    async hijos(id, k = null, senal, tope = Infinity) {
      const todos = [];
      let pagina = '';
      do {
        const params = { q: `'${id}' in parents and trashed=false`, fields: `nextPageToken,files(${CAMPOS})`, pageSize: String(Math.min(1000, tope)), supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' };
        if (pagina) params.pageToken = pagina;
        const r = await pedirJson('files', params, { k, id, senal });
        const datos = await r.json();
        todos.push(...(Array.isArray(datos.files) ? datos.files : []));
        pagina = typeof datos.nextPageToken === 'string' ? datos.nextPageToken : '';
      } while (pagina && todos.length < tope);
      return todos;
    },
    /** The bytes of a file. Google's own apps come as a PDF. */
    async bajar(nodo, senal) {
      if (Date.now() < frenadasHasta) throw falla(FRENADO);
      const id = nodo.a ?? nodo.id;
      const opciones = { k: nodo.k, id, senal, noEsta: ARCHIVO_NO_ESTA };
      // Google's page for too much traffic takes some 9 seconds to come; a file that comes starts long before.
      const control = new AbortController();
      const cortar = () => control.abort();
      senal?.addEventListener('abort', cortar);
      let tarde = false;
      const reloj = setTimeout(() => { tarde = true; cortar(); }, ESPERA_DESCARGA);
      try {
        const r = esDeGoogle(nodo.m)
          ? await pedirJson(`files/${id}/export`, { mimeType: 'application/pdf' }, { ...opciones, senal: control.signal })
          : await pedirJson(`files/${id}`, { alt: 'media', supportsAllDrives: 'true' }, { ...opciones, senal: control.signal });
        clearTimeout(reloj);
        return await r.blob();
      } catch (error) {
        clearTimeout(reloj);
        if (senal?.aborted || !(tarde || error?.message === SIN_CLAVE)) throw error;
        // That page doesn't let the page read it either: if Drive still says what the file is, the key is fine and it's
        // only the downloads that are stopped. For a while, the next ones don't wait for it.
        await pedirJson(`files/${id}`, { fields: 'id', supportsAllDrives: 'true' }, opciones);
        frenadasHasta = Date.now() + FRENADAS_POR;
        throw falla(FRENADO);
      } finally {
        senal?.removeEventListener('abort', cortar);
      }
    },
  };
}

async function esPorApuro(r) {
  if (r.status === 429 || r.status >= 500) return true;
  try {
    const datos = await r.clone().json();
    return (datos?.error?.errors ?? []).some((e) => /rateLimit|userRateLimit/i.test(e?.reason ?? ''));
  } catch {
    return false;
  }
}

async function esDeLaClave(r) {
  try {
    const datos = await r.clone().json();
    return (datos?.error?.errors ?? []).some((e) => e?.reason === 'forbidden' && /referer|api key|ip address|android|ios/i.test(e?.message ?? ''))
      || /referer|api key/i.test(datos?.error?.message ?? '');
  } catch {
    return false;
  }
}

function esperar(ms, senal) {
  return new Promise((ok, mal) => {
    const t = setTimeout(ok, ms);
    senal?.addEventListener('abort', () => {
      clearTimeout(t);
      mal(senal.reason ?? new DOMException('Cancelado', 'AbortError'));
    }, { once: true });
  });
}

const fechaDe = (t) => {
  const ms = Date.parse(t ?? '');
  return Number.isFinite(ms) ? ms : undefined;
};

/** A file of Drive as a node of the map. */
function nodoDe(f, padre) {
  const atajo = f.mimeType === ATAJO ? f.shortcutDetails : null;
  const mime = atajo ? atajo.targetMimeType : f.mimeType;
  const nodo = { id: String(f.id), n: String(f.name ?? '').slice(0, 300), p: padre };
  if (mime === CARPETA) nodo.c = 1;
  else if (typeof mime === 'string') nodo.m = mime.slice(0, 120);
  const s = Number(f.size);
  if (!atajo && Number.isSafeInteger(s) && s >= 0) nodo.s = s;
  const fecha = fechaDe(f.modifiedTime);
  if (fecha) nodo.f = fecha;
  const k = atajo ? atajo.targetResourceKey : f.resourceKey;
  if (esClaveDeRecurso(k)) nodo.k = k;
  if (atajo && esIdDeDrive(atajo.targetId)) nodo.a = atajo.targetId;
  return esIdDeDrive(nodo.id) ? nodo : null;
}

// A folder linked from a course opens in the preview sheet one level at a time. Past this many things in one level it
// is too big to look through here: it opens in Drive.
export const TOPE_CARPETA_SUELTA = 500;

/** What is right inside one folder ({ id, k }): { nodos (folders first, then by name), grande (past `tope`) }. */
export async function contenidoDe(carpeta, { cliente = clienteDrivePublico(), tope = TOPE_CARPETA_SUELTA, senal } = {}) {
  const crudos = await cliente.hijos(carpeta.id, carpeta.k ?? null, senal, tope + 1);
  if (crudos.length > tope) return { nodos: [], grande: true };
  const nodos = crudos.map((f) => nodoDe(f, carpeta.id)).filter(Boolean);
  nodos.sort((x, y) => (y.c ?? 0) - (x.c ?? 0) || x.n.localeCompare(y.n, 'es', { numeric: true, sensitivity: 'base' }));
  return { nodos, grande: false };
}

/** Walks a public folder whole, a few folders at a time, and gives back its map. `alAvanzar(nodos)` gets what came so
 * far, to show it while it grows. `cortado` in the map: it went past the caps. */
export async function armarMapa(raiz, { cliente = clienteDrivePublico(), alAvanzar = () => {}, senal, aLaVez = A_LA_VEZ } = {}) {
  const ficha = await cliente.ficha(raiz.id, raiz.k ?? null);
  if (!ficha.carpeta) throw falla(ES_ARCHIVO);
  const nodos = [];
  // Each folder is walked once, also when a shortcut leads back to it.
  const vistas = new Set([raiz.id]);
  const cola = [{ id: raiz.id, k: raiz.k ?? null, nodo: raiz.id }];
  let carpetas = 0;
  let cortado = false;
  const trabajar = async () => {
    while (cola.length) {
      if (senal?.aborted) throw senal.reason ?? new DOMException('Cancelado', 'AbortError');
      const { id, k, nodo } = cola.shift();
      for (const f of await cliente.hijos(id, k, senal)) {
        const hijo = nodoDe(f, nodo);
        if (!hijo) continue;
        if (nodos.length >= TOPE_NODOS) {
          cortado = true;
          break;
        }
        nodos.push(hijo);
        const destino = hijo.a ?? hijo.id;
        if (hijo.c && !vistas.has(destino)) {
          vistas.add(destino);
          if (carpetas < TOPE_CARPETAS) {
            carpetas += 1;
            cola.push({ id: destino, k: hijo.k ?? null, nodo: hijo.id });
          } else cortado = true;
        }
      }
      alAvanzar(nodos);
    }
  };
  // Several at once; one that finds the queue empty waits for the others to fill it.
  const corriendo = new Set();
  while (cola.length || corriendo.size) {
    while (cola.length && corriendo.size < aLaVez) {
      const t = trabajar().finally(() => corriendo.delete(t));
      corriendo.add(t);
    }
    await Promise.race(corriendo);
  }
  return { id: raiz.id, nombre: ficha.nombre, armado: Date.now(), nodos, ...(cortado ? { cortado: true } : {}) };
}

/** The map read from disk or from anywhere else: only what a map has survives. */
export function sanearMapa(m) {
  if (!m || typeof m !== 'object' || !esIdDeDrive(m.id) || !Array.isArray(m.nodos)) return null;
  const nodos = [];
  for (const x of m.nodos.slice(0, TOPE_NODOS)) {
    if (!x || !esIdDeDrive(x.id) || typeof x.n !== 'string' || typeof x.p !== 'string') continue;
    const n = { id: x.id, n: x.n.slice(0, 300), p: x.p };
    if (x.c) n.c = 1;
    else if (typeof x.m === 'string') n.m = x.m.slice(0, 120);
    if (Number.isSafeInteger(x.s) && x.s >= 0) n.s = x.s;
    if (Number.isSafeInteger(x.f) && x.f > 0) n.f = x.f;
    if (esClaveDeRecurso(x.k)) n.k = x.k;
    if (esIdDeDrive(x.a)) n.a = x.a;
    nodos.push(n);
  }
  return {
    id: m.id,
    nombre: typeof m.nombre === 'string' ? m.nombre.slice(0, 300) : '',
    armado: Number.isSafeInteger(m.armado) ? m.armado : 0,
    nodos,
    ...(m.cortado ? { cortado: true } : {}),
  };
}

const porNombre = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const ordenar = (a, b) => (b.c ?? 0) - (a.c ?? 0) || porNombre.compare(a.n, b.n);

/** What the map needs to be walked and searched: the children of each folder (folders first, by name), each node by
 * id, its path and how many files of each kind every folder holds, all the way down. */
export function indiceDe(mapa) {
  const porId = new Map(mapa.nodos.map((n) => [n.id, n]));
  const hijos = new Map();
  for (const n of mapa.nodos) {
    if (!hijos.has(n.p)) hijos.set(n.p, []);
    hijos.get(n.p).push(n);
  }
  for (const lista of hijos.values()) lista.sort(ordenar);
  const tipos = new Map();
  const contar = (id, visto = new Set()) => {
    if (tipos.has(id)) return tipos.get(id);
    const cuenta = {};
    tipos.set(id, cuenta);
    visto.add(id);
    for (const h of hijos.get(id) ?? []) {
      if (h.c) {
        if (visto.has(h.id)) continue;
        for (const [t, c] of Object.entries(contar(h.id, visto))) cuenta[t] = (cuenta[t] ?? 0) + c;
      } else {
        const t = tipoDe(h);
        cuenta[t] = (cuenta[t] ?? 0) + 1;
      }
    }
    return cuenta;
  };
  contar(mapa.id);
  const ruta = (n) => {
    const partes = [];
    for (let p = porId.get(n.p), vueltas = 0; p && vueltas < 50; p = porId.get(p.p), vueltas += 1) partes.unshift(p.n);
    return partes;
  };
  return { mapa, porId, hijos, tipos, ruta };
}

/** The folders and files whose name has every word searched; the ones with the words in their path too, after them.
 * Best first: the whole phrase in the name, then names that start with it. */
export function buscarEnMapa(indice, consulta, { tope = 300, valido = () => true } = {}) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const frase = palabras.join(' ');
  const hallados = [];
  for (const n of indice.mapa.nodos) {
    if (!valido(n)) continue;
    const nombre = normalizar(n.n);
    let puntos;
    if (palabras.every((p) => nombre.includes(p))) puntos = nombre.startsWith(frase) ? 3 : nombre.includes(frase) ? 2 : 1;
    else {
      const todo = `${normalizar(indice.ruta(n).join(' '))} ${nombre}`;
      if (!palabras.every((p) => todo.includes(p)) || !palabras.some((p) => nombre.includes(p))) continue;
      puntos = 0;
    }
    hallados.push({ nodo: n, puntos });
  }
  hallados.sort((a, b) => b.puntos - a.puntos || ordenar(a.nodo, b.nodo));
  return hallados.slice(0, tope).map((h) => h.nodo);
}

// What the student keeps of Drive, in mio.js (and with it, in their own Google Drive): the folders they added
// ({ id, nombre, k }), whether they took away the career's, and what they hid, by id.
export const MAX_DRIVES = 20;
export const MAX_ESCONDIDOS = 3000;
export const DRIVE_VACIO = Object.freeze({ propios: Object.freeze([]), sinCarrera: false, ocultos: Object.freeze([]) });

export function sanearDriveMio(d) {
  if (!d || typeof d !== 'object') return DRIVE_VACIO;
  const vistos = new Set();
  const propios = [];
  for (const x of Array.isArray(d.propios) ? d.propios : []) {
    if (!x || !esIdDeDrive(x.id) || x.id === CARRERA.id || vistos.has(x.id) || propios.length >= MAX_DRIVES) continue;
    vistos.add(x.id);
    propios.push({ id: x.id, nombre: typeof x.nombre === 'string' && x.nombre.trim() ? x.nombre.trim().slice(0, 200) : 'Carpeta de Drive', k: esClaveDeRecurso(x.k) ? x.k : null });
  }
  const ocultos = [...new Set((Array.isArray(d.ocultos) ? d.ocultos : []).filter(esIdDeDrive))].slice(0, MAX_ESCONDIDOS);
  return { propios, sinCarrera: d.sinCarrera === true, ocultos };
}

/** The folders the student sees: the career's first, unless they took it away. */
export const drivesDe = (drive) => [...(drive.sinCarrera ? [] : [{ ...CARRERA, k: null, carrera: true }]), ...drive.propios];
