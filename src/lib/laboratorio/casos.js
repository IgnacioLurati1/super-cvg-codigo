import { queDice } from './error';
import { enCriollo } from './mensajes';
import { MAX_CASOS, MAX_ENTRADA, MAX_ESPERADA, nombreValido, sanearCasos } from './saneo';

// Test cases of the lab (docs/laboratorio-ide.md, point 3): each one says what the program reads, one line per read,
// and what it should print. The program runs with each one without stopping, and what came out is compared line by
// line with what was expected. Pure: the screen is components/laboratorio/Casos.jsx.
//
// What came out is what the console shows of the program: what it prints and, after each question, the line it read
// with its Enter, as in a terminal. A browser that can pause the program (JSPI) asks for each line (`pide`) and the
// line goes in here; one that can't gets them all at the start (`lineas`) and the engine writes each as it reads it.
// Either way the text is the same. What goes to stderr (a warning of the compiler, a traceback) isn't compared.

export const TOPE_SALIDA_CASO = 20_000;

export const idDeCaso = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;

/** The lines the program gets: one per read. A last Enter doesn't make one more. */
export const lineasDe = (entrada) => (entrada ? String(entrada).replace(/\n$/, '').split('\n') : []);

/** Without spaces at the end of each line nor empty lines at the end; `exacto`, as it is. */
export function normalizar(texto, exacto = false) {
  const t = String(texto ?? '');
  if (exacto) return t;
  return t.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/[^\S\n]+$/, '')).join('\n').replace(/\n+$/, '');
}

// Where two lines start to differ.
function desde(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i;
}

/**
 * What was expected against what came out. { paso, filas: [{ n, tipo, esperada, salida, desde }] }: a row per line,
 * `tipo` 'igual', 'distinta' (and `desde`, where it starts to differ), 'falta' (it didn't print it) or 'sobra' (it
 * printed one more).
 */
export function comparar(esperada, salida, exacto = false) {
  const a = normalizar(esperada, exacto);
  const b = normalizar(salida, exacto);
  const la = a === '' && !exacto ? [] : a.split('\n');
  const lb = b === '' && !exacto ? [] : b.split('\n');
  const filas = [];
  for (let i = 0; i < Math.max(la.length, lb.length); i += 1) {
    const e = la[i];
    const s = lb[i];
    if (e === undefined) filas.push({ n: i + 1, tipo: 'sobra', esperada: null, salida: s });
    else if (s === undefined) filas.push({ n: i + 1, tipo: 'falta', esperada: e, salida: null });
    else if (e === s) filas.push({ n: i + 1, tipo: 'igual', esperada: e, salida: s });
    else filas.push({ n: i + 1, tipo: 'distinta', esperada: e, salida: s, desde: desde(e, s) });
  }
  return { paso: a === b, filas };
}

/**
 * What a run with these lines prints, as the console shows it. `mirar(evento)` sees each event of the engine,
 * `responder()` gives the next line when the program asks (null: there are no more, the end of the input) and `texto()`
 * is what came out.
 */
export function capturar(lineas) {
  const quedan = [...lineas];
  let texto = '';
  const sumar = (t) => {
    if (texto.length < TOPE_SALIDA_CASO) texto = (texto + t).slice(0, TOPE_SALIDA_CASO);
  };
  return {
    lineas: [...lineas],
    mirar(d) {
      if (d?.tipo === 'salida' && d.flujo !== 'err') sumar(String(d.texto));
      // system("cls"), console.clear(): what came before isn't shown.
      else if (d?.tipo === 'limpiar') texto = '';
    },
    responder() {
      if (!quedan.length) return null;
      const linea = quedan.shift();
      sumar(`${linea}\n`);
      return linea;
    },
    texto: () => texto,
  };
}

/**
 * How a case went, from what the run gave back (Laboratorio.jsx: { ms, error } or { cortado } or { falla }) and what
 * came out. { estado: 'paso' | 'fallo' | 'error' | 'tiempo' | 'parado', salida, comparacion, error }.
 */
export function resultadoDe(caso, r, salida, lenguaje = null) {
  if (r?.cortado === 'parado') return { estado: 'parado', salida };
  if (r?.cortado === 'tiempo') return { estado: 'tiempo', salida };
  if (r?.falla) return { estado: 'error', salida, error: 'No se pudo cargar el lenguaje. Revisá la conexión.' };
  if (r?.cortado === 'salida') return { estado: 'error', salida, error: 'Imprimió demasiado y lo cortamos.' };
  if (r?.error) return { estado: 'error', salida, error: queDice(enCriollo(lenguaje, String(r.error))).slice(0, 300) || 'Terminó con un error.' };
  const comparacion = comparar(caso.esperada, salida, caso.exacto === true);
  return { estado: comparacion.paso ? 'paso' : 'fallo', salida, comparacion };
}

/** A new case, named by its place. */
export const casoNuevo = (lista) => ({ id: idDeCaso(), nombre: `Caso ${lista.length + 1}`, entrada: '', esperada: '' });

// The cases as a text file, to go in the zip of a project (zip.js) and come back from it. Readable: each case starts
// with its line «=== Caso: name», and its parts with «--- Entrada» and «--- Salida esperada».
export const ARCHIVO_CASOS = 'pruebas/casos.txt';
const CABEZA = '# Casos de prueba de Super CVG. Cada caso empieza con «=== Caso:».';
const CASO = /^=== Caso:(.*)$/;
const EXACTO = '--- Compara exacto';
const ENTRADA = '--- Entrada';
const ESPERADA = '--- Salida esperada';

export function casosATexto(casos) {
  const partes = [CABEZA];
  for (const c of casos) {
    partes.push(`=== Caso: ${c.nombre}`);
    if (c.exacto) partes.push(EXACTO);
    partes.push(ENTRADA, `${c.entrada}`, ESPERADA, `${c.esperada}`);
  }
  return `${partes.join('\n')}\n`;
}

/** The cases of a text written by casosATexto (or by hand, in its shape), already sanitized. */
export function casosDeTexto(texto) {
  const lineas = String(texto ?? '').replace(/^\p{Cf}+/u, '').replace(/\r\n?/g, '\n').split('\n');
  const casos = [];
  let caso = null;
  let parte = null;
  const cerrar = () => {
    if (!caso) return;
    // The Enter that ends each part is the file's, not the case's.
    caso.entrada = caso.entrada.join('\n');
    caso.esperada = caso.esperada.join('\n');
    casos.push(caso);
  };
  for (const l of lineas) {
    const m = CASO.exec(l);
    if (m) {
      cerrar();
      if (casos.length >= MAX_CASOS) break;
      caso = { id: `c${casos.length.toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`, nombre: nombreValido(m[1]) || `Caso ${casos.length + 1}`, entrada: [], esperada: [] };
      parte = null;
    } else if (!caso) continue;
    else if (l === EXACTO && !parte) caso.exacto = true;
    else if (l === ENTRADA && !parte) parte = 'entrada';
    else if (l === ESPERADA && parte !== 'esperada') parte = 'esperada';
    else if (parte) caso[parte].push(l);
  }
  if (casos.length < MAX_CASOS) cerrar();
  // The last line of the file ends in Enter: it's not one more of the case.
  const ultimo = casos.at(-1);
  if (ultimo?.esperada.endsWith('\n')) ultimo.esperada = ultimo.esperada.slice(0, -1);
  return sanearCasos(casos.map((c) => ({ ...c, entrada: c.entrada.slice(0, MAX_ENTRADA), esperada: c.esperada.slice(0, MAX_ESPERADA) })));
}
