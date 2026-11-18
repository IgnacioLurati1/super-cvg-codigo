import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { plegarSeccion } from './mio';
import { sinMovimiento } from './movimiento';

// What the sections of a course do the same in a campus course (Materia.jsx) and in one of one's own (Propia.jsx):
// folding to their title and the «Subir» and «Bajar» of their handle.

// Folding and opening a section changes its height, briefly. Without it with less motion, here or in the settings.
const PLIEGUE = { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' };
const quieto = () => sinMovimiento() || ['reducido', 'ninguno'].includes(document.documentElement.dataset.movimiento);

/**
 * Folds a section to its title or opens it, saved in the course `materiaId` (its number, or the id of one of one's
 * own). `plegadas`: the ones folded now. `cuerpoDe(id)`: the id of the part that folds. Folding goes down to its title
 * and saves it at the end; opening saves it first and grows after. A touch in the middle turns it back from where it
 * is. Returns `alternar(seccion)`.
 */
export function usePliegue(materiaId, plegadas, cuerpoDe) {
  // The sections folding or opening right now, and the one that was just opened (it grows from its title).
  const pliegues = useRef(new Map());
  const abriendo = useRef(null);

  const animarCuerpo = (id, cuerpo, desde, hasta, cierra) => {
    cuerpo.style.overflow = 'hidden';
    const anim = cuerpo.animate({ height: [`${desde}px`, `${hasta}px`] }, { ...PLIEGUE, fill: cierra ? 'forwards' : 'none' });
    pliegues.current.set(id, { anim, cierra });
    anim.onfinish = () => {
      pliegues.current.delete(id);
      if (!cierra) {
        cuerpo.style.overflow = '';
        return;
      }
      plegarSeccion(materiaId, id, true);
      // Hidden now: what held it at its title can go.
      requestAnimationFrame(() => {
        anim.cancel();
        cuerpo.style.overflow = '';
      });
    };
  };

  useLayoutEffect(() => {
    const id = abriendo.current;
    if (id === null) return;
    abriendo.current = null;
    const cuerpo = document.getElementById(cuerpoDe(id));
    if (cuerpo && !cuerpo.hidden) animarCuerpo(id, cuerpo, 0, cuerpo.scrollHeight, false);
  });

  return (seccion) => {
    const { id } = seccion;
    const cuerpo = document.getElementById(cuerpoDe(id));
    const previo = pliegues.current.get(id);
    const alto = cuerpo && !cuerpo.hidden ? cuerpo.getBoundingClientRect().height : 0;
    if (previo) {
      previo.anim.onfinish = null;
      previo.anim.cancel();
      pliegues.current.delete(id);
    }
    if (!cuerpo?.animate || quieto()) {
      plegarSeccion(materiaId, id, !plegadas.includes(id));
      return;
    }
    if (plegadas.includes(id)) {
      abriendo.current = id;
      if (!plegarSeccion(materiaId, id, false)) abriendo.current = null;
      return;
    }
    // The button says it at once, for a screen reader; the state follows when the body finishes closing.
    document.querySelector(`[aria-controls="${cuerpoDe(id)}"]`)?.setAttribute('aria-expanded', String(Boolean(previo?.cierra)));
    if (previo?.cierra) animarCuerpo(id, cuerpo, alto, cuerpo.scrollHeight, false);
    else animarCuerpo(id, cuerpo, alto, 0, true);
  };
}

/**
 * The section whose «Subir» and «Bajar» are open, from a tap on its handle (`manijaDe(id)`: the id of the handle).
 * Open, it closes with Escape (the focus back on its handle) or with a tap anywhere else. `enfocarMover`: the id of the
 * button to focus once the section moved.
 */
export function useMoverConManija(manijaDe) {
  const [moviendo, setMoviendo] = useState(null);
  const enfocarMover = useRef(null);
  useLayoutEffect(() => {
    const id = enfocarMover.current;
    if (!id) return;
    enfocarMover.current = null;
    document.getElementById(id)?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (moviendo === null) return undefined;
    const manija = () => document.getElementById(manijaDe(moviendo));
    const alTeclear = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setMoviendo(null);
      manija()?.focus();
    };
    const alApretar = (e) => {
      if (e.target.closest?.('.seccion__mover') || manija()?.contains(e.target)) return;
      setMoviendo(null);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alApretar);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('pointerdown', alApretar);
    };
    // Only when another one opens or it closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moviendo]);
  return { moviendo, setMoviendo, enfocarMover };
}
