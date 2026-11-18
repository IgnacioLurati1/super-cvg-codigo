import { useAjustes } from './ajustes';
import { useMio } from './mio';

/** Whether something is already marked as seen in any course. */
export const hayVistos = (mio) => Object.values(mio?.materias ?? {}).some((m) => m?.vistos?.length > 0);

/** «Marcar lo que ya viste», in Configuración: the button on each thing, the «Sin ver» filter and how much of a course
 * was seen. Off by default, because most students don't use it. Whoever marked something before the setting existed
 * keeps it on until they choose: their marks don't vanish. */
export function useMarcarVistos() {
  const elegido = useAjustes().vistos;
  const mio = useMio();
  return elegido ?? hayVistos(mio);
}
