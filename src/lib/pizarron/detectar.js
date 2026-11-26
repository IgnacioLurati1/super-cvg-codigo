// Where the board is in a photo, and whether it's green (chalk) or white (marker). It works on a small copy of the
// photo (LADO_DETECTAR on its long side): the writing, smoothed away, leaves the board as one patch of color that
// grows from the middle of the photo until it meets its frame. Its four corners come out of that patch.
// Pure functions over { data, width, height } with RGBA data, so they run the same in a worker and in the tests.

import { area } from './geometria.js';
import { bordesDe, lineasDe, mejorCuadro } from './bordes.js';

/** The long side of the copy the board is looked for in. */
export const LADO_DETECTAR = 320;

/** A median of each channel in a (2r+1)² window: thin strokes of chalk or marker go, edges of the board stay. */
function mediana(img, r) {
  const { data, width: W, height: H } = img;
  const out = new Uint8ClampedArray(W * H * 3);
  const n = (2 * r + 1) ** 2;
  const vent = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  const mitad = n >> 1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let i = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -r; dx <= r; dx++, i++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          const p = (yy * W + xx) * 4;
          vent[0][i] = data[p];
          vent[1][i] = data[p + 1];
          vent[2][i] = data[p + 2];
        }
      }
      const o = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) out[o + k] = vent[k].sort()[mitad];
    }
  }
  return out;
}

const luz = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Green or white, from the color of the board: green is green even when the light of the room makes it pale, and a
 * black one (cleaned the same way) is dark. Anything else is light with dark writing: a white board, gray or warm
 * under the lamps, or a projector's screen. `color` is [r, g, b].
 */
export function tipoDeColor([r, g, b]) {
  if (luz(r, g, b) < 90) return 'verde';
  return g - r > 8 && g - b > 4 ? 'verde' : 'blanco';
}

/** The color around a point of the photo (in fractions): the median of a box `r` of each side around it. */
function colorDe(liso, W, H, { x: cx, y: cy }, r = 0.2) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let y = Math.max(0, Math.floor(H * (cy - r))); y < Math.min(H, Math.ceil(H * (cy + r))); y++) {
    for (let x = Math.max(0, Math.floor(W * (cx - r))); x < Math.min(W, Math.ceil(W * (cx + r))); x++) {
      const o = (y * W + x) * 3;
      rs.push(liso[o]);
      gs.push(liso[o + 1]);
      bs.push(liso[o + 2]);
    }
  }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

const cajaVacia = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
const solapa = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) / Math.max(1, Math.min(a1 - a0, b1 - b0));

/**
 * A board in panels (two sheets one over the other, a sliding one, a rail or a line across): each panel is its own
 * patch of the same color. The big ones next to the patch, in line with it, join it.
 */
function sumarPanos(mancha, liso, semilla, lejos, W, H, cola) {
  const caja = cajaVacia();
  for (let i = 0; i < W * H; i++) {
    if (!mancha[i]) continue;
    const x = i % W;
    const y = (i / W) | 0;
    caja.x0 = Math.min(caja.x0, x);
    caja.x1 = Math.max(caja.x1, x + 1);
    caja.y0 = Math.min(caja.y0, y);
    caja.y1 = Math.max(caja.y1, y + 1);
  }
  const visto = new Uint8Array(W * H);
  const cerca = (i) => {
    const o = i * 3;
    return (liso[o] - semilla[0]) ** 2 + (liso[o + 1] - semilla[1]) ** 2 + (liso[o + 2] - semilla[2]) ** 2 < lejos * lejos;
  };
  for (let s = 0; s < W * H; s++) {
    if (mancha[s] || visto[s] || !cerca(s)) continue;
    const pano = cajaVacia();
    let cab = 0;
    let fin = 0;
    cola[fin++] = s;
    visto[s] = 1;
    while (cab < fin) {
      const i = cola[cab++];
      const x = i % W;
      const y = (i / W) | 0;
      pano.x0 = Math.min(pano.x0, x);
      pano.x1 = Math.max(pano.x1, x + 1);
      pano.y0 = Math.min(pano.y0, y);
      pano.y1 = Math.max(pano.y1, y + 1);
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
        if (j < 0 || visto[j] || mancha[j] || !cerca(j)) continue;
        visto[j] = 1;
        cola[fin++] = j;
      }
    }
    const grande = fin > 0.02 * W * H;
    const alLado = solapa(caja.y0, caja.y1, pano.y0, pano.y1) > 0.6 && Math.max(pano.x0 - caja.x1, caja.x0 - pano.x1) < 0.08 * W;
    const abajoOArriba = solapa(caja.x0, caja.x1, pano.x0, pano.x1) > 0.6 && Math.max(pano.y0 - caja.y1, caja.y0 - pano.y1) < 0.08 * H;
    if (grande && (alLado || abajoOArriba)) for (let k = 0; k < fin; k++) mancha[cola[k]] = 1;
  }
}

/** The minimum (or maximum) of a square window of side 2r+1, in two passes: erodes (or dilates) the patch. */
function filtrar(m, W, H, r, max) {
  const t = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  const pick = max ? (a, b) => a | b : (a, b) => a & b;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = max ? 0 : 1;
      for (let d = -r; d <= r; d++) v = pick(v, m[y * W + Math.min(W - 1, Math.max(0, x + d))]);
      t[y * W + x] = v;
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let v = max ? 0 : 1;
      for (let d = -r; d <= r; d++) v = pick(v, t[Math.min(H - 1, Math.max(0, y + d)) * W + x]);
      out[y * W + x] = v;
    }
  }
  return out;
}

const giro = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The convex hull of the patch (Andrew's monotone chain over the outer corners of each row's ends), clockwise on screen. */
function casco(mancha, W, H) {
  const pts = [];
  for (let y = 0; y < H; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < W; x++) {
      if (!mancha[y * W + x]) continue;
      if (a < 0) a = x;
      b = x;
    }
    // The outer corners of the pixels, so a board that fills the photo reaches its border.
    if (a >= 0) pts.push({ x: a, y }, { x: a, y: y + 1 }, { x: b + 1, y }, { x: b + 1, y: y + 1 });
  }
  if (pts.length < 3) return [];
  pts.sort((p, q) => p.x - q.x || p.y - q.y);
  const abajo = [];
  for (const p of pts) {
    while (abajo.length >= 2 && giro(abajo.at(-2), abajo.at(-1), p) <= 0) abajo.pop();
    abajo.push(p);
  }
  const arriba = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (arriba.length >= 2 && giro(arriba.at(-2), arriba.at(-1), p) <= 0) arriba.pop();
    arriba.push(p);
  }
  return abajo.slice(0, -1).concat(arriba.slice(0, -1));
}

/**
 * The four corners of the patch, clockwise from top left: the four points of its hull that close the biggest area.
 * A board is a quadrilateral, so they're its corners even when the patch is ragged along a side.
 */
function esquinasDe(mancha, W, H) {
  let c = casco(mancha, W, H);
  if (c.length < 4) return null;
  // At most 48 points: the search is n³ and a hull of a 320 px patch has a few hundred.
  if (c.length > 48) c = Array.from({ length: 48 }, (_, i) => c[Math.floor((i * c.length) / 48)]);
  const n = c.length;
  const tri = (a, b, d) => Math.abs(giro(c[a], c[b], c[d]));
  let mejor = null;
  let max = -1;
  for (let a = 0; a < n; a++) {
    for (let k = a + 2; k < n; k++) {
      let b1 = -1;
      let s1 = -1;
      for (let b = a + 1; b < k; b++) if (tri(a, b, k) > s1) (s1 = tri(a, b, k)), (b1 = b);
      let d1 = -1;
      let s2 = -1;
      for (let d = k + 1; d < n + a; d++) {
        const dd = d % n;
        if (dd === a) continue;
        if (tri(a, k, dd) > s2) (s2 = tri(a, k, dd)), (d1 = dd);
      }
      if (b1 >= 0 && d1 >= 0 && s1 + s2 > max) {
        max = s1 + s2;
        mejor = [a, b1, k, d1];
      }
    }
  }
  if (!mejor) return null;
  const q = mejor.map((i) => c[i]);
  // From top left (smallest x + y), clockwise on screen.
  const inicio = q.reduce((m, p, i) => (p.x + p.y < q[m].x + q[m].y ? i : m), 0);
  const orden = [0, 1, 2, 3].map((i) => q[(inicio + i) % 4]);
  return area(orden) < 0 ? [orden[0], orden[3], orden[2], orden[1]] : orden;
}

/** How far a pixel may be from the board's color: light changes along a board, so each is tried, from near to far. */
const LEJOS = { blanco: [40, 48, 56], verde: [44, 58, 72] };

/**
 * Whether a color can be a board's: green, black, or light and not too colored (white, gray, or a projector's bluish
 * white). Not the brown of hair, a jacket or a desk in front of it.
 */
export function pareceTablero([r, g, b]) {
  const l = luz(r, g, b);
  const max = Math.max(r, g, b);
  const sat = max ? (max - Math.min(r, g, b)) / max : 0;
  if (g - r > 8 && g - b > 4) return true;
  if (l < 70) return sat < 0.3;
  return l > 110 && sat < (l > 140 ? 0.5 : 0.3);
}

// Where the board is looked for, in order: the middle of the photo, and if what's there isn't a board's color (a head in
// front), a bit higher (boards hang over the seats) or to a side.
const SEMILLAS = [
  { x: 0.5, y: 0.5 },
  { x: 0.5, y: 0.3 },
  { x: 0.3, y: 0.35 },
  { x: 0.7, y: 0.35 },
  { x: 0.5, y: 0.7 },
];

/** The photo smoothed, the board's color and its kind: what every try at the patch starts from. */
export function prepararDeteccion(img) {
  const liso = mediana(img, 2);
  const { width: W, height: H } = img;
  let centro = SEMILLAS[0];
  let semilla = colorDe(liso, W, H, centro);
  for (const s of SEMILLAS) {
    const c = colorDe(liso, W, H, s, s === SEMILLAS[0] ? 0.2 : 0.1);
    if (!pareceTablero(c)) continue;
    centro = s;
    semilla = c;
    break;
  }
  return { liso, semilla, centro, tipo: tipoDeColor(semilla) };
}

/** The patch of the board in a small photo (1 board, 0 not), and whether it's green or white. */
export function manchaDe(img, base = prepararDeteccion(img), lejos = LEJOS[base.tipo][1]) {
  const { width: W, height: H } = img;
  const { liso, semilla, tipo, centro = SEMILLAS[0] } = base;
  // How far from its neighbor: a frame is a jump, a shadow is a slope.
  const salto = tipo === 'blanco' ? 14 : 16;
  const d2 = (o, c) => (liso[o] - c[0]) ** 2 + (liso[o + 1] - c[1]) ** 2 + (liso[o + 2] - c[2]) ** 2;
  const mancha = new Uint8Array(W * H);
  const cola = new Int32Array(W * H);
  let cab = 0;
  let fin = 0;
  for (let y = Math.max(0, Math.floor(H * (centro.y - 0.1))); y < Math.min(H, Math.ceil(H * (centro.y + 0.1))); y++) {
    for (let x = Math.max(0, Math.floor(W * (centro.x - 0.1))); x < Math.min(W, Math.ceil(W * (centro.x + 0.1))); x++) {
      const i = y * W + x;
      if (d2(i * 3, semilla) < lejos * lejos) {
        mancha[i] = 1;
        cola[fin++] = i;
      }
    }
  }
  while (cab < fin) {
    const i = cola[cab++];
    const x = i % W;
    const y = (i / W) | 0;
    const o = i * 3;
    const yo = [liso[o], liso[o + 1], liso[o + 2]];
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || mancha[j]) continue;
      const p = j * 3;
      if (d2(p, semilla) < lejos * lejos && d2(p, yo) < salto * salto) {
        mancha[j] = 1;
        cola[fin++] = j;
      }
    }
  }
  sumarPanos(mancha, liso, semilla, lejos, W, H, cola);
  // What the patch surrounds is board too (a word written big, a drawing): only what touches the border is outside.
  const fuera = new Uint8Array(W * H);
  cab = 0;
  fin = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!mancha[y * W + x] && !fuera[y * W + x]) (fuera[y * W + x] = 1), (cola[fin++] = y * W + x);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!mancha[y * W + x] && !fuera[y * W + x]) (fuera[y * W + x] = 1), (cola[fin++] = y * W + x);
  while (cab < fin) {
    const i = cola[cab++];
    const x = i % W;
    const y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || mancha[j] || fuera[j]) continue;
      fuera[j] = 1;
      cola[fin++] = j;
    }
  }
  for (let i = 0; i < W * H; i++) mancha[i] = fuera[i] ? 0 : 1;
  // Thin things that grew out of the board (its frame, a stand, a cable) go: they'd pull its corners out.
  const r = Math.max(1, Math.round(Math.max(W, H) / 160));
  const limpia = filtrar(filtrar(mancha, W, H, r, false), W, H, r, true);
  let cuantos = 0;
  for (let i = 0; i < W * H; i++) cuantos += limpia[i];
  return { tipo, mancha: limpia, cuantos };
}

/**
 * The board in a small photo. Returns { tipo, esquinas, seguro }: the corners in fractions of the photo (0 to 1), so
 * they're the same on the full photo; `seguro` is false when what was found doesn't look like a board (the corners are
 * then the whole photo, for the student to move).
 */
export function detectar(img) {
  const { width: W, height: H } = img;
  const base = prepararDeteccion(img);
  const buenos = [];
  for (const lejos of LEJOS[base.tipo]) {
    const { mancha, cuantos } = manchaDe(img, base, lejos);
    const esquinas = esquinasDe(mancha, W, H);
    if (!esquinas) continue;
    const cuadro = Math.abs(area(esquinas));
    // A board is most of what the four corners close, and a good part of the photo.
    if (cuadro > 0.12 * W * H && cuantos > 0.85 * cuadro) buenos.push({ esquinas, mancha, parte: cuadro / (W * H), lleno: cuantos / cuadro });
  }
  // Of those near the biggest, the one its patch fills best: a bigger one that fills less is the board's color spilling
  // onto the wall; a much smaller one is a piece of the board.
  const mayor = Math.max(0, ...buenos.map((b) => b.parte));
  const porColor = buenos.filter((b) => b.parte >= 0.7 * mayor).sort((a, b) => b.lleno - a.lleno)[0];
  // The straight edges close the board better: its frame is there under heads and next to a wall of its same color.
  // The patch says which of the quadrilaterals they close is the board.
  const bordes = bordesDe(base.liso, W, H);
  const porBordes = mejorCuadro(bordes, lineasDe(bordes), porColor?.mancha);
  let esquinas = null;
  // Without a patch, only a frame seen whole: stripes of a shelf or a curtain close a quadrilateral with the photo's border.
  const solo = (b) => b.lineal >= LINEAL_SOLO && b.enFoto <= 1;
  if (porBordes && porBordes.lineal >= LINEAL_MIN && (porColor ? porBordes.cubre >= CUBRE_MIN : solo(porBordes))) esquinas = porBordes.esquinas;
  else if (porColor) esquinas = porColor.esquinas;
  if (!esquinas) return { tipo: base.tipo, esquinas: TODA, seguro: false };
  return { tipo: tipoDeColor(colorDentro(base.liso, W, H, esquinas)), esquinas: esquinas.map(({ x, y }) => ({ x: x / W, y: y / H })), seguro: true };
}

// How much of its sides a quadrilateral of edges must have on real edges, and how well it must cover the patch of the
// board's color, to beat the patch's own corners.
const LINEAL_MIN = 0.5;
const CUBRE_MIN = 0.6;
const LINEAL_SOLO = 0.7;

/** The color of the board inside its corners (in pixels of the small photo): the median of a grid in its middle. */
function colorDentro(liso, W, H, [a, b, c, d]) {
  const rs = [];
  const gs = [];
  const bs = [];
  for (let v = 0.2; v <= 0.8; v += 0.05) {
    for (let u = 0.2; u <= 0.8; u += 0.05) {
      const arriba = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const abajo = { x: d.x + (c.x - d.x) * u, y: d.y + (c.y - d.y) * u };
      const x = Math.min(W - 1, Math.max(0, Math.round(arriba.x + (abajo.x - arriba.x) * v)));
      const y = Math.min(H - 1, Math.max(0, Math.round(arriba.y + (abajo.y - arriba.y) * v)));
      const o = (y * W + x) * 3;
      rs.push(liso[o]);
      gs.push(liso[o + 1]);
      bs.push(liso[o + 2]);
    }
  }
  const med = (t) => t.sort((p, q) => p - q)[t.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

/** The whole photo, in fractions: where the corners go when no board was found. */
export const TODA = Object.freeze([
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
]);
