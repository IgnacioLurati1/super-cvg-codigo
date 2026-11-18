// A drawing of the table (Pizarra, Diagrama de flujo) made into a PNG for «Guardar en lo mío»: drawn here on a
// canvas, from what is in the tab, never from the screen. Nothing leaves the browser.

// The colors of the drawings (Pizarra, Diagrama de flujo): what goes in the tab is only their number, and each theme
// draws them its own way.
export const COLORES = ['var(--texto)', 'var(--materia-0)', 'var(--materia-1)', 'var(--materia-2)', 'var(--materia-3)', 'var(--materia-4)'];
export const NOMBRES_COLOR = ['Tinta', 'Color 2', 'Color 3', 'Color 4', 'Color 5', 'Color 6'];

export const MARGEN = 32;
export const MAX_LADO = 4000;

/**
 * The frame of the image around some boxes ([x0, y0, x1, y1] in the drawing's units), with a margin: where it starts,
 * its size in pixels and the scale (2 for a sharp image, less if a side would pass `maxLado`). null if there is nothing.
 */
export function marco(cajas, { margen = MARGEN, maxLado = MAX_LADO, escala = 2 } = {}) {
  const buenas = cajas.filter((c) => c.every(Number.isFinite));
  if (!buenas.length) return null;
  const x = Math.min(...buenas.map((c) => c[0])) - margen;
  const y = Math.min(...buenas.map((c) => c[1])) - margen;
  const ancho = Math.max(...buenas.map((c) => c[2])) + margen - x;
  const alto = Math.max(...buenas.map((c) => c[3])) + margen - y;
  const k = Math.min(escala, maxLado / Math.max(ancho, alto));
  return { x, y, k, ancho: Math.max(1, Math.round(ancho * k)), alto: Math.max(1, Math.round(alto * k)) };
}

export function crearLienzo(ancho, alto) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  return lienzo;
}

export const aPng = (lienzo) => new Promise((resolver, rechazar) => {
  lienzo.toBlob((b) => (b ? resolver(b) : rechazar(new Error('No se pudo armar la imagen'))), 'image/png');
});

/** The theme in use as the canvas needs it: the colors (CSS values like var(--texto)) and the font of the site. */
export function leerTema(dentro, valores) {
  const prueba = document.createElement('span');
  prueba.hidden = true;
  prueba.style.fontFamily = 'var(--fuente-ui)';
  dentro.append(prueba);
  const colores = valores.map((v) => {
    prueba.style.color = '';
    prueba.style.color = v;
    return getComputedStyle(prueba).color || '#000';
  });
  const fuente = getComputedStyle(prueba).fontFamily || 'sans-serif';
  prueba.remove();
  return { colores, fuente };
}
