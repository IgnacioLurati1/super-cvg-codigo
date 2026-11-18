import { useMemo, useSyncExternalStore } from 'react';
import { cargarNotificaciones, contarNotificaciones } from './campus';
import { seVeAviso } from './avisos';
import { escucharMio, mioActual, usuarioActual } from './mio';
import { cuantasSinVer, vistoHasta } from './notificaciones';
import { tokenActual } from './sesion';

// The bell of the header: the campus notifications. Read only, so Super CVG never marks one as read in the campus.
// Instead, this browser keeps, per student, until when the bell was opened (`cl.notif.<alumno>`, a number of seconds and
// nothing else): what came after and is unread in the campus counts as new. The count is asked on the clock of the
// unread messages (useSinLeer.js), and the list only when that count changes or the bell opens. Both live in memory.
const PREFIJO = 'cl.notif.';
export const claveVisto = (alumno) => PREFIJO + alumno;

// What the student took out, so it doesn't show again in the bell nor in Hoy: in this browser, per student
// (`cl.notif.fuera.<alumno>`), only the numbers the campus gives the notifications. The campus is never told. The last
// TOPE_FUERA taken out are kept.
const FUERA = 'cl.notif.fuera.';
export const claveFuera = (alumno) => FUERA + alumno;
const TOPE_FUERA = 500;
const NINGUNA = new Set();

/** Whether a notification can be taken out: it needs its number in the campus. */
export const sePuedeSacar = (n) => Number.isSafeInteger(n?.id) && n.id > 0;

/** The numbers of the notifications a student took out. */
export function leerFuera(alumno) {
  if (alumno === null || alumno === undefined) return NINGUNA;
  try {
    const lista = JSON.parse(localStorage.getItem(claveFuera(alumno)) ?? '[]');
    return Array.isArray(lista) ? new Set(lista.filter((id) => Number.isSafeInteger(id) && id > 0)) : NINGUNA;
  } catch {
    return NINGUNA;
  }
}

/** Until when a student saw the bell, in seconds, or 0. */
export function leerVisto(alumno) {
  if (alumno === null || alumno === undefined) return 0;
  try {
    const n = Number(localStorage.getItem(claveVisto(alumno)));
    return Number.isSafeInteger(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function guardarVisto(alumno, segundos) {
  try {
    localStorage.setItem(claveVisto(alumno), String(segundos));
  } catch {
    // A full browser keeps it for this tab only.
  }
}

// The kinds the student doesn't want to see (avisos.js, in mio.js): always the same Set until they change.
let ocultos = { de: null, set: NINGUNA };
function ocultosActuales() {
  const lista = mioActual().avisosOcultos;
  if (lista !== ocultos.de) ocultos = { de: lista, set: lista.length ? new Set(lista) : NINGUNA };
  return ocultos.set;
}

// The courses taken out of Hoy (hoy.js): their notifications leave the bell too. The same Set until they change.
let materiasFuera = { de: null, set: NINGUNA };
function materiasFueraActuales() {
  const lista = mioActual().hoy?.fuera;
  if (lista !== materiasFuera.de) materiasFuera = { de: lista, set: lista?.length ? new Set(lista.map(Number)) : NINGUNA };
  return materiasFuera.set;
}

// `disponible`: false when the campus leaves the notifications closed. `conteo`: the unread ones it counts, and
// `contado` once it did. `lista`: the latest ones, cleaned, or null before the first time. `deLaLista`: the count when the
// list came. `numero`: the last number of new ones that was final, or null before the first one. `timbre`: the rings.
// `ocultos`: the kinds the student hides, and `materiasFuera` the courses, that neither count nor ring.
const INICIAL = Object.freeze({ disponible: true, conteo: 0, contado: false, lista: null, deLaLista: null, alumno: null, visto: 0, cargando: false, error: '', numero: null, timbre: 0, ocultos: NINGUNA, materiasFuera: NINGUNA });
let estado = INICIAL;
const avisados = new Set();
let fuera = { alumno: undefined, ids: NINGUNA };

/** What the student of this session took out: always the same set until it changes. */
function fueraActual() {
  const alumno = usuarioActual();
  if (fuera.alumno !== alumno) fuera = { alumno, ids: leerFuera(alumno) };
  return fuera.ids;
}

/** Takes these notifications (by their number) out of the bell and of Hoy or, with `volver`, puts them back. */
export function sacarNotificaciones(ids, volver = false) {
  const alumno = usuarioActual();
  if (alumno === null || alumno === undefined) return;
  const nuevas = new Set(fueraActual());
  for (const id of ids) {
    if (!sePuedeSacar({ id })) continue;
    // Taken out again, it goes last: the oldest are the first to be forgotten.
    nuevas.delete(id);
    if (!volver) nuevas.add(id);
  }
  const guardadas = [...nuevas].slice(-TOPE_FUERA);
  try {
    localStorage.setItem(claveFuera(alumno), JSON.stringify(guardadas));
  } catch {
    // A full browser keeps it for this tab only.
  }
  fuera = { alumno, ids: new Set(guardadas) };
  avisados.forEach((f) => f());
}

/** The state with its ring. The number of new ones is final once the count came and it doesn't wait for the list to
 * know which are new. The bell rings when a final number goes above the last one: the first one of a visit only says
 * where it starts, so a page that opens with new ones stays quiet. */
export function conTimbre(e) {
  if (!e.contado || (e.conteo && e.visto && e.lista === null)) return e;
  const numero = cuantasSinVer(e.lista, e.visto, e.conteo, NINGUNA, e.ocultos, e.materiasFuera);
  const timbre = e.numero !== null && numero > e.numero ? e.timbre + 1 : e.timbre;
  return numero === e.numero && timbre === e.timbre ? e : { ...e, numero, timbre };
}

const poner = (cambios) => {
  estado = conTimbre({ ...estado, ...cambios });
  avisados.forEach((f) => f());
};

/** Back to nothing, when a session starts or ends: one student's bell is not the next one's. */
export const reiniciarCampana = () => poner({ ...INICIAL, ocultos: ocultosActuales(), materiasFuera: materiasFueraActuales() });

/** Whether the bell still asks: false when the campus left the notifications closed. */
export const campanaDisponible = () => estado.disponible;

// Closed in the campus (campus.js says so), or a function the campus doesn't have.
const cerrada = (error) => error?.codigo === 'sin_permiso' || error?.codigo === 'invalidrecord';

async function traerLista(token, fresco) {
  const conteo = estado.conteo;
  const lista = await cargarNotificaciones({ fresco });
  if (tokenActual() !== token) return;
  const alumno = usuarioActual();
  poner({ lista, deLaLista: conteo, alumno, visto: leerVisto(alumno), error: '' });
}

/** On the clock of useSinLeer.js: how many are unread in the campus, and the list again when that number changed. */
export async function revisarCampana(token) {
  if (!estado.disponible || !token) return;
  try {
    const conteo = await contarNotificaciones();
    if (tokenActual() !== token) return;
    const alumno = usuarioActual();
    poner({ conteo, contado: true, alumno, visto: leerVisto(alumno) });
    if (conteo > 0 && (estado.lista === null || conteo !== estado.deLaLista)) await traerLista(token, estado.lista !== null);
  } catch (error) {
    if (cerrada(error) && tokenActual() === token) poner({ disponible: false });
  }
}

/** The student opened the bell: the list, again if the count changed since it came, and everything in it seen. */
export async function abrirCampana() {
  const token = tokenActual();
  if (!token || !estado.disponible) return;
  const viejo = estado.lista !== null && estado.conteo !== estado.deLaLista;
  if (estado.lista === null || viejo) {
    poner({ cargando: true, error: '' });
    try {
      await traerLista(token, viejo);
    } catch (error) {
      if (tokenActual() !== token) return;
      if (cerrada(error)) return poner({ disponible: false, cargando: false });
      return poner({ cargando: false, error: error?.conocido ? error.message : 'No pudimos traer tus notificaciones. Probá de nuevo.' });
    }
    if (tokenActual() !== token) return;
    poner({ cargando: false });
  }
  const { alumno, lista, visto } = estado;
  const hasta = vistoHasta(lista, visto);
  if (alumno === null || hasta <= visto) return;
  guardarVisto(alumno, hasta);
  poner({ visto: hasta });
}

const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};
const leer = () => estado;

/** For «Borrar todo lo mío»: this browser forgets what the student took out. */
export function olvidarSacadas() {
  const alumno = usuarioActual();
  if (alumno === null || alumno === undefined) return;
  try {
    localStorage.removeItem(claveFuera(alumno));
  } catch {
    // Nothing to forget.
  }
  fuera = { alumno, ids: NINGUNA };
  avisados.forEach((f) => f());
}

/** The numbers of the notifications the student took out, for a component. */
export const useSacadas = () => useSyncExternalStore(suscribir, fueraActual, fueraActual);

/** { disponible, sinVer, lista, todas, filtradas, sacadas, visto, cargando, error, timbre }, for the header. `lista`:
 * without the ones taken out; `todas`: with them, for the way back right after. Neither has the kinds the student hides:
 * `filtradas` says how many of those there are. */
export function useCampana() {
  const e = useSyncExternalStore(suscribir, leer, leer);
  const sacadas = useSacadas();
  const todas = useMemo(() => e.lista && e.lista.filter((n) => seVeAviso(n, e.ocultos, e.materiasFuera)), [e.lista, e.ocultos, e.materiasFuera]);
  const lista = useMemo(() => todas && todas.filter((n) => !sacadas.has(n.id)), [todas, sacadas]);
  return {
    disponible: e.disponible, sinVer: cuantasSinVer(e.lista, e.visto, e.conteo, sacadas, e.ocultos, e.materiasFuera), lista, todas, filtradas: (e.lista?.length ?? 0) - (todas?.length ?? 0),
    sacadas, visto: e.visto, cargando: e.cargando, error: e.error, timbre: e.timbre,
  };
}

/** The kinds of notification the student hides (avisos.js), as a Set: for Avisos of Hoy. */
export const useAvisosOcultos = () => useSyncExternalStore(suscribir, () => estado.ocultos, () => NINGUNA);

// The student chose other kinds, here or on another device: the number counts again from there, without ringing.
escucharMio(() => {
  const nuevos = ocultosActuales();
  const cursos = materiasFueraActuales();
  if (nuevos === estado.ocultos && cursos === estado.materiasFuera) return;
  poner({ ocultos: nuevos, materiasFuera: cursos, numero: null });
});

// Opened in another tab: this one stops counting what was already seen there.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (estado.alumno !== null && e.key === claveVisto(estado.alumno)) poner({ visto: leerVisto(estado.alumno) });
    if (fuera.alumno !== undefined && fuera.alumno !== null && e.key === claveFuera(fuera.alumno)) {
      fuera = { alumno: fuera.alumno, ids: leerFuera(fuera.alumno) };
      avisados.forEach((f) => f());
    }
  });
}
