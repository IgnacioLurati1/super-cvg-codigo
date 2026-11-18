// Where Consultron looks for an answer, and in what order: nothing is read when it opens, only when something is asked.
// First what El Santo Resumen has of the student's courses (the text of the bank's summaries and the topics of its
// official pages), which is little text and comes at once. Then the campus PDFs, a few at a time, the likeliest first
// (the ones whose name or section has the words of the question), until the pieces found have most of those words.
// The pieces, in memory; another session starts from scratch. The text of the PDFs is kept by indicePdf.js.
import { docDe } from '../lectura';
import { cargarBanco, cargarIndice, cargarTextos, resumenDe, urlDePagina } from '../santoResumen';
import { tokenActual } from '../sesion';
import { elegir, juntar, palabras, prepararTrozos, trozar } from './fragmentos';

/** How many PDFs are read at a time, between one look and the next. */
export const LOTE = 4;

/** What El Santo Resumen has of some campus courses (`materias`: [{ nombre }]), as documents to search: each summary of
 * the bank with its text, and each topic of the official pages. Each subject is asked once per visit (santoResumen.js
 * keeps it). What fails is left out: the PDFs still answer. */
export async function delSanto(materias, cargar = { banco: cargarBanco, textos: cargarTextos, indice: cargarIndice }) {
  const pares = [];
  const vistos = new Set();
  for (const m of materias) {
    const r = resumenDe(m.nombre);
    if (r && !vistos.has(r.slug)) {
      vistos.add(r.slug);
      pares.push({ slug: r.slug, materia: m.nombre });
    }
  }
  if (!pares.length) return [];
  const nada = () => [];
  const [indice, ...porMateria] = await Promise.all([
    cargar.indice().catch(nada),
    ...pares.map(({ slug }) => Promise.all([cargar.banco(slug).catch(nada), cargar.textos(slug).catch(nada)])),
  ]);
  const docs = [];
  pares.forEach(({ slug, materia }, k) => {
    const [banco, textos] = porMateria[k];
    const porId = new Map(banco.map((r) => [r.id, r]));
    for (const t of textos) {
      const resumen = porId.get(t.id);
      if (resumen) docs.push({ doc: `resumen:${t.id}`, fuente: { tipo: 'resumen', nombre: resumen.titulo, materia, resumen }, paginas: [t.texto] });
    }
    for (const e of indice.find((x) => x.slug === slug)?.entradas ?? []) {
      docs.push({
        doc: `oficial:${slug}/${e.pagina}#${e.ancla}`,
        fuente: { tipo: 'oficial', nombre: e.titulo, materia, url: urlDePagina(slug, e.pagina, e.ancla) },
        paginas: [`${e.titulo}. ${e.texto}`],
      });
    }
  });
  return docs;
}

/** The PDFs in the order worth reading them for some words: first the ones whose name or section has the most. */
export function ordenarPdfs(pdfs, ps) {
  return pdfs
    .map((i, k) => {
      const suyas = new Set(palabras(`${i.nombre ?? ''} ${i.archivo ?? ''} ${i.seccion ?? ''}`));
      return { i, k, n: ps.filter((p) => suyas.has(p)).length };
    })
    .sort((a, b) => b.n - a.n || a.k - b.k)
    .map((x) => x.i);
}

// The pieces of each document, ready to search, made once: the next question doesn't cut the same PDF again.
const preparados = new Map();
let de = null;

// `trozos`, if the document brings them already cut (what the student attaches, adjuntar.js).
function piezasDe(d) {
  let p = preparados.get(d.doc);
  if (!p) {
    p = prepararTrozos((d.trozos ?? trozar(d.doc, d.paginas)).map((t) => ({ ...t, fuente: d.fuente })));
    preparados.set(d.doc, p);
  }
  return p;
}

/** Drops the pieces kept of some documents (by `doc`): what was attached, once the talk is cleared. */
export function olvidar(docs) {
  for (const doc of docs) preparados.delete(doc);
}

/** The pieces of some documents that best match a question (fragmentos.js, `elegir`). */
export const elegirEn = (docs, pregunta) => elegir(juntar(docs.flatMap(piezasDe)), pregunta);

/** The pieces that answer a question best, each { trozo, puntaje, cubre } with its `fuente` in the piece. `santo`: the
 * documents of delSanto. `pdfs`: the ones that can be read; `leer(lote)` reads some (indicePdf.js, `leerPdfs`) and
 * `leidos(pdfs)` gives the text of the ones read (`textosDe`), each { item, paginas } and, if it isn't a PDF, its own
 * `fuente` and `trozos` (a picture of the student's, donde.js). It stops reading when a piece has most of the question's
 * words, when there's nothing left or when `senal` is aborted. `alLeer()` is called before each round of PDFs. */
export async function buscarPiezas(pregunta, { santo = [], pdfs = [], leer, leidos, senal, alLeer = () => {} }) {
  const ahora = tokenActual();
  if (ahora !== de) {
    de = ahora;
    preparados.clear();
  }
  const ps = [...new Set(palabras(pregunta))];
  if (!ps.length) return [];
  const necesita = Math.max(1, Math.ceil(ps.length * 0.6));
  const orden = ordenarPdfs(pdfs, ps);
  const docs = [...santo];
  const enDocs = new Set();
  const probados = new Set();
  const sumar = () => {
    for (const { item, paginas, fuente, trozos } of leidos(pdfs)) {
      const doc = docDe(item);
      probados.add(doc);
      if (enDocs.has(doc)) continue;
      enDocs.add(doc);
      docs.push({ doc, fuente: fuente ?? { tipo: 'pdf', nombre: item.nombre, materia: item.materia, item }, paginas, ...(trozos ? { trozos } : {}) });
    }
  };
  sumar();
  for (;;) {
    const elegidos = elegirEn(docs, pregunta);
    if (elegidos.some((e) => e.cubre >= necesita)) return elegidos;
    const lote = orden.filter((i) => !probados.has(docDe(i))).slice(0, LOTE);
    if (!lote.length || senal?.aborted) return elegidos;
    alLeer();
    await leer(lote);
    // What couldn't be read (too big, broken) isn't tried again for this question.
    for (const i of lote) probados.add(docDe(i));
    if (senal?.aborted) return elegidos;
    sumar();
  }
}
