// The text of the student's PDFs, for «Buscar también adentro de los PDF» and Consultron. Read only when asked for, two
// files at a time, and kept in the memory of this tab: a new session (another student, or after Salir) starts from
// nothing there. The text of each page also goes to this browser's database, by student and with the version of the
// file in the campus (textosPdf.js): on the next visit, a file that did not change is not downloaded again. It is looked
// for there only when its turn to download comes. Salir deletes it. Without the database, only the memory, as before.
import { useSyncExternalStore } from 'react';
import { traerArchivo } from './archivos';
import { buscarEnIndice, docDe, plegar } from './lectura';
import { usuarioActual } from './mio';
import { tokenActual } from './sesion';
import { guardarTexto, selloDe, textoGuardado } from './textosPdf';

/** Bigger than this is not read: it would take long and fill the memory of a phone. */
export const TOPE_PDF = 20 * 1024 * 1024;
/** The text kept of all the PDFs together, in letters (each page as it is and folded): past it, the rest is not read.
 * Some 60 MB at most, the text of a few hundred PDFs of class. */
export const TOPE_TEXTO = 30_000_000;
const A_LA_VEZ = 2;
const esPdf = (i) => i.mime === 'application/pdf' || /\.pdf$/i.test(i.archivo ?? '');

const VACIO = { leyendo: false, actual: 0, total: 0, leidos: 0, grandes: 0, fallaron: 0, version: 0 };
let token = null;
let indice = new Map();
// How much text the index holds now (TOPE_TEXTO).
let usado = 0;
// What could not be read in this tab, by key, so turning it on again does not ask for it again.
let descartados = new Map();
let estado = VACIO;
let control = null;
const avisados = new Set();

function cambiar(cambios) {
  estado = { ...estado, ...cambios, version: estado.version + 1 };
  avisados.forEach((f) => f());
}

// Another session starts from nothing.
function alDia() {
  const ahora = tokenActual();
  if (ahora === token) return;
  control?.abort();
  token = ahora;
  indice = new Map();
  usado = 0;
  descartados = new Map();
  estado = { ...VACIO, version: estado.version + 1 };
}

/** The PDFs among some items, once each. */
export function pdfsDe(items) {
  const vistos = new Set();
  return items.filter((i) => {
    const doc = i.tipo === 'archivo' && esPdf(i) ? docDe(i) : null;
    if (!doc || vistos.has(doc)) return false;
    vistos.add(doc);
    return true;
  });
}

/** Of these PDFs, how many were read or left out (too big, no room left for their text, or failed), and how many are
 * still to read. */
export function cuentaDe(pdfs) {
  alDia();
  let leidos = 0;
  let grandes = 0;
  let sinLugar = 0;
  let fallaron = 0;
  for (const i of pdfs) {
    const doc = docDe(i);
    if (indice.has(doc)) leidos += 1;
    else if (descartados.get(doc) === 'grande' || i.peso > TOPE_PDF) grandes += 1;
    else if (descartados.get(doc) === 'lleno') sinLugar += 1;
    else if (descartados.has(doc)) fallaron += 1;
  }
  return { leidos, grandes, sinLugar, fallaron, faltan: pdfs.length - leidos - grandes - sinLugar - fallaron };
}

/** Reads the PDFs still unread, two at a time. Only one round at a time: a second call while one runs does nothing. */
export async function leerPdfs(pdfs) {
  alDia();
  if (control) return;
  const mio = new AbortController();
  control = mio;
  // Whose texts these are: what is on disk goes and comes only for this student, while this session lasts.
  const deEsta = token;
  const alumno = usuarioActual();
  const sigue = () => alumno !== null && tokenActual() === deEsta && usuarioActual() === alumno;
  const pendientes = pdfs.filter((i) => {
    const doc = docDe(i);
    // What failed before is tried again; what is too big or had no room, not.
    const antes = descartados.get(doc);
    return !indice.has(doc) && antes !== 'grande' && antes !== 'lleno' && !(i.peso > TOPE_PDF);
  });
  let actual = 0;
  cambiar({ leyendo: true, actual: 0, total: pendientes.length });
  // The reader of texts (and pdf.js) comes apart, only when this is used. Its chunk is shared with the other pages that
  // read files, so the build says this import does not split it: it still stays out of the main bundle.
  let leer;
  try {
    leer = await import('./leerTexto');
  } catch {
    leer = null;
  }
  const { hastaCancelar, textoDePaginas } = leer ?? {};
  const trabajador = async () => {
    while (leer && pendientes.length && !mio.signal.aborted) {
      const item = pendientes.shift();
      const doc = docDe(item);
      actual += 1;
      cambiar({ actual });
      // Full: the rest is not even asked for.
      if (usado >= TOPE_TEXTO) {
        descartados.set(doc, 'lleno');
        continue;
      }
      try {
        // Read on an earlier visit, and the file did not change: no download.
        const sello = selloDe(item);
        let textos = sello && sigue() ? await hastaCancelar(textoGuardado(alumno, doc, sello), mio.signal) : null;
        const delDisco = Boolean(textos);
        if (!textos) {
          // One of the student's own comes from this browser (`traer`), not from the campus.
          const blob = await hastaCancelar(item.traer ? item.traer() : traerArchivo(item), mio.signal);
          if (blob.size > TOPE_PDF) {
            descartados.set(doc, 'grande');
            continue;
          }
          textos = await hastaCancelar(textoDePaginas(blob, mio.signal), mio.signal);
        }
        const paginas = textos.map((texto) => ({ texto, plano: plegar(texto).plano }));
        const largo = paginas.reduce((n, p) => n + p.texto.length + p.plano.length, 0);
        if (usado + largo > TOPE_TEXTO) {
          descartados.set(doc, 'lleno');
        } else {
          usado += largo;
          indice.set(doc, { paginas });
          descartados.delete(doc);
          // Not waited for: the next file does not wait on the disk.
          if (!delDisco && sello && sigue()) guardarTexto(alumno, doc, sello, textos);
        }
      } catch {
        if (mio.signal.aborted) break;
        descartados.set(doc, 'fallo');
      }
    }
  };
  await Promise.all(Array.from({ length: A_LA_VEZ }, trabajador));
  // A round stopped by Cancelar was already marked as stopped, and another may be running now.
  if (control !== mio) return;
  control = null;
  // Without the reader of PDFs nothing was read: they count as not read.
  if (!leer) for (const i of pendientes) descartados.set(docDe(i), 'fallo');
  cambiar({ leyendo: false });
}

export function cancelarLectura() {
  control?.abort();
  control = null;
  cambiar({ leyendo: false });
}

/** For each PDF read with every word: { item, pagina, otras, partes } (lectura.js, buscarEnIndice). */
export function buscarEnPdfs(pdfs, consulta) {
  alDia();
  const deEstos = new Map();
  for (const i of pdfs) {
    const doc = docDe(i);
    if (indice.has(doc)) deEstos.set(doc, indice.get(doc));
  }
  const hallados = buscarEnIndice(deEstos, consulta);
  return pdfs.flatMap((item) => {
    const h = hallados.get(docDe(item));
    return h ? [{ item, ...h }] : [];
  });
}

/** The text of each page of the PDFs among these that were read: [{ item, paginas: [texto] }] (Consultron). */
export function textosDe(pdfs) {
  alDia();
  return pdfs.flatMap((item) => {
    const leido = indice.get(docDe(item));
    return leido ? [{ item, paginas: leido.paginas.map((p) => p.texto) }] : [];
  });
}

const escuchar = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

/** How the reading goes: { leyendo, actual, total, version }. */
export const useIndicePdf = () => useSyncExternalStore(escuchar, () => {
  alDia();
  return estado;
}, () => VACIO);
