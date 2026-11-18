import * as Y from 'yjs';
import { usuarioActual } from '../mio';
import { copiaSinCampus, DE_LA_COPIA, leerCopia, pestanasDeCopia } from './copiaDeSesion';
import { idDeSesion, leerGuardada, MAX_COPIA, olvidarGuardada, ponerGuardada, terminadaLeida } from './guardadas';
import { pestanas } from './mesa';
import { anotarOrigen, origenAnotado } from './origenes';

// Coming back to a live session with the same code. While the student is in one, this browser keeps a copy of the
// table without the campus (copiaDeSesion.js) in its database (guardadas.js), and in their Drive if they save there
// (sesionesEnDrive.js). On entering again, once what the others have arrived (or nobody is there), the copy goes into
// the table: Yjs merges it, and whoever is in gets what was missing. The first one back brings it to everyone.

// Changes go to the copy at most this often, and when the session closes or the tab is hidden.
export const CADA_GUARDADO = 5000;

const subirPronto = (ms) => import('./sesionesEnDrive').then((m) => m.programarDrive(ms)).catch(() => {});
const bajarDeDrive = () => import('./sesionesEnDrive').then((m) => m.sincronizarSesiones()).catch(() => []);

// Where the files this browser put on the table came from (only numbers, origenes.js), to bring them again on coming
// back here.
function origenesDe(doc, persona) {
  const todos = {};
  for (const p of pestanas(doc)) {
    const datos = doc.getMap(`h:${p.id}`);
    const archivo = datos.get('archivo');
    if (p.tipo !== 'apunte' || datos.get('de') !== persona || typeof archivo !== 'string') continue;
    const o = origenAnotado(archivo);
    if (o && (o.b || o.c)) todos[archivo] = o;
  }
  return todos;
}

/** Before entering with `codigo` by hand: if this browser was in that session, the person it was (and whether it made
 * it) and where its files came from, so it is the same person and its files come back (recuperar.js). Resolves with
 * { persona, anfitrion }, or null. A session ended for everyone does not open again: it resolves with
 * { terminada, copia: { y, reemplaza } }, its copy to open in a new session of its own (guardarMientras). */
export async function prepararVuelta(codigo, alumno = usuarioActual()) {
  const id = await idDeSesion(codigo);
  const r = id && (await leerGuardada(alumno, id));
  if (!r || r.borrada || (!r.persona && !r.terminada)) return null;
  Object.entries(r.origenes).forEach(([archivo, o]) => anotarOrigen(archivo, o));
  if (r.terminada) return { terminada: r.terminada, persona: r.persona, copia: { y: r.y, reemplaza: id } };
  return { persona: r.persona, anfitrion: r.anfitrion };
}

/**
 * Keeps the copy of `sesion` (entered with `codigo`) while it lasts, and brings back the one kept before. Returns how to
 * stop. `alumno`: whose it is; `vigente()`: whether that student is still in (Salir must not leave anything behind);
 * `alGuardar(ms)` and `deDrive()`: what is done with Drive (tests change them). `copia`: { y, reemplaza }, the copy of an
 * ended session that opens in this new one, and whose place in the list it takes once this one is kept.
 */
export function guardarMientras(sesion, codigo, { alumno = usuarioActual(), vigente = () => usuarioActual() === alumno, alGuardar = subirPronto, deDrive = bajarDeDrive, copia = null } = {}) {
  const doc = sesion.doc;
  if (!Number.isInteger(alumno) || doc.isDestroyed) return () => {};
  let id = null;
  let previo = null;
  let traida = false;
  let reloj = null;
  let terminado = false;
  // Ended for everyone (sesion.js `terminar`): noted with the copy, so it is not opened again as if it went on.
  const meta = doc.getMap('meta');
  let fin = null;
  const alFin = () => {
    fin = terminadaLeida(meta.get('terminada')) ?? fin;
  };
  meta.observe(alFin);

  // A copy into the table: only what it lacks, checked as it comes.
  const traer = (bytes) => {
    if (terminado || doc.isDestroyed) return;
    const copia = leerCopia(bytes);
    if (!copia) return;
    const falta = Y.encodeStateAsUpdate(copia, Y.encodeStateVector(doc));
    copia.destroy();
    Y.applyUpdate(doc, falta, DE_LA_COPIA);
  };

  const guardar = () => {
    clearTimeout(reloj);
    reloj = null;
    // Never before the old copy came in: it would be written over with less.
    if (!traida || id === null || !vigente()) return;
    const titulos = pestanasDeCopia(doc);
    // A session with nothing on it is not listed, unless it was before.
    if (!titulos.length && !doc.getArray('chat').length && !(previo && !previo.borrada)) return;
    const y = copiaSinCampus(doc);
    if (y.length > MAX_COPIA) return;
    previo = { id, codigo, cuando: Date.now(), pestanas: titulos, y, persona: sesion.yo.id, anfitrion: Boolean(sesion.yo.anfitrion), terminada: fin ?? previo?.terminada ?? null, origenes: origenesDe(doc, sesion.yo.id), drive: previo?.drive ?? null };
    const cerrando = terminado;
    const reemplaza = copia?.reemplaza !== id ? copia?.reemplaza : null;
    if (copia) copia = null;
    ponerGuardada(alumno, previo).then(async (ok) => {
      if (!ok) return;
      if (reemplaza) await olvidarGuardada(alumno, reemplaza);
      alGuardar(cerrando ? 1500 : 30_000);
    });
  };

  const alCambiar = () => {
    if (!reloj && !terminado) reloj = setTimeout(guardar, CADA_GUARDADO);
  };
  const alOcultar = () => {
    if (document.visibilityState === 'hidden' && reloj) guardar();
  };

  // Once what is on the table came (or nobody is there to bring it), the kept copy goes in; then Drive's, if newer.
  const intentar = () => {
    if (traida || terminado || id === null || !sesion.cargada()) return;
    traida = true;
    quitar();
    if (previo?.y) traer(previo.y);
    else if (copia?.y) traer(copia.y);
    deDrive().then(async (cambiadas) => {
      if (terminado || !cambiadas?.includes(id)) return;
      const r = await leerGuardada(alumno, id);
      if (r?.y) {
        previo = { ...r };
        traer(r.y);
      }
    });
  };
  const quitar = sesion.suscribir(intentar);

  const terminar = () => {
    if (terminado) return;
    terminado = true;
    quitar();
    meta.unobserve(alFin);
    doc.off('update', alCambiar);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', alOcultar);
  };
  // The session closes (Salir de la sesión, Salir of the site, another session): what it had goes to the copy now, while
  // the doc still has it.
  doc.on('destroy', () => {
    terminado = true;
    alFin();
    guardar();
    // Ended before the copy came in: the one kept before is marked anyway.
    if (!traida && fin && previo && !previo.borrada && vigente()) ponerGuardada(alumno, { ...previo, terminada: fin });
    terminar();
  });
  doc.on('update', alCambiar);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', alOcultar);

  (async () => {
    const elId = await idDeSesion(codigo);
    const r = elId && (await leerGuardada(alumno, elId));
    if (terminado || !elId) return;
    id = elId;
    previo = r;
    intentar();
  })();

  return terminar;
}
