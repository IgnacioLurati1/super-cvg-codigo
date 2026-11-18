import { useSyncExternalStore } from 'react';
import { borrarDeBodega, guardarEnBodega, idsEnBodega, leerDeBodega } from '../bodega';
import { leerMarcas } from '../marcas';
import { cambiarMio, escucharMio, mioActual, sacarEscritosDeTodos, usuarioActual } from '../mio';
import { alOlvidarLaboratorio } from './pendiente';
import { esIdDeEscrito, esNombreDeEscrito, lugaresDeEscritos, MAX_ESCRITOS, sanearEscritos, TOPE_ESCRITOS } from './saneo';

// What the student's programs wrote to their folder (the `archivos` of a run's `fin`, motor.js). Kept by where it ran
// (`donde`: the project's id, a file's on its own, or the draft's), so the next run finds the folder as the last one
// left it and a program that keeps its records in a file (fwrite of a .dat) works between runs.
//   Each one: { nombre, bytes, texto (null if it isn't text), borrado (the program deleted a file of the project), id }.
// In the memory of the tab, for the screen and the runs; the ones of a project or a file of the student's also in this
// browser, like the rest of what's theirs: the list in mio.js (`escritos`, so it travels to their Drive and joins like
// the rest, sincro.js) and the bytes in the browser's database (bodega.js), by an id of their own (`id`, once saved).
// The draft's and a live session's stay only in the tab. Salir deletes them from this browser (sesion.js).
// Each change notes which names of the place changed (`tocados`) and saves just those over the list, one at a time per
// student (also among the tabs, with Web Locks): what is in the list and not in memory yet is never lost. What the list
// brings from another tab or from Drive enters the memory for the names not changed here meanwhile.

export { TOPE_ESCRITOS };
// Bytes, also from another realm (a worker's, or the tests' jsdom).
export const esBytes = (b) => Object.prototype.toString.call(b) === '[object Uint8Array]';

export const MUY_GRANDE = `Tu programa escribió más de ${TOPE_ESCRITOS / 1024 / 1024} MB o más de ${MAX_ESCRITOS} archivos. Los más grandes no quedaron.`;
export const SIN_LUGAR = 'No hay lugar en este navegador para lo que escribió el programa. Queda solo en esta pestaña.';

const lugares = new Map();
// By place, the names changed here and not saved yet; '*': the whole place, as memory has it.
const tocados = new Map();
const avisados = new Set();
const VACIO = [];
const vistas = new Map();
// The student whose files are in memory, and the list of them last read.
let dueno = null;
let leida = null;
let activo = false;
let cola = Promise.resolve();

function avisar() {
  vistas.clear();
  avisados.forEach((f) => f());
}

function vaciar() {
  lugares.clear();
  tocados.clear();
  leida = null;
}

alOlvidarLaboratorio(() => {
  vaciar();
  dueno = null;
  avisar();
});

const azar = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => (b % 36).toString(36)).join('');
const conLocks = () => typeof navigator !== 'undefined' && Boolean(navigator.locks?.request);
// One at a time: in this tab, and among the tabs of the same student where there are Web Locks.
function enFila(alumno, fn) {
  const vez = conLocks() ? () => navigator.locks.request(`super-cvg-escritos-${alumno}`, fn) : fn;
  const p = cola.then(vez, vez);
  cola = p.catch(() => {});
  return p;
}

/** The text of a file, if it is one: UTF-8 without NUL bytes, with its lines ended in \n. Null for anything else. */
export function textoDe(bytes) {
  if (!esBytes(bytes) || bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n');
  } catch {
    return null;
  }
}

const delLugar = (donde) => {
  if (!lugares.has(donde)) lugares.set(donde, new Map());
  return lugares.get(donde);
};

function tocar(donde, nombre) {
  const t = tocados.get(donde);
  if (t === '*') return;
  if (nombre === '*') tocados.set(donde, '*');
  else tocados.set(donde, new Set(t ?? []).add(nombre));
}

const lugaresDe = (mio) => lugaresDeEscritos(mio.laboratorio, mio.proyectosLab);

/** Whether what runs in `donde` stays in this browser: a project or a file on its own of the student's. */
export function seGuarda(donde) {
  return usuarioActual() !== null && lugaresDe(mioActual()).has(donde);
}

// The ids in use: in the list or in memory (moved to another place, or waiting to be saved).
function idsVivos() {
  const vivos = new Set(mioActual().escritos.map((e) => e.id).filter(Boolean));
  for (const m of lugares.values()) for (const e of m.values()) if (e.id) vivos.add(e.id);
  return vivos;
}

const soltar = (alumno, ids) => {
  const vivos = idsVivos();
  return borrarDeBodega(alumno, [...new Set(ids)].filter((id) => !vivos.has(id))).catch(() => {});
};

async function leerBytes(alumno, id, tam) {
  try {
    const bytes = new Uint8Array(await (await leerDeBodega(alumno, id, '')).arrayBuffer());
    return bytes.length === tam ? bytes : null;
  } catch {
    return null;
  }
}

const marcaDeBorrado = (nombre) => ({ nombre, bytes: new Uint8Array(0), texto: null, borrado: true });
const enLista = (donde, e) => (e.borrado ? { donde, nombre: e.nombre, borrado: true } : { donde, nombre: e.nombre, id: e.id, tam: e.bytes.length });

// Saves the names of `donde` changed here: their bytes first, then the list. Resolves with the problem, or null.
function guardarLugar(donde) {
  const alumno = dueno;
  if (alumno === null || alumno !== usuarioActual()) return Promise.resolve(null);
  return enFila(alumno, async () => {
    const t = tocados.get(donde);
    if (!t || dueno !== alumno || usuarioActual() !== alumno) return null;
    tocados.delete(donde);
    // Not a place of the student's (the draft, or one just deleted): only in memory.
    if (!lugaresDe(mioActual()).has(donde)) return null;
    const m = lugares.get(donde) ?? new Map();
    const nombres = t === '*' ? [...m.keys()] : [...t].filter((n) => m.has(n));
    // A name the list can't have (a very long path) stays only in the tab, without stopping the rest.
    const raros = nombres.filter((n) => !esNombreDeEscrito(n));
    const cuales = nombres.filter(esNombreDeEscrito).map((n) => m.get(n));
    const nuevos = [];
    const devolver = () => {
      for (const e of nuevos) delete e.id;
      const ahora = tocados.get(donde);
      if (ahora !== '*') tocados.set(donde, t === '*' ? '*' : new Set([...t, ...(ahora ?? [])]));
    };
    try {
      for (const e of cuales) {
        if (e.borrado || e.id) continue;
        const id = azar();
        await guardarEnBodega(alumno, id, new Blob([e.bytes]));
        e.id = id;
        nuevos.push(e);
      }
    } catch {
      const ids = nuevos.map((e) => e.id);
      devolver();
      await borrarDeBodega(alumno, ids).catch(() => {});
      return SIN_LUGAR;
    }
    if (dueno !== alumno || usuarioActual() !== alumno) {
      const ids = nuevos.map((e) => e.id);
      devolver();
      await borrarDeBodega(alumno, ids).catch(() => {});
      return null;
    }
    const d = mioActual();
    const antes = d.escritos.filter((e) => e.donde === donde);
    const lista = [...(t === '*' ? [] : antes.filter((e) => !t.has(e.nombre))), ...cuales.map((e) => enLista(donde, e))];
    const junto = [...d.escritos.filter((e) => e.donde !== donde), ...lista];
    if (sanearEscritos(junto, lugaresDe(d)).length !== junto.length || !cambiarMio((x) => ({ ...x, escritos: junto }))) {
      const ids = nuevos.map((e) => e.id);
      devolver();
      await borrarDeBodega(alumno, ids).catch(() => {});
      return SIN_LUGAR;
    }
    raros.forEach((n) => tocar(donde, n));
    await soltar(alumno, antes.map((e) => e.id).filter(Boolean));
    return null;
  });
}

// Brings into memory what the list has that memory doesn't, for the names not changed here. Once per change of the
// list, or when Drive brought bytes (`forzar`).
function cargar(forzar = false) {
  const alumno = usuarioActual();
  if (alumno !== dueno) {
    vaciar();
    dueno = alumno;
    avisar();
  }
  if (alumno === null) return cola;
  const lista = JSON.stringify(mioActual().escritos);
  if (!forzar && lista === leida) return cola;
  leida = lista;
  return enFila(alumno, async () => {
    if (dueno !== alumno || usuarioActual() !== alumno) return;
    const d = mioActual();
    const validos = lugaresDe(d);
    const porLugar = new Map();
    for (const e of d.escritos) porLugar.set(e.donde, [...(porLugar.get(e.donde) ?? []), e]);
    const faltan = [];
    let cambio = false;
    for (const donde of new Set([...porLugar.keys(), ...[...lugares.keys()].filter((x) => validos.has(x))])) {
      if (tocados.get(donde) === '*') continue;
      const m = lugares.get(donde) ?? new Map();
      const traidos = new Map();
      for (const e of porLugar.get(donde) ?? []) {
        const ya = m.get(e.nombre);
        if (e.borrado) traidos.set(e.nombre, ya?.borrado ? ya : marcaDeBorrado(e.nombre));
        else if (ya?.id === e.id) traidos.set(e.nombre, ya);
        else {
          const bytes = await leerBytes(alumno, e.id, e.tam);
          if (bytes) traidos.set(e.nombre, { nombre: e.nombre, bytes, texto: textoDe(bytes), borrado: false, id: e.id });
          else faltan.push(e);
        }
      }
      if (dueno !== alumno || usuarioActual() !== alumno) return;
      // What changed here meanwhile stays as memory has it.
      const t = tocados.get(donde);
      if (t === '*') continue;
      const ahora = lugares.get(donde) ?? new Map();
      const nuevo = new Map([...traidos].filter(([n]) => !t?.has(n)));
      for (const n of t ?? []) if (ahora.has(n)) nuevo.set(n, ahora.get(n));
      if (nuevo.size === ahora.size && [...nuevo].every(([n, e]) => ahora.get(n) === e)) continue;
      if (nuevo.size) lugares.set(donde, nuevo);
      else lugares.delete(donde);
      cambio = true;
    }
    if (cambio) avisar();
    // Bytes that aren't here: without Drive, nothing brings them back (Salir, or a copy of another browser).
    if (faltan.length && !leerMarcas(alumno)?.prendido) {
      const fuera = new Set(faltan.map((e) => e.id));
      cambiarMio((x) => ({ ...x, escritos: x.escritos.filter((e) => !fuera.has(e.id)) }));
    }
    // Bytes nobody names any more (a run that replaced them, or a place deleted in another tab or device). Only where
    // the tabs go one at a time: another one may be about to name what it just saved.
    if (conLocks()) {
      try {
        await soltar(alumno, (await idsEnBodega(alumno)).filter(esIdDeEscrito));
      } catch {
        // The database didn't open: next time.
      }
    }
  });
}

function activar() {
  if (activo) return;
  activo = true;
  escucharMio(() => cargar());
  cargar();
}

/** Resolves once what this browser kept is in memory: a run waits for it. */
export function escritosListos() {
  activar();
  return cargar();
}

/** sincro.js: Drive brought bytes for the list. */
export function escritosLlegaron() {
  if (activo) cargar(true);
}

/** Salir: what the programs wrote leaves this browser, of every student. Drive keeps its copy. Never fails. */
export async function borrarEscritosGuardados() {
  vaciar();
  avisar();
  for (const { usuario, ids } of sacarEscritosDeTodos()) await borrarDeBodega(usuario, ids).catch(() => {});
}

/** The files a run of `donde` wrote or deleted, sorted by name. */
export function escritosDe(donde) {
  if (!vistas.has(donde)) {
    const m = lugares.get(donde);
    vistas.set(donde, m?.size ? [...m.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) : VACIO);
  }
  return vistas.get(donde);
}

export function useEscritos(donde) {
  return useSyncExternalStore(
    (f) => {
      avisados.add(f);
      activar();
      return () => avisados.delete(f);
    },
    () => escritosDe(donde),
    () => VACIO,
  );
}

/**
 * Notes what a run did to its folder. `propios`: the files of the project as the run got them ([{ nombre, contenido }],
 * text), so a file written back as it was isn't marked; `cambios`: the `archivos` of the run ({ cambiados, borrados }).
 * Resolves with what the student should know (it didn't all fit), or null.
 */
export function anotarCorrida(donde, propios, cambios) {
  if (!cambios || typeof cambios !== 'object') return Promise.resolve(null);
  activar();
  const base = new Map((propios ?? []).map((a) => [a.nombre, typeof a.contenido === 'string' ? a.contenido.replace(/\r\n?/g, '\n') : null]));
  const m = delLugar(donde);
  let hubo = false;
  for (const a of Array.isArray(cambios.cambiados) ? cambios.cambiados : []) {
    if (typeof a?.nombre !== 'string' || !a.nombre || !esBytes(a.contenido)) continue;
    const texto = textoDe(a.contenido);
    if (base.has(a.nombre) && texto !== null && texto === base.get(a.nombre)) m.delete(a.nombre);
    else m.set(a.nombre, { nombre: a.nombre, bytes: a.contenido, texto, borrado: false });
    tocar(donde, a.nombre);
    hubo = true;
  }
  for (const nombre of Array.isArray(cambios.borrados) ? cambios.borrados : []) {
    if (typeof nombre !== 'string' || !nombre) continue;
    if (base.has(nombre)) m.set(nombre, marcaDeBorrado(nombre));
    else m.delete(nombre);
    tocar(donde, nombre);
    hubo = true;
  }
  // Within the limits: the biggest that don't fit go, the deleted marks stay (they weigh nothing).
  let total = 0;
  let n = 0;
  let recorte = false;
  for (const e of [...m.values()].sort((a, b) => a.bytes.length - b.bytes.length)) {
    total += e.bytes.length;
    n += 1;
    if (total > TOPE_ESCRITOS || n > MAX_ESCRITOS) {
      m.delete(e.nombre);
      tocar(donde, e.nombre);
      recorte = true;
    }
  }
  if (!m.size) lugares.delete(donde);
  if (!hubo) return Promise.resolve(null);
  avisar();
  return guardarLugar(donde).then((p) => p ?? (recorte ? MUY_GRANDE : null));
}

/** A file the student brought (a binary .dat from a zip), for the runs. Resolves with the problem, or null. */
export function sumarEscrito(donde, nombre, bytes) {
  activar();
  delLugar(donde).set(nombre, { nombre, bytes, texto: textoDe(bytes), borrado: false });
  tocar(donde, nombre);
  avisar();
  return guardarLugar(donde);
}

/** Forgets one (saved into the project, or the student dropped it), or all of a place. */
export function descartarEscrito(donde, nombre = null) {
  const m = lugares.get(donde);
  if (nombre === null) {
    lugares.delete(donde);
    tocar(donde, '*');
  } else {
    m?.delete(nombre);
    if (m && !m.size) lugares.delete(donde);
    tocar(donde, nombre);
  }
  avisar();
  guardarLugar(donde);
}

/** Moves what a place has to another one (the draft, once saved, or a file that becomes a project). */
export function mudarEscritos(desde, hacia) {
  const m = lugares.get(desde);
  if (!m || desde === hacia) return;
  lugares.delete(desde);
  lugares.set(hacia, m);
  tocar(desde, '*');
  tocar(hacia, '*');
  avisar();
  guardarLugar(desde);
  guardarLugar(hacia);
}

/** The folder the next run gets: the project's files, as the last run left them. */
export function paraLaCorrida(archivos, donde) {
  const m = lugares.get(donde);
  if (!m?.size) return archivos;
  const salida = [];
  const vistos = new Set();
  for (const a of archivos) {
    vistos.add(a.nombre);
    const e = m.get(a.nombre);
    if (e?.borrado) continue;
    salida.push(e ? { nombre: a.nombre, contenido: e.bytes } : a);
  }
  for (const e of m.values()) if (!vistos.has(e.nombre) && !e.borrado) salida.push({ nombre: e.nombre, contenido: e.bytes });
  return salida;
}
