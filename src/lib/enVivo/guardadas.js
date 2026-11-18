import { leerCodigo } from './codigo';

// The live sessions this browser keeps to come back to (guardadoSesion.js), by student, in its database. Each one by an
// id that comes from the code (never the code as a key): { id, codigo, cuando, pestanas, y, persona, anfitrion,
// terminada, origenes, drive }.
//   codigo    to enter again from the list: the code opens the session, so it stays only here (and in the student's
//             Drive, with «Guardar en tu Google Drive»). Salir deletes it all (sesion.js).
//   pestanas  the names of its tabs, for the list.
//   y         the copy of the table without the campus (copiaDeSesion.js).
//   persona   who the student was in it (sesion.js `yo.id`), to be the same person on coming back from here.
//   anfitrion whether the student made it: coming back from here, they can still end it for everyone.
//   terminada { por, cuando } once it was ended for everyone: the list says so, and it does not open again from here.
//   origenes  where the files this browser put on the table came from, only numbers (origenes.js): coming back, they
//             are brought again as after a reload (recuperar.js). Only here, never in Drive.
//   drive     what this browser last knew of its copy in Drive: { id, version, huella } (sesionesEnDrive.js).
// A session the student forgot stays a while as { id, borrada } so its copy in Drive goes too.
// Light on purpose (no Yjs): sesion.js loads it for Salir. Nothing here throws: without the database (private mode, no
// room), nothing is kept.

const BASE = 'super-cvg-en-vivo';
const ALMACEN = 'sesiones';
/** How many sessions are kept per student: past this, the one used the longest ago goes. */
export const TOPE_GUARDADAS = 20;
/** A copy bigger than this is not kept, nor read. */
export const MAX_COPIA = 12 * 1024 * 1024;
const ID = /^[0-9a-f]{32}$/;
const HUELLA = /^[0-9a-f]{64}$/;
const PERSONA = /^[0-9a-f]{16}$/;
const ARCHIVO = /^[0-9a-f]{16}$/;

let abierta = null;
// Bumped by Salir: a write that started before it does not bring anything back.
let generacion = 0;
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => f());

/** Calls `f` when the kept sessions change in this tab. Returns how to stop. */
export function escucharGuardadas(f) {
  oyentes.add(f);
  return () => oyentes.delete(f);
}

/** The id of a session's copy: from its code, without the code in it. */
export async function idDeSesion(codigo) {
  const limpio = leerCodigo(codigo);
  if (!limpio) return null;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`super-cvg/en-vivo/guardada/v1:${limpio}`)));
  return Array.from(bytes.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The SHA-256 of a copy, in hex. */
export async function huellaDeCopia(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function abrir() {
  if (!abierta) {
    const esta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(new Error('sin base'));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => {
        const db = pedido.result;
        if (!db.objectStoreNames.contains(ALMACEN)) db.createObjectStore(ALMACEN);
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

const clave = (alumno, id) => `${alumno}:${id}`;
const deAlumno = (alumno) => IDBKeyRange.bound(`${alumno}:`, `${alumno}:￿`);
const valido = (alumno) => Number.isInteger(alumno);

async function enUna(modo, fn, siFalla) {
  try {
    const db = await abrir();
    return await new Promise((ok) => {
      const hecho = { valor: siFalla };
      let tx;
      try {
        tx = db.transaction(ALMACEN, modo);
        fn(tx.objectStore(ALMACEN), hecho);
      } catch {
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

const numero = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
function driveLeido(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !/^[\w-]{1,200}$/.test(d.id)) return null;
  return { id: d.id, version: typeof d.version === 'string' ? d.version.slice(0, 40) : '', huella: HUELLA.test(d.huella) ? d.huella : '' };
}

// The same shapes as origenes.js: { m, c } of the campus, { b, n } of one's own files.
function origenesLeidos(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const limpios = {};
  for (const [k, v] of Object.entries(o).slice(0, 40)) {
    if (!ARCHIVO.test(k) || !v || typeof v !== 'object') continue;
    if (typeof v.b === 'string' && /^[\w-]{1,80}$/.test(v.b)) limpios[k] = { b: v.b, n: typeof v.n === 'string' ? v.n.slice(0, 200) : '' };
    else if (Number.isSafeInteger(v.m) && v.m > 0 && typeof v.c === 'string' && /^[\w.]{1,40}$/.test(v.c)) limpios[k] = { m: v.m, c: v.c };
  }
  return limpios;
}

/** Who ended a session for everyone, and when: { por, cuando } or null. */
export function terminadaLeida(t) {
  if (!t || typeof t !== 'object' || !numero(t.cuando)) return null;
  return { por: typeof t.por === 'string' ? t.por.slice(0, 60) : '', cuando: t.cuando };
}

/** A record as it comes from the database, checked: a session, a forgotten one ({ id, borrada }), or null. */
export function guardadaLeida(r) {
  if (!r || typeof r !== 'object' || !ID.test(r.id)) return null;
  if (numero(r.borrada)) return { id: r.id, borrada: r.borrada, drive: driveLeido(r.drive) };
  const codigo = leerCodigo(r.codigo);
  const y = r.y instanceof Uint8Array ? r.y : r.y instanceof ArrayBuffer ? new Uint8Array(r.y) : null;
  if (!codigo || !numero(r.cuando) || !y || !y.length || y.length > MAX_COPIA) return null;
  const pestanas = Array.isArray(r.pestanas) ? r.pestanas.filter((p) => typeof p === 'string').slice(0, 12).map((p) => p.slice(0, 60)) : [];
  const persona = PERSONA.test(r.persona ?? '') ? r.persona : null;
  return { id: r.id, codigo, cuando: r.cuando, pestanas, y, persona, anfitrion: r.anfitrion === true, terminada: terminadaLeida(r.terminada), origenes: origenesLeidos(r.origenes), drive: driveLeido(r.drive) };
}

/** Everything kept of a student, forgotten ones too. */
export async function todasLasGuardadas(alumno) {
  if (!valido(alumno)) return [];
  return enUna('readonly', (almacen, hecho) => {
    const todas = almacen.getAll(deAlumno(alumno));
    todas.onsuccess = () => {
      hecho.valor = todas.result.map(guardadaLeida).filter(Boolean);
    };
  }, []);
}

/** The sessions of a student to come back to, the last used first: [{ id, codigo, cuando, pestanas, anfitrion,
 * terminada }]. */
export async function listarGuardadas(alumno) {
  return (await todasLasGuardadas(alumno))
    .filter((r) => !r.borrada)
    .sort((a, b) => b.cuando - a.cuando)
    .map(({ id, codigo, cuando, pestanas, anfitrion, terminada }) => ({ id, codigo, cuando, pestanas, anfitrion, terminada }));
}

/** One kept session (or a forgotten one), or null. */
export async function leerGuardada(alumno, id) {
  if (!valido(alumno) || !ID.test(id ?? '')) return null;
  return enUna('readonly', (almacen, hecho) => {
    const pedido = almacen.get(clave(alumno, id));
    pedido.onsuccess = () => {
      hecho.valor = guardadaLeida(pedido.result);
    };
  }, null);
}

/** Keeps a record (a session, or a forgotten one) in place of what it had. Makes room by the one used the longest
 * ago. False if it could not. */
export async function ponerGuardada(alumno, registro) {
  const r = guardadaLeida(registro);
  if (!valido(alumno) || !r) return false;
  const nacida = generacion;
  const hecho = await enUna('readwrite', (almacen, h) => {
    if (nacida !== generacion) return;
    almacen.put(r, clave(alumno, r.id));
    h.valor = true;
    if (r.borrada) return;
    const todas = almacen.getAll(deAlumno(alumno));
    todas.onsuccess = () => {
      const viejas = todas.result.map(guardadaLeida).filter((x) => x && !x.borrada && x.id !== r.id).sort((a, b) => b.cuando - a.cuando).slice(TOPE_GUARDADAS - 1);
      for (const v of viejas) almacen.delete(clave(alumno, v.id));
    };
  }, false);
  if (hecho) avisar();
  return hecho;
}

/** «Borrar» on the list: gone from here, and noted so its copy in Drive goes too. */
export async function olvidarGuardada(alumno, id, ahora = Date.now()) {
  const antes = await leerGuardada(alumno, id);
  if (!antes) return;
  await ponerGuardada(alumno, { id, borrada: ahora, drive: antes.drive });
}

/** Gone from here without a trace (its copy in Drive is already dealt with). */
export async function quitarGuardada(alumno, id) {
  if (!valido(alumno) || !ID.test(id ?? '')) return;
  await enUna('readwrite', (almacen) => {
    almacen.delete(clave(alumno, id));
  });
  avisar();
}

/** Salir: every kept session of every student goes away from this browser (sesion.js). Never fails. */
export async function borrarGuardadas() {
  generacion += 1;
  const antes = abierta;
  abierta = null;
  try {
    (await antes)?.close();
  } catch {
    // It never opened: nothing to let go of.
  }
  if (typeof indexedDB !== 'undefined') {
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
  avisar();
}
