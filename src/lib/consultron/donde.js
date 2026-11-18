// Where Consultron looks, for what «Busca en» says: the campus courses and, with them, what the student added on their
// own. A course of their own is searched like a campus one: its PDFs go with the campus PDFs (indicePdf.js reads them
// from this browser, bodega.js), its pictures are read with the photo reader (ocr.js) only when the rest doesn't
// answer, and its texts and the note of each campus course are searched as they are. What a picture says stays in
// memory for the visit, like what is attached to Consultron.
import { leerDeBodega } from '../bodega.js';
import { docDe } from '../lectura.js';
import { usuarioActual } from '../mio.js';
import { itemDeBloque, primeraLinea } from '../propiasVista.js';
import { tokenActual } from '../sesion.js';
import { documentoDeTexto, leerArchivo, tieneTexto } from './adjuntar.js';

export const TODAS = 'todas';
const PROPIA = 'propia:';
/** The value of «Busca en» for a course of the student's own. */
export const valorDePropia = (id) => `${PROPIA}${id}`;
/** Where it starts looking, by the screen the student is on: in a course, that one. */
export function materiaDeRuta(ruta) {
  const delCampus = /^\/materias\/(\d+)/.exec(ruta ?? '')?.[1];
  if (delCampus) return delCampus;
  // «nueva» and «abrir» are screens, not courses: they don't have the shape of an id.
  const suya = /^\/propias\/(p[0-9a-z]{6,20})(?:\/|$)/.exec(ruta ?? '')?.[1];
  return suya ? valorDePropia(suya) : TODAS;
}

/** How many pictures are read for one question, at most: each takes a few seconds. */
export const FOTOS_POR_PREGUNTA = 6;

const esAgregada = (p) => p.de !== null && p.de !== undefined;
const leerSuyo = (archivoId, nombre) => leerDeBodega(usuarioActual(), archivoId, nombre);
export const esFoto = (item) => /^image\//.test(item?.mime ?? '');

/**
 * What a value of «Busca en» means: TODAS, the id of a campus course, or the one of `valorDePropia`. { materias: the
 * campus courses, propias: the courses of their own (also their own sections of those campus courses), suya: the one
 * chosen if it is of their own }. A value that is no longer there: all the courses in progress.
 */
export function dondeBusca(valor, { enCurso = [], otras = [] } = {}, mio = null) {
  const propias = mio?.propias ?? [];
  const sueltas = propias.filter((p) => !esAgregada(p));
  const suya = typeof valor === 'string' && valor.startsWith(PROPIA) ? sueltas.find((p) => p.id === valor.slice(PROPIA.length)) : null;
  if (suya) return { materias: [], propias: [suya], suya };
  const una = [...enCurso, ...otras].filter((m) => String(m.id) === valor);
  const materias = una.length ? una : enCurso;
  const agregadas = materias.map((m) => propias.find((p) => p.de === m.id)).filter(Boolean);
  return { materias, propias: una.length ? agregadas : [...sueltas, ...agregadas], suya: null };
}

/**
 * What some courses of the student's own have to read. `leer(archivoId, nombre)` gets a file from this browser (bodega.js),
 * `nombres` is { campus course id: name }. { archivos: their PDFs and pictures as items Previa opens, notas: their
 * texts as documents ready to search (fuentes.js) }.
 */
export function dePropias(propias, { leer = leerSuyo, nombres = {} } = {}) {
  const archivos = [];
  const notas = [];
  for (const propia of propias) {
    const agregada = esAgregada(propia);
    const materia = agregada ? (nombres[propia.de] ?? propia.nombre) : propia.nombre;
    const a = agregada ? `/materias/${propia.de}` : `/propias/${propia.id}`;
    for (const categoria of propia.categorias ?? []) {
      for (const bloque of categoria.bloques ?? []) {
        if (bloque.tipo === 'archivo') archivos.push({ ...itemDeBloque(bloque, { propia, categoria, leer }), materia });
        else if (bloque.tipo === 'texto' && tieneTexto(bloque.texto)) {
          notas.push(documentoDeTexto(`nota:${propia.id}-${bloque.id}`, { tipo: 'propia', clase: 'texto', nombre: primeraLinea(bloque.texto) || 'Texto', materia, a }, bloque.texto));
        }
      }
    }
  }
  return { archivos, notas };
}

/** The note the student keeps in each of some campus courses, as documents ready to search. */
export function notasDeMaterias(materias, mio) {
  return materias.flatMap((m) => {
    const nota = mio?.materias?.[m.id]?.nota;
    return tieneTexto(nota) ? [documentoDeTexto(`nota:m${m.id}`, { tipo: 'propia', clase: 'nota', nombre: 'Tu nota', materia: m.nombre, a: `/materias/${m.id}` }, nota)] : [];
  });
}

// What each picture says, by its document: its pages, or null if nothing could be read. Another session starts empty.
let leidas = new Map();
let de = null;
function alDia() {
  const ahora = tokenActual();
  if (ahora === de) return;
  de = ahora;
  leidas = new Map();
}

/** Reads the pictures still unread, one after the other. One that can't be read (no text, broken) isn't tried again. */
export async function leerFotos(fotos, { senal, leer = leerArchivo } = {}) {
  alDia();
  const sesion = de;
  for (const item of fotos) {
    const doc = docDe(item);
    if (senal?.aborted || tokenActual() !== sesion) return;
    if (!doc || leidas.has(doc)) continue;
    try {
      const blob = await item.traer();
      const { paginas } = await leer(new File([blob], item.archivo, { type: item.mime }), 'foto', { senal });
      if (tokenActual() === sesion) leidas.set(doc, paginas);
    } catch (e) {
      if (e?.name === 'AbortError' || senal?.aborted) return;
      if (tokenActual() === sesion) leidas.set(doc, null);
    }
  }
}

/** The pictures among these already read, as fuentes.js takes what was read: with their source and their pieces. */
export function fotosLeidas(fotos) {
  alDia();
  return fotos.flatMap((item) => {
    const doc = docDe(item);
    const paginas = leidas.get(doc);
    if (!paginas) return [];
    const { trozos } = documentoDeTexto(doc, null, paginas.join('\n'));
    return [{ item, paginas, trozos, fuente: { tipo: 'propia', clase: 'foto', nombre: item.nombre, materia: item.materia, item } }];
  });
}

/**
 * How fuentes.js reads what is still unread for one question, and takes what was read: the PDFs with `pdfs.leer` and
 * `pdfs.leidos` (indicePdf.js), the pictures here, FOTOS_POR_PREGUNTA at most.
 */
export function lectorDe({ pdfs, senal, fotos = { leer: leerFotos, leidas: fotosLeidas } }) {
  let quedan = FOTOS_POR_PREGUNTA;
  return {
    leer: async (lote) => {
      const deFotos = lote.filter(esFoto).slice(0, quedan);
      const dePdf = lote.filter((i) => !esFoto(i));
      quedan -= deFotos.length;
      await Promise.all([dePdf.length ? pdfs.leer(dePdf) : null, deFotos.length ? fotos.leer(deFotos, { senal }) : null]);
    },
    leidos: (todos) => [...pdfs.leidos(todos.filter((i) => !esFoto(i))), ...fotos.leidas(todos.filter(esFoto))],
  };
}
