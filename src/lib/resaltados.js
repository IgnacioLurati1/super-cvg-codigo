// The student's highlights and notes in a PDF, their bookmarks and the page where they left it, saved with the rest of
// their things (mio.js, which passes them through sanearMio, and through union.js to their Drive). Only positions,
// colors, their notes, page numbers and dates: lectura.js says what each one is.
import { cabeOtro, cabeSenalador, cambiarResaltadoEn, conPagina, conResaltado, conSenalador, esDoc, estaSenalada, lecturaEn, nombrarSenaladorEn, sanearResaltado, sanearSenalador, sinResaltado, sinSenalador } from './lectura';
import { cambiarMio, mioActual } from './mio';

function cambiar(doc, fn) {
  if (!esDoc(doc)) return false;
  if (!cabeOtro(mioActual().lecturas, doc)) return false;
  return cambiarMio((mio) => ({ ...mio, lecturas: { ...mio.lecturas, [doc]: fn(lecturaEn(mio.lecturas, doc)) } }));
}

/** What is kept of a file: { pagina, resaltados }. */
export const lecturaDe = (mio, doc) => lecturaEn(mio?.lecturas, doc);

/** A new highlight. False if it could not be saved. */
export function resaltar(doc, resaltado) {
  const limpio = sanearResaltado(resaltado);
  return Boolean(limpio) && cambiar(doc, (l) => conResaltado(l, limpio));
}

/** Its color or its note. */
export const cambiarResaltado = (doc, id, cambios, ahora = Date.now()) => cambiar(doc, (l) => cambiarResaltadoEn(l, id, cambios, ahora));

export const borrarResaltado = (doc, id) => cambiar(doc, (l) => sinResaltado(l, id));

/** The page the student was on when closing it. Page 1 is not kept. */
export function recordarPagina(doc, pagina) {
  if (!esDoc(doc) || !Number.isInteger(pagina)) return false;
  const antes = lecturaDe(mioActual(), doc).pagina ?? 1;
  if (antes === pagina) return true;
  return cambiar(doc, (l) => conPagina(l, pagina));
}

/** A bookmark on a page; one already there stays as it was. False if it could not be saved (the tope of the file, or
 * no room in the browser). */
export function senalar(doc, pagina, ahora = Date.now()) {
  const limpio = sanearSenalador({ pagina, creado: ahora });
  if (!limpio || !esDoc(doc)) return false;
  const l = lecturaDe(mioActual(), doc);
  if (estaSenalada(l, pagina)) return true;
  return cabeSenalador(l, pagina) && cambiar(doc, (x) => conSenalador(x, limpio));
}

export const sacarSenalador = (doc, pagina) => cambiar(doc, (l) => sinSenalador(l, pagina));

/** The name of a bookmark; an empty one takes it off, and the list says «Página N» again. */
export function nombrarSenalador(doc, pagina, nombre) {
  if (!esDoc(doc) || !estaSenalada(lecturaDe(mioActual(), doc), pagina)) return false;
  return cambiar(doc, (l) => nombrarSenaladorEn(l, pagina, nombre));
}
