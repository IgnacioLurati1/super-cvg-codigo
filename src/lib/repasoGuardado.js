import { cambiarMio, mioActual } from './mio';
import { MAX_TARJETAS, nuevoId, responder, sanearTarjeta } from './repaso';

// Changes to the cards of Repaso, through mio.js like everything of the student's (and so to their Drive).

/** Whether one more card fits. */
export const cabeOtra = () => mioActual().repaso.length < MAX_TARJETAS;

/** A new card: { frente, dorso, materia }. Returns its id, or null if it has no front or there is no room. */
export function crearTarjeta({ frente, dorso = '', materia = null }, ahora = Date.now()) {
  const tarjeta = sanearTarjeta({ id: nuevoId(ahora), frente, dorso, materia, creada: ahora });
  if (!tarjeta || !cabeOtra()) return null;
  cambiarMio((mio) => ({ ...mio, repaso: [...mio.repaso, tarjeta] }));
  return mioActual().repaso.some((t) => t.id === tarjeta.id) ? tarjeta.id : null;
}

/** Its texts or its course changed; when it comes back stays. */
export function cambiarTarjeta(id, { frente, dorso, materia }) {
  cambiarMio((mio) => ({
    ...mio,
    repaso: mio.repaso.map((t) => (t.id === id ? sanearTarjeta({ ...t, frente, dorso, materia }) ?? t : t)),
  }));
}

export const borrarTarjeta = (id) => cambiarMio((mio) => ({ ...mio, repaso: mio.repaso.filter((t) => t.id !== id) }));

/** An answer in a round: the card moves to the day it comes back. Returns the card as it is now. */
export function guardarRespuesta(id, respuesta, dia) {
  let despues = null;
  cambiarMio((mio) => ({
    ...mio,
    repaso: mio.repaso.map((t) => {
      if (t.id !== id) return t;
      despues = responder(t, respuesta, dia);
      return despues;
    }),
  }));
  return despues;
}
