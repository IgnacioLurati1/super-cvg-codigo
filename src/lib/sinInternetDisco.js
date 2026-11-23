// What the campus answered, kept in this browser's database so Super CVG opens without internet or with the campus down
// (the service worker, scripts/trabajador.mjs, keeps the site itself). Only with «Seguir conectado»: a student who did
// not choose to stay in this device leaves nothing on its disk. One student at a time: the database says whose it is
// (`dueno`: the campus number and a fingerprint of the key), and a different student, or a key that isn't that one,
// never reads it. Salir deletes it all (sesion.js).
// Two kinds of things: the answers of conCache (sesion.js), by name, and the files of the courses (archivos.js), by
// address and with the version of the file in the campus, bounded by TOPE_ARCHIVOS. A big PDF read by parts
// (pdfPartes.js) is kept as the parts already brought, under the same address, until it is all here. What Classroom and
// El Santo Resumen bring goes apart (respaldo.js), with its own names and whom it is for over there. Nothing here throws: without the
// database (private mode, no room, an old browser) everything stays only in the memory of the tab, as before.
// The night downloads (descargasFondo.js) write here too, from the service worker: no imports, so scripts/trabajador.mjs
// puts this file whole in sw.js. What they bring is marked (`noche` in its FICHAS): they make room only among their own
// files, and never touch one the student kept (sinInternet.js is the page's side, with the rest).

/** The files kept, in bytes. Past this, what was used longest ago goes first. */
export const TOPE_ARCHIVOS = 400 * 1024 * 1024;
/** A file heavier than this is never kept (a long video, a big compressed folder). */
export const ARCHIVO_MAXIMO = 60 * 1024 * 1024;

const BASE = 'super-cvg-sin-internet';
const RESPUESTAS = 'respuestas';
const ARCHIVOS = 'archivos';
// The size of each file and when it was last used, apart from its bytes: making room reads only these.
const FICHAS = 'fichas';
const META = 'meta';
const ALMACENES = [RESPUESTAS, ARCHIVOS, FICHAS, META];

// The answers worth having without internet. Out: the search of courses to enrol in and of people to write to (they
// need the campus anyway), the pictures (blob addresses that die with the tab) and the titles of videos. `sysacad`: the
// copy of Sysacad that came from the student's Drive (sysacadEnDrive.js), as the text of its file.
// `noche.contenido.<id>`: a course as the night download brought it, { secciones }. A service worker has no DOMParser,
// so the page turns it into `contenido.<id>` when it reads it (sinInternet.js).
const GUARDABLES = /^(perfil|sysacad|materias|pendientes|notificaciones|avisos|foros|contenido\.\d+|noche\.contenido\.\d+|mes\.\d+-\d+|tareas\.\d+|tarea\.\d+|cuestionarios\.\d+|cuestionario\.\d+|cuestionario\.revision\.\d+|foros\.discusiones\.\d+|foros\.hilo\.\d+|mensajes\.lista\.\d+|mensajes\.charla\.\d+\.\d+)$/;
export const esGuardable = (nombre) => GUARDABLES.test(String(nombre));

// ---------- The database ----------

let abierta = null;
// Bumped by Salir: a write that started before it does not bring anything back.
let generacion = 0;

function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        for (const a of ALMACENES) if (!db.objectStoreNames.contains(a)) db.createObjectStore(a);
      };
      pedido.onsuccess = () => {
        const db = pedido.result;
        // Salir in another tab deletes the database: this one lets go of it, and the next use opens it again.
        const soltar = () => {
          db.close();
          if (abierta === esta) abierta = null;
        };
        db.onversionchange = soltar;
        db.onclose = soltar;
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

// Runs `fn` with every store in one transaction. Gives back what `fn` left in `hecho.valor`, or `siFalla`.
async function enUna(modo, fn, siFalla) {
  try {
    const db = await abrir();
    return await new Promise((ok) => {
      const hecho = { valor: siFalla };
      let tx;
      try {
        tx = db.transaction(ALMACENES, modo);
        fn((a) => tx.objectStore(a), hecho);
      } catch {
        // A database the browser closed under our feet: the next try opens it again.
        abierta = null;
        ok(siFalla);
        return;
      }
      tx.oncomplete = () => ok(hecho.valor);
      tx.onerror = () => ok(siFalla);
      tx.onabort = () => ok(siFalla);
    });
  } catch {
    return siFalla;
  }
}

/** A fingerprint of the key, so the database knows whose it is without keeping the key a second time. The tabs of one
 * session use it too, to tell their messages apart from another student's (pestanas.js). */
export async function huellaDe(token) {
  if (!token || typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`super-cvg:${token}`));
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

const esAlumno = (a) => Number.isSafeInteger(a) && a > 0;

// The writes go one after the other: two answers arriving together must not both find no owner and wipe each other.
let fila = Promise.resolve();
const enFila = (fn) => {
  const esta = fila.then(fn, fn);
  fila = esta.catch(() => {});
  return esta;
};

// Writes with the owner checked in the same transaction: another student, or no owner yet, empties everything first.
function escribir({ token, alumno }, fn) {
  if (!token || !esAlumno(alumno)) return Promise.resolve();
  const nacida = generacion;
  return enFila(async () => {
    const huella = await huellaDe(token);
    if (!huella || nacida !== generacion) return undefined;
    return enUna('readwrite', (almacen, hecho) => {
      const meta = almacen(META);
      const pedido = meta.get('dueno');
      pedido.onsuccess = () => {
        // After Salir: nothing of the session that left.
        if (nacida !== generacion) return;
        const dueno = pedido.result;
        if (!dueno || dueno.alumno !== alumno) {
          for (const a of [RESPUESTAS, ARCHIVOS, FICHAS]) almacen(a).clear();
        }
        if (!dueno || dueno.alumno !== alumno || dueno.huella !== huella) meta.put({ alumno, huella }, 'dueno');
        fn(almacen, hecho);
      };
    });
  });
}

// Reads only when the key of this tab is the owner's.
async function leer(token, fn, siFalla = null) {
  const huella = await huellaDe(token);
  if (!huella) return siFalla;
  return enUna('readwrite', (almacen, hecho) => {
    const pedido = almacen(META).get('dueno');
    pedido.onsuccess = () => {
      if (pedido.result?.huella === huella) fn(almacen, hecho);
    };
  }, siFalla);
}

// ---------- The answers of the campus ----------

/** Keeps an answer of conCache, with when it came. Only the names of GUARDABLES; one that can't be kept is skipped. */
export function recordar(nombre, datos, { token, alumno, cuando = Date.now() }) {
  if (!esGuardable(nombre)) return Promise.resolve();
  return escribir({ token, alumno }, (almacen) => {
    try {
      almacen(RESPUESTAS).put({ cuando, datos }, nombre);
      // A course the page brought takes the place of the night's.
      if (/^contenido\.\d+$/.test(nombre)) almacen(RESPUESTAS).delete(`noche.${nombre}`);
    } catch {
      // Something that can't be copied to the database (a function): it stays in memory only.
    }
  });
}

/** The answer kept under that name, { cuando, datos }, or null when there is none for this key. */
export function recuperar(nombre, token) {
  if (!esGuardable(nombre)) return Promise.resolve(null);
  return leer(token, (almacen, hecho) => {
    const pedido = almacen(RESPUESTAS).get(nombre);
    pedido.onsuccess = () => {
      const r = pedido.result;
      if (r && Number.isFinite(r.cuando) && r.datos !== undefined) hecho.valor = r;
    };
  });
}

/** Every answer kept for this key, as [name, { cuando, datos }]: to show them at once, before the campus answers
 * (sesion.js). Empty when there is none or the key isn't the owner's. */
export function recuperarTodas(token) {
  return leer(token, (almacen, hecho) => {
    const todas = [];
    const cursor = almacen(RESPUESTAS).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (!c) {
        hecho.valor = todas;
        return;
      }
      const r = c.value;
      if (esGuardable(c.key) && r && Number.isFinite(r.cuando) && r.datos !== undefined) todas.push([c.key, { cuando: r.cuando, datos: r.datos }]);
      c.continue();
    };
  }, []);
}

// ---------- What came from elsewhere: Classroom and El Santo Resumen ----------

// Under names of their own, apart from conCache's (recuperarTodas never brings them), with `de`: whose they are over
// there (the number of the Google account, a fingerprint of the key of El Santo Resumen), so another one never reads them.
const APARTE = /^(classroom|santo)\.[\w:.-]{1,200}$/;
export const esAparte = (nombre) => APARTE.test(String(nombre));

/** Keeps what Classroom or El Santo Resumen brought (respaldo.js), with when it came and for whom over there. */
export function recordarAparte(nombre, datos, { token, alumno, de = '', cuando = Date.now() }) {
  if (!esAparte(nombre) || typeof de !== 'string') return Promise.resolve();
  return escribir({ token, alumno }, (almacen) => {
    try {
      almacen(RESPUESTAS).put({ cuando, datos, de }, nombre);
    } catch {
      // Something that can't be copied to the database: it stays in memory only.
    }
  });
}

/** What was kept under that name for that one over there, { cuando, datos }, or null. */
export function recuperarAparte(nombre, token, de = '') {
  if (!esAparte(nombre)) return Promise.resolve(null);
  return leer(token, (almacen, hecho) => {
    const pedido = almacen(RESPUESTAS).get(nombre);
    pedido.onsuccess = () => {
      const r = pedido.result;
      if (r && r.de === de && Number.isFinite(r.cuando) && r.datos !== undefined) hecho.valor = r;
    };
  });
}

/** Deletes what was kept under names that start with `prefijo` («classroom.»), and the files under it: Desconectar,
 * Desvincular. Whoever owns the database: deleting never needs the key. Never fails. */
export function borrarAparte(prefijo) {
  if (!/^(classroom|santo)[.:]/.test(prefijo) || typeof indexedDB === 'undefined') return Promise.resolve();
  return enFila(() => enUna('readwrite', (almacen) => {
    for (const a of [RESPUESTAS, ARCHIVOS, FICHAS]) {
      const cursor = almacen(a).openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        if (String(c.key).startsWith(prefijo)) almacen(a).delete(c.key);
        c.continue();
      };
    }
  }));
}

// ---------- The files of the courses ----------

const direccionValida = (d) => typeof d === 'string' && d.length > 0 && d.length < 2000;

/** A file kept: { blob, sello } (the version it had in the campus when it came), or null. */
export function archivoGuardado(direccion, token) {
  if (!direccionValida(direccion)) return Promise.resolve(null);
  return leer(token, (almacen, hecho) => {
    const pedido = almacen(ARCHIVOS).get(direccion);
    pedido.onsuccess = () => {
      const r = pedido.result;
      if (!r || !(r.blob instanceof Blob)) return;
      hecho.valor = { blob: r.blob, sello: typeof r.sello === 'string' ? r.sello : null };
      almacen(FICHAS).put({ peso: r.blob.size, usado: Date.now() }, direccion);
    };
  });
}

/** A PDF kept by parts: { sello, largo, tramos: [{ desde, blob }] }, or null. A whole file kept gives null. */
export function partesGuardadas(direccion, token) {
  if (!direccionValida(direccion)) return Promise.resolve(null);
  return leer(token, (almacen, hecho) => {
    const pedido = almacen(ARCHIVOS).get(direccion);
    pedido.onsuccess = () => {
      const r = pedido.result;
      if (!r || r.blob || typeof r.sello !== 'string' || !Number.isSafeInteger(r.largo) || !Array.isArray(r.tramos)) return;
      hecho.valor = { sello: r.sello, largo: r.largo, tramos: r.tramos };
      almacen(FICHAS).put({ peso: pesoDeTramos(r.tramos), usado: Date.now() }, direccion);
    };
  });
}

const pesoDeTramos = (tramos) => tramos.reduce((n, t) => n + (t?.blob instanceof Blob ? t.blob.size : 0), 0);

/** Keeps a file with its version, in place of what there was (also its parts). Makes room by the oldest used. */
export function guardarArchivoSinInternet(direccion, sello, blob, { token, alumno }, tope = TOPE_ARCHIVOS) {
  if (!direccionValida(direccion) || typeof sello !== 'string' || !(blob instanceof Blob)) return Promise.resolve();
  if (blob.size > Math.min(ARCHIVO_MAXIMO, tope)) return Promise.resolve();
  return escribir({ token, alumno }, (almacen) => poner(almacen, direccion, { sello, blob }, blob.size, tope));
}

/** Keeps the parts of a PDF brought so far, `largo` its whole size, in place of what there was: never over the whole
 * file of that same version. Counts towards the same tope and per-file limit as whole files. */
export function guardarPartesSinInternet(direccion, sello, { largo, tramos }, { token, alumno }, tope = TOPE_ARCHIVOS) {
  if (!direccionValida(direccion) || typeof sello !== 'string' || !Number.isSafeInteger(largo) || !Array.isArray(tramos)) return Promise.resolve();
  const limpios = tramos.filter((t) => Number.isSafeInteger(t?.desde) && t.blob instanceof Blob).map((t) => ({ desde: t.desde, blob: t.blob }));
  if (!limpios.length || largo > Math.min(ARCHIVO_MAXIMO, tope)) return Promise.resolve();
  return escribir({ token, alumno }, (almacen) => {
    const antes = almacen(ARCHIVOS).get(direccion);
    antes.onsuccess = () => {
      if (antes.result?.blob instanceof Blob && antes.result.sello === sello) return;
      poner(almacen, direccion, { sello, largo, tramos: limpios }, pesoDeTramos(limpios), tope);
    };
  });
}

// Puts one thing in ARCHIVOS with its weight, then takes away what was used longest ago until everything fits.
function poner(almacen, direccion, valor, peso, tope) {
  const archivos = almacen(ARCHIVOS);
  const fichas = almacen(FICHAS);
  archivos.put(valor, direccion);
  fichas.put({ peso, usado: Date.now() }, direccion);
  const todas = [];
  const cursor = fichas.openCursor();
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (c) {
      const { peso: p, usado: u } = c.value ?? {};
      todas.push({ k: c.key, peso: Number.isFinite(p) ? p : 0, usado: Number.isFinite(u) ? u : 0 });
      c.continue();
      return;
    }
    let total = todas.reduce((n, f) => n + f.peso, 0);
    for (const f of todas.sort((a, b) => a.usado - b.usado)) {
      if (total <= tope) break;
      if (f.k === direccion) continue;
      archivos.delete(f.k);
      fichas.delete(f.k);
      total -= f.peso;
    }
  };
}

// ---------- What the night download brings (descargasFondo.js) ----------

/** What is kept at an address, without counting as a use: { sello, entero, noche } (`noche`: the night download brought
 * it and the student hasn't opened it since), or null. */
export function fichaGuardada(direccion, token) {
  if (!direccionValida(direccion)) return Promise.resolve(null);
  return leer(token, (almacen, hecho) => {
    const pedido = almacen(ARCHIVOS).get(direccion);
    pedido.onsuccess = () => {
      const r = pedido.result;
      if (!r) return;
      const ficha = almacen(FICHAS).get(direccion);
      ficha.onsuccess = () => {
        hecho.valor = { sello: typeof r.sello === 'string' ? r.sello : null, entero: r.blob instanceof Blob, noche: ficha.result?.noche === true };
      };
    };
  });
}

/** Keeps a file the night download brought, marked as such. Makes room only among the night's own files, the oldest
 * first, and only when that is enough. Gives back 'guardado'; 'suyo' when the student keeps something there (it stays
 * as is, also an older version or its parts); 'igual' when that version is here; 'lleno' when there is no room without
 * touching the student's; 'grande' when it is over ARCHIVO_MAXIMO; undefined when it couldn't be written. */
export function guardarDeNoche(direccion, sello, blob, { token, alumno }, tope = TOPE_ARCHIVOS) {
  if (!direccionValida(direccion) || typeof sello !== 'string' || !(blob instanceof Blob)) return Promise.resolve(undefined);
  if (blob.size > Math.min(ARCHIVO_MAXIMO, tope)) return Promise.resolve('grande');
  return escribir({ token, alumno }, (almacen, hecho) => {
    const archivos = almacen(ARCHIVOS);
    const fichas = almacen(FICHAS);
    const antes = archivos.get(direccion);
    antes.onsuccess = () => {
      const previa = fichas.get(direccion);
      previa.onsuccess = () => {
        if (antes.result && previa.result?.noche !== true) {
          hecho.valor = 'suyo';
          return;
        }
        if (antes.result?.blob instanceof Blob && antes.result.sello === sello) {
          hecho.valor = 'igual';
          return;
        }
        const todas = [];
        const cursor = fichas.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c) {
            const { peso: p, usado: u, noche } = c.value ?? {};
            if (c.key !== direccion) todas.push({ k: c.key, peso: Number.isFinite(p) ? p : 0, usado: Number.isFinite(u) ? u : 0, noche: noche === true });
            c.continue();
            return;
          }
          let total = todas.reduce((n, f) => n + f.peso, 0) + blob.size;
          const afuera = [];
          for (const f of todas.filter((x) => x.noche).sort((a, b) => a.usado - b.usado)) {
            if (total <= tope) break;
            afuera.push(f.k);
            total -= f.peso;
          }
          // Not even without every earlier night file: nothing goes, and the night stops.
          if (total > tope) {
            hecho.valor = 'lleno';
            return;
          }
          for (const k of afuera) {
            archivos.delete(k);
            fichas.delete(k);
          }
          archivos.put({ sello, blob }, direccion);
          fichas.put({ peso: blob.size, usado: Date.now(), noche: true }, direccion);
          hecho.valor = 'guardado';
        };
      };
    };
  });
}

/** Salir: everything kept goes away from this browser (sesion.js). Never fails. */
export async function borrarSinInternet() {
  generacion += 1;
  const antes = abierta;
  abierta = null;
  try {
    (await antes)?.close();
  } catch {
    // It never opened: nothing to let go of.
  }
  if (typeof indexedDB === 'undefined') return;
  await new Promise((ok) => {
    try {
      const pedido = indexedDB.deleteDatabase(BASE);
      pedido.onsuccess = () => ok();
      pedido.onerror = () => ok();
      pedido.onblocked = () => ok();
    } catch {
      ok();
    }
  });
}
