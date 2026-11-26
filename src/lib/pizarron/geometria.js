// The geometry of a board photo: four corners, the homography that straightens them and the size of the straightened
// board. Pure functions, with points as { x, y } in pixels of whatever image they belong to.

/** Solves a linear system (n×n, in place) by Gaussian elimination with partial pivoting. Null when it's singular. */
function resolver(a, b) {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(a[f][c]) > Math.abs(a[p][c])) p = f;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[c], a[p]] = [a[p], a[c]];
    [b[c], b[p]] = [b[p], b[c]];
    for (let f = c + 1; f < n; f++) {
      const k = a[f][c] / a[c][c];
      for (let j = c; j < n; j++) a[f][j] -= k * a[c][j];
      b[f] -= k * b[c];
    }
  }
  const x = new Array(n);
  for (let f = n - 1; f >= 0; f--) {
    let s = b[f];
    for (let j = f + 1; j < n; j++) s -= a[f][j] * x[j];
    x[f] = s / a[f][f];
  }
  return x;
}

/** The homography (9 numbers, row by row) that takes each point of `de` to the same point of `a`. Null if they're degenerate. */
export function homografia(de, a) {
  const m = [];
  const v = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = de[i];
    const { x: u, y: w } = a[i];
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    v.push(u);
    m.push([0, 0, 0, x, y, 1, -w * x, -w * y]);
    v.push(w);
  }
  const h = resolver(m, v);
  return h ? [...h, 1] : null;
}

export const aplicar = (h, x, y) => {
  const d = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / d, y: (h[3] * x + h[4] * y + h[5]) / d };
};

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/** Twice the signed area of the polygon: positive when it goes clockwise on screen (y down). */
export function area(puntos) {
  let s = 0;
  for (let i = 0; i < puntos.length; i++) {
    const p = puntos[i];
    const q = puntos[(i + 1) % puntos.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/** A quadrilateral the photo can be straightened from: convex, not crossed and not flat. */
export function esConvexo(q) {
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (signo === 0) signo = Math.sign(z);
    else if (Math.sign(z) !== signo) return false;
  }
  return true;
}

/**
 * The size of the straightened board, in pixels: the longer of each pair of opposite sides, so nothing is lost, and
 * never more than `lado` on its long side (a phone's photo is 4000 px: twice what a board needs to be read).
 */
export function tamanoDerecho([si, sd, id, ii], lado = 2400) {
  let ancho = Math.max(dist(si, sd), dist(ii, id));
  let alto = Math.max(dist(si, ii), dist(sd, id));
  const k = Math.min(1, lado / Math.max(ancho, alto, 1));
  ancho = Math.max(1, Math.round(ancho * k));
  alto = Math.max(1, Math.round(alto * k));
  return { ancho, alto };
}

/**
 * The board straightened: each pixel of the result looks for its place in the photo (inverse mapping) and mixes the
 * four pixels around it. `foto` and the result are { data, width, height } with RGBA data.
 */
export function enderezar(foto, esquinas, { ancho, alto }) {
  const destino = [
    { x: 0, y: 0 },
    { x: ancho, y: 0 },
    { x: ancho, y: alto },
    { x: 0, y: alto },
  ];
  const h = homografia(destino, esquinas);
  const out = new Uint8ClampedArray(ancho * alto * 4);
  if (!h) return { data: out, width: ancho, height: alto };
  const { data, width: W, height: H } = foto;
  let o = 0;
  for (let y = 0; y < alto; y++) {
    const yy = y + 0.5;
    for (let x = 0; x < ancho; x++, o += 4) {
      const xx = x + 0.5;
      const d = h[6] * xx + h[7] * yy + h[8];
      let sx = (h[0] * xx + h[1] * yy + h[2]) / d - 0.5;
      let sy = (h[3] * xx + h[4] * yy + h[5]) / d - 0.5;
      if (sx < 0) sx = 0;
      else if (sx > W - 1) sx = W - 1;
      if (sy < 0) sy = 0;
      else if (sy > H - 1) sy = H - 1;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < W ? x0 + 1 : x0;
      const y1 = y0 + 1 < H ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const a = (y0 * W + x0) * 4;
      const b = (y0 * W + x1) * 4;
      const c = (y1 * W + x0) * 4;
      const e = (y1 * W + x1) * 4;
      for (let k = 0; k < 3; k++) {
        const arriba = data[a + k] + (data[b + k] - data[a + k]) * fx;
        const abajo = data[c + k] + (data[e + k] - data[c + k]) * fx;
        out[o + k] = arriba + (abajo - arriba) * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: ancho, height: alto };
}
