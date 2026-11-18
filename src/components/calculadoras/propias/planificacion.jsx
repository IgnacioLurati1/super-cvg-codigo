import { useMemo } from 'react';
import { ALGORITMOS, comparar, leerProcesos, MAX_PROCESOS, planificar, tiempo, usaPrioridad } from '../../../lib/calculadoras/planificacion';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Campo, Contador, Cuenta, Grilla, useAncho } from './_so-piezas';
import './planificacion.css';

// Planificación de la CPU of Sistemas Operativos: the processes in a table on the board, and on the sheet the Gantt
// drawn by hand, who takes the CPU each time and why, each process's turnaround and waiting, and the averages. Method,
// tie rules and examples: parcial.md and emergencia.md of El Santo Resumen (teoría 2b, the practice of planning).

const ALGS = Object.entries(ALGORITMOS).map(([valor, texto]) => ({ valor, texto }));
const ALTA = [
  { valor: 'chico', texto: 'El número más chico' },
  { valor: 'grande', texto: 'El más grande' },
];
const COLUMNAS = ['Proceso', 'Llegada', 'Ráfaga', 'Prioridad'];
const CAMPOS = ['nombre', 'llegada', 'rafaga', 'prioridad'];

const relleno = (filas) => Array.from({ length: MAX_PROCESOS }, (_, i) => ({ nombre: `P${i + 1}`, llegada: '0', rafaga: '1', prioridad: '1', ...filas[i] }));
const procesos = (nombres, llegadas, rafagas) => relleno(nombres.map((nombre, i) => ({ nombre, llegada: String(llegadas[i]), rafaga: String(rafagas[i]) })));

// The examples of the notes: the practice's 24, 3 and 3 ms, the book's SJF and its counterexample.
export const EJEMPLOS = [
  { nombre: 'Round Robin de la práctica', alg: 'rr', quantum: '4', alta: 'chico', cantidad: 3, filas: procesos(['P1', 'P2', 'P3'], [0, 0, 0], [24, 3, 3]) },
  { nombre: 'FCFS con 24, 3 y 3', alg: 'fcfs', quantum: '4', alta: 'chico', cantidad: 3, filas: procesos(['P1', 'P2', 'P3'], [0, 0, 0], [24, 3, 3]) },
  { nombre: 'SJF del libro', alg: 'sjf', quantum: '4', alta: 'chico', cantidad: 4, filas: procesos(['A', 'B', 'C', 'D'], [0, 0, 0, 0], [8, 4, 4, 4]) },
  { nombre: 'SJF que no es óptimo', alg: 'sjf', quantum: '4', alta: 'chico', cantidad: 5, filas: procesos(['A', 'B', 'C', 'D', 'E'], [0, 0, 3, 3, 3], [2, 4, 1, 1, 1]) },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

/** A process's name with its color of the Gantt. */
const Nombre = ({ P, i }) => (
  <span className="so-chip" data-tono={i % 10}>
    {P[i].nombre}
  </span>
);

const lista = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

/** The Gantt drawn on the sheet: one bar per turn, its name inside if it fits, and the times below. */
function Gantt({ P, tramos, total }) {
  const [caja, { ancho, letra }] = useAncho();
  const fs = Math.round(letra * 0.875);
  const pad = fs;
  const W = Math.max(260, ancho || 600);
  const minimo = Math.min(...tramos.map((x) => x.b - x.a));
  const esc = Math.min(Math.max((W - 2 * pad) / total, (fs * 2.2) / minimo), (6000 - 2 * pad) / total);
  const largo = Math.round(total * esc + 2 * pad);
  const y0 = 4;
  const alto = fs * 2.6;
  const H = Math.round(y0 + alto + fs * 2.2);
  const X = (t) => pad + t * esc;
  const marcas = [...new Set([0, ...tramos.flatMap((x) => [x.a, x.b])])].sort((a, b) => a - b);
  const visibles = marcas.reduce(
    (a, v) => {
      const medio = (tiempo(v).length * fs * 0.6) / 2;
      return X(v) - medio < a.hasta + 4 ? a : { hasta: X(v) + medio, lista: [...a.lista, v] };
    },
    { hasta: -Infinity, lista: [] },
  ).lista;
  const dicho = tramos.map((x) => `${x.i === null ? 'CPU ociosa' : P[x.i].nombre} de ${tiempo(x.a)} a ${tiempo(x.b)}`).join(', ');
  return (
    <div ref={caja} className="pl-gantt-caja">
      <Desborde etiqueta="El diagrama de Gantt">
        <svg className="pl-gantt" width={largo} height={H} viewBox={`0 0 ${largo} ${H}`} role="img" aria-label={`Diagrama de Gantt. ${dicho}.`} style={{ fontSize: fs }}>
          {tramos.map((x, k) => {
            const w = X(x.b) - X(x.a);
            const nombre = x.i === null ? '' : P[x.i].nombre;
            return (
              <g key={k} className="pl-gantt__tramo" data-tono={x.i === null ? undefined : x.i % 10} data-ociosa={x.i === null || undefined}>
                <rect x={X(x.a)} y={y0} width={w} height={alto} />
                {nombre && w >= fs * 0.62 * nombre.length + 6 && (
                  <text x={X(x.a) + w / 2} y={y0 + alto / 2} textAnchor="middle" dominantBaseline="central">
                    {nombre}
                  </text>
                )}
              </g>
            );
          })}
          <line className="pl-gantt__eje" x1={X(0)} x2={X(total)} y1={y0 + alto} y2={y0 + alto} />
          {marcas.map((v) => (
            <line key={v} className="pl-gantt__eje" x1={X(v)} x2={X(v)} y1={y0 + alto} y2={y0 + alto + fs * 0.45} />
          ))}
          {visibles.map((v) => (
            <text key={v} className="pl-gantt__tiempo" x={X(v)} y={y0 + alto + fs * 1.6} textAnchor="middle">
              {tiempo(v)}
            </text>
          ))}
        </svg>
      </Desborde>
    </div>
  );
}

/** Why the chosen one takes the CPU, said short. */
function porQue(alg, P, turno) {
  const { listos, corre, empate, valor } = turno;
  if (alg === 'rr') return listos.length > 1 ? 'Es el primero de la cola.' : '';
  if (listos.length < 2) return 'Es el único listo.';
  const elige = {
    fcfs: 'Llegó primero.',
    sjf: `Tiene la ráfaga más corta, ${tiempo(valor)}.`,
    srtn: `Le queda menos, ${tiempo(valor)}.`,
    prio: `Tiene la prioridad más alta, ${P[corre].prioridad}.`,
    prioa: `Tiene la prioridad más alta, ${P[corre].prioridad}.`,
  }[alg];
  if (!empate.length) return elige;
  const juntos = empate.filter((x) => P[x].llegada === P[corre].llegada).length;
  const desempate = alg === 'fcfs' || juntos === empate.length ? 'está antes en la lista' : 'llegó antes';
  return `${elige} Empata con ${lista(empate.map((x) => P[x].nombre))} y ${desempate}.`;
}

/** What happens while it runs and how it ends. */
function comoSigue(alg, P, turno) {
  const mejor = alg === 'srtn' ? 'más corto' : 'más prioritario';
  const partes = [];
  if (alg === 'rr' && turno.llegan.length) partes.push(`Mientras corre ${turno.llegan.length === 1 ? 'llega' : 'llegan'} ${lista(turno.llegan.map((x) => P[x].nombre))}.`);
  if (alg !== 'rr') {
    for (const l of turno.llegan) partes.push(`En ${tiempo(l.t)} ${l.quienes.length === 1 ? 'llega' : 'llegan'} ${lista(l.quienes.map((x) => P[x].nombre))}. No ${l.quienes.length === 1 ? 'es' : 'son'} ${mejor}.`);
  }
  if (turno.motivo === 'termina') partes.push('Termina.');
  const queda = `Le ${turno.queda === 1 ? 'queda' : 'quedan'} ${tiempo(turno.queda)}.`;
  if (turno.motivo === 'quantum') partes.push(`Se le acaba el quantum. ${queda} ${turno.sigue ? 'Sigue, porque la cola está vacía.' : 'Va al final de la cola.'}`);
  if (turno.motivo === 'desalojo') partes.push(`${P[turno.por].nombre} llega ${alg === 'srtn' ? 'con menos' : 'con más prioridad'} y le saca la CPU. ${queda}`);
  return partes.join(' ');
}

function Turnos({ alg, P, turnos }) {
  return (
    <Desborde etiqueta="Quién toma la CPU">
      <table className="tabla-pasos tabla-pasos--altas pl-turnos">
        <caption className="solo-lectores">Cada vez que alguien toma la CPU, quiénes estaban listos y qué pasa</caption>
        <thead>
          <tr>
            <th scope="col">t</th>
            <th scope="col" className="so-izq">{alg === 'rr' ? 'Cola de listos' : 'Listos'}</th>
            <th scope="col" className="so-izq">Corre</th>
            <th scope="col">Hasta</th>
            <th scope="col" className="so-texto">Qué pasa</th>
          </tr>
        </thead>
        <tbody>
          {turnos.map((x, k) =>
            x.ociosa ? (
              <tr key={k}>
                <th scope="row">{tiempo(x.t)}</th>
                <td className="so-izq">nadie</td>
                <td className="so-izq pl-ociosa">CPU ociosa</td>
                <td>{tiempo(x.hasta)}</td>
                <td className="so-texto">{`Llega ${P[x.llega].nombre}.`}</td>
              </tr>
            ) : (
              <tr key={k}>
                <th scope="row">{tiempo(x.t)}</th>
                <td className="so-izq pl-listos">
                  {x.listos.map((i, j) => (
                    <span key={i}>
                      {j > 0 && ' '}
                      {i === x.corre ? <Nombre P={P} i={i} /> : P[i].nombre}
                    </span>
                  ))}
                </td>
                <td className="so-izq">
                  <Nombre P={P} i={x.corre} />
                </td>
                <td>{tiempo(x.hasta)}</td>
                <td className="so-texto">{`${porQue(alg, P, x)} ${comoSigue(alg, P, x)}`.trim()}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </Desborde>
  );
}

function Resolucion({ P, alg, quantum, qComparar, chicoEsMas }) {
  const r = planificar(P, alg, { quantum, chicoEsMas });
  const n = P.length;
  const conPrioridad = usaPrioridad(alg);
  const qOtros = alg === 'rr' ? quantum : qComparar;
  const otros = comparar(P, { quantum: qOtros ?? 1, chicoEsMas, conPrioridad, conRoundRobin: qOtros !== null });
  const suma = (xs) => `(${xs.map(tiempo).join(' + ')}) / ${n}`;
  return (
    <Hoja>
      <Resultado dicho={`Espera promedio ${tiempo(r.esperaPromedio)}. Retorno promedio ${tiempo(r.retornoPromedio)}.`} nota={`retorno promedio = ${tiempo(r.retornoPromedio)}`}>
        espera promedio = {tiempo(r.esperaPromedio)}
      </Resultado>
      <Pasos>
        <Paso titulo={alg === 'rr' ? `El diagrama de Gantt, con quantum ${tiempo(quantum)}` : 'El diagrama de Gantt'}>
          <Gantt P={P} tramos={r.tramos} total={r.total} />
        </Paso>
        <Paso titulo="Quién toma la CPU">
          <Turnos alg={alg} P={P} turnos={r.turnos} />
        </Paso>
        <Paso titulo="Retorno y espera de cada proceso">
          <Desborde etiqueta="Retorno y espera de cada proceso">
            <table className="tabla-pasos">
              <caption className="solo-lectores">Cada proceso con su llegada, su ráfaga, cuándo termina, su retorno y su espera</caption>
              <thead>
                <tr>
                  <th scope="col" className="so-izq">Proceso</th>
                  <th scope="col">Llegada</th>
                  <th scope="col">Ráfaga</th>
                  {conPrioridad && <th scope="col">Prioridad</th>}
                  <th scope="col">Fin</th>
                  <th scope="col">
                    Retorno<span className="tabla-pasos__sub">fin − llegada</span>
                  </th>
                  <th scope="col">
                    Espera<span className="tabla-pasos__sub">retorno − ráfaga</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {P.map((p, i) => (
                  <tr key={p.nombre}>
                    <th scope="row">
                      <Nombre P={P} i={i} />
                    </th>
                    <td>{tiempo(p.llegada)}</td>
                    <td>{tiempo(p.rafaga)}</td>
                    {conPrioridad && <td>{p.prioridad}</td>}
                    <td>{tiempo(r.fin[i])}</td>
                    <td>{`${tiempo(r.fin[i])} − ${tiempo(p.llegada)} = ${tiempo(r.retorno[i])}`}</td>
                    <td>{`${tiempo(r.retorno[i])} − ${tiempo(p.rafaga)} = ${tiempo(r.espera[i])}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
        </Paso>
        <Paso titulo="Los promedios">
          <Cuenta>{`espera promedio = ${suma(r.espera)} = ${tiempo(r.esperaPromedio)}`}</Cuenta>
          <Cuenta>{`retorno promedio = ${suma(r.retorno)} = ${tiempo(r.retornoPromedio)}`}</Cuenta>
        </Paso>
        <Paso titulo="Con los mismos procesos, cada algoritmo">
          <Desborde etiqueta="Cada algoritmo con los mismos procesos">
            <table className="tabla-pasos">
              <caption className="solo-lectores">La espera y el retorno promedio de cada algoritmo, con los mismos procesos</caption>
              <thead>
                <tr>
                  <th scope="col" className="so-izq">Algoritmo</th>
                  <th scope="col">Espera promedio</th>
                  <th scope="col">Retorno promedio</th>
                </tr>
              </thead>
              <tbody>
                {otros.map((x) => (
                  <tr key={x.alg} data-elegido={x.alg === alg || undefined}>
                    <th scope="row">
                      {x.alg === 'rr' ? `Round Robin, q = ${tiempo(qOtros)}` : ALGORITMOS[x.alg]}
                      {x.alg === alg && <span className="solo-lectores">, el elegido</span>}
                    </th>
                    <td>{tiempo(x.espera)}</td>
                    <td>{tiempo(x.retorno)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

const REGLAS = {
  rr: 'Si alguien llega justo cuando se termina un quantum, entra a la cola antes que el que sale.',
  srtn: 'Saca de la CPU solo si el que llega es más corto. En un empate va el que llegó antes.',
  prioa: 'Saca de la CPU solo si el que llega es más prioritario. En un empate va el que llegó antes.',
};

export default function Planificacion() {
  const [estado, setEstado] = useRecordado('calc:planificacion', INICIAL);
  const { alg, quantum, alta, cantidad, filas } = estado;
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const conPrioridad = usaPrioridad(alg);
  const columnas = conPrioridad ? 4 : 3;
  const visibles = useMemo(() => filas.slice(0, cantidad), [filas, cantidad]);
  const leidos = useMemo(() => leerProcesos(visibles, { alg, quantum }), [visibles, alg, quantum]);
  const qComparar = useMemo(() => (alg === 'rr' ? null : (leerProcesos(visibles, { alg: 'rr', quantum }).quantum ?? null)), [visibles, alg, quantum]);
  const error = leidos.error;
  const enGrilla = error && error.fila >= 0 ? { fila: error.fila, columna: CAMPOS.indexOf(error.campo) } : null;

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Algoritmo" nombre="algoritmo" opciones={ALGS} valor={alg} alCambiar={(a) => cambiar({ alg: a })} />
          <fieldset className="pl-procesos">
            <legend className="opciones__leyenda">Los procesos</legend>
            <Contador etiqueta="procesos" menos="Un proceso menos" mas="Un proceso más" valor={cantidad} max={MAX_PROCESOS} alCambiar={(n) => cambiar({ cantidad: n })} />
            <Grilla
              etiqueta={`Los procesos, ${cantidad}`}
              filas={cantidad}
              columnas={columnas}
              cabeza={COLUMNAS.slice(0, columnas)}
              valor={(i, j) => filas[i][CAMPOS[j]]}
              celda={(i, j) => `${COLUMNAS[j]} del proceso ${i + 1}`}
              modo={(j) => (j === 0 ? 'text' : 'decimal')}
              error={enGrilla}
              alCambiar={(i, j, v) => setEstado((e) => ({ ...e, filas: e.filas.map((f, k) => (k === i ? { ...f, [CAMPOS[j]]: v } : f)) }))}
            />
            {error && error.fila >= 0 && <p className="campo__error" role="alert">{error.texto}</p>}
          </fieldset>
          {alg === 'rr' && <Campo etiqueta="Quantum" valor={quantum} alCambiar={(q) => cambiar({ quantum: q })} error={error?.campo === 'quantum' ? error.texto : null} corto inputMode="decimal" />}
          {conPrioridad && <Opciones leyenda="La prioridad más alta" nombre="alta" opciones={ALTA} valor={alta} alCambiar={(a) => cambiar({ alta: a })} chica />}
          {REGLAS[alg] && <p className="campo__ayuda">{REGLAS[alg]}</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion P={leidos.P} alg={alg} quantum={leidos.quantum} qComparar={qComparar} chicoEsMas={alta === 'chico'} />}
    </>
  );
}
