import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { textoError } from '../lib/errores';
import { cargarGustos, marcarMeGusta } from '../lib/resumenes';
import { Icono } from './Simbolo';
import { useUI } from './ui';

// The «me gusta» of a summary of El Santo Resumen, with the linked account: in Resúmenes (pages/Resumenes.jsx) and in a
// summary on a live session's table (enVivo/herramientas/Resumen.jsx), the same.

// The likes of the linked account. Until it is known which ones are yours, the heart waits; if that cannot be known,
// only how many each one has shows. Each one answers at once and goes back if El Santo Resumen says no.
export function useGustos(llave, alCortar) {
  const { avisar } = useUI();
  const cortar = useRef(alCortar);
  // The account linked now, for an answer that comes back after it changed.
  const vigente = useRef(llave);
  useLayoutEffect(() => {
    cortar.current = alCortar;
    vigente.current = llave;
  });
  // What El Santo Resumen says this account likes: no ids while it comes, or if it could not say.
  const [cargados, setCargados] = useState({ llave: null, ids: null, fallo: false });
  // On top of that, what was touched here since: by id, whether it is yours now. An answer that comes late does not undo it.
  const [tocados, setTocados] = useState(() => new Map());
  // How many each one has after touching it, with how many its row had then: if the bank brings another number, that one goes.
  const [cuentas, setCuentas] = useState(() => new Map());
  const [cambiando, setCambiando] = useState(() => new Set());
  // Another account starts from nothing.
  const [deLlave, setDeLlave] = useState(llave);
  if (deLlave !== llave) {
    setDeLlave(llave);
    setTocados(new Map());
    setCuentas(new Map());
    setCambiando(new Set());
  }

  useEffect(() => {
    if (!llave) return undefined;
    let vale = true;
    cargarGustos(llave).then(
      (ids) => {
        if (vale) setCargados({ llave, ids, fallo: false });
      },
      (e) => {
        if (!vale) return;
        if (e.codigo === 'llave') cortar.current(llave);
        else setCargados({ llave, ids: null, fallo: true });
      },
    );
    return () => {
      vale = false;
    };
  }, [llave]);

  const { ids, fallo } = cargados.llave === llave ? cargados : { ids: null, fallo: false };
  const mio = (id) => (tocados.has(id) ? tocados.get(id) : Boolean(ids?.has(id)));
  const cuenta = (r) => {
    const delBanco = r.meGusta ?? 0;
    const local = cuentas.get(r.id);
    return local && local.base === delBanco ? local.n : delBanco;
  };
  const tocar = (id, si) => setTocados((t) => new Map(t).set(id, si));
  const contar = (r, n) => setCuentas((c) => new Map(c).set(r.id, { n, base: r.meGusta ?? 0 }));
  const marcar = (id, si) => setCambiando((c) => {
    const nuevos = new Set(c);
    if (si) nuevos.add(id);
    else nuevos.delete(id);
    return nuevos;
  });

  const alternar = async (r) => {
    if (!llave || !ids || cambiando.has(r.id)) return;
    const si = !mio(r.id);
    const antes = cuenta(r);
    tocar(r.id, si);
    contar(r, Math.max(0, antes + (si ? 1 : -1)));
    marcar(r.id, true);
    let res = null;
    let falla = null;
    try {
      res = await marcarMeGusta(llave, r.id, si);
    } catch (e) {
      falla = e;
    }
    // Said for an account that is no longer the one linked here: nothing of it is this one's.
    if (vigente.current !== llave) return;
    marcar(r.id, false);
    if (res) {
      tocar(r.id, res.mio);
      contar(r, res.meGusta);
      return;
    }
    tocar(r.id, !si);
    contar(r, antes);
    if (falla.codigo === 'llave') cortar.current(llave);
    else avisar(textoError(falla), 'error');
  };
  return { activo: Boolean(llave) && !fallo, listo: Boolean(ids), mio, cuenta, alternar };
}

// With the account linked, a button, that waits until it is known which ones are yours. Without it, or if that cannot
// be known, only how many it has.
export function MeGusta({ r, gustos }) {
  const n = gustos.cuenta(r);
  if (!gustos.activo) {
    if (!n) return null;
    return (
      <span className="megusta megusta--quieto">
        <Icono nombre="corazon" tamano="mini" />
        {n}<span className="solo-lectores"> me gusta</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="megusta"
      aria-pressed={gustos.mio(r.id)}
      aria-disabled={gustos.listo ? undefined : 'true'}
      onClick={() => gustos.alternar(r)}
    >
      <Icono nombre="corazon" tamano="mini" />
      {n}<span className="solo-lectores"> me gusta, {r.titulo}</span>
    </button>
  );
}
