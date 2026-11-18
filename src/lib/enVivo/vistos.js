// What this tab already showed of the session it is in, so a reload does not bring it back as new: the last chat message
// told and read, and the shared outputs of the Laboratorio seen and told. In sessionStorage, only ids, under the person
// this tab is in the session (sesion.js `yo.id`): another session, or a duplicated tab (another person), starts clean.
// Leaving the session forgets it (conexion.js `salir`).

const CLAVE = 'cl.envivo.vistos';
const ID = /^[\w:.-]{1,60}$/;
// Each list keeps only its last ones: the table shows at most 12 shared outputs (laboratorioCompartido.js).
const TOPE = 24;

function leer(persona) {
  try {
    const v = JSON.parse(sessionStorage.getItem(CLAVE) || 'null');
    if (v && typeof v === 'object' && v.p === persona) return v;
  } catch {
    // Broken or unavailable: nothing seen.
  }
  return { p: persona };
}

/** The id kept as `que` (the last chat message told or read), or null. */
export function ultimoVisto(persona, que) {
  const v = leer(persona)[que];
  return typeof v === 'string' && ID.test(v) ? v : null;
}

/** The ids kept as `que` (shared outputs seen or told). */
export function vistos(persona, que) {
  const v = leer(persona)[que];
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ID.test(x)) : [];
}

/** Keeps `valor` (an id, or a list of ids) as `que`. */
export function anotarVisto(persona, que, valor) {
  const limpio = Array.isArray(valor) ? [...new Set(valor)].filter((x) => typeof x === 'string' && ID.test(x)).slice(-TOPE) : typeof valor === 'string' && ID.test(valor) ? valor : null;
  if (!limpio) return;
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ ...leer(persona), [que]: limpio }));
  } catch {
    // Private mode or no room: a reload tells it again.
  }
}

export function olvidarVistos() {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nothing to forget.
  }
}
