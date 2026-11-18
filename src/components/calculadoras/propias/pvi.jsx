import { useId, useMemo, useState } from 'react';
import { dec, porcentaje } from '../../../lib/calculadoras/decimales';
import { escribir, subindice } from '../../../lib/calculadoras/formula';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { pvi } from '../../../lib/calculadoras/numerico';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { camino, Formula, Leyenda, linea, Plano, rango, Recorrer, Rotulo } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';

// Problema de valor inicial, of Análisis Numérico: y' = f(x, y) with y(x₀) = y₀, by Euler, Heun, punto medio or
// Runge-Kutta de cuarto orden, one step at a time with the formula of the notes and its numbers in, every step in a
// table and the polygon against the exact solution when there is one. Formulas, names and examples: parcial-2.md of
// El Santo Resumen (Chapra, ejemplos 25.1, 25.5 y 25.7), through lib/calculadoras/numerico.js.

const METODOS = [
  { valor: 'euler', texto: 'Euler' },
  { valor: 'heun', texto: 'Heun' },
  { valor: 'medio', texto: 'Punto medio' },
  { valor: 'rk4', texto: 'RK de cuarto orden' },
];
const NOMBRE = { euler: 'Euler', heun: 'Heun', medio: 'punto medio', rk4: 'RK de cuarto orden' };

export const EJEMPLOS = [
  { nombre: 'Euler, ejemplo 25.1', metodo: 'euler', f: '-2x^3 + 12x^2 - 20x + 8,5', x0: '0', y0: '1', h: '0,5', xf: '4', exacta: '-0,5x^4 + 4x^3 - 10x^2 + 8,5x + 1' },
  { nombre: 'Heun, ejemplo 25.5', metodo: 'heun', f: '4e^(0,8x) - 0,5y', x0: '0', y0: '2', h: '1', xf: '4', exacta: '' },
  { nombre: 'RK de cuarto orden, ejemplo 25.7', metodo: 'rk4', f: '4e^(0,8x) - 0,5y', x0: '0', y0: '2', h: '0,5', xf: '0,5', exacta: '' },
  { nombre: 'Punto medio con el 25.1', metodo: 'medio', f: '-2x^3 + 12x^2 - 20x + 8,5', x0: '0', y0: '1', h: '0,5', xf: '4', exacta: '-0,5x^4 + 4x^3 - 10x^2 + 8,5x + 1' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const ix = (s) => `x${subindice(s)}`;
const iy = (s) => `y${subindice(s)}`;
const n6 = (v) => dec(v, 6);
const entre = (v) => (v < 0 ? `(${n6(v)})` : n6(v));
const par = (a, b) => `${n6(a)}; ${n6(b)}`;

/** The formulas of the method, as the notes write them. */
function Formulas({ metodo }) {
  const lineas = {
    euler: ['yᵢ₊₁ = yᵢ + f(xᵢ, yᵢ)h'],
    heun: ['y⁰ᵢ₊₁ = yᵢ + f(xᵢ, yᵢ)h', 'yᵢ₊₁ = yᵢ + (f(xᵢ, yᵢ) + f(xᵢ₊₁, y⁰ᵢ₊₁))/2·h'],
    medio: ['yᵢ₊₁/₂ = yᵢ + f(xᵢ, yᵢ)·h/2', 'yᵢ₊₁ = yᵢ + f(xᵢ₊₁/₂, yᵢ₊₁/₂)h'],
    rk4: ['k₁ = f(xᵢ, yᵢ)', 'k₂ = f(xᵢ + h/2, yᵢ + k₁h/2)', 'k₃ = f(xᵢ + h/2, yᵢ + k₂h/2)', 'k₄ = f(xᵢ + h, yᵢ + k₃h)', 'yᵢ₊₁ = yᵢ + (k₁ + 2k₂ + 2k₃ + k₄)h/6'],
  }[metodo];
  const nombres = { heun: ['Predictor', 'Corrector'] }[metodo];
  return lineas.map((l, i) => (
    <p className="calc-hoja__cuenta an-cuenta" key={l}>
      {nombres && <span className="calc-hoja__op">{nombres[i]}</span>}
      {l}
    </p>
  ));
}

/** One step written out, with its numbers in. */
function UnPaso({ r, p }) {
  const { h } = r;
  const i = p.i;
  // The last line: y(xᵢ₊₁) ≈ yᵢ₊₁ = the numbers = the result.
  const fin = (cuenta) => (
    <p className="calc-hoja__cuenta an-cuenta">
      {`y(${n6(p.x1)}) ≈ ${iy(i + 1)} = ${cuenta} = `}
      <span className="cuenta-fin">{n6(p.y1)}</span>
    </p>
  );
  if (r.metodo === 'euler') {
    return (
      <>
        <p className="calc-hoja__cuenta an-cuenta">{`f(${ix(i)}, ${iy(i)}) = f(${par(p.x, p.y)}) = ${n6(p.k1)}`}</p>
        {fin(`${n6(p.y)} + ${entre(p.k1)}·${n6(h)}`)}
      </>
    );
  }
  if (r.metodo === 'heun') {
    return (
      <>
        <p className="calc-hoja__cuenta an-cuenta">{`f(${ix(i)}, ${iy(i)}) = f(${par(p.x, p.y)}) = ${n6(p.k1)}`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`y⁰${subindice(i + 1)} = ${n6(p.y)} + ${entre(p.k1)}·${n6(h)} = ${n6(p.predictor)}`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`f(${ix(i + 1)}, y⁰${subindice(i + 1)}) = f(${par(p.x1, p.predictor)}) = ${n6(p.k2)}`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`Pendiente promedio = (${n6(p.k1)} + ${entre(p.k2)})/2 = ${n6(p.promedio)}`}</p>
        {fin(`${n6(p.y)} + ${entre(p.promedio)}·${n6(h)}`)}
        <p className="calc-hoja__nota">{`εa del corrector contra el predictor = ${porcentaje(p.ea)}.`}</p>
      </>
    );
  }
  if (r.metodo === 'medio') {
    return (
      <>
        <p className="calc-hoja__cuenta an-cuenta">{`f(${ix(i)}, ${iy(i)}) = f(${par(p.x, p.y)}) = ${n6(p.k1)}`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`y${subindice(i)}₊₁/₂ = ${n6(p.y)} + ${entre(p.k1)}·${n6(h / 2)} = ${n6(p.ym)}`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`f(${par(p.xm, p.ym)}) = ${n6(p.k2)}`}</p>
        {fin(`${n6(p.y)} + ${entre(p.k2)}·${n6(h)}`)}
      </>
    );
  }
  return (
    <>
      <p className="calc-hoja__cuenta an-cuenta">{`k₁ = f(${par(p.x, p.y)}) = ${n6(p.k1)}`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`k₂ = f(${par(p.x + h / 2, p.y + (p.k1 * h) / 2)}) = ${n6(p.k2)}`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`k₃ = f(${par(p.x + h / 2, p.y + (p.k2 * h) / 2)}) = ${n6(p.k3)}`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`k₄ = f(${par(p.x + h, p.y + p.k3 * h)}) = ${n6(p.k4)}`}</p>
      {fin(`${n6(p.y)} + (${n6(p.k1)} + 2·${entre(p.k2)} + 2·${entre(p.k3)} + ${entre(p.k4)})·${n6(h)}/6`)}
    </>
  );
}

function Grafico({ r, k }) {
  const X = [r.x0, r.xf];
  const muestras = [];
  if (r.exacta) for (let i = 0; i <= 60; i += 1) muestras.push(r.exacta(r.x0 + ((r.xf - r.x0) * i) / 60));
  const puntos = [[r.x0, r.y0], ...r.pasos.map((p) => [p.x1, p.y1])];
  const Y = rango([...puntos.map((p) => p[1]), ...muestras], 0.12);
  const p = r.pasos[k];
  return (
    <Plano x={rango(X, 0.04)} y={Y} etiqueta={`La aproximación por ${NOMBRE[r.metodo]}${r.exacta ? ' contra la solución exacta' : ''}. En x = ${dec(p.x1, 4)} da ${dec(p.y1, 4)}.`} evitar={[p.x1]}>
      {({ sx, sy, recorte, X: vx }) => (
        <>
          <g clipPath={recorte}>
            {r.exacta && <path className="graf__curva graf__curva--segunda" d={camino(r.exacta, vx, sx, sy)} />}
            <path className="graf__curva" d={linea(puntos.map(([a, b]) => [sx(a), sy(b)]))} />
            <line className="graf__metodo" x1={sx(p.x)} y1={sy(p.y)} x2={sx(p.x1)} y2={sy(p.y1)} strokeWidth="3.5" />
          </g>
          {puntos.map(([a, b], j) => (
            <circle key={j} className={j === k + 1 ? 'graf__actual' : 'graf__punto'} cx={sx(a)} cy={sy(b)} r={j === k + 1 ? 6.5 : 3.5} />
          ))}
          <Rotulo x={sx(p.x1)} y={sy(p.y1) - 12}>
            {iy(k + 1)}
          </Rotulo>
        </>
      )}
    </Plano>
  );
}

const COLUMNAS = {
  euler: [['f(xᵢ, yᵢ)', (p) => p.k1]],
  heun: [
    ['f(xᵢ, yᵢ)', (p) => p.k1],
    ['y⁰ᵢ₊₁', (p) => p.predictor],
    ['f(xᵢ₊₁, y⁰ᵢ₊₁)', (p) => p.k2],
    ['pendiente promedio', (p) => p.promedio],
  ],
  medio: [
    ['f(xᵢ, yᵢ)', (p) => p.k1],
    ['yᵢ₊₁/₂', (p) => p.ym],
    ['f(xᵢ₊₁/₂, yᵢ₊₁/₂)', (p) => p.k2],
  ],
  rk4: [
    ['k₁', (p) => p.k1],
    ['k₂', (p) => p.k2],
    ['k₃', (p) => p.k3],
    ['k₄', (p) => p.k4],
  ],
};

function Resolucion({ r }) {
  const [elegido, setElegido] = useState(0);
  const k = Math.min(elegido, r.pasos.length - 1);
  const p = r.pasos[k];
  const columnas = COLUMNAS[r.metodo];
  const conExacta = Boolean(r.exacta);
  const nota = [
    r.fin && `En x = ${dec(r.fin.x, 4)} la cuenta deja de dar un número real.`,
    r.yv !== null && Number.isFinite(r.yv) && `La solución exacta da ${n6(r.yv)}, con εt = ${porcentaje(r.et)}.`,
    `${r.pasos.length === 1 ? 'Un paso' : `${r.pasos.length} pasos`} de h = ${dec(r.h, 6)}.`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Hoja>
      <Resultado dicho={`y en ${dec(r.x, 6)} da aproximadamente ${n6(r.y)}.`} nota={nota}>
        {`y(${dec(r.x, 6)}) ≈ `}
        <span className="resaltado">{n6(r.y)}</span>
      </Resultado>
      <Pasos>
        <Paso titulo={`El método de ${NOMBRE[r.metodo]}`}>
          <p className="calc-hoja__cuenta an-cuenta">
            {"y' = f(x, y) = "}
            <Formula nodo={r.nodoF} />
          </p>
          <p className="calc-hoja__cuenta an-cuenta">{`y(${n6(r.x0)}) = ${n6(r.y0)} y h = ${n6(r.h)}`}</p>
          <Formulas metodo={r.metodo} />
        </Paso>
        <Paso titulo={`El paso ${k + 1}`}>
          <Recorrer actual={k} total={r.pasos.length} alCambiar={setElegido} nombre="Paso" />
          <Grafico r={r} k={k} />
          <Leyenda
            items={[
              { clase: 'graf__curva', texto: NOMBRE[r.metodo] },
              ...(conExacta ? [{ clase: 'graf__curva graf__curva--segunda', texto: 'solución exacta' }] : []),
              { clase: 'graf__metodo', texto: 'este paso' },
            ]}
          />
          <UnPaso r={r} p={p} />
        </Paso>
        <Paso titulo="Todos los pasos">
          <Desborde etiqueta="Todos los pasos">
            <table className="tabla-pasos an-tabla">
              <caption className="solo-lectores">Todos los pasos</caption>
              <thead>
                <tr>
                  <th scope="col">i</th>
                  <th scope="col">xᵢ</th>
                  <th scope="col">yᵢ</th>
                  {columnas.map(([c]) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                  <th scope="col">yᵢ₊₁</th>
                  {r.metodo === 'heun' && <th scope="col">εa (%)</th>}
                  {conExacta && <th scope="col">y exacta</th>}
                  {conExacta && <th scope="col">εt (%)</th>}
                </tr>
              </thead>
              <tbody>
                {r.pasos.map((q, j) => (
                  <tr key={q.i} data-final={j === r.pasos.length - 1 || undefined} data-actual={j === k || undefined}>
                    <th scope="row">{q.i}</th>
                    <td>{n6(q.x)}</td>
                    <td>{n6(q.y)}</td>
                    {columnas.map(([c, v]) => (
                      <td key={c}>{n6(v(q))}</td>
                    ))}
                    <td>{n6(q.y1)}</td>
                    {r.metodo === 'heun' && <td>{dec(q.ea, 4)}</td>}
                    {conExacta && <td>{n6(q.yv)}</td>}
                    {conExacta && <td>{q.et === null ? '' : dec(q.et, 4)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
          {conExacta && <p className="calc-hoja__nota">La y exacta y εt corresponden a xᵢ₊₁.</p>}
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Pvi() {
  const [estado, setEstado] = useRecordado('calc:pvi', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => pvi(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (campo) => error?.campo === campo;
  const errorDatos = error && ['x0', 'y0', 'h', 'xf'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Método" nombre="metodo" opciones={METODOS} valor={estado.metodo} alCambiar={cambiar('metodo')} />
          <Escribir id={`${id}-f`} nombre="y'" decir="f(x, y)" valor={estado.f} alCambiar={cambiar('f')} invalido={mal('f')} errorId={`${id}-ef`} ayudaId={`${id}-ayuda`} />
          <p className="campo__ayuda pz-ayuda" id={`${id}-ayuda`}>
            Con x e y, como <code>4e^(0,8x) - 0,5y</code>.
          </p>
          <ErrorDe id={`${id}-ef`} texto={mal('f') && error.texto} />
          <Renglon titulo="Desde dónde y con qué paso" error={errorDatos && error.texto} errorId={`${id}-ed`}>
            <Dato id={`${id}-x0`} nombre="x₀" valor={estado.x0} alCambiar={cambiar('x0')} invalido={mal('x0')} errorId={`${id}-ed`} />
            <Dato id={`${id}-y0`} nombre="y(x₀)" decir="y₀" valor={estado.y0} alCambiar={cambiar('y0')} invalido={mal('y0')} errorId={`${id}-ed`} />
            <Dato id={`${id}-h`} nombre="h" decir="el paso" valor={estado.h} alCambiar={cambiar('h')} invalido={mal('h')} errorId={`${id}-ed`} />
            <Dato id={`${id}-xf`} nombre="hasta x" valor={estado.xf} alCambiar={cambiar('xf')} invalido={mal('xf')} errorId={`${id}-ed`} />
          </Renglon>
          <Escribir id={`${id}-y`} nombre="y(x)" decir="la solución exacta, para εt" valor={estado.exacta} alCambiar={cambiar('exacta')} invalido={mal('exacta')} errorId={`${id}-ey`} ayudaId={`${id}-ayuda-y`} />
          <p className="campo__ayuda pz-ayuda" id={`${id}-ayuda-y`}>
            La solución exacta, si la tenés, para el error verdadero εt.
          </p>
          <ErrorDe id={`${id}-ey`} texto={mal('exacta') && error.texto} />
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion key={`${escribir(r.nodoF)}|${r.metodo}|${r.pasos.length}`} r={r} />}
    </>
  );
}
