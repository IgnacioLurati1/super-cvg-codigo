import { useRef, useState } from 'react';
import { esConvexo } from '../../lib/pizarron/geometria';

// The four corners of the board over the photo, to move with a finger, the mouse or the arrows. Dragging isn't the only
// way: a touch picks a corner and the next touch on the photo puts it there. While a finger drags one, a magnifier shows
// what's under the finger (above it, or below near the top). The corners go in fractions of the photo (0 to 1) and
// never cross: four crossed corners can't be straightened.

const NOMBRES = ['de arriba a la izquierda', 'de arriba a la derecha', 'de abajo a la derecha', 'de abajo a la izquierda'];
const LUPA = 112;
const AUMENTO = 3;
// Less than this from where it went down, a finger touched; more, it dragged.
const TOQUE_PX = 6;

const tope = (v) => Math.min(1, Math.max(0, v));

export default function Esquinas({ url, ancho, alto, esquinas, alCambiar, alSoltar }) {
  const caja = useRef(null);
  const [lupa, setLupa] = useState(null);
  const [elegida, setElegida] = useState(null);
  const arrastre = useRef(null);

  const lugar = (e) => {
    const r = caja.current.getBoundingClientRect();
    return { x: tope((e.clientX - r.left) / r.width), y: tope((e.clientY - r.top) / r.height) };
  };
  const medida = () => ({ w: caja.current.clientWidth, h: caja.current.clientHeight });
  const mover = (i, p) => {
    const nuevas = esquinas.map((q, j) => (j === i ? p : q));
    if (!esConvexo(nuevas)) return false;
    alCambiar(nuevas);
    return true;
  };

  const empezar = (i) => (e) => {
    // One finger at a time.
    if (arrastre.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { i, puntero: e.pointerId, x: e.clientX, y: e.clientY, movio: false };
  };
  const seguir = (e) => {
    const a = arrastre.current;
    if (!a || a.puntero !== e.pointerId) return;
    if (!a.movio && Math.hypot(e.clientX - a.x, e.clientY - a.y) < TOQUE_PX) return;
    a.movio = true;
    const p = lugar(e);
    mover(a.i, p);
    if (e.pointerType !== 'mouse') setLupa({ ...p, ...medida() });
  };
  const terminar = (e) => {
    const a = arrastre.current;
    if (!a || a.puntero !== e.pointerId) return;
    // The photo under it doesn't take this touch as one to put a corner.
    e.stopPropagation();
    arrastre.current = null;
    setLupa(null);
    if (a.movio) {
      setElegida(null);
      alSoltar();
    } else if (e.type === 'pointerup') {
      // A touch without moving picks the corner (or lets it go).
      setElegida((x) => (x === a.i ? null : a.i));
    }
  };
  // With a corner picked, a touch on the photo puts it there.
  const ponerAca = (e) => {
    if (elegida === null || arrastre.current) return;
    if (mover(elegida, lugar(e))) alSoltar();
    setElegida(null);
  };
  const conTeclas = (i) => (e) => {
    const paso = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];
    if (!d) return;
    e.preventDefault();
    mover(i, { x: tope(esquinas[i].x + d[0]), y: tope(esquinas[i].y + d[1]) });
  };

  const puntos = esquinas.map((p) => `${p.x * ancho},${p.y * alto}`).join(' ');
  // The magnifier inside the photo: below the finger when there's no room above, and never past a side.
  const lugarLupa = lupa && {
    left: Math.min(Math.max(lupa.x * lupa.w, LUPA / 2), lupa.w - LUPA / 2) - LUPA / 2,
    top: lupa.y * lupa.h < LUPA + 40 ? lupa.y * lupa.h + 38 : lupa.y * lupa.h - LUPA - 38,
  };
  return (
    <div className="esquinas" ref={caja} style={{ aspectRatio: `${ancho} / ${alto}`, '--proporcion': ancho / alto }} onPointerUp={ponerAca} data-eligiendo={elegida !== null || undefined}>
      <img className="esquinas__foto" src={url} alt="" draggable="false" />
      <svg className="esquinas__marco" viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="esquinas__fuera" fillRule="evenodd" d={`M0 0H${ancho}V${alto}H0Z M${puntos.replaceAll(' ', ' L')}Z`} />
        <polygon className="esquinas__borde" points={puntos} vectorEffect="non-scaling-stroke" />
      </svg>
      {esquinas.map((p, i) => (
        <button
          key={NOMBRES[i]}
          type="button"
          className="esquinas__punto"
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          aria-label={`Esquina ${NOMBRES[i]}`}
          aria-describedby="esquinas-ayuda"
          aria-pressed={elegida === i}
          onPointerDown={empezar(i)}
          onPointerMove={seguir}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          onLostPointerCapture={terminar}
          onKeyDown={conTeclas(i)}
          onKeyUp={(e) => e.key.startsWith('Arrow') && alSoltar()}
        />
      ))}
      {lupa && (
        <div
          className="esquinas__lupa"
          aria-hidden="true"
          style={{
            left: `${lugarLupa.left}px`,
            top: `${lugarLupa.top}px`,
            backgroundImage: `url("${url}")`,
            // The photo AUMENTO times bigger, moved so the point under the finger is in the middle of the magnifier.
            backgroundSize: `${lupa.w * AUMENTO}px ${lupa.h * AUMENTO}px`,
            backgroundPosition: `${LUPA / 2 - lupa.x * lupa.w * AUMENTO}px ${LUPA / 2 - lupa.y * lupa.h * AUMENTO}px`,
          }}
        />
      )}
      <p id="esquinas-ayuda" className="solo-lectores">Arrastrala, o tocala y después tocá dónde va. Con las flechas se mueve de a poco, con Mayúscula, de a mucho.</p>
    </div>
  );
}
