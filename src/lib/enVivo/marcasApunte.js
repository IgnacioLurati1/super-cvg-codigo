import { MAX_NOTA_RESALTADO } from '../lectura';

// What the table marks on a shared Apunte (a PDF, a picture or a summary of El Santo Resumen): highlights of text or
// of a zone of a page, each with a note if its author wants. They live in the tab's map, one key each (`m:<id>`),
// drawn in the color of whoever made it. Anyone deletes any; only its author writes its note. Everything read back
// from the map is checked and cut. A PDF shows them in the site's reader (notasDeLaMesa.js), with where its text is.

export const MAX_MARCAS = 150;
export const MAX_CAJAS = 80;
export const MAX_TEXTO = 300;
export const MAX_NOTA = MAX_NOTA_RESALTADO;
// How long a highlighted piece of a page's text can be, as the reader's (lectura.js).
const MAX_LARGO = 20000;
const MAX_PAGINAS = 5000;
const CLAVE = /^m:[0-9a-f]{12}$/;
const ID_PAR = /^[\w-]{1,64}$/;
// What the session's Consultron reads of them, at most.
const TOPE_CONSULTRON = 3000;

// eslint-disable-next-line no-control-regex
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max) : '');
const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const fraccion = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
const redondo = (n) => Math.round(n * 10000) / 10000;

/** Boxes of a page, from 0 to 1, checked: [[x, y, w, h]], or null if none reads. */
export function leerCajas(cajas) {
  if (!Array.isArray(cajas)) return null;
  const buenas = cajas.slice(0, MAX_CAJAS).filter((c) => Array.isArray(c) && c.length === 4 && c.every(fraccion) && c[2] > 0 && c[3] > 0 && c[0] + c[2] <= 1.001 && c[1] + c[3] <= 1.001);
  return buenas.length ? buenas.map((c) => c.map(redondo)) : null;
}

const conTexto = (v) => Number.isInteger(v.desde) && Number.isInteger(v.hasta) && v.desde >= 0 && v.hasta > v.desde && v.hasta - v.desde <= MAX_LARGO;

/** The marks of the tab, by page and then as they were made: [{ id, pagina, cajas, desde, hasta, texto, nota, de,
 * nombre, color, cuando }]. `desde` and `hasta`: where the text is in its page (lectura.js), or null. */
export function leerMarcas(datos) {
  const lista = [];
  datos.forEach((v, clave) => {
    if (!CLAVE.test(clave) || !v || typeof v !== 'object') return;
    const cajas = leerCajas(v.cajas);
    if (!Number.isInteger(v.pagina) || v.pagina < 1 || v.pagina > MAX_PAGINAS || !cajas || typeof v.de !== 'string' || !ID_PAR.test(v.de)) return;
    lista.push({
      id: clave.slice(2),
      pagina: v.pagina,
      cajas,
      desde: conTexto(v) ? v.desde : null,
      hasta: conTexto(v) ? v.hasta : null,
      texto: texto(v.texto, MAX_TEXTO).trim(),
      nota: texto(v.nota, MAX_NOTA).trim(),
      de: v.de,
      nombre: texto(v.nombre, 60).trim() || 'Alguien',
      color: texto(v.color, 40),
      cuando: Number.isFinite(v.cuando) ? v.cuando : 0,
    });
  });
  return lista.sort((a, b) => a.pagina - b.pagina || a.cuando - b.cuando || a.id.localeCompare(b.id)).slice(0, MAX_MARCAS);
}

export { nuevoId };

/** A mark with its id (12 hex digits) and its author: a new one, or one deleted coming back. False if it doesn't read
 * or the tab has all it takes. */
export function ponerMarca(doc, datos, { id, pagina, cajas, desde = null, hasta = null, texto: deTexto = '', nota = '', de, nombre, color, cuando }) {
  const buenas = leerCajas(cajas);
  if (!/^[0-9a-f]{12}$/.test(id) || !Number.isInteger(pagina) || pagina < 1 || pagina > MAX_PAGINAS || !buenas || !ID_PAR.test(de ?? '')) return false;
  if (!datos.has(`m:${id}`) && leerMarcas(datos).length >= MAX_MARCAS) return false;
  const lugar = conTexto({ desde, hasta }) ? { desde, hasta } : {};
  doc.transact(() => {
    datos.set(`m:${id}`, {
      pagina,
      cajas: buenas,
      ...lugar,
      texto: texto(deTexto, MAX_TEXTO).trim(),
      nota: texto(nota, MAX_NOTA).trim(),
      de,
      nombre: texto(nombre, 60),
      color: texto(color, 40),
      cuando: Number.isFinite(cuando) ? cuando : Date.now(),
    });
  });
  return true;
}

/** A new mark of this browser: { pagina, cajas, texto?, nota? }. Returns its id, or null if it doesn't read or the
 * tab has all it takes. */
export function marcar(doc, datos, yo, marca) {
  const id = nuevoId();
  return ponerMarca(doc, datos, { ...marca, id, de: yo.id, nombre: yo.nombre, color: yo.color, cuando: Date.now() }) ? id : null;
}

/** The note of a mark, written by its author. */
export function anotar(datos, id, yo, nota) {
  const actual = datos.get(`m:${id}`);
  if (!actual || actual.de !== yo.id) return false;
  datos.set(`m:${id}`, { ...actual, nota: texto(nota, MAX_NOTA).trim() });
  return true;
}

export function borrarMarca(datos, id) {
  if (/^[0-9a-f]{12}$/.test(id)) datos.delete(`m:${id}`);
}

/** The marks as text, for the session's Consultron. */
export function marcasEnTexto(marcas) {
  if (!marcas.length) return '';
  const lineas = marcas.map((m) => {
    const que = m.texto ? `resaltó «${m.texto}»` : 'marcó una zona';
    return `[Página ${m.pagina}] ${m.nombre} ${que}.${m.nota ? ` Nota: ${m.nota}` : ''}`;
  });
  return `Marcas de la mesa en este apunte:\n${lineas.join('\n')}`.slice(0, TOPE_CONSULTRON);
}
