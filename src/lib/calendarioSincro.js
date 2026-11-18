// «Vincular Google Calendar»: Super CVG creates a calendar called «Super CVG» in the student's Google Calendar (gcal.js)
// and both work as one calendar (calendarioGoogle.js plans it). The campus' dates of the next 60 days, the faculty's
// academic calendar from today on (while it shows in Calendario) and the student's own dates go there; what the student
// writes, changes or deletes there comes back as a date of their own. The campus' and the faculty's dates only go.
// Nothing goes through Luta Studios, and there is no server. The campus is asked once per visit; Google, a few seconds
// after the student changes a date of their own, on coming back to the tab and every few minutes while it is in view.
// Which calendar is the student's goes in a small file of the hidden folder of Super CVG in their Drive, so another
// device with the same Google account uses the same one. Here, per campus student: that id, the Google account, when
// it last caught up, and per date of the calendar only its id and two fingerprints (how both sides were the last time
// they agreed) and when it changed here. Nothing of the campus.
import { useSyncExternalStore } from 'react';
import { ajustesActuales, escucharAjustes } from './ajustes';
import { deGoogle, eventoParaGoogle, huellaGoogle, idDeGoogle, idEnGoogle, materiaEnTitulo, origenDeId, planear, ZONA } from './calendarioGoogle';
import { cargarMes, cargarNombres } from './campus';
import { claveDia, huella } from './datos';
import { clienteDrive } from './drive';
import { clienteCalendario } from './gcal';
import { esHecha } from './hechas';
import { conectarGoogle, cuentaGoogle, disponibleGoogle, escucharGoogle, mailGoogle, permisoGoogle, pistaDeCuenta, quererGoogle, renovarGoogle, soltarGoogle, usarGoogle } from './google';
import { cambiarMio, conCorrecciones, escucharMio, eventosPropios, materiaDe, mioActual, usuarioActual } from './mio';
import { eventosDeLaFacultad } from './facultad';
import { esDemo } from './modoDemo';
import { tokenActual } from './sesion';

export const NOMBRE = 'Super CVG';
const DESCRIPCION = 'Tu calendario de Super CVG, con las fechas del campus, las de la facultad y las tuyas. Lo que cambiás acá en las tuyas también cambia en Super CVG.';
/** How far ahead the campus' dates go. */
export const DIAS = 60;
// A change to the student's own dates goes a moment later, with the next ones made right after it.
export const ESPERA_CAMBIOS_MS = 3000;
// Coming back to the tab after this long, or this often while it is in view, it asks Google what changed there.
export const VOLVER_MS = 60_000;
export const CADA_MS = 5 * 60_000;
// Coming in, it waits for the first screen to load before asking anything.
const ARRANQUE_MS = 3000;
const REINTENTO_MS = 60_000;
// Google takes a few at once.
const A_LA_VEZ = 4;
// When a date changed here is kept for a week: enough to tell which side changed last.
const TOCADO_MS = 7 * 86_400_000;
const MAX_BASE = 4000;
const PREFIJO = 'cl.gcal.';
export const archivoDeDrive = (alumno) => `super-cvg-calendario-${alumno}.json`;
const ID = /^[A-Za-z0-9._@-]{5,250}$/;
const ID_EVENTO = /^[A-Za-z0-9_@.-]{1,256}$/;
const HUELLA = /^[0-9a-z]{1,16}$/;

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
export const BORRADO = 'Borraste el calendario «Super CVG» de tu Google Calendar, así que se desvinculó.';
const NO_SE_PUDO = 'No se pudieron pasar tus fechas a Google Calendar. Se prueba de nuevo en un rato.';

// ----- What stays in this browser, per campus student: { prendido, calendario, cuenta, ultima, base, tocado, explicado }.
// `explicado`: the student already saw the explanation of a working link, so it shows only the first time.

function leerBase(v) {
  const base = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return base;
  for (const [id, par] of Object.entries(v).slice(0, MAX_BASE)) {
    if (ID_EVENTO.test(id) && Array.isArray(par) && par.length === 2 && (par[0] === null || HUELLA.test(par[0])) && HUELLA.test(par[1])) base[id] = [par[0], par[1]];
  }
  return base;
}

function leerTocado(v) {
  const tocado = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return tocado;
  for (const [id, cuando] of Object.entries(v).slice(0, MAX_BASE)) {
    if (ID_EVENTO.test(id) && Number.isSafeInteger(cuando) && cuando > 0) tocado[id] = cuando;
  }
  return tocado;
}

export function leerMarcas(alumno) {
  if (alumno === null || alumno === undefined) return null;
  try {
    const v = JSON.parse(localStorage.getItem(PREFIJO + alumno) ?? 'null');
    if (!v || typeof v !== 'object') return null;
    return {
      prendido: v.prendido === true,
      calendario: typeof v.calendario === 'string' && ID.test(v.calendario) ? v.calendario : null,
      cuenta: typeof v.cuenta === 'string' && /^\d{1,30}$/.test(v.cuenta) ? v.cuenta : null,
      ultima: Number.isFinite(v.ultima) ? v.ultima : 0,
      base: leerBase(v.base),
      tocado: leerTocado(v.tocado),
      explicado: v.explicado === true,
    };
  } catch {
    return null;
  }
}

function guardarMarcas(alumno, marcas) {
  try {
    localStorage.setItem(PREFIJO + alumno, JSON.stringify(marcas));
  } catch {
    // Without room it still works in this tab; the next visit asks to link again.
  }
}

/** The explanation of a working link was seen: it stays with the link, so unlinking and Salir forget it too. */
export function anotarExplicado() {
  const alumno = usuarioActual();
  const marcas = leerMarcas(alumno);
  if (marcas?.prendido && !marcas.explicado) guardarMarcas(alumno, { ...marcas, explicado: true });
}

// ----- The state of this tab: 'apagado', 'ventana' (Google's window is open), 'conectando', 'pasando', 'listo', 'sin-conexion', 'reconectar', 'error' or
// 'borrado' (the student deleted the calendar in Google). When it last caught up is in the marks, so every tab sees it.

const VACIO = { fase: 'apagado', error: '' };
let estado = VACIO;
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
const poner = (cambios) => {
  estado = { ...estado, ...cambios };
  avisar();
};

async function clienteAhora() {
  if (import.meta.env.DEV && esDemo(tokenActual())) {
    const { clienteDemoCalendario } = await import('./demoCalendario');
    return permisoGoogle('calendario') ? clienteDemoCalendario() : null;
  }
  if (!permisoGoogle('calendario') && (!(await renovarGoogle()) || !permisoGoogle('calendario'))) return null;
  return clienteCalendario({ token: () => permisoGoogle('calendario') });
}

// The small file in Drive with which calendar it is. Without the Drive part of the permission (the student left it
// unmarked), or in the demo, there is none: it works on this device only.
const driveDelCalendario = () => (esDemo(tokenActual()) ? null : clienteDrive({ token: () => permisoGoogle('calendario') }));

async function idDeDrive(alumno) {
  const drive = driveDelCalendario();
  if (!drive) return null;
  try {
    const [archivo] = await drive.listar({ nombre: archivoDeDrive(alumno) });
    if (!archivo) return null;
    const datos = await (await drive.bajar(archivo.id)).json();
    return typeof datos?.calendario === 'string' && ID.test(datos.calendario) ? datos.calendario : null;
  } catch {
    return null;
  }
}

async function guardarIdEnDrive(alumno, id) {
  const drive = driveDelCalendario();
  if (!drive) return;
  try {
    const [archivo] = await drive.listar({ nombre: archivoDeDrive(alumno) });
    const blob = new Blob([JSON.stringify({ tipo: 'super-cvg-calendario', version: 1, calendario: id })], { type: 'application/json' });
    await drive.subir({ id: archivo?.id ?? null, nombre: archivoDeDrive(alumno), blob });
  } catch {
    // Without it, another device creates its own calendar.
  }
}

async function borrarIdDeDrive(alumno) {
  const drive = driveDelCalendario();
  if (!drive) return;
  try {
    for (const archivo of await drive.listar({ nombre: archivoDeDrive(alumno) })) await drive.borrar(archivo.id);
  } catch {
    // It points to a calendar that is gone: the next link makes a new one and writes over it.
  }
}

/** The student's calendar: the one this device knows, or the one another device left in Drive, if it is still there.
 * Otherwise a new one. */
async function calendarioDe(alumno, cal) {
  const conocidos = [...new Set([leerMarcas(alumno)?.calendario, await idDeDrive(alumno)].filter(Boolean))];
  for (const id of conocidos) {
    try {
      await cal.mirar(id);
      await guardarIdEnDrive(alumno, id);
      return id;
    } catch (e) {
      if (e.codigo !== 'no-existe') throw e;
    }
  }
  const id = await cal.crear({ nombre: NOMBRE, descripcion: DESCRIPCION, zona: ZONA });
  await guardarIdEnDrive(alumno, id);
  return id;
}

// One at a time, also among the tabs of this browser.
const enFila = (fn) => (typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request('super-cvg-calendario', fn) : fn());

async function enTandas(tareas) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, tareas.length) }, async () => {
    while (i < tareas.length) await tareas[i++]();
  }));
}

// The courses' names, from the last time the campus was asked: the runs that only ask Google use them.
let nombresVistos = null;

/** The student's own dates as events of the calendar, by id, with where each one is here. Also the ids of the ones that
 * are out of it on purpose: a task done. */
function propiosAhora(nombres) {
  const mio = mioActual();
  const eventos = new Map();
  const origenes = new Map();
  for (const e of eventosPropios(mio, nombres)) {
    const evento = eventoParaGoogle(e);
    eventos.set(evento.id, evento);
    origenes.set(evento.id, e);
  }
  const fuera = new Set();
  for (const [id, m] of Object.entries(mio.materias)) {
    for (const t of m.tareas) if (t.hecha && t.fecha) fuera.add(idEnGoogle({ propio: 'tarea', id: `t${id}-${t.id}` }));
  }
  return { eventos, origenes, fuera };
}

/** What Super CVG has now: the campus' dates from today on, for DIAS days (only `conCampus`), the academic calendar
 * from today on (if it shows in Calendario) and every own date. */
export async function deseadosAhora({ ahora = new Date(), conCampus = true } = {}) {
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const desde = hoy.getTime() / 1000;
  const campus = [];
  let nombres = nombresVistos ?? {};
  if (conCampus) {
    const hasta = desde + DIAS * 86_400;
    const meses = [0, 1, 2].map((i) => new Date(hoy.getFullYear(), hoy.getMonth() + i, 1));
    const [listas, deCampus] = await Promise.all([Promise.all(meses.map((d) => cargarMes(d.getFullYear(), d.getMonth() + 1))), cargarNombres()]);
    nombres = deCampus;
    nombresVistos = deCampus;
    const vistos = new Map();
    // As the student left them: one deleted here goes away from Google too, one corrected goes corrected. One marked as
    // done (hechas.js) goes away, like a task of the student's done.
    const mio = mioActual();
    for (const e of conCorrecciones(listas.flat(), mio, deCampus)) if (e.cuando >= desde && e.cuando < hasta && !esHecha(mio, e)) vistos.set(e.id, e);
    campus.push(...[...vistos.values()].map((e) => eventoParaGoogle(e)));
  }
  const facultad = new Map();
  if (ajustesActuales().facultad) {
    for (const e of eventosDeLaFacultad()) {
      if (e.cuando < desde) continue;
      const evento = eventoParaGoogle(e);
      facultad.set(evento.id, evento);
    }
  }
  const propios = propiosAhora(nombres);
  return { deseados: [...campus, ...facultad.values(), ...propios.eventos.values()], desde, nombres, ...propios };
}

const enMateria = (mio, id, fn) => ({ ...mio, materias: { ...mio.materias, [id]: fn(materiaDe(mio, id)) } });

/** What Google brought, saved as the student's own dates. */
export function aplicarTraidos(mio, traidos, { origenes, nombres }) {
  let nuevo = mio;
  for (const { id, como, remoto } of traidos) {
    const origen = origenes.get(id);
    const datos = remoto ? deGoogle(remoto, { nombres, materia: origen ? materiaEnTitulo(origen) : null }) : null;
    if (como !== 'borrado' && !datos) continue;
    const quien = origen ?? origenDeId(id) ?? { propio: 'google' };
    const [materia, numero] = quien.propio === 'tarea' || quien.propio === 'fecha'
      ? (origen ? origen.id.slice(1).split('-').map(Number) : [quien.materiaId, quien.id])
      : [null, null];
    if (quien.propio === 'evento') {
      const eventoId = origen ? origen.eventoId : quien.id;
      const viejo = nuevo.eventos.find((e) => e.id === eventoId);
      const resto = nuevo.eventos.filter((e) => e.id !== eventoId);
      if (como === 'borrado') nuevo = { ...nuevo, eventos: resto };
      else nuevo = { ...nuevo, eventos: [...resto, { materiaId: null, ...viejo, ...datos, ...(viejo ? { tipo: viejo.tipo } : {}), id: eventoId }] };
    } else if (quien.propio === 'tarea') {
      nuevo = enMateria(nuevo, materia, (m) => {
        const viejo = m.tareas.find((t) => t.id === numero);
        // A task out of the calendar is a task without a day: it stays among the course's tasks.
        if (como === 'borrado') return { ...m, tareas: m.tareas.map((t) => (t.id === numero ? { ...t, fecha: null } : t)) };
        const tarea = { hecha: false, ...viejo, id: numero, texto: datos.titulo, fecha: claveDia(datos.cuando) };
        return { ...m, tareas: viejo ? m.tareas.map((t) => (t.id === numero ? tarea : t)) : [...m.tareas, tarea] };
      });
    } else if (quien.propio === 'fecha') {
      nuevo = enMateria(nuevo, materia, (m) => {
        const resto = m.fechas.filter((f) => f.id !== numero);
        if (como === 'borrado') return { ...m, fechas: resto };
        return { ...m, fechas: [...resto, { id: numero, titulo: datos.titulo, cuando: datos.cuando, sinHora: datos.sinHora }] };
      });
    } else if (como !== 'borrado') {
      // Born in Google: a date of the student's own that keeps its id there.
      const eventoId = idDeGoogle(id);
      nuevo = { ...nuevo, eventos: [...nuevo.eventos.filter((e) => e.id !== eventoId), { materiaId: null, ...datos, id: eventoId, gid: id }] };
    }
  }
  return nuevo;
}

// While what came from Google is saved, the change is not taken as one of the student's.
let guardandoTraidos = false;

/** One catch-up: reads the calendar, works out what changed on each side and passes only that to the other. */
export async function unaVuelta(alumno, cal, { conCampus = true } = {}) {
  const marcas = leerMarcas(alumno);
  if (!marcas?.prendido || !marcas.calendario) return;
  let existentes;
  try {
    existentes = await cal.eventos(marcas.calendario);
  } catch (e) {
    if (e.codigo === 'no-existe') throw falla(BORRADO, 'borrado');
    throw e;
  }
  const { deseados, desde, nombres, origenes, fuera } = await deseadosAhora({ conCampus });
  if (usuarioActual() !== alumno || !leerMarcas(alumno)?.prendido) return;
  const plan = planear({ deseados, existentes, base: marcas.base, tocado: marcas.tocado, desde, conCampus, fuera });
  const base = { ...plan.base };
  // One Google doesn't take, or that went away meanwhile, is looked at again next time; the rest goes on.
  const salvo = (id) => (e) => {
    if (e.codigo !== 'rechazado' && e.codigo !== 'no-existe') throw e;
    delete base[id];
  };
  await enTandas([
    ...plan.poner.map((evento) => () => cal.poner(marcas.calendario, evento, { nuevo: true }).catch(salvo(evento.id))),
    ...plan.cambiar.map((evento) => () => cal.cambiar(marcas.calendario, evento).catch(salvo(evento.id))),
    ...plan.quitar.map((id) => () => cal.quitar(marcas.calendario, id)),
  ]);
  if (usuarioActual() !== alumno) return;
  if (plan.traer.length) {
    guardandoTraidos = true;
    try {
      cambiarMio((mio) => aplicarTraidos(mio, plan.traer, { origenes, nombres }));
    } finally {
      guardandoTraidos = false;
    }
    // What came is compared from now on as it was saved here; what couldn't be saved is looked at again next time.
    const { eventos } = propiosAhora(nombres);
    for (const { id, como } of plan.traer) {
      if (como === 'borrado') continue;
      if (eventos.has(id)) base[id] = [huellaGoogle(eventos.get(id)), base[id][1]];
      else delete base[id];
    }
  }
  const ahora = leerMarcas(alumno);
  if (!ahora?.prendido || ahora.calendario !== marcas.calendario) return;
  const vigentes = Object.entries(ahora.tocado).filter(([, cuando]) => Date.now() - cuando < TOCADO_MS);
  guardarMarcas(alumno, { ...ahora, base, tocado: Object.fromEntries(vigentes) });
}

let reloj = null;
let corriendo = false;
let otraVez = false;
// The campus is asked once per visit: after that, the runs only ask Google.
let campusAlDia = false;
let ultimaVuelta = 0;
const programar = (ms) => {
  clearTimeout(reloj);
  reloj = setTimeout(correr, ms);
};

// Unlinked, nothing of it stays in this browser.
function apagarPorDentro(alumno) {
  try {
    localStorage.removeItem(PREFIJO + alumno);
  } catch {
    // Nothing stored.
  }
  quererGoogle('calendario', false);
  clearTimeout(reloj);
}

/** Catches up now (if it is linked). Resolves when it is done. `conCampus` asks the campus too; by default, only the
 * first time in the visit. */
export async function correr({ conCampus } = {}) {
  clearTimeout(reloj);
  const alumno = usuarioActual();
  const marcas = leerMarcas(alumno);
  if (!marcas?.prendido || !marcas.calendario || !tokenActual()) return;
  if (corriendo) {
    otraVez = true;
    return;
  }
  corriendo = true;
  ultimaVuelta = Date.now();
  const conElCampus = conCampus ?? (!campusAlDia || !nombresVistos);
  const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  try {
    if (sinRed()) {
      poner({ fase: 'sin-conexion', error: '' });
      return;
    }
    let cal = await clienteAhora();
    if (!cal) {
      poner({ fase: 'reconectar', error: '' });
      return;
    }
    if (estado.fase !== 'listo' || conElCampus) poner({ fase: 'pasando', error: '' });
    const huellaAntes = huellaPropia();
    const correccionesAntes = huellaCorrecciones();
    try {
      await enFila(() => unaVuelta(alumno, cal, { conCampus: conElCampus }));
    } catch (e) {
      if (e.codigo !== 'vencida') throw e;
      // Once more with a new permission, without asking anything.
      if (!(await renovarGoogle()) || !(cal = await clienteAhora())) {
        poner({ fase: 'reconectar', error: '' });
        return;
      }
      await enFila(() => unaVuelta(alumno, cal, { conCampus: conElCampus }));
    }
    if (conElCampus) {
      // A campus date corrected meanwhile sends the campus' dates again in the next run.
      campusAlDia = huellaCorrecciones() === correccionesAntes;
      vistaCorrecciones ??= correccionesAntes;
    }
    // What came from Google is already in step; a change of the student's made meanwhile goes in the next run.
    vistaPropia = otraVez ? huellaAntes : huellaPropia();
    vistosPorId = huellasPorId();
    const ahora = leerMarcas(alumno);
    if (ahora?.prendido) guardarMarcas(alumno, { ...ahora, ultima: Date.now() });
    poner({ fase: ahora?.prendido ? 'listo' : 'apagado', error: '' });
  } catch (e) {
    if (e.codigo === 'sin-red' && sinRed()) poner({ fase: 'sin-conexion', error: '' });
    else if (e.codigo === 'vencida') poner({ fase: 'reconectar', error: '' });
    else if (e.codigo === 'borrado') {
      apagarPorDentro(alumno);
      soltarGoogle('calendario');
      poner({ fase: 'borrado', error: BORRADO });
    } else {
      poner({ fase: 'error', error: e.codigo === 'ocupado' && e.message ? e.message : NO_SE_PUDO });
      programar(REINTENTO_MS);
    }
  } finally {
    corriendo = false;
    if (otraVez) {
      otraVez = false;
      programar(500);
    }
  }
}

// Only a change of the student's own dates sends anything: a note or a section moved does not. A campus date corrected
// or deleted here, or marked as done, sends the campus' dates again.
let vistaPropia = null;
let vistaCorrecciones = null;
const huellaCorrecciones = () => huella(JSON.stringify([mioActual().campus ?? {}, mioActual().hechas ?? {}]));
const huellaPropia = () => huella(JSON.stringify(eventosPropios(mioActual()).map((e) => [e.id, e.titulo, e.cuando, e.sinHora, e.tipo ?? '', e.materiaId ?? 0])));
// Each own date as it was last seen, to note when it changed here.
let vistosPorId = null;
const huellasPorId = () => (nombresVistos ? new Map([...propiosAhora(nombresVistos).eventos].map(([id, e]) => [id, huellaGoogle(e)])) : null);

function anotarTocados(alumno) {
  const ahora = huellasPorId();
  const marcas = leerMarcas(alumno);
  if (!ahora || !marcas?.prendido) return;
  if (vistosPorId) {
    const tocado = { ...marcas.tocado };
    let hay = false;
    for (const id of new Set([...ahora.keys(), ...vistosPorId.keys()])) {
      if (ahora.get(id) !== vistosPorId.get(id)) {
        tocado[id] = Date.now();
        hay = true;
      }
    }
    if (hay) guardarMarcas(alumno, { ...marcas, tocado });
  }
  vistosPorId = ahora;
}

let alumnoVisto = null;
function alCambiarMio() {
  const alumno = usuarioActual();
  const marcas = leerMarcas(alumno);
  if (alumno !== alumnoVisto) {
    alumnoVisto = alumno;
    clearTimeout(reloj);
    vistaPropia = null;
    vistaCorrecciones = null;
    vistosPorId = null;
    nombresVistos = null;
    campusAlDia = false;
    estado = { ...VACIO, fase: marcas?.prendido ? 'listo' : 'apagado' };
    quererGoogle('calendario', Boolean(marcas?.prendido));
    avisar();
    if (marcas?.prendido) programar(ARRANQUE_MS);
    return;
  }
  const correcciones = huellaCorrecciones();
  const corrigio = correcciones !== vistaCorrecciones;
  vistaCorrecciones = correcciones;
  if (corrigio) campusAlDia = false;
  if (guardandoTraidos || !marcas?.prendido || (huellaPropia() === vistaPropia && !corrigio)) return;
  anotarTocados(alumno);
  if (corriendo) {
    otraVez = true;
    return;
  }
  if (estado.fase !== 'reconectar') programar(ESPERA_CAMBIOS_MS);
}

function alCambiarGoogle() {
  const marcas = leerMarcas(usuarioActual());
  if (marcas?.prendido && estado.fase === 'reconectar' && permisoGoogle('calendario') && !corriendo) programar(0);
  else avisar();
}

// What the student changed in Google shows here when they look: coming back to the tab, and every few minutes while it
// is in view. Only Google is asked.
function mirarGoogle(espera) {
  const marcas = leerMarcas(usuarioActual());
  if (!marcas?.prendido || corriendo || document.visibilityState !== 'visible' || Date.now() - ultimaVuelta < espera) return;
  if (['listo', 'error'].includes(estado.fase)) programar(0);
}

let arrancado = false;
/** Starts listening: on coming in, after each change of the student's own dates, when the connection comes back, and
 * to look at Google now and then. Once. */
export function arrancarCalendario() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  // While it is linked, a new session renews the permission for the same account without asking.
  pistaDeCuenta(() => {
    const m = leerMarcas(usuarioActual());
    return m?.prendido ? m.cuenta : null;
  });
  escucharMio(alCambiarMio);
  escucharGoogle(alCambiarGoogle);
  // The academic calendar turned on or off in Calendario: its dates come or go in Google too.
  let conFacultad = ajustesActuales().facultad;
  escucharAjustes(() => {
    if (ajustesActuales().facultad === conFacultad) return;
    conFacultad = ajustesActuales().facultad;
    if (!leerMarcas(usuarioActual())?.prendido || estado.fase === 'reconectar') return;
    if (corriendo) otraVez = true;
    else programar(ESPERA_CAMBIOS_MS);
  });
  document.addEventListener('visibilitychange', () => mirarGoogle(VOLVER_MS));
  setInterval(() => mirarGoogle(CADA_MS), VOLVER_MS);
  window.addEventListener('online', () => {
    if (leerMarcas(usuarioActual())?.prendido) programar(0);
  });
  window.addEventListener('offline', () => {
    if (leerMarcas(usuarioActual())?.prendido && !corriendo) poner({ fase: 'sin-conexion', error: '' });
  });
  // Another tab linked or unlinked it.
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith(PREFIJO)) avisar();
  });
  alCambiarMio();
}

/** Vincular. Call it straight from a click: if Google has to be asked, its window opens right away. Resolves once the
 * calendar is there, with `listo`: the first catch-up, which goes on by itself (its state is in useCalendarioGoogle). */
export async function vincularCalendario() {
  const alumno = usuarioActual();
  if (alumno === null) throw falla('Esperá a que carguen tus datos y probá de nuevo.', 'sin-alumno');
  if (permisoGoogle('calendario')) usarGoogle('calendario');
  else {
    // While Google's window is open: «Terminá en la ventana de Google».
    poner({ fase: 'ventana', error: '' });
    try {
      await conectarGoogle('calendario');
    } catch (e) {
      poner({ ...VACIO });
      throw e;
    }
  }
  if (usuarioActual() !== alumno) return { listo: Promise.resolve() };
  poner({ fase: 'conectando', error: '' });
  try {
    const cal = await clienteAhora();
    if (!cal) throw falla('Se cortó la conexión con Google. Probá de nuevo.', 'vencida');
    const id = await enFila(() => calendarioDe(alumno, cal));
    guardarMarcas(alumno, { prendido: true, calendario: id, cuenta: cuentaGoogle(), ultima: 0, base: {}, tocado: {} });
    quererGoogle('calendario', true);
  } catch (e) {
    poner({ ...VACIO });
    soltarGoogle('calendario');
    throw e;
  }
  poner({ fase: 'pasando', error: '' });
  return { listo: correr({ conCampus: true }) };
}

/** On a device that came in with «Entrar con Google» (entrarConGoogle.js), where it was linked: the same calendar,
 * for that student and account, without asking Google. It catches up once their things load, as a second device does. */
export function vincularCalendarioAlEntrar(alumno, calendario, cuenta) {
  if (leerMarcas(alumno)?.prendido) return;
  guardarMarcas(alumno, { prendido: true, calendario, cuenta, ultima: 0, base: {}, tocado: {} });
  quererGoogle('calendario', true);
}

/** After «Se cortó la conexión con Google»: Google's window, for the same account, and it catches up. */
export async function reconectarCalendario() {
  await conectarGoogle('calendario', { cuenta: leerMarcas(usuarioActual())?.cuenta ?? null });
  return correr();
}

/** Desvincular: deletes the calendar «Super CVG» from the student's Google, with everything in it, and stops. Their
 * dates stay here, also the ones that came from Google. Without a permission it can get on its own, it says so and
 * stays linked. */
export async function desvincularCalendario() {
  const alumno = usuarioActual();
  if (alumno === null) throw falla('Esperá a que carguen tus datos y probá de nuevo.', 'sin-alumno');
  const marcas = leerMarcas(alumno);
  const cal = await clienteAhora();
  if (!cal) {
    poner({ fase: 'reconectar', error: '' });
    throw falla('Se cortó la conexión con Google. Volvé a conectar y desvinculá de nuevo.', 'reconectar');
  }
  clearTimeout(reloj);
  await enFila(async () => {
    if (marcas?.calendario) await cal.borrarCalendario(marcas.calendario);
    await borrarIdDeDrive(alumno);
  });
  apagarPorDentro(alumno);
  soltarGoogle('calendario');
  poner({ ...VACIO });
}

/** For «Borrar todo lo mío»: this device forgets the link. The calendar stays in Google. */
export function olvidarCalendario() {
  const alumno = usuarioActual();
  if (alumno === null) return;
  const prendido = leerMarcas(alumno)?.prendido;
  apagarPorDentro(alumno);
  if (prendido) soltarGoogle('calendario');
  poner({ ...VACIO });
}

const leerEstado = () => {
  const marcas = leerMarcas(usuarioActual());
  return {
    disponible: disponibleGoogle(),
    prendido: Boolean(marcas?.prendido),
    ultima: marcas?.ultima ?? 0,
    email: mailGoogle(),
    ...estado,
  };
};
/** The same, outside React. */
export const estadoCalendario = leerEstado;
let foto = { clave: '', valor: null };
const instantanea = () => {
  const v = leerEstado();
  const clave = JSON.stringify(v);
  if (clave !== foto.clave) foto = { clave, valor: v };
  return foto.valor;
};
const APAGADO = { disponible: false, prendido: false, ultima: 0, email: '', ...VACIO };

/** { disponible, prendido, fase, ultima, error, email }, and the screen redraws when it changes. */
export function useCalendarioGoogle() {
  return useSyncExternalStore((f) => {
    avisados.add(f);
    const a = escucharMio(f);
    const b = escucharGoogle(f);
    return () => {
      avisados.delete(f);
      a();
      b();
    };
  }, instantanea, () => APAGADO);
}
