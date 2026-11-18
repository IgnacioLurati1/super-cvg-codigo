// The study calculators, made from the course notes of El Santo Resumen (catalogo.js). Each one has its address
// (`/calculadoras/<slug>`, to keep it in bookmarks) and sitio.config.js gives each address its page. `materias`: the
// official names of the subjects whose notes it comes from, to group them and to link from those subjects. Plain data:
// Node reads it too.
import { CATALOGO } from './catalogo.js';

export const CALCULADORAS = CATALOGO;

/** The subjects of the list, in alphabetical order. Each calculator is listed once, under its first subject (its own);
 * the other subjects that use it offer it from their own page (deLaMateria.js). */
export const MATERIAS_DE_CALCULADORAS = [...new Set(CATALOGO.map((c) => c.materias[0]))].sort((a, b) => a.localeCompare(b, 'es'));

export const calculadoraDe = (slug) => CALCULADORAS.find((c) => c.slug === slug) ?? null;
