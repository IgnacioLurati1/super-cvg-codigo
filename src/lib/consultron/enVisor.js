// Consultron inside the PDF reader (components/consultron/EnVisor.jsx): the reader opens in a modal sheet, which leaves
// the corner out of reach, so the chat opens beside the pages. Whether it's open stays for the tab: a source that opens
// another PDF opens it with the chat. Small on purpose: the reader reads it without bringing the rest of Consultron.
import { useSyncExternalStore } from 'react';
import { useAjustes } from '../ajustes';
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

/** Whether Consultron is here for the reader: on a computer, unless hidden from the menu. Also where the computer can't
 * run the model: Gemini answers there, and the chat offers it (Ignacio, 22/11/2026). */
export function useHayConsultron() {
  const escritorio = useEscritorio();
  const oculta = useAjustes().menu.lugares.consultron === 'oculta';
  return escritorio && !oculta;
}
