// Registers the service worker (dist/sw.js, scripts/trabajador.mjs), so the site opens without internet. Only in the
// published build: in dev it would keep old files, and the browser tests (flujos) intercept requests it would answer.
// After the page loaded, so it doesn't compete with what the student came to see.
// The worker keeps the main screens when installing and every other one when it is opened. The rest of the site comes
// in the background only when puedeBajarTodo says so: mobile data is scarce.

import { ajustesActuales } from './ajustes';
import { escucharAhorro } from './ahorro';

const LENTAS = new Set(['slow-2g', '2g', '3g']);

/**
 * Whether the rest of the site may be downloaded ahead: on wifi or a cable, or where the browser doesn't say what the
 * connection is (a computer). Never with «Ahorro de datos» or on a slow connection. The setting «Ahorro de datos» of
 * Configuración (ahorro.js) decides first: «Siempre» never downloads ahead, «Nunca» always does.
 */
export function puedeBajarTodo(conexion = typeof navigator === 'undefined' ? undefined : navigator.connection, modo = ajustesActuales().ahorro) {
  if (modo === 'siempre') return false;
  if (modo === 'nunca') return true;
  if (!conexion) return true;
  if (conexion.saveData) return false;
  if (LENTAS.has(conexion.effectiveType)) return false;
  return conexion.type === undefined || conexion.type === 'wifi' || conexion.type === 'ethernet';
}

/** The files of assets/ this page already loaded, as paths from the base: the worker keeps them without downloading. */
export function yaCargadas(base, entradas = performance.getEntriesByType('resource')) {
  const raiz = new URL(base, location.href).href;
  return [...new Set(entradas.map((e) => e.name.split(/[?#]/)[0]).filter((n) => n.startsWith(`${raiz}assets/`)).map((n) => n.slice(raiz.length)))];
}

export function registrarTrabajador() {
  if (!import.meta.env.PROD || import.meta.env.MODE === 'flujos' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  let trabajador = null;
  const avisar = (mensaje) => (navigator.serviceWorker.controller ?? trabajador?.active)?.postMessage(mensaje);
  const decidir = () => avisar({ tipo: puedeBajarTodo() ? 'bajar-todo' : 'frenar' });
  const registrar = () =>
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base, updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then((listo) => {
        trabajador = listo;
        avisar({ tipo: 'guardar', rutas: yaCargadas(base) });
        decidir();
        // On a phone, the connection changes: from mobile data to wifi, and back. The setting may change too.
        escucharAhorro(decidir);
        // A new version of the site takes over: it asks again, for its own files.
        navigator.serviceWorker.addEventListener('controllerchange', decidir);
      })
      .catch(() => {});
  if (document.readyState === 'complete') registrar();
  else window.addEventListener('load', registrar, { once: true });
}
