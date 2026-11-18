import { useSyncExternalStore } from 'react';
import { borrarCharlas } from './consultron/charlas';
import { borrarGuardadas } from './enVivo/guardadas';
import { olvidarVacios } from './hoyVacios';
import { borrarEscritosGuardados } from './laboratorio/escritos';
import { borrarMapasDrive } from './mapasDrive';
import { borrarTextosPdf } from './textosPdf';

// The key lives only in this browser. By default it dies with the tab; "recordar" keeps it
// in this device until the student leaves. The password is never stored anywhere.
// Campus data stays in memory only, so grades and courses never reach the disk.
const CLAVE = 'cl.sesion';
const SALIDA = 'cl.salida';

const cache = new Map();
const enCamino = new Map();
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
let generacion = 0;

const leer = () => {
  try {
    return sessionStorage.getItem(CLAVE) ?? localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
};

/** A request that started before this point can no longer write to the cache or be shared. */
export function vaciarCache() {
  generacion += 1;
  cache.clear();
  enCamino.clear();
  olvidarVacios();
}

// The Google account of the previous student (google.js) does not carry over to whoever comes in.
function olvidarCuentaGoogle() {
  sessionStorage.removeItem('cl.google');
  localStorage.removeItem('cl.google');
  // And the uses it had on (Classroom, Drive).
  sessionStorage.removeItem('cl.google.usos');
  localStorage.removeItem('cl.google.usos');
}

// The Classroom permission (google.js) lives next to the key, in the tab or in this browser.
function olvidarPermisoGoogle() {
  sessionStorage.removeItem('cl.classroom');
  localStorage.removeItem('cl.classroom');
}

/** Whether the key of this tab outlives it («Seguir conectado»): it is in this browser, and not only in this tab. */
export const sesionRecordada = () => {
  try {
    return sessionStorage.getItem(CLAVE) === null && localStorage.getItem(CLAVE) !== null;
  } catch {
    return false;
  }
};

// With «Entrar con Google» (entrarConGoogle.js) the Google permission came first, in this tab: it stays, and goes where the key
// goes.
const DE_GOOGLE = ['cl.google', 'cl.google.usos', 'cl.classroom'];
function moverGoogle() {
  for (const k of DE_GOOGLE) {
    const v = sessionStorage.getItem(k);
    if (v === null) continue;
    localStorage.setItem(k, v);
    sessionStorage.removeItem(k);
  }
}

/** `conGoogle`: keeps the Google account and permission this tab got to come in (entrarConGoogle.js). */
export function iniciarSesion(token, { recordar = false, conGoogle = false } = {}) {
  vaciarCache();
  if (!conGoogle) {
    olvidarCuentaGoogle();
    olvidarPermisoGoogle();
  }
  (recordar ? localStorage : sessionStorage).setItem(CLAVE, token);
  if (conGoogle && recordar) {
    try {
      moverGoogle();
    } catch {
      // Not moved: it stays in this tab, and renews from there.
    }
  }
  avisar();
}

function borrarEstaPestana() {
  sessionStorage.removeItem(CLAVE);
  localStorage.removeItem(CLAVE);
  // The Classroom permission and its account go with the campus key.
  olvidarPermisoGoogle();
  olvidarCuentaGoogle();
  vaciarCache();
  // The text of the PDFs read (textosPdf.js), of every student: Salir closes every tab of this browser too.
  borrarTextosPdf();
  // And Consultron's saved talks (consultron/charlas.js), which have that text in them.
  borrarCharlas();
  // The chat of Consultron in «Código» (consultron/agente.js, CLAVE_AGENTE), named here so this stays light.
  sessionStorage.removeItem('cl.agente');
  // And the kept live sessions (enVivo/guardadas.js), with their codes.
  borrarGuardadas();
  // And the maps of the Drive folders (mapasDrive.js), which say which folders the student added.
  borrarMapasDrive();
  // And what the programs of the lab wrote (laboratorio/escritos.js): the copy in Drive brings it back.
  borrarEscritosGuardados();
  avisar();
}

export function cerrarSesion() {
  borrarEstaPestana();
  // The storage event reaches every other tab, also the ones with their own sessionStorage.
  try {
    localStorage.setItem(SALIDA, String(Date.now()));
    localStorage.removeItem(SALIDA);
  } catch {
    // Storage unavailable: other tabs find out on their next request.
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (evento) => {
    if (evento.key === SALIDA && evento.newValue) borrarEstaPestana();
  });
}

export const tokenActual = leer;

export function useToken() {
  return useSyncExternalStore((f) => {
    avisados.add(f);
    return () => avisados.delete(f);
  }, leer, () => null);
}

/** Drops some cached answers, so the next screen that needs them asks the campus again: each name as is, or every
 * name that starts with it when it ends in a dot («mes.»). A request already on its way no longer writes to the cache. */
export function olvidar(nombres) {
  const toca = (clave) => nombres.some((n) => (n.endsWith('.') ? clave.startsWith(n) : clave === n));
  generacion += 1;
  for (const clave of [...cache.keys()]) if (toca(clave)) cache.delete(clave);
  for (const clave of [...enCamino.keys()]) if (toca(clave)) enCamino.delete(clave);
}

/** What a cached answer already holds, without asking: undefined when it isn't there. */
export const enCache = (nombre) => cache.get(nombre)?.datos;

/** Runs `fn` once per `minutos`, so the campus server does not repeat the same work. */
export async function conCache(nombre, minutos, fn) {
  const guardado = cache.get(nombre);
  if (guardado && Date.now() - guardado.cuando < minutos * 60_000) return guardado.datos;
  // Two screens asking at once share one request.
  if (enCamino.has(nombre)) return enCamino.get(nombre);
  const nacida = generacion;
  const pedido = (async () => {
    const datos = await fn();
    if (nacida === generacion) cache.set(nombre, { cuando: Date.now(), datos });
    return datos;
  })().finally(() => {
    if (enCamino.get(nombre) === pedido) enCamino.delete(nombre);
  });
  enCamino.set(nombre, pedido);
  return pedido;
}
