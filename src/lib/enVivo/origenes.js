// Where what this browser put on the table came from, so that after a reload it can bring it again by itself when
// nobody else in the session still has it (recuperar.js). Only numbers of where it is: the course and the file's key
// in it for the campus, the id of one's own file in this browser, the course of a course tab. Never the file, its
// address or its name in the campus. In this tab only (sessionStorage, as the session's code), and leaving forgets it.

const CLAVE = 'cl.envivo.origen';
const MAX = 40;
const CLAVE_CAMPUS = /^[\w.]{1,40}$/;
const ID_PROPIO = /^[\w-]{1,80}$/;
const MATERIA = (m) => (Number.isInteger(m) && m > 0) || (typeof m === 'string' && /^p[\w-]{1,40}$/.test(m));

/** How a file can be brought again: { m, c } from the campus (course number, key of the file in it), { b, n } for one's
 * own (its id in this browser and its name, for its type), or null if it has no way back (from the computer). */
export function origenDe(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.propio) return typeof item.archivoId === 'string' && ID_PROPIO.test(item.archivoId) ? { b: item.archivoId, n: String(item.archivo ?? item.nombre ?? '').slice(0, 200) } : null;
  const materia = /^(\d{1,12})-/.exec(typeof item.id === 'string' ? item.id : '')?.[1];
  return materia && item.direccion && typeof item.clave === 'string' && CLAVE_CAMPUS.test(item.clave) ? { m: Number(materia), c: item.clave } : null;
}

/** The same, checked as it comes back from storage: a file's, a course's ({ m }), or null. */
function leerUno(o) {
  if (!o || typeof o !== 'object') return null;
  if (typeof o.b === 'string' && ID_PROPIO.test(o.b)) return { b: o.b, n: typeof o.n === 'string' ? o.n.slice(0, 200) : '' };
  if (!MATERIA(o.m)) return null;
  return typeof o.c === 'string' && CLAVE_CAMPUS.test(o.c) ? { m: o.m, c: o.c } : { m: o.m };
}

function leer() {
  try {
    const todo = JSON.parse(sessionStorage.getItem(CLAVE) || '{}');
    return todo && typeof todo === 'object' && !Array.isArray(todo) ? todo : {};
  } catch {
    return {};
  }
}

/** Notes where a file (by its id on the table) or a course tab (`m:<tab>`) came from. Nothing for what has none. */
export function anotarOrigen(clave, origen) {
  const limpio = leerUno(origen);
  if (!limpio) return;
  try {
    const todo = leer();
    delete todo[clave];
    todo[clave] = limpio;
    const claves = Object.keys(todo);
    claves.slice(0, Math.max(0, claves.length - MAX)).forEach((k) => delete todo[k]);
    sessionStorage.setItem(CLAVE, JSON.stringify(todo));
  } catch {
    // Private mode: a reload can't bring it back by itself.
  }
}

export const origenAnotado = (clave) => leerUno(leer()[clave]);

export function olvidarOrigenes() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nothing to forget.
  }
}
