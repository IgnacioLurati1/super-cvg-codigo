import { useId, useMemo } from 'react';
import { dec } from '../../../lib/calculadoras/decimales';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { tiro } from '../../../lib/calculadoras/tiro';
import { Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { Leyenda, linea, Plano, rango, Rotulo, Vector } from './_an-grafico';
import { Dato, Renglon } from './_an-pizarron';
import './tiro-oblicuo.css';

// Tiro oblicuo, of Física I: the student's v₀, φ, y₀ and g, and optionally an instant t. The parabola with the velocity
// and its components, the highest point, the time of flight, the reach, the velocity on arrival and where it is at t,
// each with the formula of the notes and the numbers in. Notation, formulas and examples: parcial-1.md and
// ejercicios.json of El Santo Resumen («Cinemática - resumen», págs. 4 y 5; «Teoría Ampliada» de Movimiento de
// Proyectiles; final 22/04/2025 and 1° parcial 05/06/2025), through lib/calculadoras/tiro.js.

export const EJEMPLOS = [
  { nombre: 'Entre dos edificios, final 22/04/2025', v0: '20', phi: '40', y0: '22', g: '9,8', t: '3' },
  { nombre: 'Desde una ventana, parcial 05/06/2025', v0: '8', phi: '-20', y0: '', g: '9,8', t: '3' },
  { nombre: 'Al mismo nivel, 15 m/s a 40°', v0: '15', phi: '40', y0: '', g: '9,8', t: '' },
  { nombre: 'Tiro horizontal desde 20 m', v0: '10', phi: '0', y0: '20', g: '9,8', t: '' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const m = (v) => dec(v, 2, { ceros: true });
const dato = (v) => dec(v, 4);
const entre = (v) => (v < 0 ? `(${m(v)})` : m(v));
const grados = (v) => `${dec(v, 1)}°`;

/** The parabola, the ground, the highest point and the landing, and the velocity with its components at t (or at the start). */
function Trayectoria({ r }) {
  const fin = r.punto ? (r.conSuelo ? Math.max(r.tv, r.punto.t) : r.punto.t) : r.tv;
  const puntos = Array.from({ length: 121 }, (_, i) => r.en((fin * i) / 120));
  const xs = puntos.map((p) => p.x);
  const ys = [...puntos.map((p) => p.y), 0, r.y0];
  const X = r.vx > 1e-9 ? rango([0, ...xs], 0.06) : [-1, 1];
  const Y = rango(ys, 0.1);
  const igual = (X[1] - X[0]) / (Y[1] - Y[0]) < 4 && (Y[1] - Y[0]) / (X[1] - X[0]) < 4;
  const aca = r.punto ?? r.en(0);
  const cerca = r.punto ? 'En t' : 'Al salir';
  const etiqueta = [
    `La parábola desde y₀ = ${m(r.y0)} m.`,
    r.sube ? `Sube hasta ${m(r.y0 + r.hmax)} m.` : '',
    r.conSuelo ? `Toca el suelo en x = ${m(r.d)} m.` : '',
    `${cerca} = ${m(aca.t)} s está en (${m(aca.x)}; ${m(aca.y)}) y va a ${m(aca.v)} m/s.`,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Plano x={X} y={Y} igual={igual} proporcion={0.62} etiqueta={etiqueta} nombreX="x (m)" nombreY="y (m)" formatoX={(v) => dec(v, 2)} formatoY={(v) => dec(v, 2)}>
      {({ sx, sy, area, recorte }) => {
        const largo = 0.24 * (area.r - area.l);
        const k = largo / Math.max(r.v0, aca.v);
        const px = sx(aca.x);
        const py = sy(aca.y);
        const apice = r.sube ? r.en(r.ts) : null;
        return (
          <>
            <g clipPath={recorte}>
              {r.conSuelo && <line className="tiro-suelo" x1={area.l} x2={area.r} y1={sy(0)} y2={sy(0)} />}
              {r.y0 > 0 && <line className="graf__guia" x1={sx(0)} x2={sx(0)} y1={sy(0)} y2={sy(r.y0)} />}
              <path className="graf__curva" d={linea(puntos.map((p) => [sx(p.x), sy(p.y)]))} />
            </g>
            <circle className="graf__punto graf__punto--lleno" cx={sx(0)} cy={sy(r.y0)} r={4} />
            {apice && (
              <>
                <circle className="graf__punto" cx={sx(apice.x)} cy={sy(apice.y)} r={4} />
                <Rotulo x={sx(apice.x)} y={sy(apice.y) - 10}>
                  hₘₐₓ
                </Rotulo>
              </>
            )}
            {r.conSuelo && (
              <>
                <circle className="graf__punto" cx={sx(r.d)} cy={sy(0)} r={4} />
                <Rotulo x={sx(r.d)} y={sy(0) - 10} ancla={r.vx > 1e-9 ? 'end' : 'middle'}>
                  d
                </Rotulo>
              </>
            )}
            <Vector x1={px} y1={py} x2={px + r.vx * k} y2={py} className="graf__vector--segunda" punta={6} />
            <Vector x1={px} y1={py} x2={px} y2={py - aca.vy * k} className="graf__vector--segunda" punta={6} />
            <Vector x1={px} y1={py} x2={px + r.vx * k} y2={py - aca.vy * k} className="graf__vector--metodo" />
            <circle className="graf__actual" cx={px} cy={py} r={6} />
            {Math.abs(r.vx * k) > 16 && (
              <Rotulo x={px + r.vx * k + 6} y={py + 16} ancla="start" className="graf__rotulo--suave">
                vₓ
              </Rotulo>
            )}
            {Math.abs(aca.vy * k) > 16 && (
              <Rotulo x={px - 8} y={py - aca.vy * k + (aca.vy > 0 ? 4 : 12)} ancla="end" className="graf__rotulo--suave">
                vᵧ
              </Rotulo>
            )}
            <Rotulo x={px + r.vx * k + 8} y={py - aca.vy * k + (aca.vy > 0 ? -4 : 14)} ancla="start" className="graf__rotulo--metodo">
              {r.punto ? 'v' : 'v₀'}
            </Rotulo>
          </>
        );
      }}
    </Plano>
  );
}

function porQue(r) {
  if (r.punto) {
    const { dy } = r.punto;
    const donde = Math.abs(dy) < 0.005 ? 'Está a la altura de la salida.' : `Está ${m(Math.abs(dy))} m por ${dy < 0 ? 'debajo' : 'encima'} de la salida.`;
    return `${donde} Va a ${m(r.punto.v)} m/s, con φ = ${grados(r.punto.phi)}.`;
  }
  const tarde = r.tarde ? `En t = ${dato(r.t)} s ya está en el suelo. ` : '';
  const sube = r.sube ? `Sube ${m(r.hmax)} m sobre la salida. ` : '';
  return `${tarde}${sube}Toca el suelo a los ${m(r.tv)} s.`;
}

function Resolucion({ r }) {
  const { v0, phi, y0, g, vx, vy } = r;
  const p = r.punto;
  return (
    <Hoja>
      <Resultado
        dicho={p ? `En t = ${dato(p.t)} s, x da ${m(p.x)} m. ${porQue(r)}` : `El alcance da ${m(r.d)} m. ${porQue(r)}`}
        nota={porQue(r)}
      >
        {p ? `En t = ${dato(p.t)} s, x = ` : 'd = '}
        <span className="resaltado">{`${m(p ? p.x : r.d)}\u00a0m`}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="Los dos movimientos">
          <p className="calc-hoja__cuenta an-cuenta">{`v₀ₓ = v₀·cos φ = ${dato(v0)}·cos ${grados(phi)} = ${m(vx)}\u00a0m/s`}</p>
          <p className="calc-hoja__cuenta an-cuenta">{`v₀ᵧ = v₀·sen φ = ${dato(v0)}·sen ${grados(phi)} = ${m(vy)}\u00a0m/s`}</p>
          <p className="calc-hoja__cuenta an-cuenta">{`x = v₀ₓ·t = ${m(vx)}·t`}</p>
          <p className="calc-hoja__cuenta an-cuenta">{`y = y₀ + v₀ᵧ·t − ½·g·t² = ${y0 ? `${dato(y0)} + ` : ''}${m(vy)}·t − ${dec(g / 2, 4)}·t²`}</p>
          <Trayectoria r={r} />
          <Leyenda
            items={[
              { clase: 'graf__curva', texto: 'la trayectoria' },
              { clase: 'tiro-ley tiro-ley--v', texto: p ? `v en t = ${dato(p.t)} s` : 'v₀' },
              { clase: 'tiro-ley tiro-ley--comp', texto: 'sus componentes' },
            ]}
          />
          <p className="calc-hoja__nota">En x el movimiento es uniforme. En y es uniformemente variado, con aᵧ = −g.</p>
        </Paso>
        <Paso titulo="La altura máxima">
          {r.sube ? (
            <>
              <p className="calc-hoja__suelta">Arriba vᵧ = 0.</p>
              <p className="calc-hoja__cuenta an-cuenta">
                {`tₛ = v₀ᵧ/g = ${m(vy)}/${dato(g)} = `}
                <span className="cuenta-fin">{`${m(r.ts)}\u00a0s`}</span>
              </p>
              <p className="calc-hoja__cuenta an-cuenta">
                {`hₘₐₓ = v₀ᵧ²/(2·g) = ${m(vy)}²/(2·${dato(g)}) = `}
                <span className="cuenta-fin">{`${m(r.hmax)}\u00a0m`}</span>
              </p>
              {y0 > 0 && <p className="calc-hoja__suelta">{`Sobre el suelo, y₀ + hₘₐₓ = ${dato(y0)} + ${m(r.hmax)} = ${m(y0 + r.hmax)} m.`}</p>}
            </>
          ) : (
            <p className="calc-hoja__suelta">{vy < 0 ? 'Con v₀ᵧ negativa no sube. Lo más alto es la salida.' : 'Con v₀ᵧ = 0 no sube. Lo más alto es la salida.'}</p>
          )}
        </Paso>
        {r.conSuelo && (
          <Paso titulo="El tiempo de vuelo y el alcance">
            {y0 === 0 ? (
              <>
                <p className="calc-hoja__cuenta an-cuenta">0 = v₀ᵧ·t − ½·g·t²</p>
                <p className="calc-hoja__cuenta an-cuenta">
                  {`tᵥ = 2·v₀ᵧ/g = 2·${m(vy)}/${dato(g)} = `}
                  <span className="cuenta-fin">{`${m(r.tv)}\u00a0s`}</span>
                </p>
              </>
            ) : (
              <>
                <p className="calc-hoja__cuenta an-cuenta">{`0 = y₀ + v₀ᵧ·t − ½·g·t² = ${dato(y0)} + ${entre(vy)}·t − ${dec(g / 2, 4)}·t²`}</p>
                <p className="calc-hoja__cuenta an-cuenta">
                  {`tᵥ = (v₀ᵧ + √(v₀ᵧ² + 2·g·y₀))/g = (${m(vy)} + √(${entre(vy)}² + 2·${dato(g)}·${dato(y0)}))/${dato(g)} = `}
                  <span className="cuenta-fin">{`${m(r.tv)}\u00a0s`}</span>
                </p>
                <p className="calc-hoja__nota">Es la raíz positiva de la ecuación de y.</p>
              </>
            )}
            <p className="calc-hoja__cuenta an-cuenta">
              {`d = v₀ₓ·tᵥ = ${m(vx)}·${m(r.tv)} = `}
              <span className="cuenta-fin">{`${m(r.d)}\u00a0m`}</span>
            </p>
            {y0 === 0 && vx > 0 && <p className="calc-hoja__cuenta an-cuenta">{`d = v₀²·sen 2φ/g = ${dato(v0)}²·sen ${grados(2 * phi)}/${dato(g)} = ${m(r.d)}\u00a0m`}</p>}
            <p className="calc-hoja__nota">
              {y0 === 0 ? 'd = v₀²·sen 2φ/g vale solo si llega al mismo nivel del que salió.' : 'Llega más abajo de donde salió. Por eso d = v₀²·sen 2φ/g no vale.'}
            </p>
          </Paso>
        )}
        {r.conSuelo && (
          <Paso titulo="Al llegar al suelo">
            <p className="calc-hoja__cuenta an-cuenta">{`v₁ₓ = v₀ₓ = ${m(vx)}\u00a0m/s`}</p>
            <p className="calc-hoja__cuenta an-cuenta">{`v₁ᵧ = v₀ᵧ − g·tᵥ = ${m(vy)} − ${dato(g)}·${m(r.tv)} = ${m(r.llegada.vy)}\u00a0m/s`}</p>
            <p className="calc-hoja__cuenta an-cuenta">
              {`|v₁| = √(v₁ₓ² + v₁ᵧ²) = `}
              <span className="cuenta-fin">{`${m(r.llegada.v)}\u00a0m/s`}</span>
            </p>
            <p className="calc-hoja__cuenta an-cuenta">{`φ₁ = arctg(v₁ᵧ/v₁ₓ) = ${grados(r.llegada.phi)}`}</p>
          </Paso>
        )}
        {r.t !== null && (
          <Paso titulo={`En t = ${dato(r.t)} s`}>
            {p ? (
              <>
                <p className="calc-hoja__cuenta an-cuenta">
                  {`x = v₀ₓ·t = ${m(vx)}·${dato(p.t)} = `}
                  <span className="cuenta-fin">{`${m(p.x)}\u00a0m`}</span>
                </p>
                <p className="calc-hoja__cuenta an-cuenta">{`y = y₀ + v₀ᵧ·t − ½·g·t² = ${dato(y0)} + ${entre(vy)}·${dato(p.t)} − ½·${dato(g)}·${dato(p.t)}² = ${m(p.y)}\u00a0m`}</p>
                <p className="calc-hoja__cuenta an-cuenta">
                  {`Δy = y − y₀ = `}
                  <span className="cuenta-fin">{`${m(p.dy)}\u00a0m`}</span>
                </p>
                <p className="calc-hoja__cuenta an-cuenta">{`vᵧ = v₀ᵧ − g·t = ${m(vy)} − ${dato(g)}·${dato(p.t)} = ${m(p.vy)}\u00a0m/s`}</p>
                <p className="calc-hoja__cuenta an-cuenta">
                  {`|v| = √(vₓ² + vᵧ²) = √(${m(vx)}² + ${entre(p.vy)}²) = `}
                  <span className="cuenta-fin">{`${m(p.v)}\u00a0m/s`}</span>
                </p>
                <p className="calc-hoja__cuenta an-cuenta">{`φ = arctg(vᵧ/vₓ) = ${vx > 1e-9 ? `arctg(${entre(p.vy)}/${m(vx)}) = ` : ''}${grados(p.phi)}`}</p>
              </>
            ) : (
              <p className="calc-hoja__suelta">{`Ya está en el suelo. Llegó en tᵥ = ${m(r.tv)} s.`}</p>
            )}
          </Paso>
        )}
        {r.trayectoria && (
          <Paso titulo="La ecuación de la trayectoria">
            <p className="calc-hoja__cuenta an-cuenta">y = y₀ + (v₀ᵧ/v₀ₓ)·x − g/(2·v₀ₓ²)·x²</p>
            <p className="calc-hoja__cuenta an-cuenta">
              {`y = ${y0 ? `${dato(y0)} ${r.trayectoria.b < 0 ? '−' : '+'} ` : r.trayectoria.b < 0 ? '−' : ''}${dec(Math.abs(r.trayectoria.b), 4)}·x − ${dec(r.trayectoria.c, 4)}·x²`}
            </p>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

export default function TiroOblicuo() {
  const [estado, setEstado] = useRecordado('calc:tiro-oblicuo', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => tiro(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (c) => error?.campo === c;
  const errorDatos = error && ['v0', 'phi', 'y0', 'g'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Renglon titulo="El lanzamiento" error={errorDatos && error.texto} errorId={`${id}-ed`}>
            <Dato id={`${id}-v0`} nombre="v₀" decir="la velocidad inicial" unidad="m/s" valor={estado.v0} alCambiar={cambiar('v0')} invalido={mal('v0')} errorId={`${id}-ed`} ancho={4.5} />
            <Dato id={`${id}-phi`} nombre="φ" decir="el ángulo sobre la horizontal" unidad="°" valor={estado.phi} alCambiar={cambiar('phi')} invalido={mal('phi')} errorId={`${id}-ed`} ancho={4} />
            <Dato id={`${id}-y0`} nombre="y₀" decir="la altura de salida" unidad="m" valor={estado.y0} alCambiar={cambiar('y0')} invalido={mal('y0')} errorId={`${id}-ed`} ancho={4.5} placeholder="0" />
            <Dato id={`${id}-g`} nombre="g" unidad="m/s²" valor={estado.g} alCambiar={cambiar('g')} invalido={mal('g')} errorId={`${id}-ed`} ancho={4} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">φ se mide sobre la horizontal. Si es negativo, el tiro va para abajo. y₀ es la altura de salida sobre el suelo.</p>
          <Renglon titulo="Un instante" error={mal('t') && error.texto} errorId={`${id}-et`}>
            <Dato id={`${id}-t`} nombre="t" decir="el instante" unidad="s" valor={estado.t} alCambiar={cambiar('t')} invalido={mal('t')} errorId={`${id}-et`} ancho={4} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">Con t, suma dónde está y con qué velocidad va.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion r={r} />}
    </>
  );
}
