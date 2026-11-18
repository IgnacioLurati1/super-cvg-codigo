import { useEffect, useRef } from 'react';
import { cambiarMio, hayUsuario } from './mio';
import { esDemo } from './modoDemo';
import { tokenActual } from './sesion';

/** The demo starts with a few made-up cards wherever Repaso is opened (its page, or a session's Repaso en grupo), so a
 * round shows the first time. Only in development, with the demo account, once the student is known. */
export function useRepasoDeEjemplo(tarjetas) {
  const sembrado = useRef(false);
  useEffect(() => {
    if (sembrado.current || !import.meta.env.DEV || !esDemo(tokenActual()) || !hayUsuario() || tarjetas.length) return;
    sembrado.current = true;
    import('./demoRepaso').then(({ tarjetasDeEjemplo }) => cambiarMio((m) => (m.repaso.length ? m : { ...m, repaso: tarjetasDeEjemplo() })));
  }, [tarjetas]);
}
