import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// An HTML summary on a phone (VisorResumen.jsx, the frame without scripts, of this same origin). Two fingers change the
// size of its letters, as a reader does, not of the whole page: the browser's own zoom also grew the viewer's header
// and left the text wider than the screen. While the fingers move the page is only scaled, by the compositor; letting go,
// it is laid out once at the new size (CSS zoom on its root, so it fits the width again). Scrolling it down hides the
// viewer's header, scrolling up brings it back (`alCorrer`), and the text stays where it was when the header goes.

export const LETRA_MIN = 0.8;
export const LETRA_MAX = 2;
const PASOS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2];
// How far the text goes down (or up) before the header goes away (or comes back), and how near the top it always shows.
const CORRIDO = 24;
const CERCA_ARRIBA = 40;

export const acotarLetra = (z) => Math.min(LETRA_MAX, Math.max(LETRA_MIN, Math.round(z * 100) / 100));

/** The next size of the letters from `actual`, up (dir 1) or down (-1). */
export function pasoDeLetra(actual, dir) {
  const paso = dir > 0 ? PASOS.find((p) => p > actual + 0.01) : [...PASOS].reverse().find((p) => p < actual - 0.01);
  return paso ?? (dir > 0 ? LETRA_MAX : LETRA_MIN);
}

/** Where the scroll goes so the text at `y` of the view stays there when the page grows from `alto` to `altoNuevo`. */
export function scrollQueQueda(scroll, y, alto, altoNuevo) {
  if (!alto) return scroll;
  return Math.max(0, ((scroll + y) / alto) * altoNuevo - y);
}

// A menu the summary slides out of the screen and brings back with its scripts (a side index, as El Santo Resumen's)
// never comes back here, where they don't run; on a phone it still took its height on top, a whole blank screen, and
// its width, wider than the screen with bigger letters. It goes: only what is moved (transform) wholly out of sight.
function quitarMenusFuera(doc) {
  const ancho = doc.documentElement.clientWidth;
  for (const el of doc.querySelectorAll('aside, nav')) {
    if (el.style.display === 'none' || doc.defaultView.getComputedStyle(el).transform === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width && (r.right <= 0 || r.left >= ancho)) el.style.display = 'none';
  }
}

// The size, laid out once, keeping the text that was under the fingers (or at the top, from the buttons). `u`: what the
// gestures share ({ letra, ancla, y, corrido }).
function ponerLetra(el, u, letra) {
  const doc = el?.contentDocument;
  const raiz = doc?.documentElement;
  const caja = doc?.scrollingElement;
  if (!raiz || !caja) return;
  const antes = Number(raiz.style.zoom) || 1;
  u.letra = letra;
  if (Math.abs(antes - letra) < 0.001) return;
  const alto = caja.scrollHeight;
  const scroll = caja.scrollTop;
  raiz.style.zoom = letra === 1 ? '' : String(letra);
  // Instant: a summary with smooth scroll of its own would glide there.
  caja.scrollTo({ top: scrollQueQueda(scroll, u.ancla, alto, caja.scrollHeight), behavior: 'instant' });
  u.y = caja.scrollTop;
  u.ancla = 0;
}

// The fingers and the scroll of the frame's document. Gives back what stops listening.
function escuchar(el, u, avisar, setLetra) {
  const doc = el?.contentDocument;
  const ventana = el?.contentWindow;
  const raiz = doc?.documentElement;
  if (!raiz || !ventana) return undefined;
  const caja = () => doc.scrollingElement ?? raiz;
  quitarMenusFuera(doc);
  u.y = caja().scrollTop;
  // Only these fingers move the page: the browser no longer zooms the whole viewer from here.
  raiz.style.touchAction = 'pan-x pan-y';

  let gesto = null;
  const distancia = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const pintar = () => {
    gesto.cuadro = 0;
    raiz.style.transform = `scale(${gesto.factor})`;
  };
  const alEmpezar = (e) => {
    if (e.touches.length !== 2) return;
    const y = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const x = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const c = caja();
    gesto = { d0: distancia(e.touches) || 1, y, factor: 1, cuadro: 0 };
    raiz.style.transformOrigin = `${c.scrollLeft + x}px ${c.scrollTop + y}px`;
    raiz.style.willChange = 'transform';
  };
  const alMover = (e) => {
    if (!gesto || e.touches.length !== 2) return;
    if (e.cancelable) e.preventDefault();
    gesto.factor = acotarLetra((u.letra * distancia(e.touches)) / gesto.d0) / u.letra;
    if (!gesto.cuadro) gesto.cuadro = requestAnimationFrame(pintar);
  };
  const alTerminar = (e) => {
    if (!gesto || e.touches.length >= 2) return;
    const g = gesto;
    gesto = null;
    cancelAnimationFrame(g.cuadro);
    raiz.style.transform = '';
    raiz.style.transformOrigin = '';
    raiz.style.willChange = '';
    const nueva = acotarLetra(u.letra * g.factor);
    if (Math.abs(nueva - u.letra) < 0.02) return;
    u.ancla = g.y;
    setLetra(nueva);
  };

  const alScrollear = () => {
    const y = caja().scrollTop;
    const dy = y - u.y;
    u.y = y;
    if (y <= CERCA_ARRIBA) {
      u.corrido = 0;
      avisar.current?.(true);
      return;
    }
    if (!dy || gesto) return;
    u.corrido = Math.sign(dy) === Math.sign(u.corrido) ? u.corrido + dy : dy;
    if (u.corrido > CORRIDO) avisar.current?.(false);
    else if (u.corrido < -CORRIDO) avisar.current?.(true);
  };
  // The header going or coming moves the frame's top: the text is put back where it was on the screen, before it is
  // painted, and that scroll is not taken as the student's.
  let arriba = el.getBoundingClientRect().top;
  const ro = new ResizeObserver(() => {
    const t = el.getBoundingClientRect().top;
    const d = t - arriba;
    arriba = t;
    if (!d) return;
    const c = caja();
    c.scrollTo({ top: Math.max(0, c.scrollTop + d), behavior: 'instant' });
    u.y = c.scrollTop;
  });
  ro.observe(el);

  doc.addEventListener('touchstart', alEmpezar, { passive: true });
  doc.addEventListener('touchmove', alMover, { passive: false });
  doc.addEventListener('touchend', alTerminar);
  doc.addEventListener('touchcancel', alTerminar);
  ventana.addEventListener('scroll', alScrollear, { passive: true });
  return () => {
    ro.disconnect();
    doc.removeEventListener('touchstart', alEmpezar);
    doc.removeEventListener('touchmove', alMover);
    doc.removeEventListener('touchend', alTerminar);
    doc.removeEventListener('touchcancel', alTerminar);
    ventana.removeEventListener('scroll', alScrollear);
  };
}

/** `carga`: a number that changes with each load of the frame. `letra`, `setLetra`: the size of its letters (1, as it
 * comes). `alCorrer(ver)`: the header should show or not. */
export function useMarcoTactil(marco, { carga, letra, setLetra, alCorrer }) {
  const [u] = useState(() => ({ letra, ancla: 0, y: 0, corrido: 0 }));
  const avisar = useRef(alCorrer);
  useEffect(() => {
    avisar.current = alCorrer;
  });
  useLayoutEffect(() => {
    if (carga) ponerLetra(marco.current, u, letra);
  }, [marco, u, carga, letra]);
  useEffect(() => (carga ? escuchar(marco.current, u, avisar, setLetra) : undefined), [marco, u, carga, setLetra]);
}
