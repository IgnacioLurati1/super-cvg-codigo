import { useEffect, useSyncExternalStore } from 'react';
import { campanaCompartible, campanaDisponible, recibirCampana, reiniciarCampana, revisarCampana } from './campana';
import { contarSinLeer } from './campus';
import { avisarPestanas, escucharPestanas, hayPestanas, huellaDeLaSesion } from './pestanas';
import { tokenActual } from './sesion';

// The number on the envelope: conversations with unread messages. Asked when a session starts and every two minutes
// while a tab of it is visible, nothing else. Mensajes corrects it when it marks a conversation as read. Only in memory.
// The bell of the notifications (campana.js) asks its count on the same clock: no other one.
// One clock for all the tabs of a session: the visible one that holds the lock (navigator.locks) asks, and tells the
// others (pestanas.js). Without locks or BroadcastChannel each tab keeps its own clock.
export const CADA = 2 * 60_000;
/** How long a tab that opens waits for another of the session to tell it the count, before asking the campus. */
export const ESPERA_CUENTA = 300;

const CUENTA = 'sinLeer.cuenta';
const PREGUNTA = 'sinLeer.pregunta';

let cuantos = 0;
// When the campus was last asked, by any tab of the session (ms), or 0.
let ultima = 0;
const avisados = new Set();
const fijar = (n) => {
  if (n === cuantos) return;
  cuantos = n;
  avisados.forEach((f) => f());
};
// A correction made here (Mensajes) goes to the other tabs too.
const corregir = (n) => {
  fijar(n);
  if (ultima) avisarPestanas(tokenActual(), CUENTA, { mensajes: cuantos, ultima });
};

/** One conversation less: Mensajes just marked it as read. */
export const restarSinLeer = () => corregir(Math.max(0, cuantos - 1));
/** What Mensajes read in the list, when it says more than the envelope. */
export const alMenosSinLeer = (n) => corregir(Math.max(cuantos, n));

const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

/** The count as it is, without asking the campus: for screens other than the header. */
export const useNumeroSinLeer = () => useSyncExternalStore(suscribir, () => cuantos, () => 0);

const conCerrojo = () => typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function' && hayPestanas();

/** The count for the session `token`. A campus that leaves the messages closed stops the asking for this session. */
export function useSinLeer(token) {
  const n = useNumeroSinLeer();

  useEffect(() => {
    fijar(0);
    ultima = 0;
    reiniciarCampana();
    if (!token) return undefined;
    let viva = true;
    let reloj = null;
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
    const contar = () => avisarPestanas(token, CUENTA, { mensajes: cuantos, cerrado, ultima, campana: campanaCompartible() });
    const parar = () => {
      clearInterval(reloj);
      clearTimeout(reloj);
      reloj = null;
    };
    const pedir = async () => {
      ultima = Date.now();
      await Promise.all([contarMensajes(), revisarCampana(token)]);
      if (!viva || tokenActual() !== token) return;
      contar();
      if (todoCerrado()) dejar();
    };
    // Asks now if the last time was two minutes ago or more, then every two minutes.
    const andar = () => {
      parar();
      if (todoCerrado()) return;
      const falta = ultima ? ultima + CADA - Date.now() : 0;
      if (falta <= 0) pedir();
      reloj = setTimeout(() => {
        pedir();
        reloj = setInterval(pedir, CADA);
      }, falta <= 0 ? CADA : falta);
    };

    // What another tab of the session asked: the same number here, without asking.
    const callar = [
      escucharPestanas(CUENTA, tokenActual, (m, t) => {
        if (!viva || t !== token || !Number.isFinite(m.ultima) || m.ultima < ultima) return;
        ultima = m.ultima;
        if (Number.isSafeInteger(m.mensajes) && m.mensajes >= 0) fijar(m.mensajes);
        if (m.cerrado === true) cerrado = true;
        if (m.campana) recibirCampana(m.campana);
        // This tab's clock, if it has one, counts from that time.
        if (reloj !== null && !todoCerrado()) andar();
      }),
      escucharPestanas(PREGUNTA, tokenActual, (m, t) => {
        if (viva && t === token && ultima) contar();
      }),
    ];

    // Without locks: this tab's own clock, while it is visible, as always.
    let soltar = null;
    let pidiendo = null;
    let seguir;
    let dejar;
    if (!conCerrojo()) {
      dejar = parar;
      seguir = () => {
        if (document.visibilityState !== 'visible') return parar();
        andar();
      };
    } else {
      // With locks: only the visible tab holding the lock of this session has the clock. Hiding lets it go.
      dejar = () => {
        parar();
        soltar?.();
        soltar = null;
        pidiendo?.abort();
        pidiendo = null;
      };
      seguir = () => {
        if (document.visibilityState !== 'visible' || todoCerrado()) return dejar();
        if (soltar || pidiendo) return;
        const esta = new AbortController();
        pidiendo = esta;
        huellaDeLaSesion(token).then((huella) => {
          if (!huella || pidiendo !== esta) return;
          navigator.locks.request(`super-cvg-sin-leer-${huella}`, { signal: esta.signal }, () => new Promise((ok) => {
            if (pidiendo !== esta || !viva) return ok();
            pidiendo = null;
            soltar = ok;
            andar();
          })).catch(() => {});
        });
      };
    }

    // A tab that opens asks the others first: if one already knows the count, the campus isn't asked again.
    let espera = null;
    const arrancar = () => {
      espera = null;
      if (!viva) return;
      // Opened behind another tab, nobody knows the count yet: asked once, as when a session starts.
      if (!ultima && document.visibilityState !== 'visible') pedir();
      seguir();
      document.addEventListener('visibilitychange', seguir);
    };
    if (hayPestanas()) {
      avisarPestanas(token, PREGUNTA);
      espera = setTimeout(arrancar, ESPERA_CUENTA);
    } else {
      arrancar();
    }
    return () => {
      viva = false;
      clearTimeout(espera);
      dejar?.();
      callar.forEach((f) => f());
      document.removeEventListener('visibilitychange', seguir);
    };
  }, [token]);

  return token ? n : 0;
}
