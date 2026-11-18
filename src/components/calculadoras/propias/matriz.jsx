import { useMemo, useRef } from 'react';
import { determinante, inversa, leerMatriz, MAX, rango, textoFr } from '../../../lib/calculadoras/matrices';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';

// Matrices of Álgebra y Geometría Analítica: you write inside a matrix drawn as on paper, and the sheet shows each
// operation between rows, with the row it changed marked and the pivot circled. Method and examples: the course notes,
// through El Santo Resumen (lib/calculadoras/matrices.js).

const ACCIONES = [
  { valor: 'det', texto: 'Determinante' },
  { valor: 'inversa', texto: 'Inversa' },
  { valor: 'rango', texto: 'Rango' },
  { valor: 'escalonada', texto: 'Escalonada' },
];

const lleno = (filas) => Array.from({ length: MAX }, (_, i) => Array.from({ length: MAX }, (_u, j) => String(filas[i]?.[j] ?? (i === j ? 1 : 0))));

// The course notes' own matrices (parcial-2.md of Álgebra y Geometría Analítica in El Santo Resumen).
export const EJEMPLOS = [
  { nombre: 'det de 3 × 3', accion: 'det', filas: 3, columnas: 3, valores: lleno([[2, 4, 6], [4, 0, 6], [3, 0, -2]]) },
  { nombre: 'det de 4 × 4', accion: 'det', filas: 4, columnas: 4, valores: lleno([[5, 4, 6, 2], [7, 2, 3, 5], [8, 8, -7, 4], [6, 10, 5, 0]]) },
  { nombre: 'Inversa de 3 × 3', accion: 'inversa', filas: 3, columnas: 3, valores: lleno([[1, -1, 2], [0, 1, -1], [2, 1, 0]]) },
  { nombre: 'Sin inversa', accion: 'inversa', filas: 2, columnas: 2, valores: lleno([[1, 2], [2, 4]]) },
  { nombre: 'Rango de 3 × 4', accion: 'rango', filas: 3, columnas: 4, valores: lleno([[2, 1, 0, 3], [0, 2, 1, -1], [3, 1, -1, 0]]) },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

/** «F₂». */
const Fila = ({ n }) => (
  <span className="mat-op__fila">
    F<sub>{n + 1}</sub>
  </span>
);

const conParentesis = (t) => (t.startsWith('−') ? `(${t})` : t);

/** The operation of a step as it's written next to the matrix: F₂ = F₂ − 3·F₁. */
function Operacion({ paso }) {
  if (paso.tipo === 'cambio') {
    return (
      <span className="mat-op">
        <Fila n={paso.a} /> <span aria-hidden="true">⇄</span><span className="solo-lectores">se cambia con</span> <Fila n={paso.b} />
      </span>
    );
  }
  if (paso.tipo === 'escalar') {
    return (
      <span className="mat-op">
        <Fila n={paso.fila} /> = {conParentesis(textoFr(paso.k))}·<Fila n={paso.fila} />
      </span>
    );
  }
  const negativo = paso.k.n < 0n;
  const k = textoFr({ n: negativo ? -paso.k.n : paso.k.n, d: paso.k.d });
  return (
    <span className="mat-op">
      <Fila n={paso.fila} /> = <Fila n={paso.fila} /> {negativo ? '+' : '−'} {k === '1' ? '' : `${k}·`}
      <Fila n={paso.con} />
    </span>
  );
}

/** A matrix drawn between parentheses. `corte`: where the bar of [A | I] goes. Changed rows, the pivot and the diagonal,
 * marked. */
function Matriz({ valores, etiqueta, cambiadas = [], pivote, corte, diagonal = false }) {
  return (
    <Desborde etiqueta={etiqueta}>
      <table className="mat-dibujo">
        <caption className="solo-lectores">{etiqueta}</caption>
        <tbody>
          {valores.map((fila, i) => (
            <tr key={i} data-cambio={cambiadas.includes(i) || undefined}>
              {fila.map((v, j) => (
                <td key={j} data-pivote={(pivote && pivote.fila === i && pivote.columna === j) || undefined} data-corte={(corte && j === corte) || undefined} data-diagonal={(diagonal && i === j) || undefined}>
                  {textoFr(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
}

/** The cells, inside a matrix drawn as on paper. Arrows move between them, as in a spreadsheet. */
function Entrada({ filas, columnas, valores, error, alCambiar }) {
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
  return (
    <div className="mat-entrada" role="group" aria-label={`La matriz, de ${filas} por ${columnas}`} ref={caja} style={{ '--columnas': columnas }}>
      {Array.from({ length: filas }, (_, i) =>
        Array.from({ length: columnas }, (_u, j) => (
          <input
            key={`${i}-${j}`}
            data-celda={`${i}-${j}`}
            className="mat-entrada__celda"
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck="false"
            maxLength={24}
            aria-label={`Fila ${i + 1}, columna ${j + 1}`}
            aria-invalid={(error && error.fila === i && error.columna === j) || undefined}
            aria-describedby={error && error.fila === i && error.columna === j ? 'mat-error' : undefined}
            value={valores[i][j]}
            onChange={(e) => alCambiar(i, j, e.target.value)}
            onKeyDown={(e) => alTeclear(e, i, j)}
            onFocus={(e) => e.target.select()}
          />
        )),
      )}
    </div>
  );
}

/** Rows or columns, one less or one more, with its name small below. */
function Contador({ etiqueta, valor, alCambiar }) {
  const singular = etiqueta === 'filas' ? 'fila' : 'columna';
  return (
    <div className="contador" role="group" aria-label={etiqueta}>
      <span className="contador__etiqueta" aria-hidden="true">{etiqueta}</span>
      <button type="button" className="contador__boton" aria-label={`Una ${singular} menos`} aria-disabled={valor <= 1} onClick={valor <= 1 ? undefined : () => alCambiar(valor - 1)}>−</button>
      <output className="contador__valor" aria-live="polite">{valor}</output>
      <button type="button" className="contador__boton" aria-label={`Una ${singular} más`} aria-disabled={valor >= MAX} onClick={valor >= MAX ? undefined : () => alCambiar(valor + 1)}>+</button>
    </div>
  );
}

function PasosDe({ pasos, corte, inicial, nombreInicial, children }) {
  return (
    <Pasos>
      <Paso titulo={nombreInicial}>
        <Matriz valores={inicial} etiqueta={nombreInicial} corte={corte} />
      </Paso>
      {pasos.map((p, k) => (
        <Paso key={k} titulo={<Operacion paso={p} />}>
          <Matriz valores={p.matriz} etiqueta={`Después del paso ${k + 2}`} cambiadas={p.cambiadas} pivote={p.pivote} corte={corte} />
        </Paso>
      ))}
      {children}
    </Pasos>
  );
}

function Determinante({ M }) {
  const r = determinante(M);
  const factores = r.diagonal.map((v) => conParentesis(textoFr(v)));
  const signo = r.cambios % 2 ? '−' : '';
  return (
    <Hoja>
      <Resultado dicho={`El determinante da ${textoFr(r.valor)}.`}>det A = {textoFr(r.valor)}</Resultado>
      <PasosDe pasos={r.pasos} inicial={M} nombreInicial="La matriz">
        <Paso titulo="El producto de la diagonal">
          <Matriz valores={r.final} etiqueta="La matriz triangular" diagonal />
          <p className="calc-hoja__cuenta">{`det A = ${signo}${factores.join(' ⋅ ')} = ${textoFr(r.valor)}`}</p>
          {r.cambios > 0 && <p className="calc-hoja__nota">{r.cambios === 1 ? 'Un cambio de filas da vuelta el signo.' : r.cambios % 2 ? `${r.cambios} cambios de filas dan vuelta el signo.` : `${r.cambios} cambios de filas dejan el signo igual.`}</p>}
        </Paso>
      </PasosDe>
    </Hoja>
  );
}

function Inversa({ M }) {
  const r = inversa(M);
  const n = M.length;
  return (
    <Hoja>
      {r.existe ? (
        <Resultado dicho="Tiene inversa. Está en la hoja.">
          <span className="mat-resultado">
            <span>
              A<sup>−1</sup> =
            </span>
            <Matriz valores={r.valor} etiqueta="La inversa" />
          </span>
        </Resultado>
      ) : (
        <Resultado dicho={`No tiene inversa. Su rango es ${r.rango}.`}>{`No tiene inversa. Su rango es ${r.rango} y no ${n}.`}</Resultado>
      )}
      <PasosDe pasos={r.pasos} inicial={r.inicial} nombreInicial="[A | I]" corte={n} />
    </Hoja>
  );
}

function Rango({ M, escalonada }) {
  const r = rango(M);
  return (
    <Hoja>
      {escalonada ? (
        <Resultado dicho="La forma escalonada está en la hoja.">
          <span className="mat-resultado">
            <Matriz valores={r.final} etiqueta="La forma escalonada" />
          </span>
        </Resultado>
      ) : (
        <Resultado dicho={`El rango da ${r.valor}.`} nota={`Quedan ${r.valor} filas no nulas al escalonar.`}>rango A = {r.valor}</Resultado>
      )}
      <PasosDe pasos={r.pasos} inicial={M} nombreInicial="La matriz" />
    </Hoja>
  );
}

export default function Matrices() {
  const [estado, setEstado] = useRecordado('matrices', INICIAL);
  const { accion, filas, columnas, valores } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const visibles = useMemo(() => valores.slice(0, filas).map((f) => f.slice(0, columnas)), [valores, filas, columnas]);
  const leida = useMemo(() => leerMatriz(visibles), [visibles]);
  const cuadrada = filas === columnas;
  const pideCuadrada = (accion === 'det' || accion === 'inversa') && !cuadrada;
  const error = leida.error;
  const mensaje = error && (error.texto === '' ? `Falta la fila ${error.fila + 1}, columna ${error.columna + 1}.` : `En la fila ${error.fila + 1}, columna ${error.columna + 1}, «${error.texto}» no es un número.`);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Qué calcular" nombre="accion" opciones={ACCIONES} valor={accion} alCambiar={(a) => cambiar({ accion: a })} />
          <fieldset className="mat-tamano">
            <legend className="opciones__leyenda">Tamaño</legend>
            <Contador etiqueta="filas" valor={filas} alCambiar={(n) => cambiar({ filas: n })} />
            <span className="mat-tamano__por" aria-hidden="true">×</span>
            <Contador etiqueta="columnas" valor={columnas} alCambiar={(n) => cambiar({ columnas: n })} />
          </fieldset>
          <div className="mat-escribir">
            <span className="mat-escribir__nombre" aria-hidden="true">A =</span>
            <Entrada filas={filas} columnas={columnas} valores={valores} error={error} alCambiar={(i, j, v) => setEstado((e) => ({ ...e, valores: e.valores.map((f, a) => (a === i ? f.map((x, b) => (b === j ? v : x)) : f)) }))} />
          </div>
          <p className="campo__ayuda">Enteros, decimales o fracciones, como −2,5 o 1/3.</p>
          {mensaje && <p id="mat-error" className="campo__error" role="alert">{mensaje}</p>}
          {pideCuadrada && <p className="calc-hoja__aviso" role="status">{accion === 'det' ? 'El determinante es de matrices cuadradas.' : 'La inversa es de matrices cuadradas.'}</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && !pideCuadrada && accion === 'det' && <Determinante M={leida.matriz} />}
      {!error && !pideCuadrada && accion === 'inversa' && <Inversa M={leida.matriz} />}
      {!error && accion === 'rango' && <Rango M={leida.matriz} />}
      {!error && accion === 'escalonada' && <Rango M={leida.matriz} escalonada />}
    </>
  );
}
