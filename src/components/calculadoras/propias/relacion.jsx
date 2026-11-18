import { useMemo, useState } from 'react';
import Campo from '../../Campo';
import { analizar, conjunto, deParesTexto, leerConjunto, leerPares, matriz, par } from '../../../lib/calculadoras/relaciones';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { Bucle, Dibujo, Flecha, SiNo, Vertice } from './_log-trazos';
import './relacion.css';

// Relations of Lógica y Estructuras Discretas: the set and the pairs on the board, and on the sheet the digraph, the
// matrix, the domain and the range, R² by paths of length 2 and the six properties one by one, as the notes ask
// («para justificar que no se cumple alcanza un caso»). The method is El Santo Resumen's (lib/calculadoras/relaciones.js).

// Ejemplo 3 of Relaciones y digrafos III (the four relations on {1, 2, 3, 4}) and Ejemplo 2 of Relaciones y digrafos IV,
// the equivalence one (parcial-2.md of Lógica).
const A4 = '{1, 2, 3, 4}';
export const EJEMPLOS = [
  { nombre: 'L, no transitiva', conjunto: A4, pares: '{(1,1), (1,2), (2,3), (3,1)}' },
  { nombre: 'S, con S² = S', conjunto: A4, pares: '{(1,1), (1,2), (1,3), (2,3), (3,3)}' },
  { nombre: 'T, con T² ⊆ T', conjunto: A4, pares: '{(1,2), (1,3), (2,3), (3,3)}' },
  { nombre: 'R, por vacuidad', conjunto: A4, pares: '{(1,2), (1,3), (4,2)}' },
  { nombre: 'De equivalencia', conjunto: '{1, 2, 3, 4, 5}', pares: '{(1,1), (1,2), (1,3), (2,2), (2,1), (2,3), (3,1), (3,2), (3,3), (4,4), (5,5)}' },
];

const INICIAL = { conjunto: A4, pares: EJEMPLOS[0].pares };

const R = 17;

/** The vertices on a circle, the first one on top, clockwise. */
function ubicar(elementos) {
  const n = elementos.length;
  const radio = n <= 2 ? 64 : Math.max(78, n * 15);
  const lado = 2 * (radio + R + 44);
  const c = lado / 2;
  const pos = new Map(elementos.map((e, i) => {
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [e, { x: c + radio * Math.cos(ang), y: c + radio * Math.sin(ang), ang }];
  }));
  return { pos, lado, c };
}

/**
 * The digraph as the notes draw it: a small circle per element and an arrow from a to b when a R b. A pair and its way
 * back go curved, each on its side, so both are seen. `ahora`: the arrows to mark, the rest faint.
 */
function Digrafo({ elementos, pares, etiqueta, ahora }) {
  const { pos, lado, c } = useMemo(() => ubicar(elementos), [elementos]);
  const hay = new Set(pares.map(([a, b]) => `${a},${b}`));
  const marca = (a, b) => (!ahora ? undefined : ahora.has(`${a},${b}`) ? 'ahora' : 'tenue');
  return (
    <Dibujo ancho={lado} alto={lado} etiqueta={etiqueta} minimo={0.72}>
      {pares.map(([a, b]) => {
        const p = pos.get(a);
        if (a === b) return <Bucle key={`${a},${b}`} x={p.x} y={p.y} r={R} ang={p.ang} marca={marca(a, b)} />;
        const q = pos.get(b);
        let control;
        if (hay.has(`${b},${a}`)) {
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const l = Math.hypot(dx, dy);
          control = { x: (p.x + q.x) / 2 - (dy / l) * 22, y: (p.y + q.y) / 2 + (dx / l) * 22 };
        }
        return <Flecha key={`${a},${b}`} desde={p} hasta={q} r={R} c={control} marca={marca(a, b)} />;
      })}
      {elementos.map((e) => {
        const p = pos.get(e);
        return <Vertice key={e} x={p.x} y={p.y} r={R} texto={e} />;
      })}
      <circle cx={c} cy={c} r="0" fill="none" />
    </Dibujo>
  );
}

/** The matrix of a relation, with each element naming its row and its column, the 1 in bold. */
function Matriz({ elementos, pares, nombre, marcados = new Set() }) {
  const M = matriz(elementos, pares);
  return (
    <Desborde etiqueta={`La matriz de ${nombre}`}>
      <table className="rel-matriz">
        <caption className="rel-matriz__nombre">
          M<sub>{nombre}</sub>
        </caption>
        <thead>
          <tr>
            <td />
            {elementos.map((e) => <th key={e} scope="col">{e}</th>)}
          </tr>
        </thead>
        <tbody>
          {elementos.map((a, i) => (
            <tr key={a}>
              <th scope="row">{a}</th>
              {elementos.map((b, j) => (
                <td key={b} data-uno={M[i][j] || undefined} data-marca={marcados.has(`${a},${b}`) || undefined}>{M[i][j]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
}

/** R²: each pair, with the path of length 2 that gives it drawn on the digraph. */
function Cuadrado({ elementos, r }) {
  const [elegido, setElegido] = useState(0);
  const k = Math.min(elegido, r.r2.length - 1);
  const actual = r.r2[k];
  const enR = new Set(r.pares.map(([a, b]) => `${a},${b}`));
  const fuera = new Set(r.fuera.map((v) => `${v.par[0]},${v.par[1]}`));
  if (!r.r2.length) {
    return (
      <>
        <p className="calc-hoja__cuenta">R² = ∅</p>
        <p>No hay trayectorias de longitud 2. R es transitiva por vacuidad.</p>
      </>
    );
  }
  const [a, b] = actual.par;
  return (
    <>
      <p className="calc-hoja__cuenta">{`R² = ${deParesTexto(r.r2.map((v) => v.par))}`}</p>
      <div className="rel-pares" role="group" aria-label="Elegí un par de R² para ver su trayectoria">
        {r.r2.map((v, i) => (
          <button key={par(v.par)} type="button" className="rel-par" aria-pressed={i === k} data-fuera={fuera.has(`${v.par[0]},${v.par[1]}`) || undefined} onClick={() => setElegido(i)}>
            {par(v.par)}
          </button>
        ))}
      </div>
      <Digrafo elementos={elementos} pares={r.pares} ahora={new Set([`${a},${actual.por}`, `${actual.por},${b}`])} etiqueta={`Trayectoria de ${a} a ${b} que pasa por ${actual.por}.`} />
      <p className="rel-camino" aria-live="polite">
        {`π: ${a}, ${actual.por}, ${b}. De ${a} a ${actual.por} y de ${actual.por} a ${b}, longitud 2. `}
        {enR.has(`${a},${b}`) ? `${par(actual.par)} está en R.` : <strong>{`${par(actual.par)} no está en R.`}</strong>}
      </p>
      <Matriz elementos={elementos} pares={r.r2.map((v) => v.par)} nombre="R²" marcados={fuera} />
      <p>
        {r.transitiva
          ? 'R² está incluida en R. R es transitiva.'
          : `${r.fuera.map((v) => par(v.par)).join(', ')} ${r.fuera.length > 1 ? 'están' : 'está'} en R² y no en R. R² no está incluida en R. R no es transitiva.`}
      </p>
    </>
  );
}

function Resumen({ r }) {
  if (r.equivalencia && r.deOrden) {
    return (
      <Resultado dicho="Es de equivalencia y de orden. Es la igualdad." nota="Es la igualdad.">
        <span>Es</span>
        <span className="resaltado">de equivalencia y de orden</span>
      </Resultado>
    );
  }
  if (r.equivalencia || r.deOrden) {
    const cual = r.equivalencia ? 'de equivalencia' : 'de orden';
    const por = r.equivalencia ? 'Es reflexiva, simétrica y transitiva.' : 'Es reflexiva, antisimétrica y transitiva.';
    return (
      <Resultado dicho={`Es ${cual}. ${por}`} nota={por}>
        <span>Es</span>
        <span className="resaltado">{cual}</span>
      </Resultado>
    );
  }
  const si = r.propiedades.filter((p) => p.cumple).map((p) => p.nombre.toLowerCase());
  const lista = si.length > 1 ? `${si.slice(0, -1).join(', ')} y ${si.at(-1)}` : si[0];
  return (
    <Resultado dicho={si.length ? `Es ${lista}. No es de equivalencia ni de orden.` : 'No cumple ninguna de las seis propiedades.'} nota={si.length ? 'No es de equivalencia ni de orden.' : undefined}>
      {si.length ? (
        <>
          <span>Es</span>
          <span className="resaltado">{lista}</span>
        </>
      ) : (
        <span>No cumple ninguna de las seis</span>
      )}
    </Resultado>
  );
}

export default function Relacion() {
  const [estado, setEstado] = useRecordado('calc:relacion', INICIAL);
  const cambiar = (cambio) => setEstado((e) => ({ ...e, ...cambio }));
  const leido = useMemo(() => {
    const A = leerConjunto(estado.conjunto);
    if (A.error) return { error: A.error, campo: 'conjunto' };
    const P = leerPares(estado.pares, A.elementos);
    if (P.error) return { error: P.error, campo: 'pares' };
    return { elementos: A.elementos, r: analizar(A.elementos, P.pares) };
  }, [estado.conjunto, estado.pares]);
  const { elementos, r } = leido;

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Campo etiqueta="El conjunto A" ayuda="Hasta 10 elementos, separados con coma o espacio." error={leido.campo === 'conjunto' ? leido.error : null}>
            <input className="campo__control trz-escrito" type="text" autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={120} value={estado.conjunto} onChange={(e) => cambiar({ conjunto: e.target.value })} />
          </Campo>
          <Campo etiqueta="La relación R" ayuda="Los pares, como (1,2), (2,3). Vacío es la relación vacía." error={leido.campo === 'pares' ? leido.error : null}>
            <textarea className="campo__control trz-renglones trz-escrito" rows={2} autoComplete="off" autoCapitalize="none" spellCheck="false" maxLength={1600} value={estado.pares} onChange={(e) => cambiar({ pares: e.target.value })} />
          </Campo>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {r && (
        <Hoja>
          <Resumen r={r} />
          <Pasos>
            <Paso titulo="El digrafo">
              <p className="calc-hoja__cuenta rel-conjuntos">
                <span>{`A = ${conjunto(elementos)}`}</span>
                <span>{`R = ${deParesTexto(r.pares)}`}</span>
              </p>
              <Digrafo elementos={elementos} pares={r.pares} etiqueta={`Digrafo de R, con ${r.pares.length} ${r.pares.length === 1 ? 'flecha' : 'flechas'}. ${r.pares.map((p) => (p[0] === p[1] ? `Bucle en ${p[0]}` : `De ${p[0]} a ${p[1]}`)).join('. ')}.`} />
            </Paso>
            <Paso titulo="La matriz">
              <p className="calc-hoja__nota">Un 1 en la fila a y la columna b cuando (a,b) está en R.</p>
              <Matriz elementos={elementos} pares={r.pares} nombre="R" />
            </Paso>
            <Paso titulo="Dominio y rango">
              <dl className="dato">
                <dt>Dom(R)</dt>
                <dd>{conjunto(r.dominio)}</dd>
                <dt>Ran(R)</dt>
                <dd>{conjunto(r.rango)}</dd>
              </dl>
            </Paso>
            <Paso titulo="R², las trayectorias de longitud 2">
              <Cuadrado key={`${estado.conjunto}|${estado.pares}`} elementos={elementos} r={r} />
            </Paso>
            <Paso titulo="Propiedad por propiedad">
              <p className="calc-hoja__nota">Para que no se cumpla alcanza un caso. Para que sí, van todos los pares que la verifican.</p>
              <ul className="rel-propiedades">
                {r.propiedades.map((p) => (
                  <li key={p.nombre} className="rel-propiedad">
                    <span className="rel-propiedad__nombre">{p.nombre}</span>
                    <SiNo si={p.cumple} />
                    <span className="rel-propiedad__por">{p.por}</span>
                  </li>
                ))}
              </ul>
            </Paso>
            {r.clases && (
              <Paso titulo="Clases de equivalencia">
                <ul className="rel-clases">
                  {r.clases.map((c) => (
                    <li key={c.de} className="calc-hoja__cuenta">{`[${c.de}] = ${conjunto(c.elementos)}`}</li>
                  ))}
                </ul>
                <p className="calc-hoja__cuenta">{`A/R = {${r.clases.map((c) => `[${c.de}]`).join(', ')}}`}</p>
              </Paso>
            )}
          </Pasos>
        </Hoja>
      )}
    </>
  );
}
