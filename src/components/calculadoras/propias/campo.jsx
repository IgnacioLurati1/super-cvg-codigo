import { useId, useMemo } from 'react';
import { campo, VARIABLES } from '../../../lib/calculadoras/campo';
import { dec } from '../../../lib/calculadoras/decimales';
import { escribir } from '../../../lib/calculadoras/formula';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Ejemplos, Hoja, Paso, Pasos, Resultado } from '../Hoja';
import { Formula, Leyenda, Plano, Rotulo, Vector } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';
import './campo.css';

// Campo vectorial, of Análisis Matemático II: the student's F = P i + Q j (+ R k), its arrows, the crossed derivatives,
// whether it is conservative, the potential function as «7D» finds it, the work from A to B, and the divergence and
// the rotor at a point. Definitions, method, notation and examples: parcial-3.md of El Santo Resumen (apunte de la
// cátedra «7A», «7D», «7F»; versión por unidad «18» y «19»), through lib/calculadoras/campo.js.

export const EJEMPLOS = [
  { nombre: '−y i + x j', P: '-y', Q: 'x', R: '', punto: '1; 1', A: '', B: '' },
  { nombre: '∇(x²y³)', P: '2xy^3', Q: '3x^2y^2', R: '', punto: '1; 1', A: '', B: '' },
  { nombre: '(x − y) i + (x − 2) j', P: 'x - y', Q: 'x - 2', R: '', punto: '1; 1', A: '', B: '' },
  { nombre: '(x + 2xy) i + (x² − 3y²) j, con el trabajo', P: 'x + 2xy', Q: 'x^2 - 3y^2', R: '', punto: '1; 1', A: '0; 1', B: '0; -e^pi' },
  { nombre: '(−y i + x j)/(x² + y²)', P: '-y/(x^2 + y^2)', Q: 'x/(x^2 + y^2)', R: '', punto: '1; 1', A: '', B: '' },
  { nombre: 'y²z³ i + 2xyz³ j + 3xy²z² k', P: 'y^2z^3', Q: '2xyz^3', R: '3xy^2z^2', punto: '1; 1; 1', A: '', B: '' },
];

const INICIAL = { ...EJEMPLOS[3], nombre: undefined };

const LETRA = ['P', 'Q', 'R'];
const VERSOR = ['i', 'j', 'k'];

const punto = (v) => `(${v.map((x) => dec(x, 4)).join('; ')})`;

/** P_y, with the variable low as in the notes. */
const Sub = ({ letra, de }) => (
  <>
    {letra}
    <sub>{de}</sub>
  </>
);

/** (x + 2xy) i + (x² − 3y²) j: each component with its versor, in parentheses when it is a sum. */
function Componentes({ nodos }) {
  const partes = nodos.map((n, i) => ({ n, i })).filter(({ n }) => escribir(n) !== '0');
  if (!partes.length) return '0';
  return partes.map(({ n, i }, k) => {
    const negativo = k > 0 && n.t === 'neg';
    const dentro = negativo ? n.a : n;
    const suma = dentro.t === '+' || dentro.t === '-';
    const solo = escribir(dentro) === '1';
    return (
      <span key={VERSOR[i]}>
        {k > 0 && (negativo ? ' − ' : ' + ')}
        {!solo && (suma ? '(' : '')}
        {!solo && <Formula nodo={dentro} />}
        {!solo && (suma ? ')' : '')}
        {solo ? VERSOR[i] : ` ${VERSOR[i]}`}
      </span>
    );
  });
}

/** −1 i + 1 j, with numbers. */
const conNumeros = (vals) =>
  vals
    .map((v, i) => {
      if (i === 0) return `${dec(v, 4)} ${VERSOR[i]}`;
      return `${v < 0 ? ' − ' : ' + '}${dec(Math.abs(v), 4)} ${VERSOR[i]}`;
    })
    .join('');

/** The arrows of F on a grid, the chosen point in red and the holes of the domain. In three variables, the plane z = c. */
function Flechas({ r }) {
  const { R } = r;
  const [a, b, c = 0] = r.punto.v;
  const enPunto = r.punto.F;
  const etiqueta = `Las flechas de F entre ${dec(-R)} y ${dec(R)}${r.tres ? `, en el plano z = ${dec(c)}` : ''}. ${
    r.punto.definido ? `En ${punto(r.punto.v)}, F = ${conNumeros(enPunto)}.` : `F no está definido en ${punto(r.punto.v)}.`
  }${r.agujeros.length ? ` No está definido en ${r.agujeros.map((h) => punto(h)).join(' ni en ')}.` : ''}`;
  return (
    <Plano x={[-R, R]} y={[-R, R]} igual proporcion={1} maxAlto={420} etiqueta={etiqueta}>
      {({ sx, sy, area, X: vx, Y: vy }) => {
        const n = area.r - area.l < 300 ? 5 : 6;
        const paso = (2 * R) / (2 * n + 1);
        const puntos = [];
        // The grid of the window, wider than the field's square when the sheet is wide.
        const desde = (v) => Math.ceil(v / paso + 0.3);
        const hasta = (v) => Math.floor(v / paso - 0.3);
        for (let i = desde(vx[0]); i <= hasta(vx[1]); i += 1) for (let j = desde(vy[0]); j <= hasta(vy[1]); j += 1) puntos.push([i * paso, j * paso]);
        const vals = puntos.map(([x, y]) => r.valorEn(x, y, c));
        const modulos = vals.map(([p, q]) => Math.hypot(p, q));
        // Near a hole the arrows would swamp the rest: the top is the 90th percentile.
        const orden = modulos.filter(Number.isFinite).sort((p, q) => p - q);
        const tope = orden[Math.floor(orden.length * 0.9)] || 1;
        const largoMax = Math.abs(sx(paso) - sx(0)) * 0.85;
        const flecha = (x, y, [p, q], clase, minimo = 0.25) => {
          const mod = Math.hypot(p, q);
          if (!(mod > 0) || !Number.isFinite(mod)) return null;
          const largo = largoMax * Math.max(minimo, Math.sqrt(Math.min(1, mod / tope)));
          const x1 = sx(x);
          const y1 = sy(y);
          return <Vector key={`${x}|${y}|${clase}`} x1={x1} y1={y1} x2={x1 + (p / mod) * largo} y2={y1 - (q / mod) * largo} className={clase} punta={6} />;
        };
        return (
          <>
            {puntos.map(([x, y], k) => flecha(x, y, vals[k], 'graf__vector--suave'))}
            {r.agujeros.map(([x, y]) => (
              <circle key={`${x}|${y}`} className="graf__punto" cx={sx(x)} cy={sy(y)} r={5} />
            ))}
            {r.punto.definido && flecha(a, b, enPunto, 'graf__vector--metodo', 0.6)}
            <circle className="graf__punto graf__punto--metodo" cx={sx(a)} cy={sy(b)} r={4} />
            <Rotulo x={sx(a) + 8} y={sy(b) + 18} ancla="start" className="graf__rotulo--metodo">
              {punto([a, b])}
            </Rotulo>
          </>
        );
      }}
    </Plano>
  );
}

function porQue(r) {
  const { cruzadas, distintoEn } = r;
  if (r.veredicto === 'no') {
    const k = cruzadas.find((c) => !c.iguales);
    const nombres = `∂${LETRA[k.i]}/∂${VARIABLES[k.xi]} y ∂${LETRA[k.j]}/∂${VARIABLES[k.xj]}`;
    return distintoEn ? `${nombres} no coinciden en ${punto(distintoEn.slice(0, r.cuantas))}.` : `${nombres} no coinciden.`;
  }
  if (r.veredicto === 'hueco') return `Las derivadas cruzadas coinciden. F no está definido en ${punto(r.agujeros[0])}. Con ese agujero, el dominio no es simplemente conexo.`;
  if (r.veredicto === 'dominio') return `Las derivadas cruzadas coinciden${r.faltaEnVentana ? ' donde F está definido' : ''}. Si el dominio es simplemente conexo, F es conservativo.`;
  return `Las derivadas cruzadas coinciden en todo ${r.tres ? 'ℝ³' : 'ℝ²'}.`;
}

function Potencial({ r }) {
  const p = r.potencial;
  const fx = r.tres ? 'f(x, y, z)' : 'f(x, y)';
  const phi = r.tres ? 'φ(y, z)' : 'φ(y)';
  const mas = (nodo, resto) => (escribir(nodo) === '0' ? resto : <><Formula nodo={nodo} />{` + ${resto}`}</>);
  return (
    <Paso titulo="La función potencial">
      <p className="calc-hoja__suelta">Se integra P respecto de x. Lo que queda depende de las otras variables.</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {'f = ∫ P dx = '}
        {mas(p.f1, phi)}
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        <Sub letra="f" de="y" />
        {' = '}
        {mas(p.f1y, r.tres ? 'φ' : "φ'(y)")}
        {r.tres && <sub>y</sub>}
        {' = '}
        <Formula nodo={r.nodos[1]} />
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        {r.tres ? <Sub letra="φ" de="y" /> : "φ'(y)"}
        {' = '}
        <Formula nodo={p.phiPrima} />
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`${phi} = `}
        {r.tres ? mas(p.phi, 'ψ(z)') : <Formula nodo={p.phi} />}
      </p>
      {r.tres && (
        <>
          <p className="calc-hoja__cuenta an-cuenta">
            <Sub letra="f" de="z" />
            {' = '}
            {mas(p.fz, "ψ'(z)")}
            {' = '}
            <Formula nodo={r.nodos[2]} />
          </p>
          <p className="calc-hoja__cuenta an-cuenta">
            {"ψ'(z) = "}
            <Formula nodo={p.psiPrima} />
          </p>
          <p className="calc-hoja__cuenta an-cuenta">
            {'ψ(z) = '}
            <Formula nodo={p.psi} />
          </p>
        </>
      )}
      <p className="calc-hoja__cuenta an-cuenta">
        {`${fx} = `}
        <span className="cuenta-fin">
          <Formula nodo={p.nodo} />
        </span>
        {' + C'}
      </p>
    </Paso>
  );
}

function Trabajo({ r }) {
  const t = r.trabajo;
  if (t.W === null) {
    return (
      <Paso titulo="El trabajo de A a B">
        <p className="calc-hoja__suelta">
          {r.veredicto === 'si' ? 'La potencial de este campo va a mano. Después, W = f(B) − f(A).' : 'F no es conservativo. El trabajo depende de la curva entre A y B. Hace falta su r(t).'}
        </p>
      </Paso>
    );
  }
  return (
    <Paso titulo="El trabajo de A a B">
      <p className="calc-hoja__cuenta an-cuenta">∫꜀ F·dr = f(B) − f(A)</p>
      <p className="calc-hoja__cuenta an-cuenta">{`f(B) = f${punto(t.B)} = ${dec(t.fB, 4)} + C`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`f(A) = f${punto(t.A)} = ${dec(t.fA, 4)} + C`}</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`W = ${dec(t.fB, 4)} − ${t.fA < 0 ? `(${dec(t.fA, 4)})` : dec(t.fA, 4)} = `}
        <span className="cuenta-fin">{dec(t.W, 4)}</span>
      </p>
      <p className="calc-hoja__nota">Con F conservativo, el trabajo no depende del camino. Solo importan los extremos.</p>
    </Paso>
  );
}

function EnElPunto({ r }) {
  const q = r.punto;
  const donde = punto(q.v);
  if (!q.definido) {
    return (
      <Paso titulo={`En ${donde}`}>
        <p className="calc-hoja__suelta">{`F no está definido en ${donde}.`}</p>
      </Paso>
    );
  }
  const div = q.divergencia;
  const rotNulo = q.rotor.every((v) => Math.abs(v) < 1e-12);
  const diag = r.tres ? ['x', 'y', 'z'] : ['x', 'y'];
  return (
    <Paso titulo={`En ${donde}`}>
      <p className="calc-hoja__cuenta an-cuenta">{`F${donde} = ${conNumeros(q.F)}`}</p>
      <p className="calc-hoja__cuenta an-cuenta">{`|F${donde}| = ${dec(q.modulo, 4)}`}</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {'Div(F) = '}
        {diag.map((x, i) => (
          <span key={x}>
            {i > 0 && ' + '}
            <Sub letra={LETRA[i]} de={x} />
          </span>
        ))}
        {' = '}
        <Formula nodo={r.nodoDiv} />
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`Div(F)${donde} = `}
        <span className="cuenta-fin">{dec(div, 4)}</span>
      </p>
      <p className="calc-hoja__suelta">{Math.abs(div) < 1e-12 ? 'Ahí el fluido es incompresible.' : div > 0 ? 'Ahí hay una fuente.' : 'Ahí hay un sumidero.'}</p>
      <p className="calc-hoja__cuenta an-cuenta">
        {'Rot(F) = '}
        {r.tres ? (
          <>
            (<Sub letra="R" de="y" /> − <Sub letra="Q" de="z" />) i + (<Sub letra="P" de="z" /> − <Sub letra="R" de="x" />) j + (<Sub letra="Q" de="x" /> − <Sub letra="P" de="y" />) k
          </>
        ) : (
          <>
            (<Sub letra="Q" de="x" /> − <Sub letra="P" de="y" />) k
          </>
        )}
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        {'Rot(F) = '}
        <Componentes nodos={r.nodoRot} />
      </p>
      <p className="calc-hoja__cuenta an-cuenta">
        {`Rot(F)${donde} = `}
        <span className="cuenta-fin">{rotNulo ? '0' : conNumeros(r.tres ? q.rotor : [q.rotor[2]]).replace(/ i$/, ' k')}</span>
      </p>
      <p className="calc-hoja__suelta">{rotNulo ? 'Ahí F es irrotacional.' : 'Ahí el fluido tiende a rotar.'}</p>
      {!r.tres && <p className="calc-hoja__nota">En el plano se toma R = 0. Del rotor queda solo la k.</p>}
    </Paso>
  );
}

function Resolucion({ r }) {
  const fx = r.tres ? 'f(x, y, z)' : 'f(x, y)';
  const F = r.tres ? 'F(x, y, z)' : 'F(x, y)';
  const conservativo = r.veredicto === 'si';
  const trabajo = r.trabajo?.W != null ? ` De A a B, el trabajo da ${dec(r.trabajo.W, 4)}.` : '';
  const dicho = conservativo
    ? r.potencial
      ? `F es conservativo. Su función potencial es ${fx} = ${escribir(r.potencial.nodo)} + C.`
      : 'F es conservativo.'
    : r.veredicto === 'dominio'
      ? 'Las derivadas cruzadas coinciden.'
      : 'F no es conservativo.';
  const dominio = !r.restringido
    ? `Dom(F) = ${r.tres ? 'ℝ³' : 'ℝ²'}`
    : r.agujeros.length
      ? `F no está definido en ${r.agujeros.map((h) => punto(h)).join(' ni en ')}.`
      : r.faltaEnVentana
        ? 'F no está definido en todo el plano.'
        : null;
  return (
    <Hoja>
      <Resultado dicho={dicho} nota={`${conservativo && r.potencial ? 'F es conservativo. ' : ''}${porQue(r)}${conservativo && !r.potencial ? ' La potencial va a mano, integrando P respecto de x.' : ''}${trabajo}`}>
        {conservativo && r.potencial ? (
          <>
            {`${fx} = `}
            <span className="resaltado">
              <Formula nodo={r.potencial.nodo} />
            </span>
            {' + C'}
          </>
        ) : (
          <span className="resaltado">{conservativo ? 'F es conservativo' : r.veredicto === 'dominio' ? 'Las cruzadas coinciden' : 'F no es conservativo'}</span>
        )}
      </Resultado>
      <Pasos>
        <Paso titulo="El campo">
          <p className="calc-hoja__cuenta an-cuenta">
            {`${F} = `}
            <Componentes nodos={r.nodos} />
          </p>
          {dominio && <p className="calc-hoja__suelta">{dominio}</p>}
          <Flechas r={r} />
          <Leyenda
            items={[
              { clase: 'campo-ley campo-ley--flecha', texto: 'F en cada punto' },
              { clase: 'campo-ley campo-ley--punto', texto: `F${punto(r.punto.v)}` },
              ...(r.agujeros.length ? [{ clase: 'graf__punto', texto: 'sin definir', punto: true }] : []),
            ]}
          />
          <p className="calc-hoja__nota">
            {r.tres && `El dibujo es el corte z = ${dec(r.punto.v[2], 4)}, con P y Q. `}
            El largo de las flechas está achicado para que se vean también las chicas.
          </p>
        </Paso>
        <Paso titulo="Las derivadas cruzadas">
          {r.cruzadas.map((k) => (
            <div key={`${k.i}${k.xi}`} className="campo-cruzada">
              <p className="calc-hoja__cuenta an-cuenta">
                <Sub letra={LETRA[k.i]} de={VARIABLES[k.xi]} />
                {' = '}
                <Formula nodo={k.u} />
              </p>
              <p className="calc-hoja__cuenta an-cuenta">
                <Sub letra={LETRA[k.j]} de={VARIABLES[k.xj]} />
                {' = '}
                <Formula nodo={k.v} />
              </p>
              <p className="calc-hoja__cuenta an-cuenta">
                <span className={k.iguales ? 'cuenta-fin' : 'campo-distinto'}>
                  <Sub letra={LETRA[k.i]} de={VARIABLES[k.xi]} />
                  {k.iguales ? ' = ' : ' ≠ '}
                  <Sub letra={LETRA[k.j]} de={VARIABLES[k.xj]} />
                </span>
              </p>
            </div>
          ))}
          <p className="calc-hoja__nota">
            {r.veredicto === 'no'
              ? 'Si F fuera conservativo, las derivadas cruzadas coincidirían en todo el dominio.'
              : r.veredicto === 'si'
                ? `${r.tres ? 'ℝ³' : 'ℝ²'} es abierto y simplemente conexo. Con las cruzadas iguales, F es conservativo.`
                : r.veredicto === 'hueco'
                  ? 'Un dominio con un agujero no es simplemente conexo. Con las cruzadas iguales no alcanza.'
                  : 'Con las cruzadas iguales, falta que el dominio sea abierto y simplemente conexo.'}
          </p>
        </Paso>
        {r.potencial && <Potencial r={r} />}
        {r.trabajo && <Trabajo r={r} />}
        <EnElPunto r={r} />
      </Pasos>
    </Hoja>
  );
}

export default function CampoVectorial() {
  const [estado, setEstado] = useRecordado('calc:campo', INICIAL);
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const r = useMemo(() => campo(estado), [estado]);
  const error = r.error;
  const id = useId();
  const mal = (c) => error?.campo === c;
  const tres = String(estado.R ?? '').trim() !== '';
  const de = tres ? '(x, y, z)' : '(x, y)';
  const errorTrabajo = error && ['A', 'B'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          {LETRA.map((L, i) => (
            <div key={L} className="campo-componente">
              <Escribir
                id={`${id}-${L}`}
                nombre={`${L}${de}`}
                decir={`lo que acompaña a ${VERSOR[i]}`}
                valor={estado[L]}
                alCambiar={cambiar(L)}
                invalido={mal(L)}
                errorId={`${id}-e${L}`}
                ayudaId={i === 2 ? `${id}-ayuda` : undefined}
              />
              <ErrorDe id={`${id}-e${L}`} texto={mal(L) && error.texto} />
            </div>
          ))}
          <p className="campo__ayuda pz-ayuda" id={`${id}-ayuda`}>
            F = P i + Q j + R k. En el plano, R va vacío.
          </p>
          <Renglon titulo="El punto" error={mal('punto') && error.texto} errorId={`${id}-ep`}>
            <Dato id={`${id}-p`} nombre={tres ? '(x; y; z)' : '(x; y)'} decir="el punto" ancho={7} valor={estado.punto} alCambiar={cambiar('punto')} invalido={mal('punto')} errorId={`${id}-ep`} />
          </Renglon>
          <Renglon titulo="El trabajo de A a B" error={errorTrabajo && error.texto} errorId={`${id}-et`}>
            <Dato id={`${id}-a`} nombre="A" ancho={7} valor={estado.A} alCambiar={cambiar('A')} invalido={mal('A')} errorId={`${id}-et`} />
            <Dato id={`${id}-b`} nombre="B" ancho={7} valor={estado.B} alCambiar={cambiar('B')} invalido={mal('B')} errorId={`${id}-et`} />
          </Renglon>
          <p className="campo__ayuda pz-ayuda">Las coordenadas van con punto y coma, como 0; 1. Con A y B, suma el trabajo.</p>
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={({ nombre: _n, ...e }) => setEstado(e)} />
      </section>

      {!error && <Resolucion r={r} />}
    </>
  );
}
