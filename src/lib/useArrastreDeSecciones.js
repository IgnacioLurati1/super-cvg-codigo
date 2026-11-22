import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { desplazarHacia } from './autoDesplazar';
import { sinMovimiento } from './movimiento';
import { botonesSinMouse } from './sinMouse';

// How far a press goes before it becomes a drag (a tap only gives the handle the focus). Near the top or the bottom of
// the screen the page goes by itself (autoDesplazar.js).
const UMBRAL = 6;
// The page has no smooth scroll of its own: `auto` jumps.
const YA = { behavior: 'auto' };
// The dropped section settling into its gap. The others make room with the transition of secciones.css.
const ACOMODO = 'transform 160ms cubic-bezier(0.23, 1, 0.32, 1)';

const quieto = () => sinMovimiento() || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);

// The others, moved aside so the dragged one has its place at `lugar` (among the others). `de(id)`: the element.
function abrirLugar(g, de) {
  const alto = g.cajas.get(g.id).alto + g.hueco;
  g.orden.forEach((id, i) => {
    if (id === g.id) return;
    let dy = 0;
    if (i < g.desde && i >= g.lugar) dy = alto;
    else if (i > g.desde && i <= g.lugar) dy = -alto;
    const el = de(id);
    if (el) el.style.transform = dy ? `translateY(${dy}px)` : '';
  });
}

// The dragged one follows the pointer; past the middle of another, it takes its place. In page coordinates measured
// when it started, so going up or down by itself doesn't change them.
function seguir(g, de) {
  const el = g?.cajas && de(g.id);
  if (!el) return;
  const caja = g.cajas.get(g.id);
  const arriba = g.y + window.scrollY - g.agarre;
  el.style.transform = `translateY(${arriba - caja.top}px)`;
  const centro = arriba + caja.alto / 2;
  const lugar = g.orden.filter((id) => {
    const c = g.cajas.get(id);
    return id !== g.id && c.top + c.alto / 2 < centro;
  }).length;
  if (lugar === g.lugar) return;
  g.lugar = lugar;
  abrirLugar(g, de);
}

/**
 * Moving the sections of a page by a handle, like a list you sort: with the mouse or a finger (Pointer Events, only the
 * first pointer), or with the arrows up and down on the handle, one place at a time.
 * `ids`: the sections on screen, in order. `elDe(id)`: its element. `manijaDe(id)`: its handle. `alMover(id, lugar)`:
 * the section goes to place `lugar` among them (0 is the first). `alTocar(id)`: the handle was touched or clicked without
 * dragging, or pressed with Enter or Space, for those who can't drag (the page offers to move it up or down): only with
 * «Modo sin mouse» or on a device without a mouse (sinMouse.js).
 * While a drag lasts, `arrastrada` is its id: the page folds every section to its title, so the whole list fits; the
 * dragged one follows the pointer and the others move aside (a transform) to open its place. Dropped, it settles into
 * that place, everything opens again, the page goes to it and the focus to its handle. Escape, or the browser taking
 * the pointer away, cancels: the page goes back to how it was.
 */
export function useArrastreDeSecciones({ ids, elDe, manijaDe, alMover, alTocar }) {
  const [arrastrada, setArrastrada] = useState(null);
  const gesto = useRef(null);
  // What to do once the page is drawn again: after a drag ({ id, scroll }) or a move with the keyboard (an id).
  const luego = useRef(null);
  const enfocar = useRef(null);
  const ultimo = useRef({ ids, elDe, manijaDe, alMover, alTocar });
  useLayoutEffect(() => {
    ultimo.current = { ids, elDe, manijaDe, alMover, alTocar };
  });

  // Everything back in the flow of the page, and the page drawn at once with the new order: no frame in between.
  const cerrar = (g, mover) => {
    const { ids: lista, elDe: de, alMover: alMoverla } = ultimo.current;
    for (const id of lista) {
      const el = de(id);
      if (el) {
        el.style.transform = '';
        el.style.transition = '';
      }
    }
    const cambia = mover && g.lugar !== g.desde;
    // Moved: the page goes to it. Dropped where it was, or cancelled: the page as it was before.
    luego.current = { id: g.id, scroll: cambia ? null : g.scroll0 };
    flushSync(() => {
      if (cambia) alMoverla(g.id, g.lugar);
      setArrastrada(null);
    });
  };

  const soltarLaManija = (g) => {
    cancelAnimationFrame(g.cuadro);
    window.removeEventListener('keydown', g.alTeclear);
    if (g.manija.hasPointerCapture?.(g.puntero)) g.manija.releasePointerCapture(g.puntero);
  };

  const cancelar = () => {
    const g = gesto.current;
    if (!g || g.soltando) return;
    gesto.current = null;
    soltarLaManija(g);
    if (!g.empezado) return;
    cerrar(g, false);
  };

  const soltar = () => {
    const g = gesto.current;
    if (!g || g.soltando) return;
    if (!g.empezado || !g.cajas) {
      gesto.current = null;
      soltarLaManija(g);
      g.manija.focus({ preventScroll: true });
      if (g.empezado) cerrar(g, false);
      else if (botonesSinMouse()) ultimo.current.alTocar?.(g.id);
      return;
    }
    g.soltando = true;
    soltarLaManija(g);
    // It settles into its gap, then the order changes for real.
    const caja = g.cajas.get(g.id);
    const ahi = g.cajas.get(g.orden[g.lugar]);
    const destino = g.lugar <= g.desde ? ahi.top : ahi.top + ahi.alto - caja.alto;
    const el = ultimo.current.elDe(g.id);
    const espera = el && !quieto() ? 170 : 0;
    if (el) {
      el.style.transition = ACOMODO;
      el.style.transform = `translateY(${destino - caja.top}px)`;
    }
    g.reloj = setTimeout(() => {
      gesto.current = null;
      cerrar(g, true);
    }, espera);
  };

  useLayoutEffect(() => {
    const g = gesto.current;
    if (arrastrada !== null && g?.empezado && !g.cajas) {
      const { ids: lista, elDe: de } = ultimo.current;
      // Folded, the page got shorter: it goes so the section stays under the pointer.
      const el = de(arrastrada);
      const corrida = el ? el.getBoundingClientRect().top - g.top0 : 0;
      if (corrida) window.scrollBy({ top: corrida, ...YA });
      // Where each one is, folded, and the room between them.
      g.orden = [...lista];
      g.desde = lista.indexOf(arrastrada);
      g.lugar = g.desde;
      g.cajas = new Map(lista.map((id) => {
        const r = de(id)?.getBoundingClientRect() ?? { top: 0, height: 0 };
        return [id, { top: r.top + window.scrollY, alto: r.height }];
      }));
      const [a, b] = lista.length > 1 ? (g.desde < lista.length - 1 ? [g.desde, g.desde + 1] : [g.desde - 1, g.desde]) : [0, 0];
      const primera = g.cajas.get(lista[a]);
      g.hueco = a === b ? 0 : Math.max(0, g.cajas.get(lista[b]).top - primera.top - primera.alto);
      const paso = () => {
        if (gesto.current !== g || g.soltando) return;
        desplazarHacia(g.y);
        seguir(g, ultimo.current.elDe);
        g.cuadro = requestAnimationFrame(paso);
      };
      g.cuadro = requestAnimationFrame(paso);
      return;
    }
    const l = luego.current;
    if (arrastrada === null && l) {
      luego.current = null;
      if (l.scroll !== null) window.scrollTo({ top: l.scroll, ...YA });
      else ultimo.current.elDe(l.id)?.querySelector('h2')?.scrollIntoView({ block: 'start', ...YA });
      ultimo.current.manijaDe(l.id)?.focus({ preventScroll: true });
    }
  }, [arrastrada]);

  // Moved with the keyboard: React moved the section in the page and its handle lost the focus.
  useLayoutEffect(() => {
    const id = enfocar.current;
    if (id === null) return;
    enfocar.current = null;
    const manija = ultimo.current.manijaDe(id);
    manija?.focus({ preventScroll: true });
    manija?.scrollIntoView({ block: 'nearest' });
  });

  // Leaving the page in the middle of a drag.
  useEffect(() => () => {
    const g = gesto.current;
    if (!g) return;
    cancelAnimationFrame(g.cuadro);
    clearTimeout(g.reloj);
    window.removeEventListener('keydown', g.alTeclear);
  }, []);

  const manija = (id) => ({
    onPointerDown: (e) => {
      if (gesto.current || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      // No text selection and no focus by the press: the focus comes at the end.
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      gesto.current = { id, puntero: e.pointerId, manija: e.currentTarget, y0: e.clientY, y: e.clientY, empezado: false, cuadro: 0 };
    },
    onPointerMove: (e) => {
      const g = gesto.current;
      if (!g || g.soltando || e.pointerId !== g.puntero) return;
      g.y = e.clientY;
      if (g.empezado) {
        seguir(g, ultimo.current.elDe);
        return;
      }
      const el = Math.abs(g.y - g.y0) >= UMBRAL && ultimo.current.elDe(id);
      if (!el) return;
      g.empezado = true;
      g.scroll0 = window.scrollY;
      g.top0 = el.getBoundingClientRect().top;
      g.agarre = g.y0 - g.top0;
      g.alTeclear = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        cancelar();
      };
      window.addEventListener('keydown', g.alTeclear);
      setArrastrada(id);
    },
    onPointerUp: (e) => {
      if (gesto.current?.puntero === e.pointerId) soltar();
    },
    onPointerCancel: (e) => {
      if (gesto.current?.puntero === e.pointerId) cancelar();
    },
    onLostPointerCapture: (e) => {
      if (gesto.current?.puntero === e.pointerId) cancelar();
    },
    // Enter or Space: a click with no pointer behind it (a touch or a mouse already went through onPointerUp).
    onClick: (e) => {
      if (e.detail === 0 && botonesSinMouse()) ultimo.current.alTocar?.(id);
    },
    onKeyDown: (e) => {
      const salto = { ArrowUp: -1, ArrowDown: 1 }[e.key];
      if (!salto || gesto.current) return;
      e.preventDefault();
      const lista = ultimo.current.ids;
      const lugar = lista.indexOf(id) + salto;
      if (lugar < 0 || lugar >= lista.length) return;
      enfocar.current = id;
      ultimo.current.alMover(id, lugar);
    },
  });

  return { arrastrada, manija };
}
