import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { tomarEjemplo } from '../../lib/calculadoras/memoria';
import { bitsDichos } from './formato';

// The pieces of a sheet of the course: the squared paper, the steps numbered on the margin, the result with the
// highlighter, the digits each in its square, and the tables that scroll on their own when they don't fit.

/** The squared sheet with the resolution. `titulo` is its heading for screen readers and the index of the page. */
export function Hoja({ titulo = 'La resolución', children }) {
  const id = useId();
  return (
    <section className="calc-hoja" aria-labelledby={id}>
      <h2 id={id} className="solo-lectores">{titulo}</h2>
      {children}
    </section>
  );
}

/** What it gives, marked with the highlighter, and a calm notice for screen readers once the typing stops. */
export function Resultado({ children, dicho, nota }) {
  return (
    <div className="calc-hoja__resultado">
      <p className="calc-hoja__respuesta">{children}</p>
      {nota && <p className="calc-hoja__nota">{nota}</p>}
      <Anuncio texto={dicho} />
    </div>
  );
}

/** A polite notice that waits for the typing to stop: a screen reader hears the last result, not every keystroke. */
export function Anuncio({ texto }) {
  const [dicho, setDicho] = useState('');
  useEffect(() => {
    const reloj = setTimeout(() => setDicho(texto ?? ''), 700);
    return () => clearTimeout(reloj);
  }, [texto]);
  return <p className="solo-lectores" aria-live="polite">{dicho}</p>;
}

/** The steps, numbered on the margin as an exercise. */
export function Pasos({ children }) {
  return <ol className="calc-hoja__pasos">{children}</ol>;
}

export function Paso({ titulo, children }) {
  return (
    <li className="calc-hoja__paso">
      <h3 className="calc-hoja__paso-titulo">{titulo}</h3>
      <div className="calc-hoja__paso-cuerpo">{children}</div>
    </li>
  );
}

/**
 * A table (or anything wide) that scrolls sideways on its own when it doesn't fit, so the page never does. While it
 * scrolls it can take the focus, to move it with the arrows.
 */
export function Desborde({ etiqueta, children, className = '' }) {
  const caja = useRef(null);
  const [desborda, setDesborda] = useState(false);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setDesborda(el.scrollWidth > el.clientWidth + 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    if (el.firstElementChild) observador.observe(el.firstElementChild);
    return () => observador.disconnect();
  }, []);
  return (
    <div
      ref={caja}
      className={`calc-hoja__desborde ${className}`.trim()}
      role={desborda ? 'region' : undefined}
      aria-label={desborda ? `${etiqueta}, con desplazamiento` : undefined}
      tabIndex={desborda ? 0 : undefined}
      data-desborda={desborda || undefined}
    >
      {children}
    </div>
  );
}

/**
 * Bits in their squares, in named groups (sign, exponent, mantissa): each group with its name above and its own mark
 * below, so color is never the only clue. Screen readers get each group's name and its bits one by one.
 */
export function Bits({ grupos, etiqueta }) {
  return (
    <div className="bits" role="group" aria-label={etiqueta}>
      {grupos.map((g) => (
        <span key={g.nombre} className="bits__grupo" data-tono={g.tono}>
          <span className="bits__nombre" aria-hidden="true">{g.nombre}</span>
          <span className="bits__cuadros" aria-hidden="true">
            {[...g.bits].map((b, i) => <span key={i} className="bits__cuadro" data-marca={g.marcas?.[i] || undefined}>{b}</span>)}
          </span>
          <span className="solo-lectores">{`${g.nombre}, ${bitsDichos(g.bits)}.`}</span>
        </span>
      ))}
    </div>
  );
}

/** A number of a base with its subscript: 1011,1₂. */
export function EnBase({ children, base }) {
  return (
    <span className="en-base">
      {children}
      <sub aria-hidden="true">{base}</sub>
      <span className="solo-lectores"> en base {base}</span>
    </span>
  );
}

/** A digit string with its period drawn with a line on top, and said aloud. */
export function ConPeriodo({ fijo, periodo, cortado = false }) {
  return (
    <>
      {fijo}
      {periodo && (
        <>
          <span className="con-periodo" aria-hidden="true">{periodo}</span>
          <span className="solo-lectores">{`, y se repite ${bitsDichos(periodo)}`}</span>
        </>
      )}
      {cortado && (
        <>
          <span aria-hidden="true">…</span>
          <span className="solo-lectores">, y sigue</span>
        </>
      )}
    </>
  );
}

/** Ready made examples: one touch fills the exercise. */
export function Ejemplos({ ejemplos, alElegir }) {
  const id = useId();
  // The one Consultron proposed, filled as the calculator opens. It's taken once: later renders find nothing.
  useEffect(() => {
    const pedido = tomarEjemplo(ejemplos);
    if (pedido) alElegir(pedido);
  }, [ejemplos, alElegir]);
  return (
    <div className="ejemplos">
      <p className="ejemplos__titulo" id={id}>Probá con</p>
      <ul className="ejemplos__lista" aria-labelledby={id}>
        {ejemplos.map((e) => (
          <li key={e.nombre}>
            <button type="button" className="ejemplos__boton" onClick={() => alElegir(e)}>{e.nombre}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A group of choices that look like a segmented control and work like radio buttons (arrows move between them). */
export function Opciones({ leyenda, nombre, opciones, valor, alCambiar, chica = false }) {
  return (
    <fieldset className={`opciones${chica ? ' opciones--chica' : ''}`}>
      <legend className="opciones__leyenda">{leyenda}</legend>
      <div className="opciones__lista">
        {opciones.map((o) => (
          <label key={o.valor} className="opciones__opcion">
            <input type="radio" name={nombre} value={o.valor} checked={valor === o.valor} onChange={() => alCambiar(o.valor)} />
            <span>{o.texto}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
