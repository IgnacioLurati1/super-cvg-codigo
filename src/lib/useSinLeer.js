import { useEffect, useSyncExternalStore } from 'react';
import { campanaDisponible, reiniciarCampana, revisarCampana } from './campana';
import { contarSinLeer } from './campus';
import { tokenActual } from './sesion';

// The number on the envelope: conversations with unread messages. Asked when a session starts and every two minutes
// while the tab is visible, nothing else. Mensajes corrects it when it marks a conversation as read. Only in memory.
// The bell of the notifications (campana.js) asks its count on the same clock: no other one.
export const CADA = 2 * 60_000;

let cuantos = 0;
const avisados = new Set();
const fijar = (n) => {
  if (n === cuantos) return;
  cuantos = n;
  avisados.forEach((f) => f());
};

/** One conversation less: Mensajes just marked it as read. */
export const restarSinLeer = () => fijar(Math.max(0, cuantos - 1));
/** What Mensajes read in the list, when it says more than the envelope. */
export const alMenosSinLeer = (n) => fijar(Math.max(cuantos, n));

const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

/** The count as it is, without asking the campus: for screens other than the header. */
export const useNumeroSinLeer = () => useSyncExternalStore(suscribir, () => cuantos, () => 0);

/** The count for the session `token`. A campus that leaves the messages closed stops the asking for this session. */
export function useSinLeer(token) {
  const n = useNumeroSinLeer();

  useEffect(() => {
    fijar(0);
    reiniciarCampana();
    if (!token) return undefined;
    let reloj = null;
    let ultima = 0;
    let cerrado = false;
    // The clock stops when the campus left both closed.
    const todoCerrado = () => cerrado && !campanaDisponible();
    const contarMensajes = async () => {
      if (cerrado) return;
      try {
        const total = await contarSinLeer();
        // An answer about a session that already ended does not count.
        if (tokenActual() === token) fijar(total);
      } catch (error) {
        if (error?.codigo === 'sin_permiso' || error?.codigo === 'sin_mensajes') cerrado = true;
      }
    };
    const pedir = async () => {
      ultima = Date.now();
      await Promise.all([contarMensajes(), revisarCampana(token)]);
      if (todoCerrado()) clearInterval(reloj);
    };
    const seguir = () => {
      clearInterval(reloj);
      reloj = null;
      if (todoCerrado() || document.visibilityState !== 'visible') return;
      // Back to the tab after the two minutes: asked right away, then on the clock again.
      if (ultima && Date.now() - ultima >= CADA) pedir();
      reloj = setInterval(pedir, CADA);
    };
    pedir();
    seguir();
    document.addEventListener('visibilitychange', seguir);
    return () => {
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', seguir);
    };
  }, [token]);

  return token ? n : 0;
}
