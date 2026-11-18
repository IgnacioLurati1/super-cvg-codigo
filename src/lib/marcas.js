// What a device keeps, next to the student's things, to save them in their Google Drive (sincro.js): whether it is on,
// when it last saved, when each element changed and which ones changed since (union.js), the fingerprint of each file
// already in Drive, and the number of the Google account it saves in (`cuenta`, never the permission: with it a new
// session renews the permission without asking, and another account is noticed). One entry per student, in this
// browser. It exists only once the student turned it on: before that nothing of this is written.
// If the browser is full and they can't be written, they stay in the memory of the tab (nothing changed is missed while
// it is open) and a small mark says so: saving in Drive waits for room, and if the tab closed meanwhile the next join
// treats everything here as changed.
import { marcar } from './union';

const PREFIJO = 'cl.sync.';
const CLAVE = /^[\w./-]{1,300}$/;
const HASH = /^[0-9a-f]{64}$/;
const SUB = /^\d{1,30}$/;
const MAX = 200_000;

export const claveMarcas = (usuario) => PREFIJO + usuario;
const claveFalta = (usuario) => `${PREFIJO}${usuario}.falta`;

const numeros = (o, conNulo) => {
  const salida = {};
  for (const [k, v] of Object.entries(o && typeof o === 'object' ? o : {}).slice(0, MAX)) {
    if (CLAVE.test(k) && ((Number.isSafeInteger(v) && v >= 0) || (conNulo && v === null))) salida[k] = v;
  }
  return salida;
};

/** Only known fields, types and sizes, also for what comes from the copy in Drive. `unido`: the copy got this device's
 * things at least once (if it is not there any more, it was deleted). `juntado`: this device already joined with the
 * copy, even if it could not save it there yet. */
export function sanearMarcas(m) {
  const archivos = {};
  for (const [id, h] of Object.entries(m?.archivos && typeof m.archivos === 'object' ? m.archivos : {}).slice(0, 20_000)) {
    if (/^[0-9a-z]{8,32}$/.test(id) && HASH.test(h)) archivos[id] = h;
  }
  return {
    prendido: m?.prendido === true,
    unido: m?.unido === true,
    juntado: m?.juntado === true,
    ultima: Number.isSafeInteger(m?.ultima) && m.ultima > 0 ? m.ultima : 0,
    cuenta: typeof m?.cuenta === 'string' && SUB.test(m.cuenta) ? m.cuenta : null,
    t: numeros(m?.t, false),
    d: numeros(m?.d, true),
    archivos,
  };
}

// The ones the browser had no room for, by student.
const enMemoria = new Map();

/** What this device keeps for the student, or null if they never turned it on. */
export function leerMarcas(usuario) {
  if (usuario === null || usuario === undefined) return null;
  if (enMemoria.has(usuario)) return enMemoria.get(usuario);
  try {
    const crudo = localStorage.getItem(claveMarcas(usuario));
    return crudo === null ? null : sanearMarcas(JSON.parse(crudo));
  } catch {
    return null;
  }
}

/** False if the browser had no room: they stay in this tab meanwhile (sinLugarMarcas). */
export function guardarMarcas(usuario, marcas) {
  const limpias = sanearMarcas(marcas);
  try {
    localStorage.setItem(claveMarcas(usuario), JSON.stringify(limpias));
    enMemoria.delete(usuario);
    return true;
  } catch {
    enMemoria.set(usuario, limpias);
    try {
      localStorage.setItem(claveFalta(usuario), '1');
    } catch {
      // Not even that fits: the tab knows it while it is open.
    }
    return false;
  }
}

/** The marks are only in this tab, because the browser has no room for them. */
export const sinLugarMarcas = (usuario) => enMemoria.has(usuario);

/** Once, the browser had no room for a change: the next join treats everything here as changed. */
export function faltoMarcar(usuario) {
  try {
    return localStorage.getItem(claveFalta(usuario)) === '1';
  } catch {
    return false;
  }
}

/** After a join that treated everything as changed. */
export function marcasAlDia(usuario) {
  try {
    localStorage.removeItem(claveFalta(usuario));
  } catch {
    // Nothing stored.
  }
}

export function borrarMarcas(usuario) {
  enMemoria.delete(usuario);
  try {
    localStorage.removeItem(claveMarcas(usuario));
    localStorage.removeItem(claveFalta(usuario));
  } catch {
    // Nothing stored.
  }
}

/** mio.js calls this on every change of the student's: it notes what changed, if they ever turned on saving in Drive. */
export function anotarCambio(usuario, antes, despues) {
  const marcas = leerMarcas(usuario);
  if (!marcas) return;
  const nuevas = marcar(marcas, antes, despues);
  if (nuevas !== marcas) guardarMarcas(usuario, nuevas);
}

/** Whether something changed here that the copy in Drive doesn't have yet. */
export const hayCambios = (marcas) => Boolean(marcas) && Object.keys(marcas.d).length > 0;
