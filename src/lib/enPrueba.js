// The design being tried from Diseños ({ id, nombre, codigo, ... }), in memory for the whole site: it follows the
// student to other screens until they use it or go back to theirs (BarraDePrueba.jsx), and Configuración is greyed out
// meanwhile. A reload or Salir ends it. Only who it is lives here, so the layout reads it without loading Diseños;
// painting it is disenos.js (probarDiseno, terminarPrueba).
import { useSyncExternalStore } from 'react';

let enPrueba = null;
const avisados = new Set();

export const disenoEnPrueba = () => enPrueba;

export function ponerEnPrueba(diseno) {
  if (enPrueba === diseno) return;
  enPrueba = diseno ?? null;
  avisados.forEach((f) => f());
}

/** El diseño que se está probando, o null. */
export function useDisenoEnPrueba() {
  return useSyncExternalStore((f) => {
    avisados.add(f);
    return () => avisados.delete(f);
  }, disenoEnPrueba, () => null);
}
