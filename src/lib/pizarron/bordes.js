// The straight edges of a photo and the quadrilateral they close best. A board has a frame, a projector's screen a hard
// border: four straight lines that are there even when heads cover a piece, or when the wall around is as white as
// the board. The lines come from a Hough transform of the edges of the smoothed photo; each quadrilateral of two
// lines across and two up and down is scored by how much of its sides lie on real edges and how well it covers the
// patch of the board's color (detectar.js).

const GRADOS = 180;
const POR_LADO = 9;
const RAD = Math.PI / GRADOS;
const COS = Float64Array.from({ length: GRADOS }, (_, t) => Math.cos(t * RAD));
const SIN = Float64Array.from({ length: GRADOS }, (_, t) => Math.sin(t * RAD));

/** Edges of a smoothed RGB photo (3 bytes a pixel): strength and direction (Sobel on its light). */
export function bordesDe(liso, W, H) {
  const gris = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gris[i] = 0.299 * liso[i * 3] + 0.587 * liso[i * 3 + 1] + 0.114 * liso[i * 3 + 2];
  const fuerza = new Float32Array(W * H);
  const angulo = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = gris[i - W + 1] + 2 * gris[i + 1] + gris[i + W + 1] - gris[i - W - 1] - 2 * gris[i - 1] - gris[i + W - 1];
      const gy = gris[i + W - 1] + 2 * gris[i + W] + gris[i + W + 1] - gris[i - W - 1] - 2 * gris[i - W] - gris[i - W + 1];
      fuerza[i] = Math.hypot(gx, gy);
      angulo[i] = Math.atan2(gy, gx);
    }
  }
  // Strong: the top tenth of the photo's edges, and never a faint one.
  const muestra = [];
  for (let i = 0; i < W * H; i += 7) muestra.push(fuerza[i]);
  muestra.sort((a, b) => a - b);
  const umbral = Math.max(60, muestra[Math.floor(muestra.length * 0.9)] ?? 60);
  return { fuerza, angulo, umbral, W, H };
}

/**
 * The longest straight lines: { t (degrees of its normal, 0 to 179), r (distance from the corner), votos }. Each edge
 * votes only near its own direction, so the lines of writing (short, every way) don't add up.
 */
export function lineasDe({ fuerza, angulo, umbral, W, H }, cuantas = 24) {
  const D = Math.ceil(Math.hypot(W, H));
  const acc = new Uint16Array(GRADOS * (2 * D + 1));
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (fuerza[i] < umbral) continue;
      let t0 = Math.round(((angulo[i] / Math.PI) * 180 + 360) % 180);
      for (let d = -6; d <= 6; d++) {
        const t = (t0 + d + GRADOS) % GRADOS;
        const r = Math.round(x * COS[t] + y * SIN[t]) + D;
        acc[t * (2 * D + 1) + r]++;
      }
    }
  }
  const lineas = [];
  const minimo = Math.max(12, Math.round(0.12 * Math.min(W, H)));
  const ancho = 2 * D + 1;
  for (let t = 0; t < GRADOS; t++) {
    for (let r = 0; r < ancho; r++) {
      const v = acc[t * ancho + r];
      if (v < minimo) continue;
      // A peak: nothing bigger near it, in angle (wrapping at 180) or in distance.
      let pico = true;
      for (let dt = -4; dt <= 4 && pico; dt++) {
        const tt = (t + dt + GRADOS) % GRADOS;
        // Past 180 the line is the same one with the opposite distance.
        const vuelta = t + dt < 0 || t + dt >= GRADOS;
        for (let dr = -6; dr <= 6; dr++) {
          const rr = vuelta ? ancho - 1 - (r + dr) : r + dr;
          if (rr < 0 || rr >= ancho || (dt === 0 && dr === 0)) continue;
          const w = acc[tt * ancho + rr];
          if (w > v || (w === v && (dt < 0 || (dt === 0 && dr < 0)))) {
            pico = false;
            break;
          }
        }
      }
      if (pico) lineas.push({ t, r: r - D, votos: v });
    }
  }
  return lineas.sort((a, b) => b.votos - a.votos).slice(0, cuantas);
}

/** Where two lines cross, or null if they're parallel. */
export function cruce(a, b) {
  const det = COS[a.t] * SIN[b.t] - SIN[a.t] * COS[b.t];
  if (Math.abs(det) < 1e-6) return null;
  return { x: (a.r * SIN[b.t] - b.r * SIN[a.t]) / det, y: (b.r * COS[a.t] - a.r * COS[b.t]) / det };
}

/** How much of the segment p→q lies on a strong edge running its way (0 to 1). */
function apoyo({ fuerza, angulo, umbral, W, H }, p, q) {
  const largo = Math.hypot(q.x - p.x, q.y - p.y);
  const n = Math.max(8, Math.round(largo / 2));
  // The segment's normal: an edge along it has its gradient that way (either sense).
  const nx = -(q.y - p.y) / (largo || 1);
  const ny = (q.x - p.x) / (largo || 1);
  let si = 0;
  let dentro = 0;
  for (let k = 0; k <= n; k++) {
    const x0 = p.x + ((q.x - p.x) * k) / n;
    const y0 = p.y + ((q.y - p.y) * k) / n;
    if (x0 < 1 || y0 < 1 || x0 >= W - 1 || y0 >= H - 1) continue;
    dentro++;
    for (let d = -2; d <= 2; d++) {
      const x = Math.round(x0 + nx * d);
      const y = Math.round(y0 + ny * d);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (fuerza[i] < umbral * 0.6) continue;
      if (Math.abs(Math.cos(angulo[i]) * nx + Math.sin(angulo[i]) * ny) > 0.85) {
        si++;
        break;
      }
    }
  }
  return { parte: dentro ? si / dentro : 0, dentro: dentro / (n + 1) };
}

const enBorde = (p, q, W, H) => {
  const cerca = (a, b) => Math.abs(a - b) < 2.5;
  return (cerca(p.x, 0) && cerca(q.x, 0)) || (cerca(p.x, W) && cerca(q.x, W)) || (cerca(p.y, 0) && cerca(q.y, 0)) || (cerca(p.y, H) && cerca(q.y, H));
};

/**
 * The best quadrilateral of the lines, clockwise from top left in pixels of the small photo, or null. With its score
 * (`nota`, `lineal` and `cubre`, 0 to 1) and how many of its sides are the photo's own border (`enFoto`).
 * `mancha` (optional): the patch of the board's color, 1 board and 0 not.
 */
export function mejorCuadro(bordes, lineas, mancha = null) {
  const { W, H } = bordes;
  // The photo's own borders are lines too: a board that goes past the photo ends there.
  const todas = [...lineas, { t: 90, r: 0, borde: true }, { t: 90, r: H, borde: true }, { t: 0, r: 0, borde: true }, { t: 0, r: W, borde: true }];
  // Across: a normal near up-down (60° to 120°); up and down: near sideways (30° either way). A board seen from a
  // seat leans less than that; the diagonal edges of a shoulder or a desk lean more.
  // The strongest of each way (the list comes sorted by votes): the search grows with the fourth power of them.
  const cruzadas = todas.filter((l) => l.t >= 60 && l.t <= 120).filter((l, i, t) => l.borde || t.slice(0, i).filter((x) => !x.borde).length < POR_LADO);
  const paradas = todas.filter((l) => l.t <= 30 || l.t >= 150).filter((l, i, t) => l.borde || t.slice(0, i).filter((x) => !x.borde).length < POR_LADO);
  // Where each line is at the middle of the photo, to tell top from bottom and left from right.
  const alto = (l) => (l.r - (W / 2) * COS[l.t]) / (SIN[l.t] || 1e-6);
  const lado = (l) => (l.r - (H / 2) * SIN[l.t]) / (COS[l.t] || 1e-6);
  // A grid over the patch, to measure how well a quadrilateral covers it.
  const paso = Math.max(2, Math.round(Math.max(W, H) / 64));
  const puntos = [];
  let enMancha = 0;
  if (mancha) {
    for (let y = paso / 2; y < H; y += paso) {
      for (let x = paso / 2; x < W; x += paso) {
        const m = mancha[Math.floor(y) * W + Math.floor(x)];
        puntos.push({ x, y, m });
        enMancha += m;
      }
    }
  }
  let mejor = null;
  for (let a = 0; a < cruzadas.length; a++) {
    for (let b = 0; b < cruzadas.length; b++) {
      if (a === b || alto(cruzadas[a]) >= alto(cruzadas[b]) - H * 0.15) continue;
      for (let c = 0; c < paradas.length; c++) {
        for (let d = 0; d < paradas.length; d++) {
          if (c === d || lado(paradas[c]) >= lado(paradas[d]) - W * 0.15) continue;
          const arriba = cruzadas[a];
          const abajo = cruzadas[b];
          const izq = paradas[c];
          const der = paradas[d];
          const q = [cruce(arriba, izq), cruce(arriba, der), cruce(abajo, der), cruce(abajo, izq)];
          if (q.some((p) => !p || p.x < -0.1 * W || p.x > 1.1 * W || p.y < -0.1 * H || p.y > 1.1 * H)) continue;
          const area = Math.abs(areaDe(q));
          if (area < 0.08 * W * H || !convexo(q)) continue;
          // Corners just outside the photo come back to its border: the board goes on past it.
          const dentro = q.map((p) => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) }));
          let suma = 0;
          let enFoto = 0;
          for (let k = 0; k < 4; k++) {
            const p = dentro[k];
            const r = dentro[(k + 1) % 4];
            const borde = enBorde(p, r, W, H);
            enFoto += borde;
            suma += borde ? 0.45 : apoyo(bordes, p, r).parte;
          }
          const lineal = suma / 4;
          let cubre = 0.5;
          if (mancha && enMancha) {
            let ambos = 0;
            let enCuadro = 0;
            for (const p of puntos) {
              if (!adentro(dentro, p.x, p.y)) continue;
              enCuadro++;
              ambos += p.m;
            }
            const precision = enCuadro ? ambos / enCuadro : 0;
            const recuerdo = ambos / enMancha;
            cubre = precision + recuerdo ? (2 * precision * recuerdo) / (precision + recuerdo) : 0;
          }
          const nota = 0.55 * lineal + 0.45 * cubre + 0.05 * Math.sqrt(area / (W * H));
          if (!mejor || nota > mejor.nota) mejor = { esquinas: dentro, nota, lineal, cubre, enFoto };
        }
      }
    }
  }
  return mejor;
}

function areaDe(q) {
  let s = 0;
  for (let i = 0; i < 4; i++) s += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return s / 2;
}

function convexo(q) {
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
    if (!z) return false;
    if (!signo) signo = z;
    else if (z !== signo) return false;
  }
  return true;
}

function adentro(q, x, y) {
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const z = Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x));
    if (!z) continue;
    if (!signo) signo = z;
    else if (z !== signo) return false;
  }
  return true;
}
