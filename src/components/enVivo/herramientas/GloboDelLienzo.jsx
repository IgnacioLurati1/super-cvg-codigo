import { useStore } from '@xyflow/react';
import Globo from './Globo';
import { reservaAbajo } from './comun';

// The box of what is chosen in the Diagrama de flujo, next to the shape or at the middle
// of the arrow. React Flow's view is read here so that only the box draws again when the sheet pans or zooms.

const MEDIO = 8;
const ACOSTADA = ['aba', 'arr', 'der', 'izq'];
const PARADA = ['der', 'izq', 'aba', 'arr'];

/** Where a node or an arrow is on screen, found by its id in React Flow's own markup. */
export function anclaEnLienzo(contenedor, { nodo, flecha }) {
  const raiz = contenedor.current;
  if (!raiz) return null;
  if (nodo) return raiz.querySelector(`.react-flow__node[data-id="${CSS.escape(nodo)}"]`)?.getBoundingClientRect() ?? null;
  const camino = raiz.querySelector(`.react-flow__edge[data-id="${CSS.escape(flecha)}"] .react-flow__edge-path`);
  const pantalla = camino?.getScreenCTM?.();
  if (!camino || !pantalla) return null;
  // A short or straight arrow: the box goes beside the whole of it (under a lying one, to the side of a standing one),
  // so it does not cover it. A long one that turns: next to its middle.
  const caja = camino.getBoundingClientRect();
  if (caja.width < 240 || caja.height < 240) {
    return { left: caja.left, top: caja.top, right: caja.right, bottom: caja.bottom, width: caja.width, height: caja.height, orden: caja.width >= caja.height ? ACOSTADA : PARADA };
  }
  const medio = camino.getPointAtLength(camino.getTotalLength() / 2);
  const p = new DOMPoint(medio.x, medio.y).matrixTransform(pantalla);
  return { left: p.x - MEDIO, top: p.y - MEDIO, right: p.x + MEDIO, bottom: p.y + MEDIO, width: MEDIO * 2, height: MEDIO * 2 };
}

/** The element of a node or an arrow, to give it back the focus. */
export function elementoEnLienzo(contenedor, { nodo, flecha }) {
  const id = CSS.escape(nodo ?? flecha);
  return contenedor.current?.querySelector(nodo ? `.react-flow__node[data-id="${id}"]` : `.react-flow__edge[data-id="${id}"]`) ?? null;
}

/** The shape or the arrow an element of the sheet belongs to ({ nodo, flecha }, ids or undefined). */
export function cosaEn(el) {
  const nodo = el?.closest?.('.react-flow__node')?.getAttribute('data-id') ?? undefined;
  const flecha = nodo ? undefined : (el?.closest?.('.react-flow__edge')?.getAttribute('data-id') ?? el?.closest?.('[data-flecha]')?.getAttribute('data-flecha') ?? undefined);
  return { nodo, flecha };
}

/** Where the menu opens from the keyboard: on the shape or arrow with the focus, or in the middle of the sheet. */
export function lugarEnLienzo(contenedor) {
  const r = contenedor.current.getBoundingClientRect();
  const foco = document.activeElement;
  const { nodo, flecha } = cosaEn(foco);
  if ((nodo || flecha) && contenedor.current.contains(foco)) {
    const a = foco.getBoundingClientRect();
    return { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  }
  return { x: r.left + r.width / 2, y: r.top + Math.max(r.height - reservaAbajo(), r.height / 2) / 2 };
}

export default function GloboDelLienzo({ contenedor, cual, ...props }) {
  useStore((s) => s.transform);
  return <Globo dentro={contenedor} ancla={() => anclaEnLienzo(contenedor, cual)} reserva={reservaAbajo()} {...props} />;
}
