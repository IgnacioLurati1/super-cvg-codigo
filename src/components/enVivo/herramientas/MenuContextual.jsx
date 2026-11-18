import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { abreMenu, aplanar, atajo as decirAtajo, esCampo, porLetra, primero, siguiente, ultimo } from '../../../lib/enVivo/menuContextual';
import { ubicar } from './Globo';
import { reservaAbajo } from './comun';

// The small menu of the right click, shared by the tools (entries in src/lib/enVivo/menuContextual.js). It opens at
// the pointer with the right click or a long touch, and from the keyboard with the menu key or Shift+F10 where the
// tool says (the caret, what is chosen). Shift and the right click, or a second right click while it is open, give
// the browser's own menu. Each item does what its button of the bar does: the same function. Where the tool can move its
// view, the right button pressed and dragged moves it instead, and the menu opens only if it did not move.
//
//   An item may bring `estilo` (React style, the tool's own: never a peer's), as the typefaces of the Documento.
//
//   useMenuContextual(dentro, { armar, lugarTeclado, alAbrir, volverFoco, desplazar })
//     dentro            the tool's sheet (position: relative): it listens there, and the menu is drawn inside it.
//     armar(lugar)      { etiqueta, entradas } for { x, y, objetivo, teclado }, or null for no menu there.
//     lugarTeclado()    { x, y } of the screen where it opens from the keyboard (the caret, what is chosen), or null.
//     alAbrir()         a long touch opens it: the tool drops what the finger started (a stroke, a drag).
//     volverFoco()      where the focus goes back when it closes (by default, where it was).
//     desplazar()       the right button started to drag: returns (dx, dy) => moves the view by those pixels since the
//                       press. Without it, the right button only opens the menu.
//   Returns the menu to render inside `dentro` (or null).

const TOQUE_LARGO = 500;
const QUIETO = 10;
// The right button moved less than this: it was a click, and the menu opens.
const QUIETO_DERECHO = 5;
const LADOS = ['pd', 'pi', 'pda', 'pia'];

export function useMenuContextual(dentro, opciones) {
  const [menu, setMenu] = useState(null);
  const opcionesRef = useRef(opciones);
  useLayoutEffect(() => {
    opcionesRef.current = opciones;
  });
  const estado = useRef({ abierto: false, abiertoEn: 0, pasar: false, toque: null, volver: null, derecho: null, trasArrastre: 0 });
  const caja = useRef(null);

  useEffect(() => {
    const el = dentro.current;
    if (!el) return undefined;
    const e = estado.current;
    const abrir = (x, y, objetivo, teclado) => {
      const armado = opcionesRef.current.armar({ x, y, objetivo, teclado });
      if (!armado?.entradas?.length) return false;
      if (!e.abierto) e.volver = document.activeElement;
      e.abierto = true;
      e.abiertoEn = performance.now();
      setMenu({ ...armado, x, y, teclado, vez: e.abiertoEn });
      return true;
    };
    const cancelarToque = () => {
      clearTimeout(e.toque?.reloj);
      e.toque = null;
    };
    const alContexto = (ev) => {
      cancelarToque();
      if (caja.current?.contains(ev.target)) {
        ev.preventDefault();
        return;
      }
      // Opened a moment ago by the long touch (Android sends this too): it stays.
      if (e.abierto && performance.now() - e.abiertoEn < 1000) {
        ev.preventDefault();
        return;
      }
      if (e.pasar || ev.shiftKey || esCampo(ev.target)) {
        e.pasar = false;
        return;
      }
      // The right button is still down (the browser sends this on pressing it): the menu waits to see if it drags.
      if (e.derecho) {
        ev.preventDefault();
        e.derecho.pendiente = { x: ev.clientX, y: ev.clientY, objetivo: ev.target };
        return;
      }
      // It came after dragging the view (the browser sends this on releasing it): no menu.
      if (performance.now() - e.trasArrastre < 800) {
        ev.preventDefault();
        e.trasArrastre = 0;
        return;
      }
      // From the keyboard (the key handler already opened it, if the browser sends this as well).
      if (performance.now() - (e.teclaEn ?? 0) < 600) {
        ev.preventDefault();
        return;
      }
      if (abrir(ev.clientX, ev.clientY, ev.target, false)) ev.preventDefault();
    };
    const alTeclear = (ev) => {
      if (!abreMenu(ev) || caja.current?.contains(ev.target) || esCampo(ev.target)) return;
      const lugar = opcionesRef.current.lugarTeclado?.() ?? (() => {
        const r = (document.activeElement && el.contains(document.activeElement) ? document.activeElement : el).getBoundingClientRect();
        return { x: r.left + Math.min(24, r.width / 2), y: r.top + Math.min(24, r.height / 2) };
      })();
      ev.preventDefault();
      e.teclaEn = performance.now();
      abrir(lugar.x, lugar.y, document.activeElement, true);
    };
    // The right button pressed: it may drag the view, if the tool has one to move.
    const alBajarDerecho = (ev) => {
      e.derecho = null;
      if (ev.button !== 2 || ev.pointerType === 'touch' || ev.shiftKey || e.pasar || !opcionesRef.current.desplazar) return;
      if (caja.current?.contains(ev.target) || esCampo(ev.target)) return;
      e.trasArrastre = 0;
      e.derecho = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, mover: null, pendiente: null };
      el.setPointerCapture?.(ev.pointerId);
    };
    const alMoverDerecho = (ev) => {
      const d = e.derecho;
      if (!d || ev.pointerId !== d.id) return;
      if (!(ev.buttons & 2)) {
        terminarDerecho(ev);
        return;
      }
      const [dx, dy] = [ev.clientX - d.x, ev.clientY - d.y];
      if (!d.mover) {
        if (Math.hypot(dx, dy) < QUIETO_DERECHO) return;
        d.mover = opcionesRef.current.desplazar?.() ?? (() => {});
        el.classList.add('vh-arrastrando');
      }
      d.mover(dx, dy);
    };
    const terminarDerecho = (ev) => {
      const d = e.derecho;
      if (!d || ev.pointerId !== d.id) return;
      e.derecho = null;
      el.classList.remove('vh-arrastrando');
      if (d.mover) e.trasArrastre = performance.now();
      else if (d.pendiente && ev.type === 'pointerup') abrir(d.pendiente.x, d.pendiente.y, d.pendiente.objetivo, false);
    };
    // A long touch: still for half a second.
    const alBajar = (ev) => {
      alBajarDerecho(ev);
      if (ev.pointerType !== 'touch' || caja.current?.contains(ev.target) || esCampo(ev.target)) return;
      cancelarToque();
      const { clientX: x, clientY: y } = ev;
      e.toque = {
        id: ev.pointerId,
        x,
        y,
        reloj: setTimeout(() => {
          e.toque = null;
          const objetivo = document.elementFromPoint(x, y) ?? el;
          if (!el.contains(objetivo)) return;
          opcionesRef.current.alAbrir?.();
          if (abrir(x, y, objetivo, false)) e.trasToque = true;
        }, TOQUE_LARGO),
      };
    };
    const alMover = (ev) => {
      alMoverDerecho(ev);
      const t = e.toque;
      if (t && (ev.pointerId !== t.id || Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > QUIETO)) cancelarToque();
    };
    // Lifting the finger after a long touch, the browser clicks where it was: on the menu that just opened under it.
    const alLevantar = (ev) => {
      if (!e.trasToque || ev.pointerType !== 'touch') return;
      e.trasToque = false;
      e.ignorarHasta = performance.now() + 700;
    };
    const tragar = (ev) => {
      if (performance.now() > (e.ignorarHasta ?? 0)) return;
      if (ev.type === 'click') e.ignorarHasta = 0;
      ev.preventDefault();
      ev.stopPropagation();
    };
    document.addEventListener('pointerup', alLevantar, true);
    document.addEventListener('mousedown', tragar, true);
    document.addEventListener('click', tragar, true);
    el.addEventListener('contextmenu', alContexto);
    el.addEventListener('keydown', alTeclear);
    el.addEventListener('pointerdown', alBajar, { passive: true });
    el.addEventListener('pointermove', alMover, { passive: true });
    el.addEventListener('pointerup', cancelarToque, { passive: true });
    el.addEventListener('pointercancel', cancelarToque, { passive: true });
    el.addEventListener('pointerup', terminarDerecho, { passive: true });
    el.addEventListener('pointercancel', terminarDerecho, { passive: true });
    return () => {
      e.derecho = null;
      el.classList.remove('vh-arrastrando');
      cancelarToque();
      document.removeEventListener('pointerup', alLevantar, true);
      document.removeEventListener('mousedown', tragar, true);
      document.removeEventListener('click', tragar, true);
      el.removeEventListener('contextmenu', alContexto);
      el.removeEventListener('keydown', alTeclear);
      el.removeEventListener('pointerdown', alBajar);
      el.removeEventListener('pointermove', alMover);
      el.removeEventListener('pointerup', cancelarToque);
      el.removeEventListener('pointercancel', cancelarToque);
      el.removeEventListener('pointerup', terminarDerecho);
      el.removeEventListener('pointercancel', terminarDerecho);
    };
  }, [dentro]);

  const cerrar = (devolver) => {
    const e = estado.current;
    if (!e.abierto) return;
    e.abierto = false;
    setMenu(null);
    if (!devolver) return;
    if (opcionesRef.current.volverFoco) opcionesRef.current.volverFoco();
    else if (e.volver?.isConnected) e.volver.focus({ preventScroll: true });
  };

  // A click outside closes it; a second right click while it is open gives the browser's menu.
  useEffect(() => {
    if (!menu) return undefined;
    const fuera = (ev) => {
      if (caja.current?.contains(ev.target)) return;
      if (ev.button === 2) estado.current.pasar = true;
      cerrar(false);
    };
    const rueda = (ev) => {
      if (!caja.current?.contains(ev.target)) cerrar(false);
    };
    const irse = () => cerrar(false);
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('wheel', rueda, { capture: true, passive: true });
    window.addEventListener('resize', irse);
    window.addEventListener('blur', irse);
    return () => {
      document.removeEventListener('pointerdown', fuera, true);
      document.removeEventListener('wheel', rueda, true);
      window.removeEventListener('resize', irse);
      window.removeEventListener('blur', irse);
    };
    // Only for each menu that opens.
  }, [menu]);

  if (!menu) return null;
  return <Menu key={menu.vez} caja={caja} dentro={dentro} menu={menu} cerrar={cerrar} />;
}

function Menu({ caja, dentro, menu, cerrar }) {
  const items = aplanar(menu.entradas);
  const [foco, setFoco] = useState(() => primero(items));
  const botones = useRef([]);

  useLayoutEffect(() => {
    if (!caja.current || !dentro.current) return;
    const ancla = () => ({ left: menu.x, right: menu.x, top: menu.y, bottom: menu.y, width: 0, height: 0 });
    ubicar(caja.current, dentro.current, ancla, LADOS, reservaAbajo());
  }, [caja, dentro, menu]);
  useEffect(() => {
    botones.current[foco]?.focus({ preventScroll: true });
  }, [foco]);

  const usar = (it) => {
    if (it.deshabilitado) return;
    cerrar(true);
    it.hacer();
  };
  const alTeclear = (e) => {
    // Nothing of the menu reaches the tool (its arrows move the sheet, its Escape lets go of what is chosen).
    e.stopPropagation();
    const mover = (k) => {
      if (k >= 0) setFoco(k);
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') mover(siguiente(items, foco, 1));
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') mover(siguiente(items, foco, -1));
    else if (e.key === 'Home') mover(primero(items));
    else if (e.key === 'End') mover(ultimo(items));
    else if (e.key === 'Escape' || abreMenu(e)) cerrar(true);
    else if (e.key === 'Tab') cerrar(true);
    else if (e.key === 'Enter' || e.key === ' ') usar(items[foco]);
    else if (e.key.length === 1 && /\p{L}/u.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) mover(porLetra(items, foco, e.key));
    else return;
    e.preventDefault();
  };

  const item = (it, enFila = false) => {
    const k = items.indexOf(it);
    const rol = it.rol === 'radio' ? 'menuitemradio' : it.rol === 'check' ? 'menuitemcheckbox' : 'menuitem';
    return (
      <button
        key={k}
        ref={(b) => {
          botones.current[k] = b;
        }}
        type="button"
        role={rol}
        aria-checked={rol === 'menuitem' ? undefined : Boolean(it.marcado)}
        aria-disabled={it.deshabilitado || undefined}
        aria-label={it.muestra ? it.etiqueta : undefined}
        title={it.muestra ? it.etiqueta : undefined}
        tabIndex={k === foco ? 0 : -1}
        className={it.muestra ? 'vh-menu__muestra' : enFila ? 'vh-menu__chip' : 'vh-menu__item'}
        style={it.muestra ? { '--muestra': it.muestra } : it.estilo}
        onClick={() => usar(it)}
        onPointerMove={() => !it.deshabilitado && k !== foco && setFoco(k)}
      >
        {!it.muestra && enFila && it.etiqueta}
        {!it.muestra && !enFila && (
          <>
            <span className="vh-menu__marca" aria-hidden="true">{it.marcado ? '✓' : ''}</span>
            <span className="vh-menu__texto">{it.etiqueta}</span>
            {it.atajo && <kbd className="vh-menu__atajo">{decirAtajo(it.atajo)}</kbd>}
          </>
        )}
      </button>
    );
  };

  return (
    <div
      ref={caja}
      className="vh-menu"
      role="menu"
      aria-label={menu.etiqueta}
      style={{ visibility: 'hidden' }}
      onKeyDown={alTeclear}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.entradas.map((e, i) => {
        if (e === '-') return <div key={`s${i}`} role="separator" className="vh-menu__linea" />;
        if (e.fila) {
          return (
            <div key={`f${i}`} role="group" aria-label={e.fila} className="vh-menu__fila">
              {e.items.map((it) => item(it, true))}
            </div>
          );
        }
        return item(e);
      })}
    </div>
  );
}
