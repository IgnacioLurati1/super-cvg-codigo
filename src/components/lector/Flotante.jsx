import { useCallback, useEffect, useRef } from 'react';

// After the pointer or the focus leaves, at least this long before it goes away.
const MINIMO_MS = 2000;

/** A notice floating over the pages. With `ms` it goes away after that long (`onVencer`), but never while the pointer
 * or the focus is inside it. `enfocar`: the focus goes to its first button when it shows (the student's action took away
 * what had it). */
export default function Flotante({ ms = null, onVencer, enfocar = false, children }) {
  const caja = useRef(null);
  const fin = useRef(onVencer);
  const reloj = useRef({ t: null, queda: ms, desde: 0, pausas: new Set() });

  useEffect(() => {
    fin.current = onVencer;
  });

  const arrancar = useCallback(() => {
    const r = reloj.current;
    if (!ms || r.pausas.size) return;
    clearTimeout(r.t);
    r.desde = Date.now();
    r.t = setTimeout(() => fin.current?.(), r.queda);
  }, [ms]);

  const pausar = (motivo) => {
    const r = reloj.current;
    r.pausas.add(motivo);
    if (r.t === null) return;
    clearTimeout(r.t);
    r.t = null;
    r.queda = Math.max(MINIMO_MS, r.queda - (Date.now() - r.desde));
  };
  const seguir = (motivo) => {
    reloj.current.pausas.delete(motivo);
    arrancar();
  };

  useEffect(() => {
    const r = reloj.current;
    arrancar();
    return () => clearTimeout(r.t);
  }, [arrancar]);

  useEffect(() => {
    if (enfocar) caja.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [enfocar]);

  return (
    <div
      ref={caja}
      className="lector__flotante"
      // Where the focus goes to it, its button says what happened (aria-describedby).
      role={enfocar ? undefined : 'status'}
      onPointerEnter={() => pausar('puntero')}
      onPointerLeave={() => seguir('puntero')}
      onFocus={() => pausar('foco')}
      onBlur={(e) => {
        if (!caja.current?.contains(e.relatedTarget)) seguir('foco');
      }}
    >
      {children}
    </div>
  );
}
