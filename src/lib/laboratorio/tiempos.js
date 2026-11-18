// «Medir tiempos»: which functions there are to measure, how to call them with a size n, which sizes, and which curve
// fits the times best (constant, n, n log n, n², 2ⁿ or n!). Pure: the screen and the tests use the same.

/** Usual sizes for a cheap function (the tests use them). Without sizes, the worker chooses them (rastreo.js). */
export const TAMANOS_POR_DEFECTO = [100, 200, 400, 800, 1600, 3200];
/** Seconds the whole measurement may take, at most: a size that wouldn't fit isn't started (rastreo.js). */
export const PRESUPUESTO_S = 20;
export const MAX_TAMANOS = 12;
export const MAX_N = 10_000_000;
export const MIN_PUNTOS = 3;

const numero = new Intl.NumberFormat('es-AR');

/** The functions defined at the top of the program, with their parameters: [{ nombre, parametros }]. */
export function funcionesDelCodigo(codigo) {
  const vistas = new Map();
  for (const m of String(codigo).matchAll(/^def[ \t]+([\p{L}_][\p{L}\p{N}_]*)[ \t]*\(([^)]*)\)/gmu)) {
    const parametros = m[2]
      .split(',')
      .map((p) => p.split(/[:=]/)[0].trim())
      .filter((p) => /^[\p{L}_][\p{L}\p{N}_]*$/u.test(p) && p !== 'self');
    vistas.set(m[1], { nombre: m[1], parametros });
  }
  return [...vistas.values()];
}

const DE_NUMERO = /^(n|m|k|i|x|num|numero|número|cantidad|cant|tam|tamano|tamaño|hasta|limite|límite|base|exp|exponente|altura|nivel|discos|pisos|veces)$/i;
const BUSCADO = /^(x|buscado|objetivo|elemento|valor|clave|dato|item)$/i;

/** What goes between the parentheses by default. If the program calls it (outside its own body), like that call: a
 * list of the program grows to n items repeating its own (`(items * n)[:n]`), and what is fixed (a number, a text, a
 * name of a number or text) stays. Otherwise, or for what that call doesn't tell, from the names of the parameters: a
 * number is n, the rest a list from n down to 1 (the worst case of many sorts). What is searched in a list is a value
 * that isn't there. */
export function llamadaSugerida(parametros, codigo = '', nombre = '') {
  const conLista = parametros.some((p) => !DE_NUMERO.test(p));
  const porNombre = (p) => (conLista && BUSCADO.test(p) ? '-1' : DE_NUMERO.test(p) ? 'n' : 'list(range(n, 0, -1))');
  const deLaLlamada = nombre ? llamadaDelPrograma(String(codigo), nombre, parametros, porNombre) : null;
  return deLaLlamada ?? parametros.map(porNombre).join(', ');
}

const NOMBRE = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const FIJO = /^(-?\d[\d_]*(\.\d+)?|'[^'\\\n]*'|"[^"\\\n]*"|True|False|None)$/;

// The first call to `nombre` the program makes outside its own body, read with what it passes; null if there is none or
// nothing in it grows with n.
function llamadaDelPrograma(codigo, nombre, parametros, porNombre) {
  // Its body: from its def to the next line that starts at the margin.
  const def = codigo.match(new RegExp(`^def[ \\t]+${nombre}[ \\t]*\\(`, 'mu'));
  const desde = def ? def.index : -1;
  const despues = def ? codigo.slice(desde).search(/\n(?=[^\s#])/) : -1;
  const hasta = despues < 0 ? codigo.length : desde + despues;
  for (const m of codigo.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_.])${nombre}[ \\t]*\\(`, 'gu'))) {
    const linea = codigo.slice(codigo.lastIndexOf('\n', m.index) + 1, m.index);
    if ((def && m.index >= desde && m.index < hasta) || /#|^\s*def\s/.test(linea)) continue;
    const argumentos = argumentosDe(codigo.slice(m.index + m[0].length));
    if (argumentos) return armarLlamada(argumentos, codigo, parametros, porNombre);
  }
  return null;
}

// The arguments of a call, from just after its "(": split by the commas of its own level, strings kept whole.
function argumentosDe(texto) {
  const partes = [];
  let nivel = 0;
  let actual = '';
  let comilla = '';
  for (const c of texto) {
    if (comilla) {
      actual += c;
      if (c === comilla) comilla = '';
      continue;
    }
    if (c === "'" || c === '"') comilla = c;
    else if ('([{'.includes(c)) nivel += 1;
    else if (')]}'.includes(c)) {
      if (nivel === 0) {
        if (actual.trim()) partes.push(actual.trim());
        return partes;
      }
      nivel -= 1;
    } else if (c === ',' && nivel === 0) {
      partes.push(actual.trim());
      actual = '';
      continue;
    }
    actual += c;
  }
  return null;
}

function armarLlamada(argumentos, codigo, parametros, porNombre) {
  // What a name of the program is, by its first assignment at the top: a list or a fixed value.
  const valorDe = (nombre) => codigo.match(new RegExp(`^${nombre}[ \\t]*=[ \\t]*(.*)$`, 'mu'))?.[1].trim() ?? '';
  const esLista = (a) => /^(\[|(list|sorted)\()/.test(a);
  const numero = (a) => /^-?\d/.test(a) || (NOMBRE.test(a) && /^-?\d/.test(valorDe(a)));
  const conLista = argumentos.some((a) => esLista(a) || (NOMBRE.test(a) && esLista(valorDe(a))));
  const salen = argumentos.map((arg, i) => {
    const conNombre = arg.match(/^([\p{L}_][\p{L}\p{N}_]*)[ \t]*=(?!=)[ \t]*(.+)$/su);
    const parametro = conNombre ? conNombre[1] : parametros[i] ?? '';
    const valor = conNombre ? conNombre[2].trim() : arg;
    let sale;
    if (esLista(valor)) sale = `(${valor} * n)[:n]`;
    else if (NOMBRE.test(valor) && esLista(valorDe(valor))) sale = `(${valor} * n)[:n]`;
    else if (conLista && BUSCADO.test(parametro) && numero(valor)) sale = '-1';
    else if (DE_NUMERO.test(parametro) && numero(valor)) sale = 'n';
    else if (FIJO.test(valor) || (NOMBRE.test(valor) && FIJO.test(valorDe(valor)))) sale = valor;
    else sale = porNombre(parametro);
    return conNombre ? `${parametro}=${sale}` : sale;
  });
  return salen.some((s) => /\bn\b/.test(s)) ? salen.join(', ') : null;
}

/** The sizes written by the student: { tamanos } in order and without repeats, or { error } in their words. None,
 * { tamanos: [] }: the worker chooses them, from small up until one takes too long. */
export function leerTamanos(texto) {
  const partes = String(texto).split(/[\s,;]+/).filter(Boolean);
  if (!partes.length) return { tamanos: [] };
  const valores = [];
  for (const p of partes) {
    const limpio = p.replace(/[._]/g, '');
    if (!/^\d+$/.test(limpio) || Number(limpio) < 1) return { error: `«${p}» no es un tamaño. Usá enteros mayores que cero.` };
    const n = Number(limpio);
    if (n > MAX_N) return { error: `El tamaño más grande que medimos es ${numero.format(MAX_N)}.` };
    valores.push(n);
  }
  const tamanos = [...new Set(valores)].sort((a, b) => a - b);
  if (tamanos.length < MIN_PUNTOS) return { error: 'Poné al menos tres tamaños distintos.' };
  if (tamanos.length > MAX_TAMANOS) return { error: `Poné hasta ${MAX_TAMANOS} tamaños.` };
  return { tamanos };
}

const factorial = (n) => {
  let f = 1;
  for (let k = 2; k <= n; k += 1) f *= k;
  return f;
};

// 2ⁿ and n! are the exhaustive search of the notes of Algoritmos Genéticos (final.md, «Mochila»: every subset, a binary
// number of length n; «Viajante»: n! routes). They only count on sizes where they are numbers (`hasta`).
export const MODELOS = [
  { id: 'constante', nombre: 'constante', g: () => 1 },
  { id: 'n', nombre: 'n', g: (n) => n },
  { id: 'nlogn', nombre: 'n log n', g: (n) => n * Math.log2(Math.max(n, 2)) },
  { id: 'n2', nombre: 'n²', g: (n) => n * n },
  { id: 'exp', nombre: '2ⁿ', g: (n) => 2 ** n, hasta: 100, rapido: true },
  { id: 'fact', nombre: 'n!', g: factorial, hasta: 60, rapido: true },
];
const MODELO = Object.fromEntries(MODELOS.map((m) => [m.id, m]));
// Faster than n² but not like 2ⁿ (or on sizes too big for it): a curve n^p with the p measured, drawn but not named.
MODELO.mas = { id: 'mas', nombre: '', g: (n, p = 3) => n ** p };

// Least squares of t = a·g(n) + b, neither a nor b below zero. To choose, each point weighs 1/t² (how far off it is as a
// part of its time, so the small sizes count as much as the big ones); to draw, all the same, so the curve goes through
// the big ones, the ones the chart shows apart.
function ajustarModelo(modelo, puntos, relativo = true) {
  const w = puntos.map((p) => (relativo ? 1 / Math.max(p.s, 1e-12) ** 2 : 1));
  const g = puntos.map((p) => modelo.g(p.n));
  const t = puntos.map((p) => p.s);
  const suma = (f) => puntos.reduce((acc, _, i) => acc + f(i), 0);
  const S0 = suma((i) => w[i]);
  let a = 0;
  let b = suma((i) => w[i] * t[i]) / S0;
  if (modelo.id !== 'constante') {
    const S1 = suma((i) => w[i] * g[i]);
    const S2 = suma((i) => w[i] * g[i] * g[i]);
    const Sy = suma((i) => w[i] * t[i]);
    const Sgy = suma((i) => w[i] * g[i] * t[i]);
    const det = S0 * S2 - S1 * S1;
    a = det > 0 ? (S0 * Sgy - S1 * Sy) / det : 0;
    b = (Sy - a * S1) / S0;
    if (b < 0) {
      b = 0;
      a = Sgy / S2;
    }
    if (a < 0) {
      a = 0;
      b = Sy / S0;
    }
  }
  const error = Math.sqrt(suma((i) => w[i] * (t[i] - (a * g[i] + b)) ** 2) / puntos.length);
  return { modelo: modelo.id, a, b, error };
}

/** The curve that fits the points { n, s } best, or null with less than three. A simpler one wins if it's almost as
 * good: what is noise doesn't turn n into n log n. `parecido` is another one that fits nearly as well, if there is. */
export function ajustar(puntos) {
  const validos = puntos.filter((p) => Number.isFinite(p.n) && p.n > 0 && Number.isFinite(p.s) && p.s >= 0);
  if (new Set(validos.map((p) => p.n)).size < MIN_PUNTOS) return null;
  // How fast it grows on this range (log t against log n), next to how fast each curve does. One that grows clearly
  // slower than the times is out, however the least squares come: with times that go up a thousand times, every curve
  // misses by about all of each time, and the simplest one used to win (2ⁿ said «No depende de n»). A fixed cost per
  // call makes the times grow slower than their curve, never faster, so that side stays open. 2ⁿ and n! go by halves:
  // a steep polynomial isn't 2ⁿ, and n·2ⁿ (a loop over each subset) is.
  const k = pendiente(validos, (p) => Math.log(Math.max(p.s, 1e-12)));
  const maxN = Math.max(...validos.map((p) => p.n));
  const posibles = MODELOS.filter((m) => {
    if (m.hasta && maxN > m.hasta) return false;
    const h = pendiente(validos, (p) => Math.log(m.g(p.n)));
    return m.rapido ? k >= h / 2 && k <= h * 1.5 : k <= h + 0.75;
  });
  if (!posibles.length) return ajusteMasRapido(validos, k);
  const ajustes = posibles.map((m) => ajustarModelo(m, validos));
  const mejor = Math.min(...ajustes.map((a) => a.error));
  const elegido = ajustes.find((a) => a.error <= mejor * 1.25 + 0.02);
  // Next to a constant, any curve with almost nothing of n fits as well: that isn't a resemblance.
  const otros = elegido.modelo === 'constante' ? [] : ajustes.filter((a) => a !== elegido && a.modelo !== 'constante').sort((x, y) => x.error - y.error);
  let modelo = elegido.modelo;
  let parecido = otros.find((a) => a.error <= Math.max(elegido.error * 1.6, elegido.error + 0.03))?.modelo ?? null;
  // n against n log n: on a short range they are near, and the memory of a big list makes a pass over it a bit slower
  // than n. What decides is how fast it grows on this range (log t against log n): past 75% of the way from n to
  // n log n, n log n. Near that line, it says both.
  if (modelo === 'n' || modelo === 'nlogn') {
    const hueco = pendiente(validos, (p) => Math.log(MODELO.nlogn.g(p.n))) - 1;
    const corte = 1 + 0.75 * hueco;
    modelo = k > corte ? 'nlogn' : 'n';
    const otro = modelo === 'n' ? 'nlogn' : 'n';
    if (Math.abs(k - corte) < 0.25 * hueco) parecido = otro;
    else if (parecido === otro || parecido === modelo) parecido = null;
  }
  const { a, b } = ajustarModelo(MODELO[modelo], validos, false);
  return { modelo, a, b, parecido };
}

// Faster than every curve that can be: n^p with the p measured (at least 2), only to draw it.
function ajusteMasRapido(puntos, k) {
  const p = Math.max(2, Math.round(k * 10) / 10);
  const { a, b } = ajustarModelo({ id: 'mas', g: (n) => n ** p }, puntos, false);
  return { modelo: 'mas', a, b, p, parecido: null };
}

// The slope of `valor` against log n, by least squares.
function pendiente(puntos, valor) {
  const xs = puntos.map((p) => Math.log(p.n));
  const ys = puntos.map(valor);
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length;
  const my = ys.reduce((s, y) => s + y, 0) / ys.length;
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return sxx > 0 ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / sxx : 0;
}

/** The time the curve gives for n. */
export const tiempoDelAjuste = (ajuste, n) => ajuste.a * MODELO[ajuste.modelo].g(n, ajuste.p) + ajuste.b;

export const nombreDelModelo = (id) => MODELO[id]?.nombre ?? '';

/** The fit in words: { titulo, detalle }. */
export function fraseDelAjuste(ajuste) {
  const detalle = {
    constante: 'Tarda casi lo mismo con cualquier tamaño.',
    n: 'Si n se duplica, tarda el doble.',
    nlogn: 'Si n se duplica, tarda un poco más del doble.',
    n2: 'Si n se duplica, tarda cuatro veces más.',
    exp: 'Si n sube 1, tarda el doble.',
    fact: 'Si n sube 1, tarda n veces más.',
    mas: 'Si n se duplica, tarda más de cuatro veces más.',
  }[ajuste.modelo];
  const titulo = {
    constante: 'No depende de n.',
    exp: 'Crece muy rápido, como 2ⁿ.',
    fact: 'Crece muy rápido, como n!.',
    mas: 'Crece más rápido que n².',
  }[ajuste.modelo] ?? `Crece como ${nombreDelModelo(ajuste.modelo)}.`;
  const parecido = ajuste.parecido ? `También se parece a ${nombreDelModelo(ajuste.parecido)}. Con tamaños más grandes se distinguen mejor.` : '';
  return { titulo, detalle, parecido };
}

/** A time in seconds, in the unit that reads best: 35 µs, 12,5 ms, 1,2 s. */
export function formatoTiempo(s, unidad = unidadDe(s)) {
  const f = new Intl.NumberFormat('es-AR', { maximumSignificantDigits: 3 });
  return `${f.format(s / unidad.factor)} ${unidad.texto}`;
}

/** The unit for times up to `s`. */
export function unidadDe(s) {
  if (s < 1e-3) return { factor: 1e-6, texto: 'µs' };
  if (s < 1) return { factor: 1e-3, texto: 'ms' };
  return { factor: 1, texto: 's' };
}

/** Round marks for an axis from 0 to at least `max`, about `cuantas` of them. */
export function marcasDeEje(max, cuantas = 4) {
  if (!(max > 0)) return [0, 1];
  const crudo = max / cuantas;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * potencia).find((p) => p >= crudo);
  const marcas = [];
  for (let v = 0; v < max + paso * 0.999; v += paso) marcas.push(Number(v.toPrecision(12)));
  return marcas;
}

export const VUELTAS_POR_DEFECTO = 3;
export const MAX_VUELTAS = 10;
const MAX_FUNCIONES = 30;

/** The laps written by the student: { vueltas } from 1 to MAX_VUELTAS, or { error } in their words. */
export function leerVueltas(texto) {
  const limpio = String(texto).trim();
  if (!/^[0-9]+$/.test(limpio) || Number(limpio) < 1 || Number(limpio) > MAX_VUELTAS) return { error: `Poné cuántas veces, de 1 a ${MAX_VUELTAS}.` };
  return { vueltas: Number(limpio) };
}

/** Where the first lap of the whole program spent its time (rastreo.js, `medida-funciones`), checked: it comes from
 * the worker as JSON text. { total, funciones: [{ nombre, archivo, llamadas, s }], mas } or null. */
export function leerFunciones(texto) {
  let d;
  try {
    d = JSON.parse(String(texto));
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || !Number.isFinite(d.total) || d.total < 0 || !Array.isArray(d.funciones)) return null;
  const funciones = d.funciones
    .filter((x) => x && typeof x.nombre === 'string' && x.nombre && Number.isSafeInteger(x.llamadas) && x.llamadas > 0 && Number.isFinite(x.s) && x.s >= 0)
    .slice(0, MAX_FUNCIONES)
    .map((x) => ({ nombre: x.nombre.slice(0, 80), archivo: typeof x.archivo === 'string' ? x.archivo.slice(0, 120) : '', llamadas: x.llamadas, s: x.s }));
  return { total: d.total, funciones, mas: Number.isSafeInteger(d.mas) && d.mas > 0 ? d.mas : 0 };
}
