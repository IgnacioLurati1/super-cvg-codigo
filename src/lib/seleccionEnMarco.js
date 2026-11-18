// What the student selects inside the frame of an HTML summary (components/VisorResumen.jsx), read from outside: only
// its text, as plain text, and where it is, to put «Preguntar» over it. Small and pure, to be tested alone.

// As much of a marked text as goes to Consultron, the same as from the PDF reader (VisorPdf.jsx).
export const TOPE_MARCADO = 1800;

// The size of the bar with «Preguntar» alone, and the room left around it.
const ALTO_BARRA = 44;
const ANCHO_BARRA = 132;
const AIRE = 8;

/** The selected text as it goes to Consultron: whatever it was, a string with its spaces collapsed, trimmed and cut. */
export const textoMarcado = (texto) => (typeof texto === 'string' ? texto.replace(/\s+/g, ' ').trim().slice(0, TOPE_MARCADO) : '');

// A box as the reader sends it: [left, top, right, bottom], finite and in order, as a client rect.
const LEJOS = 1e6;
function cajaDicha(c) {
  if (!Array.isArray(c) || c.length !== 4 || !c.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < LEJOS)) return null;
  const [left, top, right, bottom] = c;
  if (right < left || bottom < top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** What the reader of a summary with scripts says is selected in it (message `visor-seleccion`). Untrusted: the
 * summary's own scripts can send anything. Undefined when it is not that message; null when nothing usable is selected;
 * if not `{ texto, primera, ultima }`, its text as it goes to Consultron and its first and last boxes in the frame. */
export function seleccionDicha(d) {
  if (!d || typeof d !== 'object' || d.tipo !== 'visor-seleccion') return undefined;
  const texto = textoMarcado(d.texto);
  if (!texto || !Array.isArray(d.cajas) || d.cajas.length !== 2) return null;
  const primera = cajaDicha(d.cajas[0]);
  const ultima = cajaDicha(d.cajas[1]);
  return primera && ultima ? { texto, primera, ultima } : null;
}

/** Where the bar goes, in the space of the box that holds the frame (`caja`, its client rect, with `marco` the frame's).
 * `primera` and `ultima`: the first and last boxes of the selection, in the frame's own view. Over the first line if it
 * fits inside the frame, if not under the last one; null when the selection is scrolled out of sight. */
export function lugarDeBarra({ marco, caja, primera, ultima, alto = ALTO_BARRA, ancho = ANCHO_BARRA }) {
  if (!marco || !caja || !primera || !ultima) return null;
  if (ultima.bottom <= 0 || primera.top >= marco.height || primera.right <= 0 || primera.left >= marco.width) return null;
  const arribaMarco = marco.top - caja.top;
  const izquierdaMarco = marco.left - caja.left;
  const encima = primera.top - alto - AIRE;
  const debajo = ultima.bottom + AIRE;
  let top;
  if (encima >= 0) top = encima;
  else if (debajo + alto <= marco.height) top = debajo;
  // A selection taller than the view: at the top of it, over the text.
  else top = AIRE;
  const left = Math.min(Math.max(AIRE, izquierdaMarco + primera.left), Math.max(AIRE, caja.width - ancho - AIRE));
  return { left: Math.round(left), top: Math.round(arribaMarco + top) };
}
