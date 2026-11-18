import { useId, useMemo, useState } from 'react';
import { dec, porcentaje } from '../../../lib/calculadoras/decimales';
import { escribir, subindice } from '../../../lib/calculadoras/formula';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { raices } from '../../../lib/calculadoras/numerico';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { camino, Formula, Leyenda, Plano, rango, rangoDe, Recorrer, Rotulo } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';

// Raíces de una función, of Análisis Numérico: the student's f(x), the method and its starting values, and the sheet
// walks every iteration with the graph of the notes (the chord, the tangent, the secant) and the formula with the
// numbers in. Methods, notation and examples: parcial-1.md of El Santo Resumen (PPT de Métodos Cerrados y Abiertos),
// through lib/calculadoras/numerico.js.

const METODOS = [
  { valor: 'biseccion', texto: 'Bisección' },
  { valor: 'falsa', texto: 'Falsa posición' },
  { valor: 'newton', texto: 'Newton-Raphson' },
  { valor: 'secante', texto: 'Secante' },
];

const PARACAIDISTA = '667,38/x·(1 - e^(-0,146843x)) - 40';

// The notes' own exercises (parcial-1.md of Análisis Numérico).
export const EJEMPLOS = [
  { nombre: 'Paracaidista con bisección', metodo: 'biseccion', f: PARACAIDISTA, a: '12', b: '16', x0: '0', max: '3', es: '', verdadero: '14,7802' },
  { nombre: 'Paracaidista con falsa posición', metodo: 'falsa', f: PARACAIDISTA, a: '12', b: '16', x0: '0', max: '2', es: '', verdadero: '14,7802' },
  { nombre: 'e^(−x) − x con Newton-Raphson', metodo: 'newton', f: 'e^(-x) - x', a: '0', b: '1', x0: '0', max: '4', es: '', verdadero: '0,56714329' },
  { nombre: 'e^(−x) − x con secante', metodo: 'secante', f: 'e^(-x) - x', a: '0', b: '1', x0: '0', max: '3', es: '', verdadero: '0,56714329' },
  { nombre: 'x¹⁰ − 1, un caso deficiente', metodo: 'newton', f: 'x^10 - 1', a: '0', b: '1,5', x0: '0,5', max: '8', es: '', verdadero: '1' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const x = (n) => `x${subindice(n)}`;
const entre = (v) => (v < 0 ? `(${dec(v, 6)})` : dec(v, 6));

/** The columns of the table and what each row says, as the notes' tables. */
const TABLAS = {
  biseccion: {
    cab: ['i', 'xₗ', 'xᵤ', 'f(xₗ)', 'f(xᵤ)', 'xᵣ', 'f(xᵣ)', 'f(xₗ)·f(xᵣ)', 'reemplaza'],
    fila: (f) => [f.i, dec(f.xl, 6), dec(f.xu, 6), dec(f.fl, 6), dec(f.fu, 6), dec(f.xr, 6), dec(f.fr, 6), dec(f.prod, 6), f.queda === 'xu' ? 'xᵤ = xᵣ' : f.queda === 'xl' ? 'xₗ = xᵣ' : 'es la raíz'],
  },
  newton: {
    cab: ['i', 'xᵢ', 'f(xᵢ)', "f'(xᵢ)", 'xᵢ₊₁'],
    fila: (f) => [f.i, dec(f.x, 6), dec(f.fx, 6), dec(f.dx, 6), dec(f.x1, 6)],
  },
  secante: {
    cab: ['i', 'xᵢ₋₁', 'xᵢ', 'f(xᵢ₋₁)', 'f(xᵢ)', 'xᵢ₊₁'],
    fila: (f) => [f.i, dec(f.xa, 6), dec(f.xb, 6), dec(f.fa, 6), dec(f.fb, 6), dec(f.x1, 6)],
  },
};
TABLAS.falsa = TABLAS.biseccion;

/** The value an iteration gives, and its name. */
const nuevo = (metodo, f) => (metodo === 'biseccion' || metodo === 'falsa' ? { nombre: 'xᵣ', v: f.xr } : { nombre: x(f.i + 1), v: f.x1 });

/** Why it stopped, in a sentence. */
function porQue(r) {
  const { fin } = r;
  if (fin.tipo === 'tolerancia') return `En la iteración ${fin.i}, εa = ${porcentaje(r.ea)} ya es menor que εs = ${dec(r.es, 6)}\u00a0%.`;
  if (fin.tipo === 'raiz') return 'f da 0 justo ahí. Es la raíz exacta.';
  if (fin.tipo === 'plana') return r.metodo === 'newton' ? "f' da 0 y la tangente no corta al eje. Newton-Raphson no puede seguir." : 'Los dos valores dan lo mismo en f y la recta no corta al eje.';
  if (fin.tipo === 'lejos') return 'La iteración se fue lejísimos. Desde ese valor inicial el método diverge.';
  if (fin.tipo === 'nan') return `f no da un número real en ${dec(fin.x, 6)}. Ahí se corta.`;
  return r.filas.length === 1 ? 'Es la iteración pedida.' : `Son las ${r.filas.length} iteraciones pedidas.`;
}

/** One iteration written as in the notes, with its numbers in. */
function Iteracion({ r, k }) {
  const f = r.filas[k];
  if (r.metodo === 'biseccion' || r.metodo === 'falsa') {
    const formula = r.metodo === 'biseccion' ? 'xᵣ = (xₗ + xᵤ)/2' : 'xᵣ = xᵤ − f(xᵤ)(xₗ − xᵤ)/(f(xₗ) − f(xᵤ))';
    const cuenta = r.metodo === 'biseccion' ? `(${dec(f.xl, 6)} + ${dec(f.xu, 6)})/2` : `${dec(f.xu, 6)} − ${entre(f.fu)}(${dec(f.xl, 6)} − ${entre(f.xu)})/(${dec(f.fl, 6)} − ${entre(f.fu)})`;
    const signo = f.prod < 0 ? '< 0' : f.prod > 0 ? '> 0' : '= 0';
    return (
      <>
        <p className="calc-hoja__suelta">{`xₗ = ${dec(f.xl, 6)}, f(xₗ) = ${dec(f.fl, 6)}. xᵤ = ${dec(f.xu, 6)}, f(xᵤ) = ${dec(f.fu, 6)}.`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{formula}</p>
        <p className="calc-hoja__cuenta an-cuenta">
          {`xᵣ = ${cuenta} = `}
          <span className="cuenta-fin">{dec(f.xr, 6)}</span>
        </p>
        <p className="calc-hoja__cuenta an-cuenta">{`f(xₗ)·f(xᵣ) = ${entre(f.fl)}·${entre(f.fr)} = ${dec(f.prod, 6)} ${signo}`}</p>
        <p className="calc-hoja__suelta">
          {f.queda === 'xu'
            ? `La raíz está en el subintervalo izquierdo. Entonces xᵤ = xᵣ = ${dec(f.xr, 6)}.`
            : f.queda === 'xl'
              ? `La raíz está en el subintervalo derecho. Entonces xₗ = xᵣ = ${dec(f.xr, 6)}.`
              : `La raíz es xᵣ = ${dec(f.xr, 6)}.`}
        </p>
      </>
    );
  }
  const i = f.i;
  if (r.metodo === 'newton') {
    return (
      <>
        <p className="calc-hoja__suelta">{`${x(i)} = ${dec(f.x, 6)}, f(${x(i)}) = ${dec(f.fx, 6)} y f'(${x(i)}) = ${dec(f.dx, 6)}.`}</p>
        <p className="calc-hoja__cuenta an-cuenta">{`${x(i + 1)} = ${x(i)} − f(${x(i)})/f'(${x(i)})`}</p>
        <p className="calc-hoja__cuenta an-cuenta">
          {`${x(i + 1)} = ${dec(f.x, 6)} − ${entre(f.fx)}/${entre(f.dx)} = `}
          <span className="cuenta-fin">{dec(f.x1, 6)}</span>
        </p>
      </>
    );
  }
  return (
    <>
      <p className="calc-hoja__suelta">{`${x(i - 1)} = ${dec(f.xa, 6)}, f(${x(i - 1)}) = ${dec(f.fa, 6)}. ${x(i)} = ${dec(f.xb, 6)}, f(${x(i)}) = ${dec(f.fb, 6)}.`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`${x(i + 1)} = ${x(i)} − f(${x(i)})(${x(i - 1)} − ${x(i)})/(f(${x(i - 1)}) − f(${x(i)}))`}</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`${x(i + 1)} = ${dec(f.xb, 6)} − ${entre(f.fb)}(${dec(f.xa, 6)} − ${entre(f.xb)})/(${dec(f.fa, 6)} − ${entre(f.fb)}) = `}
        <span className="cuenta-fin">{dec(f.x1, 6)}</span>
      </p>
      {i > 0 && <p className="calc-hoja__nota">{`${x(i)} pasa a ser ${x(i - 1)} y ${x(i + 1)} pasa a ser ${x(i)}, en secuencia estricta.`}</p>}
    </>
  );
}

/** The curve, and what the method draws in the chosen iteration. */
function Grafico({ r, k }) {
  const f = r.filas[k];
  const cerrado = r.metodo === 'biseccion' || r.metodo === 'falsa';
  const xs = cerrado ? [r.filas[0].xl, r.filas[0].xu] : r.filas.slice(0, 8).flatMap((q) => [q.x, q.xa, q.xb, q.x1]);
  const X = rango(xs, 0.15);
  const ys = cerrado ? [f.fl, f.fu] : [f.fx, f.fa, f.fb];
  const Y = rangoDe(r.f, X, ys.filter(Number.isFinite));
  const n = nuevo(r.metodo, f);
  const etiqueta = `La curva de f entre ${dec(X[0], 2)} y ${dec(X[1], 2)}. En la iteración ${k + 1}, ${n.nombre} = ${dec(n.v, 6)}.`;
  return (
    <Plano x={X} y={Y} etiqueta={etiqueta} evitar={[n.v]}>
      {({ sx, sy, recorte }) => {
        const punto = (px, py, nombre, arriba = true) => (
          <g key={nombre}>
            <line className="graf__guia" x1={sx(px)} x2={sx(px)} y1={sy(0)} y2={sy(py)} />
            <circle className="graf__punto" cx={sx(px)} cy={sy(py)} r={5} />
            <Rotulo x={sx(px)} y={sy(py) + (arriba === (py >= 0) ? -11 : 21)}>
              {nombre}
            </Rotulo>
          </g>
        );
        let metodo = null;
        let puntos = [];
        if (cerrado) {
          puntos = [punto(f.xl, f.fl, 'xₗ'), punto(f.xu, f.fu, 'xᵤ')];
          metodo =
            r.metodo === 'falsa' ? (
              <line className="graf__metodo" x1={sx(f.xl)} y1={sy(f.fl)} x2={sx(f.xu)} y2={sy(f.fu)} />
            ) : (
              <line className="graf__metodo" x1={sx(f.xl)} y1={sy(0)} x2={sx(f.xu)} y2={sy(0)} strokeWidth="5" strokeLinecap="butt" opacity="0.55" />
            );
        } else if (r.metodo === 'newton') {
          puntos = [punto(f.x, f.fx, x(f.i))];
          // The tangent, a bit longer than from the point to the axis.
          const ext = (f.x1 - f.x) * 0.25;
          metodo = <line className="graf__metodo" x1={sx(f.x - ext)} y1={sy(f.fx - f.dx * ext)} x2={sx(f.x1 + ext)} y2={sy(-f.dx * ext)} />;
        } else {
          puntos = [punto(f.xa, f.fa, x(f.i - 1)), punto(f.xb, f.fb, x(f.i), false)];
          const pend = (f.fb - f.fa) / (f.xb - f.xa);
          const desde = Math.abs(f.xa - f.x1) > Math.abs(f.xb - f.x1) ? f.xa : f.xb;
          const ext = (f.x1 - desde) * 0.2;
          metodo = <line className="graf__metodo" x1={sx(desde)} y1={sy(f.fb + pend * (desde - f.xb))} x2={sx(f.x1 + ext)} y2={sy(f.fb + pend * (f.x1 + ext - f.xb))} />;
        }
        return (
          <>
            <g clipPath={recorte}>
              <path className="graf__curva" d={camino(r.f, X, sx, sy)} />
              {metodo}
            </g>
            {puntos}
            <circle className="graf__actual" cx={sx(n.v)} cy={sy(0)} r={6.5} />
            <Rotulo x={sx(n.v)} y={sy(0) + 24} className="graf__rotulo--metodo">
              {n.nombre}
            </Rotulo>
          </>
        );
      }}
    </Plano>
  );
}

function Resolucion({ r }) {
  const [elegida, setElegida] = useState(0);
  const k = Math.min(elegida, r.filas.length - 1);
  const cerrado = r.metodo === 'biseccion' || r.metodo === 'falsa';
  const u = r.filas[r.filas.length - 1];
  const final = nuevo(r.metodo, u);
  const tabla = TABLAS[r.metodo];
  const conEt = r.xv !== null;
  const errores = [r.ea !== null && `εa = ${porcentaje(r.ea)}`, r.et !== null && `εt = ${porcentaje(r.et)}`].filter(Boolean).join(' y ');
  return (
    <Hoja>
      <Resultado dicho={`La raíz da aproximadamente ${dec(r.raiz, 6)}.`} nota={`${porQue(r)}${errores ? ` Queda ${errores}.` : ''}`}>
        {`${final.nombre} ≈ `}
        <span className="resaltado">{dec(r.raiz, 6)}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="La función">
          <p className="calc-hoja__cuenta an-cuenta">
            f(x) = <Formula nodo={r.nodoF} />
          </p>
          {r.nodoD && (
            <p className="calc-hoja__cuenta an-cuenta">
              {"f'(x) = "}
              <Formula nodo={r.nodoD} />
            </p>
          )}
          {cerrado && (
            <>
              <p className="calc-hoja__cuenta an-cuenta">{`f(xₗ) = f(${dec(r.inicio.xl, 6)}) = ${dec(r.inicio.fl, 6)} y f(xᵤ) = f(${dec(r.inicio.xu, 6)}) = ${dec(r.inicio.fu, 6)}`}</p>
              <p className="calc-hoja__suelta">{`f(xₗ)·f(xᵤ) = ${dec(r.inicio.fl * r.inicio.fu, 6)} < 0. El intervalo encierra la raíz.`}</p>
            </>
          )}
        </Paso>
        <Paso titulo={`La iteración ${k + 1}`}>
          <Recorrer actual={k} total={r.filas.length} alCambiar={setElegida} />
          <Grafico r={r} k={k} />
          <Leyenda
            items={[
              { clase: 'graf__curva', texto: 'f(x)' },
              { clase: 'graf__metodo', texto: { biseccion: 'el intervalo', falsa: 'la cuerda', newton: 'la tangente', secante: 'la secante' }[r.metodo] },
              { clase: 'graf__actual', texto: 'la aproximación', punto: true },
            ]}
          />
          <Iteracion r={r} k={k} />
        </Paso>
        <Paso titulo="Todas las iteraciones">
          <Desborde etiqueta="Todas las iteraciones">
            <table className="tabla-pasos an-tabla">
              <caption className="solo-lectores">Todas las iteraciones</caption>
              <thead>
                <tr>
                  {tabla.cab.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                  <th scope="col">εa (%)</th>
                  {conEt && <th scope="col">εt (%)</th>}
                </tr>
              </thead>
              <tbody>
                {r.filas.map((f, j) => {
                  const [i, ...resto] = tabla.fila(f);
                  return (
                    <tr key={j} data-final={j === r.filas.length - 1 || undefined} data-actual={j === k || undefined}>
                      <th scope="row">{i}</th>
                      {resto.map((c, m) => (
                        <td key={m}>{c}</td>
                      ))}
                      <td>{f.ea === null ? '' : dec(f.ea, 4)}</td>
                      {conEt && <td>{dec(f.et, 4)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Desborde>
          <p className="calc-hoja__nota">εa = |(actual − anterior)/actual|·100 %{conEt ? ' y εt = |(xᵥ − xₐ)/xᵥ|·100 %.' : '.'}</p>
        </Paso>
        <Paso titulo="La comprobación">
          <p className="calc-hoja__cuenta an-cuenta">{`f(${dec(r.raiz, 6)}) = ${dec(r.fRaiz, 6)}`}</p>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Raices() {
  const [estado, setEstado] = useRecordado('calc:raices', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => raices(estado), [estado]);
  const error = r.error;
  const id = useId();
  const ids = { f: `${id}-f`, error: `${id}-error`, ayuda: `${id}-ayuda`, errorFormula: `${id}-errf` };
  const mal = (campo) => error?.campo === campo;
  const { metodo } = estado;
  const cerrado = metodo === 'biseccion' || metodo === 'falsa';
  const erroresDatos = error && error.campo !== 'f' && ['a', 'b', 'x0'].includes(error.campo);
  const erroresParar = error && ['max', 'es', 'verdadero'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Método" nombre="metodo" opciones={METODOS} valor={metodo} alCambiar={cambiar('metodo')} />
          <Escribir id={ids.f} nombre="f(x)" valor={estado.f} alCambiar={cambiar('f')} invalido={mal('f')} errorId={ids.errorFormula} ayudaId={ids.ayuda} />
          <p className="campo__ayuda pz-ayuda" id={ids.ayuda}>
            Con x, como <code>e^(-x) - x</code> o <code>x^3 - 2x - 5</code>.
          </p>
          <ErrorDe id={ids.errorFormula} texto={mal('f') && error.texto} />
          <Renglon titulo="Valores iniciales" error={erroresDatos && error.texto} errorId={ids.error}>
            {cerrado && <Dato id={`${id}-a`} nombre="xₗ" decir="el extremo izquierdo" valor={estado.a} alCambiar={cambiar('a')} invalido={mal('a')} errorId={ids.error} />}
            {cerrado && <Dato id={`${id}-b`} nombre="xᵤ" decir="el extremo derecho" valor={estado.b} alCambiar={cambiar('b')} invalido={mal('b')} errorId={ids.error} />}
            {metodo === 'newton' && <Dato id={`${id}-x0`} nombre="x₀" valor={estado.x0} alCambiar={cambiar('x0')} invalido={mal('x0')} errorId={ids.error} />}
            {metodo === 'secante' && <Dato id={`${id}-a`} nombre="x₋₁" valor={estado.a} alCambiar={cambiar('a')} invalido={mal('a')} errorId={ids.error} />}
            {metodo === 'secante' && <Dato id={`${id}-b`} nombre="x₀" valor={estado.b} alCambiar={cambiar('b')} invalido={mal('b')} errorId={ids.error} />}
          </Renglon>
          <Renglon titulo="Cuándo parar" error={erroresParar && error.texto} errorId={`${ids.error}-p`}>
            <Dato id={`${id}-max`} nombre="iteraciones" ancho={3.5} valor={estado.max} alCambiar={cambiar('max')} invalido={mal('max')} errorId={`${ids.error}-p`} />
            <Dato id={`${id}-es`} nombre="εs" decir="la tolerancia" unidad="%" ancho={4.5} valor={estado.es} alCambiar={cambiar('es')} invalido={mal('es')} errorId={`${ids.error}-p`} />
            <Dato id={`${id}-v`} nombre="xᵥ" decir="el valor verdadero" ancho={7} valor={estado.verdadero} alCambiar={cambiar('verdadero')} invalido={mal('verdadero')} errorId={`${ids.error}-p`} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">Sin εs hace todas las iteraciones. Con xᵥ, el valor verdadero, suma εt.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion key={`${escribir(r.nodoF)}|${metodo}|${r.filas.length}`} r={r} />}
    </>
  );
}
