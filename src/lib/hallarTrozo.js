// Where a piece of Consultron (fragmentos.js, `trozar`) is in the text of its page, to mark it in the reader. The piece
// comes from the same text (leerTexto.js puts it together as the reader does), with its spaces joined and the header of
// the pages taken out: only letters and numbers are compared, folded, so those changes don't matter.
import { plegar } from './lectura';

const LETRA = /[\p{L}\p{N}]/u;
// Shorter than this, a piece would be found anywhere.
const MINIMO = 8;
// When the whole piece isn't there, its start and its end are looked for, this long.
const PUNTA = 40;

// The letters and numbers of a text, folded, and from which letter of the text each one came.
function compacto(texto) {
  const { plano, origen } = plegar(String(texto ?? ''));
  let letras = '';
  const de = [];
  for (let i = 0; i < plano.length; i++) {
    if (!LETRA.test(plano[i])) continue;
    letras += plano[i];
    de.push(origen[i]);
  }
  return { letras, de };
}

/** Where `trozo` is in `texto` (the text of a page, textoDePagina of lectura.js), as { desde, hasta } in it, or null.
 * The whole piece; if it isn't there, from its start to its end, or as long as it is from its start. */
export function hallarTrozo(texto, trozo) {
  const pagina = compacto(texto);
  const buscado = compacto(trozo).letras;
  if (buscado.length < MINIMO || !pagina.letras.length) return null;
  const lugar = (a, b) => ({ desde: pagina.de[a], hasta: pagina.de[b - 1] + 1 });
  const entero = pagina.letras.indexOf(buscado);
  if (entero !== -1) return lugar(entero, entero + buscado.length);
  if (buscado.length < PUNTA * 2) return null;
  const inicio = pagina.letras.indexOf(buscado.slice(0, PUNTA));
  if (inicio === -1) return null;
  const fin = pagina.letras.indexOf(buscado.slice(-PUNTA), inicio + PUNTA);
  if (fin !== -1 && fin + PUNTA - inicio <= buscado.length * 1.5) return lugar(inicio, fin + PUNTA);
  return lugar(inicio, Math.min(pagina.letras.length, inicio + buscado.length));
}
