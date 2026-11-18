import { useMemo } from 'react';
import { coma } from '../../../lib/calculadoras/cifras';
import { variableDiscreta } from '../../../lib/calculadoras/estadistica';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Paso, Pasos } from '../Hoja';
import { Cuenta, Fichas, Raiz } from './_est-cuentas';
import { GraficoBastones } from './_est-dibujo';
import { leerFilas, TablaTiza } from './_est-tiza';

// Variable aleatoria discreta of Probabilidad y Estadística: the table of x and P(X = x) written on the board, and on
// the sheet the closing condition, E(X) = Σ x·p, V(X) = Σ (x − μ)²·p and σ, as the notes define them (V.A.D., pág. 2
// to 6, in El Santo Resumen probabilidad-y-estadistica/parcial-2.md), with its sticks.

const COLUMNAS = [
  { clave: 'x', titulo: 'x', dicho: 'Valor de x', falta: 'el valor de x' },
  { clave: 'p', titulo: 'p', dicho: 'Probabilidad', falta: 'la probabilidad' },
];

const tabla = (xs, ps) => xs.map((x, i) => ({ x: String(x), p: String(ps[i]).replace('.', ',') }));

// Tabla 3.1 of the notes, the unsatisfied clients per day (V.A.D., pág. 3 and 4).
export const EJEMPLOS = [{ nombre: 'Tabla 3.1', filas: tabla([0, 1, 2, 3, 4, 5, 6, 7], [0.085, 0.118, 0.184, 0.217, 0.127, 0.118, 0.104, 0.047]) }];

const f4 = (x) => coma(x, 4);

function Resolucion({ filas }) {
  const xs = filas.map((f) => f.x);
  const ps = filas.map((f) => f.p);
  const v = variableDiscreta(xs, ps);
  const mu = coma(v.esperanza, 4);
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Esperanza', valor: `E(X) = ${mu}`, principal: true },
          { nombre: 'Varianza', valor: `V(X) = ${f4(v.varianza)}` },
          { nombre: 'Desvío', valor: `σ = ${f4(v.desvio)}` },
        ]}
        dicho={`E(X) da ${mu}, V(X) da ${f4(v.varianza)} y el desvío ${f4(v.desvio)}.`}
      />
      {!v.cierra && <p className="calc-hoja__aviso" role="status">{`Las probabilidades suman ${f4(v.suma)} y no 1. No se cumple la condición de cierre.`}</p>}
      <Pasos>
        <Paso titulo="La distribución">
          <GraficoBastones
            puntos={filas.map((f) => ({ x: f.x, y: f.p }))}
            esperanza={v.esperanza}
            etiqueta={`Bastones de la distribución, uno por valor de x, con E(X) = ${mu} marcada. ${filas.map((f) => `P(X = ${f4(f.x)}) = ${f4(f.p)}`).join('; ')}.`}
          />
        </Paso>
        <Paso titulo="La condición de cierre">
          <Cuenta>
            {filas.length <= 10 ? `${ps.map(f4).join(' + ')} = ${f4(v.suma)}` : `Σ pᵢ = ${f4(v.suma)}`}
          </Cuenta>
          <p className="calc-hoja__nota">{v.cierra ? 'Suman 1. Es una distribución.' : 'Tienen que sumar 1.'}</p>
        </Paso>
        <Paso titulo="La tabla">
          <Desborde etiqueta="La tabla de la variable">
            <table className="tabla-pasos">
              <caption className="solo-lectores">La tabla de x, p, x·p y (x − μ)²·p, con la suma de cada columna</caption>
              <thead>
                <tr>
                  <th scope="col">x</th>
                  <th scope="col">p</th>
                  <th scope="col">x·p</th>
                  <th scope="col">(x − μ)²·p</th>
                </tr>
              </thead>
              <tbody>
                {v.filas.map((f, i) => (
                  <tr key={i}>
                    <th scope="row">{f4(f.x)}</th>
                    <td>{f4(f.p)}</td>
                    <td>{f4(f.xp)}</td>
                    <td>{f4(f.cuadrados)}</td>
                  </tr>
                ))}
                <tr className="ce-suma">
                  <th scope="row">Σ</th>
                  <td>{f4(v.suma)}</td>
                  <td>{mu}</td>
                  <td>{f4(v.varianza)}</td>
                </tr>
              </tbody>
            </table>
          </Desborde>
        </Paso>
        <Paso titulo="La esperanza">
          <Cuenta>{`μ = E(X) = Σ xᵢ·pᵢ = ${mu}`}</Cuenta>
        </Paso>
        <Paso titulo="La varianza y el desvío">
          <Cuenta>{`V(X) = Σ (xᵢ − μ)²·pᵢ = ${f4(v.varianza)}`}</Cuenta>
          <Cuenta>
            σ = <Raiz>V(X)</Raiz> = <Raiz>{f4(v.varianza)}</Raiz> = {f4(v.desvio)}
          </Cuenta>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function TablaDiscreta() {
  const [estado, setEstado] = useRecordado('calc:tabla-discreta', { filas: EJEMPLOS[0].filas });
  const { filas } = estado;
  const leida = useMemo(() => leerFilas(filas, COLUMNAS, { lugar: 'columna' }), [filas]);
  const negativa = leida.valores?.findIndex((f) => f.p < 0) ?? -1;
  const error = leida.error ?? (negativa >= 0 ? { fila: negativa, columna: 1, mensaje: `La probabilidad de la columna ${negativa + 1} es negativa.` } : null);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <TablaTiza etiqueta="La distribución de X" columnas={COLUMNAS} filas={filas} error={error} alCambiar={(f) => setEstado({ filas: f })} vacia={{ x: '', p: '' }} horizontal nombreFilas="valores" singular="valor" articulo="Un" />
          <p className="campo__ayuda">Decimales o fracciones, como 0,25 o 1/6.</p>
          {error && <p className="campo__error" role="alert">{error.mensaje}</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ filas: f }) => setEstado({ filas: f })} />
      </section>

      {!error && <Resolucion filas={leida.valores} />}
    </>
  );
}
