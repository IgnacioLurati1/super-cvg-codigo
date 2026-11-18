import { getSmoothStepPath, Position } from '@xyflow/react';
import { aPng, COLORES, crearLienzo, leerTema, marco } from './lienzo';

// The shapes of the Diagrama de flujo, the same on screen and in the image that is kept: where each arrow starts and
// ends, where its label goes, and the flowchart drawn on a canvas for «Guardar en lo mío».

export const POSICION = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
export const SESGO = Math.tan((16 * Math.PI) / 180); // how much an input or output shape leans
export const MEDIDA = { terminal: [120, 44], proceso: [140, 52], decision: [150, 92], datos: [150, 52], subproceso: [150, 52], conector: [40, 40] };
const PUNTO = 4.5; // React Flow's arrows end at the edge of the connection point, half of it outside the shape.

// The style (flujo.js): the colors are the Pizarra's, how thick each line is, and a filled shape takes this much of its
// color over the paper.
export { COLORES };
export const ANCHOS = [1.6, 2.6, 4];
export const TINTE = 14;

/** The dashes of a line of kind `l` and width `ancho` (for SVG and the canvas); null when it is continuous. The dots are
 * dashes of almost nothing with round ends. */
export function guiones(l, ancho) {
  if (l === 1) return [ancho * 3.5, ancho * 2.5];
  if (l === 2) return [0.01, ancho * 2.4];
  return null;
}

/** The arrowhead at `fin`, pointing into the side `ad` it reaches, as a path (the screen and the image draw the same). */
export function punta([x, y], ad, ancho = ANCHOS[0]) {
  const k = Math.max(1, ancho / ANCHOS[0]) ** 0.5;
  const [a, b] = [7.2 * k, 5.76 * k];
  const giro = { l: 0, t: Math.PI / 2, r: Math.PI, b: -Math.PI / 2 }[ad] ?? 0;
  const [c, s] = [Math.cos(giro), Math.sin(giro)];
  const p = (px, py) => `${(x + px * c - py * s).toFixed(2)},${(y + px * s + py * c).toFixed(2)}`;
  return `M${p(-a, -b)}L${p(0, 0)}L${p(-a, b)}Z`;
}

/** Where an arrow touches a side of a box [x, y, w, h]. */
export function punto([x, y, w, h], lado) {
  if (lado === 'l') return [x - PUNTO, y + h / 2];
  if (lado === 'r') return [x + w + PUNTO, y + h / 2];
  if (lado === 't') return [x + w / 2, y - PUNTO];
  return [x + w / 2, y + h + PUNTO];
}

/**
 * Where an arrow's label goes: next to where it leaves, as on paper («Sí» and «No» by the decision). The point is the
 * label's bottom corner: its left one, or its right one when the arrow leaves to the left.
 */
export function lugarEtiqueta(x, y, lado) {
  if (lado === 'l') return { x: x - 6, y: y - 3, derecha: true };
  if (lado === 'b') return { x: x + 6, y: y + 20, derecha: false };
  return { x: x + 6, y: y - 3, derecha: false };
}

// Two shapes almost in line (their middles a few pixels apart, as shapes of different widths end up) get a straight
// arrow, not one with a tiny step.
const CASI = 10;

export function caminoFlecha(desde, hasta, sd, ad) {
  const [sourceX, sourceY] = desde;
  let [targetX, targetY] = hasta;
  if (sd === 'b' && ad === 't' && Math.abs(targetX - sourceX) < CASI && targetY > sourceY) targetX = sourceX;
  if (sd === 'r' && ad === 'l' && Math.abs(targetY - sourceY) < CASI && targetX > sourceX) targetY = sourceY;
  return [getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition: POSICION[sd], targetPosition: POSICION[ad], borderRadius: 4, offset: 22 })[0], [targetX, targetY]];
}

const numerosDe = (camino) => (camino.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);

/** The lines of a text in a width, cut by words (and a long word by letters), as the screen wraps it. */
export function renglones(texto, ancho, medir) {
  const lineas = [];
  String(texto).split('\n').forEach((parrafo) => {
    let actual = '';
    parrafo.split(/\s+/).filter(Boolean).forEach((palabra) => {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (medir(prueba) <= ancho || !actual) {
        actual = prueba;
      } else {
        lineas.push(actual);
        actual = palabra;
      }
      while (medir(actual) > ancho && actual.length > 1) {
        let corte = actual.length - 1;
        while (corte > 1 && medir(actual.slice(0, corte)) > ancho) corte -= 1;
        lineas.push(actual.slice(0, corte));
        actual = actual.slice(corte);
      }
    });
    lineas.push(actual);
  });
  return lineas;
}

/** How it is drawn, without drawing it: each shape's box, each arrow's path and label, and the frame of the image. */
export function plano(fl, medidas, anchoTexto = (t) => t.length * 8) {
  const cajas = new Map(fl.nodos.map((n) => {
    const m = medidas.get(n.id);
    const [w, h] = m?.width > 0 && m?.height > 0 ? [m.width, m.height] : MEDIDA[n.t];
    return [n.id, [n.x, n.y, w, h]];
  }));
  const flechas = fl.flechas.flatMap((f) => {
    if (!cajas.has(f.de) || !cajas.has(f.a)) return [];
    const desde = punto(cajas.get(f.de), f.sd);
    const hasta = punto(cajas.get(f.a), f.ad);
    const [camino, fin] = caminoFlecha(desde, hasta, f.sd, f.ad);
    return [{ f, camino, fin, etiqueta: f.txt ? lugarEtiqueta(desde[0], desde[1], f.sd) : null }];
  });
  const limites = [
    ...fl.nodos.map((n) => {
      const [x, y, w, h] = cajas.get(n.id);
      const sesgo = n.t === 'datos' ? (h / 2) * SESGO : 0;
      return [x - sesgo, y, x + w + sesgo, y + h];
    }),
    ...flechas.map(({ camino }) => {
      const n = numerosDe(camino);
      const xs = n.filter((_, i) => i % 2 === 0);
      const ys = n.filter((_, i) => i % 2 === 1);
      return [Math.min(...xs) - 8, Math.min(...ys) - 8, Math.max(...xs) + 8, Math.max(...ys) + 8];
    }),
    ...flechas.filter((a) => a.etiqueta).map(({ f, etiqueta: e }) => {
      const w = anchoTexto(f.txt) + 6;
      return e.derecha ? [e.x - w, e.y - 22, e.x, e.y] : [e.x, e.y - 22, e.x + w, e.y];
    }),
  ];
  return { cajas, flechas, marco: marco(limites) };
}

function forma(ctx, t, [x, y, w, h]) {
  ctx.beginPath();
  if (t === 'terminal') {
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
    else ctx.rect(x, y, w, h);
  } else if (t === 'decision') {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w / 2, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
  } else if (t === 'datos') {
    const s = (h / 2) * SESGO;
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + w + s, y);
    ctx.lineTo(x + w - s, y + h);
    ctx.lineTo(x - s, y + h);
    ctx.closePath();
  } else if (t === 'conector') {
    ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
}

// How much room the text has inside each shape (the CSS's padding).
const HUECO = { terminal: 36, proceso: 24, decision: 0.5, datos: 40, subproceso: 44, conector: 8 };

export async function flujoEnPng(fl, medidas, dentro, nombre) {
  const tema = leerTema(dentro, [...COLORES, 'var(--superficie)']);
  const fondo = tema.colores.pop();
  const [tinta] = tema.colores;
  const colorDe = (c) => tema.colores[c ?? 0] ?? tinta;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const letra = `500 ${0.95 * rem}px ${tema.fuente}`;
  const letraEtiqueta = `600 ${0.85 * rem}px ${tema.fuente}`;
  await document.fonts?.load?.(letra).catch(() => {});
  const medir = crearLienzo(1, 1).getContext('2d');
  medir.font = letraEtiqueta;
  const p = plano(fl, medidas, (t) => medir.measureText(t).width);
  if (!p.marco) return null;
  const { x, y, k, ancho, alto } = p.marco;
  const lienzo = crearLienzo(ancho, alto);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.scale(k, k);
  ctx.translate(-x, -y);
  ctx.strokeStyle = tinta;
  ctx.lineJoin = 'round';

  p.flechas.forEach(({ camino, fin, f }) => {
    const ancho = ANCHOS[f.g ?? 0];
    const color = colorDe(f.c);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = ancho;
    ctx.setLineDash(guiones(f.l, ancho) ?? []);
    if (f.l === 2) ctx.lineCap = 'round';
    ctx.stroke(new Path2D(camino));
    ctx.restore();
    // The arrowhead, pointing into the side it reaches, always whole.
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.44;
    const cabeza = new Path2D(punta(fin, f.ad, ancho));
    ctx.fill(cabeza);
    ctx.stroke(cabeza);
    ctx.restore();
  });

  ctx.font = letra;
  const medirNodo = (t) => ctx.measureText(t).width;
  fl.nodos.forEach((n) => {
    const caja = p.cajas.get(n.id);
    const [nx, ny, w, h] = caja;
    const ancho = ANCHOS[n.g ?? 0];
    ctx.save();
    ctx.strokeStyle = colorDe(n.c);
    ctx.lineWidth = ancho;
    ctx.setLineDash(guiones(n.l, ancho) ?? []);
    if (n.l === 2) ctx.lineCap = 'round';
    forma(ctx, n.t, caja);
    ctx.fillStyle = fondo;
    ctx.fill();
    if (n.r) {
      ctx.globalAlpha = TINTE / 100;
      ctx.fillStyle = colorDe(n.c);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
    if (n.t === 'subproceso') {
      ctx.beginPath();
      ctx.moveTo(nx + 10, ny);
      ctx.lineTo(nx + 10, ny + h);
      ctx.moveTo(nx + w - 10, ny);
      ctx.lineTo(nx + w - 10, ny + h);
      ctx.stroke();
    }
    ctx.restore();
    const libre = HUECO[n.t] < 1 ? w * HUECO[n.t] : w - HUECO[n.t];
    const lineas = n.txt ? renglones(n.txt, Math.max(libre, 12), medirNodo) : [];
    const alto = 0.95 * rem * 1.3;
    ctx.fillStyle = tinta;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lineas.forEach((l, i) => ctx.fillText(l, nx + w / 2, ny + h / 2 + (i - (lineas.length - 1) / 2) * alto));
  });

  ctx.font = letraEtiqueta;
  ctx.textBaseline = 'bottom';
  p.flechas.filter((a) => a.etiqueta).forEach(({ f, etiqueta: e }) => {
    const w = ctx.measureText(f.txt).width + 6;
    const h = 0.85 * rem * 1.3;
    ctx.fillStyle = fondo;
    ctx.fillRect(e.derecha ? e.x - w : e.x, e.y - h, w, h);
    ctx.fillStyle = tinta;
    ctx.textAlign = e.derecha ? 'right' : 'left';
    ctx.fillText(f.txt, e.derecha ? e.x - 3 : e.x + 3, e.y - 1);
  });

  return { nombre, archivo: await aPng(lienzo) };
}
