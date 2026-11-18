import { useCallback, useEffect, useRef, useState } from 'react';

// The full screen of a viewer (the PDF reader, an image): the browser's own where there is one, and where it's missing
// or refused (an iPhone only does it with a video) the viewer covers the screen with CSS: [data-pantalla='css'] in
// lector.css and previaPdf.css. Leaving it, by its button, Esc or the browser, keeps where the student was: `antes` runs
// right before the size changes (the reader anchors its pages there).

const pedir = (el) => (el.requestFullscreen ?? el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' });
const dejar = () => (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
const delNavegador = () => document.fullscreenElement ?? document.webkitFullscreenElement ?? null;
const sePuede = () => Boolean(document.fullscreenEnabled ?? document.webkitFullscreenEnabled);
// Right after leaving, the Esc that did it must not also close the sheet the viewer is in.
const GRACIA_MS = 350;
// Where a key is being typed, not a shortcut.
const CAMPO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

export const NOMBRE_ENTRAR = 'Pantalla completa';
export const NOMBRE_SALIR = 'Salir de pantalla completa';

/** { modo: null | 'api' | 'css', alternar, salir }. `conTecla`: F toggles it, with the focus in the viewer or in the
 * sheet it is in (for viewers without keys of their own; the reader puts F among its own). */
export function usePantallaCompleta(ref, { antes, conTecla = false } = {}) {
  const [modo, setModo] = useState(null);
  const actual = useRef(null);
  const salioEn = useRef(0);
  const avisar = useRef(antes);
  useEffect(() => {
    avisar.current = antes;
  });

  const poner = useCallback((nuevo) => {
    if (actual.current && !nuevo) salioEn.current = Date.now();
    actual.current = nuevo;
    setModo(nuevo);
  }, []);

  const conCss = useCallback(() => {
    avisar.current?.();
    poner('css');
  }, [poner]);

  const entrar = useCallback(() => {
    const el = ref.current;
    if (!el || actual.current) return;
    if (!sePuede()) {
      conCss();
      return;
    }
    avisar.current?.();
    let pedido;
    try {
      pedido = pedir(el);
    } catch {
      pedido = Promise.reject();
    }
    if (pedido?.then) {
      pedido.catch(() => {
        if (delNavegador() !== el) conCss();
      });
    } else {
      // An old Safari answers with nothing: if after a moment it isn't in full screen, it was refused.
      setTimeout(() => {
        if (delNavegador() !== el && !actual.current) conCss();
      }, 400);
    }
  }, [ref, conCss]);

  const salir = useCallback(() => {
    if (!actual.current) return;
    avisar.current?.();
    if (actual.current === 'api' && delNavegador() === ref.current) {
      const r = dejar();
      if (r?.catch) r.catch(() => poner(null));
    } else {
      poner(null);
    }
  }, [ref, poner]);

  const alternar = useCallback(() => (actual.current ? salir() : entrar()), [entrar, salir]);

  // The browser says when it goes in or out: its button, Esc, F11, turning the phone.
  useEffect(() => {
    const alCambiar = () => {
      const adentro = delNavegador() === ref.current && ref.current !== null;
      if (adentro === (actual.current === 'api')) return;
      avisar.current?.();
      poner(adentro ? 'api' : null);
    };
    document.addEventListener('fullscreenchange', alCambiar);
    document.addEventListener('webkitfullscreenchange', alCambiar);
    return () => {
      document.removeEventListener('fullscreenchange', alCambiar);
      document.removeEventListener('webkitfullscreenchange', alCambiar);
    };
  }, [ref, poner]);

  // Esc on the sheet: first it leaves the full screen (the browser usually does it by itself, and then this does
  // nothing), and it doesn't close the sheet while in it or just out of it.
  useEffect(() => {
    const dialogo = ref.current?.closest('dialog');
    if (!dialogo) return undefined;
    const alCancelar = (e) => {
      if (actual.current) {
        e.preventDefault();
        salir();
      } else if (Date.now() - salioEn.current < GRACIA_MS) {
        e.preventDefault();
      }
    };
    dialogo.addEventListener('cancel', alCancelar);
    return () => dialogo.removeEventListener('cancel', alCancelar);
  }, [ref, salir]);

  useEffect(() => {
    if (!conTecla) return undefined;
    const alTeclear = (e) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
      const caja = ref.current?.closest('dialog') ?? ref.current;
      if (!caja || !(e.target instanceof Element) || !caja.contains(e.target) || e.target.closest(CAMPO)) return;
      // A confirmation over the viewer: its keys are its own.
      if (document.querySelector('dialog.dialogo[open]')) return;
      e.preventDefault();
      alternar();
    };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [conTecla, ref, alternar]);

  // Closing the viewer while in it: out of the browser's full screen too.
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el && delNavegador() === el) dejar()?.catch?.(() => {});
    };
  }, [ref]);

  return { modo, alternar, salir };
}

const ENTRAR = 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5';
const SALIR = 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5';

/** The button: «Pantalla completa», and inside it «Salir de pantalla completa». */
/** `conNombre`: the name in sight, next to the drawing (the reader's «Más herramientas» on a phone). */
export function BotonPantalla({ modo, onClick, className, atajo, conNombre = false }) {
  const nombre = modo ? NOMBRE_SALIR : NOMBRE_ENTRAR;
  return (
    <button type="button" className={className} aria-pressed={Boolean(modo)} aria-keyshortcuts={atajo} title={conNombre ? undefined : nombre} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={modo ? SALIR : ENTRAR} /></svg>
      <span className={conNombre ? undefined : 'solo-lectores'}>{nombre}</span>
    </button>
  );
}
