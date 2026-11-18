import { getStroke } from 'perfect-freehand';
import { caja, GROSORES, TAMANOS } from '../../../lib/enVivo/pizarra';
import { aPng, COLORES, crearLienzo, leerTema, marco } from './lienzo';

// The shapes of the Pizarra, the same on screen (SVG) and in the image that is kept (canvas).

export { COLORES };

// A path of perfect-freehand is made once per element.
const caminos = new WeakMap();
export function caminoTrazo(el) {
  if (caminos.has(el)) return caminos.get(el);
  const puntos = [];
  for (let i = 0; i + 1 < el.p.length; i += 2) puntos.push([el.p[i], el.p[i + 1]]);
  const borde = getStroke(puntos, { size: GROSORES[el.g] * 2.2, thinning: 0.55, smoothing: 0.5, streamline: 0.45, simulatePressure: true });
  let d = '';
  if (borde.length) {
    d = `M${borde[0][0].toFixed(1)},${borde[0][1].toFixed(1)}Q`;
    for (let i = 0; i < borde.length; i += 1) {
      const [x0, y0] = borde[i];
      const [x1, y1] = borde[(i + 1) % borde.length];
      d += `${x0.toFixed(1)},${y0.toFixed(1)} ${((x0 + x1) / 2).toFixed(1)},${((y0 + y1) / 2).toFixed(1)} `;
    }
    d += 'Z';
  }
  caminos.set(el, d);
  return d;
}

export function punta(x1, y1, x2, y2, g) {
  const largo = 8 + GROSORES[g] * 2.2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a = (d) => `${(x2 - largo * Math.cos(ang + d)).toFixed(1)},${(y2 - largo * Math.sin(ang + d)).toFixed(1)}`;
  return `M${a(0.45)} L${x2},${y2} L${a(-0.45)}`;
}

function dibujar(ctx, el, color, fuente) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (el.t === 'trazo' && el.r) {
    ctx.lineWidth = GROSORES[el.g];
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i + 1 < el.p.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](el.p[i], el.p[i + 1]);
    ctx.stroke();
    return;
  }
  if (el.t === 'trazo') {
    ctx.fill(new Path2D(caminoTrazo(el)));
    return;
  }
  if (el.t === 'texto') {
    const tam = TAMANOS[el.tam];
    ctx.font = `600 ${tam}px ${fuente}`;
    ctx.textBaseline = 'alphabetic';
    el.s.split('\n').forEach((l, i) => ctx.fillText(l, el.x, el.y + i * tam * 1.25));
    return;
  }
  ctx.lineWidth = GROSORES[el.g];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const [x, y, w, h] = caja(el);
  if (el.t === 'rect') {
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 3);
    else ctx.rect(x, y, w, h);
    ctx.stroke();
  } else if (el.t === 'elipse') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.moveTo(el.x1, el.y1);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
    if (el.t === 'flecha') ctx.stroke(new Path2D(punta(el.x1, el.y1, el.x2, el.y2, el.g)));
  }
}

/**
 * The Pizarra as a PNG for «Guardar en lo mío»: every element on the sheet's color (the theme's), cut to what is drawn
 * with a margin. `dentro` is an element of the tool, to read the theme. null when the sheet is empty.
 */
export async function pizarraEnPng(elementos, dentro, nombre) {
  const m = marco(elementos.map((el) => {
    const [x, y, w, h] = caja(el);
    const borde = el.g != null ? GROSORES[el.g] * 2 : 4;
    return [x - borde, y - borde, x + w + borde, y + h + borde];
  }));
  if (!m) return null;
  const tema = leerTema(dentro, [...COLORES, 'var(--superficie)']);
  const fondo = tema.colores.pop();
  await document.fonts?.load?.(`600 18px ${tema.fuente}`).catch(() => {});
  const lienzo = crearLienzo(m.ancho, m.alto);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = fondo;
  ctx.fillRect(0, 0, m.ancho, m.alto);
  ctx.scale(m.k, m.k);
  ctx.translate(-m.x, -m.y);
  elementos.forEach((el) => dibujar(ctx, el, tema.colores[el.c] ?? tema.colores[0], tema.fuente));
  return { nombre, archivo: await aPng(lienzo) };
}
