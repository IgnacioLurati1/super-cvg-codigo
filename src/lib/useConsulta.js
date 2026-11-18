import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { textoError } from './errores';

// Corre una función async al montar (y cuando cambian las dependencias) y expone su resultado.
// `recargar` la vuelve a correr sin vaciar los datos de antes.
export function useConsulta(fn, deps = []) {
  const [estado, setEstado] = useState({ datos: undefined, error: '', cargando: true });
  const vuelta = useRef(0);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const correr = useCallback(async () => {
    const mia = ++vuelta.current;
    setEstado((e) => ({ ...e, cargando: true }));
    try {
      const datos = await fnRef.current();
      if (mia === vuelta.current) setEstado({ datos, error: '', cargando: false });
    } catch (error) {
      if (mia === vuelta.current) setEstado((e) => ({ ...e, error: textoError(error), cargando: false }));
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { correr(); }, deps);

  return { ...estado, recargar: correr };
}
