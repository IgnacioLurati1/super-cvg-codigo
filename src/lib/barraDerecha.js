import { useEffect } from 'react';

// Where a scroller inside the page reaches the right edge of the window, its scrollbar is inside the fixed box of what
// floats there (the page's own one isn't). The width it takes goes to --barra-derecha (0 with none or overlay ones), so
// what floats keeps its distance from it, as on the screens where the page scrolls.
// Also a scroller a few pixels in from the edge (the live session's table has its margin): what goes is the distance
// from the edge of the window to the left of its bar.
const CERCA = 40;
// What floats there is not the page: its own scrollbar (a long chat) would push it, and pushed, it measures nothing,
// so it went back and forth with each change of the page.
const FLOTA = '.flotante, .flotante__boton, .lector__consultron--caja';

function medir() {
  const borde = window.innerWidth;
  let ancho = 0;
  for (const y of [window.innerHeight - 48, window.innerHeight / 2]) {
    for (const x of [borde - 1, borde - 12, borde - 24]) {
      let el = document.elementsFromPoint(x, y).find((e) => !e.closest(FLOTA)) ?? null;
      while (el && el !== document.body && el !== document.documentElement) {
        const dif = el.offsetWidth - el.clientWidth;
        const caja = el.getBoundingClientRect();
        if (dif > 0 && el.scrollHeight > el.clientHeight && caja.right >= borde - CERCA) {
          ancho = Math.max(ancho, Math.round(borde - caja.right + dif));
          break;
        }
        el = el.parentElement;
      }
    }
    if (ancho) break;
  }
  const raiz = document.documentElement.style;
  if (raiz.getPropertyValue('--barra-derecha') !== `${ancho}px`) raiz.setProperty('--barra-derecha', `${ancho}px`);
}

export function useBarraDerecha() {
  useEffect(() => {
    let cuadro = 0;
    const pedir = () => {
      if (!cuadro) {
        cuadro = requestAnimationFrame(() => {
          cuadro = 0;
          medir();
        });
      }
    };
    const resize = new ResizeObserver(pedir);
    resize.observe(document.body);
    const cambios = new MutationObserver(pedir);
    cambios.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    window.addEventListener('resize', pedir);
    pedir();
    return () => {
      resize.disconnect();
      cambios.disconnect();
      window.removeEventListener('resize', pedir);
      if (cuadro) cancelAnimationFrame(cuadro);
      document.documentElement.style.removeProperty('--barra-derecha');
    };
  }, []);
}
