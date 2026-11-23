import { esDemo } from './modoDemo';
import { quienGuarda, sesionRecordada, tokenActual } from './sesion';
import { archivoGuardado, guardarArchivoSinInternet, mostroGuardado, recordarAparte, recuperarAparte } from './sinInternet';

// What Classroom and El Santo Resumen bring, kept for offline the way conCache keeps the campus (sinInternet.js): only
// with «Seguir conectado», for the campus student who is in and, over there, for whom it came (`de`). With the network
// it always asks first; without it, or when the request never got there, what was kept shows and the strip says since
// when. Offline nothing goes out.

/** The browser says there is no network. */
export const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;

const puedeLeer = () => {
  const token = tokenActual();
  return token && sesionRecordada() && !esDemo(token) ? token : null;
};

/** What was kept under `nombre` for `de`, as it came (null if nothing): shown, so the strip says since when. */
export async function loGuardado(nombre, de = '') {
  const token = puedeLeer();
  if (!token) return null;
  const r = await recuperarAparte(nombre, token, de);
  if (!r) return null;
  mostroGuardado(r.cuando);
  return r.datos;
}

/** `traer()` from the network, and what it brings is kept under `nombre` for `de` (a string, or null: then nothing is
 * kept nor read). When it fails and `esRed(error)` says the request never got there, or offline (where it isn't even
 * tried), what was kept. Without it, the error, or `sinRedError()` offline. */
export async function conRespaldo(nombre, traer, { de = '', esRed = (e) => e?.codigo === 'red', sinRedError } = {}) {
  if (!sinRed()) {
    try {
      const datos = await traer();
      const quien = de === null ? null : quienGuarda();
      if (quien) recordarAparte(nombre, datos, { ...quien, de });
      return datos;
    } catch (error) {
      if (de === null || (!esRed(error) && !sinRed())) throw error;
      const guardado = await loGuardado(nombre, de);
      if (guardado === null) throw error;
      return guardado;
    }
  }
  const guardado = de === null ? null : await loGuardado(nombre, de);
  if (guardado !== null) return guardado;
  if (sinRedError) throw sinRedError();
  return traer();
}

/** A file brought from elsewhere (a summary of El Santo Resumen), kept under `direccion` within the same room as the
 * campus files (TOPE_ARCHIVOS): the next one brought takes its place. */
export function guardarArchivoAparte(direccion, blob) {
  const quien = quienGuarda();
  if (quien) guardarArchivoSinInternet(direccion, 'aparte', blob, quien);
}

/** That file as it was kept, or null. */
export async function archivoAparte(direccion) {
  const token = puedeLeer();
  if (!token) return null;
  return (await archivoGuardado(direccion, token))?.blob ?? null;
}
