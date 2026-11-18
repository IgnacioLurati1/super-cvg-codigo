import { esLenguaje, LENGUAJES } from './lenguajes';

// The student's files of the lab, as they are kept in mio.js (`laboratorio`) and travel to their Drive: their name,
// language, code and course. Nothing of the campus: the course goes by its number, and code that came from a PDF only
// gets here once the student saves it as theirs. Everything that comes from a file or from Drive passes through here.
export const MAX_ARCHIVOS = 60;
export const MAX_CODIGO = 20_000;
export const MAX_NOMBRE = 80;
// All the code together: the browser keeps everything of the student in one place, with room for the rest.
export const MAX_TOTAL = 400_000;

export const esIdDeArchivo = (id) => typeof id === 'string' && /^l[0-9a-z]{6,24}$/.test(id);
// A campus course (its number) or one of the student's own (its id).
const esMateria = (m) => (typeof m === 'number' && Number.isSafeInteger(m) && m > 0 && m < 1e12) || (typeof m === 'string' && /^p[0-9a-z]{6,20}$/.test(m));
const esMomento = (n) => Number.isSafeInteger(n) && n > 0;

/** A name for a file: one line, without what doesn't print, and short. */
export const nombreValido = (n) => (typeof n === 'string' ? n.replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE).trim() : '');

// Projects (IDE, docs/laboratorio-ide.md): a file may belong to one (`proyecto`, its id) and say its own extension
// (`ext`): a header, or data the program reads and writes. Without them it's a file on its own, as before; a device
// with an older version of the site drops both and shows it that way, without losing it.
export const MAX_PROYECTOS = 30;
export const esIdDeProyecto = (id) => typeof id === 'string' && /^q[0-9a-z]{6,24}$/.test(id);
// What each language's project may hold besides its own code: what the program includes or reads.
export const EXTENSIONES = { python: ['py', 'txt', 'csv', 'dat', 'json'], c: ['c', 'h', 'txt', 'csv', 'dat'], sql: ['sql', 'csv', 'der'], javascript: ['js', 'json', 'txt', 'csv'] };
export const esExtension = (lenguaje, ext) => Boolean(EXTENSIONES[lenguaje]?.includes(ext));

// Test cases (casos.js): what the program reads, one line per read, and what it should print. They go with the file on
// its own or with the project (`casos`), only text and within limits. An older version of the site drops them from the
// item but not from the student's Drive: they travel as an element of their own (`labt/<id>`, union.js).
export const MAX_CASOS = 30;
export const MAX_ENTRADA = 4_000;
export const MAX_ESPERADA = 8_000;
// All the cases of the student together, files and projects: room for 30 full lists, never the whole browser.
export const MAX_TOTAL_CASOS = 150_000;
export const esIdDeCaso = (id) => typeof id === 'string' && /^c[0-9a-z]{4,24}$/.test(id);
// Text as it's typed: lines end in \n, without what doesn't print but the tab.
const textoDeCaso = (t, tope) => (typeof t === 'string' ? t.replace(/\r\n?/g, '\n').replace(/(?![\n\t])[\p{Cc}\p{Zl}\p{Zp}]/gu, '').slice(0, tope) : '');

export function sanearCaso(c) {
  if (!c || typeof c !== 'object' || !esIdDeCaso(c.id)) return null;
  return {
    id: c.id,
    nombre: nombreValido(c.nombre),
    entrada: textoDeCaso(c.entrada, MAX_ENTRADA),
    esperada: textoDeCaso(c.esperada, MAX_ESPERADA),
    ...(c.exacto === true ? { exacto: true } : {}),
  };
}

const largoDeCasos = (casos) => casos.reduce((n, c) => n + c.nombre.length + c.entrada.length + c.esperada.length, 0);

/** The cases of a file or a project: in their order, without repeats and up to MAX_CASOS. */
export function sanearCasos(lista) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista.slice(0, MAX_CASOS * 2) : [])
    .map(sanearCaso)
    .filter((c) => c && !vistos.has(c.id) && vistos.add(c.id))
    .slice(0, MAX_CASOS);
}

const casosDe = (x) => {
  const casos = sanearCasos(x.casos);
  return casos.length ? { casos } : {};
};

// What a list of files or projects keeps of their cases: each one's, while they all fit in `cuenta.queda`.
function dentroDelTope(item, cuenta) {
  if (!item.casos) return item;
  const largo = largoDeCasos(item.casos);
  if (cuenta.queda >= largo) {
    cuenta.queda -= largo;
    return item;
  }
  const { casos: _fuera, ...resto } = item;
  return resto;
}

/** Whether `casos` fit in place of the ones of `id` (a file or a project) among everything of the student. */
export function cabenCasos(mio, id, casos) {
  const otros = [...(mio?.laboratorio ?? []), ...(mio?.proyectosLab ?? [])].filter((x) => x.id !== id);
  return casos.length <= MAX_CASOS && otros.reduce((n, x) => n + largoDeCasos(x.casos ?? []), 0) + largoDeCasos(casos) <= MAX_TOTAL_CASOS;
}

export function sanearArchivo(a) {
  if (!a || typeof a !== 'object' || !esIdDeArchivo(a.id) || !esLenguaje(a.lenguaje)) return null;
  const nombre = nombreValido(a.nombre);
  if (!nombre) return null;
  return {
    id: a.id,
    nombre,
    lenguaje: a.lenguaje,
    codigo: typeof a.codigo === 'string' ? a.codigo.replace(/\r\n?/g, '\n').slice(0, MAX_CODIGO) : '',
    materia: esMateria(a.materia) ? a.materia : null,
    creado: esMomento(a.creado) ? a.creado : 0,
    cambiado: esMomento(a.cambiado) ? a.cambiado : 0,
    ...(esIdDeProyecto(a.proyecto) ? { proyecto: a.proyecto } : {}),
    ...(esExtension(a.lenguaje, a.ext) && a.ext !== LENGUAJES[a.lenguaje].extension ? { ext: a.ext } : {}),
    ...casosDe(a),
  };
}

/** A project: its name, language, course and which file runs (`principal`, null: the first of its language). */
export function sanearProyecto(p) {
  if (!p || typeof p !== 'object' || !esIdDeProyecto(p.id) || !esLenguaje(p.lenguaje)) return null;
  const nombre = nombreValido(p.nombre);
  if (!nombre) return null;
  return {
    id: p.id,
    nombre,
    lenguaje: p.lenguaje,
    materia: esMateria(p.materia) ? p.materia : null,
    principal: esIdDeArchivo(p.principal) ? p.principal : null,
    creado: esMomento(p.creado) ? p.creado : 0,
    cambiado: esMomento(p.cambiado) ? p.cambiado : 0,
    ...casosDe(p),
  };
}

/** `cuenta`: what's left for cases, shared with the files (sanearMio). */
export function sanearProyectos(lista, cuenta = { queda: MAX_TOTAL_CASOS }) {
  const vistos = new Set();
  return (Array.isArray(lista) ? lista.slice(0, MAX_PROYECTOS * 2) : [])
    .map(sanearProyecto)
    .filter((p) => p && !vistos.has(p.id) && vistos.add(p.id))
    .sort((a, b) => a.creado - b.creado || (a.id < b.id ? -1 : 1))
    .slice(0, MAX_PROYECTOS)
    .map((p) => dentroDelTope(p, cuenta));
}

/** The list, in the order they were made, without repeats and within the limits. */
export function sanearLaboratorio(lista, cuenta = { queda: MAX_TOTAL_CASOS }) {
  const limpios = (Array.isArray(lista) ? lista.slice(0, MAX_ARCHIVOS * 2) : []).map(sanearArchivo).filter(Boolean);
  limpios.sort((a, b) => a.creado - b.creado || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const salida = [];
  const vistos = new Set();
  let total = 0;
  for (const a of limpios) {
    if (salida.length >= MAX_ARCHIVOS) break;
    if (vistos.has(a.id) || total + a.codigo.length > MAX_TOTAL) continue;
    vistos.add(a.id);
    total += a.codigo.length;
    salida.push(dentroDelTope(a, cuenta));
  }
  return salida;
}

/** Whether one more file (or a file with `largo` characters in place of the one with `id`) still fits. */
export function cabeArchivo(lista, largo, id = null) {
  const otros = lista.filter((a) => a.id !== id);
  if (!id && otros.length >= MAX_ARCHIVOS) return false;
  return largo <= MAX_CODIGO && otros.reduce((n, a) => n + a.codigo.length, 0) + largo <= MAX_TOTAL;
}

// What the student's programs wrote to their folder (escritos.js), kept by place: the list in mio.js (`escritos`) and
// the bytes apart, in the browser's database (bodega.js), by their id. Only of a project or a file on its own of the
// student's: the draft's stay in the tab. Each one: { donde, nombre, id, tam }, or { donde, nombre, borrado: true }
// when the program deleted a file of the project.
// What a place may keep (the engine itself stops a run past 32 MB), and all the places of one student together.
export const TOPE_ESCRITOS = 16 * 1024 * 1024;
export const TOPE_ESCRITOS_ALUMNO = 64 * 1024 * 1024;
export const MAX_ESCRITOS = 100;
export const MAX_ESCRITOS_ALUMNO = 400;
// The name goes in the key of its element in Drive (union.js), which has room for this much.
const MAX_BYTES_ESCRITO = 150;
// 24 characters: the files of the courses of one's own (propiasSaneo.js) have 20, in the same database.
export const esIdDeEscrito = (id) => typeof id === 'string' && /^[0-9a-z]{24}$/.test(id);

/** A path inside the program's folder: without what doesn't print, `..`, empty parts or a leading slash. */
export function esNombreDeEscrito(n) {
  if (typeof n !== 'string' || !n || n.length > MAX_BYTES_ESCRITO || /[\p{Cc}\p{Cf}\u2028\u2029\\]/u.test(n)) return false;
  if (n.split('/').some((p) => !p || p === '.' || p === '..')) return false;
  return new TextEncoder().encode(n).length <= MAX_BYTES_ESCRITO;
}

/** Where what a program writes may stay: the student's projects and their files on their own. */
export const lugaresDeEscritos = (laboratorio, proyectosLab) => new Set([...proyectosLab.map((p) => p.id), ...laboratorio.filter((a) => !a.proyecto).map((a) => a.id)]);

/** The list, by place and name, without repeats, of places that exist (`lugares`) and within the limits. */
export function sanearEscritos(lista, lugares) {
  const limpios = [];
  for (const e of Array.isArray(lista) ? lista.slice(0, MAX_ESCRITOS_ALUMNO * 2) : []) {
    if (!e || typeof e !== 'object' || !lugares.has(e.donde) || !esNombreDeEscrito(e.nombre)) continue;
    if (e.borrado === true) limpios.push({ donde: e.donde, nombre: e.nombre, borrado: true });
    else if (esIdDeEscrito(e.id) && Number.isSafeInteger(e.tam) && e.tam >= 0 && e.tam <= TOPE_ESCRITOS) limpios.push({ donde: e.donde, nombre: e.nombre, id: e.id, tam: e.tam });
  }
  limpios.sort((a, b) => (a.donde < b.donde ? -1 : a.donde > b.donde ? 1 : a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
  const salida = [];
  const vistos = new Set();
  const ids = new Set();
  const porLugar = new Map();
  let total = 0;
  for (const e of limpios) {
    const clave = `${e.donde}/${e.nombre}`;
    const tam = e.tam ?? 0;
    const lugar = porLugar.get(e.donde) ?? { n: 0, tam: 0 };
    if (vistos.has(clave) || (e.id && ids.has(e.id))) continue;
    if (salida.length >= MAX_ESCRITOS_ALUMNO || lugar.n >= MAX_ESCRITOS || lugar.tam + tam > TOPE_ESCRITOS || total + tam > TOPE_ESCRITOS_ALUMNO) continue;
    vistos.add(clave);
    if (e.id) ids.add(e.id);
    porLugar.set(e.donde, { n: lugar.n + 1, tam: lugar.tam + tam });
    total += tam;
    salida.push(e);
  }
  return salida;
}
