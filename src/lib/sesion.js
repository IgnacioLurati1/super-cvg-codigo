import { useSyncExternalStore } from 'react';
import { ajustesActuales, cambiarAjustes } from './ajustes';
import { borrarCharlas } from './consultron/charlas';
import { borrarDescargas, soltarPeriodico } from './descargasFondo';
import { borrarCompartido } from './compartido';
import { borrarGuardadas } from './enVivo/guardadas';
import { olvidarVacios } from './hoyVacios';
import { esDemo } from './modoDemo';
import { avisarPestanas, dejarDeEstar, escucharPestanas, otrasPestanas } from './pestanas';
import { borrarPorMandar } from './porMandar';
import { borrarSinInternet, esFaltaDeConexion, mostroGuardado, olvidarEstadoSinRed, recordar, recuperar, recuperarTodas, respondioElCampus } from './sinInternet';
import { borrarEscritosGuardados } from './laboratorio/escritos';
import { borrarMapasDrive } from './mapasDrive';
import { borrarTextosPdf } from './textosPdf';

// The key lives only in this browser. By default it dies with the tab; "recordar" keeps it
// in this device until the student leaves. The password is never stored anywhere.
// Campus data stays in memory, and reaches the disk only with «recordar», for using it offline (sinInternet.js).
const CLAVE = 'cl.sesion';
const SALIDA = 'cl.salida';

const cache = new Map();
const enCamino = new Map();
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
let generacion = 0;
// When the generation last changed: an answer another tab started asking for before this moment is not taken.
let desdeGeneracion = 0;
const otraGeneracion = () => {
  generacion += 1;
  desdeGeneracion = Date.now();
};

const leer = () => {
  try {
    return sessionStorage.getItem(CLAVE) ?? localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
};

// The campus number of whoever is in, next to the key and gone with it: the same number the student's own things
// already carry in their names (cl.mio.<number>). With it, opening the site asks the campus everything at once, instead
// of waiting for the profile to ask for what needs the number.
const ALUMNO = 'cl.sesion.alumno';
const dondeEstaLaClave = () => (sessionStorage.getItem(CLAVE) !== null ? sessionStorage : localStorage);

// Each number goes with a mark of the key it came with (FNV-1a, next to that same key, so it tells nothing new): one
// left by another session (another tab signed in, or an answer that came after Salir) is never taken.
function marcaDe(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) h = Math.imul(h ^ token.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}
// What is kept under `nombre` for the key in use, or null.
function deEstaClave(nombre) {
  const token = leer();
  if (!token) return null;
  const [marca, valor] = (dondeEstaLaClave().getItem(nombre) ?? '').split(':');
  return marca === marcaDe(token) ? (valor ?? '') : null;
}
// Keeps `valor` for `token`, only while it is still the key in use.
function guardarParaLaClave(nombre, token, valor) {
  if (!token || token !== leer() || esDemo(token)) return;
  dondeEstaLaClave().setItem(nombre, `${marcaDe(token)}:${valor}`);
}

/** The campus number kept next to this key, or null. */
export function alumnoRecordado() {
  try {
    const n = Number(deEstaClave(ALUMNO) ?? NaN);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Keeps the campus number of whoever is in next to `token`, the key that asked for it (campus.js, when the profile
 * comes): nothing if the key changed meanwhile. */
export function recordarAlumno(id, token = leer()) {
  if (!Number.isSafeInteger(id) || id <= 0) return;
  try {
    guardarParaLaClave(ALUMNO, token, String(id));
  } catch {
    // Storage full or closed: the profile is waited for, as before.
  }
}

// The numbers of the courses in progress, next to the key the same way: only numbers, never a name. With them, Hoy
// asks for their contents in the first wave instead of waiting for the list of courses.
const CURSOS = 'cl.sesion.cursos';
const TOPE_DE_CURSOS = 30;
const numeroDeCurso = (n) => Number.isSafeInteger(n) && n > 0;

/** The course numbers kept next to this key, or [] . */
export function cursosRecordados() {
  try {
    const lista = (deEstaClave(CURSOS) ?? '').split(',').filter(Boolean).map(Number);
    return lista.every(numeroDeCurso) ? lista.slice(0, TOPE_DE_CURSOS) : [];
  } catch {
    return [];
  }
}

/** Keeps the numbers of the courses in progress next to `token`, the key that asked for them (campus.js). */
export function recordarCursos(ids, token = leer()) {
  if (!Array.isArray(ids) || !ids.every(numeroDeCurso)) return;
  try {
    guardarParaLaClave(CURSOS, token, ids.slice(0, TOPE_DE_CURSOS).join(','));
  } catch {
    // Storage full or closed: Hoy waits for the list of courses, as before.
  }
}

function olvidarAlumno() {
  for (const nombre of [ALUMNO, CURSOS]) {
    sessionStorage.removeItem(nombre);
    localStorage.removeItem(nombre);
  }
}

/** A request that started before this point can no longer write to the cache or be shared. */
export function vaciarCache() {
  otraGeneracion();
  cache.clear();
  guardadas.clear();
  hidratacion = null;
  saludo = null;
  dejarDeEstar();
  for (const nombre of [...ajenos.keys()]) cerrarAjeno(nombre, null);
  olvidarEstadoSinRed();
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
  olvidarDescargas();
  olvidarAlumno();
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
  olvidarAlumno();
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
  // And what was kept of the campus to use it offline (sinInternet.js).
  borrarSinInternet();
  // And the messages waiting for the signal (porMandar.js), in this tab and in the database.
  borrarPorMandar();
  // And what another app shared that wasn't placed yet (compartido.js).
  borrarCompartido();
  // And the night downloads (descargas.js): the key kept for the worker goes, Chrome stops waking it, and the setting
  // goes off in this device, so whoever comes in next doesn't find it on.
  olvidarDescargas();
  if (ajustesActuales().descargas) cambiarAjustes({ descargas: false });
  avisar();
}

// The key of the night downloads is this key only: a new one, or none, takes it away (descargas.js keeps the new one if
// the setting is on).
function olvidarDescargas() {
  borrarDescargas().then(soltarPeriodico, () => {});
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
  // Showing what was kept never forgets anything: what does is a real request, and that one comes right after.
  if (pasada) {
    pasada.falto = true;
    return;
  }
  const toca = (clave) => nombres.some((n) => (n.endsWith('.') ? clave.startsWith(n) : clave === n));
  otraGeneracion();
  for (const clave of [...cache.keys()]) if (toca(clave)) cache.delete(clave);
  for (const clave of [...enCamino.keys()]) if (toca(clave)) enCamino.delete(clave);
  // Nor what came from the disk: forgotten is forgotten, also for the screens that show what was kept at once.
  for (const clave of [...guardadas.keys()]) if (toca(clave)) guardadas.delete(clave);
}

/** What a cached answer already holds, without asking: undefined when it isn't there. */
export const enCache = (nombre) => cache.get(nombre)?.datos;

// The campus number of whoever is in, from the profile already brought: what is kept for offline is kept for them.
const alumnoDe = (nombre, datos) => (nombre === 'perfil' ? datos?.id : cache.get('perfil')?.datos?.id ?? alumnoRecordado());

/** Whose disk it is, for what is kept for offline outside conCache (respaldo.js): { token, alumno } with «Seguir
 * conectado» and the profile already here, or null (the sample mode keeps nothing). */
export function quienGuarda() {
  const token = leer();
  const alumno = cache.get('perfil')?.datos?.id ?? guardadas.get('perfil')?.datos?.id ?? alumnoRecordado();
  if (!token || !alumno || !sesionRecordada() || esDemo(token)) return null;
  return { token, alumno };
}

/** Runs `fn` once per `minutos`, so the campus server does not repeat the same work. With «Seguir conectado» the answer
 * is also kept in this browser (sinInternet.js); without internet, or with the campus down, what was brought last shows
 * instead: from the memory of the tab, or from the disk. The other tabs of the session get each answer, and while one
 * asks for something the others wait for its answer instead of asking again (pestanas.js). */
export async function conCache(nombre, minutos, fn) {
  // Drawing a screen from what was kept (desdeLoGuardado): never the campus, whatever its age.
  if (pasada) {
    const guardado = cache.get(nombre) ?? guardadas.get(nombre);
    if (guardado) return guardado.datos;
    pasada.falto = true;
    throw new SinGuardar();
  }
  const guardado = cache.get(nombre);
  if (guardado && Date.now() - guardado.cuando < minutos * 60_000) return guardado.datos;
  // Two screens asking at once share one request.
  if (enCamino.has(nombre)) return enCamino.get(nombre);
  const nacida = generacion;
  const token = leer();
  const pedido = (async () => {
    // The first time, what the other tabs of the session already have.
    if (saludo !== LISTO) {
      await saludar();
      const recibida = cache.get(nombre);
      if (nacida === generacion && recibida && recibida !== guardado && Date.now() - recibida.cuando < minutos * 60_000) return recibida.datos;
    }
    // Another tab of the session is asking for the same thing: its answer, if it comes in time.
    const deOtra = async () => {
      const ajena = await esperarAjena(nombre);
      return ajena && nacida === generacion && cache.get(nombre) === ajena ? ajena : null;
    };
    const yaPedida = ajenos.has(nombre) ? await deOtra() : null;
    if (yaPedida) {
      respondioElCampus();
      return yaPedida.datos;
    }
    const desde = Date.now();
    const compartida = Boolean(token) && compartible(nombre);
    if (compartida) {
      avisarPestanas(token, PIDIENDO, { nombre, desde, de: YO });
      // With other tabs open, two that start together (the same answer let both go on) agree on who asks: the first
      // one, or the lower mark when both started in the same millisecond.
      if (hayOtras) {
        await new Promise((ok) => setTimeout(ok, DESEMPATE));
        const otra = ajenos.get(nombre);
        if (otra && (otra.desde < desde || (otra.desde === desde && otra.de < YO))) {
          const suya = await deOtra();
          if (suya) {
            respondioElCampus();
            return suya.datos;
          }
        }
      }
    }
    let datos;
    try {
      datos = await fn();
    } catch (error) {
      if (compartida) avisarPestanas(token, FALLO, { nombre });
      if (!esFaltaDeConexion(error) || nacida !== generacion) throw error;
      if (guardado) {
        mostroGuardado(guardado.cuando);
        return guardado.datos;
      }
      const deDisco = await recuperar(nombre, token);
      if (!deDisco || nacida !== generacion) throw error;
      // In memory with the time it was brought: the next screen that needs it asks the campus again.
      cache.set(nombre, { cuando: deDisco.cuando, datos: deDisco.datos });
      mostroGuardado(deDisco.cuando);
      return deDisco.datos;
    }
    if (nacida === generacion) {
      const cuando = Date.now();
      cache.set(nombre, { cuando, datos });
      guardadas.delete(nombre);
      respondioElCampus();
      // A tab that lost the agreement here asked nothing more: nobody else is asking for it now.
      cerrarAjeno(nombre, cache.get(nombre));
      if (compartida) avisarPestanas(token, RESPUESTA, { nombre, cuando, desde, datos });
      if (sesionRecordada() && !esDemo(token)) recordar(nombre, datos, { token, alumno: alumnoDe(nombre, datos), cuando });
    } else if (compartida) {
      avisarPestanas(token, FALLO, { nombre });
    }
    return datos;
  })().finally(() => {
    if (enCamino.get(nombre) === pedido) enCamino.delete(nombre);
  });
  enCamino.set(nombre, pedido);
  return pedido;
}

// ---------- The tabs of the session (pestanas.js) ----------

const PIDIENDO = 'campus.pidiendo';
const RESPUESTA = 'campus.respuesta';
const FALLO = 'campus.fallo';
/** How long a tab waits for what another one is asking for, before asking itself. */
export const ESPERA_AJENA = 10_000;
// The pictures are addresses of the tab that brought them (blob:), which die with it.
const compartible = (nombre) => !String(nombre).startsWith('foto.');
// What other tabs are asking for: until when to wait, who is waiting, and when and which tab started it.
const ajenos = new Map();
// This tab, to break a tie with another that started asking in the same millisecond.
const YO = Math.random().toString(36).slice(2);
/** How long a tab waits, with others open, to know whether another started asking the same before it. */
export const DESEMPATE = 50;
// Whether another tab of the session showed up: only then is the tie worth breaking.
let hayOtras = false;

function esperarAjena(nombre) {
  const ajeno = ajenos.get(nombre);
  if (!ajeno) return Promise.resolve(null);
  return new Promise((ok) => {
    let reloj = null;
    const terminar = (r) => {
      clearTimeout(reloj);
      ajeno.esperas.delete(terminar);
      ok(r);
    };
    reloj = setTimeout(() => terminar(null), Math.max(0, ajeno.hasta - Date.now()));
    ajeno.esperas.add(terminar);
  });
}

function cerrarAjeno(nombre, r) {
  const ajeno = ajenos.get(nombre);
  if (!ajeno) return;
  ajenos.delete(nombre);
  ajeno.esperas.forEach((f) => f(r));
}

escucharPestanas(PIDIENDO, leer, ({ nombre, desde, de }) => {
  hayOtras = true;
  if (typeof nombre !== 'string' || !Number.isFinite(desde) || desde < desdeGeneracion) return;
  const ajeno = ajenos.get(nombre) ?? { esperas: new Set() };
  // The first one asking is the one waited for.
  if (!ajenos.has(nombre) || desde < ajeno.desde || (desde === ajeno.desde && String(de) < ajeno.de)) {
    ajeno.desde = desde;
    ajeno.de = String(de ?? '');
  }
  ajeno.hasta = Date.now() + ESPERA_AJENA;
  ajenos.set(nombre, ajeno);
});

escucharPestanas(RESPUESTA, leer, ({ nombre, cuando, desde, datos }) => {
  if (typeof nombre !== 'string' || !Number.isFinite(cuando) || datos === undefined) return;
  // Asked before this tab forgot it, or before this session started here: not taken.
  if (!Number.isFinite(desde) || desde < desdeGeneracion) return cerrarAjeno(nombre, null);
  const actual = cache.get(nombre);
  if (!actual || actual.cuando < cuando) {
    cache.set(nombre, { cuando, datos });
    guardadas.delete(nombre);
  }
  cerrarAjeno(nombre, cache.get(nombre));
});

escucharPestanas(FALLO, leer, ({ nombre }) => {
  if (typeof nombre === 'string') cerrarAjeno(nombre, null);
});

// A tab that opens asks the others of the session for what they have, once, before its first request. Each answer goes
// with the time it came, so the window of each screen counts from then.
const HOLA = 'campus.hola';
const ENTREGA = 'campus.entrega';
const ENTREGADO = 'campus.entregado';
/** How long a tab that opens waits for what the others have, when there are others. */
export const ESPERA_SALUDO = 250;
const LISTO = Promise.resolve();
let saludo = null;
let alSaludar = null;

function saludar() {
  if (saludo) return saludo;
  const nacida = generacion;
  const token = leer();
  const este = (async () => {
    const otras = await otrasPestanas(token);
    if (otras) hayOtras = true;
    if (!otras || nacida !== generacion) return;
    await new Promise((ok) => {
      const reloj = setTimeout(ok, ESPERA_SALUDO);
      alSaludar = () => {
        clearTimeout(reloj);
        ok();
      };
      avisarPestanas(token, HOLA, {});
    });
    alSaludar = null;
  })().catch(() => {});
  saludo = este;
  este.then(() => {
    if (saludo === este) saludo = LISTO;
  });
  return este;
}

escucharPestanas(HOLA, leer, (m, token) => {
  hayOtras = true;
  for (const [nombre, { cuando, datos }] of cache) {
    if (compartible(nombre)) avisarPestanas(token, ENTREGA, { nombre, cuando, desde: cuando, datos });
  }
  // And what it is asking for right now: the new tab waits for it instead of asking too.
  for (const nombre of enCamino.keys()) if (compartible(nombre)) avisarPestanas(token, PIDIENDO, { nombre, desde: Date.now(), de: YO });
  avisarPestanas(token, ENTREGADO, {});
});

escucharPestanas(ENTREGA, leer, ({ nombre, cuando, datos }) => {
  if (typeof nombre !== 'string' || !Number.isFinite(cuando) || datos === undefined || cuando < desdeGeneracion) return;
  const actual = cache.get(nombre);
  if (!actual || actual.cuando < cuando) {
    cache.set(nombre, { cuando, datos });
    guardadas.delete(nombre);
  }
});

// The first tab that finished handing over is enough.
escucharPestanas(ENTREGADO, leer, () => alSaludar?.());

// A tab that closes while asking lets the others know, so they don't wait for nothing.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const token = leer();
    for (const nombre of enCamino.keys()) if (compartible(nombre)) avisarPestanas(token, FALLO, { nombre });
  });
}

// ---------- What was kept, at once (useConsulta with `alInstante`) ----------

// The answers of the disk (sinInternet.js), brought to memory once per session so drawing them needs no wait. Only what
// isn't in `cache`, and each one goes as soon as the campus answers it.
const guardadas = new Map();
let hidratacion = null;
const alHidratarse = new Set();
// The pass that draws a screen from what was kept, while it runs: conCache answers from memory, never from the campus.
let pasada = null;

class SinGuardar extends Error {
  constructor() {
    super('Sin guardar');
    this.codigo = 'sin_guardar';
  }
}

/** True while a screen is drawn from what was kept: nothing is asked and nothing changes. */
export const enLoGuardado = () => pasada !== null;

/** For what asks the campus without conCache: during that pass it does not go out. */
export function exigirCampus() {
  if (!pasada) return;
  pasada.falto = true;
  throw new SinGuardar();
}

/** `fn(guardadas)` once the answers of the disk are in memory (campus.js sets the student with them). */
export function alHidratar(fn) {
  alHidratarse.add(fn);
  return () => alHidratarse.delete(fn);
}

function hidratar() {
  if (hidratacion) return hidratacion;
  const nacida = generacion;
  const token = leer();
  const delDisco = token && sesionRecordada() && !esDemo(token) ? recuperarTodas(token) : Promise.resolve([]);
  hidratacion = delDisco.then((todas) => {
    if (nacida !== generacion) return;
    for (const [nombre, r] of todas) if (!cache.has(nombre) && !guardadas.has(nombre)) guardadas.set(nombre, r);
    if (todas.length) alHidratarse.forEach((f) => f(guardadas));
  }, () => {});
  return hidratacion;
}

// Each pass in a task of its own: when it starts nothing else is waiting to run, so while it lasts only its own steps
// run, and no other caller of conCache can get what was kept in place of what it asked for.
const fila = [];
let mensajero = null;
function enTareaAparte(fn) {
  if (typeof MessageChannel === 'undefined') {
    setTimeout(fn, 0);
    return;
  }
  if (!mensajero) {
    mensajero = new MessageChannel();
    mensajero.port1.onmessage = () => fila.shift()?.();
  }
  fila.push(fn);
  mensajero.port2.postMessage(null);
}

/** How many steps a pass gets: one that waits on something other than memory ends there, inside the same task. */
const PASOS = 2000;

/** What `fn` gives with only what was kept (in memory past its time, or from the disk), without asking anyone: { datos },
 * or null when something it needs isn't kept, it fails, or `sigue()` says it's no longer needed. */
export function desdeLoGuardado(fn, sigue = () => true) {
  const nacida = generacion;
  return hidratar().then(() => new Promise((ok) => {
    enTareaAparte(() => {
      if (nacida !== generacion || pasada || !sigue() || (!cache.size && !guardadas.size)) {
        ok(null);
        return;
      }
      const esta = { falto: false };
      let listo = false;
      const terminar = (r) => {
        if (listo) return;
        listo = true;
        if (pasada === esta) pasada = null;
        ok(r);
      };
      pasada = esta;
      let resultado;
      try {
        resultado = Promise.resolve(fn());
      } catch (error) {
        resultado = Promise.reject(error);
      }
      resultado.then((datos) => terminar(esta.falto ? null : { datos }), () => terminar(null));
      let pasos = 0;
      const vigilar = () => {
        if (listo) return;
        if (++pasos >= PASOS) terminar(null);
        else queueMicrotask(vigilar);
      };
      queueMicrotask(vigilar);
    });
  }));
}
