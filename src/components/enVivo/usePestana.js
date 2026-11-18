import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

// The `mesa` prop a tool of the table receives (contract in src/lib/enVivo/herramientas.js), from the session and the
// tab. `siguiendo` is the id of the person this browser follows (or null); `soltar` stops following.
const CADA_VISTA = 120;

export function useVersion(sesion) {
  return useSyncExternalStore(sesion.suscribir, sesion.version, sesion.version);
}

const sinIr = () => {};

export function usePestana(sesion, id, { siguiendo = null, soltar = () => {}, irA = sinIr, recienAbierta = false } = {}) {
  const version = useVersion(sesion);
  const datos = useMemo(() => sesion.doc.getMap(`h:${id}`), [sesion, id]);

  const marcar = useCallback((estado) => {
    const h = sesion.conciencia.getLocalState()?.h ?? {};
    const nuevo = { ...h };
    if (estado == null) delete nuevo[id];
    else nuevo[id] = estado;
    sesion.marcarLocal('h', nuevo);
  }, [sesion, id]);

  // The view goes out at most every so often; the last one always does.
  const ultima = useRef(null);
  const reloj = useRef(null);
  const mover = useCallback((vista) => {
    ultima.current = vista;
    if (reloj.current) return;
    reloj.current = setTimeout(() => {
      reloj.current = null;
      const v = sesion.conciencia.getLocalState()?.v ?? {};
      sesion.marcarLocal('v', { ...v, [id]: ultima.current });
    }, CADA_VISTA);
  }, [sesion, id]);
  useEffect(() => () => clearTimeout(reloj.current), []);

  const paraConsultron = useCallback((fn) => sesion.paraConsultron(id, fn), [sesion, id]);
  const textosDeLaMesa = useCallback(() => sesion.textos(), [sesion]);
  const paraGuardar = useCallback((fn) => sesion.paraGuardar(id, fn), [sesion, id]);

  return useMemo(() => {
    const todos = sesion.otros();
    const otros = todos.filter((o) => o.p === id).map((o) => ({ id: o.id, nombre: o.nombre, color: o.color, h: o.h?.[id] ?? null }));
    const guia = siguiendo ? todos.find((o) => o.id === siguiendo) : null;
    const vista = guia && guia.p === id ? guia.v?.[id] ?? null : null;
    return { doc: sesion.doc, datos, id, yo: sesion.yo, conciencia: sesion.conciencia, presente: sesion.presente, marcar, otros, vista, mover, soltar, archivos: sesion.archivos, paraConsultron, textosDeLaMesa, paraGuardar, irA, recienAbierta };
    // `version` changes whenever someone moves or marks: the others and the view are read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, id, datos, marcar, mover, soltar, siguiendo, paraConsultron, textosDeLaMesa, paraGuardar, irA, recienAbierta, version]);
}
