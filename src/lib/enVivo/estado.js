import { useSyncExternalStore } from 'react';

// The live session of this tab, if there is one: the rest of the site asks here (to offer «Llevar a la sesión»).
// Entering and leaving live in conexion.js; this only holds the current one.
let actual = null;
const oyentes = new Set();

export const sesionEnVivo = () => actual;
export function fijarSesionEnVivo(s) {
  actual = s;
  oyentes.forEach((f) => f());
}
const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};
/** { sesion, codigo, ... } of the current live session, or null. */
export const useSesionEnVivo = () => useSyncExternalStore(suscribir, sesionEnVivo, sesionEnVivo);
