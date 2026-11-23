import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { textoError } from './errores';
import { desdeLoGuardado } from './sesion';

// Corre una función async al montar (y cuando cambian las dependencias) y expone su resultado.
// `recargar` la vuelve a correr sin vaciar los datos de antes.
// `alInstante`: for a function that only reads the campus through conCache (campus.js). While it asks, the screen
// shows what was kept (in memory past its time, or from the disk with «Seguir conectado»), and changes when the
// fresh answer comes. `cargando` stays true until then. Asks the campus exactly as without it.
export function useConsulta(fn, deps = [], { alInstante = false } = {}) {
  const [estado, setEstado] = useState({ datos: undefined, error: '', cargando: true });
  const vuelta = useRef(0);
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const correr = useCallback(async (deLoGuardado) => {
    const mia = ++vuelta.current;
    let llego = false;
    setEstado((e) => ({ ...e, cargando: true }));
    if (deLoGuardado) {
      const sigue = () => mia === vuelta.current && !llego;
      desdeLoGuardado(fnRef.current, sigue).then((r) => {
        if (r && sigue()) setEstado({ datos: r.datos, error: '', cargando: true });
      });
    }
    try {
      const datos = await fnRef.current();
      llego = true;
      if (mia === vuelta.current) setEstado({ datos, error: '', cargando: false });
    } catch (error) {
      llego = true;
      if (mia === vuelta.current) setEstado((e) => ({ ...e, error: textoError(error), cargando: false }));
    }
  }, []);
  const recargar = useCallback(() => correr(false), [correr]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { correr(alInstante); }, deps);

  return { ...estado, recargar };
}
