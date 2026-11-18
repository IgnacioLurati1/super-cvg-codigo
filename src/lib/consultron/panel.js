// Whether Consultron's chat is open in its corner (Flotante.jsx), for the whole tab: the big screen (/consultron) shrinks
// back to it, and it stays open while the student moves around the site. Only in memory.
import { useSyncExternalStore } from 'react';
import { useAjustes } from '../ajustes';

let abierto = false;
const avisados = new Set();

function poner(valor) {
  if (abierto === valor) return;
  abierto = valor;
  avisados.forEach((f) => f());
}

export const abrirPanel = () => poner(true);
export const cerrarPanel = () => poner(false);
export const panelAbierto = () => abierto;

const escuchar = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

export const usePanel = () => useSyncExternalStore(escuchar, () => abierto, () => false);

// Consultron runs on a computer: the corner exists only with a mouse and a wide screen.
const ESCRITORIO = '(hover: hover) and (pointer: fine) and (min-width: 900px)';
const enEscritorio = () => typeof window !== 'undefined' && window.matchMedia(ESCRITORIO).matches;
const escucharPantalla = (f) => {
  const m = window.matchMedia(ESCRITORIO);
  m.addEventListener('change', f);
  return () => m.removeEventListener('change', f);
};

export const useEscritorio = () => useSyncExternalStore(escucharPantalla, enEscritorio, () => false);

/** Whether Consultron opens only in its box, from its button (Configuración, «Aparición»): where the box is, on a
 * computer and with Consultron not hidden from the menu. Elsewhere it opens as always. */
export function useSoloEnCaja() {
  const ajustes = useAjustes();
  const escritorio = useEscritorio();
  return escritorio && ajustes.consultronAparicion === 'modal' && ajustes.menu.lugares.consultron !== 'oculta';
}
