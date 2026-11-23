import { cargarPerfil } from './campus';
import { escucharMio, usuarioActual } from './mio';
import { esDemo } from './modoDemo';
import { sesionRecordada, tokenActual } from './sesion';
import { conDrive } from './sincro';
import { recordar, recuperar } from './sinInternet';
import { buscandoEnDrive, crudosSysacad, escucharSysacad, estadoSysacad, leerMensaje, ponerDesdeDrive } from './sysacad';
import { leerExamenes } from './sysacadExamenes';
import { leerPestanas, mismoAlumno } from './sysacadPestanas';

// What Sysacad Lindo hands this page (sysacad.js), in the student's Drive with «Guardar en tu Google Drive» on
// (sincro.js), so the phone, where the extension can't go, shows Sysacad and Tu carrera too. One file in the hidden
// folder, `super-cvg-<student>-sysacad.json`, with the last message of each kind exactly as the extension sent it: the
// finals, the copies of the tabs and the exams.
//   - Saved from a browser with the extension, linked, and only when its copies say they are of this campus student.
//   - Read where the extension doesn't answer, with the same checks as the extension's messages, into memory. With
//     «Seguir conectado», that device also keeps the file's text for when there is no internet (sinInternet.js, `sysacad`):
//     Salir deletes it, and Drive without the copy blanks it.
//   - Unlinked in a browser where it was linked, the file goes. «Borrar la copia de tu Drive» takes it too.
// A newer copy in Drive (another computer read Sysacad later) is never written over by an older one.

export const TIPO = 'super-cvg-sysacad';
export const VERSION = 1;
export const nombreEnDrive = (alumno) => `super-cvg-${alumno}-sysacad.json`;
// The biggest the three messages can be with every limit of the extension's contract is far less than this.
const MAX_TEXTO = 4 * 1024 * 1024;
const ESPERA_MS = 3000;
const VOLVER_MS = 5 * 60_000;
const REINTENTO_MS = 30_000;
const PIEZAS = ['finales', 'pestanas', 'examenes'];

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** When the newest piece was read in Sysacad: the copies, the finals and the exams each say it. 0 without any. */
export function fechaDe({ finales, pestanas, examenes }) {
  return Math.max(0, finales?.fecha ?? 0, examenes?.fecha ?? 0, ...(pestanas?.pestanas ?? []).map((p) => p.fecha));
}

/** What of the extension's messages goes to Drive: only what it read while linked, and the copies only if it keeps them.
 * Null when there is nothing. */
export function piezasParaGuardar(crudos) {
  const r = {
    finales: crudos.finales?.vinculada && crudos.finales.fecha !== undefined ? crudos.finales : null,
    pestanas: crudos.pestanas?.vinculada && crudos.pestanas.guarda && crudos.pestanas.pestanas?.length ? crudos.pestanas : null,
    examenes: crudos.examenes?.vinculada && crudos.examenes.fecha ? crudos.examenes : null,
  };
  return PIEZAS.some((k) => r[k]) ? r : null;
}

/** Whether the pieces are of the campus student `completo`: the copies and the exams carry the Sysacad name, and every
 * name there has to match. Without any name (only the finals), nothing says whose they are, so they don't go. */
export function sonDelAlumno(piezas, completo) {
  const nombres = [piezas.pestanas?.alumno, piezas.examenes?.alumno].filter((n) => typeof n === 'string' && n);
  return Boolean(completo) && nombres.length > 0 && nombres.every((n) => mismoAlumno(n, completo));
}

/** The file as it goes to Drive. */
export const armarCopia = (alumno, piezas, ahora = Date.now()) => ({ tipo: TIPO, version: VERSION, alumno, guardado: ahora, ...piezas });

/** The file as it comes from Drive: { guardado, piezas, finales, copias, examenes } with each piece read like the
 * extension's message, { nueva: true } (from a newer Super CVG: left alone) or null (broken or someone else's). */
export function leerCopiaSysacad(texto, alumno, ahora = Date.now()) {
  if (typeof texto !== 'string' || texto.length > MAX_TEXTO) return null;
  let j;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(j) || j.tipo !== TIPO || j.alumno !== alumno || !Number.isSafeInteger(j.version) || j.version < 1) return null;
  if (j.version > VERSION) return { nueva: true };
  if (!Number.isSafeInteger(j.guardado) || j.guardado <= 0) return null;
  const piezas = { finales: j.finales ?? null, pestanas: j.pestanas ?? null, examenes: j.examenes ?? null };
  const finales = piezas.finales && leerMensaje(piezas.finales, ahora);
  const copias = piezas.pestanas && leerPestanas(piezas.pestanas, ahora);
  const examenes = piezas.examenes && leerExamenes(piezas.examenes, ahora);
  // One piece that doesn't pass, and none of it is used.
  if ((piezas.finales && !finales?.fecha) || (piezas.pestanas && !copias) || (piezas.examenes && !examenes)) return null;
  if (!finales && !copias && !examenes) return null;
  return { guardado: j.guardado, piezas, finales: finales || null, copias: copias || null, examenes: examenes || null };
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function buscar(drive, alumno) {
  const [f] = await drive.listar({ nombre: nombreEnDrive(alumno) });
  if (!f) return { f: null, alla: null };
  const r = await drive.bajar(f.id);
  return { f, alla: leerCopiaSysacad(await r.text(), alumno) };
}

/** Saves the extension's pieces over the copy in Drive (`drive`: a client of drive.js), unless that one is newer or says
 * the same: 'guardada', 'igual' or 'mas-nueva'. guardarEnDrive does it with the student's Drive, null if it is off. */
export async function guardarCon(drive, alumno, piezas, ahora = Date.now()) {
  const { f, alla } = await buscar(drive, alumno);
  if (alla?.nueva) return 'mas-nueva';
  if (alla && fechaDe(alla.piezas) > fechaDe(piezas)) return 'mas-nueva';
  if (alla && igual(alla.piezas, piezas)) return 'igual';
  const blob = new Blob([JSON.stringify(armarCopia(alumno, piezas, ahora))], { type: 'application/json' });
  await drive.subir({ id: f?.id ?? null, nombre: nombreEnDrive(alumno), blob });
  return 'guardada';
}
export const guardarEnDrive = (piezas) => conDrive((drive, alumno) => guardarCon(drive, alumno, piezas));

/** The copy in Drive, read; false when there is none; null when broken or newer. traerDeDrive: the same with the
 * student's Drive, null also when it is off or without internet. */
export async function traerCon(drive, alumno) {
  const { f, alla } = await buscar(drive, alumno);
  if (alla?.nueva) return null;
  // No copy at all: false, so what this device kept goes too.
  return alla ?? (f ? null : false);
}
export const traerDeDrive = () => conDrive(traerCon);

/** Deletes the copy from Drive. */
export function borrarDeDrive() {
  return conDrive(async (drive, alumno) => {
    for (const f of await drive.listar({ nombre: nombreEnDrive(alumno) })) await drive.borrar(f.id);
    return true;
  });
}

// ---------- Without internet ----------

const EN_DISCO = 'sysacad';
const token = () => {
  const t = tokenActual();
  return t && !esDemo(t) && sesionRecordada() ? t : null;
};

function guardarSinInternet(alumno, texto) {
  const t = token();
  return t ? recordar(EN_DISCO, texto, { token: t, alumno }).catch(() => {}) : Promise.resolve();
}

async function deSinInternet(alumno) {
  const t = token();
  const r = t ? await recuperar(EN_DISCO, t).catch(() => null) : null;
  const leida = r && typeof r.datos === 'string' && r.datos ? leerCopiaSysacad(r.datos, alumno) : null;
  return leida && !leida.nueva ? leida : null;
}

// ---------- When ----------

let reloj = null;
let guardado = '';
let traido = 0;
let vinculadaAca = false;
let alumnoVisto = null;

async function guardarSiHaceFalta() {
  const alumno = usuarioActual();
  const piezas = piezasParaGuardar(crudosSysacad());
  if (alumno === null || !piezas) return;
  const clave = `${alumno}:${JSON.stringify(piezas)}`;
  if (clave === guardado) return;
  const perfil = await cargarPerfil().catch(() => null);
  if (usuarioActual() !== alumno || !sonDelAlumno(piezas, perfil?.completo)) return;
  const r = await guardarEnDrive(piezas).catch(() => null);
  if (r) guardado = clave;
}

async function traerSiHaceFalta() {
  const alumno = usuarioActual();
  if (alumno === null || estadoSysacad().estado !== 'sin-extension' || Date.now() - traido < VOLVER_MS) return;
  traido = Date.now();
  buscandoEnDrive(true);
  try {
    let leida = await traerDeDrive().catch(() => null);
    if (leida) guardarSinInternet(alumno, JSON.stringify(armarCopia(alumno, leida.piezas, leida.guardado)));
    else if (leida === false) {
      guardarSinInternet(alumno, '');
      leida = null;
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) leida = await deSinInternet(alumno);
    // Nothing there, or Drive off: another try in a while (or on coming in, or turning it on), never right away. Every
    // change of the state calls this again, so going back to 0 here would ask Drive in a loop.
    if (!leida) traido = Date.now() - VOLVER_MS + REINTENTO_MS;
    if (!leida || usuarioActual() !== alumno) return;
    esperando = { alumno, leida };
    await ponerSiEsSuya();
  } finally {
    buscandoEnDrive(false);
  }
}

// The same check as saving: copies of someone else never show, even if they got there. A copy with another name
// waits here: the student's «Sí, son mías» from the computer may still be on its way from Drive (mio.sysacadSuyo).
let esperando = null;
async function ponerSiEsSuya() {
  const e = esperando;
  if (!e || usuarioActual() !== e.alumno) return;
  const perfil = await cargarPerfil().catch(() => null);
  if (esperando !== e || usuarioActual() !== e.alumno || !sonDelAlumno(e.leida.piezas, perfil?.completo)) return;
  esperando = null;
  ponerDesdeDrive(e.leida);
}

function alCambiar() {
  const alumno = usuarioActual();
  if (alumno !== alumnoVisto) {
    alumnoVisto = alumno;
    vinculadaAca = false;
    guardado = '';
    traido = 0;
    esperando = null;
  }
  const { estado, deDrive, copias, examenes } = estadoSysacad();
  // Any message of the extension in this page (each kind may come alone) means it is here.
  const conExtension = !deDrive && Object.values(crudosSysacad()).some(Boolean);
  const vinculada = conExtension && (estado === 'vinculada' || Boolean(copias?.vinculada) || Boolean(examenes?.vinculada));
  if (vinculada) vinculadaAca = true;
  // Unlinked here, after being linked in this tab: the copy in Drive goes too.
  if (conExtension && !vinculada && vinculadaAca) {
    vinculadaAca = false;
    guardado = '';
    borrarDeDrive().catch(() => {});
    return;
  }
  clearTimeout(reloj);
  if (vinculada) reloj = setTimeout(guardarSiHaceFalta, ESPERA_MS);
  else if (!conExtension && estado === 'sin-extension') {
    if (esperando) ponerSiEsSuya();
    traerSiHaceFalta();
  } else esperando = null;
}

let arrancado = false;
/** Once, when the app loads (main.jsx). */
export function arrancarSysacadEnDrive() {
  if (arrancado || typeof window === 'undefined') return;
  arrancado = true;
  escucharSysacad(alCambiar);
  // Coming in (or Drive joining what's here) is a change of the student's things.
  escucharMio(alCambiar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') alCambiar();
  });
  alCambiar();
}
