// The shared flowchart of a table's tab (Diagrama de flujo): the shapes of a flowchart joined by arrows that go from
// any side to any side. Each one is a small plain object straight in `datos`, replaced whole (no map inside to create,
// so two cannot make different ones):
//
//   n:<id>   { t: 'terminal' | 'proceso' | 'decision' | 'datos' | 'subproceso' | 'conector', x, y, txt, c?, l?, g?, r? }
//   f:<id>   { de, sd, a, ad, txt, c?, l?, g? }   from node `de` (its side `sd`) to node `a` (its side `ad`)
//
// Sides are 't', 'r', 'b' and 'l'. A side takes any number of arrows, in and out. The style goes only when it is not
// the usual one: `c` a number of the Pizarra's palette (each theme draws it its own way, never a color a peer chose),
// `l` the line (LINEAS), `g` its thickness (GROSORES) and `r` a shape filled with a tint of its color. Everything from a
// peer is checked and cut on the way back: unknown kinds, sides and styles, missing nodes and long texts.

export const MAX_NODOS = 200;
export const MAX_FLECHAS = 400;
export const MAX_TEXTO = 140;
export const MAX_ETIQUETA = 40;
const LIMITE = 100_000;

export const FORMAS = {
  terminal: 'Inicio o fin',
  proceso: 'Proceso',
  decision: 'Decisión',
  datos: 'Entrada o salida',
  subproceso: 'Subproceso',
  conector: 'Conector',
};
export const TIPOS = Object.keys(FORMAS);
export const LADOS = ['t', 'r', 'b', 'l'];
export const COLORES = 6;
export const LINEAS = ['Continua', 'De guiones', 'De puntos'];
export const GROSORES = ['Fina', 'Media', 'Gruesa'];

const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, -LIMITE), LIMITE)) : null);
// A shape's text keeps its line breaks; an arrow's label is one line.
// eslint-disable-next-line no-control-regex
const texto = (v) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').slice(0, MAX_TEXTO) : '');
// eslint-disable-next-line no-control-regex
const etiqueta = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_ETIQUETA) : '');
const idValido = (id) => typeof id === 'string' && /^[0-9a-f]{12}$/.test(id);
const indice = (v, n) => (Number.isInteger(v) && v > 0 && v < n ? v : 0);

/** The style of a shape or an arrow, only what is not the usual (a field at 0 is not kept). */
export function estiloDe(v, forma) {
  const e = {};
  const c = indice(v?.c, COLORES);
  const l = indice(v?.l, LINEAS.length);
  const g = indice(v?.g, GROSORES.length);
  if (c) e.c = c;
  if (l) e.l = l;
  if (g) e.g = g;
  if (forma && v?.r === 1) e.r = 1;
  return e;
}

const N = (id) => `n:${id}`;
const F = (id) => `f:${id}`;
const contar = (datos, prefijo) => {
  let n = 0;
  for (const k of datos.keys()) if (k.startsWith(prefijo)) n += 1;
  return n;
};

export function limpiarNodo(id, v) {
  if (!idValido(id) || !v || typeof v !== 'object' || !TIPOS.includes(v.t)) return null;
  const x = num(v.x);
  const y = num(v.y);
  if (x === null || y === null) return null;
  return { id, t: v.t, x, y, txt: texto(v.txt), ...estiloDe(v, true) };
}

export function limpiarFlecha(id, v, nodos) {
  if (!idValido(id) || !v || typeof v !== 'object' || v.de === v.a) return null;
  if (!nodos.has(v.de) || !nodos.has(v.a) || !LADOS.includes(v.sd) || !LADOS.includes(v.ad)) return null;
  return { id, de: v.de, sd: v.sd, a: v.a, ad: v.ad, txt: etiqueta(v.txt), ...estiloDe(v, false) };
}

/** The flowchart as it is drawn: { nodos: [...], flechas: [...] }, checked and cut. */
export function leerFlujo(datos) {
  const nodos = new Map();
  const crudas = [];
  let vistos = 0;
  for (const [k, v] of datos.entries()) {
    if ((vistos += 1) > (MAX_NODOS + MAX_FLECHAS) * 2) break;
    if (k.startsWith('n:') && nodos.size < MAX_NODOS) {
      const n = limpiarNodo(k.slice(2), v);
      if (n) nodos.set(n.id, n);
    } else if (k.startsWith('f:') && crudas.length < MAX_FLECHAS * 2) {
      crudas.push([k.slice(2), v]);
    }
  }
  const flechas = [];
  crudas.sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([id, v]) => {
    const f = flechas.length < MAX_FLECHAS && limpiarFlecha(id, v, nodos);
    if (f) flechas.push(f);
  });
  return { nodos: [...nodos.values()].sort((a, b) => (a.id < b.id ? -1 : 1)), flechas };
}

export function agregarNodo(datos, t, { x = 0, y = 0, txt = '' } = {}, origen) {
  if (!TIPOS.includes(t) || contar(datos, 'n:') >= MAX_NODOS) return null;
  const id = nuevoId();
  const { id: _fuera, ...v } = limpiarNodo(id, { t, x, y, txt });
  datos.doc.transact(() => datos.set(N(id), v), origen);
  return id;
}

/** Changes some fields of a node (x, y, txt, its shape and its style: a style field at 0 goes back to the usual). */
export function cambiarNodo(datos, id, campos, origen) {
  const actual = limpiarNodo(id, datos.get(N(id)));
  const nuevo = actual && limpiarNodo(id, { ...actual, ...campos });
  if (!nuevo) return;
  const { id: _fuera, ...v } = nuevo;
  datos.doc.transact(() => datos.set(N(id), v), origen);
}


/** A copy of a node, a little down and to the right, with its text and its settings; returns its id. */
export function duplicarNodo(datos, id, origen, corrido = 24) {
  const actual = limpiarNodo(id, datos.get(N(id)));
  if (!actual || contar(datos, 'n:') >= MAX_NODOS) return null;
  const nuevo = nuevoId();
  const copia = limpiarNodo(nuevo, { ...actual, x: actual.x + corrido, y: actual.y + corrido });
  if (!copia) return null;
  const { id: _fuera, ...v } = copia;
  datos.doc.transact(() => datos.set(N(nuevo), v), origen);
  return nuevo;
}

// From a decision, the first arrow is «Sí» and the second «No», unless it brings its own label.
function etiquetaDeSalida(actual, de, txt) {
  if (txt || actual.nodos.find((n) => n.id === de)?.t !== 'decision') return txt;
  const usadas = actual.flechas.filter((f) => f.de === de).map((f) => f.txt);
  if (!usadas.includes('Sí')) return 'Sí';
  return usadas.includes('No') ? '' : 'No';
}

/** Joins two nodes, side to side; returns the arrow's id, or null if they cannot be joined. */
export function conectar(datos, { de, sd, a, ad, txt = '' }, origen) {
  if (contar(datos, 'f:') >= MAX_FLECHAS) return null;
  const actual = leerFlujo(datos);
  const id = nuevoId();
  const f = limpiarFlecha(id, { de, sd, a, ad, txt: etiquetaDeSalida(actual, de, txt) }, new Map(actual.nodos.map((n) => [n.id, n])));
  if (!f) return null;
  const { id: _fuera, ...v } = f;
  datos.doc.transact(() => datos.set(F(id), v), origen);
  return id;
}

/** Changes an arrow's label, its sides or its style (a style field at 0 goes back to the usual). */
export function cambiarFlecha(datos, id, campos, origen) {
  const actual = datos.get(F(id));
  if (!actual || typeof actual !== 'object') return;
  const nuevo = { ...actual, ...campos };
  if (!LADOS.includes(nuevo.sd) || !LADOS.includes(nuevo.ad)) return;
  datos.doc.transact(() => datos.set(F(id), { de: nuevo.de, sd: nuevo.sd, a: nuevo.a, ad: nuevo.ad, txt: etiqueta(nuevo.txt), ...estiloDe(nuevo, false) }), origen);
}

/** Turns an arrow around: it goes from where it came, by the same sides, with its style. */
export function invertirFlecha(datos, id, origen) {
  const actual = datos.get(F(id));
  if (!actual || typeof actual !== 'object' || !LADOS.includes(actual.sd) || !LADOS.includes(actual.ad)) return;
  datos.doc.transact(() => datos.set(F(id), { de: actual.a, sd: actual.ad, a: actual.de, ad: actual.sd, txt: etiqueta(actual.txt), ...estiloDe(actual, false) }), origen);
}

/** Deletes nodes (with their arrows) and arrows. */
export function borrar(datos, { nodos: ids = [], flechas: fids = [] }, origen) {
  datos.doc.transact(() => {
    ids.forEach((id) => datos.delete(N(id)));
    const fuera = new Set(ids);
    [...datos.entries()].forEach(([k, v]) => {
      if (k.startsWith('f:') && (fids.includes(k.slice(2)) || fuera.has(v?.de) || fuera.has(v?.a))) datos.delete(k);
    });
  }, origen);
}

/**
 * The sides an arrow takes when nobody chose them: down when the other is below, sideways when it is beside, and back
 * up around the left when it is above in the same column (a loop). A decision's second way out goes by the side, so
 * «Sí» and «No» do not leave on top of each other.
 */
export function ladosEntre(de, a, usados = []) {
  const dx = a.x - de.x;
  const dy = a.y - de.y;
  let par;
  if (dy < 0 && Math.abs(dx) < 80) par = ['l', 'l'];
  else if (Math.abs(dy) >= Math.abs(dx)) par = dy >= 0 ? ['b', 't'] : ['t', 'b'];
  else par = dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  if (de.t === 'decision' && usados.includes(par[0])) {
    const libre = ['b', 'r', 'l', 't'].find((l) => !usados.includes(l));
    if (libre) par = [libre, par[1]];
  }
  return par;
}

const una = (t) => t.replace(/\s+/g, ' ').trim();

/** A node's name for people: its shape and its text. */
export function nombreNodo(n) {
  if (!n) return '';
  const forma = FORMAS[n.t].toLowerCase();
  return n.txt ? `${forma} «${una(n.txt)}»` : `${forma} sin texto`;
}

/**
 * What the session's Consultron reads: the steps in the order the arrows go, from each start (a start or end shape
 * that no arrow reaches, or else any shape that none reaches), with where each one goes next and what each decision
 * answers. What no arrow reaches goes at the end.
 */
export function textoFlujo({ nodos, flechas }) {
  if (!nodos.length) return '';
  const porId = new Map(nodos.map((n) => [n.id, n]));
  const llegan = new Set(flechas.map((f) => f.a));
  const arriba = (a, b) => a.y - b.y || a.x - b.x;
  // A decision's «Sí» is told before its «No»; other ways out, by where they go.
  const rango = (f) => ({ Sí: 0, No: 2 }[f.txt] ?? 1);
  const salenDe = (id) => flechas.filter((f) => f.de === id).sort((x, y) => rango(x) - rango(y) || arriba(porId.get(x.a), porId.get(y.a)));
  let inicios = nodos.filter((n) => n.t === 'terminal' && !llegan.has(n.id)).sort(arriba);
  if (!inicios.length) inicios = nodos.filter((n) => !llegan.has(n.id)).sort(arriba);
  if (!inicios.length) inicios = [[...nodos].sort(arriba)[0]];
  const orden = [];
  const visto = new Set();
  const recorrer = (id) => {
    const pila = [id];
    while (pila.length) {
      const actual = pila.pop();
      if (visto.has(actual)) continue;
      visto.add(actual);
      orden.push(porId.get(actual));
      // The first way out is walked first: pushed last.
      const salen = salenDe(actual);
      for (let i = salen.length - 1; i >= 0; i -= 1) if (!visto.has(salen[i].a)) pila.push(salen[i].a);
    }
  };
  inicios.forEach((n) => recorrer(n.id));
  [...nodos].sort(arriba).forEach((n) => recorrer(n.id));
  const paso = new Map(orden.map((n, i) => [n.id, i + 1]));
  const lineas = ['Diagrama de flujo, paso por paso:'];
  orden.forEach((n, i) => {
    const salen = salenDe(n.id);
    let l = `${i + 1}. ${nombreNodo(n)}`;
    if (salen.length === 1 && !salen[0].txt) {
      l += paso.get(salen[0].a) === i + 2 ? '' : `, sigue en el paso ${paso.get(salen[0].a)}`;
    } else if (salen.length) {
      l += `. ${salen.map((f) => `${f.txt ? `«${f.txt}»` : 'Sin etiqueta'} va al paso ${paso.get(f.a)}`).join('; ')}`;
    } else if (n.t !== 'terminal') {
      l += ', sin flecha de salida';
    }
    lineas.push(`${l}.`);
  });
  return lineas.join('\n').replace(/\.\./g, '.');
}
