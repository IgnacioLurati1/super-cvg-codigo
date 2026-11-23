// «Descargas inteligentes» (Configuración), the page's side: whether it is on in this device, and what the service worker
// needs to bring the day's material with Super CVG closed (descargasFondo.js, which does it). Per device, off unless
// turned on (`descargas` in cl.ajustes). It runs only where Chrome has periodic sync: an app installed on Android.
//   - On, with «Seguir conectado» and periodic sync: the campus key goes to the worker's database (guardarLlave,
//     encrypted), and Chrome is asked to wake the worker about once a day (TAG).
//   - Off, without «Seguir conectado», a new key or Salir (sesion.js): the key and all of it go, and Chrome stops.
//   - The plan, only numbers: the courses of each of the next days by the student's schedule, as «En la facu» of Hoy
//     shows them (armarSemana, without the days without classes or the courses taken out of Hoy), the sections the
//     student skips (`sinDescargar` of mio.js) and «Ahorro de datos».
import { useEffect, useSyncExternalStore } from 'react';
import { ajustesActuales, escucharAjustes } from './ajustes';
import { cargarMaterias } from './campus';
import { claveDeFecha } from './datos';
import { borrarDescargas, CADA_MS, guardarLlave, leerDato, leerLlave, ponerDato, soltarPeriodico, TAG } from './descargasFondo';
import { armarSemana, cuatrimestreEl, sinClasesEl } from './facultad';
import { cargarHorarios } from './horarioDatos';
import { fueraDeHoy } from './hoy';
import { escucharMio, mioActual, usuarioActual } from './mio';
import { esDemo } from './modoDemo';
import { sesionRecordada, tokenActual } from './sesion';

/** How many days ahead the plan goes: a student who doesn't open Super CVG for a while still gets the right courses. */
export const DIAS_DEL_PLAN = 14;
const ESPERA_MS = 1500;
const esNumero = (n) => Number.isSafeInteger(n) && n > 0;

/** The courses of each day from `desde`, by number: { 'aaaa-mm-dd': [ids] }, only the days with classes. The same rule
 * as «En la facu» (ClasesDeHoy.jsx): the student's week of that cuatrimestre, without holidays and recesses, and
 * without the courses taken out of Hoy. Only campus courses: a subject of the schedules without one has nothing to bring. */
export function planDeDescargas({ horarios, cursos = [], mio, desde = new Date(), dias = DIAS_DEL_PLAN }) {
  const fuera = fueraDeHoy(mio);
  const semanas = new Map();
  const plan = {};
  for (let i = 0; i < dias; i += 1) {
    const dia = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i, 12);
    const clave = claveDeFecha(dia);
    const cuatri = cuatrimestreEl(clave);
    if (!cuatri || sinClasesEl(clave)) continue;
    if (!semanas.has(cuatri)) semanas.set(cuatri, armarSemana({ datos: horarios, cursos, mio, cuatrimestre: cuatri }));
    const ids = [...new Set(semanas.get(cuatri).clases.filter((c) => c.dia === dia.getDay()).map((c) => Number(c.cursoId)).filter((id) => esNumero(id) && !fuera.has(id)))];
    if (ids.length) plan[clave] = ids;
  }
  return plan;
}

/** The sections each course skips, as the plan takes them: { [materiaId]: [seccionIds] }. */
export const salteadas = (mio) => Object.fromEntries(Object.entries(mio?.sinDescargar ?? {}).filter(([, s]) => s.length));

// ---------- Whether this device can ----------

/** Whether Chrome has periodic sync here and lets this site use it: the worker registered and the app installed. */
async function registroConFondo() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.getRegistration) return null;
  if (typeof ServiceWorkerRegistration === 'undefined' || !('periodicSync' in ServiceWorkerRegistration.prototype)) return null;
  try {
    const permiso = await navigator.permissions?.query({ name: 'periodic-background-sync' });
    if (permiso?.state !== 'granted') return null;
    const registro = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    return registro?.periodicSync ? registro : null;
  } catch {
    return null;
  }
}

// ---------- Keeping the worker's part in step ----------

async function armarPlan(alumno) {
  try {
    const [{ enCurso }, horarios] = await Promise.all([cargarMaterias(), cargarHorarios()]);
    // The student may have changed while it came.
    if (usuarioActual() !== alumno) return false;
    const mio = mioActual();
    return ponerDato('plan', { alumno, dias: planDeDescargas({ horarios, cursos: enCurso, mio }), saltear: salteadas(mio), ahorro: ajustesActuales().ahorro });
  } catch {
    // Without the courses now (no internet, nothing kept): the plan of before stays.
    return false;
  }
}

/** Off: the key and everything of the night go, and Chrome stops waking the worker. */
export async function apagarFondo() {
  await borrarDescargas();
  await soltarPeriodico();
  avisar();
}

// Off once in this visit is enough: every change of the student's things doesn't delete it again.
let apagado = false;

async function ponerEnHora() {
  const token = tokenActual();
  const alumno = usuarioActual();
  const quiere = ajustesActuales().descargas && Boolean(token) && !esDemo(token) && sesionRecordada() && esNumero(alumno);
  if (!quiere && apagado) return;
  const conFondo = await registroConFondo();
  disponible = conFondo !== null;
  const registro = quiere ? conFondo : null;
  if (!registro) {
    await apagarFondo();
    apagado = !quiere;
    return;
  }
  apagado = false;
  try {
    await registro.periodicSync.register(TAG, { minInterval: CADA_MS });
  } catch {
    await apagarFondo();
    return;
  }
  // A new key, or another student: the old one goes before the new one is kept.
  const guardada = await leerLlave();
  if (guardada?.token !== token || guardada.alumno !== alumno) {
    await borrarDescargas();
    if (!(await guardarLlave(token, alumno))) {
      await apagarFondo();
      return;
    }
  }
  await armarPlan(alumno);
  avisar();
}

let corriendo = null;
let otraVez = false;
/** Puts the worker's part as the setting, the session and the student's things say now. Never fails. */
export function sincronizarDescargas() {
  if (corriendo) {
    otraVez = true;
    return corriendo;
  }
  corriendo = (async () => {
    do {
      otraVez = false;
      await ponerEnHora().catch(() => {});
    } while (otraVez);
  })().finally(() => {
    corriendo = null;
  });
  return corriendo;
}

let reloj = null;
const pronto = () => {
  clearTimeout(reloj);
  reloj = setTimeout(sincronizarDescargas, ESPERA_MS);
};

let arrancado = false;
/** From main.jsx: once at the start, and again when the setting, «Ahorro de datos», the student or their things change. */
export function arrancarDescargas() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  let antes = ajustesActuales();
  escucharAjustes(() => {
    const ahora = ajustesActuales();
    if (ahora.descargas === antes.descargas && ahora.ahorro === antes.ahorro) return;
    antes = ahora;
    pronto();
  });
  escucharMio(pronto);
  // The schedule of a new day: the plan goes on from today.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && pronto());
  pronto();
}

// ---------- For Configuración ----------

let disponible = null;
let ultima = null;
const oyentes = new Set();
const avisar = () => {
  // Off, its database isn't opened: opening it would make an empty one.
  (ajustesActuales().descargas ? leerDato('registro') : Promise.resolve(null)).then((r) => {
    ultima = r?.ultima && Number.isFinite(r.ultima.cuando) ? { cuando: r.ultima.cuando, bytes: r.ultima.bytes ?? 0, archivos: r.ultima.archivos ?? 0 } : null;
    estado = { disponible, ultima };
    oyentes.forEach((f) => f());
  });
};
let estado = { disponible, ultima };
const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

/** { disponible, ultima }: whether this device can (null while it is found out), and the last download, { cuando, bytes,
 * archivos } or null. */
export function useDescargas() {
  const valor = useSyncExternalStore(suscribir, () => estado, () => estado);
  useEffect(() => {
    let vivo = true;
    registroConFondo().then((r) => {
      if (!vivo) return;
      disponible = r !== null;
      avisar();
    });
    return () => {
      vivo = false;
    };
  }, []);
  return valor;
}
