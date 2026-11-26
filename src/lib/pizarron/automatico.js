// «Automático»: for each photo of a board, the way of cleaning it that comes out best. The board, straightened and
// small, is cleaned a few ways (limpiar.js) and each result is measured (medir). Faint chalk or marker (many specks for
// the writing it shows, much pale grey, or much more writing read stronger) goes stronger. Otherwise chalk goes
// «Remarcada» and marker as it is. Never Birome: on Ignacio's photos it always lost thin lines and filled letters and
// heads. Only numbers about the picture: nothing leaves the browser.

import { limpiar } from './limpiar';

/** The longer side of the board when choosing. */
export const LADO_ELEGIR = 800;

/**
 * How a cleaned board (on white) reads: { trazos, manchas, gris, sueltos, tinta }. `trazos`, the share of the picture in
 * long thin dark pieces (writing); `manchas`, in dark pieces too wide to be a stroke; `gris`, pale grey pixels;
 * `sueltos`, how many short dark pieces (specks); `tinta`, the share that is dark at all; `oscuro`, 1 on each dark pixel.
 */
export function medir({ data, width: W, height: H }) {
  const N = W * H;
  const oscuro = new Uint8Array(N);
  let gris = 0;
  for (let k = 0; k < N; k++) {
    const o = k * 4;
    const d = 255 - (0.3 * data[o] + 0.59 * data[o + 1] + 0.11 * data[o + 2]);
    if (d > 100) oscuro[k] = 1;
    else if (d > 25) gris++;
  }
  const lado = Math.max(W, H);
  const largo = Math.max(8, Math.round(lado / 40));
  // What's wider than a stroke: what's left of the dark after narrowing it and widening it back (an opening).
  const grueso = abrir(oscuro, W, H, Math.max(2, Math.round(lado / 200)));
  const visto = new Uint8Array(N);
  const pila = new Int32Array(N);
  let trazos = 0;
  let manchas = 0;
  let sueltos = 0;
  let tinta = 0;
  for (let inicio = 0; inicio < N; inicio++) {
    if (!oscuro[inicio] || visto[inicio]) continue;
    let arriba = 0;
    pila[arriba++] = inicio;
    visto[inicio] = 1;
    let area = 0;
    let anchos = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    while (arriba) {
      const k = pila[--arriba];
      const x = k % W;
      const y = (k - x) / W;
      area++;
      anchos += grueso[k];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const kk = yy * W + xx;
          if (oscuro[kk] && !visto[kk]) {
            visto[kk] = 1;
            pila[arriba++] = kk;
          }
        }
      }
    }
    tinta += area;
    if (Math.max(x1 - x0, y1 - y0) + 1 < largo / 2) sueltos++;
    else {
      manchas += anchos;
      trazos += area - anchos;
    }
  }
  return { trazos: trazos / N, manchas: manchas / N, gris: gris / N, sueltos, tinta: tinta / N, oscuro };
}

// A binary picture narrowed and widened back by `r` (a square), so only what's wider than 2r + 1 stays.
function abrir(a, W, H, r) {
  const pasar = (desde, hasta, mayor, horizontal) => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = mayor ? 0 : 1;
        for (let d = -r; d <= r; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          const dentro = xx >= 0 && yy >= 0 && xx < W && yy < H;
          const p = dentro ? desde[yy * W + xx] : 0;
          if (mayor ? p : !p) {
            v = mayor ? 1 : 0;
            break;
          }
        }
        hasta[y * W + x] = v;
      }
    }
  };
  const t = new Uint8Array(W * H);
  const u = new Uint8Array(W * H);
  pasar(a, t, false, true);
  pasar(t, u, false, false);
  pasar(u, t, true, true);
  pasar(t, u, true, false);
  return u;
}

/**
 * The way to clean this board: { tiza, intensidad, grosor }. `img`, the board straightened and small (some 800 px on
 * its longer side); `tipo`, 'verde' or 'blanco' (a white board's marker). Two small cleanings.
 */
export function elegir(img, tipo) {
  const N = img.width * img.height;
  const medida = (c) => medir(limpiar(img, tipo, 'hoja', { grosor: 0.5, ...c }));
  const comoEsta = medida({ tiza: 'como', intensidad: 0.5 });
  const fuerte = { tiza: 'remarcada', intensidad: 0.75, grosor: 0.5 };
  // Faint: many specks for the little writing it shows; much pale grey (dry marker, chalk wiped over: on Ignacio's
  // photos, a third more grey than writing only where it was faint); or much more writing read stronger.
  const puntos = (comoEsta.sueltos * 25) / N;
  if (puntos > 1.5 * comoEsta.trazos || comoEsta.gris > 1.3 * comoEsta.trazos || medida(fuerte).trazos > 2 * comoEsta.trazos + 0.002) {
    return fuerte;
  }
  // Chalk always reads better gone over; marker is already sharp (a slide, a screen, a white board).
  return { tiza: tipo === 'blanco' ? 'como' : 'remarcada', intensidad: 0.5, grosor: 0.5 };
}
