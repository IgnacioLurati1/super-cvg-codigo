// What changes between two versions of a file, line by line: what Consultron proposes in the lab, shown before it's
// applied (in the editor and in its panel). The same and the different lines in order, each with its number in the
// version before (`en`) and after (`a`).

// Over this many pairs of lines to compare, what's between the same start and end goes out whole and comes in whole.
const TOPE_PARES = 4_000_000;

const partir = (t) => String(t ?? '').split('\n');

// The longest run of lines in common, as the steps to go from `a` to `b`.
function pasos(a, b) {
  const n = a.length;
  const m = b.length;
  if (!n || !m || n * m > TOPE_PARES) return [...a.map(() => 'q'), ...b.map(() => 's')];
  // largo[i][j]: lines in common from a[i] and b[j] on.
  const largo = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) largo[i][j] = a[i] === b[j] ? largo[i + 1][j + 1] + 1 : Math.max(largo[i + 1][j], largo[i][j + 1]);
  }
  const lista = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lista.push('i');
      i++;
      j++;
    } else if (largo[i + 1][j] >= largo[i][j + 1]) {
      lista.push('q');
      i++;
    } else {
      lista.push('s');
      j++;
    }
  }
  while (i++ < n) lista.push('q');
  while (j++ < m) lista.push('s');
  return lista;
}

/**
 * The lines from `antes` to `despues`: [{ tipo: 'igual' | 'quita' | 'suma', texto, en, a }], with `en` its number in
 * `antes` and `a` in `despues` (null where it isn't).
 */
export function diferencia(antes, despues) {
  const a = partir(antes);
  const b = partir(despues);
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
  let fa = a.length;
  let fb = b.length;
  while (fa > ini && fb > ini && a[fa - 1] === b[fb - 1]) {
    fa--;
    fb--;
  }
  const lineas = [];
  let en = 0;
  let hacia = 0;
  const igual = () => lineas.push({ tipo: 'igual', texto: a[en], en: ++en, a: ++hacia });
  while (en < ini) igual();
  for (const p of pasos(a.slice(ini, fa), b.slice(ini, fb))) {
    if (p === 'i') igual();
    else if (p === 'q') lineas.push({ tipo: 'quita', texto: a[en], en: ++en, a: null });
    else lineas.push({ tipo: 'suma', texto: b[hacia], en: null, a: ++hacia });
  }
  while (en < a.length) igual();
  return lineas;
}

/** How many lines it adds and takes out. */
export const cuentas = (lineas) => ({
  suma: lineas.filter((l) => l.tipo === 'suma').length,
  quita: lineas.filter((l) => l.tipo === 'quita').length,
});

/** The changed pieces, each with `contexto` lines the same around: [[línea, …], …]. */
export function tramos(lineas, contexto = 2) {
  const cerca = new Set();
  lineas.forEach((l, i) => {
    if (l.tipo === 'igual') return;
    for (let k = Math.max(0, i - contexto); k <= Math.min(lineas.length - 1, i + contexto); k++) cerca.add(k);
  });
  const lista = [];
  let actual = null;
  lineas.forEach((l, i) => {
    if (!cerca.has(i)) {
      actual = null;
      return;
    }
    if (!actual) lista.push((actual = []));
    actual.push(l);
  });
  return lista;
}
