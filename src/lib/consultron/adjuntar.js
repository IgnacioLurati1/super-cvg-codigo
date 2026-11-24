// What the student attaches to Consultron: photos, PDF and text files, read in this browser and kept only in memory.
// Nothing is uploaded nor goes to disk. Each one is read as soon as it's attached, one at a time: a photo with ocr.js
// (the model reads only text; with «Usar Gemini», Gemini also gets the photo with its question, fotosParaGemini.js), a
// PDF with leerTexto.js, a text file as it is. What was read becomes a document of the
// talk (fuente `adjunto`): it goes with its question, and later questions search it together with the notes. Until
// «Borrar las preguntas» (motor.js, `limpiar`) or another session, which also let go of the addresses of the photos
// (`blob:`, for their thumbnails). The attachments in the box are one for the tab, whichever view shows them.
import { useSyncExternalStore } from 'react';
import { tokenActual } from '../sesion';
import { elegir, indexar, trozar } from './fragmentos';
import { olvidar } from './fuentes';
import { usaGemini } from './nube';
import { leerFoto } from './ocr';

export const MAX_ADJUNTOS = 5;
export const TOPE_ADJUNTO = 20 * 1024 * 1024;
/** An attachment this long or shorter (in letters) goes whole with its question. */
export const ENTERO = 1800;
/** A text file is read up to this many letters. */
export const TOPE_TEXTO = 1_000_000;
// A text file goes in pages of about this, so the search can take pieces from all of it (fragmentos.js takes at most
// two of a page). Its pieces, of about a piece of a PDF.
const PAGINA_TEXTO = 2700;
const LARGO_TROZO = 900;

const FOTOS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const TEXTOS = ['txt', 'md', 'c', 'h', 'py', 'sql', 'csv', 'java', 'js'];
// Code isn't an exercise for a calculator, even with its = and its numbers.
const CODIGO = ['c', 'h', 'py', 'sql', 'java', 'js'];
// What can be turned into something it reads.
const DE_OFICINA = ['doc', 'docx', 'odt', 'rtf', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'ods'];
const OTRAS_FOTOS = ['heic', 'heif', 'avif', 'gif', 'bmp', 'tif', 'tiff'];

/** What the file picker offers. */
export const ACEPTA = [...new Set(Object.values(FOTOS)), 'application/pdf', ...[...Object.keys(FOTOS), 'pdf', ...TEXTOS].map((e) => `.${e}`)].join(',');

const extensionDe = (nombre) => /\.([a-z0-9]{1,5})$/i.exec(String(nombre ?? ''))?.[1].toLowerCase() ?? '';
const nombreDe = (archivo) => String(archivo.name || 'Sin nombre');
const entre = (archivo) => `«${nombreDe(archivo)}»`;

/** What kind of file it is: 'foto', 'pdf', 'texto', or null if it can't be read. By its name, or by its type when it
 * has no extension. */
export function claseDe(archivo) {
  const ext = extensionDe(archivo.name);
  if (ext) {
    if (Object.hasOwn(FOTOS, ext)) return 'foto';
    if (ext === 'pdf') return 'pdf';
    return TEXTOS.includes(ext) ? 'texto' : null;
  }
  if (Object.values(FOTOS).includes(archivo.type)) return 'foto';
  if (archivo.type === 'application/pdf') return 'pdf';
  return archivo.type === 'text/plain' ? 'texto' : null;
}

function mimeDe(archivo, clase) {
  if (clase === 'foto') return FOTOS[extensionDe(archivo.name)] ?? archivo.type;
  return clase === 'pdf' ? 'application/pdf' : 'text/plain';
}

function noLeo(archivo) {
  const ext = extensionDe(archivo.name);
  if (DE_OFICINA.includes(ext)) return `No puedo leer ${entre(archivo)}. Guardalo como PDF y adjuntalo.`;
  if (OTRAS_FOTOS.includes(ext) || /^image\//.test(archivo.type)) return `No puedo leer ${entre(archivo)}. Pasala a JPG o PNG.`;
  return `No puedo leer ${entre(archivo)}. Van fotos, PDF y archivos de texto.`;
}

const mismo = (a, b) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Which of some files go next to the ones already in the box (`ya`, files) and why the others don't:
 * { van: [{ archivo, clase }], problemas: [texto] }. */
export function revisar(archivos, ya = []) {
  const van = [];
  const problemas = [];
  const afuera = [];
  for (const archivo of archivos) {
    const clase = claseDe(archivo);
    if (!clase) problemas.push(noLeo(archivo));
    else if (archivo.size > TOPE_ADJUNTO) problemas.push(`${entre(archivo)} pesa más de 20 MB. Probá con uno más liviano.`);
    else if (!archivo.size) problemas.push(`${entre(archivo)} está vacío. Probá con otro.`);
    else if ([...ya, ...van.map((v) => v.archivo)].some((b) => mismo(archivo, b))) problemas.push(`${entre(archivo)} ya está adjunto.`);
    else if (ya.length + van.length >= MAX_ADJUNTOS) afuera.push(entre(archivo));
    else van.push({ archivo, clase });
  }
  if (afuera.length) {
    const cuales = afuera.length === 1 ? `Quedó afuera ${afuera[0]}.` : afuera.length === 2 ? `Quedaron afuera ${afuera[0]} y ${afuera[1]}.` : `Quedaron afuera ${afuera.length} archivos.`;
    problemas.push(`Van hasta ${MAX_ADJUNTOS} archivos por pregunta. ${cuales}`);
  }
  return { van, problemas };
}

/** Whether a text has something to read: a few letters or numbers. */
export const tieneTexto = (t) => String(t ?? '').replace(/[^\p{L}\p{N}]/gu, '').length >= 4;

/** A text file in pages of about PAGINA_TEXTO letters, cut between lines. */
export function paginasDeTexto(texto) {
  const paginas = [];
  let actual = '';
  for (const linea of String(texto).replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')) {
    if (actual && actual.length + linea.length > PAGINA_TEXTO) {
      paginas.push(actual);
      actual = '';
    }
    actual += `${linea}\n`;
  }
  if (actual.trim()) paginas.push(actual);
  return paginas;
}

/** What a photo without text says to the model: Gemini sees the photo itself. */
export const FOTO_SIN_TEXTO = 'La foto no tiene texto escrito.';

const problema = (texto) => Object.assign(new Error(texto), { problema: texto });
const cancelado = (e) => e?.name === 'AbortError';

const LECTORES = {
  foto: leerFoto,
  pdf: async (archivo, senal) => (await import('../leerTexto')).textoDePaginas(archivo, senal),
  texto: (archivo) => archivo.text(),
};

/**
 * What a file says, in pages: one for a photo, one per page for a PDF, of about PAGINA_TEXTO letters for a text file.
 * { paginas, aviso }, `aviso` if it read only part of it. Throws with `problema`, what to tell the student, if there's
 * nothing to read. `alAvance`: how reading a photo goes (ocr.js). `leer`: the readers, for the tests. `fotoSinTexto`: a
 * photo without text is kept (with «Usar Gemini», Gemini looks at it).
 */
export async function leerArchivo(archivo, clase, { senal, alAvance = () => {}, leer = LECTORES, fotoSinTexto = false } = {}) {
  if (clase === 'foto') {
    let texto;
    try {
      texto = await leer.foto(archivo, { senal, alAvance });
    } catch (e) {
      if (cancelado(e)) throw e;
      throw problema(e?.motivo === 'lector' ? 'No pude cargar el lector de fotos. Probá de nuevo en un rato.' : `No pude abrir ${entre(archivo)}. Probá con otra foto.`);
    }
    if (!tieneTexto(texto)) {
      if (fotoSinTexto) return { paginas: [FOTO_SIN_TEXTO] };
      throw problema(`No encontré texto en ${entre(archivo)}. Probá con una foto más nítida.`);
    }
    return { paginas: [texto] };
  }
  if (clase === 'pdf') {
    let paginas;
    try {
      paginas = await leer.pdf(archivo, senal);
    } catch (e) {
      if (cancelado(e)) throw e;
      throw problema(e?.name === 'PasswordException' ? `${entre(archivo)} tiene contraseña. Sacásela y adjuntalo de nuevo.` : `No pude abrir ${entre(archivo)}. Probá con otro PDF.`);
    }
    if (!paginas.some(tieneTexto)) throw problema(`${entre(archivo)} no tiene texto, parece escaneado. Sacale fotos a las páginas.`);
    return { paginas };
  }
  let texto;
  try {
    texto = String(await leer.texto(archivo));
  } catch {
    throw problema(`No pude abrir ${entre(archivo)}. Probá con otro archivo.`);
  }
  if (texto.includes('\u0000')) throw problema(`${entre(archivo)} no es un archivo de texto. Van fotos, PDF y archivos de texto.`);
  if (!tieneTexto(texto)) throw problema(`${entre(archivo)} está vacío. Probá con otro.`);
  const largo = texto.length > TOPE_TEXTO;
  return { paginas: paginasDeTexto(texto.slice(0, TOPE_TEXTO)), aviso: largo ? `${entre(archivo)} es muy largo. Leí solo el principio.` : undefined };
}

// The pieces of a photo or a text file: by lines, keeping them (code and exercises are read by line), of about
// LARGO_TROZO letters. A short one stays, however short.
function cortar(doc, paginas) {
  const trozos = [];
  paginas.forEach((crudo, i) => {
    let actual = '';
    const lineas = String(crudo ?? '').split('\n').flatMap((l) => Array.from({ length: Math.max(1, Math.ceil(l.length / LARGO_TROZO)) }, (_, k) => l.slice(k * LARGO_TROZO, (k + 1) * LARGO_TROZO)));
    for (const linea of lineas) {
      if (actual.trim() && actual.length + linea.length > LARGO_TROZO) {
        trozos.push({ doc, pagina: i + 1, texto: actual.trim() });
        actual = '';
      }
      actual += `${linea.trimEnd()}\n`;
    }
    if (actual.trim()) trozos.push({ doc, pagina: i + 1, texto: actual.trim() });
  });
  return trozos;
}

/** The document of an attachment already read ({ id, nombre, clase, archivo, mime, paginas }), as fuentes.js searches
 * it: its pieces already cut, a PDF like the campus ones. */
export function documentoDe(a) {
  const doc = `adjunto:${a.id}`;
  const fuente = { tipo: 'adjunto', nombre: a.nombre, clase: a.clase, adjunto: a.id, archivo: a.archivo, mime: a.mime };
  const delPdf = a.clase === 'pdf' ? trozar(doc, a.paginas) : [];
  // A PDF of a line or two: trozar leaves out pages that short.
  return { doc, fuente, paginas: a.paginas, trozos: delPdf.length ? delPdf : cortar(doc, a.paginas) };
}

/** A PDF open in the reader, as fuentes.js searches it: the text of each of its pages, cut like the campus ones. */
export function documentoDePaginas(doc, fuente, paginas) {
  const delPdf = trozar(doc, paginas);
  return { doc, fuente, paginas, trozos: delPdf.length ? delPdf : cortar(doc, paginas) };
}

/** A text open on the screen (a summary of El Santo Resumen) as fuentes.js searches it, cut like a text file. */
export function documentoDeTexto(doc, fuente, texto) {
  const paginas = paginasDeTexto(texto);
  return { doc, fuente, paginas, trozos: cortar(doc, paginas) };
}

const largoDe = (d) => d.paginas.reduce((n, p) => n + String(p).length, 0);

/**
 * The pieces of a question's attachments that go with it, whatever the notes have: a short one (ENTERO letters or less)
 * whole; of a longer one, the pieces that best match the question, or its first ones if none does or there's no
 * question. At most `cuantos`, one of each in turn. Each { trozo, puntaje, cubre }, like fragmentos.js `elegir`.
 */
export function piezasPropias(docs, pregunta, cuantos = 6) {
  const filas = docs.map((d) => {
    const trozos = d.trozos.map((t) => ({ ...t, fuente: d.fuente }));
    if (largoDe(d) <= ENTERO || !pregunta) return trozos;
    const mejores = elegir(indexar(trozos), pregunta, { cuantos, porPagina: cuantos }).map((e) => e.trozo);
    return mejores.length ? mejores : trozos;
  });
  const elegidos = [];
  for (let i = 0; elegidos.length < cuantos && filas.some((f) => i < f.length); i++) {
    for (const f of filas) if (i < f.length && elegidos.length < cuantos) elegidos.push({ trozo: f[i], puntaje: Infinity, cubre: 0 });
  }
  return elegidos;
}

/** What of a question's attachments can be an exercise for a calculator (calculos.js): the text of the short ones that
 * aren't code. */
export function ejercicioDe(docs) {
  return docs
    .filter((d) => largoDe(d) <= ENTERO && !CODIGO.includes(extensionDe(d.fuente.nombre)))
    .map((d) => d.paginas.join('\n').trim())
    .join('\n\n');
}

/** The question of one that goes with attachments and no text, shown in its bubble. */
export function preguntaPorDefecto(adjuntos) {
  const fotos = adjuntos.length > 0 && adjuntos.every((a) => a.clase === 'foto');
  if (adjuntos.length > 1) return fotos ? '¿Qué dicen estas fotos?' : '¿Qué dicen estos archivos?';
  return fotos ? '¿Qué dice esta foto?' : '¿Qué dice este archivo?';
}

/** What Previa.jsx opens for a piece of an attachment: the photo, or the PDF at its page. Null for a text file. */
export function previaDe(fuente, pagina) {
  if (fuente.clase === 'texto') return null;
  return {
    id: `adjunto-${fuente.adjunto}`,
    tipo: 'archivo',
    nombre: fuente.nombre,
    archivo: fuente.nombre,
    peso: fuente.archivo.size,
    mime: fuente.mime,
    traer: async () => fuente.archivo,
    ...(fuente.clase === 'pdf' ? { abrirEn: { pagina } } : {}),
  };
}

// The attachments, in the box (`pendientes`) and in the talk (`charla`), each
// { id, archivo, nombre, clase, mime, url, estado: 'leyendo' | 'listo', doc, lectura, corte }. `lectura`: the promise of
// its document, null if it couldn't be read. `leyendo`: the one being read ({ id, clase, fase, fraccion }). `hecho`: what
// was read since the last attach, once nothing else is being read ('foto', 'pdf', 'texto' or 'varios').
let token;
let numero = 0;
let pendientes = [];
let charla = [];
let problemas = [];
let leyendo = null;
let hecho = '';
let leidos = [];
let cola = Promise.resolve();
let foto = null;
const avisados = new Set();

function avisar() {
  foto = null;
  avisados.forEach((f) => f());
}

function soltar(lista) {
  for (const a of lista) {
    a.corte.abort();
    if (a.url) URL.revokeObjectURL(a.url);
  }
  olvidar(lista.map((a) => `adjunto:${a.id}`));
}

// Another session starts with nothing attached.
function alDia() {
  const ahora = tokenActual();
  if (ahora === token) return;
  token = ahora;
  soltar([...pendientes, ...charla]);
  pendientes = [];
  charla = [];
  problemas = [];
  leyendo = null;
  hecho = '';
  leidos = [];
  foto = null;
}

function cambiar(id, cambio) {
  const ponerle = (a) => (a.id === id ? { ...a, ...cambio } : a);
  pendientes = pendientes.map(ponerle);
  charla = charla.map(ponerle);
}

function quitar(id) {
  const a = [...pendientes, ...charla].find((x) => x.id === id);
  if (!a) return;
  soltar([a]);
  pendientes = pendientes.filter((x) => x.id !== id);
  charla = charla.filter((x) => x.id !== id);
}

const otroLeyendo = () => [...pendientes, ...charla].some((a) => a.estado === 'leyendo');

function leerEnCola(a) {
  const deEsta = token;
  const sigue = () => !a.corte.signal.aborted && tokenActual() === deEsta;
  const turno = cola.then(async () => {
    if (!sigue()) return null;
    leyendo = { id: a.id, clase: a.clase, fase: 'leyendo', fraccion: 0 };
    avisar();
    try {
      const { paginas, aviso } = await leerArchivo(a.archivo, a.clase, {
        senal: a.corte.signal,
        fotoSinTexto: usaGemini(),
        alAvance: (p) => {
          if (!sigue()) return;
          leyendo = { id: a.id, clase: a.clase, ...p };
          avisar();
        },
      });
      if (!sigue()) return null;
      const doc = documentoDe({ ...a, paginas });
      cambiar(a.id, { estado: 'listo', doc });
      leidos = [...leidos, a.clase];
      if (aviso) problemas = [...problemas, aviso];
      return doc;
    } catch (e) {
      if (!sigue()) return null;
      quitar(a.id);
      problemas = [...problemas, e?.problema ?? `No pude abrir «${a.nombre}». Probá con otro archivo.`];
      return null;
    } finally {
      if (tokenActual() === deEsta) {
        if (leyendo?.id === a.id) leyendo = null;
        if (!otroLeyendo()) hecho = leidos.length > 1 ? 'varios' : (leidos[0] ?? '');
        avisar();
      }
    }
  });
  cola = turno.catch(() => {});
  return turno;
}

/** Attaches some files (from the button, dragged or pasted): the ones that go show in the box at once and start to be
 * read; why the others don't go, in `problemas`. */
export function adjuntar(archivos) {
  alDia();
  const { van, problemas: nuevos } = revisar([...archivos], pendientes.map((a) => a.archivo));
  problemas = nuevos;
  hecho = '';
  leidos = [];
  const sumados = van.map(({ archivo, clase }) => {
    numero += 1;
    return {
      id: `a${numero}`,
      archivo,
      nombre: nombreDe(archivo),
      clase,
      mime: mimeDe(archivo, clase),
      url: clase === 'foto' ? URL.createObjectURL(archivo) : null,
      estado: 'leyendo',
      doc: null,
      corte: new AbortController(),
    };
  });
  for (const a of sumados) a.lectura = leerEnCola(a);
  pendientes = [...pendientes, ...sumados];
  avisar();
}

/** Takes an attachment out of the box: it isn't read, and its thumbnail goes. */
export function sacar(id) {
  alDia();
  if (!pendientes.some((a) => a.id === id)) return;
  if (leyendo?.id === id) leyendo = null;
  quitar(id);
  avisar();
}

/** The attachments of the box go with a question: they move to the talk. Returns them, each with `lectura`, the
 * promise of its document. */
export function enviar() {
  alDia();
  const van = pendientes;
  pendientes = [];
  charla = [...charla, ...van];
  problemas = [];
  hecho = '';
  avisar();
  return van;
}

/** The documents of what was read of the talk's attachments, but the ones of `excepto` (ids). */
export function docsDeCharla(excepto = []) {
  alDia();
  return charla.filter((a) => a.doc && !excepto.includes(a.id)).map((a) => a.doc);
}

/** Lets go of the talk's attachments (motor.js, `limpiar`): their text and their thumbnails. The box stays. */
export function soltarCharla() {
  alDia();
  if (!charla.length) return;
  soltar(charla);
  charla = [];
  avisar();
}

/** Clears what was said about the last files attached. */
export function olvidarProblemas() {
  if (!problemas.length) return;
  problemas = [];
  avisar();
}

const escuchar = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

const leer = () => {
  alDia();
  foto ??= { pendientes, problemas, leyendo, hecho };
  return foto;
};

/** { pendientes, problemas, leyendo, hecho }: the box's attachments, what went wrong, and how reading goes. */
export const useAdjuntos = () => useSyncExternalStore(escuchar, leer, leer);

/** The same, outside React. */
export const estadoAdjuntos = leer;
