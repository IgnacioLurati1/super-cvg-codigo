// What the finger's smart tools do on a cleaned board (limpiar.js). The pencil follows the chalk under the finger and
// draws it as thick as the board's strokes; the broom takes what isn't writing: pieces mostly wider than a stroke (a
// head, a chair, the board's frame) and specks far from the writing. Tried on Ignacio's photos (26/11): judging by how
// close a piece is to the rest alone took letters cut by the edge and left the heads, so width counts first.

const tope = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * The pieces of ink: pixels with `tinta` touching (8 ways). `id`, the piece of each pixel (-1 off ink); `lista`, each
 * piece's area `a`, box (x0, y0, x1, y1), longer side `L`, whether it touches the edge and how many pixels of its own
 * edge it has.
 */
export function piezas(tinta, W, H) {
  const N = W * H;
  const id = new Int32Array(N).fill(-1);
  const pila = new Int32Array(N);
  const lista = [];
  for (let i = 0; i < N; i++) {
    if (!tinta[i] || id[i] >= 0) continue;
    const n = lista.length;
    let arriba = 0;
    let a = 0;
    let borde = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    pila[arriba++] = i;
    id[i] = n;
    while (arriba) {
      const k = pila[--arriba];
      a++;
      const x = k % W;
      const y = (k - x) / W;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !tinta[k - 1] || !tinta[k + 1] || !tinta[k - W] || !tinta[k + W]) borde++;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const kk = yy * W + xx;
          if (tinta[kk] && id[kk] < 0) {
            id[kk] = n;
            pila[arriba++] = kk;
          }
        }
      }
    }
    const L = Math.max(x1 - x0, y1 - y0) + 1;
    lista.push({ a, x0, y0, x1, y1, L, borde, alBorde: x0 === 0 || y0 === 0 || x1 === W - 1 || y1 === H - 1 });
  }
  return { id, lista };
}

/**
 * How thick the board's strokes are, in pixels: for each piece longer than a letter's stroke, its area over half its
 * edge (a stroke's width); the middle one, so a head or a frame doesn't count.
 */
export function anchoTipico({ lista }, W, H) {
  const lado = Math.max(W, H);
  const anchos = lista
    .filter((p) => p.L > lado / 40 && p.borde)
    .map((p) => (2 * p.a) / p.borde)
    .sort((a, b) => a - b);
  return anchos.length ? anchos[Math.floor(anchos.length / 2)] : Math.max(2, lado / 400);
}

// A widening (`mayor`) or narrowing of 1/0 values, `r` pixels along each row or column, with a running count.
function pasada(desde, hasta, W, H, r, mayor, horizontal) {
  const largo = horizontal ? W : H;
  const lineas = horizontal ? H : W;
  for (let l = 0; l < lineas; l++) {
    const en = (i) => (horizontal ? l * W + i : i * W + l);
    let cuenta = 0;
    for (let i = 0; i < Math.min(r, largo); i++) cuenta += desde[en(i)];
    for (let i = 0; i < largo; i++) {
      if (i + r < largo) cuenta += desde[en(i + r)];
      if (i - r - 1 >= 0) cuenta -= desde[en(i - r - 1)];
      const ventana = Math.min(largo - 1, i + r) - Math.max(0, i - r) + 1;
      hasta[en(i)] = mayor ? (cuenta > 0 ? 1 : 0) : cuenta === ventana ? 1 : 0;
    }
  }
}

// What's wider than a square of 2r + 1: narrowed by `r` and widened back by `r + extra` (an opening, a bit generous).
function grueso(tinta, W, H, r, extra) {
  const t = new Uint8Array(W * H);
  const u = new Uint8Array(W * H);
  pasada(tinta, t, W, H, r, false, true);
  pasada(t, u, W, H, r, false, false);
  pasada(u, t, W, H, r + extra, true, true);
  pasada(t, u, W, H, r + extra, true, false);
  return u;
}

/**
 * What the broom takes, 1 on each pixel that goes, or null if nothing. `tinta`, 1 on each pixel of ink of the cleaned
 * board; `zona`, 1 where the broom went, or `todo` for the whole board (the same as going over all of it by hand). It
 * takes each piece mostly under it that is mostly wider than a stroke and big (a head, a chair, the board's frame), or
 * small with no writing close (dust). A letter stays, and so does a small piece with writing close (a «=», a «:», a
 * dot).
 */
export function aBarrer(tinta, W, H, { todo = false, zona = null, escritura = null } = {}) {
  if (!todo && !zona) return null;
  const N = W * H;
  const lado = Math.max(W, H);
  const pz = piezas(tinta, W, H);
  if (!pz.lista.length) return null;
  const ancho = anchoTipico(pz, W, H);
  const ancha = grueso(tinta, W, H, Math.max(2, Math.round(ancho * 1.5)), 2);
  const gruesos = new Float64Array(pz.lista.length);
  const tapados = new Float64Array(pz.lista.length);
  for (let k = 0; k < N; k++) {
    const i = pz.id[k];
    if (i < 0) continue;
    if (ancha[k]) gruesos[i]++;
    if (todo || zona[k]) tapados[i]++;
  }
  // The ink around each piece, close (as far as a letter is tall): a sum over boxes (an integral picture).
  const R = Math.round(lado / 40);
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) {
    let fila = 0;
    for (let x = 0; x < W; x++) {
      fila += tinta[y * W + x] ? 1 : 0;
      I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + fila;
    }
  }
  const suma = (x0, y0, x1, y1) => {
    const a = Math.max(0, x0);
    const b = Math.max(0, y0);
    const c = Math.min(W - 1, x1);
    const d = Math.min(H - 1, y1);
    return I[(d + 1) * (W + 1) + c + 1] - I[b * (W + 1) + c + 1] - I[(d + 1) * (W + 1) + a] + I[b * (W + 1) + a];
  };
  // A piece goes if it's a big wide thing (its wide part a twentieth of the board across, at least), or small with no
  // writing close. Blobs of chalk on a line (faint writing read in dots) are wide too, but small: they stay.
  const sale = pz.lista.map((p, i) => {
    if (tapados[i] / p.a < 0.5) return false;
    if (gruesos[i] >= 0.25 * p.a && gruesos[i] >= (lado / 20) ** 2 && (p.L >= lado / 10 || p.alBorde)) return true;
    // Small and alone: dust. A small piece with writing close (a «=», a «:», a dot) stays.
    if (p.L >= lado / 60) return false;
    return suma(p.x0 - R, p.y0 - R, p.x1 + R, p.y1 + R) - p.a < p.a;
  });
  if (!sale.some(Boolean)) return null;
  const m = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (pz.id[k] >= 0 && sale[pz.id[k]]) m[k] = 1;
  // With `escritura` (1 on the strokes «Arreglar todo» found): next to what goes, what has no writing in it and is bigger
  // than a letter goes too (an ear, a collar; a small letter next to a head stays).
  if (escritura) {
    const cerca = new Uint8Array(N);
    const t = new Uint8Array(N);
    const r = Math.round(lado / 30);
    pasada(m, t, W, H, r, true, true);
    pasada(t, cerca, W, H, r, true, false);
    const junto = new Float64Array(pz.lista.length);
    const escrita = new Uint8Array(pz.lista.length);
    for (let k = 0; k < N; k++) {
      const i = pz.id[k];
      if (i < 0) continue;
      if (cerca[k]) junto[i]++;
      if (escritura[k]) escrita[i] = 1;
    }
    for (let k = 0; k < N; k++) {
      const i = pz.id[k];
      const p = i >= 0 ? pz.lista[i] : null;
      if (p && !sale[i] && !escrita[i] && p.a >= (lado / 40) ** 2 && tapados[i] / p.a >= 0.5 && junto[i] >= 0.5 * p.a) m[k] = 1;
    }
  }
  // Its faint rim goes too (a pale edge that isn't ink): around it, as far as a stroke is thick, all but the writing.
  const r = Math.max(1, Math.round(ancho));
  const t = new Uint8Array(N);
  const cerca = new Uint8Array(N);
  pasada(m, t, W, H, r, true, true);
  pasada(t, cerca, W, H, r, true, false);
  for (let k = 0; k < N; k++) if (cerca[k] && !(pz.id[k] >= 0 && !sale[pz.id[k]])) m[k] = 1;
  return m;
}

/**
 * The centers of the thin strokes of `cuanto` (0 to 255, limpiar.js), faint ones too, for «Arreglar todo» to draw them
 * as the pencil does. A pixel is a center if it stands out from both sides, a stroke and a bit away (`ancho`, the typical
 * stroke width), across some direction, and is the highest across it: a head or a haze doesn't stand out from its sides.
 * Each run of centers is kept if it's longer than a speck, stands out as a stroke does (most of its height over its
 * sides) and is no wider than one; a faint run, only near writing, so the ghost of something erased far from the rest
 * stays faint. Returns, for each run, its points ({ k, w }: the pixel and the stroke's width there), or [].
 */
export function crestas(cuanto, W, H, ancho) {
  const N = W * H;
  const lado = Math.max(W, H);
  const rb = Math.max(1, Math.round(lado / 800));
  const b = Float32Array.from(cuanto);
  const tmp = new Float32Array(N);
  for (const horizontal of [true, false]) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let t = 0;
        let n = 0;
        for (let d = -rb; d <= rb; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          t += b[yy * W + xx];
          n++;
        }
        tmp[y * W + x] = t / n;
      }
    }
    b.set(tmp);
  }
  const en = (x, y) => {
    const xx = Math.round(x);
    const yy = Math.round(y);
    return xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : b[yy * W + xx];
  };
  const d = Math.max(2, Math.round(ancho * 1.2));
  const centro = new Uint8Array(N);
  const contraste = new Float32Array(N);
  const anchoEn = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const v = b[y * W + x];
      if (v < CRESTA.desde) continue;
      for (const [dx, dy] of CRUCES) {
        const lados = Math.max(en(x + dx * d, y + dy * d), en(x - dx * d, y - dy * d));
        const c = v - lados;
        if (c < CRESTA.contraste || en(x + dx, y + dy) > v || en(x - dx, y - dy) > v) continue;
        // Its width: how far across it stays over halfway between it and its sides (the blur widens it a bit), at most
        // a typical stroke.
        const mitad = (v + lados) / 2;
        let w = 1;
        for (const s of [1, -1]) for (let q = 1; q <= d && en(x + s * dx * q, y + s * dy * q) >= mitad; q++) w++;
        const k = y * W + x;
        centro[k] = 1;
        contraste[k] = c;
        anchoEn[k] = Math.min(ancho, Math.max(1.5, w - rb));
        break;
      }
    }
  }
  // Centers a couple of pixels apart are one run: a faint stroke breaks up in its weakest stretches.
  const junto = new Uint8Array(N);
  pasada(centro, junto, W, H, 2, true, true);
  const unido = new Uint8Array(N);
  pasada(junto, unido, W, H, 2, true, false);
  const pz = piezas(unido, W, H);
  const suma = pz.lista.map(() => ({ v: 0, c: 0, w: 0, n: 0 }));
  for (let k = 0; k < N; k++) {
    if (!centro[k]) continue;
    const s = suma[pz.id[k]];
    s.v += b[k];
    s.c += contraste[k];
    s.w += anchoEn[k];
    s.n++;
  }
  // 0 goes, 1 is faint and waits for writing close, 2 stays.
  const estado = pz.lista.map((p, i) => {
    const { v, c, w, n } = suma[i];
    if (p.L < lado / 50 || c / v < CRESTA.destaca || w / n > ancho * 1.25) return 0;
    return v / n >= CRESTA.segura ? 2 : 1;
  });
  // A faint run stays if it's within a fifteenth of the longer side of sure writing away from the edge (the board's
  // frame and what's cut by the photo don't count); then, twice more, a faint letter (not a line, not the faintest) as
  // close as two letters to one that stayed: a column of faint letters. A ghost further from the writing stays faint.
  const marca = new Uint8Array(N);
  const ancha = new Uint8Array(N);
  const sigue = estado.map((e) => e === 2);
  const letra = pz.lista.map((p, i) => p.L <= lado / 12 && suma[i].v / suma[i].n >= CRESTA.letra);
  for (const [vuelta, cerca] of [lado / 15, lado / 25, lado / 25].map((r, i) => [i, Math.round(r)])) {
    for (let k = 0; k < N; k++) marca[k] = centro[k] && sigue[pz.id[k]] && !pz.lista[pz.id[k]].alBorde ? 1 : 0;
    pasada(marca, ancha, W, H, cerca, true, true);
    pasada(ancha, marca, W, H, cerca, true, false);
    let sumo = false;
    for (let k = 0; k < N; k++) {
      const i = centro[k] && marca[k] ? pz.id[k] : -1;
      if (i >= 0 && estado[i] === 1 && !sigue[i] && (vuelta === 0 || letra[i])) {
        sigue[i] = true;
        sumo = true;
      }
    }
    if (!sumo) break;
  }
  // Each run as wide as it is on average, so it doesn't come out in beads.
  const corridas = sigue.map((s, i) => (s ? { w: suma[i].w / suma[i].n, puntos: [] } : null));
  for (let k = 0; k < N; k++) {
    const c = centro[k] ? corridas[pz.id[k]] : null;
    if (c) c.puntos.push(k);
  }
  return corridas.filter(Boolean).map(({ w, puntos }) => puntos.map((k) => ({ k, w })));
}
// Tried on Ignacio's photos (26/11), of 255: how strong a center has to be and how much more than its sides; how much
// of its height a run stands out on average (a stroke, most; the shading of a face, a third); from how strong it's sure,
// and how strong a faint letter has to be to join a column of them.
const CRESTA = { desde: 18, contraste: 12, destaca: 0.55, segura: 70, letra: 30 };
const CRUCES = [
  [1, 0],
  [0, 1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * Where the pencil found chalk. For each step along each stroke (`puntos` from 0 to 1, `r` its half width over the
 * longer side), the strongest chalk across the stroke within `r`, in `cuanto` (0 to 255, limpiar.js) a bit blurred: if
 * it stands out from the rest across, that's the stroke's center. `lineas`, runs of centers ({ x, y, de }: `de` the
 * pixel whose color it takes); `sinTiza`, the parts where it found none, as strokes to read stronger as before.
 */
export function seguirTiza(cuanto, W, H, repasos) {
  const lado = Math.max(W, H);
  const rb = Math.max(1, Math.round(lado / 800));
  // `cuanto` blurred over a square of 2rb + 1, so a stroke made of dots still has a center.
  const borrosa = Float32Array.from(cuanto);
  const tmp = new Float32Array(W * H);
  for (const horizontal of [true, false]) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let t = 0;
        let n = 0;
        for (let d = -rb; d <= rb; d++) {
          const xx = horizontal ? x + d : x;
          const yy = horizontal ? y : y + d;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          t += borrosa[yy * W + xx];
          n++;
        }
        tmp[y * W + x] = t / n;
      }
    }
    borrosa.set(tmp);
  }
  const en = (x, y) => {
    const xx = Math.round(x);
    const yy = Math.round(y);
    return xx < 0 || yy < 0 || xx >= W || yy >= H ? -1 : yy * W + xx;
  };
  const paso = Math.max(2, lado / 600);
  const lineas = [];
  const sinTiza = [];
  for (const repaso of repasos) {
    const crudos = repaso.puntos.map(([x, y]) => [x * W, y * H]);
    const r = Math.min(0.05, Math.max(0.002, Number(repaso.r) || 0.01)) * lado;
    // The finger's path, a step apart.
    const camino = [crudos[0]];
    for (let i = 1; i < crudos.length; i++) {
      const [ax, ay] = camino[camino.length - 1];
      const [bx, by] = crudos[i];
      const l = Math.hypot(bx - ax, by - ay);
      for (let t = paso; t <= l; t += paso) camino.push([ax + ((bx - ax) * t) / l, ay + ((by - ay) * t) / l]);
    }
    // Across each step, how much chalk there is at each distance from the finger, from -R to R.
    const R = Math.round(r);
    const ancho = 2 * R + 1;
    let normal = [0, 1];
    const normales = camino.map((_, i) => {
      const a = camino[Math.max(0, i - 2)];
      const b = camino[Math.min(camino.length - 1, i + 2)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l) normal = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      return normal;
    });
    const perfil = new Float32Array(camino.length * ancho);
    camino.forEach(([x, y], i) => {
      for (let j = 0; j < ancho; j++) {
        const k = en(x + normales[i][0] * (j - R), y + normales[i][1] * (j - R));
        perfil[i * ancho + j] = k < 0 ? 0 : borrosa[k];
      }
    });
    // The center follows the chalk without jumping to the stroke next to it: the path across the steps with the most
    // chalk, moving at most `salto` pixels a step and paying for each one.
    const salto = Math.max(1, Math.round(paso * 0.5));
    const puntaje = Float32Array.from(perfil);
    const desde = new Int32Array(perfil.length);
    for (let i = 1; i < camino.length; i++) {
      for (let j = 0; j < ancho; j++) {
        let mejor = -Infinity;
        for (let d = -salto; d <= salto; d++) {
          const jj = j + d;
          if (jj < 0 || jj >= ancho) continue;
          const v = puntaje[(i - 1) * ancho + jj] - 2 * Math.abs(d);
          if (v > mejor) {
            mejor = v;
            desde[i * ancho + j] = jj;
          }
        }
        puntaje[i * ancho + j] += mejor;
      }
    }
    const camino2 = new Int32Array(camino.length);
    let j = 0;
    const ultima = (camino.length - 1) * ancho;
    for (let q = 1; q < ancho; q++) if (puntaje[ultima + q] > puntaje[ultima + j]) j = q;
    for (let i = camino.length - 1; i >= 0; i--) {
      camino2[i] = j;
      j = desde[i * ancho + j];
    }
    // A step found chalk if its center stands out from the rest across.
    const centros = camino.map(([x, y], i) => {
      let menor = Infinity;
      for (let q = 0; q < ancho; q++) menor = Math.min(menor, perfil[i * ancho + q]);
      const v = perfil[i * ancho + camino2[i]];
      return v >= 25 && v - menor >= 15 ? { t: camino2[i] - R, nx: normales[i][0], ny: normales[i][1], x, y } : null;
    });
    // Short gaps (two steps) are crossed; each run of at least six steps is a line, its centers smoothed.
    for (let i = 0; i < centros.length; i++) {
      if (centros[i]) continue;
      const antes = centros[i - 1];
      let j = i;
      while (j < centros.length && !centros[j]) j++;
      if (antes && j < centros.length && j - i <= 2) for (let q = i; q < j; q++) centros[q] = { x: camino[q][0], y: camino[q][1], t: antes.t, nx: antes.nx, ny: antes.ny };
      i = j;
    }
    let corrida = [];
    let perdidos = [];
    const cerrar = () => {
      if (corrida.length >= 6) {
        const ts = corrida.map((c) => c.t);
        lineas.push(
          corrida.map((c, q) => {
            const vecinos = ts.slice(Math.max(0, q - 2), q + 3);
            const t = vecinos.reduce((a, b) => a + b, 0) / vecinos.length;
            const x = c.x + c.nx * t;
            const y = c.y + c.ny * t;
            return { x, y, de: Math.max(0, en(x, y)) };
          }),
        );
      } else perdidos.push(...corrida.map((c) => [c.x, c.y]));
      corrida = [];
    };
    centros.forEach((c, i) => {
      if (c) {
        if (perdidos.length) {
          sinTiza.push({ puntos: perdidos.map(([x, y]) => [x / W, y / H]), r: repaso.r });
          perdidos = [];
        }
        corrida.push(c);
      } else {
        cerrar();
        perdidos.push(camino[i]);
      }
    });
    cerrar();
    if (perdidos.length) sinTiza.push({ puntos: perdidos.map(([x, y]) => [x / W, y / H]), r: repaso.r });
  }
  return { lineas, sinTiza };
}

/**
 * The pencil's lines drawn on `fuerza` (0 to 1 on each pixel), `ancho` pixels thick with soft edges. Returns, for each
 * pixel drawn, the pixel whose color it takes (-1 where it didn't draw).
 */
export function pintarLineas(fuerza, lineas, W, H, ancho) {
  const de = new Int32Array(W * H).fill(-1);
  const h = Math.max(1, ancho / 2);
  for (const linea of lineas) {
    for (let i = 0; i < linea.length - 1; i++) {
      const a = linea[i];
      const b = linea[i + 1];
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - h - 1));
      const x1 = Math.min(W - 1, Math.ceil(Math.max(a.x, b.x) + h + 1));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - h - 1));
      const y1 = Math.min(H - 1, Math.ceil(Math.max(a.y, b.y) + h + 1));
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = l2 ? tope(((x - a.x) * dx + (y - a.y) * dy) / l2) : 0;
          const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
          const v = tope(h + 0.5 - d);
          if (!v) continue;
          const k = y * W + x;
          if (v > fuerza[k]) fuerza[k] = v;
          if (de[k] < 0) de[k] = t < 0.5 ? a.de : b.de;
        }
      }
    }
  }
  return de;
}
