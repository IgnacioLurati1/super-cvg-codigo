// What the screen shows now, for Consultron open over it (the calculators and the lab): the data the student loaded and
// the result with its steps, as text. The math is still done by the calculator: Consultron reads it and explains it.
// A screen can say what it shows (`usePantallaDeConsultron`), which is the way when the page has nothing to read (a
// drawing in a canvas). The rest are read from the page, as a screen reader would: every field with its label, and the
// sheet with the resolution. It is read when a question is asked, never kept.
// Nothing else of Consultron comes with this file: the screens that call the hook stay as light as they were.
import { useEffect, useRef } from 'react';
import { plegar } from './fragmentos.js';

/** The screens Consultron reads carry this attribute in their root. */
export const MARCA_PANTALLA = 'data-consultron-pantalla';
const MAX_DATOS = 80;
const TOPE_VALOR = 600;
const TOPE_TEXTO = 8000;

const limpio = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const corto = (t, tope) => (t.length > tope ? `${t.slice(0, tope)}…` : t);

// The screens that say by themselves what they show, while they are open: the last one opened is the one on top (a
// round of Repaso over Repaso), and closing it gives the one under back.
const registradas = [];

/**
 * A screen tells Consultron what it shows now: { titulo, datos, resultado, notas, sola, ide }. `datos` (what the student
 * loaded) and `resultado` (what came out, with its steps) are lists of [etiqueta, valor] in plain text; `notas`, free
 * text. `sola`: questions asked over it are about it (Tu carrera), so it answers with the screen and not the notes.
 * `ide()`: the lab's files, for Consultron in «Código» (ideAhora).
 * Called on every render with the values of the moment: they are read only when a question is asked.
 */
export function usePantallaDeConsultron(pantalla) {
  const ultima = useRef(pantalla);
  useEffect(() => {
    ultima.current = pantalla;
  });
  useEffect(() => {
    const mia = { leer: () => ultima.current };
    registradas.push(mia);
    return () => {
      const i = registradas.indexOf(mia);
      if (i >= 0) registradas.splice(i, 1);
    };
  }, []);
}

/** What the lab on top lets Consultron's agent do with its files (`ide()`, consultron/ideDelLab.js), or null. */
export function ideAhora() {
  const ide = registradas.at(-1)?.leer()?.ide;
  return typeof ide === 'function' ? ide() : null;
}

const BLOQUES = 'p, li, h1, h2, h3, h4, h5, h6, tr, div, section, dt, dd, figcaption, legend, caption, pre';

/** What a screen reader would read in a piece of the page: without what is hidden from it, each block in its line, a
 * formula by its LaTeX and a drawing by its name. */
export function textoAccesible(nodo) {
  if (!nodo) return '';
  const copia = nodo.cloneNode(true);
  const doc = copia.ownerDocument;
  for (const k of copia.querySelectorAll('.katex')) {
    const tex = k.querySelector('annotation')?.textContent;
    k.replaceWith(doc.createTextNode(tex ? ` ${tex} ` : ' '));
  }
  for (const x of copia.querySelectorAll('[aria-hidden="true"], [hidden], script, style, button, input, select, textarea')) x.remove();
  for (const d of copia.querySelectorAll('svg, canvas, img, [role="img"]')) {
    const nombre = limpio(d.getAttribute('aria-label') ?? d.getAttribute('alt') ?? d.querySelector?.('title')?.textContent);
    d.replaceWith(doc.createTextNode(nombre ? ` ${nombre} ` : ' '));
  }
  for (const br of copia.querySelectorAll('br')) br.replaceWith(doc.createTextNode('\n'));
  for (const c of copia.querySelectorAll('td, th')) c.append(doc.createTextNode(' | '));
  for (const b of copia.querySelectorAll(BLOQUES)) {
    b.prepend(doc.createTextNode('\n'));
    b.append(doc.createTextNode('\n'));
  }
  return copia.textContent
    .split('\n')
    .map((l) => limpio(l).replace(/( \|)+$/, ''))
    .filter(Boolean)
    .join('\n');
}

// The label of a field, without the field itself (a label that wraps a select would bring every option).
function etiquetaDe(el) {
  const propia = limpio(el.getAttribute('aria-label'));
  if (propia) return propia;
  const por = el.getAttribute('aria-labelledby');
  if (por) {
    const texto = limpio(por.split(/\s+/).map((id) => textoAccesible(el.ownerDocument.getElementById(id))).join(' '));
    if (texto) return texto;
  }
  const label = el.labels?.[0] ?? el.closest('label');
  return limpio(textoAccesible(label)) || limpio(el.getAttribute('placeholder')) || limpio(el.getAttribute('name'));
}

const grupoDe = (el) => limpio(textoAccesible(el.closest('fieldset')?.querySelector('legend')));

/**
 * What a screen shows, read from the page: { titulo, datos, resultado }. `raiz`: its root. The fields outside the
 * sheet are the data (an option, only if it's chosen); the sheet (.calc-hoja), the result with its steps.
 */
export function leerDelDom(raiz) {
  if (!raiz) return null;
  const hojas = [...raiz.querySelectorAll('.calc-hoja')];
  const datos = [];
  for (const el of raiz.querySelectorAll('input, select, textarea')) {
    if (datos.length >= MAX_DATOS) break;
    if (el.disabled || ['hidden', 'file', 'password', 'button', 'submit', 'reset'].includes(el.type)) continue;
    if (el.closest('[hidden], [aria-hidden="true"]') || hojas.some((h) => h.contains(el))) continue;
    // A field of a tab that is closed isn't on the screen.
    if (typeof el.checkVisibility === 'function' && !el.checkVisibility()) continue;
    if (el.type === 'radio' || el.type === 'checkbox') {
      if (!el.checked) continue;
      const grupo = grupoDe(el);
      const opcion = etiquetaDe(el);
      // An option of a group says which; a lone checkbox, that it's on.
      datos.push(grupo ? [grupo, opcion] : [opcion || 'Opción', 'sí']);
      continue;
    }
    const valor = limpio(el.tagName === 'SELECT' ? el.selectedOptions?.[0]?.textContent : el.value);
    if (!valor) continue;
    datos.push([etiquetaDe(el) || 'Dato', corto(valor, TOPE_VALOR)]);
  }
  const resolucion = corto(hojas.map(textoAccesible).filter(Boolean).join('\n'), TOPE_TEXTO);
  return { titulo: limpio(raiz.querySelector('h1')?.textContent), datos, resultado: resolucion ? [['', resolucion]] : [] };
}

const filas = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((f) => Array.isArray(f) && limpio(f[1]))
    .slice(0, MAX_DATOS)
    .map(([etiqueta, valor]) => (limpio(etiqueta) ? `- ${limpio(etiqueta)}: ${corto(String(valor).trim(), TOPE_TEXTO)}` : corto(String(valor).trim(), TOPE_TEXTO)));

/** A screen as the text Consultron reads, or '' if it shows nothing yet. */
export function pantallaEnTexto({ titulo = '', datos = [], resultado = [], notas = '' } = {}) {
  const cargados = filas(datos);
  const salio = filas(resultado);
  const aparte = limpio(notas);
  if (!cargados.length && !salio.length && !aparte) return '';
  return [
    `${limpio(titulo) || 'Una pantalla'} de Super CVG, como la tiene ahora el alumno en su pantalla.`,
    cargados.length ? `Datos que cargó:\n${cargados.join('\n')}` : 'Todavía no cargó datos.',
    salio.length ? `Lo que muestra como resultado, con sus pasos:\n${salio.join('\n')}` : 'Todavía no muestra un resultado.',
    aparte,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The screen open now, { nombre, texto, sola }, or null if no screen is there to read or it shows nothing yet. What
 * the screen says by itself goes over what is read from the page.
 */
export function pantallaAhora(raiz = globalThis.document?.querySelector(`[${MARCA_PANTALLA}]`)) {
  const dicha = registradas.at(-1)?.leer() ?? null;
  const leida = leerDelDom(raiz);
  if (!dicha && !leida) return null;
  const pantalla = { ...(leida ?? {}), ...Object.fromEntries(Object.entries(dicha ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))) };
  const texto = pantallaEnTexto(pantalla);
  if (!texto) return null;
  // `porPregunta`: a screen too big for a small model gives, for each question, only what it needs (Tu carrera).
  return { nombre: limpio(pantalla.titulo) || 'Lo que hay en pantalla', texto, sola: Boolean(dicha?.sola), porPregunta: typeof dicha?.porPregunta === 'function' ? dicha.porPregunta : null };
}

// What points at what the student has in front: something of theirs or this one, named («mi programa», «este
// gráfico»), «esto», «acá», the screen, what came out («me da») or a hint (a card of Repaso, an exercise). An order to write something new («escribí un código
// que diga mi nombre») points at nothing.
const COSA = '(?:programas?|c[oó]digos?|scripts?|consultas?|funci[oó]n|funciones|gr[aá]fic[oa]s?|resultados?|salidas?|errores|error|tablas?|ejercicios?|cuentas?|datos|curvas?|superficies?)';
const SENALA = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:(?:mis?|est[ae]s?|estos)\\s+${COSA}|esto|ac[aá]|pistas?|(?:en|de)\\s+(?:la\\s+|mi\\s+)?pantalla|me\\s+(?:da|dio|sale|sali[oó]|tira|tir[oó]|queda|qued[oó]|falla|fall[oó]))(?![\\p{L}\\p{N}])`,
  'iu',
);

/** Whether a question is about what the screen shows («¿qué hace mi programa?», «¿por qué me da esto?»): then it's
 * answered with the screen alone. With the notes around it, the model answers from a program or a graph of theirs. */
export const senalaLaPantalla = (pregunta) => SENALA.test(String(pregunta ?? ''));

// A verb of making and then «un», «una», «otro»: «escribí un código», «haceme una función», «dame otro ejemplo».
const ALGO_NUEVO =
  /\b(escrib(i|e|ir|ime|eme|ite)|hac(e|er|eme|ete)|haz(me)?|arm(a|ar|ame|ate)|gener(a|ar|ame|ate)|cre(a|ar|ame|ate)|program(a|ar|ame|ate)|redact(a|ar|ame|ate)|invent(a|ar|ame|ate)|dame|pasame|mostrame|tirame|poneme|necesito|quiero)\b[^.?!]*\b(un|una|unos|unas|otro|otra)\b/;

/** Whether a question asks to make something new («escribí un código que diga hola»): then what the screen shows stays
 * out of the answer, unless the question points at it. With the program of the screen in front, the model copies it. */
export const pideAlgoNuevo = (pregunta) => ALGO_NUEVO.test(plegar(String(pregunta ?? '')));
