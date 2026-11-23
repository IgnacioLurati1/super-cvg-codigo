// The queue of porMandar.js for this tab, joined to the campus: what sends (campus.js), the session (sesion.js) and the
// other tabs (pestanas.js). It tries when the network comes back, when the tab comes into view and, while something
// waits with the tab in view, every CADA. Layout starts it with the session, so what waits goes even outside Mensajes.
import { useEffect, useSyncExternalStore } from 'react';
import { buscarEnviado, escribirA, responderEn } from './campus';
import { textoError } from './errores';
import { esDemo } from './modoDemo';
import { avisarPestanas, escucharPestanas } from './pestanas';
import { alBorrarPorMandar, crearFila, ESPERA } from './porMandar';
import { sesionRecordada, tokenActual } from './sesion';

/** How often it tries again while something waits and the tab is in view, for a network that says it is there and
 * isn't (a wifi without internet). A message that may have got there is only read, never sent, until it is found. */
export const CADA = 30_000;
const CAMBIO = 'porMandar.cambio';

const sesion = () => {
  const token = tokenActual();
  return { token, recordada: Boolean(token) && sesionRecordada() && !esDemo(token) };
};

export const fila = crearFila({
  sesion,
  enviar: (x) => (x.destino.conversacionId
    ? responderEn(x.destino.conversacionId, x.texto, { despuesDe: x.despuesDe })
    : escribirA(x.destino.personaId, x.texto)),
  buscar: (x) => buscarEnviado({ ...x.destino, texto: x.texto, despuesDe: x.despuesDe }),
  explicar: textoError,
  avisar: (evento) => avisarPestanas(tokenActual(), CAMBIO, { evento }),
});

alBorrarPorMandar(() => fila.olvidar());

/** What waits, for the key of this tab. */
export const usePorMandar = () => useSyncExternalStore(fila.suscribir, fila.actuales, fila.actuales);

/** Starts the queue for the session `token`: what was waiting from before (a reload, «Seguir conectado») goes too. */
export function usePorMandarDeLaSesion(token) {
  useEffect(() => {
    if (!token) return undefined;
    const probar = () => fila.procesar();
    const alVolver = () => {
      if (document.visibilityState === 'visible') probar();
    };
    const reloj = setInterval(() => {
      if (document.visibilityState === 'visible' && fila.actuales().some((x) => x.estado === ESPERA)) probar();
    }, CADA);
    fila.refrescar().then(probar, () => {});
    window.addEventListener('online', probar);
    document.addEventListener('visibilitychange', alVolver);
    const dejar = escucharPestanas(CAMBIO, tokenActual, (m) => fila.deOtraPestana(m.evento));
    return () => {
      clearInterval(reloj);
      window.removeEventListener('online', probar);
      document.removeEventListener('visibilitychange', alVolver);
      dejar();
    };
  }, [token]);
}
