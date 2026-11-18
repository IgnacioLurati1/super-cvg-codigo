import { useId, useMemo } from 'react';
import { cargas, UNIDADES } from '../../../lib/calculadoras/cargas';
import { cientifico, dec, fisico } from '../../../lib/calculadoras/decimales';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Opciones, Paso, Pasos, Resultado } from '../Hoja';
import { Leyenda, Plano, Rotulo, Vector } from './_an-grafico';
import { Dato, Renglon } from './_an-pizarron';
import './campo-cargas.css';

// Campo de dos cargas, of Física II: two point charges in the plane (and a third when the problem brings one), the
// field of each at P with its direction, their vector sum, the potential at P, the force on a q₀ at P and Coulomb's
// force between q₁ and q₂. Formulas, K = 9·10⁹ and examples: parcial-1.md and ejercicios.json of El Santo Resumen
// (Teoría 2025 (001), (002) y (004); 1° parcial 18/06/2025), through lib/calculadoras/cargas.js.

export const EJEMPLOS = [
  { nombre: 'Tres cargas, parcial 18/06/2025', unidad: 'micro', q1: '6', p1: '0; 0', q2: '-4', p2: '1; 0', q3: '2', p3: '0,5; 2', P: '0,5; 0', q0: '-1,6e-19' },
  { nombre: '+25 nC y −75 nC a 3 cm', unidad: 'nano', q1: '25', p1: '0; 0', q2: '-75', p2: '0,03; 0', q3: '', p3: '', P: '0,015; 0', q0: '' },
  { nombre: 'Un dipolo', unidad: 'micro', q1: '1', p1: '-0,5; 0', q2: '-1', p2: '0,5; 0', q3: '', p3: '', P: '0; 1', q0: '' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const UNIDAD_OPCIONES = Object.entries(UNIDADES).map(([valor, u]) => ({ valor, texto: u.texto }));
const SUB = ['₁', '₂', '₃'];

const f = (v) => fisico(v, 3);
const c = (v) => cientifico(v, 3);
const m = (v) => dec(v, 4);
const entre = (v) => (v < 0 ? `(${m(v)})` : m(v));
const conSigno = (v) => (v > 0 ? `+${dec(v, 4)}` : dec(v, 4));
const par = (a, b) => `(${f(a)}; ${f(b)})`;

/** The arrows of the total field, the charges, P, the field of each charge at P and their sum. */
function Dibujo({ r }) {
  const xs = [...r.cargas.map((q) => q.x), r.P[0]];
  const ys = [...r.cargas.map((q) => q.y), r.P[1]];
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const lado = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-6);
  const medio = lado * 0.8;
  const etiqueta = `${r.cargas.map((q) => `${q.nombre} = ${conSigno(q.dato)} ${r.unidad.texto} en (${m(q.x)}; ${m(q.y)})`).join(', ')}. En P (${m(r.P[0])}; ${m(r.P[1])}), E = ${f(r.E)} N/C.`;
  return (
    <Plano x={[cx - medio, cx + medio]} y={[cy - medio, cy + medio]} igual proporcion={0.9} maxAlto={440} etiqueta={etiqueta} nombreX="x (m)" nombreY="y (m)" formatoX={m} formatoY={m}>
      {({ sx, sy, area, X, Y }) => {
        const n = area.r - area.l < 300 ? 5 : 7;
        const pasoX = (X[1] - X[0]) / (2 * n + 1);
        const pasoY = (Y[1] - Y[0]) / Math.round((Y[1] - Y[0]) / pasoX);
        const puntos = [];
        for (let x = X[0] + pasoX / 2; x < X[1]; x += pasoX) for (let y = Y[0] + pasoY / 2; y < Y[1]; y += pasoY) puntos.push([x, y]);
        const lejos = (x, y) => r.cargas.every((q) => Math.hypot(sx(x) - sx(q.x), sy(y) - sy(q.y)) > 16);
        const vistos = puntos.filter(([x, y]) => lejos(x, y)).map(([x, y]) => [x, y, r.campoEn(x, y)]);
        const modulos = vistos.map(([, , [ex, ey]]) => Math.hypot(ex, ey));
        const orden = [...modulos].sort((a, b) => a - b);
        // The largest arrows near the charges would swamp the rest: the top is the 90th percentile.
        const tope = orden[Math.floor(orden.length * 0.9)] || 1;
        const largoMax = Math.abs(sx(pasoX) - sx(0)) * 0.8;
        const escala = (0.32 * (area.r - area.l)) / Math.max(r.E, ...r.cargas.map((q) => q.E));
        const vector = (ex, ey, clase, punta = 7) => {
          const l = Math.hypot(ex, ey) * escala;
          if (!(l > 0)) return null;
          const k = Math.max(l, 12) / l;
          return <Vector x1={sx(r.P[0])} y1={sy(r.P[1])} x2={sx(r.P[0]) + ex * escala * k} y2={sy(r.P[1]) - ey * escala * k} className={clase} punta={punta} />;
        };
        return (
          <>
            {vistos.map(([x, y, [ex, ey]], i) => {
              const mod = modulos[i];
              if (!(mod > 0)) return null;
              const largo = largoMax * Math.max(0.3, Math.sqrt(Math.min(1, mod / tope)));
              return <Vector key={`${x}|${y}`} x1={sx(x)} y1={sy(y)} x2={sx(x) + (ex / mod) * largo} y2={sy(y) - (ey / mod) * largo} className="graf__vector--suave" punta={5} />;
            })}
            {r.cargas.map((q) => (
              <g key={q.nombre}>{vector(q.Ex, q.Ey, 'graf__vector--segunda', 6)}</g>
            ))}
            {vector(r.Ex, r.Ey, 'graf__vector--metodo')}
            {r.cargas.map((q) => (
              <g key={q.nombre} className={`cargas-carga ${q.q > 0 ? 'cargas-carga--mas' : q.q < 0 ? 'cargas-carga--menos' : ''}`}>
                <circle cx={sx(q.x)} cy={sy(q.y)} r={11} />
                <text x={sx(q.x)} y={sy(q.y) + 5} textAnchor="middle">
                  {q.q > 0 ? '+' : q.q < 0 ? '−' : '0'}
                </text>
                <Rotulo x={sx(q.x)} y={sy(q.y) - 16}>
                  {q.nombre}
                </Rotulo>
              </g>
            ))}
            <circle className="graf__actual" cx={sx(r.P[0])} cy={sy(r.P[1])} r={5} />
            <Rotulo x={sx(r.P[0]) - 8} y={sy(r.P[1]) + 18} ancla="end" className="graf__rotulo--metodo">
              P
            </Rotulo>
          </>
        );
      }}
    </Plano>
  );
}

function CadaCarga({ q, unidad }) {
  const i = SUB[q.i];
  const positiva = q.q > 0;
  return (
    <div className="cargas-cada">
      <p className="calc-hoja__cuenta an-cuenta">{`q${i} = ${conSigno(q.dato)} ${unidad.texto} en (${m(q.x)}; ${m(q.y)})`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`r${i} = √((xₚ − x${i})² + (yₚ − y${i})²) = √(${entre(q.dx)}² + ${entre(q.dy)}²) = ${m(q.r)} m`}</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`E${i} = k·|q${i}|/r${i}² = 9 × 10⁹·${c(Math.abs(q.q))}/${entre(q.r)}² = `}
        <span className="cuenta-fin">{`${f(q.E)}\u00a0N/C`}</span>
      </p>
      {q.q !== 0 && <p className="calc-hoja__suelta">{positiva ? `q${i} es positiva. E${i} se aleja de q${i}.` : `q${i} es negativa. E${i} va hacia q${i}.`}</p>}
      <p className="calc-hoja__cuenta an-cuenta">
        {`(E${i}ₓ; E${i}ᵧ) = ${positiva ? '' : '−'}E${i}·(xₚ − x${i}; yₚ − y${i})/r${i} = ${par(q.Ex, q.Ey)}\u00a0N/C`}
      </p>
    </div>
  );
}

function Resolucion({ r }) {
  const suma = (k) => r.cargas.map((q) => `E${SUB[q.i]}${k}`).join(' + ');
  const numeros = (k) => r.cargas.map((q) => (q[`E${k === 'ₓ' ? 'x' : 'y'}`] < 0 ? `(${f(q[`E${k === 'ₓ' ? 'x' : 'y'}`])})` : f(q[`E${k === 'ₓ' ? 'x' : 'y'}`]))).join(' + ');
  const F = r.fuerza;
  const potencial = r.cargas.map((q) => `${q.q < 0 ? `(${c(q.q)})` : c(q.q)}/${m(q.r)}`).join(' + ');
  const dicho = `En P, E da ${f(r.E)} N/C, a ${dec(r.angulo, 1)}° del eje x. El potencial da ${f(r.V)} V.`;
  return (
    <Hoja>
      <Resultado dicho={dicho} nota={`Apunta a ${dec(r.angulo, 1)}° del eje +x. En P, V = ${f(r.V)} V.${F ? ` Sobre q₀, F = ${f(F.F)} N.` : ''}`}>
        {'|E| = '}
        <span className="resaltado">{`${f(r.E)}\u00a0N/C`}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="Las cargas y el punto">
          <Dibujo r={r} />
          <Leyenda
            items={[
              { clase: 'cargas-ley cargas-ley--campo', texto: 'el campo en cada punto' },
              { clase: 'cargas-ley cargas-ley--cada', texto: `el campo de cada carga en P` },
              { clase: 'cargas-ley cargas-ley--total', texto: 'E en P' },
            ]}
          />
          <p className="calc-hoja__nota">Las flechas de fondo marcan la dirección. Su largo está achicado.</p>
        </Paso>
        <Paso titulo="El campo de cada carga en P">
          {r.cargas.map((q) => (
            <CadaCarga key={q.nombre} q={q} unidad={r.unidad} />
          ))}
          <p className="calc-hoja__nota">k = 9 × 10⁹ N m²/C². Las cargas van en C y las distancias en m.</p>
        </Paso>
        <Paso titulo="La suma">
          <p className="calc-hoja__cuenta an-cuenta">{`Eₓ = ${suma('ₓ')} = ${numeros('ₓ')} = ${f(r.Ex)}\u00a0N/C`}</p>
          <p className="calc-hoja__cuenta an-cuenta">{`Eᵧ = ${suma('ᵧ')} = ${numeros('ᵧ')} = ${f(r.Ey)}\u00a0N/C`}</p>
          <p className="calc-hoja__cuenta an-cuenta">
            {`|E| = √(Eₓ² + Eᵧ²) = `}
            <span className="cuenta-fin">{`${f(r.E)}\u00a0N/C`}</span>
          </p>
          <p className="calc-hoja__cuenta an-cuenta">{`θ = ${dec(r.angulo, 1)}°`}</p>
          <p className="calc-hoja__nota">θ se mide desde el eje +x, en contra de las agujas del reloj. Los campos se suman como vectores. Sumar módulos da mal.</p>
        </Paso>
        <Paso titulo="El potencial en P">
          <p className="calc-hoja__cuenta an-cuenta">{`V = ${r.cargas.map((q) => `k·q${SUB[q.i]}/r${SUB[q.i]}`).join(' + ')}`}</p>
          <p className="calc-hoja__cuenta an-cuenta">
            {`V = 9 × 10⁹·(${potencial}) = `}
            <span className="cuenta-fin">{`${f(r.V)}\u00a0V`}</span>
          </p>
          <p className="calc-hoja__nota">El potencial se suma como número, con el signo de cada carga.</p>
        </Paso>
        {F && (
          <Paso titulo="La fuerza sobre q₀">
            <p className="calc-hoja__cuenta an-cuenta">{`(Fₓ; Fᵧ) = q₀·(Eₓ; Eᵧ) = ${c(F.q0)}·${par(r.Ex, r.Ey)} = ${par(F.Fx, F.Fy)}\u00a0N`}</p>
            <p className="calc-hoja__cuenta an-cuenta">
              {`|F| = |q₀|·|E| = `}
              <span className="cuenta-fin">{`${f(F.F)}\u00a0N`}</span>
            </p>
            {F.q0 !== 0 && <p className="calc-hoja__suelta">{F.q0 < 0 ? 'q₀ es negativa. La fuerza va al revés que E.' : 'q₀ es positiva. La fuerza va como E.'}</p>}
          </Paso>
        )}
        <Paso titulo="La fuerza entre q₁ y q₂">
          <p className="calc-hoja__cuenta an-cuenta">
            {`F = k·|q₁|·|q₂|/r₁₂² = 9 × 10⁹·${c(Math.abs(r.cargas[0].q))}·${c(Math.abs(r.cargas[1].q))}/${entre(r.coulomb.r)}² = `}
            <span className="cuenta-fin">{`${f(r.coulomb.F)}\u00a0N`}</span>
          </p>
          {!r.coulomb.nula && <p className="calc-hoja__suelta">{r.coulomb.atraen ? 'Tienen signos opuestos. Se atraen.' : 'Tienen el mismo signo. Se repelen.'}</p>}
          <p className="calc-hoja__nota">La fuerza que q₁ hace sobre q₂ es igual y opuesta a la que q₂ hace sobre q₁.</p>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function CampoDeCargas() {
  const [estado, setEstado] = useRecordado('calc:campo-cargas', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => cargas(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (k) => error?.campo === k;
  const unidad = (UNIDADES[estado.unidad] ?? UNIDADES.micro).texto;
  const renglon = (i, titulo) => {
    const q = `q${i}`;
    const p = `p${i}`;
    const nombre = `q${SUB[i - 1]}`;
    return (
      <Renglon titulo={titulo} error={(mal(q) || mal(p)) && error.texto} errorId={`${id}-e${i}`}>
        <Dato id={`${id}-${q}`} nombre={nombre} unidad={unidad} valor={estado[q]} alCambiar={cambiar(q)} invalido={mal(q)} errorId={`${id}-e${i}`} ancho={4.5} />
        <Dato id={`${id}-${p}`} nombre="(x; y)" decir={`la posición de ${nombre}`} unidad="m" valor={estado[p]} alCambiar={cambiar(p)} invalido={mal(p)} errorId={`${id}-e${i}`} ancho={6} placeholder="x; y" />
      </Renglon>
    );
  };

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="Las cargas en" nombre={`${id}-unidad`} opciones={UNIDAD_OPCIONES} valor={estado.unidad} alCambiar={cambiar('unidad')} chica />
          {renglon(1, 'La primera carga')}
          {renglon(2, 'La segunda carga')}
          {renglon(3, 'Una tercera, si hay')}
          <Renglon titulo="El punto" error={(mal('P') || mal('q0')) && error.texto} errorId={`${id}-eP`}>
            <Dato id={`${id}-P`} nombre="P" decir="el punto" unidad="m" valor={estado.P} alCambiar={cambiar('P')} invalido={mal('P')} errorId={`${id}-eP`} ancho={6} placeholder="x; y" />
            <Dato id={`${id}-q0`} nombre="q₀" decir="una carga en P" unidad="C" valor={estado.q0} alCambiar={cambiar('q0')} invalido={mal('q0')} errorId={`${id}-eP`} ancho={6} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">
            Las posiciones van como <code>x; y</code>, en metros. Con q₀, en coulombs, suma la fuerza sobre ella. Un electrón es <code>-1,6e-19</code>.
          </p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion r={r} />}
    </>
  );
}
