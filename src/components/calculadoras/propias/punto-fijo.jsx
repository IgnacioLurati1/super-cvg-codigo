import { useId, useMemo, useState } from 'react';
import { dec, porcentaje } from '../../../lib/calculadoras/decimales';
import { escribir, subindice } from '../../../lib/calculadoras/formula';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { puntoFijo } from '../../../lib/calculadoras/numerico';
import { Desborde, Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { camino, Formula, Leyenda, linea, Plano, rango, Recorrer, Rotulo } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';

// Punto fijo, of Análisis Numérico: the student's x = g(x) and x₀, the stair between y = x and y = g(x) step by step,
// every iteration with its errors, and whether |g'| is below 1 near the end. Method, graph, convergence and examples:
// parcial-1.md of El Santo Resumen (PPT de Métodos Abiertos, filminas 28 a 34; Chapra, pág. 146), through
// lib/calculadoras/numerico.js.

export const EJEMPLOS = [
  { nombre: 'e^(−x) desde 0', g: 'e^(-x)', x0: '0', max: '10', es: '', verdadero: '0,56714329' },
  { nombre: '−ln(x), otro despeje', g: '-ln(x)', x0: '0,6', max: '6', es: '', verdadero: '0,56714329' },
  { nombre: 'cos(x)/2', g: 'cos(x)/2', x0: '0', max: '8', es: '0,5', verdadero: '' },
  { nombre: '(x² + 3)/2', g: '(x^2 + 3)/2', x0: '0', max: '5', es: '', verdadero: '' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const x = (n) => `x${subindice(n)}`;

function porQue(r) {
  const { fin } = r;
  if (fin.tipo === 'tolerancia') return `En la iteración ${fin.i}, εa = ${porcentaje(r.ea)} ya es menor que εs = ${dec(r.es, 6)}\u00a0%.`;
  if (fin.tipo === 'lejos') return `En la iteración ${fin.i} se fue lejísimos. La iteración diverge.`;
  if (fin.tipo === 'nan') return `En la iteración ${fin.i}, g no da un número real. Ahí se corta.`;
  return r.filas.length === 2 ? 'Es la iteración pedida.' : `Son las ${r.filas.length - 1} iteraciones pedidas.`;
}

/** The stair: from x₀ up to g, across to y = x, and again, until the chosen iteration. */
function Escalera({ r, k }) {
  const xs = r.filas.map((f) => f.x);
  const vistos = xs.slice(0, Math.min(xs.length, 12));
  const X = rango(vistos, 0.25);
  const piso = X[0] <= 0 && X[1] >= 0 ? 0 : X[0];
  const tramos = [[xs[0], piso]];
  for (let i = 0; i < k + 1 && i + 1 < xs.length; i += 1) tramos.push([xs[i], xs[i + 1]], [xs[i + 1], xs[i + 1]]);
  const u = xs[k + 1];
  return (
    <Plano x={X} y={X} igual proporcion={0.62} etiqueta={`Las curvas y = x e y = g(x). La escalera llega a ${x(k + 1)} = ${dec(u, 6)}.`}>
      {({ sx, sy, recorte, X: vx }) => (
        <>
          <g clipPath={recorte}>
            <path className="graf__curva graf__curva--recta" d={camino((v) => v, vx, sx, sy, 2)} />
            <path className="graf__curva" d={camino(r.g, vx, sx, sy)} />
            <path className="graf__metodo" d={linea(tramos.map(([a, b]) => [sx(a), sy(b)]))} />
          </g>
          <circle className="graf__punto graf__punto--metodo" cx={sx(xs[0])} cy={sy(piso)} r={4.5} />
          <Rotulo x={sx(xs[0])} y={sy(piso) + 20} className="graf__rotulo--metodo">
            x₀
          </Rotulo>
          {Number.isFinite(u) && (
            <>
              <circle className="graf__actual" cx={sx(u)} cy={sy(u)} r={6.5} />
              <Rotulo x={sx(u) + 10} y={sy(u) + 18} ancla="start">
                {x(k + 1)}
              </Rotulo>
            </>
          )}
        </>
      )}
    </Plano>
  );
}

function Resolucion({ r }) {
  const [elegida, setElegida] = useState(0);
  const pasos = r.filas.length - 1;
  const k = Math.min(elegida, Math.max(0, pasos - 1));
  const n = r.filas.length - 1;
  const conEt = r.xv !== null;
  const errores = [r.ea !== null && `εa = ${porcentaje(r.ea)}`, r.et !== null && `εt = ${porcentaje(r.et)}`].filter(Boolean).join(' y ');
  const f = r.filas[k + 1];
  const anterior = r.filas[k];
  const converge = r.pendiente < 1;
  return (
    <Hoja>
      <Resultado dicho={`Después de ${n} iteraciones, x da ${dec(r.x, 6)}.`} nota={`${porQue(r)}${errores ? ` Queda ${errores}.` : ''}`}>
        {`${x(n)} = `}
        <span className="resaltado">{dec(r.x, 6)}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="El despeje">
          <p className="calc-hoja__cuenta an-cuenta">
            x = g(x) = <Formula nodo={r.nodoG} />
          </p>
          <p className="calc-hoja__cuenta an-cuenta">
            {"g'(x) = "}
            <Formula nodo={r.nodoD} />
          </p>
          <p className="calc-hoja__suelta">{`Se itera ${x('i+1')} = g(${x('i')}) desde x₀ = ${dec(r.filas[0].x, 6)}.`}</p>
        </Paso>
        {pasos > 0 && (
          <Paso titulo={`La iteración ${k + 1}`}>
            <Recorrer actual={k} total={pasos} alCambiar={setElegida} />
            <Escalera r={r} k={k} />
            <Leyenda
              items={[
                { clase: 'graf__curva graf__curva--recta', texto: 'y = x' },
                { clase: 'graf__curva', texto: 'y = g(x)' },
                { clase: 'graf__metodo', texto: 'la escalera' },
              ]}
            />
            <p className="calc-hoja__cuenta an-cuenta">
              {`${x(k + 1)} = g(${x(k)}) = g(${dec(anterior.x, 6)}) = `}
              <span className="cuenta-fin">{dec(f.x, 6)}</span>
            </p>
            <p className="calc-hoja__cuenta an-cuenta">{`εa = |(${x(k + 1)} − ${x(k)})/${x(k + 1)}|·100 % = ${porcentaje(f.ea)}`}</p>
          </Paso>
        )}
        <Paso titulo="Todas las iteraciones">
          <Desborde etiqueta="Todas las iteraciones">
            <table className="tabla-pasos an-tabla">
              <caption className="solo-lectores">Todas las iteraciones</caption>
              <thead>
                <tr>
                  <th scope="col">i</th>
                  <th scope="col">xᵢ</th>
                  <th scope="col">εa (%)</th>
                  {conEt && <th scope="col">εt (%)</th>}
                </tr>
              </thead>
              <tbody>
                {r.filas.map((fila, j) => (
                  <tr key={fila.i} data-final={j === n || undefined} data-actual={(pasos > 0 && j === k + 1) || undefined}>
                    <th scope="row">{fila.i}</th>
                    <td>{dec(fila.x, 6)}</td>
                    <td>{fila.ea === null ? '' : dec(fila.ea, 4)}</td>
                    {conEt && <td>{dec(fila.et, 4)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
        </Paso>
        {Number.isFinite(r.pendiente) && (
          <Paso titulo="La convergencia">
            <p className="calc-hoja__cuenta an-cuenta">
              {`|g'(${x(n)})| = |g'(${dec(r.x, 6)})| = `}
              <span className="cuenta-fin">{dec(r.pendiente, 4)}</span>
              {converge ? ' < 1' : ' ≥ 1'}
            </p>
            <p className="calc-hoja__suelta">
              {converge ? 'Cerca de ahí los errores decrecen y la iteración converge.' : 'Cerca de ahí los errores crecen y la iteración diverge. Probá con otro despeje.'}
            </p>
            <p className="calc-hoja__nota">Converge si |g'(x)| &lt; 1 en la región de interés.</p>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

export default function PuntoFijo() {
  const [estado, setEstado] = useRecordado('calc:punto-fijo', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => puntoFijo(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (campo) => error?.campo === campo;
  const errorParar = error && ['max', 'es', 'verdadero'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Escribir id={`${id}-g`} nombre="g(x)" decir="el despeje x = g(x)" valor={estado.g} alCambiar={cambiar('g')} invalido={mal('g')} errorId={`${id}-eg`} ayudaId={`${id}-ayuda`} />
          <p className="campo__ayuda pz-ayuda" id={`${id}-ayuda`}>
            El despeje de f(x) = 0 como x = g(x), por ejemplo <code>e^(-x)</code>.
          </p>
          <ErrorDe id={`${id}-eg`} texto={mal('g') && error.texto} />
          <Renglon titulo="Valor inicial" error={mal('x0') && error.texto} errorId={`${id}-e0`}>
            <Dato id={`${id}-x0`} nombre="x₀" valor={estado.x0} alCambiar={cambiar('x0')} invalido={mal('x0')} errorId={`${id}-e0`} />
          </Renglon>
          <Renglon titulo="Cuándo parar" error={errorParar && error.texto} errorId={`${id}-ep`}>
            <Dato id={`${id}-max`} nombre="iteraciones" ancho={3.5} valor={estado.max} alCambiar={cambiar('max')} invalido={mal('max')} errorId={`${id}-ep`} />
            <Dato id={`${id}-es`} nombre="εs" decir="la tolerancia" unidad="%" ancho={4.5} valor={estado.es} alCambiar={cambiar('es')} invalido={mal('es')} errorId={`${id}-ep`} />
            <Dato id={`${id}-v`} nombre="xᵥ" decir="el valor verdadero" ancho={7} valor={estado.verdadero} alCambiar={cambiar('verdadero')} invalido={mal('verdadero')} errorId={`${id}-ep`} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">Sin εs hace todas las iteraciones. Con xᵥ, el valor verdadero, suma εt.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion key={`${escribir(r.nodoG)}|${r.filas.length}`} r={r} />}
    </>
  );
}
