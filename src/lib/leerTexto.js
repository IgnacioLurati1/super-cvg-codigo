// The text of a PDF or a Word file, in memory only. Nothing here runs what the file carries, and a broken
// file or a scanned PDF gives back an empty text instead of an error.
import { unzipSync, strFromU8 } from 'fflate';
import { esDocx, esPdf } from './cazador';
import { textoDePagina } from './lectura';
import { opcionesPdf } from './opcionesPdf';

const MAX_PAGINAS = 60;
const MAX_XML = 30 * 1024 * 1024;

async function cargarPdf() {
  const [pdfjs, { default: workerUrl }] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/** Stops waiting as soon as `senal` fires. What was running ends on its own and its result is dropped. */
export function hastaCancelar(promesa, senal) {
  if (!senal) return promesa;
  return new Promise((resolver, rechazar) => {
    const alCancelar = () => rechazar(new DOMException('Cancelado', 'AbortError'));
    if (senal.aborted) alCancelar();
    senal.addEventListener('abort', alCancelar, { once: true });
    promesa.then(resolver, rechazar).finally(() => senal.removeEventListener('abort', alCancelar));
  });
}

/**
 * PDF text pieces into lines, by position and not by the order they were written in: schedules are tables,
 * and a PDF often writes a table column by column.
 */
export function lineasDePagina(piezas) {
  const conTexto = piezas
    .filter((p) => p.str?.trim() && p.transform)
    .map((p) => ({ str: p.str, x: p.transform[4], y: p.transform[5], ancho: p.width ?? 0, alto: p.height || 10 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const filas = [];
  for (const p of conTexto) {
    const fila = filas.at(-1);
    if (fila && Math.abs(fila.y - p.y) <= Math.max(2, p.alto * 0.5)) fila.piezas.push(p);
    else filas.push({ y: p.y, piezas: [p] });
  }
  return filas.map(({ piezas: enFila }) => {
    let linea = '';
    let fin = null;
    for (const p of enFila.sort((a, b) => a.x - b.x)) {
      const separada = fin !== null && p.x - fin > p.alto * 0.15;
      linea += (separada && !linea.endsWith(' ') && !p.str.startsWith(' ') ? ' ' : '') + p.str;
      fin = p.x + p.ancho;
    }
    return linea.trim();
  });
}

async function textoDePdf(blob, senal) {
  const pdfjs = await cargarPdf();
  const data = new Uint8Array(await blob.arrayBuffer());
  const tarea = pdfjs.getDocument(opcionesPdf(pdfjs, data));
  try {
    const documento = await hastaCancelar(tarea.promise, senal);
    const lineas = [];
    for (let n = 1; n <= Math.min(documento.numPages, MAX_PAGINAS) && !senal?.aborted; n++) {
      const hoja = await documento.getPage(n);
      const { items } = await hoja.getTextContent();
      lineas.push(...lineasDePagina(items), '');
      hoja.cleanup();
    }
    return lineas.join('\n');
  } finally {
    tarea.destroy()?.catch?.(() => {});
  }
}

const MAX_PAGINAS_BUSCAR = 400;

/** The text of each page of a PDF, put together as the reader does it (lectura.js), so a page found in Buscar is the
 * same page in the reader. A page with no text (a scan) gives an empty one. */
export async function textoDePaginas(blob, senal) {
  const pdfjs = await cargarPdf();
  const data = new Uint8Array(await blob.arrayBuffer());
  const tarea = pdfjs.getDocument(opcionesPdf(pdfjs, data));
  try {
    const documento = await hastaCancelar(tarea.promise, senal);
    const paginas = [];
    for (let n = 1; n <= Math.min(documento.numPages, MAX_PAGINAS_BUSCAR) && !senal?.aborted; n++) {
      const hoja = await documento.getPage(n);
      paginas.push(textoDePagina((await hoja.getTextContent()).items).texto);
      hoja.cleanup();
    }
    return paginas;
  } finally {
    tarea.destroy()?.catch?.(() => {});
  }
}

/** One line per paragraph. A table row stays on one line, because that's what ties a date to its label. */
export function lineasDeDocumentoWord(xml) {
  if (/<!DOCTYPE/i.test(xml)) return [];
  const documento = new DOMParser().parseFromString(xml, 'application/xml');
  if (documento.querySelector('parsererror')) return [];
  const lineas = [];
  let actual = '';
  let enFila = 0;
  const cortar = () => {
    if (actual.trim()) lineas.push(actual.replace(/\s+/g, ' ').trim());
    actual = '';
  };
  const andar = (nodo) => {
    for (const hijo of nodo.children) {
      const tipo = hijo.localName;
      if (tipo === 't') actual += hijo.textContent;
      else if (tipo === 'tab' || tipo === 'noBreakHyphen') actual += tipo === 'tab' ? ' ' : '-';
      else if (tipo === 'br' || tipo === 'cr') {
        if (enFila) actual += ' ';
        else cortar();
      } else if (tipo === 'tr') {
        cortar();
        enFila++;
        andar(hijo);
        enFila--;
        cortar();
      } else if (tipo === 'p') {
        if (enFila) {
          andar(hijo);
          actual += ' ';
        } else {
          cortar();
          andar(hijo);
          cortar();
        }
      } else if (tipo !== 'Fallback') andar(hijo);
    }
  };
  andar(documento.documentElement);
  cortar();
  return lineas;
}

async function textoDeDocx(blob) {
  const archivos = unzipSync(new Uint8Array(await blob.arrayBuffer()), {
    filter: (a) => a.name === 'word/document.xml' && a.originalSize <= MAX_XML,
  });
  const xml = archivos['word/document.xml'];
  return xml ? lineasDeDocumentoWord(strFromU8(xml)).join('\n') : '';
}

/** `item` says what kind of file it is. Always resolves: empty if there's nothing to read. */
export async function textoDeArchivo(blob, item, { senal } = {}) {
  try {
    if (esDocx(item)) return await textoDeDocx(blob);
    if (esPdf(item)) return await textoDePdf(blob, senal);
  } catch {
    // Broken, password-protected or not what its name says: for the student it's the same, nothing to read.
  }
  return '';
}
