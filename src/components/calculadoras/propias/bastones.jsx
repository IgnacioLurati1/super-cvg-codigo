import { coma } from '../../../lib/calculadoras/cifras';
import { MODELOS } from '../../../lib/calculadoras/distribuciones';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos } from '../Hoja';
import { Comb, Cuenta, Fichas, Frac, Raiz } from './_est-cuentas';
import { GraficoBastones } from './_est-dibujo';
import { Deslizador } from './_est-tiza';

// Gráfico de bastones of Probabilidad y Estadística: the Binomial or the Poisson with its parameters moved on the
// board, and on the sheet its sticks with E(X), the formula with the parameters in it, each P(X = x) with F(x), and
// E(X) and V(X) as the notes give them (V.A.D., pág. 8 to 13, in El Santo Resumen probabilidad-y-estadistica/
// parcial-2.md). The ranges are the ones of El Santo Resumen's own summaries: n up to 50, π by hundredths, λ by tenths.

const MODELO = [
  { valor: 'binomial', texto: 'Binomial' },
  { valor: 'poisson', texto: 'Poisson' },
];

// The notes' examples: five people buying with probability 0,2 (V.A.D., pág. 8), 5 calls a minute and 0,4 falls every
// 10 hours (pág. 12).
export const EJEMPLOS = [
  { nombre: 'Cinco personas', datos: { modelo: 'binomial', n: 5, pi: 0.2 } },
  { nombre: 'Llamadas, λ = 5', datos: { modelo: 'poisson', lam: 5 } },
  { nombre: 'Caídas, λ = 0,4', datos: { modelo: 'poisson', lam: 0.4 } },
];

const INICIO = { modelo: 'binomial', n: 5, pi: 0.2, lam: 5 };
const f4 = (x) => coma(x, 4);
const LARGA = 25;

/** The shape as the notes read it: π under 0,5 loads it to the left, 0,5 makes it symmetric. */
function forma(modelo, pi) {
  if (modelo === 'poisson') return 'Esperanza y varianza valen λ. Al subir λ, la forma se corre a la derecha y se abre.';
  if (Math.abs(pi - 0.5) < 1e-9) return 'Con π = 0,5 es simétrica.';
  return pi < 0.5 ? 'Con π menor que 0,5, la forma se carga a la izquierda.' : 'Con π mayor que 0,5, la forma se carga a la derecha.';
}

function Resolucion({ modelo, n, pi, lam }) {
  const binomial = modelo === 'binomial';
  const d = binomial ? { n, pi } : { lam };
  const m = MODELOS[modelo];
  const p = m.pmf(d);
  const [desde, hasta] = m.rango(d);
  let F = 0;
  const filas = [];
  for (let x = desde; x <= hasta; x += 1) {
    F += p(x);
    filas.push({ x, p: p(x), F });
  }
  const E = m.esperanza(d);
  const V = m.varianza(d);
  const piT = coma(pi, 2);
  const qT = coma(1 - pi, 2);
  const lamT = coma(lam, 2);
  const titulo = binomial ? `Binomial con n = ${n} y π = ${piT}` : `Poisson con λ = ${lamT}`;

  const tabla = (
    <Desborde etiqueta="Cada valor con su probabilidad">
      <table className="tabla-pasos">
        <caption className="solo-lectores">Cada valor de x con P(X = x) y la acumulada F(x)</caption>
        <thead>
          <tr>
            <th scope="col">x</th>
            <th scope="col">P(X = x)</th>
            <th scope="col">F(x)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.x}>
              <th scope="row">{f.x}</th>
              <td>{f4(f.p)}</td>
              <td>{f4(f.F)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );

  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Esperanza', valor: `E(X) = ${f4(E)}`, principal: true },
          { nombre: 'Varianza', valor: `V(X) = ${f4(V)}` },
          { nombre: 'Desvío', valor: `σ = ${f4(Math.sqrt(V))}` },
        ]}
        dicho={`${titulo}. E(X) da ${f4(E)} y V(X) ${f4(V)}.`}
      >
        <GraficoBastones
          puntos={filas.map((f) => ({ x: f.x, y: f.p }))}
          esperanza={E}
          nombreX={binomial ? 'x, cantidad de éxitos' : 'x, cantidad de eventos'}
          alto={250}
          etiqueta={`Bastones de la ${titulo}, con E(X) = ${f4(E)} marcada. ${filas.length <= 20 ? filas.map((f) => `P(X = ${f.x}) = ${f4(f.p)}`).join('; ') : `El bastón más alto está en x = ${filas.reduce((a, b) => (b.p > a.p ? b : a)).x}`}.`}
        />
        <p className="calc-hoja__nota ce-bajo-dibujo">{forma(modelo, pi)}</p>
      </Fichas>
      <Pasos>
        <Paso titulo="La fórmula">
          {binomial ? (
            <>
              <Cuenta>
                P(X = x) = <Comb n="n" k="x" />·π<sup>x</sup>·(1 − π)<sup>n − x</sup>
              </Cuenta>
              <Cuenta>
                P(X = x) = <Comb n={n} k="x" />·{piT}
                <sup>x</sup>·{qT}
                <sup>{n} − x</sup>
              </Cuenta>
            </>
          ) : (
            <>
              <Cuenta>
                P(X = x) = <Frac arriba={<>e<sup>−λ</sup>·λ<sup>x</sup></>} abajo="x!" />
              </Cuenta>
              <Cuenta>
                P(X = x) = <Frac arriba={<>e<sup>−{lamT}</sup>·{lamT}<sup>x</sup></>} abajo="x!" />
              </Cuenta>
            </>
          )}
          {!binomial && <p>{`x no tiene tope. Desde x = ${hasta + 1}, lo que queda suma menos de 0,0001.`}</p>}
        </Paso>
        <Paso titulo="Cada bastón">
          {filas.length > LARGA ? (
            <details className="calc-hoja__mas">
              <summary>{`Ver los ${filas.length} valores`}</summary>
              {tabla}
            </details>
          ) : (
            tabla
          )}
        </Paso>
        <Paso titulo="La esperanza y la varianza">
          {binomial ? (
            <>
              <Cuenta>{`E(X) = n·π = ${n}·${piT} = ${f4(E)}`}</Cuenta>
              <Cuenta>{`V(X) = n·π·(1 − π) = ${n}·${piT}·${qT} = ${f4(V)}`}</Cuenta>
            </>
          ) : (
            <Cuenta>{`E(X) = V(X) = λ = ${lamT}`}</Cuenta>
          )}
          <Cuenta>
            σ = <Raiz>{f4(V)}</Raiz> = {f4(Math.sqrt(V))}
          </Cuenta>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Bastones() {
  const [guardado, setEstado] = useRecordado('calc:bastones', INICIO);
  const estado = { ...INICIO, ...guardado };
  const cambiar = (cambio) => setEstado({ ...estado, ...cambio });
  const { modelo, n, pi, lam } = estado;
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="El modelo" nombre="modelo" opciones={MODELO} valor={modelo} alCambiar={(v) => cambiar({ modelo: v })} chica />
          {modelo === 'binomial' ? (
            <div className="ce-datos">
              <Deslizador nombre="Ensayos" simbolo="n" valor={n} min={1} max={50} paso={1} texto={String(n)} alCambiar={(v) => cambiar({ n: v })} />
              <Deslizador nombre="Probabilidad de éxito" simbolo="π" valor={pi} min={0.01} max={0.99} paso={0.01} texto={coma(pi, 2)} alCambiar={(v) => cambiar({ pi: v })} />
            </div>
          ) : (
            <div className="ce-datos">
              <Deslizador nombre="Promedio de eventos" simbolo="λ" valor={lam} min={0.1} max={15} paso={0.1} texto={coma(lam, 2)} alCambiar={(v) => cambiar({ lam: v })} />
            </div>
          )}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={(e) => cambiar(e.datos)} />
      </section>

      <Resolucion modelo={modelo} n={n} pi={pi} lam={lam} />
    </>
  );
}
