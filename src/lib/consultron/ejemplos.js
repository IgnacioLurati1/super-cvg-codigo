// The example under an answer about a calculator's topic: one of the calculator's own «Probá con», never one made by the
// model. Those come from the notes and the calculator solves them. The calculator fills it as it opens (memoria.js,
// `dejarEjemplo`). Calculators with one list per model (probabilities, stocks) open in the model of the example.
import { palabras } from './fragmentos.js';

const PANTALLAS = import.meta.glob('../../components/calculadoras/propias/[!_]*.jsx');

/** The examples of a calculator as one list: { nombre, modo }. `modo`: the model it belongs to, if it has several. */
export function aplanar(ejemplos) {
  if (Array.isArray(ejemplos)) return ejemplos.map((e) => ({ nombre: e.nombre, modo: null }));
  if (!ejemplos || typeof ejemplos !== 'object') return [];
  return Object.entries(ejemplos).flatMap(([modo, es]) => (Array.isArray(es) ? es : [es]).filter(Boolean).map((e) => ({ nombre: e.nombre, modo })));
}

/** The example that fits the question best: the most words in common with its name and its model; the first one if
 * none. `nombresDeModo`: the name of each model ({ poisson: 'Poisson' }). */
export function elegirEjemplo(lista, pregunta, nombresDeModo = {}) {
  if (!lista.length) return null;
  const ps = new Set(palabras(pregunta));
  let mejor = lista[0];
  let puntos = 0;
  for (const e of lista) {
    const suyas = new Set(palabras(`${e.nombre} ${e.modo ?? ''} ${nombresDeModo[e.modo] ?? ''}`));
    let n = 0;
    for (const p of suyas) if (ps.has(p)) n += 1;
    if (n > puntos) {
      mejor = e;
      puntos = n;
    }
  }
  return mejor;
}

// The examples given for each calculator while the tab is open, the last one at the end: «dame otro» gives another,
// also in a new talk. Their names, only in memory.
const DADOS = new Map();

/** Any of the examples, leaving out the ones already given (`menos`, their names) while there are others; with all
 * given, any but the last one. */
export function otroEjemplo(lista, menos = [], azar = Math.random) {
  if (!lista.length) return null;
  const nuevos = lista.filter((e) => !menos.includes(e.nombre));
  const sinElUltimo = lista.filter((e) => e.nombre !== menos.at(-1));
  const deDonde = nuevos.length ? nuevos : sinElUltimo.length ? sinElUltimo : lista;
  return deDonde[Math.floor(azar() * deDonde.length)];
}

/** The example for a calculator (calculos.js) about a question: { slug, nombre, clave, ejemplo, modo }, or null if the
 * calculator has none. `otro`: asked for an exercise, any but the ones already given. */
export async function ejemploPara(calculo, pregunta, { otro = false } = {}) {
  const cargar = PANTALLAS[`../../components/calculadoras/propias/${calculo.slug}.jsx`];
  if (!cargar) return null;
  const { EJEMPLOS } = await cargar();
  const lista = aplanar(EJEMPLOS);
  if (!otro) {
    const e = elegirEjemplo(lista, pregunta, calculo.campos?.modelo?.opciones);
    return e && { slug: calculo.slug, nombre: calculo.nombre, clave: calculo.clave, ejemplo: e.nombre, modo: e.modo };
  }
  const antes = DADOS.get(calculo.slug) ?? [];
  const e = otroEjemplo(lista, antes);
  if (e) DADOS.set(calculo.slug, [...antes.filter((n) => n !== e.nombre), e.nombre]);
  return e && { slug: calculo.slug, nombre: calculo.nombre, clave: calculo.clave, ejemplo: e.nombre, modo: e.modo };
}
