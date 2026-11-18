// Consultron inside the PDF reader (components/consultron/EnVisor.jsx): the reader opens in a modal sheet, which leaves
// the corner out of reach, so the chat opens beside the pages. Whether it's open stays for the tab: a source that opens
// another PDF opens it with the chat. Small on purpose: the reader reads it without bringing the rest of Consultron.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAjustes } from '../ajustes';
import { revisarCompu } from './compu';
import { usePermisosNube } from './nube';
import { useEscritorio } from './panel';

let abierto = false;
const avisados = new Set();

export function ponerEnVisor(valor) {
  if (abierto === valor) return;
  abierto = valor;
  avisados.forEach((f) => f());
}

const escuchar = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

export const useEnVisor = () => useSyncExternalStore(escuchar, () => abierto, () => false);

// Whether this browser can run it, looked at once per tab.
let compu = null;

/** Whether Consultron is here for the reader: a computer that runs it, and not hidden from the menu. `resumen`: a
 * summary of El Santo Resumen, which Gemini answers on a computer that can't run Consultron, with its permission. */
export function useHayConsultron({ resumen = false } = {}) {
  const permisos = usePermisosNube();
  const escritorio = useEscritorio();
  const oculta = useAjustes().menu.lugares.consultron === 'oculta';
  const [puede, setPuede] = useState(compu);
  useEffect(() => {
    if (compu !== null || !escritorio) return undefined;
    let vivo = true;
    revisarCompu()
      .then((r) => r.puede)
      .catch(() => false)
      .then((si) => {
        compu = si;
        if (vivo) setPuede(si);
      });
    return () => {
      vivo = false;
    };
  }, [escritorio]);
  return escritorio && !oculta && (Boolean(puede) || (resumen && Boolean(permisos.resumenes)));
}
