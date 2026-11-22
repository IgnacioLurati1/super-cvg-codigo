import { useEffect, useRef, useState } from 'react';
import { ALTO_CONSULTRON, cambiarAjustes, PANEL_CONSULTRON, useAjustes } from '../../lib/ajustes';
import { useBotonesSinMouse } from '../../lib/sinMouse';

// How wide Consultron is when it stands beside something (the pages of a PDF, a summary, a calculator): the student
// drags its left edge, or moves it with the keyboard or with its two buttons, and the width stays for this device
// (ajustes.js, `anchoConsultron`), the same wherever it stands. In its corner both change the same way: the width from
// its left edge (`anchoRincon`) and the height from its top edge (`altoConsultron`).

// What each of its two buttons makes it wider or narrower.
const PASO_BOTON = 80;

/**
 * The width and what changes it. `fila`: how wide the row it shares is, 0 while it isn't known. `resto`: how much of
 * the row what is beside it keeps, however wide Consultron is dragged. `contenedor()`: the element that knows a drag
 * is going on (`data-ancho-consultron`), so nothing under the pointer takes it. `clave` and `limites`: the setting that
 * keeps it and its ends, the ones beside a viewer unless told. `aLaDerecha`: its edge is on its right (the corner on the left,
 * Configuración), so dragging to the right makes it wider. Gives { ancho, min, tope, arrastrando, borde, masAngosto,
 * masAncho }: `borde`, the props of its edge; the two last, null at their end.
 */
export function useAncho({ fila, resto, contenedor, clave = 'anchoConsultron', limites = PANEL_CONSULTRON, aLaDerecha = false }) {
  const hacia = aLaDerecha ? -1 : 1;
  const ajustes = useAjustes();
  // The width while its edge is being dragged, saved when it's let go.
  const [arrastre, setArrastre] = useState(null);
  const tope = Math.max(limites.min, Math.min(limites.max, fila ? fila - resto : limites.porDefecto));
  const acotar = (w) => Math.min(tope, Math.max(limites.min, Math.round(w)));
  const ancho = Math.min(tope, arrastre ?? ajustes[clave]);
  // The drag going on, to end it if Consultron closes in the middle of it: what it left on the container would stay.
  const soltarArrastre = useRef(null);
  useEffect(() => () => soltarArrastre.current?.(), []);
  const empezarArrastre = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    soltarArrastre.current?.();
    const borde = e.currentTarget;
    const quien = contenedor();
    borde.setPointerCapture(e.pointerId);
    // A summary lives in a frame: while dragging, the pointer is not its own.
    if (quien) quien.dataset.anchoConsultron = 'arrastrando';
    const x0 = e.clientX;
    const w0 = ancho;
    let ultimo = w0;
    const mover = (ev) => {
      ultimo = acotar(w0 - hacia * (ev.clientX - x0));
      setArrastre(ultimo);
    };
    const soltar = () => {
      soltarArrastre.current = null;
      borde.removeEventListener('pointermove', mover);
      borde.removeEventListener('pointerup', soltar);
      borde.removeEventListener('pointercancel', soltar);
      borde.removeEventListener('lostpointercapture', soltar);
      if (quien) delete quien.dataset.anchoConsultron;
      if (ultimo !== w0) cambiarAjustes({ [clave]: ultimo });
      setArrastre(null);
    };
    borde.addEventListener('pointermove', mover);
    borde.addEventListener('pointerup', soltar);
    borde.addEventListener('pointercancel', soltar);
    borde.addEventListener('lostpointercapture', soltar);
    soltarArrastre.current = soltar;
  };
  // From the keyboard: the arrows move it 16 pixels (64 with Shift), Home and End take it to its ends, Enter back to the
  // usual one. The edge is on the left: to the left is wider (with the edge on the right, the other way).
  const teclaBorde = (e) => {
    const paso = (e.shiftKey ? 64 : 16) * hacia;
    const nuevo = { ArrowLeft: ancho + paso, ArrowRight: ancho - paso, Home: limites.min, End: tope, Enter: limites.porDefecto }[e.key];
    if (nuevo === undefined) return;
    e.preventDefault();
    cambiarAjustes({ [clave]: acotar(nuevo) });
  };
  // Without dragging nor keys: a button for each way. At its end a button stays there, so the focus isn't lost.
  const alAncho = (cuanto) => cambiarAjustes({ [clave]: acotar(ancho + cuanto) });
  return {
    ancho,
    min: limites.min,
    tope,
    arrastrando: arrastre !== null,
    borde: { onPointerDown: empezarArrastre, onKeyDown: teclaBorde, onDoubleClick: () => cambiarAjustes({ [clave]: acotar(limites.porDefecto) }) },
    masAngosto: ancho <= limites.min ? null : () => alAncho(-PASO_BOTON),
    masAncho: ancho >= tope ? null : () => alAncho(PASO_BOTON),
  };
}

/** The edge that is dragged. `de`: the id of the panel it changes. `medida`: what `useAncho` gave. */
export function Borde({ de, medida }) {
  return (
    <div
      className="lector__consultron-borde"
      role="separator"
      aria-orientation="vertical"
      aria-label="Ancho de Consultron"
      aria-controls={de}
      aria-valuemin={medida.min}
      aria-valuemax={medida.tope}
      aria-valuenow={medida.ancho}
      aria-valuetext={`${medida.ancho} píxeles`}
      tabIndex={0}
      title="Arrastrá para cambiar el ancho. Con doble clic o Enter vuelve al de siempre."
      data-arrastrando={medida.arrastrando || undefined}
      {...medida.borde}
    />
  );
}

// What stays above Consultron in its corner, however tall it is dragged.
const SOBRE_EL_RINCON = 96;

/**
 * The height in its corner and what changes it, like `useAncho`. `ventana`: how tall the window is. Gives { alto, tope,
 * arrastrando, borde, masBajo, masAlto }.
 */
export function useAlto({ ventana, contenedor }) {
  const ajustes = useAjustes();
  const [arrastre, setArrastre] = useState(null);
  const tope = Math.max(ALTO_CONSULTRON.min, Math.min(ALTO_CONSULTRON.max, ventana - SOBRE_EL_RINCON));
  const acotar = (h) => Math.min(tope, Math.max(ALTO_CONSULTRON.min, Math.round(h)));
  const alto = Math.min(tope, arrastre ?? ajustes.altoConsultron);
  const soltarArrastre = useRef(null);
  useEffect(() => () => soltarArrastre.current?.(), []);
  const empezarArrastre = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    soltarArrastre.current?.();
    const borde = e.currentTarget;
    const quien = contenedor();
    borde.setPointerCapture(e.pointerId);
    if (quien) quien.dataset.anchoConsultron = 'arrastrando';
    const y0 = e.clientY;
    const h0 = alto;
    let ultimo = h0;
    const mover = (ev) => {
      ultimo = acotar(h0 - (ev.clientY - y0));
      setArrastre(ultimo);
    };
    const soltar = () => {
      soltarArrastre.current = null;
      borde.removeEventListener('pointermove', mover);
      borde.removeEventListener('pointerup', soltar);
      borde.removeEventListener('pointercancel', soltar);
      borde.removeEventListener('lostpointercapture', soltar);
      if (quien) delete quien.dataset.anchoConsultron;
      if (ultimo !== h0) cambiarAjustes({ altoConsultron: ultimo });
      setArrastre(null);
    };
    borde.addEventListener('pointermove', mover);
    borde.addEventListener('pointerup', soltar);
    borde.addEventListener('pointercancel', soltar);
    borde.addEventListener('lostpointercapture', soltar);
    soltarArrastre.current = soltar;
  };
  // The edge is on top: up is taller.
  const teclaBorde = (e) => {
    const paso = e.shiftKey ? 64 : 16;
    const nuevo = { ArrowUp: alto + paso, ArrowDown: alto - paso, Home: ALTO_CONSULTRON.min, End: tope, Enter: ALTO_CONSULTRON.porDefecto }[e.key];
    if (nuevo === undefined) return;
    e.preventDefault();
    cambiarAjustes({ altoConsultron: acotar(nuevo) });
  };
  const alAlto = (cuanto) => cambiarAjustes({ altoConsultron: acotar(alto + cuanto) });
  return {
    alto,
    tope,
    arrastrando: arrastre !== null,
    borde: { onPointerDown: empezarArrastre, onKeyDown: teclaBorde, onDoubleClick: () => cambiarAjustes({ altoConsultron: acotar(ALTO_CONSULTRON.porDefecto) }) },
    masBajo: alto <= ALTO_CONSULTRON.min ? null : () => alAlto(-PASO_BOTON),
    masAlto: alto >= tope ? null : () => alAlto(PASO_BOTON),
  };
}

/** The top edge that is dragged, in its corner. `medida`: what `useAlto` gave. */
export function BordeDeAlto({ de, medida }) {
  return (
    <div
      className="flotante__borde-alto"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Alto de Consultron"
      aria-controls={de}
      aria-valuemin={ALTO_CONSULTRON.min}
      aria-valuemax={medida.tope}
      aria-valuenow={medida.alto}
      aria-valuetext={`${medida.alto} píxeles`}
      tabIndex={0}
      title="Arrastrá para cambiar el alto. Con doble clic o Enter vuelve al de siempre."
      data-arrastrando={medida.arrastrando || undefined}
      {...medida.borde}
    />
  );
}

/** Its two buttons, for the header of the corner: shorter and taller. Only with «Modo sin mouse» (sinMouse.js): the
 * edge does the same. */
export function BotonesDeAlto({ medida }) {
  if (!useBotonesSinMouse()) return null;
  return (
    <>
      <button type="button" className="flotante__accion" aria-label="Consultron más bajo" title="Más bajo" aria-disabled={!medida.masBajo || undefined} onClick={() => medida.masBajo?.()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5h14M12 9v10M8 15l4 4 4-4" /></svg>
      </button>
      <button type="button" className="flotante__accion" aria-label="Consultron más alto" title="Más alto" aria-disabled={!medida.masAlto || undefined} onClick={() => medida.masAlto?.()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5h14M12 19V9M8 13l4-4 4 4" /></svg>
      </button>
    </>
  );
}

/** Its two buttons, for the header: narrower and wider. Only with «Modo sin mouse», like the ones of the height. */
export function BotonesDeAncho({ medida }) {
  if (!useBotonesSinMouse()) return null;
  return (
    <>
      <button type="button" className="flotante__accion" aria-label="Consultron más angosto" title="Más angosto" aria-disabled={!medida.masAngosto || undefined} onClick={() => medida.masAngosto?.()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5v14M9 12h10M15 8l4 4-4 4" /></svg>
      </button>
      <button type="button" className="flotante__accion" aria-label="Consultron más ancho" title="Más ancho" aria-disabled={!medida.masAncho || undefined} onClick={() => medida.masAncho?.()}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5v14M19 12H9M13 8l-4 4 4 4" /></svg>
      </button>
    </>
  );
}
