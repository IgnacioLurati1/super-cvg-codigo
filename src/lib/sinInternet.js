// What the campus answered, kept in this browser so Super CVG opens without internet or with the campus down: the page's
// side. The database itself is sinInternetDisco.js (the service worker writes there too, for the night downloads); here,
// turning what the night brought into what the screens read, and whether what shows came from the disk.
import { useSyncExternalStore } from 'react';
import { aplanarContenido } from './datos';
import { recuperar as recuperarDelDisco, recuperarTodas as todasDelDisco } from './sinInternetDisco';

export * from './sinInternetDisco';

// ---------- What the night download brought (descargasFondo.js) ----------

const DE_NOCHE = /^noche\.(contenido\.(\d+))$/;
const CONTENIDO = /^contenido\.(\d+)$/;

// The course by its number in the kept list of courses, for its name: the night keeps only the campus answer.
function materiaDe(id, materias) {
  const todas = [...(Array.isArray(materias?.enCurso) ? materias.enCurso : []), ...(Array.isArray(materias?.otras) ? materias.otras : [])];
  const m = todas.find((x) => x?.id === id);
  return { id, nombre: typeof m?.nombre === 'string' ? m.nombre : '' };
}

// What the night brought, as the page keeps a course (campus.js, cargarContenido), when it is newer than the page's own.
function laMasNueva(propia, noche, id, materias) {
  if (!noche || (propia && propia.cuando >= noche.cuando)) return propia;
  try {
    return { cuando: noche.cuando, datos: aplanarContenido(noche.datos?.secciones, materiaDe(id, materias)) };
  } catch {
    return propia;
  }
}

/** The answer kept under that name, { cuando, datos }, or null when there is none for this key. A course brought by the
 * night download, when it is newer, as the page keeps it. */
export async function recuperar(nombre, token) {
  const curso = CONTENIDO.exec(String(nombre));
  if (!curso) return DE_NOCHE.test(String(nombre)) ? null : recuperarDelDisco(nombre, token);
  const [propia, noche] = await Promise.all([recuperarDelDisco(nombre, token), recuperarDelDisco(`noche.${nombre}`, token)]);
  if (!noche) return propia;
  const materias = await recuperarDelDisco('materias', token);
  return laMasNueva(propia, noche, Number(curso[1]), materias?.datos) ?? null;
}

/** Every answer kept for this key, as [name, { cuando, datos }], with the night's courses as the page keeps them. */
export async function recuperarTodas(token) {
  const todas = await todasDelDisco(token);
  const porNombre = new Map(todas);
  const materias = porNombre.get('materias')?.datos;
  const salida = todas.filter(([n]) => !DE_NOCHE.test(n));
  for (const [n, noche] of todas) {
    const r = DE_NOCHE.exec(n);
    if (!r) continue;
    const propia = porNombre.get(r[1]);
    const nueva = laMasNueva(propia, noche, Number(r[2]), materias);
    if (nueva && nueva !== propia) {
      const i = salida.findIndex(([x]) => x === r[1]);
      if (i >= 0) salida[i] = [r[1], nueva];
      else salida.push([r[1], nueva]);
    }
  }
  return salida;
}

/** Asks the browser not to clear this site's data when the disk fills up, once, when it is installed as an app (there
 * Chrome says yes without asking; in a tab Firefox would ask, and a question out of nowhere scares). */
let persistenciaPedida = false;
export function pedirQueSeQuede() {
  if (persistenciaPedida || typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  if (!window.matchMedia?.('(display-mode: standalone)').matches && window.navigator.standalone !== true) return;
  persistenciaPedida = true;
  navigator.storage.persist().catch(() => {});
}

// ---------- Whether what shows came from the disk ----------

/** A failure that is the network or the campus down, not an answer: then what was kept is worth showing. */
export function esFaltaDeConexion(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true;
  // `tiempo`: the campus didn't answer in TOPE_MS (moodle.js), the way a bad signal looks.
  return /^(http_5\d\d|tiempo)$/.test(String(error?.codigo ?? ''));
}

// `desde` is null while everything on screen came from the campus; otherwise, when the oldest kept thing was brought (ms).
let estado = { sinRed: typeof navigator !== 'undefined' && navigator.onLine === false, desde: null, volvio: false };
const oyentes = new Set();
const cambiar = (nuevo) => {
  estado = { ...estado, ...nuevo };
  oyentes.forEach((f) => f());
};

/** conCache showed something kept, brought at `cuando` (ms), because the campus did not answer. */
export function mostroGuardado(cuando) {
  const desde = estado.desde === null ? cuando : Math.min(estado.desde, cuando);
  if (desde !== estado.desde || estado.volvio) cambiar({ desde, volvio: false });
}

/** The campus answered: whatever shows from now on is fresh. What already showed stays old until it is asked again. */
export function respondioElCampus() {
  if (estado.desde !== null && !estado.volvio) cambiar({ volvio: true });
}

/** A new session, or Salir: nothing of the previous one is on screen. */
export function olvidarEstadoSinRed() {
  if (estado.desde !== null || estado.volvio) cambiar({ desde: null, volvio: false });
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => cambiar({ sinRed: true }));
  window.addEventListener('online', () => cambiar({ sinRed: false, volvio: estado.desde !== null }));
}

const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
/** { sinRed, desde, volvio }: no network, the oldest kept thing on screen (ms or null), and whether the network came back
 * after something kept showed. */
export const useSinInternet = () => useSyncExternalStore(suscribir, () => estado, () => estado);
