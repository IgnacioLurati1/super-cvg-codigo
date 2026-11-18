import { FORMATOS, ID, nombreDeMateria, SLUG, urlDeResumen } from '../santoResumen';
import { abrirPestana } from './mesa';

// A summary of El Santo Resumen on the table (a `resumen` tab). Only what says which one goes in the Y.Doc: its id, its
// title, its format, its subject and whether its scripts run (an interactive HTML, `js`). Each browser brings it from El Santo Resumen itself (verResumen.js), as when it
// opens one on its own: the summaries are public, and the session passes none of its bytes.

const MAX_TITULO = 120;
// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

/** The tab's fields ({ id, titulo, formato, js, materia, materiaNombre, url }), checked; null if they don't read. */
export function datosDeResumen(datos) {
  const id = datos?.get?.('id');
  const formato = datos?.get?.('formato');
  if (typeof id !== 'string' || !ID.test(id) || typeof formato !== 'string' || !Object.hasOwn(FORMATOS, formato)) return null;
  const materia = typeof datos.get('materia') === 'string' && SLUG.test(datos.get('materia')) ? datos.get('materia') : '';
  return {
    id: id.toLowerCase(),
    titulo: limpio(datos.get('titulo'), MAX_TITULO) || 'Resumen',
    formato,
    // As El Santo Resumen says it (santoResumen.js): it opens in its reader, as in Resúmenes (VisorResumen.jsx).
    js: formato === 'html' && datos.get('js') === true,
    materia,
    materiaNombre: materia ? nombreDeMateria(materia) : '',
    // The page of El Santo Resumen is built here from the id and the subject, never taken from the others.
    url: materia ? urlDeResumen(materia, id.toLowerCase()) : '',
  };
}

/** Opens the summary on the table as a new tab for everyone. Returns the tab's id. */
export function llevarResumen(sesion, r) {
  if (!r || typeof r.id !== 'string' || !ID.test(r.id) || !Object.hasOwn(FORMATOS, r.formato ?? '')) {
    throw Object.assign(new Error('Este resumen no se puede llevar a la sesión.'), { conocido: true });
  }
  const titulo = limpio(r.titulo, MAX_TITULO) || 'Resumen';
  const id = abrirPestana(sesion.doc, 'resumen', {
    titulo,
    datos: { id: r.id.toLowerCase(), titulo, formato: r.formato, js: r.formato === 'html' && r.js === true, materia: typeof r.materia === 'string' && SLUG.test(r.materia) ? r.materia : '' },
    por: sesion.yo.nombre,
  });
  if (!id) throw Object.assign(new Error('La mesa ya tiene todas las pestañas que entran. Cerrá alguna.'), { conocido: true });
  return id;
}

/** How far down someone is in an HTML or Word summary: { y } from 0 to 1, or null. A PDF uses the Apunte's view. */
export function leerDesplazamiento(v) {
  return v && typeof v.y === 'number' && Number.isFinite(v.y) && v.pagina === undefined ? { y: Math.min(1, Math.max(0, v.y)) } : null;
}

// ---------- Where someone points in an HTML or Word summary ----------
// Everyone has the same summary, so a place in it is said by its content, never by the screen: the path of child
// elements from the summary's root to the one under the pointer and where in its box (0 to 1); over text, also which
// text node of it and which letter, so it lands on the same word however the lines wrap in each window.
const MAX_RUTA = 40;
const MAX_HIJO = 100_000;
const MAX_LETRA = 1_000_000;
// A letter counts as under the pointer only this close to it, sideways.
const CERCA = 24;
const indice = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;
const fraccion = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null);
const redondo = (n) => Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;

/** The path of child-element positions from `raiz` down to `el` (`[]` for the root), or null if it isn't inside. */
export function rutaDe(raiz, el) {
  const ruta = [];
  let n = el;
  for (; n && n !== raiz; n = n.parentElement) {
    if (!n.parentElement) return null;
    ruta.push(Array.prototype.indexOf.call(n.parentElement.children, n));
  }
  return n === raiz ? ruta.reverse() : null;
}

/** The element at that path in this browser's copy, or null if there is none. */
export function elementoDe(raiz, ruta) {
  let n = raiz;
  for (const i of ruta) {
    n = n.children[i];
    if (!n) return null;
  }
  return n;
}

/** The box of letter `letra` of a text node, or null (a letter past the end: the last one's right edge). */
export function cajaDeLetra(texto, letra) {
  if (!texto || texto.nodeType !== 3 || letra > texto.length || !texto.length) return null;
  const rango = texto.ownerDocument.createRange();
  const desde = letra < texto.length ? letra : letra - 1;
  rango.setStart(texto, desde);
  rango.setEnd(texto, desde + 1);
  const c = rango.getClientRects?.()[0] ?? rango.getBoundingClientRect?.();
  if (!c || (!c.width && !c.height)) return null;
  return letra < texto.length ? c : { left: c.right, right: c.right, top: c.top, bottom: c.bottom, width: 0, height: c.height };
}

/** The letter the browser says is under a point of `doc`: { nodo, letra }, or null. */
export function letraEn(doc, x, y) {
  const p = doc.caretPositionFromPoint?.(x, y);
  if (p) return { nodo: p.offsetNode, letra: p.offset };
  const r = doc.caretRangeFromPoint?.(x, y);
  return r ? { nodo: r.startContainer, letra: r.startOffset } : null;
}

/** Where a pointer at (x, y) over `objetivo` is in the summary under `raiz`, to publish: { r, x, y, n?, o? }, or null
 * if it is not over it. `letra`: what letraEn says there. */
export function puntoEn(raiz, objetivo, x, y, letra = null) {
  let el = objetivo?.nodeType === 3 ? objetivo.parentElement : objetivo;
  let ruta = el ? rutaDe(raiz, el) : null;
  if (!ruta) return null;
  const hondo = ruta.length > MAX_RUTA;
  if (hondo) {
    ruta = ruta.slice(0, MAX_RUTA);
    el = elementoDe(raiz, ruta);
  }
  const caja = el.getBoundingClientRect();
  const p = { r: ruta, x: caja.width ? redondo((x - caja.left) / caja.width) : 0, y: caja.height ? redondo((y - caja.top) / caja.height) : 0 };
  const t = letra?.nodo;
  if (!hondo && t?.nodeType === 3 && t.parentElement === el && indice(letra.letra, MAX_LETRA)) {
    const c = cajaDeLetra(t, letra.letra);
    if (c && Math.abs(c.top + c.height / 2 - y) <= Math.max(c.height, 8) && x >= c.left - CERCA && x <= c.right + CERCA) {
      p.n = Array.prototype.indexOf.call(el.childNodes, t);
      p.o = letra.letra;
    }
  }
  return p;
}

/** Someone's point, checked: { r, x, y, n?, o? }, or null. */
export function leerPunto(m) {
  if (!m || typeof m !== 'object' || !Array.isArray(m.r) || m.r.length > MAX_RUTA || !m.r.every((i) => indice(i, MAX_HIJO))) return null;
  const x = fraccion(m.x);
  const y = fraccion(m.y);
  if (x === null || y === null) return null;
  const p = { r: [...m.r], x, y };
  if (indice(m.n, MAX_HIJO) && indice(m.o, MAX_LETRA)) {
    p.n = m.n;
    p.o = m.o;
  }
  return p;
}

/** Where a checked point lands in this browser's copy under `raiz`: { x, y } in the coordinates of the root's window,
 * or null if the summary here has no such place. */
export function lugarDe(raiz, p) {
  const el = elementoDe(raiz, p.r);
  if (!el) return null;
  if (p.n !== undefined) {
    const c = cajaDeLetra(el.childNodes[p.n], p.o);
    if (c) return { x: c.left, y: c.top + c.height / 2 };
  }
  const caja = el.getBoundingClientRect();
  if (!caja.width && !caja.height) return null;
  return { x: caja.left + p.x * caja.width, y: caja.top + p.y * caja.height };
}
