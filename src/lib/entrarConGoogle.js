import { useSyncExternalStore } from 'react';
import { vincularCalendarioAlEntrar, leerMarcas as marcasDelCalendario } from './calendarioSincro';
import { huella } from './datos';
import { clienteDrive } from './drive';
import {
  conectarGoogle, cuentaGoogle, disponibleGoogle, escucharGoogle, permisoGoogle, pistaDeCuenta, quedarseConUsosDeGoogle,
  quererGoogle, renovarGoogle, soltarGoogle, usarGoogle, usosDeGoogle,
} from './google';
import { leerMarcas as marcasDeDrive } from './marcas';
import { escucharMio, usuarioActual } from './mio';
import { llamar, pedirClave } from './moodle';
import { guardarVinculo, leerVinculo, vinculoValido } from './resumenes';
import { iniciarSesion, tokenActual } from './sesion';
import { prenderDrive, prenderDriveAlEntrar } from './sincro';

// «Entrar con Google»: the student turns it on once, in Configuración, and from then on comes in with their Google
// account on any device, also this one, without the campus password. The campus key, the link with El Santo Resumen
// and what is on (Classroom, the calendar) go in one file in the hidden folder of their Google Drive
// (appDataFolder, only this app sees it). Whoever gets into that Google account gets into their campus too: the
// student is told before turning it on. Turning it off deletes the file. Salir does not: that is the point.
// In this browser, per campus student, only which Google account it is and a fingerprint of what was saved last
// (`cl.entrar.<alumno>`), so a new campus key (after the password) goes up by itself.

export const ARCHIVO = 'super-cvg-cuenta.json';
export const VERSION = 1;
const PREFIJO = 'cl.entrar.';
// After «el campus pide tu contraseña de nuevo», the Google account, until the student comes in with the password.
const VENCIDA = 'cl.entrar.vencida';
const SUB = /^\d{1,30}$/;
const TOKEN_CAMPUS = /^[A-Za-z0-9]{16,128}$/;
const USOS = ['classroom', 'drive', 'calendario'];
const CALENDARIO = /^[A-Za-z0-9._@-]{5,250}$/;

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
export const TEXTOS = {
  'sin-vincular': 'Esa cuenta de Google no tiene Super CVG vinculado. Entrá con tu usuario del campus y prendé Entrar con Google en Configuración.',
  'sin-clave': 'El campus pide tu contraseña de nuevo. Entrá una vez con tu usuario y Entrar con Google vuelve a andar.',
  roto: 'No se pudo leer lo que guardaste en tu Drive. Entrá con tu usuario del campus y volvé a prender Entrar con Google.',
  'sin-alumno': 'Esperá a que carguen tus datos y probá de nuevo.',
  contrasena: 'Esa no es tu contraseña del campus.',
};

// ---------- In this browser ----------

const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());

export function leerMarca(alumno) {
  if (alumno === null || alumno === undefined) return null;
  try {
    const v = JSON.parse(localStorage.getItem(PREFIJO + alumno) ?? 'null');
    return v && typeof v.cuenta === 'string' && SUB.test(v.cuenta) ? { cuenta: v.cuenta, huella: typeof v.huella === 'string' ? v.huella : '' } : null;
  } catch {
    return null;
  }
}

function guardarMarca(alumno, marca) {
  try {
    localStorage.setItem(PREFIJO + alumno, JSON.stringify(marca));
  } catch {
    // Without room it still works: the next visit puts the file up to date again.
  }
  avisar();
}

function borrarMarca(alumno) {
  try {
    localStorage.removeItem(PREFIJO + alumno);
  } catch {
    // Nothing to forget.
  }
  avisar();
}

// ---------- What goes in the file ----------

/** What a file may bring, checked one by one, or null without a campus key and a student. */
export function sanearDatos(d) {
  if (!d || typeof d !== 'object' || d.v !== VERSION || typeof d.campus !== 'string' || !TOKEN_CAMPUS.test(d.campus) || !Number.isSafeInteger(d.alumno) || d.alumno <= 0) return null;
  return {
    v: VERSION,
    campus: d.campus,
    alumno: d.alumno,
    santo: vinculoValido(d.santo),
    usos: Array.isArray(d.usos) ? USOS.filter((u) => d.usos.includes(u)) : [],
    drive: d.drive === true,
    calendario: typeof d.calendario === 'string' && CALENDARIO.test(d.calendario) ? d.calendario : null,
  };
}

/** What this device has, for the file. */
export function armarDatos() {
  const alumno = usuarioActual();
  const campus = tokenActual();
  if (!campus || alumno === null) throw falla(TEXTOS['sin-alumno'], 'sin-alumno');
  const calendario = marcasDelCalendario(alumno);
  return {
    v: VERSION,
    campus,
    alumno,
    santo: leerVinculo(alumno),
    usos: usosDeGoogle().filter((u) => USOS.includes(u)),
    drive: Boolean(marcasDeDrive(alumno)?.prendido),
    calendario: calendario?.prendido && calendario.calendario ? calendario.calendario : null,
  };
}

// ---------- The file ----------

/** A Drive client with this tab's permission for the hidden folder. */
export const driveDeCuenta = () => clienteDrive({ token: () => permisoGoogle('cuenta') });

/** The file, read and checked: { datos, id }, { datos: null, id } if it does not read, or null if it is not there. */
export async function leerArchivo(drive) {
  const [archivo] = await drive.listar({ nombre: ARCHIVO });
  if (!archivo) return null;
  let crudo = null;
  try {
    crudo = await (await drive.bajar(archivo.id)).json();
  } catch (e) {
    if (e?.conocido) throw e;
  }
  return { datos: sanearDatos(crudo), id: archivo.id };
}

/** Saves `datos` as the file, over the one there was. Returns the fingerprint of what went. */
export async function escribirArchivo(drive, datos) {
  const archivos = await drive.listar({ nombre: ARCHIVO });
  const texto = JSON.stringify(datos);
  await drive.subir({ id: archivos[0]?.id ?? null, nombre: ARCHIVO, blob: new Blob([texto], { type: 'application/json' }) });
  for (const f of archivos.slice(1)) await drive.borrar(f.id).catch(() => {});
  return huella(texto);
}

export async function borrarArchivo(drive) {
  for (const f of await drive.listar({ nombre: ARCHIVO })) await drive.borrar(f.id);
}

// ---------- Configuración ----------

/** The campus password once more, so whoever finds the session open can't link their own Google account to it. Checked
 * with the campus as in the login, one attempt; nothing of it is kept. */
async function comprobarContrasena(contrasena) {
  const info = await llamar(tokenActual(), 'core_webservice_get_site_info');
  if (info?.userid !== usuarioActual() || typeof info.username !== 'string' || !info.username) throw falla(TEXTOS['sin-alumno'], 'sin-alumno');
  try {
    await pedirClave(info.username, String(contrasena ?? ''));
  } catch (e) {
    if (e?.codigo === 'invalidlogin') throw falla(TEXTOS.contrasena, 'contrasena');
    throw e;
  }
}

/** Turns it on, with the campus password. Call it straight from a click (or the «¿Seguro?» right after): Google's
 * window opens first, while the click still counts, and the password is checked after it. */
export async function prenderEntrarConGoogle(contrasena) {
  const alumno = usuarioActual();
  if (alumno === null) throw falla(TEXTOS['sin-alumno'], 'sin-alumno');
  if (permisoGoogle('cuenta')) usarGoogle('cuenta');
  else await conectarGoogle('cuenta');
  if (usuarioActual() !== alumno) return;
  try {
    await comprobarContrasena(contrasena);
  } catch (e) {
    soltarGoogle('cuenta');
    throw e;
  }
  if (usuarioActual() !== alumno) return;
  // «Guardar en tu Google Drive» goes on with it, here and on every device that comes in with Google: the same permission.
  if (!marcasDeDrive(alumno)?.prendido) await prenderDrive().catch(() => {});
  if (usuarioActual() !== alumno) return;
  const marcaHuella = await escribirArchivo(driveDeCuenta(), armarDatos());
  guardarMarca(alumno, { cuenta: cuentaGoogle() ?? '', huella: marcaHuella });
}

/** Turns it off: deletes the file from Drive, here and for every device. Without the permission, Google's window. */
export async function apagarEntrarConGoogle() {
  const alumno = usuarioActual();
  const marca = leerMarca(alumno);
  if (!permisoGoogle('cuenta')) await conectarGoogle('cuenta', { cuenta: marca?.cuenta ?? null });
  await borrarArchivo(driveDeCuenta());
  borrarMarca(alumno);
  soltarGoogle('cuenta');
}

/** { disponible, prendido } for the student inside, and the screen redraws when it changes. */
export function useEntrarConGoogle() {
  const marca = useSyncExternalStore((f) => {
    avisados.add(f);
    return () => avisados.delete(f);
  }, () => localStorage.getItem(PREFIJO + usuarioActual()) ?? '', () => '');
  return { disponible: disponibleGoogle(), prendido: Boolean(marca) && Boolean(leerMarca(usuarioActual())) };
}

// ---------- Keeping the file up to date ----------

let corriendo = false;
let renovado = false;

/** If it is on here, puts the file up to date with this device (a new campus key, El Santo Resumen, what is on).
 * Turned off on another device, or linked to another campus student since: it goes off here too, without touching
 * the file. */
export async function ponerAlDia({ drive = driveDeCuenta() } = {}) {
  const alumno = usuarioActual();
  const marca = leerMarca(alumno);
  if (!marca || !tokenActual() || corriendo) return;
  quererGoogle('cuenta', true);
  if (!permisoGoogle('cuenta')) {
    // Once per visit, without showing anything: the renewal asks Google for that account.
    if (!renovado) {
      renovado = true;
      renovarGoogle();
    }
    return;
  }
  if (cuentaGoogle() && cuentaGoogle() !== marca.cuenta) return;
  corriendo = true;
  try {
    const datos = armarDatos();
    if (huella(JSON.stringify(datos)) === marca.huella) return;
    const ahora = await leerArchivo(drive);
    if (!ahora || (ahora.datos && ahora.datos.alumno !== alumno)) {
      borrarMarca(alumno);
      quererGoogle('cuenta', false);
      return;
    }
    if (usuarioActual() !== alumno) return;
    guardarMarca(alumno, { cuenta: marca.cuenta, huella: await escribirArchivo(drive, datos) });
  } catch {
    // Without Drive now: the next change or visit tries again.
  } finally {
    corriendo = false;
  }
}

let reloj = null;
const programar = () => {
  clearTimeout(reloj);
  reloj = setTimeout(() => {
    tomarVencida();
    ponerAlDia();
  }, 1500);
};

// After «el campus pide tu contraseña de nuevo» and the password: this student is linked here again, so the file gets
// the new key as soon as Google renews.
function tomarVencida() {
  const alumno = usuarioActual();
  let cuenta = null;
  try {
    cuenta = sessionStorage.getItem(VENCIDA);
  } catch {
    return;
  }
  if (!cuenta || !SUB.test(cuenta) || alumno === null || !tokenActual()) return;
  sessionStorage.removeItem(VENCIDA);
  if (!leerMarca(alumno)) guardarMarca(alumno, { cuenta, huella: '' });
}

let arrancado = false;
export function arrancarEntrarConGoogle() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  // While it is on, a new session renews the permission for the same account without asking.
  pistaDeCuenta(() => leerMarca(usuarioActual())?.cuenta ?? null);
  // The student comes in (or changes): Configuración shows whether it is on for them.
  escucharMio(() => {
    avisar();
    programar();
  });
  escucharGoogle(programar);
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith(PREFIJO)) avisar();
  });
}

// ---------- Coming in ----------

/** On the login screen, once Google's window (`conectarGoogle('cuenta')`, opened on the click) is done: the file and
 * in. `recordar`: «Seguir conectado». */
export async function entrarConGoogle({ recordar = false } = {}) {
  const leido = await leerArchivo(driveDeCuenta());
  if (!leido) throw falla(TEXTOS['sin-vincular'], 'sin-vincular');
  if (!leido.datos) throw falla(TEXTOS.roto, 'roto');
  try {
    await entrarConDatos(leido.datos, { recordar });
  } catch (e) {
    if (e.codigo === 'sin-clave') {
      try {
        sessionStorage.setItem(VENCIDA, cuentaGoogle() ?? '');
      } catch {
        // Then the student turns it on again in Configuración.
      }
    }
    throw e;
  }
}

/** With what the file brings: checks the campus key with the campus, comes in and turns on what was on. */
export async function entrarConDatos(datos, { recordar = false } = {}) {
  let info;
  try {
    info = await llamar(datos.campus, 'core_webservice_get_site_info');
  } catch {
    throw falla(TEXTOS['sin-clave'], 'sin-clave');
  }
  if (info?.userid !== datos.alumno) throw falla(TEXTOS['sin-clave'], 'sin-clave');
  const cuenta = cuentaGoogle();
  iniciarSesion(datos.campus, { recordar, conGoogle: true });
  const { alumno } = datos;
  // «Guardar en tu Google Drive» always goes on: the student's things and their look come from the copy.
  quedarseConUsosDeGoogle([...new Set([...datos.usos, 'drive', 'cuenta'])]);
  if (cuenta) guardarMarca(alumno, { cuenta, huella: huella(JSON.stringify(datos)) });
  if (datos.santo && !leerVinculo(alumno)) guardarVinculo(alumno, datos.santo);
  if (cuenta) prenderDriveAlEntrar(alumno, cuenta);
  if (datos.calendario && cuenta) vincularCalendarioAlEntrar(alumno, datos.calendario, cuenta);
  // The rest of the permission (Classroom, the calendar): Google already gave it to this account, so it comes without
  // asking. If the browser keeps Google out of the hidden frame, each screen offers its button.
  if (datos.usos.some((u) => u !== 'drive')) renovarGoogle();
}
