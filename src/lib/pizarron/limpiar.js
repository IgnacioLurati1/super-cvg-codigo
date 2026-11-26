// The straightened board, cleaned: the light of the room goes (shadows, the bright patch of a lamp, the wiped haze) and
// what's written stays, with its color. First the board without writing is guessed, block by block; each pixel is then
// read against it. Pure functions over { data, width, height } with RGBA data.

import { aBarrer, anchoTipico, crestas, piezas, pintarLineas, seguirTiza } from './dedo';

/** How a board can come out: on white paper, on its own color made even, or only straightened. */
export const MODOS = ['hoja', 'pizarron', 'original'];

const luz = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * The board without writing, one color per block: of each block's pixels, the ones at a given place in the order of
 * light. On a white board the writing is darker than the board, so its light pixels (`p` 0.85); on a green one the chalk
 * is lighter, so its darker ones (`p` 0.35).
 */
function fondoPorBloques(img, lado, p) {
  const { data, width: W, height: H } = img;
  const bx = Math.ceil(W / lado);
  const by = Math.ceil(H / lado);
  const fondo = new Float32Array(bx * by * 3);
  const cuenta = new Uint32Array(256);
  const suma = new Float64Array(256 * 3);
  for (let j = 0; j < by; j++) {
    for (let i = 0; i < bx; i++) {
      cuenta.fill(0);
      suma.fill(0);
      let n = 0;
      for (let y = j * lado; y < Math.min(H, (j + 1) * lado); y++) {
        for (let x = i * lado; x < Math.min(W, (i + 1) * lado); x++) {
          const o = (y * W + x) * 4;
          const l = luz(data[o], data[o + 1], data[o + 2]) | 0;
          cuenta[l]++;
          suma[l * 3] += data[o];
          suma[l * 3 + 1] += data[o + 1];
          suma[l * 3 + 2] += data[o + 2];
          n++;
        }
      }
      // The pixels around place p in the order of light (a tenth of the block), mixed.
      const desde = Math.floor(n * Math.max(0, p - 0.05));
      const hasta = Math.ceil(n * Math.min(1, p + 0.05));
      let visto = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let m = 0;
      for (let l = 0; l < 256 && visto < hasta; l++) {
        const c = cuenta[l];
        if (c && visto + c > desde) {
          const toma = Math.min(c, hasta - Math.max(visto, desde));
          r += (suma[l * 3] / c) * toma;
          g += (suma[l * 3 + 1] / c) * toma;
          b += (suma[l * 3 + 2] / c) * toma;
          m += toma;
        }
        visto += c;
      }
      const k = (j * bx + i) * 3;
      fondo[k] = m ? r / m : 0;
      fondo[k + 1] = m ? g / m : 0;
      fondo[k + 2] = m ? b / m : 0;
    }
  }
  return { fondo: suavizar(fondo, bx, by), bx, by };
}

/** Each block, the median of its 3×3 neighbors and then their mean: a block full of writing takes the color around it. */
function suavizar(f, bx, by) {
  const pasar = (src, fn) => {
    const out = new Float32Array(src.length);
    const v = [[], [], []];
    for (let j = 0; j < by; j++) {
      for (let i = 0; i < bx; i++) {
        v[0].length = v[1].length = v[2].length = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = Math.min(bx - 1, Math.max(0, i + di));
            const jj = Math.min(by - 1, Math.max(0, j + dj));
            for (let k = 0; k < 3; k++) v[k].push(src[(jj * bx + ii) * 3 + k]);
          }
        }
        for (let k = 0; k < 3; k++) out[(j * bx + i) * 3 + k] = fn(v[k]);
      }
    }
    return out;
  };
  const mediana = (a) => a.sort((p, q) => p - q)[4];
  const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  return pasar(pasar(pasar(f, mediana), media), media);
}

/** The board's color under pixel (x, y): the blocks' colors, mixed by distance to their centers. */
function fondoEn(fb, lado, x, y, out) {
  const { fondo, bx, by } = fb;
  const fx = Math.min(bx - 1, Math.max(0, (x + 0.5) / lado - 0.5));
  const fy = Math.min(by - 1, Math.max(0, (y + 0.5) / lado - 0.5));
  const i0 = fx | 0;
  const j0 = fy | 0;
  const i1 = Math.min(bx - 1, i0 + 1);
  const j1 = Math.min(by - 1, j0 + 1);
  const a = fx - i0;
  const b = fy - j0;
  for (let k = 0; k < 3; k++) {
    const p = fondo[(j0 * bx + i0) * 3 + k] * (1 - a) + fondo[(j0 * bx + i1) * 3 + k] * a;
    const q = fondo[(j1 * bx + i0) * 3 + k] * (1 - a) + fondo[(j1 * bx + i1) * 3 + k] * a;
    out[k] = p * (1 - b) + q * b;
  }
}

const tope = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const suave = (a, b, v) => {
  const t = tope((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** From hue (0 to 1), saturation and lightness to [r, g, b] (0 to 255). */
function hsl(h, s, l) {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

function tono(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return { h: 0, s: 0 };
  let h;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s: max ? d / max : 0 };
}

/** The ink of each written pixel on paper: chalk of a color keeps its color, white chalk is written in dark gray. */
const TINTA = [34, 38, 43];
// The board and white chalk of «Pizarrón».
const VERDE = [34, 72, 56];
const NEGRO = [32, 36, 38];
const TIZA = [246, 246, 240];

// One pass of a widening (`mayor`) or narrowing filter, `r` pixels along a row or a column. With `color`, each pixel
// takes the color of the one it took its value from.
function pasada(desde, hasta, W, H, r, mayor, horizontal, cDesde = null, cHasta = null) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      let mejor = desde[k];
      let de = k;
      for (let d = -r; d <= r; d++) {
        const xx = horizontal ? x + d : x;
        const yy = horizontal ? y : y + d;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const kk = yy * W + xx;
        const v = desde[kk];
        if (mayor ? v > mejor : v < mejor) {
          mejor = v;
          de = kk;
        }
      }
      hasta[k] = mejor;
      if (cHasta) {
        cHasta[k * 3] = cDesde[de * 3];
        cHasta[k * 3 + 1] = cDesde[de * 3 + 1];
        cHasta[k * 3 + 2] = cDesde[de * 3 + 2];
      }
    }
  }
}

// Widening or narrowing in both directions, `tmp` as scratch.
function filtro(a, tmp, W, H, r, mayor) {
  pasada(a, tmp, W, H, r, mayor, true);
  pasada(tmp, a, W, H, r, mayor, false);
}

/**
 * Chalk that came out as dots, joined back into strokes. `fuerza`, how much chalk is on each pixel (0 to 255), and
 * `color`, its color at full strength (RGB), are changed in place: widened and then narrowed again (a closing), a pixel
 * short, so strokes end a bit bolder, and a pixel that was board takes the color of the chalk that reached it. Then loose
 * specks of dust go. Faint chalk isn't lifted: tried on Ignacio's photos (26/11), it also lifted what had been erased.
 */
export function remarcar(fuerza, color, W, H) {
  const tmp = new Uint8Array(W * H);
  const radio = Math.max(2, Math.round(Math.max(W, H) / 700));
  const tinta = new Uint8Array(color.length);
  pasada(fuerza, tmp, W, H, radio, true, true, color, tinta);
  pasada(tmp, fuerza, W, H, radio, true, false, tinta, color);
  filtro(fuerza, tmp, W, H, radio - 1, false);
  // Specks narrower than any stroke now: narrowed and widened by one.
  filtro(fuerza, tmp, W, H, 1, false);
  filtro(fuerza, tmp, W, H, 1, true);
}

/**
 * Strokes as if drawn with a pen: only what touches chalk that's surely chalk stays (a speck or a haze that never gets
 * strong goes, however big), every stroke at full strength and its edges smoothed. Stronger `intensidad`, fainter chalk
 * counts as sure.
 */
export function aBirome(fuerza, W, H, intensidad = 0.5, grosor = 0.5) {
  const r = Math.max(1, Math.round(Math.max(W, H) / 900));
  const borrosa = (desde) => {
    const suma = Float32Array.from(desde);
    const tmp = new Float32Array(W * H);
    for (const horizontal of [true, false]) {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let t = 0;
          let n = 0;
          for (let d = -r; d <= r; d++) {
            const xx = horizontal ? x + d : x;
            const yy = horizontal ? y : y + d;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            t += suma[yy * W + xx];
            n++;
          }
          tmp[y * W + x] = t / n;
        }
      }
      suma.set(tmp);
    }
    return suma;
  };
  const suave1 = borrosa(fuerza);
  const seguro = 170 - (intensidad - 0.5) * 120;
  const alcanza = seguro * 0.5;
  // From each pixel that's surely chalk, everything above `alcanza` touching it.
  const tinta = new Uint8Array(W * H);
  const pila = new Int32Array(W * H);
  for (let inicio = 0; inicio < W * H; inicio++) {
    if (tinta[inicio] || suave1[inicio] < seguro) continue;
    let arriba = 0;
    pila[arriba++] = inicio;
    tinta[inicio] = 255;
    while (arriba) {
      const k = pila[--arriba];
      const x = k % W;
      const y = (k - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const kk = yy * W + xx;
          if (!tinta[kk] && suave1[kk] >= alcanza) {
            tinta[kk] = 255;
            pila[arriba++] = kk;
          }
        }
      }
    }
  }
  // `grosor` from 0 to 1: the strokes narrowed or widened, up to a fifth of a percent of the longer side each way.
  const paso = Math.round((Math.min(1, Math.max(0, grosor)) - 0.5) * 2 * Math.max(1, Math.round(Math.max(W, H) / 500)));
  if (paso) filtro(tinta, new Uint8Array(W * H), W, H, Math.abs(paso), paso > 0);
  const bordes = borrosa(tinta);
  for (let k = 0; k < W * H; k++) fuerza[k] = bordes[k];
}

// The finger's strokes that can be drawn: at most 200, each with up to 2000 points with numbers.
const trazables = (repasos) =>
  (Array.isArray(repasos) ? repasos.slice(0, 200) : [])
    .map((repaso) => ({ ...repaso, puntos: Array.isArray(repaso?.puntos) ? repaso.puntos.slice(0, 2000).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) : [] }))
    .filter((repaso) => repaso.puntos.length);

/**
 * Where the student went over the board with a finger, as a mask: 1 under a stroke. Each stroke: `puntos` ([x, y]
 * from 0 to 1 over the straightened board) and `r`, its half width over the longer side.
 */
export function mascaraDeRepasos(repasos, W, H) {
  if (!Array.isArray(repasos) || !repasos.length) return null;
  const m = new Uint8Array(W * H);
  const lado = Math.max(W, H);
  const marcar = (ax, ay, bx, by, r) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + r));
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
        const ex = ax + t * dx - x;
        const ey = ay + t * dy - y;
        if (ex * ex + ey * ey <= r * r) m[y * W + x] = 1;
      }
    }
  };
  for (const { puntos, ...repaso } of trazables(repasos)) {
    const r = Math.min(0.05, Math.max(0.002, Number(repaso?.r) || 0.01)) * lado;
    for (let i = 0; i < puntos.length; i++) {
      const a = puntos[i];
      const b = puntos[Math.min(puntos.length - 1, i + 1)];
      marcar(a[0] * W, a[1] * H, b[0] * W, b[1] * H, r);
    }
  }
  return m;
}

// What the broom takes is shown in this red before it goes.
const MARCA = [214, 40, 57];

/**
 * The last touches, on the cleaned picture `out` (its board, `base`): what the eraser went over goes; then what the
 * broom takes (dedo.js), from where it went (`barre`) or from the whole board (`barre` and `todo`). With `marcar`, the
 * last stroke is only being tried: what it would take shows in red (returns whether there was any).
 */
function terminar(out, W, H, base, lista, marcar, escritura = null) {
  const ultimo = marcar ? lista[lista.length - 1] : null;
  const hechos = ultimo ? lista.slice(0, -1) : lista;
  const borrado = mascaraDeRepasos(hechos.filter((r) => r?.borra), W, H);
  const pintar = (m, color) => {
    for (let k = 0, o = 0; k < W * H; k++, o += 4) if (m[k]) for (let c = 0; c < 3; c++) out[o + c] = color[c];
  };
  if (borrado) pintar(borrado, base);
  const barrer = (escobas) => {
    const zona = mascaraDeRepasos(escobas.filter((r) => !r.todo), W, H);
    const todo = escobas.some((r) => r.todo);
    if (!zona && !todo) return null;
    const tinta = new Uint8Array(W * H);
    for (let k = 0, o = 0; k < W * H; k++, o += 4) {
      if (Math.max(Math.abs(out[o] - base[0]), Math.abs(out[o + 1] - base[1]), Math.abs(out[o + 2] - base[2])) > 60) tinta[k] = 1;
    }
    return aBarrer(tinta, W, H, { todo, zona, escritura: escobas.some((r) => r.auto) ? escritura : null });
  };
  const barrido = barrer(hechos.filter((r) => r?.barre || r?.auto).map((r) => (r.auto ? { barre: true, todo: true, auto: true } : r)));
  if (barrido) pintar(barrido, base);
  if (ultimo?.barre) {
    const prueba = barrer([ultimo]);
    if (prueba) pintar(prueba, MARCA);
    return Boolean(prueba);
  }
  return false;
}

/**
 * How chalk comes out: as it is, its dots joined (remarcada), or as if drawn with a pen. Making faint strokes as strong
 * as the rest on their own was tried (26/11) and left out: on Ignacio's photos it took what had been erased for writing.
 */
export const TIZAS = ['como', 'remarcada', 'birome'];

/**
 * The board cleaned. `tipo` is 'blanco' or 'verde' (what detectar.js said or the student chose); `modo` one of MODOS.
 * Options: `tiza`, one of TIZAS (only on a chalk board); `intensidad`, from 0 to 1, how faint what counts as writing can
 * be (0.5, as it always was); `repasos`, where the student went over faint writing with a finger (mascaraDeRepasos):
 * there it counts as if `intensidad` were 1, and on a chalk board the chalk it finds is drawn over as thick as the board's
 * strokes (dedo.js) or, if it finds none, read stronger; a stroke with `borra` wipes what's under it instead, and one
 * with `barre` sweeps what isn't writing (with `todo`, on the whole board). `grosor`, from 0 to 1, how thick Birome
 * draws (0.5, as it came). `marcar`, the last stroke only tried: what it would sweep shows in red, and `marcados` says
 * whether there was any.
 * A white board always comes out on white: on its own color it's the same.
 */
export function limpiar(img, tipo, modo = 'hoja', { tiza: comoTiza = 'como', intensidad = 0.5, grosor = 0.5, repasos = null, marcar = false } = {}) {
  const { data, width: W, height: H } = img;
  const out = new Uint8ClampedArray(data.length);
  if (modo === 'original') {
    out.set(data);
    return { data: out, width: W, height: H };
  }
  const lado = Math.max(16, Math.round(Math.max(W, H) / 48));
  const fb = fondoPorBloques(img, lado, tipo === 'blanco' ? 0.85 : 0.35);
  const f = [0, 0, 0];
  const i = tope(Number.isFinite(intensidad) ? intensidad : 0.5);
  const lista = Array.isArray(repasos) ? repasos.filter((r) => r && typeof r === 'object') : [];
  const lapiz = trazables(lista.filter((r) => !r.borra && !r.barre && !r.auto));
  // «Arreglar todo» (a stroke with `auto`): every thin stroke is drawn, faint ones too, and the whole board is swept.
  const auto = lista.some((r) => r.auto);
  const blanco = tipo === 'blanco';
  // On a green board, how much chalk is on a pixel is how much lighter than the board it is; on a white one, how much
  // darker the marker is. The reference is what's surely writing (the far end of what's lighter, or darker): with it, a
  // faint stroke reads as faint, not as nothing. From there both boards go the same way.
  const subidas = [];
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      const o = (y * W + x) * 4;
      fondoEn(fb, lado, x, y, f);
      const d = (luz(data[o], data[o + 1], data[o + 2]) - luz(f[0], f[1], f[2])) * (blanco ? -1 : 1);
      if (d > 14) subidas.push(d);
    }
  }
  subidas.sort((a, b) => a - b);
  const tiza = Math.max(40, subidas[Math.floor(subidas.length * 0.9)] ?? 80);
  // The even board: the mean of its blocks.
  const parejo = [0, 0, 0];
  for (let i = 0; i < fb.fondo.length; i++) parejo[i % 3] += fb.fondo[i] / (fb.fondo.length / 3);
  // Green stays green and black stays black, both deep.
  const fondo = parejo[1] - parejo[0] > 6 ? VERDE : NEGRO;
  // First how much chalk is on each pixel and its color at full strength; then, remarked or not, the picture.
  const cuanto = new Uint8Array(W * H);
  const color = new Uint8Array(W * H * 3);
  for (let y = 0, o = 0, k = 0; y < H; y++) {
    for (let x = 0; x < W; x++, o += 4, k++) {
      fondoEn(fb, lado, x, y, f);
      cuanto[k] = 255 * tope(((luz(data[o], data[o + 1], data[o + 2]) - luz(f[0], f[1], f[2])) * (blanco ? -1 : 1)) / tiza);
      let h;
      let deColor;
      if (blanco) {
        // The marker's own color: each channel against the board's. Equal in all three, it's black marker. A dark blue
        // is far from equal only for how dark it is: how far apart the channels are, against how dark. A slide's dark gray
        // with a cast (0.1 apart, a fifth of how dark) stays black.
        const parte = [0, 1, 2].map((c) => tope(data[o + c] / Math.max(1, f[c])));
        const separados = Math.max(...parte) - Math.min(...parte);
        h = tono(parte[0], parte[1], parte[2]).h;
        deColor = separados > 0.12 && separados / Math.max(0.01, 1 - Math.min(...parte)) > 0.2;
      } else {
        // The chalk's own color: how far it rose towards white in each channel. Equal in all three, it's white chalk.
        const subida = [0, 1, 2].map((c) => tope((data[o + c] - f[c]) / Math.max(1, 255 - f[c])));
        const t = tono(subida[0], subida[1], subida[2]);
        h = t.h;
        deColor = t.s > 0.4 && Math.max(...subida) > 0.12;
      }
      // Bright chalk on a deep, even board (a pale board under the lamps comes out as dark as a new one), or ink on paper.
      const tinte = modo === 'pizarron' && !blanco ? (deColor ? hsl(h, 0.75, 0.72) : TIZA) : deColor ? hsl(h, 0.8, 0.4) : TINTA;
      color[k * 3] = tinte[0];
      color[k * 3 + 1] = tinte[1];
      color[k * 3 + 2] = tinte[2];
    }
  }
  // Where the pencil went, the chalk under it is followed; where it found none, the chalk is read stronger.
  const { lineas, sinTiza } = lapiz.length ? seguirTiza(cuanto, W, H, lapiz) : { lineas: [], sinTiza: [] };
  const mascara = mascaraDeRepasos(sinTiza, W, H);
  // «Arreglar todo» draws every thin stroke, faint ones too, as wide as it is, in the color most of it has.
  const trazos = [];
  const escritura = auto ? new Uint8Array(W * H) : null;
  let anchoTrazo = 0;
  if (auto) {
    const tinta = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) if (cuanto[k] >= 120) tinta[k] = 1;
    anchoTrazo = anchoTipico(piezas(tinta, W, H), W, H);
    for (const corrida of crestas(cuanto, W, H, anchoTrazo)) {
      const cuantas = new Map();
      for (const { k } of corrida) {
        const clave = `${color[k * 3]} ${color[k * 3 + 1]} ${color[k * 3 + 2]}`;
        cuantas.set(clave, [(cuantas.get(clave)?.[0] ?? 0) + 1, k]);
      }
      const [, de] = [...cuantas.values()].sort((a, b) => b[0] - a[0])[0];
      for (const { k, w } of corrida) {
        escritura[k] = 1;
        trazos.push({ k, h: w / 2, de });
      }
    }
  }
  if (mascara) for (let k = 0; k < W * H; k++) if (mascara[k]) cuanto[k] = Math.min(255, cuanto[k] * 2.5);
  if (comoTiza === 'remarcada' || comoTiza === 'birome') {
    remarcar(cuanto, color, W, H);
    if (comoTiza === 'birome') aBirome(cuanto, W, H, i, grosor);
  }
  const base = modo === 'pizarron' && !blanco ? fondo : [255, 255, 255];
  // Stronger, fainter chalk counts; 0.5 is how it always was.
  const limites = (j) => [0.12 + (0.5 - j) * 0.16, 0.8 + (0.5 - j) * 0.6];
  const [desde, hasta] = limites(i);
  const [desdeR, hastaR] = limites(1);
  const fuerza = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) fuerza[k] = mascara?.[k] ? suave(desdeR, hastaR, cuanto[k] / 255) : suave(desde, hasta, cuanto[k] / 255);
  // The pencil's lines, as thick as the strokes that came out, in the color of the chalk under them.
  let de = null;
  if (lineas.length) {
    const tinta = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) if (fuerza[k] > 0.5) tinta[k] = 1;
    // Each line in one color, the one most of its centers have: a speck of another color doesn't show in it.
    for (const linea of lineas) {
      const cuantas = new Map();
      for (const c of linea) {
        const clave = `${color[c.de * 3]} ${color[c.de * 3 + 1]} ${color[c.de * 3 + 2]}`;
        cuantas.set(clave, [(cuantas.get(clave)?.[0] ?? 0) + 1, c.de]);
      }
      const [, de] = [...cuantas.values()].sort((a, b) => b[0] - a[0])[0];
      for (const c of linea) c.de = de;
    }
    de = pintarLineas(fuerza, lineas, W, H, anchoTipico(piezas(tinta, W, H), W, H));
  }
  // Each center of «Arreglar todo», a dot as wide as its stroke with soft edges. What already came out dark stays as it
  // is; off it, only what's longer than a speck is drawn: the short spikes around a dot at the end of a line would come
  // out a star.
  if (trazos.length) {
    de ??= new Int32Array(W * H).fill(-1);
    const oscuro = new Uint8Array(W * H);
    for (let k = 0; k < W * H; k++) if (fuerza[k] >= 0.85) oscuro[k] = 1;
    filtro(oscuro, new Uint8Array(W * H), W, H, Math.max(1, Math.round(anchoTrazo / 2)), true);
    const claro = new Uint8Array(W * H);
    for (const { k } of trazos) if (!oscuro[k]) claro[k] = 1;
    const pz = piezas(claro, W, H);
    const largo = pz.lista.map((p) => p.L >= Math.max(W, H) / 50);
    for (const { k, h, de: q } of trazos) {
      if (!claro[k] || !largo[pz.id[k]]) continue;
      const cx = k % W;
      const cy = (k - cx) / W;
      const R = Math.ceil(h + 1);
      for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) {
        for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
          const v = tope(h + 0.5 - Math.hypot(x - cx, y - cy));
          const kk = y * W + x;
          if (v > fuerza[kk]) {
            fuerza[kk] = v;
            de[kk] = q;
          }
        }
      }
    }
  }
  for (let k = 0, o = 0; k < W * H; k++, o += 4) {
    const q = de && de[k] >= 0 ? de[k] : k;
    for (let c = 0; c < 3; c++) out[o + c] = base[c] + (color[q * 3 + c] - base[c]) * fuerza[k];
    out[o + 3] = 255;
  }
  const marcados = terminar(out, W, H, base, lista, marcar, escritura);
  return { data: out, width: W, height: H, marcados };
}
