// Several PDFs and photos of a course in one PDF, in the student's order, with a bookmark where each one starts.
// Everything happens in this browser: the files come from the campus or from the student's own, and the PDF goes to
// the downloads or to a section. The library loads only when a merge starts.
import { traerArchivo } from './archivos';
import { nombreSeguro } from './zipMateria';

export { AL_MISMO_TIEMPO } from './zipMateria';

export const AVISO_BYTES = 150 * 1024 * 1024;
const IMAGEN = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
// A photo becomes a page as wide as an A4 sheet, as tall as it needs.
const ANCHO_HOJA = 595;
const MAX_PAGINAS = 5000;

const nombreDe = (item) => item?.archivo ?? item?.nombre ?? '';
export const esPdf = (item) => /\.pdf$/i.test(nombreDe(item)) || item?.mime === 'application/pdf';
export const esImagen = (item) => IMAGEN.test(nombreDe(item)) || /^image\/(png|jpeg|gif|webp|bmp|avif)$/.test(item?.mime ?? '');
/** What can go in a merge: the course's PDFs and photos. */
export const sePuedeFusionar = (item) => item?.tipo === 'archivo' && (esPdf(item) || esImagen(item));
/** The ones of a course that can be brought: from the campus or the student's own. Classroom's live in Drive. */
export const fusionables = (items) => (items ?? []).filter((i) => sePuedeFusionar(i) && i.origen !== 'classroom' && (i.direccion || i.traer));

/**
 * The pages the student wrote, as «3-10, 12». Empty means all of them. Returns { rangos } with pairs counted from 1
 * (the end may be Infinity: «5-» is from 5 to the last), or { error } with what to fix.
 */
export function leerPaginas(texto) {
  const limpio = String(texto ?? '').replace(/\s+/g, '');
  if (!limpio) return { rangos: null };
  const rangos = [];
  for (const parte of limpio.split(/[,;]/)) {
    if (!parte) continue;
    const m = /^(\d{1,5})(?:([-–])(\d{1,5})?)?$/.exec(parte);
    if (!m) return { error: 'Escribilas como 3-10, 12.' };
    const desde = Number(m[1]);
    const hasta = m[2] ? (m[3] ? Number(m[3]) : Infinity) : desde;
    if (desde < 1) return { error: 'Las páginas empiezan en 1.' };
    if (hasta < desde) return { error: `En ${parte}, el primer número va antes.` };
    rangos.push([desde, hasta]);
  }
  return rangos.length ? { rangos } : { rangos: null };
}

/** The pages to take, counted from 0, for a file of `total` pages. Those past the end are left out. */
export function paginasDe(rangos, total) {
  if (!rangos) return Array.from({ length: total }, (_, i) => i);
  const lista = [];
  for (const [desde, hasta] of rangos) {
    for (let p = desde; p <= Math.min(hasta, total) && lista.length < MAX_PAGINAS; p++) lista.push(p - 1);
  }
  return lista;
}

/** The name of the merged file, valid in Windows, always ending in .pdf. */
export function nombreDeFusion(texto, materia) {
  const base = String(texto ?? '').trim().replace(/\.pdf$/i, '') || `${materia || 'Apuntes'} fusionados`;
  return `${nombreSeguro(base, 116)}.pdf`;
}

/** What the bytes are, by how they start: the name of a file can lie. */
export function clase(bytes) {
  const b = bytes.subarray(0, 1024);
  const texto = String.fromCharCode(...b.subarray(0, Math.min(b.length, 1024)));
  if (texto.includes('%PDF-')) return 'pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  return 'otra';
}

// A photo the library can't take as it comes (WebP, GIF, BMP) is drawn again as PNG by the browser.
async function comoPng(blob) {
  const foto = await createImageBitmap(blob);
  try {
    const lienzo = new OffscreenCanvas(foto.width, foto.height);
    lienzo.getContext('2d').drawImage(foto, 0, 0);
    return new Uint8Array(await (await lienzo.convertToBlob({ type: 'image/png' })).arrayBuffer());
  } finally {
    foto.close();
  }
}

const traerDe = (item) => (item.traer ? item.traer() : traerArchivo(item));
const turno = () => new Promise((r) => setTimeout(r, 0));

// The bookmarks: pdf-lib has no way to write them, so they go by hand, one per file, flat.
function marcar(lib, salida, marcas) {
  if (!marcas.length) return;
  const { PDFName, PDFNumber, PDFHexString } = lib;
  const ctx = salida.context;
  const raiz = ctx.nextRef();
  const refs = marcas.map(() => ctx.nextRef());
  marcas.forEach((m, i) => {
    const d = { Title: PDFHexString.fromText(m.titulo), Parent: raiz, Dest: ctx.obj([m.pagina.ref, PDFName.of('Fit')]) };
    if (i > 0) d.Prev = refs[i - 1];
    if (i < marcas.length - 1) d.Next = refs[i + 1];
    ctx.assign(refs[i], ctx.obj(d));
  });
  ctx.assign(raiz, ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs.at(-1), Count: PDFNumber.of(marcas.length) }));
  salida.catalog.set(PDFName.of('Outlines'), raiz);
  salida.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

const cargarLib = () => import('@cantoo/pdf-lib');
const bajar = (traer, item) => Promise.resolve().then(() => traer(item)).catch(() => { throw new Error('bajar'); });

async function abrir(PDFDocument, bytes) {
  try {
    // A PDF locked only against copying or printing opens with no password, as in any viewer.
    return await PDFDocument.load(bytes, { password: '', updateMetadata: false });
  } catch (e) {
    throw new Error(/password|encrypt/i.test(e?.message ?? '') ? 'clave' : 'roto');
  }
}

/** Why a file can't go, for the student: from the Error that `revisarArchivo` or `fusionar` threw. */
export const motivoDe = (e) => MOTIVOS[e?.message] ?? MOTIVOS.roto;

/**
 * Looks at a file as soon as it's chosen, so a problem shows before merging: brings it and counts its pages.
 * Returns { blob, tipo: 'pdf' | 'imagen', paginas }; throws an Error for `motivoDe` if it can't go.
 */
export async function revisarArchivo(item, { traer = traerDe, cargar = cargarLib } = {}) {
  const blob = await bajar(traer, item);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const tipo = clase(bytes);
  if (tipo === 'pdf') {
    const { PDFDocument } = await cargar();
    const documento = await abrir(PDFDocument, bytes);
    if (!documento.getPageCount()) throw new Error('roto');
    return { blob, tipo: 'pdf', paginas: documento.getPageCount() };
  }
  if (tipo === 'otra' && !esImagen(item)) throw new Error('roto');
  return { blob, tipo: 'imagen', paginas: 1 };
}

/** What's wrong with the pages written for a file of `total` pages, or '' if they are fine. */
export function errorDePaginas(texto, total) {
  const { rangos, error } = leerPaginas(texto);
  if (error) return error;
  if (!rangos || !total) return '';
  const pasado = rangos.some(([desde, hasta]) => desde > total || (hasta !== Infinity && hasta > total));
  return pasado ? `Llega hasta la página ${total}.` : '';
}

/**
 * Merges `partes` ([{ item, paginas, blob? }], `paginas` as the student wrote them; `blob` if it was already brought) in that order. A file that fails doesn't
 * stop the rest. Returns { cancelado, blob, paginas, fallaron: [{ nombre, motivo }] }; `blob` is null if nothing went in.
 */
export async function fusionar(partes, { titulo = '', senal, alProgreso, traer = traerDe, cargar = cargarLib } = {}) {
  const lib = await cargar();
  const { PDFDocument } = lib;
  const salida = await PDFDocument.create();
  if (titulo) salida.setTitle(titulo);
  salida.setProducer('Super CVG');
  salida.setCreator('Super CVG');
  const marcas = [];
  const fallaron = [];
  const total = partes.length;
  alProgreso?.({ hechos: 0, total });

  for (const [n, { item, paginas, blob: traido }] of partes.entries()) {
    if (senal?.aborted) return { cancelado: true, blob: null, paginas: 0, fallaron };
    const nombre = item.nombre || nombreDe(item) || 'Archivo';
    const { rangos, error } = leerPaginas(paginas);
    try {
      if (error) throw new Error('paginas');
      const blob = traido ?? (await bajar(traer, item));
      if (senal?.aborted) return { cancelado: true, blob: null, paginas: 0, fallaron };
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const tipo = clase(bytes);
      let primera = null;
      if (tipo === 'pdf') {
        const origen = await abrir(PDFDocument, bytes);
        const indices = paginasDe(rangos, origen.getPageCount());
        if (!indices.length) throw new Error('sinPaginas');
        const copias = await salida.copyPages(origen, indices);
        for (const p of copias) salida.addPage(p);
        primera = copias[0];
      } else {
        if (rangos && !paginasDe(rangos, 1).length) throw new Error('sinPaginas');
        const foto = tipo === 'jpg' ? await salida.embedJpg(bytes) : tipo === 'png' ? await salida.embedPng(bytes) : await salida.embedPng(await comoPng(blob));
        const alto = (foto.height * ANCHO_HOJA) / foto.width;
        primera = salida.addPage([ANCHO_HOJA, alto]);
        primera.drawImage(foto, { x: 0, y: 0, width: ANCHO_HOJA, height: alto });
      }
      marcas.push({ titulo: nombre, pagina: primera });
    } catch (e) {
      if (senal?.aborted) return { cancelado: true, blob: null, paginas: 0, fallaron };
      fallaron.push({ nombre, motivo: motivoDe(e) });
    }
    alProgreso?.({ hechos: n + 1, total });
    await turno();
  }

  if (!marcas.length) return { cancelado: false, blob: null, paginas: 0, fallaron };
  marcar(lib, salida, marcas);
  const bytes = await salida.save({ useObjectStreams: true });
  if (senal?.aborted) return { cancelado: true, blob: null, paginas: 0, fallaron };
  return { cancelado: false, blob: new Blob([bytes], { type: 'application/pdf' }), paginas: salida.getPageCount(), fallaron };
}

const MOTIVOS = {
  clave: 'tiene contraseña',
  roto: 'no se pudo abrir',
  sinPaginas: 'no tiene esas páginas',
  paginas: 'las páginas están mal escritas',
  bajar: 'no se pudo bajar',
};
