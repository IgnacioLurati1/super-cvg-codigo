import { useSyncExternalStore } from 'react';
import { SITIO } from '../../sitio.config.js';
import { huella } from './datos';
import { esDemo } from './modoDemo';
import { sesionRecordada, tokenActual } from './sesion';
import { borrarAparte } from './sinInternet';

// Google, with the student's own account: Classroom (read only), the hidden folder of this app in their Drive (the
// copy of their things, sincro.js), the calendar «Super CVG» it creates in their Google Calendar (calendarioSincro.js)
// and the files sent in Mensajes, in a folder «Super CVG» of their Drive (adjuntos.js).
// One permission covers them all, asked bit by bit: each use asks only for what it needs (`include_granted_scopes` keeps
// what was given before), and whoever uses only one never gives the others.
// No Google script runs here: this origin holds the campus key. Google gives its permission back in the address of a
// small window of this same site (the implicit flow to the root). That window reads it, wipes the address, hands it to
// the tab over a BroadcastChannel (same origin only, and it works even if Google cut the link to the opener) and closes.
// The permission lasts about an hour and stays where the campus key is, with the address of the account, to show which
// one it is: in this tab (sessionStorage), or with «Seguir conectado» in this browser (localStorage) until it ends, so
// closing the tab does not drop it. Brave, Firefox and Safari keep Google out of the hidden frame, so they could not
// bring it back by themselves.
// It does not drop by itself: a few minutes before it ends, and in a new tab, it asks another open tab for its
// permission or Google again without showing anything (a hidden frame, `prompt=none`, for that same account and the
// uses turned on). One tab at a time renews, and hands the new one to the other tabs of the same student. For that, the
// number of the Google account (`sub`, nothing else) and the uses turned on stay next to the campus key; while saving in
// Drive, that number also stays for the student in this browser, so a new session renews too. If the browser
// does not let Google answer inside a frame, one click brings it back without asking which account. Salir drops it;
// turning off the last use (Desconectar, Dejar de guardar) also tells Google. Offline nothing is asked: what Classroom
// brought shows as it was kept (classroom.js), and the permission comes back once the network does.

/** The OAuth client of Super CVG in Google Cloud (sitio.config.js). It is public. Empty: nothing of Google shows. */
export const CLIENTE_GOOGLE = import.meta.env.VITE_GOOGLE_CLIENTE || SITIO.google || '';
export const AUTORIZAR = 'https://accounts.google.com/o/oauth2/v2/auth';
export const REVOCAR = 'https://oauth2.googleapis.com/revoke';
export const ALCANCES_CLASSROOM = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.topics.readonly',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.announcements.readonly',
];
// Only the hidden folder of this app in the student's Drive: it does not see any other file.
export const ALCANCE_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
// Only the calendars this app creates (the one called «Super CVG») and their events: never the student's other calendars.
export const ALCANCE_CALENDARIO = 'https://www.googleapis.com/auth/calendar.app.created';
// Only the files this app creates in the student's Drive (the ones sent in Mensajes and their folder): never the others.
export const ALCANCE_ARCHIVOS = 'https://www.googleapis.com/auth/drive.file';
// Which account it is: its number to come back without asking, and its address to show it.
const BASICOS = ['openid', 'email'];
/** What each use needs from Google. */
export const USOS = { classroom: ALCANCES_CLASSROOM, drive: [ALCANCE_DRIVE], calendario: [ALCANCE_CALENDARIO], adjuntos: [ALCANCE_ARCHIVOS], cuenta: [ALCANCE_DRIVE] };
// Uses asked for in the moment: a file in Mensajes asks Google when it is sent. It never joins the uses turned on, so it
// does not keep the permission renewing by itself, and turning off the last one still tells Google.
const DE_PASO = new Set(['adjuntos']);
// What a use asks for besides: the calendar keeps which one is its own in the hidden folder of Drive, so another device of
// the student finds the same one. Without it, it still works, on this device only.
const JUNTO = { calendario: [ALCANCE_DRIVE] };
/** What Classroom asks for: its permissions and which account it is. */
export const ALCANCES = [...ALCANCES_CLASSROOM, ...BASICOS];
export const alcancesDe = (usos) => [...new Set([...usos.flatMap((u) => [...(USOS[u] ?? []), ...(JUNTO[u] ?? [])]), ...BASICOS])];
export const CLAVE_GOOGLE = 'cl.classroom';
export const CLAVE_CUENTA = 'cl.google';
export const CLAVE_USOS = 'cl.google.usos';
export const CLAVE_CURSOS = 'cl.google.cursos';
const CANAL = 'super-cvg-google';
const CERROJO = 'super-cvg-google-renovar';
const ESPERA_MS = 5 * 60 * 1000;
const SILENCIO_MS = 10 * 1000;
const PRESTAMO_MS = 400;
// Renewed a minute early: a request that leaves with an almost expired permission would come back 401.
const MARGEN_S = 60;
// And a new one is asked for a few minutes before that.
const RENOVAR_ANTES_MS = 5 * 60 * 1000;
const SUB = /^\d{1,30}$/;
const MAIL = /^[^\s@]{1,64}@[^\s@]{1,190}$/;
const ALCANCE = /^(openid|email|profile|https:\/\/www\.googleapis\.com\/auth\/[a-z.]{1,80})$/;

const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
const falla = (texto, codigo = '') => Object.assign(new Error(texto), { conocido: true, codigo });

/** Calls `f` every time the permission changes. Returns how to stop. */
export function escucharGoogle(f) {
  avisados.add(f);
  return () => avisados.delete(f);
}

const almacenes = () => {
  try {
    return [sessionStorage, localStorage];
  } catch {
    return [];
  }
};

// Where the permission goes: next to the campus key.
const almacen = () => (sesionRecordada() ? localStorage : sessionStorage);

function borrarPermiso() {
  for (const a of almacenes()) {
    try {
      a.removeItem(CLAVE_GOOGLE);
    } catch {
      // Nothing stored there.
    }
  }
}

// What is stored, or null. One that already ended is wiped right here: it is of no use, and it should not stay on disk.
const crudo = () => {
  try {
    const v = almacen().getItem(CLAVE_GOOGLE);
    if (v === null) return null;
    const vence = Number(JSON.parse(v)?.vence);
    if (Number.isFinite(vence) && vence > Date.now()) return v;
  } catch {
    // Not readable: wiped like an ended one.
  }
  borrarPermiso();
  return null;
};

const limpiarAlcances = (lista) => (Array.isArray(lista) ? [...new Set(lista.filter((a) => typeof a === 'string' && ALCANCE.test(a)))].slice(0, 20) : null);

function leer() {
  try {
    const v = JSON.parse(crudo());
    if (!v || typeof v.token !== 'string' || !v.token || !Number.isFinite(v.vence) || v.vence <= Date.now()) return null;
    return {
      token: v.token,
      vence: v.vence,
      email: typeof v.email === 'string' && MAIL.test(v.email) ? v.email : '',
      // One saved before Drive was Classroom's only.
      alcances: limpiarAlcances(v.alcances) ?? ALCANCES,
    };
  } catch {
    return null;
  }
}

/** Whether a permission covers a use: for Classroom, any of its parts (what is missing says so when it is read). */
const cubre = (v, uso) => Boolean(v) && (USOS[uso] ?? []).some((a) => v.alcances.includes(a));

/** The number of the Google account last connected by this student, or null. */
export function cuentaGoogle() {
  for (const a of almacenes()) {
    const v = a.getItem(CLAVE_CUENTA);
    if (v && SUB.test(v)) return v;
  }
  return null;
}

function recordarCuenta(sub) {
  if (!sub || !SUB.test(sub)) return;
  try {
    // Where the campus key is: with «Seguir conectado» it outlives the tab, like the key.
    (sesionRecordada() ? localStorage : sessionStorage).setItem(CLAVE_CUENTA, sub);
  } catch {
    // Not stored: the next time it asks which account.
  }
}

// Saving in Drive and the linked calendar keep the account for the student even without «Seguir conectado» (sincro.js,
// calendarioSincro.js), so a new session renews the permission without asking.
const pistas = new Set();
/** `f()` gives the number of the Google account to ask for when this tab doesn't know it, or null. */
export function pistaDeCuenta(f) {
  pistas.add(f);
}
const cuentaParaPedir = () => {
  if (cuentaGoogle()) return cuentaGoogle();
  for (const f of pistas) {
    const cuenta = f();
    if (cuenta) return cuenta;
  }
  return null;
};

function olvidarCuenta() {
  for (const a of almacenes()) {
    a.removeItem(CLAVE_CUENTA);
    a.removeItem(CLAVE_USOS);
    a.removeItem(CLAVE_CURSOS);
  }
}

// The Classroom courses joined to the student's last time (classroomUnido.js), only their numbers, next to the account
// they are of: opening the site asks for them at once, without waiting for the list of courses.
const CURSO = /^\d{1,24}$/;
const TOPE_DE_CURSOS = 30;

/** The numbers of the Classroom courses joined last time, for the account connected now; [] if none. */
export function cursosDeClassroom() {
  const sub = cuentaGoogle();
  if (!sub) return [];
  for (const a of almacenes()) {
    const v = a.getItem(CLAVE_CURSOS);
    if (v === null) continue;
    const [de, lista = ''] = v.split(':');
    const ids = lista.split(',').filter(Boolean);
    return de === sub && ids.every((id) => CURSO.test(id)) ? ids.slice(0, TOPE_DE_CURSOS) : [];
  }
  return [];
}

/** Keeps the numbers of the Classroom courses joined now, for the connected account. */
export function recordarCursosDeClassroom(ids) {
  const sub = cuentaGoogle();
  if (!sub || !Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && CURSO.test(id))) return;
  try {
    for (const a of almacenes()) a.removeItem(CLAVE_CURSOS);
    (sesionRecordada() ? localStorage : sessionStorage).setItem(CLAVE_CURSOS, `${sub}:${ids.slice(0, TOPE_DE_CURSOS).join(',')}`);
  } catch {
    // Not stored: the next visit waits for the list of courses, as before.
  }
}

// The uses turned on, next to the account. One connected before Drive existed was Classroom.
function usosGuardados() {
  for (const a of almacenes()) {
    const v = a.getItem(CLAVE_USOS);
    if (v !== null) return v.split(' ').filter((u) => u in USOS);
  }
  return cuentaGoogle() || crudo() ? ['classroom'] : [];
}

function guardarUsos(usos) {
  const limpios = [...new Set(usos.filter((u) => u in USOS))];
  try {
    for (const a of almacenes()) a.removeItem(CLAVE_USOS);
    (sesionRecordada() ? localStorage : sessionStorage).setItem(CLAVE_USOS, limpios.join(' '));
  } catch {
    // Not stored: the next renewal asks only for what the tab has in memory.
  }
}

// What other parts of the site want on now (sincro.js asks for Drive while it saves there).
const queridos = new Set();
/** Says that a use is on (or off) in this tab: the renewal asks for it too. */
export function quererGoogle(uso, si = true) {
  if (!(uso in USOS)) return;
  if (si) queridos.add(uso);
  else queridos.delete(uso);
}
const usosActuales = () => [...new Set([...usosGuardados(), ...queridos])];
/** The uses turned on, for the file of «Entrar con Google» (entrarConGoogle.js). */
export const usosDeGoogle = () => usosActuales();
/** On a device that just came in with «Entrar con Google»: the uses that were on. Without any, the permission goes,
 * without telling Google: the other devices still use it. */
export function quedarseConUsosDeGoogle(usos) {
  const limpios = usos.filter((u) => u in USOS && !DE_PASO.has(u));
  if (!limpios.length) {
    borrarPermiso();
    olvidarCuenta();
    avisar();
    return;
  }
  guardarUsos(limpios);
  avisar();
}
/** Turns on a use the permission already covers (Google gave it before), without asking again. */
export function usarGoogle(uso) {
  if (!(uso in USOS)) return;
  queridos.add(uso);
  guardarUsos([...usosGuardados(), uso]);
  avisar();
}

let reloj = null;
let relojRenovar = null;
function relojes(vence) {
  clearTimeout(reloj);
  clearTimeout(relojRenovar);
  reloj = setTimeout(vencio, vence - Date.now() + 50);
  relojRenovar = setTimeout(() => renovarGoogle(), Math.max(0, vence - Date.now() - RENOVAR_ANTES_MS));
}

function guardarHasta(token, vence, email = '', alcances = ALCANCES) {
  try {
    const donde = almacen();
    borrarPermiso();
    donde.setItem(CLAVE_GOOGLE, JSON.stringify({ token, vence, ...(MAIL.test(email) ? { email } : {}), alcances: limpiarAlcances(alcances) ?? ALCANCES }));
  } catch {
    throw falla('Este navegador no deja guardar la conexión. Probá con otro.');
  }
  relojes(vence);
  avisar();
}
const hasta = (segundos) => Date.now() + Math.max(60, (Number(segundos) || 3600) - MARGEN_S) * 1000;

function vencio() {
  avisar();
  renovarGoogle();
}

export const disponibleGoogle = () => Boolean(CLIENTE_GOOGLE) || esDemo(tokenActual());
/** The permission, whatever it covers. */
export const tokenGoogle = () => leer()?.token ?? null;
export const venceGoogle = () => leer()?.vence ?? null;
/** The permission if it covers that use, or null. */
export function permisoGoogle(uso) {
  const v = leer();
  return cubre(v, uso) ? v.token : null;
}
/** The address of the connected account, or ''. */
export const mailGoogle = () => leer()?.email ?? '';

/** Drops the permission, from the tab and from the browser. `revocar` also tells Google, so it stops working
 * everywhere, and forgets the account and its uses: the next time Google asks which one. */
export function olvidarGoogle({ revocar = false } = {}) {
  const token = tokenGoogle();
  borrarPermiso();
  clearTimeout(reloj);
  clearTimeout(relojRenovar);
  if (revocar) {
    olvidarCuenta();
    queridos.clear();
    // What Classroom brought, kept for offline, goes with the account.
    borrarAparte('classroom.');
    // The other tabs of this student drop it too: it no longer works.
    hablar({ olvida: true, de: deQuien() });
  }
  avisar();
  if (revocar && token && token !== 'demo') {
    // A form body keeps it a simple request. Nothing waits for the answer.
    fetch(REVOCAR, { method: 'POST', mode: 'no-cors', credentials: 'omit', referrerPolicy: 'no-referrer', body: new URLSearchParams({ token }) }).catch(() => {});
  }
}

/** Turns off one use (Desconectar for Classroom, Dejar de guardar for Drive). If it was the last one, Google is told
 * too. If another use is still on, the permission stays: Google gives it whole, and the other one needs it. */
export function soltarGoogle(uso) {
  queridos.delete(uso);
  if (uso === 'classroom') {
    borrarAparte('classroom.');
    for (const a of almacenes()) a.removeItem(CLAVE_CURSOS);
  }
  const quedan = usosActuales().filter((u) => u !== uso);
  if (!quedan.length) {
    olvidarGoogle({ revocar: true });
    return;
  }
  guardarUsos(quedan);
  avisar();
}

let renovando = null;
const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const foto = () => `${crudo()}|${renovando ? 1 : 0}|${usosActuales().join(' ')}|${sinRed() ? 1 : 0}`;

// With «Seguir conectado» the permission is shared by every tab of this browser: one that connects, renews or
// disconnects changes what the others show.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === CLAVE_GOOGLE || e.key === CLAVE_USOS || e.key === null) avisar();
  });
  window.addEventListener('offline', avisar);
  // Back online: the permission that ended meanwhile comes back by itself.
  window.addEventListener('online', () => {
    avisar();
    if (arrancado && !leer() && usosActuales().length) renovarGoogle();
  });
}

/** { disponible, conectado, vence, email, renovando, sinRed } for a use (Classroom, if none is said), and the screen
 * redraws when it changes. The first screen that asks brings the connection back if it was cut (a new tab, or the hour
 * ended while the computer slept). `sinRed`: offline, with the use on and its account known, so what was kept of it
 * shows (classroom.js) even if the permission ended. */
export function useGoogle(uso = 'classroom') {
  const valor = useSyncExternalStore((f) => {
    avisados.add(f);
    queueMicrotask(arrancar);
    return () => avisados.delete(f);
  }, foto, () => '');
  void valor;
  const v = leer();
  const enUso = DE_PASO.has(uso) || usosActuales().includes(uso);
  const conectado = enUso && cubre(v, uso);
  return {
    disponible: disponibleGoogle(),
    conectado,
    vence: conectado ? v.vence : null,
    email: v?.email ?? '',
    renovando: (enUso || !usosActuales().length) && !conectado && renovando !== null,
    sinRed: guardadoSinRed(uso),
  };
}

/** Offline, a use turned on for a known account, with «Seguir conectado»: what was kept of it is what shows. */
export function guardadoSinRed(uso = 'classroom') {
  return sinRed() && sesionRecordada() && usosActuales().includes(uso) && Boolean(cuentaGoogle());
}

let arrancado = false;
function arrancar() {
  if (arrancado || !CLIENTE_GOOGLE || !tokenActual() || esDemo(tokenActual())) return;
  arrancado = true;
  const v = leer();
  if (v) {
    // A reload keeps the permission but not its clocks.
    relojes(v.vence);
    return;
  }
  renovarGoogle();
}

const azar = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The address of Google's permission screen for this site. `alcances`: what it asks for (Classroom, if nothing is
 * said). `cuenta`: the number of the account to use, so Google does not ask which one. `silencio`: nothing is shown,
 * and Google answers with an error if it would have to ask. */
export function direccionDePermiso(estado, { origen = window.location.origin, nonce = '', cuenta = null, silencio = false, alcances = ALCANCES } = {}) {
  const url = new URL(AUTORIZAR);
  const params = {
    client_id: CLIENTE_GOOGLE,
    redirect_uri: `${origen}/`,
    response_type: 'token id_token',
    scope: alcances.join(' '),
    state: estado,
    nonce,
    include_granted_scopes: 'true',
  };
  if (cuenta) params.login_hint = cuenta;
  if (silencio) params.prompt = 'none';
  else if (!cuenta) params.prompt = 'select_account';
  url.search = new URLSearchParams(params).toString();
  return url.href;
}

/** What the id_token says about the account, if it is for this site and this request: { sub, email }, or null. It
 * only names the account (to show it and to ask for it again): the permission is the access token. */
export function leerIdToken(jwt, nonce) {
  if (typeof jwt !== 'string' || !nonce) return null;
  const partes = jwt.split('.');
  if (partes.length !== 3) return null;
  try {
    const b = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b.padEnd(Math.ceil(b.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
    const datos = JSON.parse(new TextDecoder().decode(bytes));
    const sub = String(datos.sub ?? '');
    if (datos.aud !== CLIENTE_GOOGLE || datos.nonce !== nonce || !SUB.test(sub)) return null;
    if (datos.iss !== 'https://accounts.google.com' && datos.iss !== 'accounts.google.com') return null;
    return { sub, email: typeof datos.email === 'string' && MAIL.test(datos.email) ? datos.email : '' };
  } catch {
    return null;
  }
}

// What Google says it gave. Without it (an older answer), what was asked for.
const alcancesDeRespuesta = (texto, pedidos) => (typeof texto === 'string' && texto.trim() ? limpiarAlcances(texto.trim().split(/\s+/)) : null) ?? pedidos;

// Requests waiting for Google, by their state: the window (`ventana`) and the hidden frame can wait at once.
const esperas = new Map();
// Requests to the other tabs, by their id.
const prestamos = new Map();
let ventana = null;
let canal = null;

// Two tabs share the permission only if they are the same student on the campus.
const deQuien = () => huella(tokenActual() ?? '');

function hablar(mensaje) {
  try {
    escuchar();
    canal.postMessage(mensaje);
  } catch {
    // Without BroadcastChannel each tab keeps its own.
  }
}

// A new permission (from Google or from another tab) is handed to the other tabs of the same student, so they do not
// ask Google again each one on its own.
function repartir(v) {
  hablar({ nuevo: { token: v.token, vence: v.vence, email: v.email, alcances: v.alcances, sub: cuentaGoogle(), usos: usosActuales() }, de: deQuien() });
}

// One that comes from another tab: kept if it is newer, with that tab's uses.
function adoptar(m) {
  if (!m || typeof m.token !== 'string' || !m.token || !Number.isFinite(m.vence) || m.vence <= Date.now() + 60_000) return false;
  const v = leer();
  if (v && v.vence >= m.vence) return false;
  const previos = usosGuardados();
  if (typeof m.sub === 'string') recordarCuenta(m.sub);
  if (Array.isArray(m.usos)) guardarUsos([...previos, ...m.usos.filter((u) => typeof u === 'string')]);
  guardarHasta(m.token, m.vence, typeof m.email === 'string' ? m.email : '', limpiarAlcances(m.alcances) ?? ALCANCES);
  return true;
}

function escuchar() {
  if (canal) return;
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (typeof data.pide === 'string') {
      const v = leer();
      const necesita = Array.isArray(data.usos) ? data.usos : ['classroom'];
      if (v && data.de === deQuien() && v.vence > (Number(data.mejorQue) || 0) + 60_000 && necesita.every((u) => cubre(v, u))) {
        canal.postMessage({ presta: data.pide, token: v.token, vence: v.vence, email: v.email, alcances: v.alcances, sub: cuentaGoogle(), usos: usosActuales() });
      }
      return;
    }
    if (typeof data.presta === 'string') {
      prestamos.get(data.presta)?.(data);
      return;
    }
    if (data.nuevo && typeof data.nuevo === 'object') {
      if (data.de === deQuien()) {
        try {
          adoptar(data.nuevo);
        } catch {
          // Not stored here: this tab asks for its own when it needs it.
        }
      }
      return;
    }
    if (data.olvida === true) {
      if (data.de === deQuien() && leer()) {
        borrarPermiso();
        clearTimeout(reloj);
        clearTimeout(relojRenovar);
        olvidarCuenta();
        queridos.clear();
        avisar();
      }
      return;
    }
    const espera = esperas.get(data.state);
    if (!espera) return;
    esperas.delete(data.state);
    clearTimeout(espera.reloj);
    if (data.error) {
      espera.mal(falla(data.error === 'access_denied' ? 'No diste permiso en Google. Si querés, probá de nuevo.' : 'Google no dio el permiso. Probá de nuevo.', data.error === 'access_denied' ? 'negado' : 'error'));
      return;
    }
    if (typeof data.token !== 'string' || !data.token) {
      espera.mal(falla('Google no dio el permiso. Probá de nuevo.'));
      return;
    }
    try {
      const cuenta = leerIdToken(data.idToken, espera.nonce);
      if (cuenta) recordarCuenta(cuenta.sub);
      const alcances = alcancesDeRespuesta(data.alcances, espera.alcances);
      guardarHasta(data.token, hasta(data.vence), cuenta?.email ?? '', alcances);
      espera.ok(alcances);
      repartir(leer());
    } catch (e) {
      espera.mal(e);
    }
  };
}

const NO_DIO = {
  classroom: 'Google no dio permiso para ver Classroom. Probá de nuevo y dejá marcadas todas las opciones.',
  drive: 'Google no dio permiso para guardar en tu Drive. Probá de nuevo y dejá marcada esa opción.',
  calendario: 'Google no dio permiso para tu Google Calendar. Probá de nuevo y dejá marcada esa opción.',
  adjuntos: 'Google no dio permiso para subir el archivo a tu Drive. Probá de nuevo y dejá marcada esa opción.',
  cuenta: 'Google no dio permiso para la carpeta de Super CVG en tu Drive. Probá de nuevo y dejá marcada esa opción.',
};
const NO_DISPONIBLE = {
  classroom: 'Classroom todavía no está disponible.',
  drive: 'Guardar en tu Drive todavía no está disponible.',
  calendario: 'Google Calendar todavía no está disponible.',
  adjuntos: 'Mandar archivos todavía no está disponible.',
  cuenta: 'Entrar con Google todavía no está disponible.',
};

/** Opens Google's window for a use (Classroom, if none is said). Call it straight from a click, or the browser blocks
 * the window. Resolves once connected. With an account known (or `cuenta`) it goes straight to it; without one (the
 * first time, or after Desconectar) Google asks. */
export function conectarGoogle(uso = 'classroom', { cuenta = null } = {}) {
  if (esDemo(tokenActual())) {
    const v = leer();
    const alcances = [...new Set([...(v?.alcances ?? []), ...alcancesDe([uso])])];
    if (!DE_PASO.has(uso)) guardarUsos([...usosGuardados(), uso]);
    guardarHasta('demo', hasta(3600), 'ana.alumna@gmail.com', alcances);
    return Promise.resolve();
  }
  if (!CLIENTE_GOOGLE) return Promise.reject(falla(NO_DISPONIBLE[uso] ?? NO_DISPONIBLE.classroom));
  cancelarConexion();
  const estado = azar();
  const nonce = azar();
  const alcances = alcancesDe([uso]);
  // The uses on before this one: once the account is known, one saved before Drive counts as Classroom.
  const previos = usosGuardados();
  const abierta = window.open(direccionDePermiso(estado, { nonce, cuenta: cuenta ?? cuentaParaPedir(), alcances }), 'super-cvg-google', 'popup,width=500,height=650');
  if (!abierta) return Promise.reject(falla('Tu navegador frenó la ventana de Google. Permití ventanas emergentes para este sitio y probá de nuevo.', 'frenada'));
  escuchar();
  ventana = estado;
  return new Promise((ok, mal) => {
    esperas.set(estado, {
      nonce,
      alcances,
      ok: (dados) => {
        if (!USOS[uso].some((a) => dados.includes(a))) {
          mal(falla(NO_DIO[uso], 'incompleto'));
          return;
        }
        if (!DE_PASO.has(uso)) guardarUsos([...previos, uso]);
        avisar();
        ok();
      },
      mal,
      reloj: setTimeout(() => {
        esperas.delete(estado);
        mal(falla('Se cortó la espera. Probá conectar de nuevo.', 'espera'));
      }, ESPERA_MS),
    });
  });
}

export function cancelarConexion() {
  const estado = ventana;
  ventana = null;
  const espera = estado && esperas.get(estado);
  if (!espera) return;
  esperas.delete(estado);
  clearTimeout(espera.reloj);
  espera.mal(falla('', 'cancelada'));
}

// Another open tab of the same student may have a newer permission, for the same uses.
function pedirAOtraPestana(mejorQue, usos, corte = {}) {
  escuchar();
  const id = azar();
  return new Promise((ok) => {
    const fin = (r) => {
      clearTimeout(reloj);
      prestamos.delete(id);
      ok(r);
    };
    (corte.parar ??= []).push(() => fin(false));
    const reloj = setTimeout(() => fin(false), PRESTAMO_MS);
    prestamos.set(id, (m) => {
      if (typeof m.token !== 'string' || !m.token || !Number.isFinite(m.vence) || m.vence <= Date.now() + 60_000) return;
      try {
        const previos = usosGuardados();
        if (typeof m.sub === 'string') recordarCuenta(m.sub);
        if (Array.isArray(m.usos)) guardarUsos([...previos, ...m.usos.filter((u) => typeof u === 'string')]);
        guardarHasta(m.token, m.vence, typeof m.email === 'string' ? m.email : '', limpiarAlcances(m.alcances) ?? ALCANCES);
        fin(true);
      } catch {
        fin(false);
      }
    });
    canal.postMessage({ pide: id, de: deQuien(), mejorQue, usos });
  });
}

// Google again, in a hidden frame, for the account it already had and the uses turned on. If the browser keeps
// Google's session out of frames, Google answers with an error (or nothing) and it stays for a click.
function enSilencio(cuenta, alcances, corte = {}) {
  escuchar();
  const estado = azar();
  const nonce = azar();
  const marco = document.createElement('iframe');
  marco.hidden = true;
  marco.title = 'Conexión con Google';
  marco.tabIndex = -1;
  marco.src = direccionDePermiso(estado, { nonce, cuenta, silencio: true, alcances });
  return new Promise((ok) => {
    const fin = (r) => {
      clearTimeout(reloj);
      esperas.delete(estado);
      marco.remove();
      ok(r);
    };
    const reloj = setTimeout(() => fin(false), SILENCIO_MS);
    (corte.parar ??= []).push(() => fin(false));
    esperas.set(estado, { nonce, alcances, ok: () => fin(true), mal: () => fin(false) });
    document.body.append(marco);
  });
}

// One tab of this browser at a time: the others wait, and by then they usually have the new one.
const enFila = (fn) => (typeof navigator !== 'undefined' && navigator.locks?.request ? navigator.locks.request(CERROJO, fn) : fn());

/** Brings a new permission without showing anything: from another tab, or from Google for the same account and the
 * uses turned on. True if it did. One at a time, also among the tabs. */
export function renovarGoogle() {
  if (renovando) return renovando;
  // Offline, Google is not asked: the network coming back renews it.
  if (!CLIENTE_GOOGLE || !tokenActual() || esDemo(tokenActual()) || typeof document === 'undefined' || sinRed()) return Promise.resolve(false);
  const usos = usosActuales();
  const antes = venceGoogle() ?? 0;
  renovando = enFila(async () => {
    // Another tab renewed it while this one waited.
    const v = leer();
    if (v && v.vence > antes && v.vence > Date.now() + RENOVAR_ANTES_MS && usos.every((u) => cubre(v, u))) return true;
    // Another tab that has it, and Google, at the same time: the first that brings it, and the other stops. Waiting for
    // the tabs first cost 0.4 s on every renewal of the phone's app, which never has another (measured on 24/11).
    const corte = {};
    const deOtra = pedirAOtraPestana(venceGoogle() ?? 0, usos, corte);
    const cuenta = cuentaParaPedir();
    if (!cuenta || !usos.length) return deOtra;
    const deGoogle = enSilencio(cuenta, alcancesDe(usos), corte);
    const trajo = await new Promise((ok) => {
      let quedan = 2;
      const una = (si) => (si ? ok(true) : --quedan === 0 && ok(false));
      // A failure counts as nothing brought: the lock of enFila is never left held.
      deOtra.then(una, () => una(false));
      deGoogle.then(una, () => una(false));
    });
    for (const parar of corte.parar) parar();
    return trajo;
  }).catch(() => false).finally(() => {
    renovando = null;
    avisar();
  });
  avisar();
  return renovando;
}

/** In the window Google came back to: is this that address? */
export function esVueltaDeGoogle(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return p.has('state') && (p.has('access_token') || p.has('error'));
}

/** Runs first thing in the window (or the hidden frame) Google came back to: hands the permission to the tab, wipes
 * the address and closes. Returns false anywhere else. */
export function atenderVueltaDeGoogle(lugar = window.location, historial = window.history, Canal = window.BroadcastChannel) {
  if (!esVueltaDeGoogle(lugar.hash)) return false;
  const p = new URLSearchParams(lugar.hash.slice(1));
  historial.replaceState(null, '', `${lugar.pathname}${lugar.search}`);
  const mensaje = { state: p.get('state'), token: p.get('access_token'), vence: Number(p.get('expires_in')), idToken: p.get('id_token'), alcances: p.get('scope'), error: p.get('error') };
  try {
    const c = new Canal(CANAL);
    c.postMessage(mensaje);
    c.close();
  } catch {
    // Without BroadcastChannel there is nobody to hand it to.
  }
  return true;
}
