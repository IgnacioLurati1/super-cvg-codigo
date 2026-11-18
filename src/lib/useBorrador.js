import { useCallback, useEffect, useState } from 'react';

// Lo que se va escribiendo en un formulario largo queda guardado en el navegador: si se cierra sin querer, sigue
// ahí. Nunca para contraseñas ni datos sensibles. `limpiar` al mandar. Si el navegador no deja guardar, anda igual.
export function useBorrador(clave, inicial) {
  const [datos, setDatos] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado ? { ...inicial, ...JSON.parse(guardado) } : inicial;
    } catch {
      return inicial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(datos));
    } catch {
      // Sin almacenamiento, queda solo mientras la pantalla está abierta.
    }
  }, [clave, datos]);

  const cambiar = useCallback((cambios) => setDatos((d) => ({ ...d, ...cambios })), []);
  const limpiar = useCallback(() => {
    try {
      localStorage.removeItem(clave);
    } catch {
      // Nada que limpiar.
    }
    setDatos(inicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  return [datos, cambiar, limpiar];
}
