import { motorDe } from './motor';
import { motorLibre } from './revisar';

// A Python program as a Chapin (Nassi-Shneiderman) diagram, drawn as the AED exams of El Santo Resumen draw theirs
// (lutastudios.com/utn/algoritmos-y-estructuras-de-datos/, the «Propuesta de respuesta» of each exam): one diagram per
// module, the main program first, each with its name on top and its declarations (the comments under the header) in a
// softer ink. A sentence is a box of 26 px; Mientras and for, a box whose body goes 24 px in; a decision, a triangle
// down to where its two columns meet, with «v» and «f» at the bottom corners and an empty «f» of 36 px; Según, its
// header, a row with the value of each case and a column per case. Long lines break at 58 letters, the next lines 4
// spaces in (a condition of a decision, one line per `and` or `or`). The tree comes from Python's `ast` in the lab's
// worker (chapinPython.js); this side checks it, measures it and lays it out. Nothing runs: the code is only read.

/** The measures of the drawing, in px (those of El Santo Resumen). */
export const MEDIDAS = { linea: 16, alto: 26, sangria: 24, relleno: 8, margen: 14, vacio: 36, letra: 13, letraDecl: 12.5 };
/** Letters per line before breaking it. */
export const TOPE_LETRAS = 58;
const { linea: LINEA, alto: ALTO, sangria: SANGRIA, relleno: R, margen: M, vacio: VACIO } = MEDIDAS;
const TOPE_RENGLON = 160;
const TOPE_RENGLONES = 12;
const TOPE_SUELTO = 80;
const TOPE_DECL = 40;
const CONDICION_CORTA = 28;
// After these a line can break, and after a comma. A line breaks at the loosest one that fits: a comma, `and` or `or`
// before an arithmetic sign, and that before a comparison or `=`.
const NIVEL = new Map([
  ...['and', 'or', 'if', 'else'].map((o) => [o, 1]),
  ...['in', 'is', '+', '-', '*', '/', '//', '%', '**'].map((o) => [o, 2]),
  ...['==', '!=', '<', '>', '<=', '>=', '=', '+=', '-=', '*=', '/=', '//=', '%=', '**='].map((o) => [o, 3]),
]);
const Y_O = new Map([['and', 1], ['or', 1]]);
const TOPE_MS = 15_000;
/** Sentences drawn at most (_C_TOPE of chapinPython.js). */
export const TOPE_SENTENCIAS = 600;

const recortar = (texto, tope = TOPE_RENGLON) => (texto.length > tope ? `${texto.slice(0, tope - 1)}…` : texto);

/** Where `texto` may break: the spaces out of a string that come after a comma or an operator, as { i, nivel }. */
export function puntosDeCorte(texto, niveles = NIVEL) {
  const puntos = [];
  let comilla = '';
  let palabra = '';
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (comilla) {
      palabra += c;
      if (c === '\\') {
        palabra += texto[i + 1] ?? '';
        i += 1;
      } else if (c === comilla) comilla = '';
    } else if (c === ' ') {
      const nivel = palabra.endsWith(',') ? 1 : niveles.get(palabra);
      if (palabra && nivel) puntos.push({ i, nivel });
      palabra = '';
    } else {
      if (c === '"' || c === "'") comilla = c;
      palabra += c;
    }
  }
  return puntos;
}

function cortarEn(texto, puntos, tope) {
  const lineas = [];
  let desde = 0;
  while (desde < texto.length) {
    const lugar = lineas.length ? tope - 4 : tope;
    if (texto.length - desde <= lugar) {
      lineas.push(texto.slice(desde));
      break;
    }
    const antes = puntos.filter((p) => p.i > desde && p.i - desde <= lugar);
    const mejor = Math.min(...antes.map((p) => p.nivel));
    const corte = antes.length ? antes.filter((p) => p.nivel === mejor).at(-1).i : puntos.find((p) => p.i > desde)?.i;
    if (corte === undefined) {
      lineas.push(texto.slice(desde));
      break;
    }
    lineas.push(texto.slice(desde, corte));
    desde = corte + 1;
  }
  return lineas;
}

function cerrar(lineas) {
  const r = lineas.slice(0, TOPE_RENGLONES).map((l) => recortar(l));
  if (lineas.length > TOPE_RENGLONES) r[r.length - 1] = recortar(`${r.at(-1)} …`, TOPE_RENGLON + 2);
  return r;
}

/** A sentence in lines of up to `tope` letters; the ones after the first go 4 spaces in. */
export function partir(texto, tope = TOPE_LETRAS) {
  const t = String(texto);
  if (t.length <= tope) return [recortar(t)];
  return cerrar(cortarEn(t, puntosDeCorte(t), tope).map((l, i) => (i ? `    ${l}` : l)));
}

/** The condition of a decision: a line per `and` or `or` when it's long, each one as a sentence. */
export function partirCondicion(texto) {
  const t = String(texto);
  if (t.length <= CONDICION_CORTA) return [recortar(t)];
  const puntos = puntosDeCorte(t, Y_O).map((p) => p.i);
  if (!puntos.length) return partir(t);
  const piezas = [];
  let desde = 0;
  for (const p of [...puntos, t.length]) {
    piezas.push(t.slice(desde, p));
    desde = p + 1;
  }
  return cerrar(piezas.flatMap((p) => partir(p)));
}

// --- What the worker says, checked ---

const texto = (v) => (typeof v === 'string' ? v : '');
const linea = (v) => (Number.isInteger(v) && v > 0 ? v : 0);

function pieza(p) {
  if (!Array.isArray(p)) return null;
  const [tipo] = p;
  if (tipo === 's' || tipo === 'txt') return { tipo, texto: texto(p[1]), linea: linea(p[2]) };
  if (tipo === 'si') return { tipo, condicion: texto(p[1]), si: piezas(p[2]), no: piezas(p[3]), linea: linea(p[4]) };
  if (tipo === 'rep') return { tipo, cabeza: texto(p[1]), cuerpo: piezas(p[2]), linea: linea(p[3]) };
  if (tipo === 'segun') {
    const casos = (Array.isArray(p[2]) ? p[2] : []).filter(Array.isArray).map(([rotulo, cuerpo]) => ({ rotulo: texto(rotulo), cuerpo: piezas(cuerpo) }));
    return { tipo, cabeza: texto(p[1]), casos, linea: linea(p[3]) };
  }
  return null;
}

function piezas(lista) {
  return (Array.isArray(lista) ? lista : []).map(pieza).filter(Boolean);
}

/**
 * What `_chapin` answered (a JSON text), as { ok: true, diagramas, cortado }, { ok: false, linea } (a syntax error,
 * line 0 if Python didn't say it) or { ok: false, largo: true }. null if it isn't any of them.
 */
export function leerChapin(json) {
  let d;
  try {
    d = JSON.parse(String(json));
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object') return null;
  if (d.ok === false) return d.largo === true ? { ok: false, largo: true } : { ok: false, linea: linea(d.linea) };
  if (d.ok !== true || !Array.isArray(d.diagramas)) return null;
  const diagramas = d.diagramas
    .filter((x) => x && typeof x === 'object')
    .map((x) => ({
      titulo: texto(x.titulo),
      decl: (Array.isArray(x.decl) ? x.decl : []).map(texto).slice(0, TOPE_DECL),
      cuerpo: piezas(x.cuerpo),
      linea: linea(x.linea),
    }));
  return { ok: true, diagramas, cortado: d.cortado === true };
}

// --- Measuring and laying out ---

function bloque(t) {
  const lineas = t.split('\n').map((l) => recortar(l.replace(/\t/g, '    ')));
  if (lineas.length <= TOPE_SUELTO) return lineas;
  return [...lineas.slice(0, TOPE_SUELTO - 1), '…'];
}

const largo = (lineas) => lineas.reduce((m, l) => Math.max(m, l.length), 0);
const altoDe = (lineas) => ALTO + LINEA * (Math.max(1, lineas.length) - 1);

function pila(lista, ch) {
  const items = lista.map((p) => medir(p, ch));
  return { items, w: items.reduce((m, i) => Math.max(m, i.w), 0), h: items.reduce((s, i) => s + i.h, 0) };
}

function medir(p, ch) {
  if (p.tipo === 's' || p.tipo === 'txt') {
    const lineas = p.tipo === 's' ? partir(p.texto) : bloque(p.texto);
    return { ...p, lineas, w: largo(lineas) * ch + 2 * R, h: altoDe(lineas) };
  }
  if (p.tipo === 'rep') {
    const cabeza = partir(p.cabeza);
    const hijos = pila(p.cuerpo, ch);
    const hc = altoDe(cabeza);
    return { ...p, lineas: cabeza, hc, hijos, w: Math.max(largo(cabeza) * ch + 2 * R, SANGRIA + hijos.w), h: hc + hijos.h };
  }
  if (p.tipo === 'si') {
    const cond = partirCondicion(p.condicion);
    const th = 44 + LINEA * (cond.length - 1);
    const v = pila(p.si, ch);
    const f = pila(p.no, ch);
    const wv = v.items.length ? v.w : VACIO;
    const wf = f.items.length ? f.w : VACIO;
    return { ...p, lineas: cond, th, v, f, wv, wf, w: Math.max(wv + wf, 2 * largo(cond) * ch + 32), h: th + (Math.max(v.h, f.h) || ALTO) };
  }
  const cabeza = partir(p.cabeza);
  const hc = altoDe(cabeza);
  const casos = p.casos.map((c) => {
    const rotulo = partir(c.rotulo, 40);
    const hijos = pila(c.cuerpo, ch);
    return { rotulo, hijos, w: Math.max(largo(rotulo) * ch + 2 * R, hijos.w, VACIO) };
  });
  const hr = ALTO + LINEA * (Math.max(1, ...casos.map((c) => c.rotulo.length)) - 1);
  const columnas = casos.reduce((s, c) => s + c.w, 0);
  return { ...p, lineas: cabeza, hc, hr, casos, w: Math.max(largo(cabeza) * ch + 2 * R, columnas), h: hc + (casos.length ? hr + (Math.max(0, ...casos.map((c) => c.hijos.h)) || ALTO) : 0) };
}

const n1 = (v) => Math.round(v * 10) / 10;

/** Widths that fill `total`: what is left over goes to each one as it already has. */
function repartir(anchos, total, pesan = anchos.map(() => true)) {
  const base = anchos.reduce((s, a) => s + a, 0);
  const sobra = total - base;
  const peso = anchos.reduce((s, a, i) => s + (pesan[i] ? a : 0), 0);
  if (sobra <= 0) return anchos;
  if (!peso) return anchos.map((a) => a + sobra / anchos.length);
  return anchos.map((a, i) => (pesan[i] ? a + (sobra * a) / peso : a));
}

function ubicarPila(p, x, y, w, d) {
  let arriba = y;
  for (const item of p.items) {
    ubicar(item, x, arriba, w, d);
    arriba += item.h;
  }
}

function lineasDeTexto(lineas, x, y, tipo, d, ancla) {
  lineas.forEach((t, i) => d.textos.push({ x: n1(x), y: n1(y + LINEA * i), texto: t, tipo, ...(ancla ? { ancla } : {}) }));
}

function ubicar(p, x, y, w, d) {
  d.cajas.push({ x: n1(x), y: n1(y), w: n1(w), h: n1(p.h) });
  if (p.tipo === 's' || p.tipo === 'txt') {
    lineasDeTexto(p.lineas, x + R, y + 17.5, p.tipo === 's' ? 'codigo' : 'suelto', d);
    return;
  }
  if (p.tipo === 'rep') {
    lineasDeTexto(p.lineas, x + R, y + 17.5, 'codigo', d);
    ubicarPila(p.hijos, x + SANGRIA, y + p.hc, w - SANGRIA, d);
    return;
  }
  if (p.tipo === 'si') {
    const [wv] = repartir([p.wv, p.wf], w, [p.v.items.length > 0, p.f.items.length > 0]);
    const xs = x + wv;
    const abajo = y + p.th;
    d.trazos.push(`M${n1(x)} ${n1(y)}L${n1(xs)} ${n1(abajo)}L${n1(x + w)} ${n1(y)}M${n1(x)} ${n1(abajo)}H${n1(x + w)}M${n1(xs)} ${n1(abajo)}V${n1(y + p.h)}`);
    // The condition, in the middle of the triangle at the height of its last line, without going out of the box.
    const hondo = LINEA * p.lineas.length + 4;
    const izq = x + ((xs - x) * hondo) / p.th;
    const der = x + w - ((x + w - xs) * hondo) / p.th;
    const mitad = (largo(p.lineas) * d.ch) / 2;
    const cx = Math.min(Math.max((izq + der) / 2, x + R + mitad), x + w - R - mitad);
    lineasDeTexto(p.lineas, cx, y + 16, 'codigo', d, 'middle');
    d.textos.push({ x: n1(x + 7), y: n1(abajo - 7), texto: 'v', tipo: 'vf' }, { x: n1(x + w - 7), y: n1(abajo - 7), texto: 'f', tipo: 'vf', ancla: 'end' });
    ubicarPila(p.v, x, abajo, wv, d);
    ubicarPila(p.f, xs, abajo, x + w - xs, d);
    return;
  }
  lineasDeTexto(p.lineas, x + R, y + 17.5, 'codigo', d);
  if (!p.casos.length) return;
  const anchos = repartir(p.casos.map((c) => c.w), w);
  const fila = y + p.hc;
  const debajo = fila + p.hr;
  let trazo = `M${n1(x)} ${n1(fila)}H${n1(x + w)}M${n1(x)} ${n1(debajo)}H${n1(x + w)}`;
  let cx = x;
  p.casos.forEach((c, i) => {
    if (i) trazo += `M${n1(cx)} ${n1(fila)}V${n1(y + p.h)}`;
    lineasDeTexto(c.rotulo, cx + anchos[i] / 2, fila + 17.5, 'codigo', d, 'middle');
    ubicarPila(c.hijos, cx, debajo, anchos[i], d);
    cx += anchos[i];
  });
  d.trazos.push(trazo);
}

/**
 * A diagram laid out: { ancho, alto, cajas [{ x, y, w, h }], trazo (the lines of decisions and Según, an SVG path),
 * textos [{ x, y, texto, tipo, ancla? }] }. `tipo`: 'titulo', 'decl', 'codigo', 'suelto' (what stays as written) or
 * 'vf'. `ch`: the width of a letter of the code at 13 px.
 */
export function armarChapin(diagrama, { ch = 7.8 } = {}) {
  const d = { cajas: [], trazos: [], textos: [], ch };
  const cuerpo = pila(diagrama.cuerpo, ch);
  const decl = diagrama.decl.map((l) => recortar(l));
  const arriba = 49 + 17 * decl.length;
  const w = Math.max(cuerpo.w, 120);
  d.textos.push({ x: M, y: 29, texto: recortar(diagrama.titulo), tipo: 'titulo' });
  decl.forEach((t, i) => d.textos.push({ x: M, y: 54 + 17 * i, texto: t, tipo: 'decl' }));
  if (cuerpo.items.length) ubicarPila(cuerpo, M, arriba, w, d);
  else d.cajas.push({ x: M, y: arriba, w, h: ALTO });
  const ancho = Math.max(M + w + M, M + largo(decl) * ch * (MEDIDAS.letraDecl / MEDIDAS.letra) + M, M + recortar(diagrama.titulo).length * ch * (14 / 13) + M);
  return { ancho: Math.ceil(ancho), alto: Math.ceil(arriba + (cuerpo.h || ALTO) + M), cajas: d.cajas, trazo: d.trazos.join(''), textos: d.textos };
}

// --- In words, for a screen reader ---

const nada = [{ texto: 'Nada' }];

function enLista(lista) {
  if (!lista.length) return nada;
  return lista.map((p) => {
    if (p.tipo === 's') return { texto: p.texto };
    if (p.tipo === 'txt') return { texto: 'Sin dibujar, como está escrito', codigo: bloque(p.texto).join('\n') };
    if (p.tipo === 'rep') return { texto: p.cabeza, hijos: enLista(p.cuerpo) };
    if (p.tipo === 'si') return { texto: `Si ${p.condicion}`, hijos: [{ texto: 'Verdadero', hijos: enLista(p.si) }, { texto: 'Falso', hijos: enLista(p.no) }] };
    return { texto: p.cabeza, hijos: p.casos.length ? p.casos.map((c) => ({ texto: `Caso ${c.rotulo}`, hijos: enLista(c.cuerpo) })) : nada };
  });
}

/** A diagram's body as a list of { texto, codigo?, hijos? }: what a screen reader goes through instead of the drawing. */
export const chapinEnLista = (diagrama) => enLista(diagrama.cuerpo);

// --- Asking the worker ---

let numero = 0;

/**
 * The Chapin of `codigo`, from the lab's Python (it loads it if it isn't): what leerChapin gives, { falla: true } if
 * Python didn't load or didn't answer, or null if `corte` ended first. `alCargar()` when Python has to load,
 * `alEsperar()` when it waits for a run to end.
 */
export async function pedirChapin(codigo, corte, { alCargar, alEsperar } = {}) {
  const m = motorDe('python');
  if (['apagado', 'falla'].includes(m.leer().fase)) {
    alCargar?.();
    if (!(await m.encender())) return corte.aborted ? null : { falla: true };
  }
  if (corte.aborted) return null;
  if (m.corrida) alEsperar?.();
  const worker = await motorLibre(m, corte);
  if (!worker) return corte.aborted ? null : { falla: true };
  numero += 1;
  const id = `chapin-${numero}`;
  return new Promise((resolver) => {
    const fin = (r) => {
      clearTimeout(reloj);
      worker.removeEventListener('message', oir);
      corte.removeEventListener('abort', cortar);
      resolver(r);
    };
    const oir = ({ data: d }) => {
      if (d?.tipo === 'chapin' && d.id === id) fin((typeof d.json === 'string' && leerChapin(d.json)) || { falla: true });
    };
    const cortar = () => fin(null);
    const reloj = setTimeout(() => fin({ falla: true }), TOPE_MS);
    worker.addEventListener('message', oir);
    corte.addEventListener('abort', cortar);
    worker.postMessage({ tipo: 'chapin', id, codigo: String(codigo ?? '') });
  });
}
