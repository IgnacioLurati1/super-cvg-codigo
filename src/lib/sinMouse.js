import { useSyncExternalStore } from 'react';
import { ajustesActuales, useAjustes } from './ajustes';

// «Modo sin mouse» (Configuración, Teclado; `ajustes.sinMouse`, off by default): the buttons that do what a drag does
// (Subir and Bajar of a section or a row, «Pasar a otra sección», Mover arriba and abajo in Fusionar, Consultron's size)
// only show with it on. A device without a mouse (a phone, a tablet) can't drag with one, so it keeps them anyway.
// The arrows on a handle or an edge work in both.

const CON_MOUSE = '(any-pointer: fine)';

const consulta = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CON_MOUSE) : null);

export const hayMouse = () => consulta()?.matches ?? true;

const suscribir = (avisar) => {
  const c = consulta();
  c?.addEventListener?.('change', avisar);
  return () => c?.removeEventListener?.('change', avisar);
};

/** Whether the buttons that replace a drag are shown: with «Modo sin mouse» on, or on a device without a mouse. */
export const botonesSinMouse = () => ajustesActuales().sinMouse || !hayMouse();

/** The same, for a component: it follows the setting and a mouse that's plugged in or out. */
export function useBotonesSinMouse() {
  const { sinMouse } = useAjustes();
  const mouse = useSyncExternalStore(suscribir, hayMouse, () => true);
  return sinMouse || !mouse;
}
