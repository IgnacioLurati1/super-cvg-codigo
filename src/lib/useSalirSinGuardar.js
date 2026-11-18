import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useUI } from '../components/ui';

// Con cambios sin guardar, avisa antes de salir. Dentro del panel (otra pantalla, u otra pestaña de la
// misma, que cambia ?ver=) con la confirmación de siempre; al cerrar o recargar la pestaña del
// navegador, con el aviso del navegador. 
export const sale = ({ currentLocation: de, nextLocation: a }) => de.pathname !== a.pathname || de.search !== a.search;

export function useSalirSinGuardar(sucio) {
  const { confirmar } = useUI();
  const ref = useRef(sucio);
  useEffect(() => {
    ref.current = sucio;
  });
  const frenar = useCallback((cambio) => ref.current && sale(cambio), []);
  const blocker = useBlocker(frenar);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirmar({
      titulo: '¿Salir sin guardar?',
      texto: 'Se pierden los cambios que no guardaste.',
      boton: 'Salir sin guardar',
      volver: 'Seguir editando',
      peligro: true,
    }).then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirmar]);

  useEffect(() => {
    if (!sucio) return undefined;
    const avisar = (e) => e.preventDefault();
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [sucio]);
}
