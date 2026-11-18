import { coma, entreParentesis as par } from '../../../lib/calculadoras/cifras';
import { caja, frecuencias } from '../../../lib/calculadoras/estadistica';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos } from '../Hoja';
import { Cuenta, Fichas, Frac } from './_est-cuentas';
import { DatosMuestra, filasDe, leerMuestra, muestra } from './_est-datos';
import { useMedida } from './_est-dibujo';
import './caja.css';

// Diagrama de caja of Probabilidad y Estadística: the data on the board, and on the sheet the box drawn by hand with
// the five numbers on its axis, and how each one comes out. Quartiles as the notes define them, the least value that
// accumulates at least 25% or 75% of the ordered data; the median of an even n averages the two central ones
// (Tratamiento de datos, pág. 22 and 23). Whiskers to the minimum and the maximum, as the notes draw them (pág. 32 and
// 33), or with the 1,5 riq rule of two Drive summaries, which the notes don't have (parcial-1.md of El Santo Resumen).

export const EJEMPLOS = [
  { nombre: 'La terminal, 50 días', datos: { ...muestra({ forma: 'tabla', filas: filasDe([84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94], [2, 4, 3, 7, 10, 9, 5, 6, 3, 0, 1]) }), bigotes: 'extremos' } },
  { nombre: 'Los 30 backups', datos: { ...muestra({ lista: '80 85 90 92 94 95 100 100 102 105 108 108 110 110 112 113 115 116 117 118 120 120 125 130 130 133 140 148 150 151' }), bigotes: 'extremos' } },
];

const BIGOTES = [
  { valor: 'extremos', texto: 'Hasta el mínimo y el máximo' },
  { valor: 'riq', texto: 'Con 1,5 riq' },
];

const f4 = (x) => coma(x, 4);
const LARGA = 25;

/** x with a subscript, for the minimum and the maximum: xₘ, x_M. */
const Sub = ({ base = 'x', sub }) => (
  <>
    {base}
    <sub>{sub}</sub>
  </>
);

/** The same inside the drawing, where there is no <sub>. */
const SubSvg = ({ sub }) => (
  <>
    x<tspan dy="0.35em">{sub}</tspan>
  </>
);

/** The rows that don't fit on one line go up (or down) a row, so two close numbers never overlap. */
function enFilas(items, separacion) {
  const finales = [];
  return items.map((it) => {
    let fila = finales.findIndex((fin) => it.x - it.ancho / 2 > fin);
    if (fila < 0) {
      fila = finales.length;
      finales.push(0);
    }
    finales[fila] = it.x + it.ancho / 2 + separacion;
    return { ...it, fila };
  });
}

/** The box as drawn by hand: whiskers, box, median, the outliers apart, and the numbers on the axis under each line. */
function DiagramaCaja({ c, etiqueta }) {
  const [lienzo, { ancho, letra }] = useMedida();
  const fs = Math.round(letra * 0.8125);
  const fsN = fs * 1.3;
  const fsV = fs * 1.1;
  const izq = fs * 1.6;
  const der = ancho - fs * 1.6;
  let lo = c.min;
  let hi = c.max;
  if (hi - lo < 1e-12) {
    lo -= 1;
    hi += 1;
  }
  const margen = (hi - lo) * 0.03;
  const X = (v) => izq + ((v - lo + margen) / (hi - lo + 2 * margen)) * (der - izq);
  const ancla = (x, w) => Math.min(Math.max(x, izq - fs + w / 2), der + fs - w / 2);

  const nombres = enFilas(
    [
      ...(c.conRiq ? [] : [{ v: c.bInf, texto: <SubSvg sub="m" />, largo: 2 }]),
      { v: c.q1.valor, texto: 'q₁', largo: 2 },
      { v: c.me.valor, texto: 'x̃', largo: 1 },
      { v: c.q3.valor, texto: 'q₃', largo: 2 },
      ...(c.conRiq ? [] : [{ v: c.bSup, texto: <SubSvg sub="M" />, largo: 2 }]),
    ].map((n) => ({ ...n, x: X(n.v), ancho: n.largo * fsN * 0.6 })),
    fsN * 0.4,
  );
  const distintos = [...new Set([c.bInf, c.q1.valor, c.me.valor, c.q3.valor, c.bSup])];
  const valores = enFilas(
    [...distintos.map((v) => ({ v })), ...c.atipicos.filter((v, i, t) => t.indexOf(v) === i).map((v) => ({ v, atipico: true }))]
      .sort((a, b) => a.v - b.v)
      .map((it) => {
        const w = f4(it.v).length * fsV * 0.6;
        return { ...it, x: ancla(X(it.v), w), ancho: w };
      }),
    fs * 0.7,
  );
  const filasArriba = Math.max(1, ...nombres.map((n) => n.fila + 1));
  const filasAbajo = Math.max(1, ...valores.map((n) => n.fila + 1));
  const arriba = fsN * (0.4 + filasArriba * 1.3) + fs * 0.4;
  const altoCaja = fs * 3.6;
  const yM = arriba + altoCaja / 2;
  const yEje = arriba + altoCaja + fs * 1.6;
  const alto = Math.round(yEje + fsV * 1.5 + (filasAbajo - 1) * fsV * 1.3 + fs * 0.6);
  const tapa = fs * 0.75;
  const guias = [
    { v: c.bInf, desde: yM + tapa },
    { v: c.q1.valor, desde: arriba + altoCaja },
    { v: c.me.valor, desde: arriba + altoCaja },
    { v: c.q3.valor, desde: arriba + altoCaja },
    { v: c.bSup, desde: yM + tapa },
  ];

  return (
    <div className="ce-caja" ref={lienzo}>
      {ancho > 0 && (
        <svg className="ce-caja__svg" role="img" aria-label={etiqueta} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} style={{ '--ce-fs': `${fs}px` }}>
          <g className="ce-caja__guias">
            {guias.map((g, i) => (
              <line key={i} x1={X(g.v)} x2={X(g.v)} y1={g.desde} y2={yEje} />
            ))}
          </g>
          <line className="ce-caja__eje" x1={izq - fs} x2={der + fs} y1={yEje} y2={yEje} />
          <g className="ce-caja__bigotes">
            <line x1={X(c.bInf)} x2={X(c.q1.valor)} y1={yM} y2={yM} />
            <line x1={X(c.q3.valor)} x2={X(c.bSup)} y1={yM} y2={yM} />
            <line x1={X(c.bInf)} x2={X(c.bInf)} y1={yM - tapa} y2={yM + tapa} />
            <line x1={X(c.bSup)} x2={X(c.bSup)} y1={yM - tapa} y2={yM + tapa} />
          </g>
          <rect className="ce-caja__caja" x={X(c.q1.valor)} y={arriba} width={Math.max(2, X(c.q3.valor) - X(c.q1.valor))} height={altoCaja} />
          <line className="ce-caja__mediana" x1={X(c.me.valor)} x2={X(c.me.valor)} y1={arriba} y2={arriba + altoCaja} />
          {c.atipicos.map((v, i) => (
            <circle key={i} className="ce-caja__atipico" cx={X(v)} cy={yM} r={fs * 0.34} />
          ))}
          {nombres.map((n, i) => (
            <text key={i} className="ce-caja__nombre" x={n.x} y={arriba - fs * 0.5 - n.fila * fsN * 1.3} textAnchor="middle">
              {n.texto}
            </text>
          ))}
          {valores.map((n, i) => (
            <g key={i}>
              <line className="ce-caja__marca" x1={X(n.v)} x2={X(n.v)} y1={yEje - 4} y2={yEje + 4} />
              <text className="ce-caja__valor" data-atipico={n.atipico || undefined} x={n.x} y={yEje + fsV * 1.45 + n.fila * fsV * 1.3} textAnchor="middle">
                {f4(n.v)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/** Where each measure falls: the datum by its place, or the row of the frequency table. */
function marcasDe(c) {
  const marcas = new Map();
  const poner = (p, nombre) => marcas.set(p, [...(marcas.get(p) ?? []), nombre]);
  poner(c.q1.posicion, 'q₁');
  c.me.posiciones.forEach((p) => poner(p, 'x̃'));
  poner(c.q3.posicion, 'q₃');
  return marcas;
}

function Orden({ c }) {
  const marcas = marcasDe(c);
  return (
    <ol className="ce-orden" aria-label="Los datos de menor a mayor, con su lugar">
      {c.orden.map((x, i) => {
        const m = marcas.get(i + 1);
        return (
          <li key={i} data-marca={m ? true : undefined}>
            {f4(x)}
            <small>{i + 1}</small>
            {m && <em className="ce-orden__nombre">{m.join(' ')}</em>}
          </li>
        );
      })}
    </ol>
  );
}

function Acumuladas({ c }) {
  const filas = frecuencias(c.orden);
  const porFila = new Map();
  for (const [p, nombres] of marcasDe(c)) {
    const i = filas.findIndex((f) => f.N >= p);
    porFila.set(i, [...new Set([...(porFila.get(i) ?? []), ...nombres])]);
  }
  const tabla = (
    <Desborde etiqueta="Las frecuencias acumuladas">
      <table className="tabla-pasos">
        <caption className="solo-lectores">Cada valor con su frecuencia absoluta, la acumulada y la medida que cae ahí</caption>
        <thead>
          <tr>
            <th scope="col">x</th>
            <th scope="col">n</th>
            <th scope="col">N</th>
            <th scope="col">Medida</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.x} className={porFila.has(i) ? 'ce-marcada' : undefined}>
              <th scope="row">{f4(f.x)}</th>
              <td>{f.n}</td>
              <td>{f.N}</td>
              <td className="ce-caja__medida">{porFila.get(i)?.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Desborde>
  );
  return filas.length > LARGA ? (
    <details className="calc-hoja__mas">
      <summary>{`Ver las ${filas.length} filas`}</summary>
      {tabla}
    </details>
  ) : (
    tabla
  );
}

/** How a quartile comes out: what share of n it has to accumulate and which datum (or row) does it first. */
function Cuartil({ q, cual, nombre, porTabla }) {
  const cuanto = coma(q.cuanto, 4);
  return (
    <>
      <p>
        {`El ${cual}% de los datos es ${cuanto}. `}
        {porTabla ? `El primer valor con N de ${cuanto} o más es ${f4(q.valor)}.` : `El primer dato que acumula por lo menos eso es el ${q.posicion}.°.`}
      </p>
      <Cuenta>{`${nombre} = ${f4(q.valor)}`}</Cuenta>
    </>
  );
}

function Bigotes({ c }) {
  const atipicos = c.atipicos.map(f4);
  if (!c.conRiq) {
    return (
      <>
        <p>Llegan al mínimo y al máximo.</p>
        <Cuenta>
          largo inferior = q₁ − <Sub sub="m" /> = {f4(c.q1.valor)} − {par(c.min)} = {f4(c.q1.valor - c.bInf)}
        </Cuenta>
        <Cuenta>
          largo superior = <Sub sub="M" /> − q₃ = {f4(c.max)} − {par(c.q3.valor)} = {f4(c.bSup - c.q3.valor)}
        </Cuenta>
      </>
    );
  }
  return (
    <>
      <Cuenta>{`q₁ − 1,5·riq = ${f4(c.q1.valor)} − 1,5·${f4(c.riq)} = ${f4(c.bajo)}`}</Cuenta>
      <Cuenta>{`q₃ + 1,5·riq = ${f4(c.q3.valor)} + 1,5·${f4(c.riq)} = ${f4(c.alto)}`}</Cuenta>
      <Cuenta>
        extremo inferior = máx{'{'}
        <Sub sub="m" />; q₁ − 1,5·riq{'}'} = {`máx{${f4(c.min)}; ${f4(c.bajo)}} = ${f4(c.bInf)}`}
      </Cuenta>
      <Cuenta>
        extremo superior = mín{'{'}
        <Sub sub="M" />; q₃ + 1,5·riq{'}'} = {`mín{${f4(c.max)}; ${f4(c.alto)}} = ${f4(c.bSup)}`}
      </Cuenta>
      <p>{!atipicos.length ? 'Ningún dato queda afuera.' : atipicos.length === 1 ? `Queda afuera ${atipicos[0]}, que es atípico.` : `Quedan afuera ${atipicos.slice(0, -1).join(', ')} y ${atipicos.at(-1)}, que son atípicos.`}</p>
      <Cuenta>{`largo inferior = ${f4(c.q1.valor)} − ${par(c.bInf)} = ${f4(c.q1.valor - c.bInf)}`}</Cuenta>
      <Cuenta>{`largo superior = ${f4(c.bSup)} − ${par(c.q3.valor)} = ${f4(c.bSup - c.q3.valor)}`}</Cuenta>
    </>
  );
}

function Resolucion({ datos, forma, bigotes }) {
  const c = caja(datos, { bigotes });
  const porTabla = forma === 'tabla' || c.n > 120;
  const lugares = c.me.posiciones.map((p) => `el ${p}.°`).join(' y ');
  const etiqueta = `Diagrama de caja de ${c.n} datos. Bigotes de ${f4(c.bInf)} a ${f4(c.bSup)}. La caja va de ${f4(c.q1.valor)} a ${f4(c.q3.valor)} con la mediana en ${f4(c.me.valor)}.${c.atipicos.length ? ` Atípicos ${c.atipicos.map(f4).join(', ')}.` : ''}`;
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Mínimo', valor: f4(c.min) },
          { nombre: 'Primer cuartil', valor: f4(c.q1.valor) },
          { nombre: 'Mediana', valor: f4(c.me.valor) },
          { nombre: 'Tercer cuartil', valor: f4(c.q3.valor) },
          { nombre: 'Máximo', valor: f4(c.max) },
          { nombre: 'Rango intercuartílico', valor: f4(c.riq) },
        ]}
        dicho={`Son ${c.n} datos. q₁ da ${f4(c.q1.valor)}, la mediana ${f4(c.me.valor)} y q₃ ${f4(c.q3.valor)}.`}
      >
        <DiagramaCaja c={c} etiqueta={etiqueta} />
      </Fichas>
      <Pasos>
        <Paso titulo={porTabla ? 'Las frecuencias acumuladas' : `Los ${c.n} datos, en orden`}>
          {porTabla ? <Acumuladas c={c} /> : <Orden c={c} />}
        </Paso>
        <Paso titulo="El primer cuartil">
          <Cuartil q={c.q1} cual={25} nombre="q₁" porTabla={porTabla} />
        </Paso>
        <Paso titulo="La mediana">
          <p>{`Con n = ${c.n} ${c.n % 2 ? 'impar, es el dato del medio' : 'par, se promedian los dos del medio'}, ${lugares}.`}</p>
          <Cuenta>
            {c.me.posiciones.length === 2 ? (
              <>
                x̃ = <Frac arriba={`${f4(c.orden[c.me.posiciones[0] - 1])} + ${f4(c.orden[c.me.posiciones[1] - 1])}`} abajo="2" /> = {f4(c.me.valor)}
              </>
            ) : (
              `x̃ = ${f4(c.me.valor)}`
            )}
          </Cuenta>
        </Paso>
        <Paso titulo="El tercer cuartil">
          <Cuartil q={c.q3} cual={75} nombre="q₃" porTabla={porTabla} />
        </Paso>
        <Paso titulo="El rango intercuartílico">
          <Cuenta>{`riq = q₃ − q₁ = ${f4(c.q3.valor)} − ${par(c.q1.valor)} = ${f4(c.riq)}`}</Cuenta>
          <p>Es el largo de la caja. El largo total es el rango.</p>
          <Cuenta>
            r = <Sub sub="M" /> − <Sub sub="m" /> = {f4(c.max)} − {par(c.min)} = {f4(c.rango)}
          </Cuenta>
        </Paso>
        <Paso titulo="Los bigotes">
          <Bigotes c={c} />
        </Paso>
      </Pasos>
    </Hoja>
  );
}

export default function Caja() {
  const [estado, setEstado] = useRecordado('calc:caja', EJEMPLOS[0].datos);
  const { bigotes = 'extremos', ...datos } = estado;
  const leida = leerMuestra(datos, { minimo: 4 });
  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <DatosMuestra valor={datos} alCambiar={(d) => setEstado({ ...d, bigotes })} leida={leida} />
          <Opciones leyenda="Los bigotes" nombre="bigotes" opciones={BIGOTES} valor={bigotes} alCambiar={(b) => setEstado({ ...datos, bigotes: b })} chica />
          {bigotes === 'riq' && <p className="campo__ayuda">La regla de 1,5 riq no está en el apunte de la cátedra. Preguntá cuál usa tu comisión.</p>}
        </div>
        <Ejemplos ejemplos={EJEMPLOS} alElegir={(e) => setEstado(e.datos)} />
      </section>

      {leida.datos && <Resolucion datos={leida.datos} forma={datos.forma} bigotes={bigotes} />}
    </>
  );
}
