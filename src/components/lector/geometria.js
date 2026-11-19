// Where each page of the reader goes and what size it has. Pure, so it can be tested without a browser.

/** CSS pixels per PDF point: a page at 100 % is its printed size. */
export const PUNTO = 96 / 72;
/** The zoom steps of the buttons, in percent. */
export const PASOS = [25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
export const ESCALA_MIN = 0.25 * PUNTO;
export const ESCALA_MAX = 4 * PUNTO;
/** Space between pages and around them, in CSS pixels. */
export const ENTRE = 14;
export const BORDE = 16;

export const acotar = (escala) => Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escala));
export const porcentaje = (escala) => Math.round((escala / PUNTO) * 100);

/** The scale at which the widest page fills the width of the view. */
export function escalaAncho(tamanos, anchoVista, borde = BORDE) {
  const mayor = Math.max(1, ...tamanos.map(([w]) => w));
  return acotar((Math.max(120, anchoVista) - 2 * borde) / mayor);
}

/** The next step up (`dir` 1) or down (-1) from a scale. */
export function siguientePaso(escala, dir) {
  const actual = (escala / PUNTO) * 100;
  const paso = dir > 0 ? PASOS.find((p) => p > actual + 0.5) : [...PASOS].reverse().find((p) => p < actual - 0.5);
  return acotar(((paso ?? (dir > 0 ? PASOS.at(-1) : PASOS[0])) / 100) * PUNTO);
}

/** Every page with its place: { tops, izquierdas, anchos, altos, ancho, alto } in CSS pixels. `tamanos`: [w, h] of
 * each page in points. The pages go one under the other, centered, and the whole is at least as wide as the view.
 * `techo`: room left over the first page, for bars that float over the pages (a phone). */
export function armarLayout(tamanos, escala, anchoVista, borde = BORDE, techo = 0) {
  const anchos = tamanos.map(([w]) => Math.max(1, Math.round(w * escala)));
  const altos = tamanos.map(([, h]) => Math.max(1, Math.round(h * escala)));
  const ancho = Math.max(anchoVista, Math.max(0, ...anchos) + 2 * borde);
  const tops = [];
  let y = borde + techo;
  for (const alto of altos) {
    tops.push(y);
    y += alto + ENTRE;
  }
  const izquierdas = anchos.map((w) => Math.round((ancho - w) / 2));
  return { tops, izquierdas, anchos, altos, ancho, alto: y - ENTRE + borde };
}

/** The page (from 0) at a height of the whole. */
export function paginaEn(tops, y) {
  let bajo = 0;
  let alto = tops.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto + 1) >> 1;
    if (tops[medio] <= y) bajo = medio;
    else alto = medio - 1;
  }
  return Math.max(0, bajo);
}

/** The pages worth drawing (from 0, both ends included): the ones in view and `extra` views above and below. */
export function ventanaDe(layout, arriba, altoVista, extra = 1) {
  const n = layout.tops.length;
  if (!n) return [0, -1];
  const desde = paginaEn(layout.tops, arriba - extra * altoVista);
  const hasta = paginaEn(layout.tops, arriba + (1 + extra) * altoVista);
  return [desde, Math.min(n - 1, hasta)];
}

/** The page the student is reading: the one that crosses a line a third of the way down the view. */
export const paginaLeyendo = (layout, arriba, altoVista) => paginaEn(layout.tops, arriba + altoVista / 3);

/** Device pixels per CSS pixel for the drawing of a page `ancho` × `alto` CSS pixels: the screen's (`quiero`), or
 * fewer if that would pass `tope` pixels. */
export const densidadDe = (ancho, alto, quiero, tope) => (ancho * alto * quiero * quiero > tope ? Math.sqrt(tope / (ancho * alto)) : quiero);

/** The part of a page in view, in fractions of the page [x0, y0, x1, y1], with `margen` of the view's size around it;
 * null if none of the page is in view. `pagina` and `vista`: rectangles of the screen ({ left, top, right, bottom }). */
export function regionVisible(pagina, vista, margen = 0) {
  const ancho = pagina.right - pagina.left;
  const alto = pagina.bottom - pagina.top;
  if (ancho <= 0 || alto <= 0) return null;
  if (pagina.right <= vista.left || pagina.left >= vista.right || pagina.bottom <= vista.top || pagina.top >= vista.bottom) return null;
  const mx = (vista.right - vista.left) * margen;
  const my = (vista.bottom - vista.top) * margen;
  const x0 = Math.max(pagina.left, vista.left - mx);
  const x1 = Math.min(pagina.right, vista.right + mx);
  const y0 = Math.max(pagina.top, vista.top - my);
  const y1 = Math.min(pagina.bottom, vista.bottom + my);
  return [(x0 - pagina.left) / ancho, (y0 - pagina.top) / alto, (x1 - pagina.left) / ancho, (y1 - pagina.top) / alto];
}

/** Whether region `a` holds region `b` (both [x0, y0, x1, y1]). */
export const cubre = (a, b) => a[0] <= b[0] + 1e-3 && a[1] <= b[1] + 1e-3 && a[2] >= b[2] - 1e-3 && a[3] >= b[3] - 1e-3;

/** Boxes from 0 to 1 of the page, one per piece of a line, joined line by line: the pieces of one line that touch or
 * almost touch become one box. */
export function juntarCajas(cajas) {
  const orden = cajas
    .filter(([, , w, h]) => w > 0.0005 && h > 0.0005)
    .map((c) => [...c])
    .sort((a, b) => a[1] + a[3] / 2 - (b[1] + b[3] / 2) || a[0] - b[0]);
  const lineas = [];
  for (const c of orden) {
    const medio = c[1] + c[3] / 2;
    const linea = lineas.find((l) => Math.abs(l.medio - medio) < Math.min(l.alto, c[3]) / 2);
    if (linea) linea.cajas.push(c);
    else lineas.push({ medio, alto: c[3], cajas: [c] });
  }
  const salida = [];
  for (const l of lineas) {
    const piezas = l.cajas.sort((a, b) => a[0] - b[0]);
    let actual = null;
    for (const c of piezas) {
      if (actual && c[0] <= actual[0] + actual[2] + 0.012) {
        const derecha = Math.max(actual[0] + actual[2], c[0] + c[2]);
        const arriba = Math.min(actual[1], c[1]);
        const abajo = Math.max(actual[1] + actual[3], c[1] + c[3]);
        actual = [actual[0], arriba, derecha - actual[0], abajo - arriba];
      } else {
        if (actual) salida.push(actual);
        actual = c;
      }
    }
    if (actual) salida.push(actual);
  }
  const dentro = (n) => Math.min(1, Math.max(0, n));
  return salida.map(([x, y, w, h]) => {
    const x0 = dentro(x);
    const y0 = dentro(y);
    return [x0, y0, dentro(x + w) - x0, dentro(y + h) - y0];
  }).filter(([, , w, h]) => w > 0 && h > 0);
}

/** Whether a point of the page (from 0 to 1) falls on a box, with a little room around it. */
export const enCaja = ([px, py], [x, y, w, h], margen = 0.004) => px >= x - margen && px <= x + w + margen && py >= y - margen && py <= y + h + margen;
