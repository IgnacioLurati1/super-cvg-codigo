import { useSyncExternalStore } from 'react';
import { normalizar } from './datos';
import { resumenDe } from './santoResumen';
import { leerExamenes } from './sysacadExamenes';
import { leerPestanas } from './sysacadPestanas';

// Sysacad Lindo, the browser extension of Luta Studios for Sysacad, hands this page the final grade of each passed
// subject, in this same window (postMessage). Those grades live only in memory, like the campus data: no storage, no
// address, and they are never sent anywhere. This page asks when it loads and again when the tab comes back into view.
// The extension always answers if it is there; no answer in a moment means it is not installed (or is an old version).
//   page to extension   { fuente: 'super-cvg', pide: 'sysacad' | 'vincular' | 'desvincular' }
//   extension to page   { fuente: 'sysacad-lindo', para: 'super-cvg', v: 1, vinculada, fecha?, finales?: [{ nombre, nota }] }
// `fecha` and `finales` come only once it is linked and has read Estado académico. Anything else is ignored.
// Since 2.4.0 it also answers `pide: 'pestanas'` with its copies of the tabs of Sysacad (v: 2, sysacadPestanas.js), and
// since 2.5.0 `pide: 'examenes'` with the exams the student signed up for (v: 3, sysacadExamenes.js).

export const SYSACAD = 'https://alumnos.frro.utn.edu.ar/';
export const SYSACAD_LINDO = 'https://lutastudios.com/utn/sysacad-lindo.html';
export const ESPERA_MS = 1500;
const MAX_FINALES = 80;
const MAX_NOMBRE = 120;
const DIA_MS = 86_400_000;
const CLAVES = new Set(['fuente', 'para', 'v', 'vinculada', 'fecha', 'finales']);
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]+/g;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** What a message of the extension says, as { vinculada, fecha, finales }, or null if it is not exactly one.
 * `fecha` and `finales` are null until it has read Estado académico. */
export function leerMensaje(datos, ahora = Date.now()) {
  if (!esObjeto(datos) || Object.keys(datos).some((k) => !CLAVES.has(k))) return null;
  if (datos.fuente !== 'sysacad-lindo' || datos.para !== 'super-cvg' || datos.v !== 1 || typeof datos.vinculada !== 'boolean') return null;
  const { fecha, finales } = datos;
  if ((fecha === undefined) !== (finales === undefined)) return null;
  if (fecha === undefined) return { vinculada: datos.vinculada, fecha: null, finales: null };
  if (!datos.vinculada) return null;
  // Read on this same computer: a date from the future (beyond a clock a little off) is not a real one.
  if (!Number.isSafeInteger(fecha) || fecha <= 0 || fecha > ahora + DIA_MS) return null;
  if (!Array.isArray(finales) || finales.length > MAX_FINALES) return null;
  const limpios = [];
  for (const f of finales) {
    if (!esObjeto(f) || Object.keys(f).length !== 2 || typeof f.nombre !== 'string' || typeof f.nota !== 'number') return null;
    if (f.nombre.length > MAX_NOMBRE || !Number.isFinite(f.nota) || f.nota < 1 || f.nota > 10) return null;
    const nombre = f.nombre.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
    if (!nombre) return null;
    limpios.push({ nombre, nota: f.nota });
  }
  return { vinculada: true, fecha, finales: limpios };
}

// Matching a Sysacad subject with a campus course. A campus course name carries extra things («Física II - 2026 -
// 2K3», «Análisis Matemático I - Comisión 1K1») and Sysacad marks electives «(Elec.)»: those go before comparing.
// What is left is compared word by word, without accents, capitals or small words, with 1 to 6 as Roman numerals.
const VACIAS = new Set(['a', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'para', 'y', 'elec', 'electiva']);
const ROMANOS = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', 6: 'vi' };
const NUMERALES = new Set(Object.values(ROMANOS));
const SOBRA = [
  /\(\s*elec[a-z]*\.?\s*\)/g,
  /\bcomision(es)?\b[\s.:#-]*[a-z0-9]*/g,
  /\bcom\b\.?[\s:#-]*[a-z0-9]*/g,
  /\b\d+[a-z]\d+\b/g,
  /\b(19|20)\d{2}\b/g,
  /\b\d+\s*(er|do|ro|°|º)?\s*cuat[a-z]*\b/g,
];

const limpiar = (texto) => SOBRA.reduce((t, re) => t.replace(re, ' '), normalizar(texto));
export const palabrasDe = (texto) =>
  limpiar(texto)
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !VACIAS.has(p))
    .map((p) => ROMANOS[p] ?? p);
const numerales = (palabras) => [...palabras].filter((p) => NUMERALES.has(p)).sort().join(' ');

// The most specific one wins («Física II» over a bare «Física»). A tie between different subjects is no match: better
// no grade than the grade of another subject.
function elegir(candidatos) {
  let mejores = [];
  for (const c of candidatos) {
    if (!mejores.length || c.palabras.size > mejores[0].palabras.size) mejores = [c];
    else if (c.palabras.size === mejores[0].palabras.size) mejores.push(c);
  }
  return new Set(mejores.map((c) => c.clave)).size === 1 ? mejores[0] : null;
}

/** The Sysacad final of each campus course: a Map from the course id to { nombre, nota }. A course gets a final when
 * its name has every word of the subject. If not, they still match when El Santo Resumen's list says they are the same
 * subject and their numerals agree, for a Sysacad name with words the campus left out. */
export function unirFinales(materias, finales) {
  const unidos = new Map();
  if (!finales?.length) return unidos;
  const conocidos = finales.map((f) => {
    const palabras = new Set(palabrasDe(f.nombre));
    return { ...f, palabras, clave: [...palabras].sort().join(' '), slug: resumenDe(limpiar(f.nombre))?.slug ?? null };
  }).filter((c) => c.palabras.size);
  for (const m of materias) {
    const del = new Set(palabrasDe(m.nombre));
    if (!del.size) continue;
    let f = elegir(conocidos.filter((c) => [...c.palabras].every((p) => del.has(p))));
    if (!f) {
      const slug = resumenDe(limpiar(m.nombre))?.slug;
      if (slug) f = elegir(conocidos.filter((c) => c.slug === slug && numerales(c.palabras) === numerales(del)));
    }
    if (f) unidos.set(m.id, { nombre: f.nombre, nota: f.nota });
  }
  return unidos;
}

/** The Sysacad finals that no campus course got: subjects passed that are not on the campus. Once each, by name. */
export function finalesSinCurso(finales, unidos) {
  if (!finales?.length) return [];
  const usados = new Set([...unidos.values()].map((f) => f.nombre));
  const vistos = new Set();
  return finales
    .filter((f) => !usados.has(f.nombre) && !vistos.has(f.nombre) && vistos.add(f.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// Sysacad may write a name all in capitals («ALGORITMOS Y ESTRUCTURAS DE DATOS»). Shown on its own, it goes as the
// campus writes them: a capital per word, small words in lower case and Roman numerals whole. Any other name stays.
const CHICAS = new Set(['a', 'al', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'o', 'para', 'por', 'u', 'y']);
const ROMANO = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

/** The name of a Sysacad subject to show it on its own. */
export function nombreParaMostrar(nombre) {
  if (/\p{Ll}/u.test(nombre) || !/\p{Lu}/u.test(nombre)) return nombre;
  return nombre
    .toLocaleLowerCase('es')
    .split(/(\s+)/)
    .map((p, i) => {
      if (ROMANO.test(p)) return p.toUpperCase();
      if (i > 0 && CHICAS.has(p)) return p;
      return p.replace(/\p{L}/u, (l) => l.toLocaleUpperCase('es'));
    })
    .join('');
}

/** A grade as the site writes it: «7», «7,5». */
export const notaComoTexto = (n) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

// What is known about the extension, in memory. `estado`: 'buscando' (no answer yet), 'sin-extension', 'sin-vincular'
// or 'vinculada'. `pidio`: the student touched «Vincular» in this tab. `copias`: what it said of the tabs of Sysacad
// ({ vinculada, guarda, alumno, pestanas }), null until it does; `sinCopias`: a moment went by and it did not (with an
// answer to the finals, it is a version from before 2.4.0). `examenes`: what it said of the exams ({ vinculada, alumno,
// fecha, examenes }), null until it does (one from before 2.5.0 never does). `deDrive`: when the copy in the student's
// Drive was saved, while what is shown came from there and not from the extension (sysacadEnDrive.js); null otherwise.
// `buscandoDrive`: that copy is on its way.
const INICIAL = { estado: 'buscando', fecha: null, finales: null, pidio: false, copias: null, sinCopias: false, examenes: null, deDrive: null, buscandoDrive: false };
let actual = INICIAL;
const avisados = new Set();
function poner(cambios) {
  actual = { ...actual, ...cambios };
  avisados.forEach((f) => f());
}

/** What is known now. A screen uses useSysacad, which redraws when it changes. */
export const estadoSysacad = () => actual;

/** Calls `f` on every change of what is known. Returns how to stop. */
export function escucharSysacad(f) {
  avisados.add(f);
  return () => avisados.delete(f);
}

export function useSysacad() {
  return useSyncExternalStore(escucharSysacad, estadoSysacad, () => INICIAL);
}

// The last message of each kind the extension sent, exactly as it came and already checked: what sysacadEnDrive.js
// saves in the student's Drive. In memory only, like the rest.
const SIN_CRUDOS = { finales: null, pestanas: null, examenes: null };
let crudos = SIN_CRUDOS;
/** The last checked message of each kind from the extension, or null. */
export const crudosSysacad = () => crudos;

let oido = false;
let oidoCopias = false;
let reloj = null;
const pedir = (pide) => window.postMessage({ fuente: 'super-cvg', pide }, window.location.origin);

/** Asks the extension for the grades and the tabs. Until it has answered once in this page, no answer in a moment means
 * it is not there (or, if only the finals came, that it is an old one). Once it has, a missed answer keeps what it said. */
export function preguntarSysacad() {
  pedir('sysacad');
  pedir('pestanas');
  pedir('examenes');
  if (oido && oidoCopias) return;
  clearTimeout(reloj);
  reloj = setTimeout(() => {
    if (!oido) poner({ estado: 'sin-extension' });
    if (!oidoCopias) poner({ sinCopias: true });
  }, ESPERA_MS);
}

// What came from Drive leaves as soon as the extension says anything: from then on, only what it says.
const sinLoDeDrive = () => (actual.deDrive ? { deDrive: null, estado: oido ? actual.estado : 'sin-extension', fecha: null, finales: null, copias: null, examenes: null } : {});

function recibir(e) {
  if (e.source !== window || e.origin !== window.location.origin) return;
  const m = leerMensaje(e.data);
  if (m) {
    crudos = { ...crudos, finales: structuredClone(e.data) };
    // The extension answers this one on its own once it loads, but not the tabs or the exams: asked before it was
    // listening, they are asked again now.
    if (!oido && !oidoCopias) {
      pedir('pestanas');
      pedir('examenes');
    }
    oido = true;
    if (oidoCopias) clearTimeout(reloj);
    poner({ estado: m.vinculada ? 'vinculada' : 'sin-vincular', fecha: m.fecha, finales: m.finales, ...(actual.deDrive && { deDrive: null, copias: null, examenes: null }) });
    return;
  }
  const examenes = leerExamenes(e.data);
  if (examenes) {
    crudos = { ...crudos, examenes: structuredClone(e.data) };
    // Sysacad may write a subject all in capitals: it goes as the campus writes them.
    poner({ ...sinLoDeDrive(), examenes: { ...examenes, examenes: examenes.examenes.map((x) => ({ ...x, materia: nombreParaMostrar(x.materia) })) } });
    return;
  }
  const copias = leerPestanas(e.data);
  if (!copias) return;
  crudos = { ...crudos, pestanas: structuredClone(e.data) };
  oidoCopias = true;
  if (oido) clearTimeout(reloj);
  poner({ ...sinLoDeDrive(), copias, sinCopias: false });
}

let iniciado = false;
/** Once, when the app loads: listens to the extension, asks now and every time the tab comes back into view. */
export function iniciarSysacad() {
  if (iniciado || typeof window === 'undefined') return;
  iniciado = true;
  window.addEventListener('message', recibir);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') preguntarSysacad();
  });
  preguntarSysacad();
}

/** «Vincular». Call it straight from the click, or the browser blocks the new tab: the extension is told, and Sysacad
 * opens for the student to sign in and open Estado académico. */
export function vincularSysacad() {
  pedir('vincular');
  window.open(SYSACAD, '_blank', 'noopener');
  poner({ pidio: true });
}

const SIN_COPIAS = { vinculada: false, guarda: false, alumno: null, pestanas: [] };
const SIN_EXAMENES = { vinculada: false, alumno: null, fecha: null, examenes: [] };

/** «Desvincular»: the extension forgets the link (and with it, the copies of the tabs and the exams), and the grades
 * leave memory. */
export function desvincularSysacad() {
  pedir('desvincular');
  poner({ estado: 'sin-vincular', fecha: null, finales: null, pidio: false, ...(actual.copias && { copias: SIN_COPIAS }), ...(actual.examenes && { examenes: SIN_EXAMENES }) });
}

/** Drops the grades, the exams and the copies of the tabs from memory. The next answer of the extension brings them
 * back. */
export function olvidarSysacad() {
  crudos = SIN_CRUDOS;
  if (actual.deDrive) {
    // Nothing of it came from this browser: back to what the extension said, which is nothing.
    poner({ estado: 'sin-extension', fecha: null, finales: null, examenes: null, copias: null, sinCopias: true, deDrive: null });
    return;
  }
  if (actual.finales || actual.fecha || actual.copias?.pestanas.length || actual.copias?.alumno || actual.examenes) {
    poner({ fecha: null, finales: null, examenes: null, ...(actual.copias && { copias: { ...actual.copias, alumno: null, pestanas: [] } }) });
  }
}

/** While sysacadEnDrive.js looks for the copy in Drive. */
export function buscandoEnDrive(si) {
  if (actual.buscandoDrive !== si) poner({ buscandoDrive: si });
}

/** What the copy in the student's Drive says (sysacadEnDrive.js), shown as if the extension had said it, only where it is
 * not there. Each piece was read with the same checks as the extension's messages. */
export function ponerDesdeDrive({ guardado, finales, copias, examenes }) {
  if (oido || oidoCopias || crudos.examenes || actual.estado !== 'sin-extension') return;
  poner({
    estado: finales ? 'vinculada' : 'sin-extension',
    fecha: finales?.fecha ?? null,
    finales: finales?.finales ?? null,
    copias,
    sinCopias: !copias,
    examenes: examenes ? { ...examenes, examenes: examenes.examenes.map((x) => ({ ...x, materia: nombreParaMostrar(x.materia) })) } : null,
    deDrive: guardado,
  });
}

/** Salir, or «Borrar las copias» when they are someone else's: the extension deletes its copies of the tabs, and they leave
 * memory. It answers with what is left. */
export function olvidarPestanasSysacad() {
  if (typeof window === 'undefined') return;
  pedir('olvidar-pestanas');
  if (actual.copias) poner({ copias: { ...actual.copias, alumno: null, pestanas: [] } });
}
