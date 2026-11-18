// The shared whiteboard of a table's tab (Pizarra): every drawn thing is one plain object straight in `datos`,
// under `e:<id>`, replaced whole when it changes (no map inside to create: two who start drawing at once cannot
// pick different ones). Colors go as a number of the site's palette (each theme draws them its own
// way), never as a color a peer chose. What comes back is checked and cut: a peer cannot freeze the page.
//
//   trazo   { t, z, c, g, p: [x0, y0, x1, y1, ...] }     free hand
//   rect, elipse, linea, flecha   { t, z, c, g, x1, y1, x2, y2 }
//   texto   { t, z, c, x, y, s, tam }

export const MAX_ELEMENTOS = 2000;
export const MAX_PUNTOS = 1500;
export const MAX_TEXTO = 300;
export const COLORES = 6;
export const GROSORES = [2, 4, 8];
export const TAMANOS = [18, 28, 44];
const LIMITE = 100_000;
const FIGURAS = new Set(['rect', 'elipse', 'linea', 'flecha']);
export const TIPOS = new Set(['trazo', 'texto', ...FIGURAS]);

const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, -LIMITE), LIMITE) * 10) / 10 : null);
const entero = (v, n) => (Number.isInteger(v) && v >= 0 && v < n ? v : 0);
// eslint-disable-next-line no-control-regex
const texto = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, MAX_TEXTO) : '');

const clave = (id) => `e:${id}`;
const esElemento = (k) => k.startsWith('e:');

/** How many elements there are (without checking them). */
export function cuantos(datos) {
  let n = 0;
  for (const k of datos.keys()) if (esElemento(k)) n += 1;
  return n;
}

/** One element as it is drawn, checked; null if it does not read. */
export function limpiar(id, v) {
  if (typeof id !== 'string' || id.length > 20 || !v || typeof v !== 'object' || !TIPOS.has(v.t)) return null;
  const base = { id, t: v.t, z: typeof v.z === 'number' && Number.isFinite(v.z) ? v.z : 0, c: entero(v.c, COLORES) };
  if (v.t === 'trazo') {
    if (!Array.isArray(v.p) || v.p.length < 2) return null;
    const p = [];
    for (let i = 0; i + 1 < v.p.length && p.length < MAX_PUNTOS * 2; i += 2) {
      const x = num(v.p[i]);
      const y = num(v.p[i + 1]);
      if (x === null || y === null) return null;
      p.push(x, y);
    }
    // `r`: what is left of a figure the eraser cut, drawn as a plain line (not free hand).
    return { ...base, g: entero(v.g, GROSORES.length), p, ...(v.r === 1 ? { r: 1 } : {}) };
  }
  if (v.t === 'texto') {
    const s = texto(v.s).trim();
    const x = num(v.x);
    const y = num(v.y);
    if (!s || x === null || y === null) return null;
    return { ...base, x, y, s, tam: entero(v.tam, TAMANOS.length) };
  }
  const [x1, y1, x2, y2] = [num(v.x1), num(v.y1), num(v.x2), num(v.y2)];
  if ([x1, y1, x2, y2].includes(null)) return null;
  return { ...base, g: entero(v.g, GROSORES.length), x1, y1, x2, y2 };
}

const limpios = new WeakMap();

/** Everything on the board, from the back to the front. Reads at most a few more than the top. */
export function leerElementos(datos) {
  const lista = [];
  let vistos = 0;
  for (const [k, v] of datos.entries()) {
    if ((vistos += 1) > MAX_ELEMENTOS * 2 || lista.length >= MAX_ELEMENTOS) break;
    if (!esElemento(k)) continue;
    // What Yjs hands back for an unchanged entry is the same object: checked once.
    let el = v && typeof v === 'object' ? limpios.get(v) : undefined;
    if (el === undefined || el?.id !== k.slice(2)) {
      el = limpiar(k.slice(2), v);
      if (v && typeof v === 'object') limpios.set(v, el);
    }
    if (el) lista.push(el);
  }
  return lista.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
}

// Who draws later goes on top: the time, and one more if two go in the same millisecond here.
let ultimoZ = 0;

/** Adds an element for everyone; returns its id (null if it does not read or the board is full). */
export function agregar(datos, el, origen) {
  if (cuantos(datos) >= MAX_ELEMENTOS) return null;
  const id = nuevoId();
  const { id: _fuera, ...resto } = limpiar(id, { ...el, z: (ultimoZ = Math.max(Date.now(), ultimoZ + 1)) }) ?? {};
  if (!resto.t) return null;
  datos.doc.transact(() => datos.set(clave(id), resto), origen);
  return id;
}

export function borrar(datos, ids, origen) {
  if (!ids.length) return;
  datos.doc.transact(() => ids.forEach((id) => datos.delete(clave(id))), origen);
}

/** Brings an element in front of everything (adelante) or sends it behind everything. */
export function apilar(datos, id, adelante, origen) {
  apilarVarios(datos, [id], adelante, origen);
}

/** Brings some elements in front of everything else, or sends them behind it, in one go: among them, the order they
 * had. */
export function apilarVarios(datos, ids, adelante, origen) {
  const unos = new Set(ids);
  const todos = leerElementos(datos);
  const elegidos = todos.filter((el) => unos.has(el.id));
  const zs = todos.filter((el) => !unos.has(el.id)).map((el) => el.z);
  if (!elegidos.length || !zs.length) return;
  const desde = adelante ? Math.max(...zs) + 1 : Math.min(...zs) - elegidos.length;
  datos.doc.transact(() => {
    elegidos.forEach((el, i) => datos.set(clave(el.id), { ...datos.get(clave(el.id)), z: desde + i }));
  }, origen);
}

/** The color (`c`) and, of what has a line, the thickness (`g`) of some elements, in one go. */
export function cambiarVarios(datos, ids, { c, g }, origen) {
  const cambios = [];
  for (const id of ids) {
    const el = limpiar(id, datos.get(clave(id)));
    if (!el) continue;
    const { id: _fuera, ...v } = el;
    if (c !== undefined) v.c = c;
    if (g !== undefined && v.g !== undefined) v.g = g;
    const nuevo = limpiar(id, v);
    if (nuevo && (nuevo.c !== el.c || nuevo.g !== el.g)) cambios.push([id, v]);
  }
  if (cambios.length) datos.doc.transact(() => cambios.forEach(([id, v]) => datos.set(clave(id), v)), origen);
}

/** Writes a text again where it is, with its color and size: what it says now. Empty, it is not changed (who calls
 * deletes it). Returns whether it changed. */
export function cambiarTexto(datos, id, s, origen) {
  const el = limpiar(id, datos.get(clave(id)));
  if (!el || el.t !== 'texto') return false;
  const { id: _fuera, ...v } = el;
  const nuevo = limpiar(id, { ...v, s });
  if (!nuevo || nuevo.s === el.s) return false;
  datos.doc.transact(() => datos.set(clave(id), { ...v, s: nuevo.s }), origen);
  return true;
}

export function mover(datos, id, dx, dy, origen) {
  moverVarios(datos, [id], dx, dy, origen);
}

/** Moves some elements by the same amount, in one go (one undo). */
export function moverVarios(datos, ids, dx, dy, origen) {
  const cambios = [];
  for (const id of ids) {
    const el = limpiar(id, datos.get(clave(id)));
    if (!el) continue;
    const { id: _fuera, ...v } = el;
    if (v.t === 'trazo') v.p = v.p.map((n, i) => n + (i % 2 ? dy : dx));
    else if (v.t === 'texto') Object.assign(v, { x: v.x + dx, y: v.y + dy });
    else Object.assign(v, { x1: v.x1 + dx, y1: v.y1 + dy, x2: v.x2 + dx, y2: v.y2 + dy });
    if (limpiar(id, v)) cambios.push([id, v]);
  }
  if (cambios.length) datos.doc.transact(() => cambios.forEach(([id, v]) => datos.set(clave(id), v)), origen);
}

/** The elements whole inside a rectangle (two corners, in any order): what a selection rectangle takes. */
export function dentroDe(elementos, x1, y1, x2, y2) {
  const [x0, x3, y0, y3] = [Math.min(x1, x2), Math.max(x1, x2), Math.min(y1, y2), Math.max(y1, y2)];
  return elementos.filter((el) => {
    const [x, y, w, h] = caja(el);
    return x >= x0 && y >= y0 && x + w <= x3 && y + h <= y3;
  });
}

// --- Touching: the eraser and the hand that moves things.

const aSegmento = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

/** The box of an element: [x, y, ancho, alto]. A text's is estimated from its letters. */
export function caja(el) {
  if (el.t === 'trazo') {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < el.p.length; i += 2) {
      x0 = Math.min(x0, el.p[i]);
      x1 = Math.max(x1, el.p[i]);
      y0 = Math.min(y0, el.p[i + 1]);
      y1 = Math.max(y1, el.p[i + 1]);
    }
    return [x0, y0, x1 - x0, y1 - y0];
  }
  if (el.t === 'texto') {
    const tam = TAMANOS[el.tam];
    const lineas = el.s.split('\n');
    return [el.x, el.y - tam, Math.max(...lineas.map((l) => l.length)) * tam * 0.56, lineas.length * tam * 1.25];
  }
  return [Math.min(el.x1, el.x2), Math.min(el.y1, el.y2), Math.abs(el.x2 - el.x1), Math.abs(el.y2 - el.y1)];
}

export function toca(el, x, y, radio) {
  const r = radio + (el.g != null ? GROSORES[el.g] / 2 : 0);
  if (el.t === 'trazo') {
    if (el.p.length === 2) return Math.hypot(x - el.p[0], y - el.p[1]) <= r;
    for (let i = 0; i + 3 < el.p.length; i += 2) if (aSegmento(x, y, el.p[i], el.p[i + 1], el.p[i + 2], el.p[i + 3]) <= r) return true;
    return false;
  }
  if (el.t === 'linea' || el.t === 'flecha') return aSegmento(x, y, el.x1, el.y1, el.x2, el.y2) <= r;
  const [bx, by, bw, bh] = caja(el);
  return x >= bx - r && x <= bx + bw + r && y >= by - r && y <= by + bh + r;
}

const NOMBRES = { trazo: 'trazo', rect: 'rectángulo', elipse: 'elipse', linea: 'línea', flecha: 'flecha' };

/** What the session's Consultron reads: the texts on the board and how many drawn things there are. */
export function textoPizarra(elementos) {
  const textos = elementos.filter((e) => e.t === 'texto').map((e) => e.s);
  const cuenta = {};
  elementos.forEach((e) => {
    if (e.t !== 'texto') cuenta[e.t] = (cuenta[e.t] ?? 0) + 1;
  });
  const dibujos = Object.entries(cuenta).map(([t, n]) => `${n} ${NOMBRES[t]}${n > 1 ? 's' : ''}`);
  return [
    dibujos.length ? `Dibujos en la pizarra: ${dibujos.join(', ')}.` : '',
    textos.length ? `Textos escritos en la pizarra:\n${textos.map((t) => `- ${t}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');
}

// What is left of a free-hand stroke once a circle rubs it: the pieces outside it, each cut right at the circle's edge.
export function sinLoDelCirculo(p, cx, cy, r) {
  if (p.length < 4) return Math.hypot(p[0] - cx, p[1] - cy) > r ? [p] : [];
  const piezas = [];
  let actual = [];
  const cerrar = () => {
    if (actual.length >= 4) piezas.push(actual);
    actual = [];
  };
  for (let i = 0; i + 3 < p.length; i += 2) {
    const [ax, ay, bx, by] = [p[i], p[i + 1], p[i + 2], p[i + 3]];
    const [dx, dy] = [bx - ax, by - ay];
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * (ax - cx) + dy * (ay - cy));
    const c = (ax - cx) ** 2 + (ay - cy) ** 2 - r * r;
    // The part of the segment inside the circle, from t1 to t2 (none if they do not meet it).
    let [t1, t2] = [2, 2];
    if (a === 0) {
      if (c <= 0) [t1, t2] = [-1, 2];
    } else if (b * b - 4 * a * c > 0) {
      const s = Math.sqrt(b * b - 4 * a * c);
      [t1, t2] = [(-b - s) / (2 * a), (-b + s) / (2 * a)];
    }
    const [desde, hasta] = [Math.max(t1, 0), Math.min(t2, 1)];
    if (!(t1 < 1 && t2 > 0) || desde >= hasta) {
      if (!actual.length) actual.push(ax, ay);
      actual.push(bx, by);
      continue;
    }
    if (desde > 0) {
      if (!actual.length) actual.push(ax, ay);
      actual.push(ax + dx * desde, ay + dy * desde);
    }
    cerrar();
    if (hasta < 1) actual.push(ax + dx * hasta, ay + dy * hasta, bx, by);
  }
  cerrar();
  return piezas;
}

// Whether the eraser touches the line of a rectangle or an ellipse (its inside is empty paper).
function tocaElBorde(el, x, y, r) {
  const [x0, x1, y0, y1] = [Math.min(el.x1, el.x2), Math.max(el.x1, el.x2), Math.min(el.y1, el.y2), Math.max(el.y1, el.y2)];
  if (el.t === 'rect') return !(x > x0 + r && x < x1 - r && y > y0 + r && y < y1 - r);
  const [ra, rb] = [(x1 - x0) / 2, (y1 - y0) / 2];
  if (ra < r || rb < r) return true;
  return Math.abs(Math.hypot((x - (x0 + x1) / 2) / ra, (y - (y0 + y1) / 2) / rb) - 1) * Math.min(ra, rb) <= r;
}

// A line, a rectangle or an ellipse as the points of its line, so the eraser can cut it like a stroke.
function contorno(el) {
  if (el.t === 'linea') return [el.x1, el.y1, el.x2, el.y2];
  if (el.t === 'rect') return ([el.x1, el.y1, el.x2, el.y1, el.x2, el.y2, el.x1, el.y2, el.x1, el.y1]);
  const [cx, cy, ra, rb] = [(el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2, Math.abs(el.x2 - el.x1) / 2, Math.abs(el.y2 - el.y1) / 2];
  return Array.from({ length: 129 }, (_, i) => [cx + ra * Math.cos((i / 128) * 2 * Math.PI), cy + rb * Math.sin((i / 128) * 2 * Math.PI)]).flat();
}

/** The eraser at (x, y), like a real one: it takes only the part of the line under it, and what is left stays in pieces
 * (free hand, lines, rectangles and ellipses; the inside of a figure is empty paper). An arrow or a text goes whole. */
export function borrarCerca(datos, x, y, radio, origen) {
  const cambios = [];
  let nuevos = 0;
  for (const el of leerElementos(datos)) {
    if (!toca(el, x, y, radio)) continue;
    const r = radio + (el.g != null ? GROSORES[el.g] / 2 : 0);
    if ((el.t === 'rect' || el.t === 'elipse') && !tocaElBorde(el, x, y, r)) continue;
    if (el.t !== 'flecha' && el.t !== 'texto') {
      const p = el.t === 'trazo' ? el.p : contorno(el);
      let piezas = sinLoDelCirculo(p, x, y, r);
      // A closed figure cut once is one open line: the piece at its end goes on with the one at its start.
      const [primera, ultima] = [piezas[0], piezas.at(-1)];
      if ((el.t === 'rect' || el.t === 'elipse') && piezas.length > 1 && primera[0] === p[0] && primera[1] === p[1] && ultima.at(-2) === p.at(-2) && ultima.at(-1) === p.at(-1)) {
        piezas = [[...ultima, ...primera.slice(2)], ...piezas.slice(1, -1)];
      }
      nuevos += piezas.length;
      cambios.push([el, piezas]);
    } else {
      cambios.push([el, []]);
    }
  }
  if (!cambios.length) return false;
  const lugar = cuantos(datos) + nuevos - cambios.length <= MAX_ELEMENTOS;
  datos.doc.transact(() => {
    for (const [el, piezas] of cambios) {
      datos.delete(clave(el.id));
      if (!lugar) continue;
      for (const p of piezas) datos.set(clave(nuevoId()), { t: 'trazo', z: el.z, c: el.c, g: el.g, p: p.map((n) => Math.round(n * 10) / 10), ...(el.t !== 'trazo' || el.r ? { r: 1 } : {}) });
    }
  }, origen);
  return true;
}
