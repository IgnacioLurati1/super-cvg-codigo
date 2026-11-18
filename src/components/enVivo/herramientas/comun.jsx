import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as Y from 'yjs';
import { colorSeguro } from '../../../lib/enVivo/documento';
import { crearSuave, fundir } from '../../../lib/enVivo/suave';
import './comun.css';

// What the Documento, the Pizarra and the Diagrama de flujo share: re-reading the shared data when it changes,
// following someone's view and the toolbar's icons.

/** A number that goes up each time `tipo` (a Y type) changes, by anyone: also what is under it, if `profundo`. */
export function useCambios(tipo, profundo = true) {
  const almacen = useMemo(() => {
    const cuenta = { n: 0 };
    return {
      leer: () => cuenta.n,
      suscribir: (avisar) => {
        if (!tipo) return () => {};
        const f = () => {
          cuenta.n += 1;
          avisar();
        };
        if (profundo) tipo.observeDeep(f);
        else tipo.observe(f);
        return () => (profundo ? tipo.unobserveDeep(f) : tipo.unobserve(f));
      },
    };
  }, [tipo, profundo]);
  return useSyncExternalStore(almacen.suscribir, almacen.leer, almacen.leer);
}

/**
 * Undo and redo only what this browser did (changes made with `origen`), for the tools that keep their things
 * straight in `datos`. Made in an effect: StrictMode unmounts and mounts again in dev, and a destroyed one does not
 * track anymore. Changes closer than half a second (a drag, a word) go back together.
 */
export function useDeshacer(datos, origen) {
  const um = useRef(null);
  const [pilas, setPilas] = useState({ atras: 0, adelante: 0 });
  useEffect(() => {
    const nuevo = new Y.UndoManager(datos, { trackedOrigins: new Set([origen]), captureTimeout: 500 });
    um.current = nuevo;
    const contar = () => setPilas({ atras: nuevo.undoStack.length, adelante: nuevo.redoStack.length });
    nuevo.on('stack-item-added', contar);
    nuevo.on('stack-item-popped', contar);
    nuevo.on('stack-cleared', contar);
    return () => {
      nuevo.destroy();
      um.current = null;
    };
  }, [datos, origen]);
  const atras = useCallback(() => um.current?.undo(), []);
  const adelante = useCallback(() => um.current?.redo(), []);
  // Ctrl+Z and Ctrl+Shift+Z (or Ctrl+Y), except in a field, which has its own.
  const teclas = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey) || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) um.current?.redo();
    else um.current?.undo();
  }, []);
  return { atras, adelante, teclas, puedeAtras: pilas.atras > 0, puedeAdelante: pilas.adelante > 0 };
}


/** Moves to the followed person's view when it changes (by value: the object is new on every mark). */
export function useSeguir(vista, aplicar) {
  const clave = vista ? JSON.stringify(vista) : null;
  const aplicarRef = useRef(aplicar);
  useEffect(() => {
    aplicarRef.current = aplicar;
  });
  useEffect(() => {
    if (clave) aplicarRef.current(JSON.parse(clave));
  }, [clave]);
}

/**
 * A view that glides while someone is followed (`crearSuave`): `ir(vista)` takes it there, retaking the way when a new
 * one comes mid-way. It stops when `siguiendo` turns false, and with the page hidden it goes straight to the end.
 * `opciones`: `aplicar`, `leer`, `saltar`, `alSaltar` (read when used) and `angulos`, `logs`, `eps` (read once).
 */
export function useSuave(siguiendo, opciones) {
  const opcionesRef = useRef(opciones);
  useEffect(() => {
    opcionesRef.current = opciones;
  });
  const motor = useRef(null);
  useEffect(() => {
    const { angulos, logs, eps } = opcionesRef.current;
    const m = crearSuave({
      angulos,
      logs,
      eps,
      aplicar: (v) => opcionesRef.current.aplicar(v),
      leer: () => opcionesRef.current.leer?.() ?? null,
      saltar: (a, b) => opcionesRef.current.saltar?.(a, b),
      alSaltar: () => opcionesRef.current.alSaltar?.(),
    });
    motor.current = m;
    const alOcultar = () => {
      if (document.visibilityState === 'hidden') m.terminar();
    };
    document.addEventListener('visibilitychange', alOcultar);
    return () => {
      document.removeEventListener('visibilitychange', alOcultar);
      m.parar();
      motor.current = null;
    };
  }, []);
  useEffect(() => {
    if (!siguiendo) motor.current?.parar();
  }, [siguiendo]);
  return useMemo(() => ({
    ir: (v) => (motor.current ? motor.current.ir(v) : opcionesRef.current.aplicar(v)),
    parar: () => motor.current?.parar(),
  }), []);
}

/**
 * `useSuave` for a box that scrolls (`caja()` gives it, or null): `ir({ top })` glides by pixels, and more than three
 * screens away it jumps with a short fade. `aparte` overrides any option (`alSaltar` to fade something else).
 */
export function useDesplazamientoSuave(siguiendo, caja, aparte = {}) {
  return useSuave(siguiendo, {
    aplicar: ({ top }) => {
      const el = caja();
      if (el) el.scrollTop = top;
    },
    leer: () => {
      const el = caja();
      return el ? { top: el.scrollTop } : null;
    },
    saltar: (a, b) => Math.abs(a.top - b.top) > 3 * (caja()?.clientHeight || 600),
    alSaltar: () => fundir(caja()),
    eps: { top: 0.5 },
    ...aparte,
  });
}

/**
 * `useSuave` for a sheet with a middle and a zoom: `ir({ cx, cy, z })` glides (the zoom in proportion), and more than
 * three screens away or eight times the zoom it jumps. `medida()` gives { w, h }; `aparte` brings `aplicar` and `leer`.
 */
export function useLienzoSuave(siguiendo, medida, aparte) {
  return useSuave(siguiendo, {
    saltar: (a, b) => {
      const { w, h } = medida();
      const z = Math.min(a.z, b.z);
      return Math.abs(a.cx - b.cx) * z > 3 * w || Math.abs(a.cy - b.cy) * z > 3 * h || Math.abs(Math.log(a.z / b.z)) > Math.log(8);
    },
    logs: ['z'],
    eps: { cx: 0.5, cy: 0.5, z: 0.001 },
    ...aparte,
  });
}

/** Registers the tab's plain text for the session's Consultron while the tool is open. */
export function useParaConsultron(mesa, leer) {
  const leerRef = useRef(leer);
  useEffect(() => {
    leerRef.current = leer;
  });
  const { paraConsultron } = mesa;
  useEffect(() => paraConsultron(() => leerRef.current()), [paraConsultron]);
}

// The table's bar floats over the bottom of each tool (4.25rem and its 1rem gap): «Ver todo» and the boxes next to
// what is chosen keep clear of it.
export const reservaAbajo = () => 5.5 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16);

/** «Ver todo» of a diagram: some air around, more at the bottom, under the table's bar. */
export const margenVerTodo = () => ({ top: '24px', right: '24px', left: '24px', bottom: `${Math.round(reservaAbajo() + 24)}px` });

/** A number in a range, or the fallback: views come from others too. */
export const numeroEn = (v, min, max, siNo) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : siNo);

/** A peer's color, only as #rrggbb. */
export { colorSeguro as colorDe } from '../../../lib/enVivo/documento';

/** Downloads a text as a file, made here: nothing goes out. */
export function bajarTexto(texto, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A file name from the tab's title. */
// eslint-disable-next-line no-control-regex
export const nombreArchivo = (titulo, ext) => `${String(titulo || 'documento').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 60) || 'documento'}.${ext}`;

// Icons on a 24 grid, in the line of the rest of the site. Never alone: each button has its name.
const DIBUJOS = {
  negrita: <path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" />,
  cursiva: <path d="M10 4h8M6 20h8M14 4l-4 16" />,
  lista: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  numerada: <path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M4 13.5a1.5 1.5 0 1 1 2.6 1L4 17h3" />,
  codigo: <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />,
  enlace: <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />,
  deshacer: <path d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" />,
  rehacer: <path d="M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3" />,
  luna: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  bajar: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  lapiz: <path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  elipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  linea: <path d="M5 19L19 5" />,
  flecha: <path d="M5 19L19 5M10 5h9v9" />,
  texto: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  goma: <path d="M8 20h12M4.5 14.5l9-9a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3L13 18H8z M9 10l6 6" />,
  mano: <path d="M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v6M17 10a1.5 1.5 0 0 1 3 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-2.7L4 14.5a1.5 1.5 0 0 1 2.4-1.8L8 14.5" />,
  mover: <path d="M5 3l6 16 2.5-6.5L20 10z" />,
  centrar: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M9 12h6M12 9v6" />,
  mas: <path d="M12 5v14M5 12h14" />,
  menos: <path d="M5 12h14" />,
  bloque: <rect x="3" y="7" width="18" height="10" rx="1" />,
  suma: <><circle cx="12" cy="12" r="7" /><path d="M7 7l10 10M17 7L7 17" /></>,
  rama: <><circle cx="12" cy="12" r="2.5" fill="currentColor" /><path d="M2 12h7.5M14.5 12H22M12 14.5V22" /></>,
  borrar: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  senal: <path d="M3 12h14M13 8l4 4-4 4M20 6v12" />,
  girar: <path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5" />,
  terminal: <rect x="2.5" y="7" width="19" height="10" rx="5" />,
  proceso: <rect x="3" y="6.5" width="18" height="11" rx="0.5" />,
  decision: <path d="M12 3.5l9 8.5-9 8.5-9-8.5z" />,
  datos: <path d="M7 6.5h14l-4 11H3z" />,
  subproceso: <><rect x="2.5" y="6.5" width="19" height="11" rx="0.5" /><path d="M6 6.5v11M18 6.5v11" /></>,
  conector: <circle cx="12" cy="12" r="5" />,
};

export function Icono({ nombre }) {
  return (
    <svg className="vh-icono" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {DIBUJOS[nombre]}
    </svg>
  );
}

/** A toolbar button: icon and name (the name hidden on narrow screens, still read). */
export function Boton({ icono, children, activo, ...props }) {
  return (
    <button type="button" className="vh-boton" aria-pressed={activo === undefined ? undefined : activo} title={typeof children === 'string' ? children : undefined} {...props}>
      {icono && <Icono nombre={icono} />}
      <span className={icono ? 'solo-lectores' : 'vh-boton__texto'}>{children}</span>
    </button>
  );
}

/** Who else is in this tab, as small dots with their name. */
export function Presentes({ otros }) {
  if (!otros.length) return null;
  return (
    <ul className="vh-presentes" aria-label="En esta pestaña">
      {otros.map((o) => (
        <li key={o.id} style={{ '--color-otro': colorSeguro(o.color) }}>
          {o.nombre || 'Alguien'}
        </li>
      ))}
    </ul>
  );
}
