import { useId, useMemo } from 'react';
import { dec } from '../../../lib/calculadoras/decimales';
import { escribir, superindice } from '../../../lib/calculadoras/formula';
import { lgr, limpio, ramas } from '../../../lib/calculadoras/lgr';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { Leyenda, linea, Plano, rango } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';
import './lgr-raices.css';

// Lugar geométrico de las raíces, of Tecnologías para la Automatización: the student's FTLA = k·N(s)/D(s), the branches
// drawn in the plane s, each construction rule of the slides with its numbers, the range of k that keeps it stable and
// the closed-loop poles for a chosen k. Rules, notation and examples: parcial.md of El Santo Resumen (diapositivas
// «7 - Lugar geométrico de las raíces», págs. 2 a 11; «9 - Controladores», págs. 6 y 9), through lib/calculadoras/lgr.js.

export const EJEMPLOS = [
  { nombre: 'k/(s³ + 4s² + 8s), el de las reglas', N: '1', D: 's^3 + 4s^2 + 8s', k: '8' },
  { nombre: 'k/(s(s + 1))', N: '1', D: 's(s + 1)', k: '3' },
  { nombre: 'k/(s + 2)', N: '1', D: 's + 2', k: '1' },
  { nombre: 'Planta 1/((s + 0,5)(s + 1)) con control P', N: '1', D: '(s + 0,5)(s + 1)', k: '1' },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const n4 = (v) => dec(v, 4);

/** A polynomial written from the highest power down: s³ + 4s² + 8s, −4ω² + 8. */
function polinomio(a, v = 's') {
  const c = limpio(a);
  const partes = [];
  for (let i = c.length - 1; i >= 0; i -= 1) {
    const x = c[i];
    if (x === 0) continue;
    const abs = Math.abs(x);
    const letra = i === 0 ? '' : i === 1 ? v : `${v}${superindice(i)}`;
    const numero = abs === 1 && i > 0 ? '' : n4(abs);
    const signo = partes.length ? (x < 0 ? ' − ' : ' + ') : x < 0 ? '−' : '';
    partes.push(`${signo}${numero}${letra}`);
  }
  return partes.join('') || '0';
}

/** p(ω) + k·q(ω), as on paper: −4ω² + k, ω − ω³ + k(2ω). */
function conK(p, q, v) {
  const base = limpio(p).some((x) => x !== 0) ? polinomio(p, v) : '';
  const qq = limpio(q);
  if (qq.every((x) => x === 0)) return base || '0';
  let termino;
  if (qq.length === 1) termino = Math.abs(qq[0]) === 1 ? 'k' : `${n4(Math.abs(qq[0]))}k`;
  else termino = `k(${polinomio(qq, v)})`;
  const negativo = qq.length === 1 && qq[0] < 0;
  if (!base) return `${negativo ? '−' : ''}${termino}`;
  return `${base} ${negativo ? '−' : '+'} ${termino}`;
}

/** −2 + 2i, 0, −0,5. */
function complejo([re, im]) {
  if (im === 0) return n4(re);
  const i = `${Math.abs(im) === 1 ? '' : n4(Math.abs(im))}i`;
  if (re === 0) return `${im < 0 ? '−' : ''}${i}`;
  return `${n4(re)} ${im < 0 ? '−' : '+'} ${i}`;
}

/** The roots as a list, with a conjugate pair written once: 0; −2 ± 2i. */
function lista(zs) {
  if (!zs.length) return 'ninguno';
  return zs
    .filter((z) => z[1] >= 0)
    .map((z) => (z[1] === 0 ? n4(z[0]) : `${z[0] === 0 ? '' : `${n4(z[0])} `}± ${n4(z[1])}i`))
    .join('; ');
}

function rangos(estables) {
  if (!estables.length) return null;
  return estables.map(([a, b]) => (b === null ? (a === 0 ? 'k > 0' : `k > ${n4(a)}`) : `${n4(a)} < k < ${n4(b)}`)).join(' y ');
}

function ventana(r) {
  const re = [0, ...r.polos.map((z) => z[0]), ...r.ceros.map((z) => z[0])];
  const im = [0, ...r.polos.map((z) => z[1]), ...r.ceros.map((z) => z[1])];
  if (r.asintotas) re.push(r.asintotas.centroide);
  r.cruces.forEach((c) => im.push(c.omega, -c.omega));
  r.quiebres.filter((q) => q.tipo === 'si').forEach((q) => re.push(q.s[0]));
  if (r.conK) r.conK.polos.forEach((z) => (re.push(z[0]), im.push(z[1])));
  const X = rango(re, 0.3);
  const ancho = X[1] - X[0];
  const alto = Math.max(...im.map(Math.abs), ancho * 0.35) * 1.3;
  return { X: [X[0] - ancho * 0.1, X[1] + ancho * 0.1], Y: [-alto, alto] };
}

function Lugar({ r }) {
  const { X, Y } = useMemo(() => ventana(r), [r]);
  const lineas = useMemo(() => ramas(r, X, Y), [r, X, Y]);
  const etiqueta = `El plano s. Polos de lazo abierto en ${lista(r.polos)}${r.ceros.length ? ` y ceros en ${lista(r.ceros)}` : ''}. ${
    r.cruces.length ? `Cruza el eje imaginario en ω = ±${n4(r.cruces[0].omega)} con k = ${n4(r.cruces[0].k)}.` : 'No cruza el eje imaginario.'
  }${r.conK ? ` Con k = ${n4(r.conK.k)}, los polos de lazo cerrado están en ${lista(r.conK.polos)}.` : ''}`;
  return (
    <Plano x={X} y={Y} igual proporcion={0.8} maxAlto={460} etiqueta={etiqueta} nombreX="Re" nombreY="Im" formatoX={(v) => dec(v, 2)} formatoY={(v) => dec(v, 2)}>
      {({ sx, sy, recorte, X: vx, Y: vy }) => {
        const largo = Math.hypot(vx[1] - vx[0], vy[1] - vy[0]);
        return (
          <>
            <g clipPath={recorte}>
              {r.asintotas &&
                r.asintotas.angulos.map((a) => {
                  const t = (a * Math.PI) / 180;
                  const c = r.asintotas.centroide;
                  return <line key={a} className="lgr-asintota" x1={sx(c)} y1={sy(0)} x2={sx(c + Math.cos(t) * largo)} y2={sy(Math.sin(t) * largo)} />;
                })}
              {lineas.map((l, i) => (
                <path key={i} className="graf__curva lgr-rama" d={linea(l.map(([a, b]) => [sx(a), sy(b)]))} />
              ))}
            </g>
            {r.polos.map(([a, b], i) => (
              <path key={`p${i}`} className="lgr-polo" d={`M${sx(a) - 6} ${sy(b) - 6}L${sx(a) + 6} ${sy(b) + 6}M${sx(a) + 6} ${sy(b) - 6}L${sx(a) - 6} ${sy(b) + 6}`} />
            ))}
            {r.ceros.map(([a, b], i) => (
              <circle key={`z${i}`} className="lgr-cero" cx={sx(a)} cy={sy(b)} r={6} />
            ))}
            {r.cruces.map((c) => [c.omega, -c.omega].map((w) => <circle key={`${c.k}|${w}`} className="graf__punto" cx={sx(0)} cy={sy(w)} r={4} />))}
            {r.quiebres
              .filter((q) => q.tipo === 'si')
              .map((q) => (
                <circle key={q.s[0]} className="graf__punto" cx={sx(q.s[0])} cy={sy(0)} r={4} />
              ))}
            {r.conK?.polos.map(([a, b], i) => (
              <circle key={`k${i}`} className="graf__actual" cx={sx(a)} cy={sy(b)} r={6} />
            ))}
          </>
        );
      }}
    </Plano>
  );
}

function Resolucion({ r }) {
  const { n, m, asintotas, partes } = r;
  const texto = rangos(r.estables);
  const sinCeros = m === 0;
  const Nc = r.N.c;
  const Dc = r.D.c;
  const nVacio = Nc.length === 1;
  const tipeado = escribir(r.D.nodo);
  const expandido = polinomio(Dc);
  const numerador = nVacio ? (Nc[0] === 1 ? 'k' : `${n4(Nc[0])}k`) : `k(${polinomio(Nc)})`;
  const cruce = r.cruces[0];
  const nota = [
    cruce ? `En k = ${n4(cruce.k)} cruza el eje imaginario${cruce.omega > 0 ? ` en ω = ±${n4(cruce.omega)}` : ' en el origen'}.` : 'No cruza el eje imaginario.',
    r.conK ? `Con k = ${n4(r.conK.k)} ${r.conK.estable ? 'es estable' : 'no es estable'}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const dkds = nVacio ? limpio(r.dkds.map((x) => -x / (Nc[0] * Nc[0]))) : r.dkds;
  return (
    <Hoja>
      <Resultado dicho={texto ? `Es estable con ${texto}. ${nota}` : `No es estable con ningún k positivo. ${nota}`} nota={nota}>
        {texto ? 'Estable con ' : ''}
        <span className="resaltado">{texto ?? 'Inestable con todo k > 0'}</span>
      </Resultado>
      <Pasos>
        <Paso titulo="El lugar de las raíces">
          <p className="calc-hoja__cuenta an-cuenta">{`FTLA = ${numerador}/(${tipeado})`}</p>
          {tipeado !== expandido && <p className="calc-hoja__cuenta an-cuenta">{`D(s) = ${expandido}`}</p>}
          <p className="calc-hoja__cuenta an-cuenta">
            <span className="calc-hoja__op">Polos</span>
            {lista(r.polos)}
          </p>
          <p className="calc-hoja__cuenta an-cuenta">
            <span className="calc-hoja__op">Ceros</span>
            {lista(r.ceros)}
          </p>
          <p className="calc-hoja__suelta">
            {`n = ${n} y m = ${m}. Hay ${n} ${n === 1 ? 'rama' : 'ramas'}, que arrancan en los polos con k = 0. `}
            {sinCeros ? `${n === 1 ? 'Termina' : 'Terminan'} en infinito.` : m === n ? 'Terminan en los ceros.' : `${m} ${m === 1 ? 'termina' : 'terminan'} en los ceros y ${n - m} en infinito.`}
          </p>
          <Lugar r={r} />
          <Leyenda
            items={[
              { clase: 'graf__curva', texto: 'las ramas' },
              { clase: 'lgr-asintota', texto: 'las asíntotas' },
              ...(r.conK ? [{ clase: 'graf__actual', texto: `los polos con k = ${n4(r.conK.k)}`, punto: true }] : []),
            ]}
          />
          <p className="calc-hoja__nota">Las cruces son los polos de lazo abierto y los círculos, los ceros.</p>
        </Paso>
        <Paso titulo="Sobre el eje real">
          {r.tramos.length ? (
            r.tramos.map(([a, b]) => <p key={`${a}|${b}`} className="calc-hoja__cuenta an-cuenta">{`De ${a === -Infinity ? '−∞' : n4(a)} a ${n4(b)}`}</p>)
          ) : (
            <p className="calc-hoja__suelta">Ningún tramo del eje real es del lugar.</p>
          )}
          <p className="calc-hoja__nota">Un tramo es del lugar si a su derecha hay un número impar de polos y ceros.</p>
        </Paso>
        <Paso titulo="Las asíntotas">
          {asintotas ? (
            <>
              <p className="calc-hoja__cuenta an-cuenta">{`θ = 180°·q/(n − m), con q = ${asintotas.q.join(', ')}`}</p>
              <p className="calc-hoja__cuenta an-cuenta">
                {'θ = '}
                <span className="cuenta-fin">{asintotas.angulos.map((a) => `${dec(a, 2)}°`).join(', ')}</span>
              </p>
              <p className="calc-hoja__cuenta an-cuenta">
                {`Centroide = (Σ polos − Σ ceros)/(n − m) = (${n4(asintotas.sumaPolos)} − ${asintotas.sumaCeros < 0 ? `(${n4(asintotas.sumaCeros)})` : n4(asintotas.sumaCeros)})/${n - m} = `}
                <span className="cuenta-fin">{n4(asintotas.centroide)}</span>
              </p>
            </>
          ) : (
            <p className="calc-hoja__suelta">Con n = m no hay asíntotas.</p>
          )}
        </Paso>
        <Paso titulo="El cruce con el eje imaginario">
          <p className="calc-hoja__cuenta an-cuenta">{`D(s) + k·N(s) = ${conK(Dc, Nc, 's')} = 0`}</p>
          <p className="calc-hoja__suelta">Con s = iω se anulan la parte real y la imaginaria.</p>
          <p className="calc-hoja__cuenta an-cuenta">
            <span className="calc-hoja__op">Parte real</span>
            {`${conK(partes.Dr, partes.Nr, 'ω')} = 0`}
          </p>
          <p className="calc-hoja__cuenta an-cuenta">
            <span className="calc-hoja__op">Parte imaginaria</span>
            {`${conK(partes.Di, partes.Ni, 'ω')} = 0`}
          </p>
          {r.cruces.length ? (
            r.cruces.map((c) => (
              <p key={c.k} className="calc-hoja__cuenta an-cuenta">
                {c.omega > 0 ? `ω = ±${n4(c.omega)} con k = ` : 's = 0 con k = '}
                <span className="cuenta-fin">{n4(c.k)}</span>
              </p>
            ))
          ) : (
            <p className="calc-hoja__suelta">Ningún k positivo lo hace cruzar.</p>
          )}
        </Paso>
        <Paso titulo="Desprendimiento y entrada">
          <p className="calc-hoja__cuenta an-cuenta">{`k = −D(s)/N(s) = −${nVacio && Nc[0] === 1 ? `(${expandido})` : `(${expandido})/(${polinomio(Nc)})`}`}</p>
          {nVacio ? (
            <p className="calc-hoja__cuenta an-cuenta">{`dk/ds = ${polinomio(dkds)} = 0`}</p>
          ) : (
            <p className="calc-hoja__cuenta an-cuenta">{`dk/ds = 0 con D'(s)·N(s) − D(s)·N'(s) = ${polinomio(dkds)} = 0`}</p>
          )}
          {r.quiebres
            .filter((q) => q.s[1] >= 0)
            .map((q) => (
            <p key={`${q.s[0]}|${q.s[1]}`} className="calc-hoja__cuenta an-cuenta">
              {q.tipo === 'si' ? (
                <>
                  {`s = ${n4(q.s[0])} con k = `}
                  <span className="cuenta-fin">{n4(q.k)}</span>
                </>
              ) : q.tipo === 'compleja' ? (
                `s = ${n4(q.s[0])} ± ${n4(q.s[1])}i es compleja`
              ) : q.tipo === 'negativa' ? (
                `s = ${n4(q.s[0])} da k = ${n4(q.k)}, negativa`
              ) : (
                `s = ${n4(q.s[0])} es un cero de N(s)`
              )}
            </p>
          ))}
          <p className="calc-hoja__suelta">
            {r.quiebres.some((q) => q.tipo === 'si')
              ? 'Ahí las ramas se juntan sobre el eje real y se separan.'
              : 'No hay puntos de desprendimiento ni de entrada.'}
          </p>
        </Paso>
        {r.salidas.length > 0 && (
          <Paso titulo="Los ángulos de salida y de llegada">
            {r.salidas.map((s) => {
              const restan = s.otros.map((o) => `${dec(o.angulo, 2)}°`);
              const suman = (s.tipo === 'salida' ? s.deCeros : s.dePolos).map((o) => `${dec(o.angulo, 2)}°`);
              return (
                <div key={`${s.tipo}${s.en[0]}${s.en[1]}`} className="lgr-salida">
                  <p className="calc-hoja__cuenta an-cuenta">
                    <span className="calc-hoja__op">{s.tipo === 'salida' ? `Desde ${complejo(s.en)}` : `Hacia ${complejo(s.en)}`}</span>
                    {`θ = 180°${restan.length ? ` − (${restan.join(' + ')})` : ''}${suman.length ? ` + (${suman.join(' + ')})` : ''} = `}
                    <span className="cuenta-fin">{`${dec(s.angulo, 2)}°`}</span>
                  </p>
                  <p className="calc-hoja__suelta">{`En ${complejo([s.en[0], -s.en[1]])}, por simetría, θ = ${dec(-s.angulo, 2)}°.`}</p>
                </div>
              );
            })}
            <p className="calc-hoja__nota">Es la condición de ángulo en un punto muy cercano.</p>
          </Paso>
        )}
        {r.conK && (
          <Paso titulo={`Con k = ${n4(r.conK.k)}`}>
            <p className="calc-hoja__cuenta an-cuenta">{`${polinomio(r.conK.ecuacion)} = 0`}</p>
            <p className="calc-hoja__cuenta an-cuenta">
              <span className="calc-hoja__op">Polos de lazo cerrado</span>
              {lista(r.conK.polos)}
            </p>
            <p className="calc-hoja__suelta">
              {r.conK.estable
                ? 'Todos tienen parte real negativa. Es estable.'
                : r.conK.polos.some((z) => z[0] > 1e-9)
                  ? 'Hay polos con parte real positiva. No es estable.'
                  : 'Hay polos sobre el eje imaginario. Oscila sin amortiguarse.'}
            </p>
            <p className="calc-hoja__nota">El rango de k estable también sale con Routh.</p>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

export default function LugarDeLasRaices() {
  const [estado, setEstado] = useRecordado('calc:lgr-raices', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => lgr(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (c) => error?.campo === c;

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Escribir id={`${id}-N`} nombre="N(s)" decir="el numerador" valor={estado.N} alCambiar={cambiar('N')} invalido={mal('N')} errorId={`${id}-eN`} />
          <ErrorDe id={`${id}-eN`} texto={mal('N') && error.texto} />
          <Escribir id={`${id}-D`} nombre="D(s)" decir="el denominador" valor={estado.D} alCambiar={cambiar('D')} invalido={mal('D')} errorId={`${id}-eD`} ayudaId={`${id}-ayuda`} />
          <ErrorDe id={`${id}-eD`} texto={mal('D') && error.texto} />
          <p className="campo__ayuda pz-ayuda" id={`${id}-ayuda`}>
            FTLA = k·N(s)/D(s), con realimentación unitaria. Por ejemplo, <code>1</code> y <code>s(s + 1)</code>.
          </p>
          <Renglon titulo="Una ganancia" error={mal('k') && error.texto} errorId={`${id}-ek`}>
            <Dato id={`${id}-k`} nombre="k" decir="la ganancia" valor={estado.k} alCambiar={cambiar('k')} invalido={mal('k')} errorId={`${id}-ek`} ancho={5} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">Con k, suma los polos de lazo cerrado.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion r={r} />}
    </>
  );
}
