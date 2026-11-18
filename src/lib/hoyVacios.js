// Which blocks of Hoy had nothing to show the last time it was drawn: Hoy leaves them out, so the preview in
// Configuración marks them instead of drawing what the student won't see. Only the blocks' keys, only in memory.

const vacios = new Map();

/** `cambios`: block key to whether it was empty. A block that is still loading is left out. */
export function anotarVacios(cambios) {
  for (const [clave, vacio] of Object.entries(cambios)) vacios.set(clave, vacio);
}

export const estaVacio = (clave) => vacios.get(clave) === true;

export const olvidarVacios = () => vacios.clear();
