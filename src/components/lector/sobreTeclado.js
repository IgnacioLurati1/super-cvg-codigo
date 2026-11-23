import { useLayoutEffect } from 'react';

// A sheet at the foot of the reader on a phone (the bubble of a highlight, writing its note). The phone's keyboard covers
// the bottom of the screen without making the page shorter, so the sheet would stay under it: it rises to sit on the
// keyboard, and never grows taller than what is left in sight above it.

/** How far the sheet rises: what of its box (`caja`, the reader's rectangle) the keyboard covers. `vista`: the part of
 * the page in sight (window.visualViewport), in the same coordinates. */
export function subidaSobreTeclado(caja, vista) {
  const fin = vista.offsetTop + vista.height;
  return Math.max(0, Math.round(caja.bottom - fin));
}

/** What is left in sight between the top of the box and the keyboard, for the sheet's tallest. */
export function altoALaVista(caja, vista) {
  const fin = vista.offsetTop + vista.height;
  return Math.max(0, Math.round(Math.min(caja.bottom, fin) - Math.max(caja.top, vista.offsetTop)));
}

// Follows the keyboard for `el`, changing only its style; gives back how to stop.
function seguirTeclado(el) {
  const vista = window.visualViewport;
  const padre = el && (el.offsetParent ?? el.parentElement);
  if (!vista || !padre) return undefined;
  let cuadro = 0;
  const poner = () => {
    cuadro = 0;
    const caja = padre.getBoundingClientRect();
    const subida = subidaSobreTeclado(caja, vista);
    el.style.bottom = subida ? `${subida}px` : '';
    // As tall as what is left in sight, scrolling inside if it needs more.
    el.style.maxHeight = subida ? `${altoALaVista(caja, vista)}px` : '';
    el.style.overflowY = subida ? 'auto' : '';
  };
  const pedir = () => {
    if (!cuadro) cuadro = requestAnimationFrame(poner);
  };
  poner();
  vista.addEventListener('resize', pedir);
  vista.addEventListener('scroll', pedir);
  return () => {
    cancelAnimationFrame(cuadro);
    vista.removeEventListener('resize', pedir);
    vista.removeEventListener('scroll', pedir);
    el.style.bottom = '';
    el.style.maxHeight = '';
    el.style.overflowY = '';
  };
}

/** Keeps `hoja` (a ref to an element at the bottom of its positioned parent) over the keyboard while `activo`, without
 * drawing anything again. */
export function useSobreTeclado(hoja, activo) {
  useLayoutEffect(() => (activo ? seguirTeclado(hoja.current) : undefined), [hoja, activo]);
}
