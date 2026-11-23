import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ajustesActuales, escucharAjustes, MODOS_AHORRO } from './ajustes';

// The data saver: the one place that says whether to save the student's mobile data. On, what downloads without the
// student asking waits for them (idle prefetches, the photos of the summaries' cards, the 3D of the sign-in); nothing
// they ask for is hidden. «Ahorro de datos» in Configuración (`ahorro` in cl.ajustes, per device): automatic follows
// the browser's own data saver and the speed of the connection, and changes with it.

export { MODOS_AHORRO };

// What the browser calls a slow connection (Network Information API): from 3G down.
const LENTAS = ['slow-2g', '2g', '3g'];

const conexionActual = () => (typeof navigator === 'undefined' ? undefined : navigator.connection);

/** Whether the connection asks to save: the browser's data saver on, or a slow connection. Unknown is not. */
export function conexionLimitada(conexion = conexionActual()) {
  if (!conexion) return false;
  return conexion.saveData === true || LENTAS.includes(conexion.effectiveType);
}

/** Whether to save data now: the setting, and with «Automático» the connection. A plain function, for code outside
 * the screens (the service worker's registration). */
export function ahorrarDatos({ modo = ajustesActuales().ahorro, conexion = conexionActual() } = {}) {
  if (modo === 'siempre') return true;
  if (modo === 'nunca') return false;
  return conexionLimitada(conexion);
}

/** Calls `avisar` when the answer may have changed: the setting, or the connection. Returns the way to stop. */
export function escucharAhorro(avisar) {
  const conexion = conexionActual();
  conexion?.addEventListener?.('change', avisar);
  const dejar = escucharAjustes(avisar);
  return () => {
    conexion?.removeEventListener?.('change', avisar);
    dejar();
  };
}

/** The same, for a screen: it renders again when it changes. */
export const useAhorro = () => useSyncExternalStore(escucharAhorro, () => ahorrarDatos(), () => false);

/** A download ahead of time, that nobody asked for yet: `adelantar` runs while `cuando` holds and data isn't being
 * saved, again when `clave` changes, and may return its cleanup. Turning the saver off later lets it run then. */
export function useAdelantar(adelantar, cuando = true, clave = null) {
  const ahorro = useAhorro();
  const actual = useRef(adelantar);
  useEffect(() => {
    actual.current = adelantar;
  });
  useEffect(() => (cuando && !ahorro ? actual.current() : undefined), [cuando, ahorro, clave]);
}
