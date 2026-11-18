// «Guardar en tu Google Drive»: the student's things (mio.js), the files of their courses and what the programs of the
// lab wrote (bodega.js, laboratorio/escritos.js) go to the
// hidden folder of Super CVG in their own Drive (drive.js), so another device with the same Google account gets them.
// Nothing goes through Luta Studios. The appearance (ajustes.js) travels too, except the sizes of the panels (aparienciaQueViaja).
// In the folder, per campus student: `super-cvg-<student>.json` with the data and the time of each element (union.js),
// and each file apart, named by the fingerprint of its bytes (SHA-256): the same file is never uploaded twice.
// It saves on coming in (with the campus session and the permission), a few seconds after each change, on coming back
// to the tab and, as best it can, on leaving it. Without internet it waits for it. One at a time, also among the tabs
// of this browser (Web Locks, or a lease in its storage where there are none).
// It never writes over what it can't read: a copy from a newer Super CVG, or one it could not bring, stops it. Before
// writing the copy it checks that nobody saved it meanwhile; if somebody did, it joins again.
import { useSyncExternalStore } from 'react';
import { guardarEnBodega, idsEnBodega, leerDeBodega } from './bodega';
import { clienteDrive } from './drive';
import { conectarGoogle, cuentaGoogle, disponibleGoogle, escucharGoogle, mailGoogle, permisoGoogle, pistaDeCuenta, quererGoogle, renovarGoogle, soltarGoogle, usarGoogle } from './google';
import { borrarMarcas, faltoMarcar, guardarMarcas, hayCambios, leerMarcas, marcasAlDia, sanearMarcas, sinLugarMarcas } from './marcas';
import { escucharMio, mioActual, ponerMioUnido, sanearMio, usuarioActual } from './mio';
import { escritosLlegaron } from './laboratorio/escritos';
import { esDemo } from './modoDemo';
import { archivosDe } from './propiasSaneo';
import { tokenActual } from './sesion';
import { mismasPiezas, piezas, unir } from './union';

export const TIPO_COPIA = 'super-cvg-drive';
// The shape of the copy. One with a higher number comes from a newer Super CVG: it is not read nor written over.
export const VERSION_COPIA = 1;
export const nombreCopia = (alumno) => `super-cvg-${alumno}.json`;
export const nombreArchivo = (alumno, hash) => `super-cvg-${alumno}-${hash}`;
// Changes made one after the other go together.
export const ESPERA_CAMBIOS_MS = 4000;
// Coming back to the tab more often than this does not ask Drive again.
export const VOLVER_MS = 10_000;
const REINTENTO_MS = 60_000;
// A file nobody uses any more is deleted from Drive once it is this old: another device may be about to use it.
const VIEJO_MS = 86_400_000;
// The lease among tabs where there are no Web Locks: renewed while a save lasts.
const CERROJO_MS = 120_000;

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const SIN_LUGAR = 'No hay lugar en este navegador para lo que llegó de tu Drive. Borrá algo que no uses.';
export const SIN_LUGAR_MARCAS = 'No hay lugar en este navegador para seguir guardando en tu Drive. Borrá algo que no uses.';
const NO_SE_PUDO = 'No se pudo guardar en tu Drive. Probá de nuevo en un rato.';
const NO_RESPONDE = 'Google Drive no responde ahora. Probá de nuevo en un rato.';
const OCUPADO = 'Google está ocupado. Probá de nuevo en un rato.';
export const OTRA_CUENTA = 'Esta es otra cuenta de Google que la que usabas.';
const MAS_NUEVA = 'La copia de tu Drive es de una versión más nueva de Super CVG. Recargá la página para seguir guardando.';
const BORRADA = 'La copia de tu Drive se borró desde otro dispositivo. Lo de acá quedó.';
export const RECORTADO = 'Se juntaron dos versiones y no entró todo.';
export const NO_ENTRO = 'Se juntaron tus dispositivos y no entró todo.';

const BODEGA = {
  ids: idsEnBodega,
  leer: (alumno, id) => leerDeBodega(alumno, id, ''),
  guardar: guardarEnBodega,
};

/** The SHA-256 of a file, in hex. Its bytes are in memory only while it is computed. */
export async function huellaDe(blob) {
  const digerido = await crypto.subtle.digest('SHA-256', blob.arrayBuffer ? await blob.arrayBuffer() : await new Response(blob).arrayBuffer());
  return [...new Uint8Array(digerido)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The copy as it comes from Drive, checked like a file: only known fields, types and sizes. Null if it is broken or
 * not this student's (then it can be written over). Throws if it comes from a newer Super CVG. */
export function leerCopia(texto, alumno) {
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  if (j?.tipo !== TIPO_COPIA || j.alumno !== alumno) return null;
  const version = j.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) return null;
  if (version > VERSION_COPIA) throw falla(MAS_NUEVA, 'version');
  try {
    const { t, archivos } = sanearMarcas({ t: j.t, archivos: j.archivos });
    return { datos: sanearMio(j.datos), t, archivos };
  } catch {
    return null;
  }
}

// Two copies made at once by two devices: both count, as if one were a device that never joined.
function unirCopias(a, b) {
  const r = unir({ datos: a.datos, t: a.t, d: {} }, b, { primera: true });
  return { datos: sanearMio(r.datos), t: r.t, archivos: { ...b.archivos, ...a.archivos } };
}

// What the body of an answer brings. Cut halfway, it is Drive not answering, never an empty copy.
async function cuerpo(respuesta, como) {
  try {
    return await respuesta[como]();
  } catch {
    throw falla(NO_RESPONDE, 'caido');
  }
}

const ordenado = (o) => JSON.stringify(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const mismoMapa = (a, b) => ordenado(a) === ordenado(b);
const mismaVersion = (a, b) => String(a?.version ?? '') === String(b?.version ?? '') && String(a?.modifiedTime ?? '') === String(b?.modifiedTime ?? '');
let escribiendo = false;

// Still on, for the same student: else whatever was going on stops (it was turned off, or Borrar todo lo mío).
function seguir(alumno) {
  if (!leerMarcas(alumno)?.prendido) throw falla('', 'apagado');
  if (usuarioActual() !== alumno) throw falla('', 'otro');
}

/** One save: brings the copy, joins it with what is here, brings or takes the files and leaves the copy up to date.
 * `drive`: a client of drive.js. `cuenta`: the Google account of the permission. `alAvanzar(n, total)`: which file
 * goes, when there are several. Resolves with { faltan, avisos }: files that are neither here nor in Drive, and what
 * the student should know about the join. */
export async function unaVez(alumno, drive, { bodega = BODEGA, ahora = () => Date.now(), cuenta = cuentaGoogle(), alAvanzar = () => {} } = {}) {
  // If another device saved the copy while this one was at it, once more with that one.
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const r = await unaVuelta(alumno, drive, { bodega, ahora, cuenta, alAvanzar });
    if (r) return r;
  }
  throw falla(OCUPADO, 'ocupado');
}

async function unaVuelta(alumno, drive, { bodega, ahora, cuenta, alAvanzar }) {
  const inicio = leerMarcas(alumno);
  if (!inicio?.prendido) throw falla('', 'apagado');
  // Another Google account than the one it saves in: nothing is joined, nothing goes.
  if (inicio.cuenta && cuenta && cuenta !== inicio.cuenta) throw falla(OTRA_CUENTA, 'otra-cuenta');
  let copias = await drive.listar({ nombre: nombreCopia(alumno) });
  // Not there after having saved there: asked once more before believing it.
  if (!copias.length && inicio.unido) copias = await drive.listar({ nombre: nombreCopia(alumno) });
  copias.sort((a, b) => String(a.createdTime ?? '').localeCompare(String(b.createdTime ?? '')));
  const deArchivo = new RegExp(`^super-cvg-${alumno}-([0-9a-f]{64})$`);
  const enDrive = new Map();
  for (const f of await drive.listar()) {
    const r = deArchivo.exec(f.name);
    if (r && !enDrive.has(r[1])) enDrive.set(r[1], f);
  }
  let remoto = null;
  let rota = false;
  for (const c of copias) {
    const leida = leerCopia(await cuerpo(await drive.bajar(c.id), 'text'), alumno);
    if (!leida) rota = true;
    else remoto = remoto ? unirCopias(remoto, leida) : leida;
  }

  // From here to the end of the join nothing waits: a change of the student cannot fall in the middle.
  const marcas = leerMarcas(alumno);
  seguir(alumno);
  if (sinLugarMarcas(alumno)) throw falla(SIN_LUGAR_MARCAS, 'sin-lugar');
  // It had saved in a copy that is no longer there: it was deleted on purpose, from another device or from Drive.
  if (!copias.length && marcas.unido) throw falla(BORRADA, 'borrada');
  const local = mioActual();
  // The first time, or after a change the browser had no room to note: everything here counts as changed.
  const primera = (!marcas.unido && !marcas.juntado) || faltoMarcar(alumno);
  const r = unir({ datos: local, t: marcas.t, d: marcas.d }, remoto, { primera, ahora: ahora() });
  const datos = sanearMio(r.datos);
  const avisos = [];
  if (r.recortes) avisos.push(RECORTADO);
  // What doesn't fit once joined (sanearMio has limits) goes away on every device, later than anything: if not, it
  // would come back on every join.
  const quedan = piezas(datos);
  let fuera = 0;
  for (const k of Object.keys(piezas(r.datos))) {
    if (k in quedan) continue;
    r.t[k] = Math.max(ahora(), (r.t[k] ?? 0) + 1);
    fuera += 1;
  }
  if (fuera) avisos.push(NO_ENTRO);
  if (!mismasPiezas(datos, local)) {
    // Its own write: not a change of the student's to save again.
    escribiendo = true;
    try {
      if (!ponerMioUnido(datos)) throw falla(SIN_LUGAR, 'sin-lugar');
    } finally {
      escribiendo = false;
    }
  }
  // What the copy does not have yet, with the time it has for it (union.js).
  const tR = remoto?.t ?? {};
  const d = {};
  for (const [k, s] of Object.entries(r.t)) if (tR[k] !== s) d[k] = tR[k] ?? null;
  const conocidos = { ...(remoto?.archivos ?? {}), ...marcas.archivos };
  // Joined here: a retry is no longer a first time, even if the copy could not be written yet.
  if (!guardarMarcas(alumno, { ...marcas, t: r.t, d, archivos: conocidos, juntado: true, cuenta: marcas.cuenta ?? cuenta })) throw falla(SIN_LUGAR_MARCAS, 'sin-lugar');
  if (primera) marcasAlDia(alumno);

  // The files: up the ones only here, down the ones only in Drive. Always before the copy that names them.
  // What a program wrote that is in neither place isn't counted: the next run writes it again.
  const escritos = new Set(datos.escritos.filter((e) => e.id).map((e) => e.id));
  const usados = new Set([...datos.propias.flatMap(archivosDe), ...escritos]);
  const aca = new Set(usados.size ? await bodega.ids(alumno) : []);
  const archivos = {};
  const mover = [];
  let faltan = 0;
  let llegaron = false;
  for (const id of usados) {
    const h = conocidos[id];
    if (aca.has(id)) {
      if (h && enDrive.has(h)) archivos[id] = h;
      else mover.push({ id, h, sube: true });
    } else if (h && enDrive.has(h)) mover.push({ id, h, sube: false });
    else {
      if (!escritos.has(id)) faltan += 1;
      if (h) archivos[id] = h;
    }
  }
  for (const [n, m] of mover.entries()) {
    if (mover.length > 1) alAvanzar(n + 1, mover.length);
    if (m.sube) {
      // Read once: the same bytes give the fingerprint and go up.
      const blob = await bodega.leer(alumno, m.id);
      const h = m.h ?? (await huellaDe(blob));
      if (!enDrive.has(h)) {
        const subido = await drive.subir({ nombre: nombreArchivo(alumno, h), blob: new Blob([blob], { type: 'application/octet-stream' }) });
        enDrive.set(h, { id: subido });
      }
      archivos[m.id] = h;
    } else {
      const blob = await cuerpo(await drive.bajar(enDrive.get(m.h).id), 'blob');
      if ((await huellaDe(blob)) !== m.h) {
        if (!escritos.has(m.id)) faltan += 1;
        continue;
      }
      seguir(alumno);
      await bodega.guardar(alumno, m.id, blob);
      archivos[m.id] = m.h;
      llegaron ||= escritos.has(m.id);
    }
  }
  if (mover.length > 1) alAvanzar(0, 0);
  if (llegaron) escritosLlegaron();

  const sube = !remoto || rota || copias.length > 1 || Object.keys(d).length > 0 || !mismoMapa(remoto.archivos, archivos);
  if (sube) {
    seguir(alumno);
    // Read a while ago: if another device saved it meanwhile, joined again before writing over it.
    if (copias.length) {
      if (!mismaVersion(await drive.mirar(copias[0].id), copias[0])) return null;
    } else if ((await drive.listar({ nombre: nombreCopia(alumno) })).length) return null;
    const copia = { tipo: TIPO_COPIA, version: VERSION_COPIA, alumno, cambiado: ahora(), datos, t: r.t, archivos };
    await drive.subir({ id: copias[0]?.id ?? null, nombre: nombreCopia(alumno), blob: new Blob([JSON.stringify(copia)], { type: 'application/json' }) });
    for (const c of copias.slice(1)) await drive.borrar(c.id).catch(() => {});
  }

  // Now the copy has all of that. What changed here meanwhile stays to go next time.
  const despues = leerMarcas(alumno);
  if (despues) {
    const pendientes = {};
    for (const k of Object.keys(despues.d)) if (despues.t[k] !== r.t[k]) pendientes[k] = r.t[k] ?? null;
    const listo = { ...despues, d: pendientes, archivos };
    if (!guardarMarcas(alumno, despues.prendido ? { ...listo, unido: true, ultima: ahora(), cuenta: despues.cuenta ?? cuenta } : listo)) throw falla(SIN_LUGAR_MARCAS, 'sin-lugar');
  }
  const vivos = new Set(Object.values(archivos));
  for (const [h, f] of enDrive) {
    if (!vivos.has(h) && f.createdTime && ahora() - Date.parse(f.createdTime) > VIEJO_MS) await drive.borrar(f.id).catch(() => {});
  }
  return { faltan, avisos };
}

// One at a time, also among the tabs. Without Web Locks, a lease in the storage: if it can't get it, it stops.
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function enFila(alumno, fn) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request(`super-cvg-drive-${alumno}`, fn);
  const clave = `cl.cerrojo.${alumno}`;
  const yo = String(Math.random());
  const leer = () => {
    try {
      return JSON.parse(localStorage.getItem(clave) ?? 'null');
    } catch {
      return null;
    }
  };
  const tomar = () => {
    try {
      localStorage.setItem(clave, JSON.stringify({ yo, hasta: Date.now() + CERROJO_MS }));
      return true;
    } catch {
      return false;
    }
  };
  let tengo = false;
  for (let i = 0; i < 120 && !tengo; i++) {
    const v = leer();
    if (!v || v.hasta < Date.now()) {
      if (!tomar()) break;
      await espera(40);
      tengo = leer()?.yo === yo;
    }
    if (!tengo) await espera(500);
  }
  if (!tengo) throw falla('Otra pestaña está guardando en tu Drive. Se prueba de nuevo en un rato.', 'cerrojo');
  const sigue = setInterval(() => {
    if (leer()?.yo === yo) tomar();
  }, CERROJO_MS / 3);
  try {
    return await fn();
  } finally {
    clearInterval(sigue);
    if (leer()?.yo === yo) localStorage.removeItem(clave);
  }
}

// The state of this tab: 'apagado', 'esperando', 'guardando', 'listo', 'sin-conexion', 'reconectar', 'otra-cuenta',
// 'error' or 'borrada'. `avance`: which file goes, on a save with several. `avisos`: what the joins of this tab left
// for the student to know. When it last saved is in the marks, so every tab sees it.
const VACIO = { fase: 'apagado', error: '', faltan: 0, avance: null, avisos: [] };
let estado = VACIO;
const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
const poner = (cambios) => {
  estado = { ...estado, ...cambios };
  avisar();
};

async function clienteAhora() {
  if (import.meta.env.DEV && esDemo(tokenActual())) {
    const { clienteDemo } = await import('./demoDrive');
    return permisoGoogle('drive') ? clienteDemo() : null;
  }
  if (!permisoGoogle('drive') && (!(await renovarGoogle()) || !permisoGoogle('drive'))) return null;
  return clienteDrive({ token: () => permisoGoogle('drive') });
}

let reloj = null;
let corriendo = false;
let otraVez = false;
let ultimoIntento = 0;
const programar = (ms) => {
  clearTimeout(reloj);
  reloj = setTimeout(correr, ms);
};

// Off for this device: the copy stays, and the Google account it saved in is forgotten.
function apagarPorDentro(alumno, extra = {}) {
  const m = leerMarcas(alumno);
  if (m) guardarMarcas(alumno, { ...m, prendido: false, unido: false, juntado: false, cuenta: null, ...extra });
  quererGoogle('drive', false);
  clearTimeout(reloj);
}

/** Saves now (if it is on). Resolves when it is done. */
export async function correr() {
  clearTimeout(reloj);
  const alumno = usuarioActual();
  if (!leerMarcas(alumno)?.prendido || !tokenActual()) return;
  if (corriendo) {
    otraVez = true;
    return;
  }
  corriendo = true;
  ultimoIntento = Date.now();
  const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  try {
    if (sinRed()) {
      poner({ fase: 'sin-conexion', error: '' });
      return;
    }
    // A change only in this tab's memory, for lack of room: once there is room it is written, and it goes on.
    if (sinLugarMarcas(alumno) && !guardarMarcas(alumno, leerMarcas(alumno))) {
      poner({ fase: 'error', error: SIN_LUGAR_MARCAS });
      return;
    }
    let drive = await clienteAhora();
    if (!drive) {
      poner({ fase: 'reconectar', error: '' });
      return;
    }
    poner({ fase: 'guardando', error: '', avance: null });
    const opciones = { alAvanzar: (n, total) => poner({ avance: total ? { n, total } : null }) };
    let r;
    try {
      r = await enFila(alumno, () => unaVez(alumno, drive, opciones));
    } catch (e) {
      if (e.codigo !== 'vencida') throw e;
      // Once more with a new permission, without asking anything.
      if (!(await renovarGoogle()) || !(drive = await clienteAhora())) {
        poner({ fase: 'reconectar', error: '' });
        return;
      }
      r = await enFila(alumno, () => unaVez(alumno, drive, opciones));
    }
    poner({ fase: 'listo', error: '', faltan: r.faltan, avisos: [...new Set([...estado.avisos, ...r.avisos])] });
  } catch (e) {
    // Without an answer while the browser says there is internet, or a file gone between the list and the read: Drive
    // is not answering well, and it tries again by itself.
    const codigo = e.codigo === 'no-existe' || (e.codigo === 'sin-red' && !sinRed()) ? 'caido' : e.codigo;
    if (codigo === 'apagado' || codigo === 'otro') poner({ fase: leerMarcas(usuarioActual())?.prendido ? 'esperando' : 'apagado', error: '' });
    else if (codigo === 'sin-red') poner({ fase: 'sin-conexion', error: '' });
    else if (codigo === 'vencida') poner({ fase: 'reconectar', error: '' });
    else if (codigo === 'otra-cuenta') poner({ fase: 'otra-cuenta', error: e.message });
    else if (codigo === 'borrada') {
      apagarPorDentro(alumno, { ultima: 0 });
      soltarGoogle('drive');
      poner({ fase: 'borrada', error: e.message });
    } else {
      poner({ fase: 'error', error: codigo === 'caido' ? NO_RESPONDE : e.conocido && e.message ? e.message : NO_SE_PUDO });
      if (codigo === 'ocupado' || codigo === 'caido' || codigo === 'cerrojo') programar(REINTENTO_MS);
    }
  } finally {
    corriendo = false;
    if (estado.avance) poner({ avance: null });
    if (otraVez) {
      otraVez = false;
      programar(500);
    }
  }
}

let alumnoVisto = null;
function alCambiarMio() {
  const alumno = usuarioActual();
  const marcas = leerMarcas(alumno);
  if (alumno !== alumnoVisto) {
    alumnoVisto = alumno;
    clearTimeout(reloj);
    estado = { ...VACIO, fase: marcas?.prendido ? 'esperando' : 'apagado' };
    quererGoogle('drive', Boolean(marcas?.prendido));
    avisar();
    if (marcas?.prendido) programar(0);
    return;
  }
  if (escribiendo || !marcas?.prendido || !hayCambios(marcas)) return;
  // Changed while it was saving: once more right after.
  if (corriendo) {
    otraVez = true;
    return;
  }
  // A change made here, in the tab in front: the hidden ones save when they come back.
  if (estado.fase !== 'reconectar' && estado.fase !== 'otra-cuenta' && document.visibilityState !== 'hidden') {
    programar(estado.fase === 'error' ? REINTENTO_MS : ESPERA_CAMBIOS_MS);
  }
}

function alCambiarGoogle() {
  const marcas = leerMarcas(usuarioActual());
  if (marcas?.prendido && ['reconectar', 'esperando', 'otra-cuenta'].includes(estado.fase) && permisoGoogle('drive') && !corriendo) programar(0);
  else avisar();
}

/** The Google account it saves in, for the student of this tab, or null. */
export const cuentaDeDrive = () => leerMarcas(usuarioActual())?.cuenta ?? null;

let arrancado = false;
/** Starts listening: on coming in, after each change, on coming back to the tab and on leaving it. Once. */
export function arrancarDrive() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  // While it is on, a new session renews the permission for the same account without asking.
  pistaDeCuenta(() => {
    const m = leerMarcas(usuarioActual());
    return m?.prendido ? m.cuenta : null;
  });
  escucharMio(alCambiarMio);
  escucharGoogle(alCambiarGoogle);
  document.addEventListener('visibilitychange', () => {
    const marcas = leerMarcas(usuarioActual());
    if (!marcas?.prendido) return;
    if (document.visibilityState === 'hidden') {
      // Leaving: what is pending goes now, as far as the browser lets it.
      if (hayCambios(marcas)) correr();
    } else if (Date.now() - ultimoIntento > VOLVER_MS || hayCambios(marcas)) programar(0);
  });
  window.addEventListener('online', () => {
    if (leerMarcas(usuarioActual())?.prendido) programar(0);
  });
  window.addEventListener('offline', () => {
    if (leerMarcas(usuarioActual())?.prendido && !corriendo) poner({ fase: 'sin-conexion', error: '' });
  });
  // Another tab saved or turned it on or off.
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key.startsWith('cl.sync.')) avisar();
  });
  alCambiarMio();
}

/** Turns it on. Call it straight from a click: if Google has to be asked, its window opens right away. Resolves once
 * connected, with `listo`: the first save, which goes on by itself (its state is in useDrive). */
export async function prenderDrive() {
  const alumno = usuarioActual();
  if (alumno === null) throw falla('Esperá a que carguen tus datos y probá de nuevo.', 'sin-alumno');
  if (permisoGoogle('drive')) usarGoogle('drive');
  else await conectarGoogle('drive');
  if (usuarioActual() !== alumno) return { listo: Promise.resolve() };
  const m = leerMarcas(alumno) ?? sanearMarcas({});
  // If the browser has no room, they stay in the tab and the save says so.
  guardarMarcas(alumno, { ...m, prendido: true, unido: false, juntado: false, cuenta: cuentaGoogle() });
  quererGoogle('drive', true);
  poner({ fase: 'guardando', error: '', faltan: 0, avisos: [] });
  return { listo: correr() };
}

/** On a device that came in with «Entrar con Google» (entrarConGoogle.js), where it was saving in Drive: turned on for that
 * student and account, without asking Google. The first save joins what is here with the copy once their things load. */
export function prenderDriveAlEntrar(alumno, cuenta) {
  const m = sanearMarcas(leerMarcas(alumno) ?? {});
  if (m.prendido) return;
  guardarMarcas(alumno, { ...m, prendido: true, unido: false, juntado: false, cuenta });
  quererGoogle('drive', true);
}

/** After «Esta es otra cuenta de Google»: saves in this account from now on, joining what is here with its copy. */
export function usarEstaCuenta() {
  const alumno = usuarioActual();
  const m = leerMarcas(alumno);
  if (!m?.prendido) return Promise.resolve();
  guardarMarcas(alumno, { ...m, unido: false, juntado: false, cuenta: cuentaGoogle() });
  poner({ fase: 'guardando', error: '' });
  return correr();
}

/** Dejar de guardar: what is here stays, the copy in Drive too. If Classroom isn't on, Google is told. */
export function apagarDrive() {
  apagarPorDentro(usuarioActual());
  soltarGoogle('drive');
  poner({ ...VACIO });
}

/** Deletes the copy (the data and the files) from the student's Drive, and stops saving. What is here stays. Call it
 * from a click: without the permission (Dejar de guardar gave it back), Google's window opens for it. */
export async function borrarCopiaDrive() {
  const alumno = usuarioActual();
  if (alumno === null) throw falla(NO_SE_PUDO, 'sin-alumno');
  const cuenta = leerMarcas(alumno)?.cuenta ?? null;
  let conPermiso = Boolean(permisoGoogle('drive'));
  try {
    if (!conPermiso) {
      await conectarGoogle('drive', { cuenta });
      conPermiso = true;
    }
    if (cuenta && cuentaGoogle() && cuentaGoogle() !== cuenta) throw falla(`${OTRA_CUENTA} Volvé a conectar con esa para borrar la copia.`, 'otra-cuenta');
    const drive = await clienteAhora();
    if (!drive) throw falla('Volvé a conectar tu Drive para borrar la copia.', 'reconectar');
    apagarPorDentro(alumno);
    await enFila(alumno, async () => {
      // The kept live sessions too (enVivo/sesionesEnDrive.js).
      const deEste = new RegExp(`^super-cvg-${alumno}(\\.json|-[0-9a-f]{64}|-envivo-[0-9a-f]{32}\\.json)$`);
      for (const f of await drive.listar()) if (deEste.test(f.name)) await drive.borrar(f.id);
    });
    const m = leerMarcas(alumno);
    if (m) guardarMarcas(alumno, { ...m, prendido: false, unido: false, juntado: false, archivos: {}, ultima: 0, cuenta: null });
    poner({ ...VACIO });
  } finally {
    // The permission was only for this: given back.
    if (conPermiso && !leerMarcas(alumno)?.prendido) soltarGoogle('drive');
  }
}

/** Estudiar en vivo (enVivo/sesionesEnDrive.js): `fn(drive, alumno)` with the same permission and account, one at a
 * time with the rest of the saves. Null if it is off, without internet or without the permission now. */
export async function conDrive(fn) {
  const alumno = usuarioActual();
  const m = leerMarcas(alumno);
  if (!m?.prendido || !tokenActual() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return null;
  if (m.cuenta && cuentaGoogle() && cuentaGoogle() !== m.cuenta) return null;
  const drive = await clienteAhora();
  return drive ? enFila(alumno, () => fn(drive, alumno)) : null;
}

/** For «Borrar todo lo mío»: this device stops saving and forgets what it kept for it. */
export function olvidarDrive() {
  const alumno = usuarioActual();
  const prendido = leerMarcas(alumno)?.prendido;
  apagarPorDentro(alumno);
  borrarMarcas(alumno);
  if (prendido) soltarGoogle('drive');
  poner({ ...VACIO });
}

/** Whether there may be a copy in Drive to delete: it is on, or it saved there before. */
export const hayCopiaDrive = () => {
  const m = leerMarcas(usuarioActual());
  return Boolean(m?.prendido || m?.ultima);
};

const leerEstado = () => {
  const marcas = leerMarcas(usuarioActual());
  return {
    disponible: disponibleGoogle(),
    prendido: Boolean(marcas?.prendido),
    ultima: marcas?.ultima ?? 0,
    copia: Boolean(marcas?.prendido || marcas?.ultima),
    conectado: Boolean(permisoGoogle('drive')),
    email: mailGoogle(),
    ...estado,
  };
};
/** The same, outside React. */
export const estadoDrive = leerEstado;
let foto = { clave: '', valor: null };
const instantanea = () => {
  const v = leerEstado();
  const clave = JSON.stringify(v);
  if (clave !== foto.clave) foto = { clave, valor: v };
  return foto.valor;
};
const APAGADO = { disponible: false, prendido: false, ultima: 0, copia: false, conectado: false, email: '', ...VACIO };

/** { disponible, prendido, fase, ultima, copia, error, faltan, avance, avisos, conectado, email }, and the screen
 * redraws when it changes. */
export function useDrive() {
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
