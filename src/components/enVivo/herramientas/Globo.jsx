import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';

// A small box next to what it is about (a shape, an arrow, the selected text), not a bar on top of the tool: beside
// it when there is room, on the other side or under or over it if not, always inside the tool's sheet and without
// covering it. It moves with what it is about. Escape closes it; opened from the keyboard, the focus goes into it.
//
//   dentro      the element it is drawn in (position: relative): its edges are the limits.
//   ancla()     where the thing is, as a rect of the screen (getBoundingClientRect), or null if it is not there.
//               It may bring its own .
//   alCerrar()  Escape inside it. Whoever opened it lets go of the thing and puts the focus back on it.
//   conTeclado() true if it was opened from the keyboard: the focus goes to its first field.
//   enfocar     the focus goes to its first field anyway (a box opened to type in it).
//   orden       the sides it tries, in order (der, izq, aba, arr).
//   reserva     pixels at the bottom it keeps clear of (the table's bar floats there).

const MARGEN = 8;
const SEPARACION = 12;
// Where it tries to go, in order: beside, then under or over. Text prefers under, as a menu of the selection.
const ORDEN = ['der', 'izq', 'aba', 'arr'];
const ORIGEN = {
  der: 'left center',
  izq: 'right center',
  aba: 'top center',
  arr: 'bottom center',
  pd: 'top left',
  pi: 'top right',
  pda: 'bottom left',
  pia: 'bottom right',
};

/**
 * Puts `caja` next to `ancla()` inside `dentro`, trying the sides of `orden`; returns the side it took (null if the
 * thing is not in sight). Besides der, izq, aba and arr, a point (a menu at the pointer) takes its corners: pd (below
 * and to the right of it), pi (below, to the left), pda and pia (above).
 */
export function ubicar(caja, dentro, ancla, orden, reserva) {
  const r = dentro.getBoundingClientRect();
  const a = ancla();
  if (!a || a.right < r.left || a.left > r.right || a.bottom < r.top || a.top > r.bottom) {
    caja.style.visibility = 'hidden';
    return null;
  }
  const ax = a.left - r.left + dentro.scrollLeft;
  const ay = a.top - r.top + dentro.scrollTop;
  const w = caja.offsetWidth;
  const h = caja.offsetHeight;
  const izq = dentro.scrollLeft + MARGEN;
  const der = dentro.scrollLeft + dentro.clientWidth - MARGEN;
  const arr = dentro.scrollTop + MARGEN;
  const aba = dentro.scrollTop + dentro.clientHeight - MARGEN - reserva;
  const enX = (x) => Math.min(Math.max(x, izq), Math.max(izq, der - w));
  const enY = (y) => Math.min(Math.max(y, arr), Math.max(arr, aba - h));
  const lados = {
    der: [ax + a.width + SEPARACION, enY(ay + a.height / 2 - h / 2), (x) => x + w <= der],
    izq: [ax - SEPARACION - w, enY(ay + a.height / 2 - h / 2), (x) => x >= izq],
    aba: [enX(ax + a.width / 2 - w / 2), ay + a.height + SEPARACION, (_, y) => y + h <= aba],
    arr: [enX(ax + a.width / 2 - w / 2), ay - SEPARACION - h, (_, y) => y >= arr],
    pd: [ax + 2, ay + 2, (x, y) => x + w <= der && y + h <= aba],
    pi: [ax - 2 - w, ay + 2, (x, y) => x >= izq && y + h <= aba],
    pda: [ax + 2, ay - 2 - h, (x, y) => x + w <= der && y >= arr],
    pia: [ax - 2 - w, ay - 2 - h, (x, y) => x >= izq && y >= arr],
  };
  const lugares = a.orden ?? orden;
  const elegido = lugares.find((l) => lados[l][2](lados[l][0], lados[l][1])) ?? lugares[0];
  const [lx, ly] = lados[elegido];
  const [x, y] = [enX(lx), enY(ly)];
  caja.style.left = `${Math.round(x)}px`;
  caja.style.top = `${Math.round(y)}px`;
  // It grows from the side of what it is about.
  caja.style.transformOrigin = ORIGEN[elegido];
  caja.style.visibility = '';
  return elegido;
}

export default function Globo({ dentro, ancla, alCerrar, conTeclado, enfocar = false, etiqueta, orden = ORDEN, reserva = 0, children }) {
  const caja = useRef(null);
  // Placed after every render of whoever shows it (the thing moved, the view moved) and when the sheet changes size.
  useLayoutEffect(() => {
    if (caja.current && dentro.current) ubicar(caja.current, dentro.current, ancla, orden, reserva);
  });
  const [, redibujar] = useReducer((n) => n + 1, 0);
  useEffect(() => {
    const d = dentro.current;
    if (!d) return undefined;
    const ro = new ResizeObserver(redibujar);
    ro.observe(d);
    if (caja.current) ro.observe(caja.current);
    d.addEventListener('scroll', redibujar, { passive: true });
    return () => {
      ro.disconnect();
      d.removeEventListener('scroll', redibujar);
    };
  }, [dentro]);
  useEffect(() => {
    // After it is placed: hidden, it takes no focus (so no autoFocus inside it).
    if (enfocar || conTeclado?.()) caja.current?.querySelector('input, select, textarea, button')?.focus();
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={caja}
      className="vh-pop"
      role="dialog"
      aria-label={etiqueta}
      style={{ visibility: 'hidden' }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        alCerrar();
      }}
    >
      {children}
    </div>
  );
}
