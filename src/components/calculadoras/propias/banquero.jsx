import { useMemo } from 'react';
import { detectar, leerDatos, MAX_PROCESOS, MAX_RECURSOS, vector } from '../../../lib/calculadoras/interbloqueos';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Contador, Cuenta, Grilla } from './_so-piezas';
import './banquero.css';

// Interbloqueos of Sistemas Operativos: the matrices C and R and the vector (E or A) on the board, and on the sheet
// the detection of the notes round by round, each row of R against A with what is short circled, and the marks.
// Method and examples: parcial.md of El Santo Resumen (teoría 5c, figure 6-7 and its two variants). The notes don't
// bring the banker's algorithm (maximum, need, safe state), so it is not here.

const VECTOR = [
  { valor: 'E', texto: 'E, los que existen' },
  { valor: 'A', texto: 'A, los disponibles' },
];

const lleno = (filas, ancho) => Array.from({ length: MAX_PROCESOS }, (_, i) => Array.from({ length: ancho }, (_u, j) => String(filas[i]?.[j] ?? 0)));
const C67 = [[0, 0, 1, 0], [2, 0, 0, 1], [0, 1, 2, 0]];
const R67 = [[2, 0, 0, 1], [1, 0, 1, 0], [2, 1, 0, 0]];
const ejemplo = (nombre, R, es, v) => ({ nombre, n: 3, m: 4, C: lleno(C67, MAX_RECURSOS), R: lleno(R, MAX_RECURSOS), es, v: lleno([v], MAX_RECURSOS)[0] });

export const EJEMPLOS = [
  ejemplo('Figura 6-7', R67, 'E', [4, 2, 3, 1]),
  ejemplo('El 2 pide un CD-ROM más', [R67[0], [1, 0, 1, 1], R67[2]], 'A', [2, 1, 0, 0]),
  ejemplo('El 3 pide un CD-ROM más', [R67[0], R67[1], [2, 1, 0, 1]], 'A', [2, 1, 0, 0]),
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const P = (i) => `P${i + 1}`;
const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

/** A vector as the notes write it: (2 1 0 0). */
function Vector({ v }) {
  return (
    <span className="bq-vector">
      (
      {v.map((x, j) => (
        <span key={j} className="bq-vector__c">
          {x}
        </span>
      ))}
      )
    </span>
  );
}

/** One round: A on top, and below each row of R it looked at, aligned by resource, with what doesn't fit circled. */
function Ronda({ ronda, R, C }) {
  const { A, revisados, elegido } = ronda;
  const filas = [...revisados.map((x) => x.i), ...(elegido >= 0 ? [elegido] : [])];
  return (
    <>
      <Desborde etiqueta={`Cada fila de R contra A = ${vector(A)}`}>
        <table className="tabla-pasos bq-ronda">
          <caption className="solo-lectores">Cada fila de R contra A, recurso por recurso</caption>
          <thead>
            <tr>
              <th scope="col" className="so-izq">
                <span className="solo-lectores">Fila</span>
              </th>
              {A.map((_, j) => (
                <th key={j} scope="col">
                  <span className="solo-lectores">recurso </span>
                  {j + 1}
                </th>
              ))}
              <th scope="col" className="so-izq">
                <span className="solo-lectores">Qué pasa</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="bq-ronda__a">
              <th scope="row" className="so-izq">A</th>
              {A.map((x, j) => (
                <td key={j}>{x}</td>
              ))}
              <td className="so-izq" />
            </tr>
            {filas.map((i) => {
              const faltan = R[i].map((x, j) => (x > A[j] ? j : -1)).filter((j) => j >= 0);
              const puede = i === elegido;
              return (
                <tr key={i} data-elegido={puede || undefined}>
                  <th scope="row" className="so-izq">{`R de ${P(i)}`}</th>
                  {R[i].map((x, j) => (
                    <td key={j} data-falta={faltan.includes(j) || undefined}>
                      {x}
                      {faltan.includes(j) && <span className="solo-lectores">, más que A</span>}
                    </td>
                  ))}
                  <td className="so-izq bq-ronda__que">{puede ? 'Entra en A.' : `No alcanza ${faltan.length === 1 ? 'el recurso' : 'los recursos'} ${lista(faltan.map((j) => j + 1))}.`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Desborde>
      {elegido >= 0 ? (
        <>
          <p>{`${P(elegido)} puede terminar. Devuelve su fila de C y se marca.`}</p>
          <Cuenta>
            A = <Vector v={A} /> + <Vector v={C[elegido]} /> = <Vector v={ronda.despues} />
          </Cuenta>
        </>
      ) : (
        <p>{filas.length === 1 ? 'El que queda no puede terminar.' : 'Ninguno de los que quedan puede terminar.'}</p>
      )}
    </>
  );
}

function Resolucion({ datos, es }) {
  const { C, R, A } = datos;
  const r = detectar(C, R, A);
  const bloqueados = r.bloqueados.map(P);
  const todos = r.bloqueados.length === C.length;
  const marca = new Map(r.orden.map((i, k) => [i, k + 1]));
  const respuesta = !bloqueados.length ? 'No hay interbloqueo' : todos ? 'Todo el sistema está en interbloqueo' : `${lista(bloqueados)} ${bloqueados.length === 1 ? 'está' : 'están'} en interbloqueo`;
  const nota = !bloqueados.length ? `Terminan en el orden ${lista(r.orden.map(P))}.` : r.orden.length ? `${lista(r.orden.map(P))} ${r.orden.length === 1 ? 'termina' : 'terminan'}. Después nadie más puede seguir.` : 'Ninguna petición se puede cumplir.';
  return (
    <Hoja>
      <Resultado dicho={`${respuesta}. ${nota}`} nota={nota}>
        {respuesta}
      </Resultado>
      <Pasos>
        {es === 'E' && (
          <Paso titulo="Los disponibles">
            <p>Cada recurso está asignado o disponible.</p>
            <Cuenta>
              A = E − suma de C = <Vector v={datos.E} /> − <Vector v={datos.usado} /> = <Vector v={A} />
            </Cuenta>
          </Paso>
        )}
        {r.rondas.map((x, k) => (
          <Paso key={k} titulo={<>Con A = <Vector v={x.A} /></>}>
            <Ronda ronda={x} R={R} C={C} />
          </Paso>
        ))}
        <Paso titulo="Las marcas">
          <Desborde etiqueta="Las marcas">
            <table className="tabla-pasos">
              <caption className="solo-lectores">Cada proceso con su fila de C, su fila de R y en qué orden se marcó</caption>
              <thead>
                <tr>
                  <th scope="col" className="so-izq">Proceso</th>
                  <th scope="col">Fila de C</th>
                  <th scope="col">Fila de R</th>
                  <th scope="col">Marca</th>
                </tr>
              </thead>
              <tbody>
                {C.map((fila, i) => (
                  <tr key={i} data-sin-marca={!marca.has(i) || undefined}>
                    <th scope="row" className="so-izq">{P(i)}</th>
                    <td>{fila.join(' ')}</td>
                    <td>{R[i].join(' ')}</td>
                    <td className="bq-marca">{marca.has(i) ? `${marca.get(i)}.°` : 'sin marcar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
          {bloqueados.length > 0 && <p>Los que quedan sin marcar están en interbloqueo.</p>}
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Interbloqueos() {
  const [estado, setEstado] = useRecordado('calc:banquero', INICIAL);
  const { n, m, C, R, es, v } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const datos = useMemo(
    () => leerDatos({ C: C.slice(0, n).map((f) => f.slice(0, m)), R: R.slice(0, n).map((f) => f.slice(0, m)), vector: v.slice(0, m), es }),
    [C, R, v, n, m, es],
  );
  const error = datos.error;
  const en = (donde) => (error && error.donde === donde ? error : null);
  const escribir = (clave) => (i, j, x) => setEstado((e) => ({ ...e, [clave]: e[clave].map((f, a) => (a === i ? f.map((y, b) => (b === j ? x : y)) : f)) }));
  const recursos = Array.from({ length: m }, (_, j) => String(j + 1));
  const procesos = Array.from({ length: MAX_PROCESOS }, (_, i) => P(i));

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <fieldset className="mat-tamano">
            <legend className="opciones__leyenda">Tamaño</legend>
            <Contador etiqueta="procesos" menos="Un proceso menos" mas="Un proceso más" valor={n} max={MAX_PROCESOS} alCambiar={(x) => cambiar({ n: x })} />
            <span className="mat-tamano__por" aria-hidden="true">×</span>
            <Contador etiqueta="recursos" menos="Un recurso menos" mas="Un recurso más" valor={m} max={MAX_RECURSOS} alCambiar={(x) => cambiar({ m: x })} />
          </fieldset>
          <div className="bq-matrices">
            <div className="bq-matriz">
              <Grilla
                nombre="C ="
                etiqueta="C, lo que tiene asignado cada proceso"
                filas={n}
                columnas={m}
                cabeza={recursos}
                lados={procesos}
                parentesis
                valor={(i, j) => C[i][j]}
                celda={(i, j) => `C, ${P(i)}, recurso ${j + 1}`}
                error={en('C')}
                alCambiar={escribir('C')}
              />
              <p className="bq-matriz__nombre">asignaciones</p>
            </div>
            <div className="bq-matriz">
              <Grilla
                nombre="R ="
                etiqueta="R, lo que pide cada proceso"
                filas={n}
                columnas={m}
                cabeza={recursos}
                lados={procesos}
                parentesis
                valor={(i, j) => R[i][j]}
                celda={(i, j) => `R, ${P(i)}, recurso ${j + 1}`}
                error={en('R')}
                alCambiar={escribir('R')}
              />
              <p className="bq-matriz__nombre">peticiones</p>
            </div>
          </div>
          <Opciones leyenda="El vector" nombre="vector" opciones={VECTOR} valor={es} alCambiar={(x) => cambiar({ es: x })} chica />
          <Grilla
            nombre={`${es} =`}
            etiqueta={es === 'E' ? 'E, los recursos que existen' : 'A, los recursos disponibles'}
            filas={1}
            columnas={m}
            parentesis
            valor={(_, j) => v[j]}
            celda={(_, j) => `${es}, recurso ${j + 1}`}
            error={en('v')}
            alCambiar={(_, j, x) => setEstado((e) => ({ ...e, v: e.v.map((y, b) => (b === j ? x : y)) }))}
          />
          {error && <p className="campo__error" role="alert">{error.texto}</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion datos={datos} es={es} />}
    </>
  );
}
