import { useEffect } from 'react';

// Something dragged near the top or the bottom of the screen takes the page that way by itself, faster the nearer the
// edge: a section by its handle (useArrastreDeSecciones.js) or a card, a file of the computer or anything else dragged
// over a page that receives it (useDesplazarAlArrastrar).

// How near the edge it starts, and how many pixels a frame at most.
export const BORDE = 72;
export const TOPE = 24;
// The page has no smooth scroll of its own: `auto` jumps.
const YA = { behavior: 'auto' };
// The browser repeats `dragover` while the pointer stays still, at least every 350 ms: past this, the drag is over.
const SIN_NOTICIAS = 1000;

/** The fixed header covers the top of the page: the edge starts under it. */
export const altoCabecera = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--alto-cabecera')) || 0;

/**
 * Pixels for this frame at position `pos` (the pointer's, in the screen): negative goes up, positive goes down, 0 away
 * from the edges. `desde` and `hasta`: the part of the screen the page shows. Past an edge (over the header, or out of
 * the window), full speed. Pure, so it can be tested alone.
 */
export function velocidad(pos, desde, hasta, borde = BORDE, tope = TOPE) {
  const zona = Math.min(borde, (hasta - desde) / 4);
  if (!(zona > 0) || !Number.isFinite(pos)) return 0;
  let cerca = 0;
  if (pos < desde + zona) cerca = pos - (desde + zona);
  else if (pos > hasta - zona) cerca = pos - (hasta - zona);
  if (!cerca) return 0;
  const fuerza = Math.min(1, Math.abs(cerca) / zona);
  return Math.sign(cerca) * Math.max(1, Math.round(tope * fuerza * fuerza));
}

/** One frame of the page going by itself, with the pointer at `y`. Returns whether it moved. */
export function desplazarHacia(y) {
  const v = velocidad(y, altoCabecera(), window.innerHeight);
  if (!v) return false;
  window.scrollBy({ top: v, ...YA });
  return true;
}

/** While the page is mounted, anything dragged over it (cards, Classroom items, files of the computer) near the top or
 * the bottom of the screen takes it that way. It stops when the drag ends, leaves the window or stays without news. */
export function useDesplazarAlArrastrar() {
  useEffect(() => {
    let y = null;
    let ultimo = 0;
    let cuadro = 0;
    const paso = () => {
      cuadro = 0;
      if (y === null || performance.now() - ultimo > SIN_NOTICIAS) return;
      desplazarHacia(y);
      cuadro = requestAnimationFrame(paso);
    };
    const sobre = (e) => {
      y = e.clientY;
      ultimo = performance.now();
      if (!cuadro) cuadro = requestAnimationFrame(paso);
    };
    const parar = () => {
      y = null;
      cancelAnimationFrame(cuadro);
      cuadro = 0;
    };
    // Out of the window there is nothing under the pointer: it stops until it comes back.
    const dejar = (e) => {
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) parar();
    };
    document.addEventListener('dragover', sobre);
    document.addEventListener('dragleave', dejar);
    document.addEventListener('drop', parar);
    document.addEventListener('dragend', parar);
    return () => {
      document.removeEventListener('dragover', sobre);
      document.removeEventListener('dragleave', dejar);
      document.removeEventListener('drop', parar);
      document.removeEventListener('dragend', parar);
      parar();
    };
  }, []);
}
