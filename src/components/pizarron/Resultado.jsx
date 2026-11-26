import { useRef, useState } from 'react';

/** Half the width of a finger's stroke, over the board's longer side, as it starts: going over writing, and wiping. */
export const ANCHO_REPASO = 0.012;
export const ANCHO_BORRADO = 0.03;
/** The narrowest and widest a student can choose (limpiar.js holds them to the same). */
export const ANCHO_MIN = 0.004;
export const ANCHO_MAX = 0.05;
// Points of one stroke, at most: past that the finger has gone over enough.
const MAX_PUNTOS = 2000;

const camino = (puntos, ancho, alto) => {
  const p = puntos.length === 1 ? [puntos[0], puntos[0]] : puntos;
  return p.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * ancho).toFixed(1)} ${(y * alto).toFixed(1)}`).join('');
};

/**
 * The cleaned board. With a `herramienta` ('repasar', 'borrar' or 'barrer'), a finger (or the mouse) goes over faint
 * writing, wipes what's left or sweeps what isn't writing, `anchoTrazo` wide: the stroke shows while it's drawn and, once lifted, goes to `alSumar` as
 * { puntos ([x, y] from 0 to 1), r, borra or barre } and the cleaned board shows what it did. With a mouse, a ring shows how wide.
 */
export default function Resultado({ resultado, procesando, herramienta = null, anchoTrazo = ANCHO_REPASO, alSumar }) {
  const repasando = herramienta !== null;
  const borra = herramienta === 'borrar';
  const barre = herramienta === 'barrer';
  const [trazo, setTrazo] = useState(null);
  const [mouse, setMouse] = useState(null);
  const caja = useRef(null);
  const punto = (e) => {
    const r = caja.current.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  const empezar = (e) => {
    if (!repasando || !e.isPrimary) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setTrazo([punto(e)]);
  };
  const seguir = (e) => {
    if (repasando && e.pointerType === 'mouse') setMouse(punto(e));
    if (!trazo || !e.isPrimary) return;
    const p = punto(e);
    setTrazo((t) => (t && t.length < MAX_PUNTOS ? [...t, p] : t));
  };
  const terminar = (e) => {
    if (!trazo || !e.isPrimary) return;
    alSumar?.({ puntos: trazo, r: anchoTrazo, ...(borra ? { borra: true } : {}), ...(barre ? { barre: true } : {}) });
    setTrazo(null);
  };
  const { ancho, alto } = resultado;
  const lado = Math.max(ancho, alto);
  const enCurso = trazo ? { puntos: trazo, r: anchoTrazo, borra } : null;
  return (
    <div
      className="pizarron__lienzo"
      ref={caja}
      data-repasando={repasando || undefined}
      onPointerDown={empezar}
      onPointerMove={seguir}
      onPointerUp={terminar}
      onPointerCancel={() => setTrazo(null)}
      onPointerLeave={() => setMouse(null)}
    >
      <img className="pizarron__resultado" src={resultado.url} alt="La foto del pizarrón, derecha y limpia" width={ancho} height={alto} data-procesando={procesando || undefined} draggable={false} />
      {repasando && (enCurso || mouse) && (
        <svg className="pizarron__repasos" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" aria-hidden="true">
          {enCurso && <path d={camino(enCurso.puntos, ancho, alto)} strokeWidth={2 * enCurso.r * lado} data-borra={borra || barre || undefined} />}
          {mouse && !enCurso && <circle className="pizarron__aro" cx={mouse[0] * ancho} cy={mouse[1] * alto} r={anchoTrazo * lado} data-borra={borra || barre || undefined} />}
        </svg>
      )}
    </div>
  );
}
