// Finding an option by a few letters of its name, as one types: words in any order and anywhere in the name, without
// minding capitals or accents. What matched comes back in pieces, to mark it in the name as it is written.

const MARCAS = /[̀-ͯ]/g;
const sinMarcas = (texto) => texto.normalize('NFD').replace(MARCAS, '').toLowerCase();
const LETRA = /[\p{L}\p{N}]/u;

/** The words typed, without accents and in small letters. */
export const palabrasDe = (consulta) => sinMarcas(String(consulta ?? '')).split(/\s+/).filter(Boolean);

// The name without accents and in small letters, and for each of its characters the place it came from in the name.
function plano(nombre) {
  let texto = '';
  const desde = [];
  for (let i = 0; i < nombre.length; i++) {
    const c = sinMarcas(nombre[i]);
    for (let k = 0; k < c.length; k++) {
      texto += c[k];
      desde.push(i);
    }
  }
  return { texto, desde };
}

// Where the word shows up starting a word of the name, or -1.
const alEmpezar = (texto, p) => {
  for (let i = texto.indexOf(p); i !== -1; i = texto.indexOf(p, i + 1)) if (i === 0 || !LETRA.test(texto[i - 1])) return i;
  return -1;
};

/** The name in pieces, `marca` on the ones that match a word: once each, where it starts a word if it does. */
function partesDe(nombre, { texto, desde }, palabras) {
  const marcado = new Array(nombre.length).fill(false);
  for (const p of palabras) {
    const empieza = alEmpezar(texto, p);
    const i = empieza === -1 ? texto.indexOf(p) : empieza;
    for (let k = i; k < i + p.length; k++) marcado[desde[k]] = true;
  }
  // An accent written apart from its letter goes with the letter.
  const conLetra = new Array(nombre.length).fill(false);
  for (const d of desde) conLetra[d] = true;
  for (let i = 1; i < nombre.length; i++) if (!conLetra[i]) marcado[i] = marcado[i - 1];
  const partes = [];
  for (let i = 0; i < nombre.length; i++) {
    const ultima = partes.at(-1);
    if (ultima && ultima.marca === marcado[i]) ultima.texto += nombre[i];
    else partes.push({ texto: nombre[i], marca: marcado[i] });
  }
  return partes;
}

/** The options (`{ nombre }`) whose name has every word of `consulta`, each with the `partes` of its name to mark.
 * The ones where more words start a word of the name go first; the rest keep their order. Nothing typed: all of them. */
export function coincidencias(opciones, consulta) {
  const palabras = palabrasDe(consulta);
  if (!palabras.length) return opciones.map((o) => ({ ...o, partes: [{ texto: o.nombre, marca: false }] }));
  const halladas = [];
  for (const o of opciones) {
    const p = plano(o.nombre);
    if (!palabras.every((w) => p.texto.includes(w))) continue;
    halladas.push({ o, p, puntos: palabras.filter((w) => alEmpezar(p.texto, w) !== -1).length });
  }
  return halladas
    .sort((a, b) => b.puntos - a.puntos)
    .map(({ o, p }) => ({ ...o, partes: partesDe(o.nombre, p, palabras) }));
}
