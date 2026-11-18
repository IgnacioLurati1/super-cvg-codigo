import { useId, useLayoutEffect, useRef, useState } from 'react';
import './_so-piezas.css';

// What the calculators of Sistemas Operativos, Redes de Datos and Algoritmos write on the board (a counter, a field
// written in chalk, a grid of cells as on paper) and what they need on the sheet (the width to draw in).

/** The width of the box (and the root's font size), to draw an SVG that fills it. */
export function useAncho() {
  const caja = useRef(null);
  const [medida, setMedida] = useState({ ancho: 0, letra: 16 });
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => {
      const letra = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const ancho = Math.round(el.clientWidth);
      setMedida((m) => (m.ancho === ancho && m.letra === letra ? m : { ancho, letra }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [caja, medida];
}

/** How many, one less or one more, with its name small below (the same counter as Matrices). */
export function Contador({ etiqueta, menos, mas, valor, min = 1, max, alCambiar }) {
  return (
    <div className="contador" role="group" aria-label={etiqueta}>
      <span className="contador__etiqueta" aria-hidden="true">{etiqueta}</span>
      <button type="button" className="contador__boton" aria-label={menos} aria-disabled={valor <= min} onClick={valor <= min ? undefined : () => alCambiar(valor - 1)}>−</button>
      <output className="contador__valor" aria-live="polite">{valor}</output>
      <button type="button" className="contador__boton" aria-label={mas} aria-disabled={valor >= max} onClick={valor >= max ? undefined : () => alCambiar(valor + 1)}>+</button>
    </div>
  );
}

/** A field written on the board: its name, the chalk line, its help and its mistake right below. */
export function Campo({ etiqueta, valor, alCambiar, error, ayuda, corto = false, ancho, ...resto }) {
  const id = useId();
  const describe = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={`campo so-campo${corto ? ' so-campo--corto' : ''}`} style={ancho ? { '--so-ancho': ancho } : undefined}>
      <label className="campo__etiqueta" htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        className="campo__control calc__entrada"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        value={valor}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe}
        onChange={(e) => alCambiar(e.target.value)}
        {...resto}
      />
      {ayuda && <p id={`${id}-ayuda`} className="campo__ayuda">{ayuda}</p>}
      {error && <p id={`${id}-error`} className="campo__error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Cells to write in, as on paper: the names of the columns above, of the rows on the side, and the arrows move between
 * cells as in a spreadsheet. `parentesis` draws it as a matrix. `error` is { fila, columna } of the cell that's wrong.
 */
export function Grilla({ etiqueta, filas, columnas, valor, alCambiar, celda, cabeza, lados, error, parentesis = false, nombre, modo = 'numeric' }) {
  const caja = useRef(null);
  const ir = (i, j) => caja.current?.querySelector(`[data-celda="${i}-${j}"]`)?.select();
  const alTeclear = (e, i, j) => {
    const { selectionStart: desde, selectionEnd: hasta, value } = e.currentTarget;
    const mover = {
      ArrowUp: () => i > 0 && [i - 1, j],
      ArrowDown: () => i < filas - 1 && [i + 1, j],
      ArrowLeft: () => desde === 0 && hasta === 0 && j > 0 && [i, j - 1],
      ArrowRight: () => desde === value.length && j < columnas - 1 && [i, j + 1],
      Enter: () => (j < columnas - 1 ? [i, j + 1] : i < filas - 1 && [i + 1, 0]),
    }[e.key]?.();
    if (!mover) return;
    e.preventDefault();
    ir(...mover);
  };
  // The names of the columns above and of the rows on the side stay out of the parentheses, aligned with the cells.
  const grilla = (
    <div className="so-grilla" data-parentesis={parentesis || undefined} style={{ '--columnas': columnas }}>
      {cabeza && (
        <div className="so-grilla__cabezas" aria-hidden="true">
          {cabeza.map((c, j) => (
            <span key={j}>{c}</span>
          ))}
        </div>
      )}
      {lados && (
        <div className="so-grilla__lados" aria-hidden="true">
          {lados.slice(0, filas).map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      <div className="so-grilla__celdas" role="group" aria-label={etiqueta} ref={caja}>
        {Array.from({ length: filas }, (_, i) =>
          Array.from({ length: columnas }, (_u, j) => (
            <input
              key={`${i}-${j}`}
              data-celda={`${i}-${j}`}
              className="so-grilla__celda"
              type="text"
              inputMode={typeof modo === 'function' ? modo(j) : modo}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              maxLength={12}
              aria-label={celda(i, j)}
              aria-invalid={(error && error.fila === i && error.columna === j) || undefined}
              value={valor(i, j)}
              onChange={(e) => alCambiar(i, j, e.target.value)}
              onKeyDown={(e) => alTeclear(e, i, j)}
              onFocus={(e) => e.target.select()}
            />
          )),
        )}
      </div>
    </div>
  );
  if (!nombre) return grilla;
  return (
    <div className="so-con-nombre">
      <span className="so-con-nombre__nombre" aria-hidden="true">{nombre}</span>
      {grilla}
    </div>
  );
}

/** A count written on the sheet, as a line of the resolution. */
export const Cuenta = ({ children }) => (
  <p className="calc-hoja__cuenta so-cuenta">
    <span>{children}</span>
  </p>
);
