// The painted sky of each theme, in high quality (fondo.js): drawn once per size and theme, never per frame. In CSS
// pixels, over a canvas that covers the window. What moves (stars that twinkle, petals, snow…) is particulas.js.
//
// Text sits on top of this outside the cards, so the dark themes stay dark where the text goes (bright things are small
// or go to the margins, beside the page's column), and the light ones stay light.

import { lienzo } from './particulas';
import { azar, crearRuido, css, entre01, mezcla } from './ruido';

// The page's column (as in base.css): what's beside it is free for the bright things.
const COLUMNA = 1016;
// «Alta» (pintarEscena): twice the resolution and one more octave of noise everywhere, then the extras of each theme
// and the finish (glow, vignette, grain).
let ALTA = false;
// The near rocks of «Infierno», for its extras: the lava runs only over them.
let ROCA = null;
const ruidoDe = (semilla) => {
  const n = crearRuido(semilla);
  return { ruido: n.ruido, capas: (x, y, k = 5) => n.capas(x, y, k + (ALTA ? 1 : 0)) };
};
export const margenLibre = (ancho) => Math.max(0, (ancho - COLUMNA) / 2);
const suave = (a, b, v) => {
  const t = entre01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function degradado(ctx, ancho, alto, paradas) {
  const g = ctx.createLinearGradient(0, 0, 0, alto);
  for (const [donde, color] of paradas) g.addColorStop(donde, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ancho, alto);
}

function luz(ctx, x, y, radio, color, alfa) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radio);
  g.addColorStop(0, css(color, alfa));
  g.addColorStop(1, css(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - radio, y - radio, radio * 2, radio * 2);
}

/** Paints `fn(x, y)` → [r, g, b, alpha 0..1] at a fraction of the size and stretches it, smooth: clouds, nebulas, mist. */
function textura(ctx, ancho, alto, fn, { escala = ALTA ? 2 : 4, desde = 0, hasta = 1, modo = 'source-over' } = {}) {
  const y0 = Math.floor(alto * desde);
  const altoParte = Math.ceil(alto * (hasta - desde));
  const w = Math.ceil(ancho / escala);
  const h = Math.ceil(altoParte / escala);
  const c = lienzo(w, h);
  const x = c.getContext('2d');
  const datos = x.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [r, g, b, a] = fn(i * escala, y0 + j * escala);
      const k = (j * w + i) * 4;
      datos.data[k] = r;
      datos.data[k + 1] = g;
      datos.data[k + 2] = b;
      datos.data[k + 3] = 255 * entre01(a);
    }
  }
  x.putImageData(datos, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = modo;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, y0, ancho, altoParte);
  ctx.restore();
}

// Dust of stars: many tiny ones, fewer bigger, and some with a halo and four rays. `banda`: the Milky Way, a diagonal
// where they gather.
function polvoDeEstrellas(ctx, ancho, alto, r, { cuantas = 1, hasta = 1, banda = false, tinte = [255, 255, 255] } = {}) {
  const total = Math.round(((ancho * alto) / 1100) * cuantas);
  for (let i = 0; i < total; i++) {
    let x = r() * ancho;
    let y = Math.pow(r(), 1.2) * alto * hasta;
    if (banda && r() < 0.45) {
      const t = r();
      x = t * ancho;
      y = alto * (0.85 - t * 0.7) + (r() + r() + r() - 1.5) * alto * 0.09;
    }
    const tam = Math.pow(r(), 3) * 1.3 + 0.35;
    ctx.fillStyle = css(mezcla(tinte, [255, 255, 255], r()), 0.25 + r() * 0.6);
    ctx.fillRect(x, y, tam, tam);
  }
  for (let i = 0; i < Math.round(total / 140); i++) {
    const x = r() * ancho;
    const y = Math.pow(r(), 1.2) * alto * hasta;
    const color = mezcla(tinte, [255, 255, 255], 0.5 + r() * 0.5);
    luz(ctx, x, y, 5 + r() * 7, color, 0.5);
    ctx.fillStyle = css([255, 255, 255], 0.95);
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + r() * 0.7, 0, Math.PI * 2);
    ctx.fill();
    if (r() < 0.3) {
      const largo = 8 + r() * 14;
      ctx.strokeStyle = css(color, 0.45);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x - largo, y);
      ctx.lineTo(x + largo, y);
      ctx.moveTo(x, y - largo);
      ctx.lineTo(x, y + largo);
      ctx.stroke();
    }
  }
}

function cosmico(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#120926'], [0.6, css(colores.fondo)], [1, '#07040f']]);
  const n = ruidoDe(11);
  const violeta = [168, 85, 247];
  const fucsia = [217, 70, 239];
  const azul = [99, 102, 241];
  // A nebula folded on itself (domain warping), tinted by another noise, with dark lanes of dust across it.
  textura(ctx, ancho, alto, (x, y) => {
    const u = x / 420;
    const v = y / 420;
    const q = n.capas(u, v, 4);
    const w = n.capas(u + 3.1 * q + 1.7, v + 3.1 * q - 4.2, 5);
    const tinte = n.capas(u * 0.6 + 9, v * 0.6 - 3, 3);
    const color = tinte < 0.5 ? mezcla(azul, violeta, tinte * 2) : mezcla(violeta, fucsia, (tinte - 0.5) * 2);
    const polvo = suave(0.55, 0.68, n.capas(u * 2.2 - 5, v * 2.2 + 2, 4));
    return [...color, suave(0.42, 0.78, w) * 0.5 * (1 - polvo * 0.75)];
  }, { modo: 'screen' });
  polvoDeEstrellas(ctx, ancho, alto, r, { banda: true, tinte: [233, 213, 255] });
}

function oscuro(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#060f1f'], [0.7, css(colores.fondo)], [1, css(colores.fondo)]]);
  polvoDeEstrellas(ctx, ancho, alto, r, { cuantas: 0.45, hasta: 0.7, tinte: [220, 230, 255] });
  // The moon, in the margin when there is room; small and faint when there isn't, so no text sits on a bright disc.
  const libre = margenLibre(ancho);
  const grande = libre > 170;
  const radio = grande ? Math.min(52, libre * 0.28) : 20;
  const mx = grande ? ancho - libre / 2 : ancho - 44;
  const my = grande ? alto * 0.16 : 92;
  const alfa = grande ? 1 : 0.4;
  luz(ctx, mx, my, radio * 7, [180, 200, 255], 0.13 * alfa);
  luz(ctx, mx, my, radio * 2.2, [220, 228, 255], 0.16 * alfa);
  const disco = ctx.createRadialGradient(mx - radio * 0.35, my - radio * 0.35, radio * 0.1, mx, my, radio);
  disco.addColorStop(0, css([250, 247, 236], alfa));
  disco.addColorStop(1, css([214, 210, 196], alfa));
  ctx.fillStyle = disco;
  ctx.beginPath();
  ctx.arc(mx, my, radio, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radio * 0.75;
    ctx.fillStyle = css([150, 148, 140], (0.18 + r() * 0.18) * alfa);
    ctx.beginPath();
    ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, radio * (0.06 + r() * 0.13), 0, Math.PI * 2);
    ctx.fill();
  }
  // Thin clouds lit by the moon.
  const n = ruidoDe(23);
  textura(ctx, ancho, alto, (x, y) => {
    const c = n.capas(x / 520, y / 140, 5);
    return [150, 168, 200, suave(0.55, 0.75, c) * 0.16 * suave(0.55, 0.15, y / alto)];
  });
  // The city below: buildings a little darker than the night, a few lit windows, and its glow.
  degradado(ctx, ancho, alto, [[0.7, 'rgb(255 170 90 / 0)'], [1, 'rgb(255 170 90 / 0.1)']]);
  let x = 0;
  while (x < ancho) {
    const w = 30 + r() * 70;
    const h = alto * (0.04 + Math.pow(r(), 2) * 0.13);
    ctx.fillStyle = '#050b16';
    ctx.fillRect(x, alto - h, w, h);
    for (let wy = alto - h + 6; wy < alto - 4; wy += 9) {
      for (let wx = x + 5; wx < x + w - 5; wx += 8) {
        if (r() < 0.16) {
          ctx.fillStyle = css([255, 200, 120], 0.2 + r() * 0.3);
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
    x += w + r() * 4;
  }
}

function claro(ctx, ancho, alto, colores) {
  degradado(ctx, ancho, alto, [[0, '#8fc2ee'], [0.45, '#cfe4f7'], [0.9, css(colores.fondo)], [1, css(colores.fondo)]]);
  luz(ctx, ancho * 0.92, -alto * 0.05, Math.max(ancho, alto) * 0.45, [255, 236, 170], 0.5);
  // High, thin clouds far away; the big ones are the moving ones (particulas.js).
  const n = ruidoDe(5);
  textura(ctx, ancho, alto, (x, y) => {
    const c = n.capas(x / 700, y / 110, 5);
    return [255, 255, 255, suave(0.5, 0.75, c) * 0.55 * suave(0.6, 0.1, y / alto)];
  });
}

// A branch that forks: thinner and shorter each time, blossoms at the ends.
function rama(ctx, r, x, y, angulo, largo, grosor, nivel, flores) {
  const x2 = x + Math.cos(angulo) * largo;
  const y2 = y + Math.sin(angulo) * largo;
  ctx.strokeStyle = '#14060f';
  ctx.lineWidth = grosor;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo((x + x2) / 2 + (r() - 0.5) * largo * 0.3, (y + y2) / 2 + (r() - 0.5) * largo * 0.3, x2, y2);
  ctx.stroke();
  if (nivel === 0 || largo < 14) {
    flores.push([x2, y2]);
    return;
  }
  const hijos = 2 + (r() < 0.35 ? 1 : 0);
  for (let i = 0; i < hijos; i++) {
    rama(ctx, r, x2, y2, angulo + (r() - 0.5) * 1.1, largo * (0.62 + r() * 0.18), grosor * 0.62, nivel - 1, flores);
  }
}

function rosa(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#1a0918'], [0.55, css(colores.fondo)], [0.85, '#3b1228'], [1, '#5a1c33']]);
  // The sun going down, half hidden, and the warm haze over it.
  luz(ctx, ancho * 0.68, alto * 1.02, Math.max(ancho, alto) * 0.6, [255, 128, 96], 0.3);
  luz(ctx, ancho * 0.68, alto * 1.02, alto * 0.16, [255, 170, 120], 0.35);
  luz(ctx, ancho * 0.1, 0, Math.max(ancho, alto) * 0.5, [194, 48, 110], 0.35);
  const n = ruidoDe(31);
  textura(ctx, ancho, alto, (x, y) => {
    const c = n.capas(x / 600, y / 90, 4);
    return [255, 120, 150, suave(0.55, 0.78, c) * 0.13 * suave(0.35, 0.85, y / alto)];
  });
  // Cherry branches from the top corners, kept inside the margins beside the page's column (on a phone, a corner).
  const libre = margenLibre(ancho);
  const borde = libre > 140 ? libre - 24 : 70;
  const largo = Math.max(22, Math.min(120, borde * 0.22));
  const flores = [];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, borde, libre > 140 ? alto : 110);
  ctx.rect(ancho - borde, 0, borde, libre > 140 ? alto : 110);
  ctx.clip();
  rama(ctx, r, -10, alto * 0.08, 0.35, largo, 9, 5, flores);
  rama(ctx, r, ancho + 10, alto * 0.04, Math.PI - 0.4, largo * 0.9, 8, 5, flores);
  for (const [fx, fy] of flores) {
    for (let i = 0; i < 4; i++) {
      const px = fx + (r() - 0.5) * 16;
      const py = fy + (r() - 0.5) * 16;
      const tono = mezcla([255, 183, 213], [255, 230, 240], r());
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + r();
        ctx.fillStyle = css(tono, 0.55 + r() * 0.2);
        ctx.beginPath();
        ctx.ellipse(px + Math.cos(a) * 2.6, py + Math.sin(a) * 2.6, 2.6, 1.7, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = css([255, 120, 160], 0.8);
      ctx.fillRect(px - 0.7, py - 0.7, 1.4, 1.4);
    }
  }
  ctx.restore();
}

// A row of pines: tiers of jagged triangles along the bottom.
function pinos(ctx, r, ancho, base, alturaMax, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, base, ancho, 2000);
  let x = -20;
  while (x < ancho + 20) {
    const h = alturaMax * (0.55 + r() * 0.45);
    const w = h * (0.32 + r() * 0.1);
    const pisos = 4;
    for (let p = 0; p < pisos; p++) {
      const arriba = base - h + (h / pisos) * p * 0.85;
      const abajo = arriba + (h / pisos) * 1.5;
      const ancho2 = w * (0.35 + (p / pisos) * 0.65);
      ctx.beginPath();
      ctx.moveTo(x, arriba);
      ctx.lineTo(x + ancho2 / 2 + (r() - 0.5) * 3, abajo);
      ctx.lineTo(x - ancho2 / 2 + (r() - 0.5) * 3, abajo);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - 1.5, base - h * 0.2, 3, h * 0.2);
    x += w * (0.45 + r() * 0.5);
  }
}

function bosque(ctx, ancho, alto, colores, r) {
  const fondo = colores.fondo;
  degradado(ctx, ancho, alto, [[0, '#020a06'], [0.6, css(fondo)], [1, css(fondo)]]);
  polvoDeEstrellas(ctx, ancho, alto, r, { cuantas: 0.25, hasta: 0.45, tinte: [210, 255, 220] });
  luz(ctx, ancho * 0.75, -alto * 0.1, Math.max(ancho, alto) * 0.55, [170, 255, 200], 0.12);
  const niebla = ruidoDe(41);
  const capaDeNiebla = (desde, hasta, alfa) =>
    textura(ctx, ancho, alto, (x, y) => [150, 200, 170, suave(0.4, 0.75, niebla.capas(x / 380, y / 70, 4)) * alfa], { desde, hasta });
  // Three rows, the far one paler and misty, the near one almost black.
  pinos(ctx, r, ancho, alto * 0.8, alto * 0.22, css(mezcla(fondo, [90, 130, 110], 0.28)));
  capaDeNiebla(0.62, 0.92, 0.18);
  pinos(ctx, r, ancho, alto * 0.9, alto * 0.2, css(mezcla(fondo, [60, 95, 75], 0.14)));
  capaDeNiebla(0.75, 1, 0.14);
  pinos(ctx, r, ancho, alto * 1.0, alto * 0.18, '#020604');
}

function cafe(ctx, ancho, alto, colores, r) {
  // The wood of a table: noise stretched along the grain, with its rings.
  const n = ruidoDe(53);
  const oscura = [22, 14, 9];
  const clara = [44, 29, 18];
  textura(ctx, ancho, alto, (x, y) => {
    const veta = n.capas(x / 900, y / 38, 4);
    const anillos = 0.5 + 0.5 * Math.sin(veta * 28);
    return [...mezcla(oscura, clara, anillos * 0.55 + n.ruido(x / 60, y / 8) * 0.2), 1];
  }, { escala: 3 });
  // The lamp from the top right.
  luz(ctx, ancho * 0.9, -alto * 0.08, Math.max(ancho, alto) * 0.6, [255, 190, 110], 0.26);
  luz(ctx, ancho * 0.9, -alto * 0.02, Math.max(ancho, alto) * 0.28, [255, 220, 160], 0.12);
  // Rings left by a cup: an irregular edge, darker where the coffee dried, in the margins when there is room.
  const libre = margenLibre(ancho);
  const anillo = (cx, cy, radio) => {
    const forma = ruidoDe(Math.floor(r() * 1e9));
    ctx.save();
    ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = css([120, 72, 36], [0.35, 0.18, 0.1][k]);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.05) {
        const rr = radio * (1 + (forma.capas(Math.cos(a) * 2 + 5, Math.sin(a) * 2 + 5, 3) - 0.5) * 0.12) + k * 2.5;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.fillStyle = css([120, 72, 36], 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const lado = libre > 150 ? libre / 2 : 60;
  anillo(lado, alto * 0.78, 64);
  anillo(lado + 34, alto * 0.72, 70);
  anillo(ancho - lado, alto * 0.5, 56);
  // A few beans, each with its crease and a gleam.
  for (let i = 0; i < 7; i++) {
    const bx = r() < 0.5 ? r() * Math.max(80, libre) : ancho - r() * Math.max(80, libre);
    const by = alto * (0.3 + r() * 0.65);
    const a = r() * Math.PI;
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(a);
    ctx.fillStyle = '#2b170b';
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#120904';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.quadraticCurveTo(0, 2, 7, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgb(255 220 170 / 0.18)';
    ctx.beginPath();
    ctx.ellipse(-2, -3, 4, 1.4, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function lavanda(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#dccbf6'], [0.5, '#efe6fb'], [1, css(colores.fondo)]]);
  luz(ctx, ancho * 0.85, alto * 0.05, Math.max(ancho, alto) * 0.4, [255, 228, 245], 0.75);
  const n = ruidoDe(61);
  textura(ctx, ancho, alto, (x, y) => [255, 255, 255, suave(0.52, 0.75, n.capas(x / 520, y / 120, 5)) * 0.6 * suave(0.6, 0.1, y / alto)]);
  // Two soft hills and, in front, the field: rows that run to the horizon, the buds smaller far away. Pale, so the
  // dark text keeps its contrast.
  const horizonte = alto * 0.7;
  for (const [base, color] of [[horizonte - 10, '#e3d8f1'], [horizonte, '#d8cbee']]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, alto);
    for (let x = 0; x <= ancho; x += 12) ctx.lineTo(x, base - Math.sin(x / ancho * Math.PI * 1.3 + base) * alto * 0.04 - n.ruido(x / 200, base) * 18);
    ctx.lineTo(ancho, alto);
    ctx.fill();
  }
  const fuga = [ancho * 0.5, horizonte - alto * 0.02];
  const filas = 16;
  for (let f = 0; f <= filas; f++) {
    const abajo = ancho * (-0.6 + (2.2 * f) / filas);
    for (let k = 0; k < 60; k++) {
      const t = Math.pow(k / 60, 1.8);
      const x = fuga[0] + (abajo - fuga[0]) * t + (r() - 0.5) * 6 * t;
      const y = fuga[1] + (alto - fuga[1]) * t;
      if (y < horizonte) continue;
      const tam = 0.6 + t * 4.5;
      ctx.fillStyle = css(mezcla([190, 160, 235], [205, 182, 240], r()), 0.5 + r() * 0.25);
      ctx.beginPath();
      ctx.ellipse(x, y - tam, tam * 0.45, tam, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Lavanda with Batman, always dark: the same field at night, under a crescent moon, the rows glowing faintly.
function lavandaNoche(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#0b0820'], [0.5, '#1b1340'], [1, css(colores.fondo)]]);
  polvoDeEstrellas(ctx, ancho, alto, r, { cuantas: 0.6, hasta: 0.6, tinte: [225, 210, 255] });
  luz(ctx, ancho * 0.5, alto * 0.72, Math.max(ancho, alto) * 0.45, [150, 100, 230], 0.18);
  // The crescent, in the right margin: a disc with another one taken out of it.
  const libre = margenLibre(ancho);
  const radio = libre > 170 ? Math.min(40, libre * 0.22) : 16;
  const mx = libre > 170 ? ancho - libre / 2 : ancho - 40;
  const my = libre > 170 ? alto * 0.15 : 90;
  luz(ctx, mx, my, radio * 6, [200, 180, 255], libre > 170 ? 0.18 : 0.08);
  const luna = lienzo(Math.ceil(radio * 2 + 4), Math.ceil(radio * 2 + 4));
  const l = luna.getContext('2d');
  l.fillStyle = libre > 170 ? '#f1eafc' : 'rgb(241 234 252 / 0.4)';
  l.beginPath();
  l.arc(radio + 2, radio + 2, radio, 0, Math.PI * 2);
  l.fill();
  l.globalCompositeOperation = 'destination-out';
  l.beginPath();
  l.arc(radio + 2 + radio * 0.45, radio + 2 - radio * 0.2, radio * 0.9, 0, Math.PI * 2);
  l.fill();
  ctx.drawImage(luna, mx - radio - 2, my - radio - 2);
  // Hills and the field, as by day but dark: the buds keep a little of their color.
  const n = ruidoDe(61);
  const horizonte = alto * 0.7;
  for (const [base, color] of [[horizonte - 10, '#1f1640'], [horizonte, '#171033']]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, alto);
    for (let x = 0; x <= ancho; x += 12) ctx.lineTo(x, base - Math.sin(x / ancho * Math.PI * 1.3 + base) * alto * 0.04 - n.ruido(x / 200, base) * 18);
    ctx.lineTo(ancho, alto);
    ctx.fill();
  }
  const fuga = [ancho * 0.5, horizonte - alto * 0.02];
  const filas = 16;
  for (let f = 0; f <= filas; f++) {
    const abajo = ancho * (-0.6 + (2.2 * f) / filas);
    for (let k = 0; k < 60; k++) {
      const t = Math.pow(k / 60, 1.8);
      const x = fuga[0] + (abajo - fuga[0]) * t + (r() - 0.5) * 6 * t;
      const y = fuga[1] + (alto - fuga[1]) * t;
      if (y < horizonte) continue;
      const tam = 0.6 + t * 4.5;
      ctx.fillStyle = css(mezcla([96, 66, 168], [132, 96, 205], r()), 0.45 + r() * 0.25);
      ctx.beginPath();
      ctx.ellipse(x, y - tam, tam * 0.45, tam, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function infierno(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#0a0201'], [0.55, css(colores.fondo)], [1, '#1c0503']]);
  // Fire rising from below: noise stretched upward, deep red to orange, never yellow where the text goes.
  const n = ruidoDe(71);
  textura(ctx, ancho, alto, (x, y) => {
    const altura = 1 - y / alto;
    const f = n.capas(x / 160, y / 260 + n.capas(x / 300, y / 300, 2) * 1.5, 5);
    const fuerza = suave(0.5, 0.0, altura) * suave(0.35, 0.75, f);
    return [...mezcla([150, 20, 6], [255, 96, 24], fuerza), fuerza * 0.55];
  }, { desde: 0.4, modo: 'screen' });
  luz(ctx, ancho * 0.5, alto * 1.1, Math.max(ancho, alto) * 0.55, [255, 80, 20], 0.25);
  // Rocks in silhouette, jagged.
  for (const [base, color, salto] of [[alto * 0.9, '#140403', 0.08], [alto * 0.97, '#070101', 0.06]]) {
    const roca = new Path2D();
    roca.moveTo(0, alto);
    for (let x = 0; x <= ancho + 30; x += 18 + r() * 30) roca.lineTo(x, base - Math.pow(r(), 2) * alto * salto);
    roca.lineTo(ancho, alto);
    roca.closePath();
    ctx.fillStyle = color;
    ctx.fill(roca);
    ROCA = roca;
  }
}

function glaciar(ctx, ancho, alto, colores, r) {
  degradado(ctx, ancho, alto, [[0, '#020910'], [0.65, css(colores.fondo)], [1, css(colores.fondo)]]);
  polvoDeEstrellas(ctx, ancho, alto, r, { cuantas: 0.5, hasta: 0.6, tinte: [210, 244, 255] });
  // The aurora: curtains of light, each column hanging from a wavy line, green below to violet above, added together and
  // softened by painting them small and stretching them.
  const n = ruidoDe(83);
  const ESCALA = 3;
  const w = Math.ceil(ancho / ESCALA);
  const h = Math.ceil(alto / ESCALA);
  const c = lienzo(w, h);
  const x2 = c.getContext('2d');
  x2.globalCompositeOperation = 'lighter';
  for (const [y0, amplitud, fuerza, fase] of [[0.2, 0.06, 0.2, 0], [0.3, 0.05, 0.14, 2.3], [0.12, 0.04, 0.12, 4.1]]) {
    for (let i = 0; i < w; i++) {
      const u = i / w;
      const borde = h * (y0 + Math.sin(u * 5 + fase) * amplitud + (n.capas(u * 3 + fase, fase, 3) - 0.5) * 0.08);
      const largo = h * (0.08 + n.capas(u * 14 + fase, 3, 3) * 0.2);
      const intensidad = fuerza * suave(0.3, 0.7, n.capas(u * 4 - fase, 7, 3));
      const g = x2.createLinearGradient(0, borde, 0, borde - largo);
      g.addColorStop(0, `rgb(60 255 180 / ${intensidad})`);
      g.addColorStop(0.4, `rgb(80 210 255 / ${intensidad * 0.6})`);
      g.addColorStop(1, 'rgb(150 120 255 / 0)');
      x2.fillStyle = g;
      x2.fillRect(i, borde - largo, 1, largo + 2);
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(c, 0, 0, ancho, alto);
  ctx.restore();
  // Mountains: a far range and a near one, dark, with snow lighter on the ridge.
  for (const [base, salto, color, nieve] of [[alto * 0.82, 0.16, mezcla(colores.fondo, [143, 179, 196], 0.12), 0.22], [alto * 0.93, 0.12, mezcla(colores.fondo, [0, 0, 0], 0.4), 0.14]]) {
    const puntos = [];
    let x = -20;
    let y = base;
    while (x < ancho + 40) {
      puntos.push([x, y]);
      x += 30 + r() * 60;
      y = base - (0.3 + r() * 0.7) * alto * salto * (0.5 + 0.5 * Math.sin(x / 300 + base));
    }
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(-20, alto);
    for (const [px, py] of puntos) ctx.lineTo(px, py);
    ctx.lineTo(ancho + 40, alto);
    ctx.fill();
    ctx.strokeStyle = css([220, 240, 250], nieve);
    ctx.lineWidth = 2;
    ctx.beginPath();
    puntos.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
  }
}

// ---------- «Alta»: the extras of each theme, painted over its sky, and the finish ----------

const CLAROS = ['claro', 'lavanda'];

// Long soft wedges of light from a point: sun rays through the air, moonlight between trees.
function rayos(ctx, x, y, cuantos, largo, color, alfa, r, desde = 0, hasta = Math.PI * 2) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < cuantos; i++) {
    const a = desde + (hasta - desde) * ((i + r() * 0.6) / cuantos);
    const abre = 0.025 + r() * 0.04;
    const g = ctx.createRadialGradient(x, y, 0, x, y, largo);
    g.addColorStop(0, css(color, alfa * (0.6 + r() * 0.4)));
    g.addColorStop(1, css(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, largo, a - abre, a + abre);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// A spiral galaxy: two arms of stars around a bright core, tilted.
function galaxia(ctx, cx, cy, radio, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.5);
  ctx.scale(1, 0.45);
  luz(ctx, 0, 0, radio * 0.9, [190, 170, 255], 0.22);
  luz(ctx, 0, 0, radio * 0.25, [255, 240, 220], 0.7);
  for (let brazo = 0; brazo < 2; brazo++) {
    for (let i = 0; i < 1400; i++) {
      const t = Math.pow(r(), 0.7);
      const a = t * Math.PI * 3.2 + brazo * Math.PI;
      const d = t * radio;
      const disperso = (r() + r() + r() - 1.5) * radio * 0.09 * (0.4 + t);
      const x = Math.cos(a) * d + disperso;
      const y = Math.sin(a) * d + (r() + r() - 1) * radio * 0.06;
      const color = mezcla([255, 236, 220], [170, 140, 255], t);
      ctx.fillStyle = css(color, 0.25 + r() * 0.5 * (1 - t * 0.5));
      ctx.fillRect(x, y, 1.1, 1.1);
    }
  }
  ctx.restore();
}

// A cup of coffee seen from above, on its saucer, with the crema and a gleam.
function taza(ctx, cx, cy, radio) {
  luz(ctx, cx + radio * 0.3, cy + radio * 0.4, radio * 2.2, [0, 0, 0], 0.5);
  ctx.fillStyle = '#cfc4b6';
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 1.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 1.38, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  ctx.fillStyle = '#e8e0d4';
  ctx.beginPath();
  ctx.ellipse(cx + radio * 1.2, cy + radio * 0.2, radio * 0.5, radio * 0.2, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe8dd';
  ctx.beginPath();
  ctx.arc(cx, cy, radio, 0, Math.PI * 2);
  ctx.fill();
  const crema = ctx.createRadialGradient(cx - radio * 0.2, cy - radio * 0.2, radio * 0.05, cx, cy, radio * 0.84);
  crema.addColorStop(0, '#c48a52');
  crema.addColorStop(0.55, '#8a5528');
  crema.addColorStop(1, '#3b200f');
  ctx.fillStyle = crema;
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 0.84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgb(255 245 230 / 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx - radio * 0.35, cy - radio * 0.4, radio * 0.28, radio * 0.09, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

const EXTRAS = {
  cosmico(ctx, ancho, alto, colores, r) {
    polvoDeEstrellas(ctx, ancho, alto, r, { cuantas: 0.7, banda: true, tinte: [210, 200, 255] });
    // The galaxy and a cluster of young blue stars, only in wide margins: on a phone they would sit behind the text.
    const libre = margenLibre(ancho);
    if (libre <= 200) return;
    galaxia(ctx, libre / 2, alto * 0.74, Math.min(170, libre * 0.42), r);
    const cx = ancho - libre / 2;
    for (let i = 0; i < 40; i++) {
      const x = cx + (r() + r() - 1) * 50;
      const y = alto * 0.22 + (r() + r() - 1) * 40;
      luz(ctx, x, y, 1.5 + r() * 2.5, [200, 220, 255], 0.75);
    }
  },
  oscuro(ctx, ancho, alto) {
    // The seas of the moon, and mist over the city lit from below.
    const libre = margenLibre(ancho);
    const grande = libre > 170;
    const radio = grande ? Math.min(52, libre * 0.28) : 20;
    const mx = grande ? ancho - libre / 2 : ancho - 44;
    const my = grande ? alto * 0.16 : 92;
    const n = ruidoDe(5);
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, radio, 0, Math.PI * 2);
    ctx.clip();
    textura(ctx, ancho, alto, (x, y) => {
      if (Math.hypot(x - mx, y - my) > radio + 4) return [0, 0, 0, 0];
      const m = n.capas(x / 14, y / 14, 4);
      return [120, 118, 112, suave(0.5, 0.7, m) * (grande ? 0.45 : 0.18)];
    }, { escala: 1, desde: Math.max(0, (my - radio - 4) / alto), hasta: Math.min(1, (my + radio + 4) / alto) });
    ctx.restore();
    textura(ctx, ancho, alto, (x, y) => [255, 180, 120, suave(0.45, 0.75, n.capas(x / 300, y / 40, 4)) * 0.08], { desde: 0.78 });
  },
  claro(ctx, ancho, alto, colores, r) {
    rayos(ctx, ancho * 0.92, -alto * 0.05, 14, Math.max(ancho, alto) * 1.1, [255, 248, 220], 0.12, r, Math.PI * 0.5, Math.PI * 1.05);
    // A few birds far away, in the margins.
    const libre = margenLibre(ancho);
    ctx.strokeStyle = 'rgb(40 60 80 / 0.5)';
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 7; i++) {
      const x = libre > 120 ? (i < 4 ? r() * libre : ancho - r() * libre) : r() * ancho;
      const y = alto * (0.08 + r() * 0.25);
      const w = 4 + r() * 4;
      ctx.beginPath();
      ctx.moveTo(x - w, y - w * 0.4);
      ctx.quadraticCurveTo(x - w * 0.4, y - w * 0.6, x, y);
      ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.6, x + w, y - w * 0.4);
      ctx.stroke();
    }
  },
  rosa(ctx, ancho, alto) {
    // Hills in front of the sun, the far one tinted by it.
    for (const [base, color, salto] of [[alto * 0.9, '#3a1028', 0.07], [alto * 0.96, '#1e0716', 0.05]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, alto);
      for (let x = 0; x <= ancho + 20; x += 20) ctx.lineTo(x, base - (Math.sin(x / 260 + base) * 0.5 + 0.5) * alto * salto);
      ctx.lineTo(ancho, alto);
      ctx.fill();
    }
  },
  bosque(ctx, ancho, alto, colores, r) {
    rayos(ctx, ancho * 0.78, -alto * 0.12, 9, Math.max(ancho, alto) * 1.2, [190, 255, 210], 0.07, r, Math.PI * 0.55, Math.PI * 0.85);
  },
  cafe(ctx, ancho, alto) {
    const libre = margenLibre(ancho);
    if (libre > 220) taza(ctx, ancho - libre / 2, alto * 0.8, Math.min(70, libre * 0.2));
  },
  lavanda(ctx, ancho, alto, colores, r) {
    rayos(ctx, ancho * 0.85, alto * 0.05, 12, Math.max(ancho, alto), [255, 236, 248], 0.16, r, Math.PI * 0.45, Math.PI * 1.1);
    // A lone tree on the hill, in the left margin.
    const libre = margenLibre(ancho);
    if (libre > 160) {
      const x = libre * 0.45;
      const y = alto * 0.68;
      ctx.fillStyle = '#a996cf';
      ctx.fillRect(x - 3, y - 60, 6, 62);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = css(mezcla([170, 150, 210], [196, 182, 230], r()), 0.85);
        ctx.beginPath();
        ctx.arc(x + (r() - 0.5) * 70, y - 70 + (r() - 0.5) * 40, 14 + r() * 14, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  lavandaNoche(ctx, ancho, alto, colores, r) {
    // The lone tree of the hill, a silhouette against the night.
    const libre = margenLibre(ancho);
    if (libre <= 160) return;
    const x = libre * 0.45;
    const y = alto * 0.68;
    ctx.fillStyle = '#0d0820';
    ctx.fillRect(x - 3, y - 60, 6, 62);
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.arc(x + (r() - 0.5) * 70, y - 70 + (r() - 0.5) * 40, 14 + r() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  infierno(ctx, ancho, alto) {
    // The fire behind lights the edge of the near rocks, and a lake of lava glows at their foot.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineJoin = 'round';
    if (ROCA) {
      ctx.clip(ROCA);
      for (const [grosor, alfa] of [[10, 0.12], [4, 0.22], [1.5, 0.4]]) {
        ctx.strokeStyle = css([255, 110, 30], alfa);
        ctx.lineWidth = grosor;
        ctx.stroke(ROCA);
      }
    }
    // The lake of lava below, where the rivers end.
    const g = ctx.createLinearGradient(0, alto * 0.985, 0, alto);
    g.addColorStop(0, css([255, 90, 20], 0));
    g.addColorStop(1, css([255, 110, 30], 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, alto * 0.985, ancho, alto * 0.015);
    ctx.restore();
    ROCA = null;
    const n = ruidoDe(9);
    textura(ctx, ancho, alto, (x, y) => [60, 40, 38, suave(0.5, 0.75, n.capas(x / 260, y / 180, 4)) * suave(0.5, 0.25, y / alto) * 0.22], { hasta: 0.5 });
  },
  glaciar(ctx, ancho, alto, colores, r) {
    // The lake at the foot of the mountains: a strip of dark ice that mirrors the aurora, broken in lines.
    const dpr = ctx.canvas.width / ancho;
    const lago = alto * 0.93;
    const copia = lienzo(ctx.canvas.width, ctx.canvas.height);
    copia.getContext('2d').drawImage(ctx.canvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, lago, ancho, alto - lago);
    ctx.clip();
    ctx.fillStyle = css(mezcla(colores.fondo, [0, 0, 0], 0.3));
    ctx.fillRect(0, lago, ancho, alto - lago);
    ctx.globalAlpha = 0.3;
    ctx.translate(0, lago * 2);
    ctx.scale(1, -1);
    ctx.drawImage(copia, 0, 0, copia.width, lago * dpr, 0, 0, ancho, lago);
    ctx.restore();
    ctx.fillStyle = css([200, 235, 255], 0.06);
    for (let y = lago + 3; y < alto; y += 3 + r() * 4) ctx.fillRect(r() * ancho * 0.3, y, ancho * (0.4 + r() * 0.5), 1);
  },
};

// The finish of «Alta»: what is bright glows a little, the corners go darker, and a fine grain so the gradients don't
// show steps. The glow needs `ctx.filter`; where the browser lacks it, it's left out.
function terminar(ctx, ancho, alto, claro) {
  const lienzoActual = ctx.canvas;
  if ('filter' in ctx) {
    const brillo = lienzo(lienzoActual.width, lienzoActual.height);
    const b = brillo.getContext('2d');
    const dpr = lienzoActual.width / ancho;
    b.filter = `brightness(${claro ? 0.8 : 0.6}) contrast(2.4) blur(${Math.round(14 * dpr)}px)`;
    b.drawImage(lienzoActual, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = claro ? 0.18 : 0.5;
    ctx.drawImage(brillo, 0, 0);
    ctx.restore();
  }
  const v = ctx.createRadialGradient(ancho / 2, alto * 0.45, Math.min(ancho, alto) * 0.35, ancho / 2, alto * 0.45, Math.max(ancho, alto) * 0.8);
  v.addColorStop(0, 'rgb(0 0 0 / 0)');
  v.addColorStop(1, claro ? 'rgb(60 40 100 / 0.1)' : 'rgb(0 0 0 / 0.26)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, ancho, alto);
  const grano = lienzo(128, 128);
  const g = grano.getContext('2d');
  const datos = g.createImageData(128, 128);
  const r = azar(77);
  for (let k = 0; k < datos.data.length; k += 4) {
    const v2 = 128 + (r() - 0.5) * 90;
    datos.data[k] = datos.data[k + 1] = datos.data[k + 2] = v2;
    datos.data[k + 3] = 255;
  }
  g.putImageData(datos, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.07;
  ctx.fillStyle = ctx.createPattern(grano, 'repeat');
  ctx.fillRect(0, 0, ancho, alto);
  ctx.restore();
}

const ESCENAS = { cosmico, oscuro, claro, rosa, bosque, cafe, lavanda, lavandaNoche, infierno, glaciar };

/** Paints the sky of `tema` over the whole canvas (CSS pixels). `colores`: { fondo: [r, g, b] } of the page now.
 * `calidad`: 'media', 'alta' or 'ultra' (painted as 'alta'; what lives over it is vida.js). */
export function pintarEscena(ctx, tema, ancho, alto, colores, calidad = 'media') {
  const pintar = ESCENAS[tema];
  if (!pintar) return false;
  ALTA = calidad === 'alta' || calidad === 'ultra';
  try {
    pintar(ctx, ancho, alto, colores, azar(97));
    if (ALTA) {
      EXTRAS[tema]?.(ctx, ancho, alto, colores, azar(131));
      terminar(ctx, ancho, alto, CLAROS.includes(tema));
    }
  } finally {
    ALTA = false;
  }
  return true;
}
