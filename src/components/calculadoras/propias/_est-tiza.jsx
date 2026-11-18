import { useId, useRef } from 'react';
import { leerNumero } from '../../../lib/calculadoras/cifras';
import './_est-tiza.css';

// What the statistics, stocks and simulation calculators write on the board: a datum as the exercise gives it («n = 5»,
// its name small above), a list of numbers, a small table to fill in, and a counter of rows. All in chalk, with the
// error next to the field and the field marked.

/** One datum: its name above, its symbol written before the chalk line («n =») and its unit after it. */
export function Dato({ nombre, simbolo, unidad, valor, alCambiar, error, ancho = false, modo = 'text', area = false, filas = 3, ayuda }) {
  const id = useId();
  const idError = `${id}-error`;
  const idAyuda = `${id}-ayuda`;
  const describe = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ') || undefined;
  const comunes = {
    id,
    className: 'campo__control ce-dato__control',
    value: valor,
    onChange: (e) => alCambiar(e.target.value),
    autoComplete: 'off',
    spellCheck: false,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describe,
    maxLength: area ? 2000 : 60,
  };
  return (
    <div className={`campo ce-dato${ancho ? ' ce-dato--ancho' : ''}`}>
      <label className="ce-dato__nombre" htmlFor={id}>{nombre}</label>
      <div className="ce-dato__linea">
        {simbolo && <span className="ce-dato__simbolo" aria-hidden="true">{simbolo} =</span>}
        {area ? <textarea {...comunes} rows={filas} /> : <input {...comunes} type="text" inputMode={modo} />}
        {unidad && <span className="ce-dato__unidad">{unidad}</span>}
      </div>
      {ayuda && <p className="campo__ayuda" id={idAyuda}>{ayuda}</p>}
      {error && <p className="campo__error" role="alert" id={idError}>{error}</p>}
    </div>
  );
}

/** Data written side by side, wrapping on the phone. With `titulo`, a group with its name. */
export function Datos({ titulo, children }) {
  if (!titulo) return <div className="ce-datos">{children}</div>;
  return (
    <fieldset className="ce-grupo">
      <legend className="opciones__leyenda">{titulo}</legend>
      <div className="ce-datos">{children}</div>
    </fieldset>
  );
}

/** One more or one less, with its name small below, as the size of Matrices. */
export function Contador({ nombre, singular, articulo = 'Una', valor, min = 1, max, alCambiar }) {
  return (
    <div className="contador" role="group" aria-label={nombre}>
      <span className="contador__etiqueta" aria-hidden="true">{nombre}</span>
      <button type="button" className="contador__boton" aria-label={`${articulo} ${singular} menos`} aria-disabled={valor <= min} onClick={valor <= min ? undefined : () => alCambiar(valor - 1)}>−</button>
      <output className="contador__valor" aria-live="polite">{valor}</output>
      <button type="button" className="contador__boton" aria-label={`${articulo} ${singular} más`} aria-disabled={valor >= max} onClick={valor >= max ? undefined : () => alCambiar(valor + 1)}>+</button>
    </div>
  );
}

/**
 * A small table to fill in on the board, a column per datum (x and P(X = x), value and frequency, D, L and C of each
 * article). `horizontal` writes it as the notes do with a few values: a row per datum, a column per value. Arrows move
 * between cells as in a spreadsheet. `error`: { fila, columna } of the wrong cell (fila is the value, columna the datum).
 */
export function TablaTiza({ etiqueta, columnas, filas, alCambiar, error, horizontal = false, nombreFilas = 'filas', singular = 'fila', articulo = 'Una', min = 1, max = 30, vacia }) {
  const caja = useRef(null);
  const ir = (i, j) => caja.current?.querySelector(`[data-celda="${i}-${j}"]`)?.select();
  const alTeclear = (e, i, j) => {
    const { selectionStart: desde, selectionEnd: hasta, value } = e.currentTarget;
    const alInicio = desde === 0 && hasta === 0;
    const alFinal = desde === value.length;
    const ultimaFila = filas.length - 1;
    const ultimaColumna = columnas.length - 1;
    const mover = horizontal
      ? {
          ArrowUp: () => j > 0 && [i, j - 1],
          ArrowDown: () => j < ultimaColumna && [i, j + 1],
          ArrowLeft: () => alInicio && i > 0 && [i - 1, j],
          ArrowRight: () => alFinal && i < ultimaFila && [i + 1, j],
          Enter: () => (i < ultimaFila ? [i + 1, j] : j < ultimaColumna && [0, j + 1]),
        }[e.key]?.()
      : {
          ArrowUp: () => i > 0 && [i - 1, j],
          ArrowDown: () => i < ultimaFila && [i + 1, j],
          ArrowLeft: () => alInicio && j > 0 && [i, j - 1],
          ArrowRight: () => alFinal && j < ultimaColumna && [i, j + 1],
          Enter: () => (j < ultimaColumna ? [i, j + 1] : i < ultimaFila && [i + 1, 0]),
        }[e.key]?.();
    if (!mover) return;
    e.preventDefault();
    ir(...mover);
  };
  const cambiarCelda = (i, clave, v) => alCambiar(filas.map((f, k) => (k === i ? { ...f, [clave]: v } : f)));
  // Fewer rows hides the last ones without losing them: they come back, as they were, with more rows.
  const guardadas = useRef([]);
  const cambiarCantidad = (n) => {
    if (n < filas.length) {
      guardadas.current = [...filas.slice(n), ...guardadas.current];
      alCambiar(filas.slice(0, n));
      return;
    }
    const vuelven = guardadas.current.slice(0, n - filas.length);
    guardadas.current = guardadas.current.slice(vuelven.length);
    alCambiar([...filas, ...vuelven, ...Array.from({ length: n - filas.length - vuelven.length }, () => ({ ...vacia }))]);
  };
  const celda = (f, i, c, j) => (
    <td key={horizontal ? i : c.clave}>
      <input
        data-celda={`${i}-${j}`}
        className="ce-tabla__celda"
        type="text"
        inputMode={c.modo ?? 'text'}
        autoComplete="off"
        spellCheck="false"
        maxLength={24}
        aria-label={horizontal ? `${c.dicho ?? c.titulo}, valor ${i + 1}` : `${c.dicho ?? c.titulo}, fila ${i + 1}`}
        aria-invalid={(error && error.fila === i && error.columna === j) || undefined}
        value={f[c.clave]}
        onChange={(e) => cambiarCelda(i, c.clave, e.target.value)}
        onKeyDown={(e) => alTeclear(e, i, j)}
        onFocus={(e) => e.target.select()}
      />
    </td>
  );
  return (
    <div className={`ce-tabla${horizontal ? ' ce-tabla--horizontal' : ''}`}>
      <div className="ce-tabla__marco">
        <table className="ce-tabla__grilla" ref={caja} aria-label={etiqueta}>
          {horizontal ? (
            <tbody>
              {columnas.map((c, j) => (
                <tr key={c.clave}>
                  <th scope="row">{c.titulo}</th>
                  {filas.map((f, i) => celda(f, i, c, j))}
                </tr>
              ))}
            </tbody>
          ) : (
            <>
              <thead>
                <tr>
                  {columnas.map((c) => <th key={c.clave} scope="col">{c.titulo}</th>)}
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i}>{columnas.map((c, j) => celda(f, i, c, j))}</tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
      <Contador nombre={nombreFilas} singular={singular} articulo={articulo} valor={filas.length} min={min} max={max} alCambiar={cambiarCantidad} />
    </div>
  );
}

/** A range written in chalk, with its value next to it: for what is better seen moving, like π of the Binomial. */
export function Deslizador({ nombre, simbolo, valor, min, max, paso, alCambiar, texto }) {
  const id = useId();
  return (
    <div className="ce-desliza">
      <label className="ce-dato__nombre" htmlFor={id}>{nombre}</label>
      <div className="ce-desliza__linea">
        <span className="ce-dato__simbolo" aria-hidden="true">{simbolo} =</span>
        <output className="ce-desliza__valor" htmlFor={id}>{texto}</output>
        <input id={id} className="ce-desliza__rango" type="range" min={min} max={max} step={paso} value={valor} aria-valuetext={texto} onChange={(e) => alCambiar(Number(e.target.value))} />
      </div>
    </div>
  );
}

/**
 * Reads the cells of a TablaTiza as numbers. { valores } with a row of numbers per row, or { error } with the first
 * cell that fails: { fila, columna, mensaje }. `lugar`: how the message names a row, «fila» or «columna» (across).
 */
export function leerFilas(filas, columnas, { lugar = 'fila' } = {}) {
  const valores = [];
  for (let i = 0; i < filas.length; i += 1) {
    const fila = {};
    for (let j = 0; j < columnas.length; j += 1) {
      const c = columnas[j];
      const r = leerNumero(filas[i][c.clave]);
      if (r.falta) return { error: { fila: i, columna: j, mensaje: `Falta ${c.falta} de la ${lugar} ${i + 1}.` } };
      if (r.mal) return { error: { fila: i, columna: j, mensaje: `En la ${lugar} ${i + 1}, «${String(filas[i][c.clave]).trim()}» no es un número.` } };
      fila[c.clave] = r.valor;
    }
    valores.push(fila);
  }
  return { valores };
}
