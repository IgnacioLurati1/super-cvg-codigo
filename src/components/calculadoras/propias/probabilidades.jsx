import { coma, entreParentesis as par, leerNumero } from '../../../lib/calculadoras/cifras';
import { CAMPOS, combinatorio, continua, discreta, fiNormal, MODELOS, revisarCampo } from '../../../lib/calculadoras/distribuciones';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos } from '../Hoja';
import { Comb, Cuenta, Fichas, Frac } from './_est-cuentas';
import { Curva, Grafico, GraficoBastones, Relleno, Vertical } from './_est-dibujo';
import { Dato, Datos } from './_est-tiza';

// Distribuciones of Probabilidad y Estadística: the model and its parameters on the board, and what to calculate; on
// the sheet the probability with the formula of the notes and the numbers in it, the sticks or the density with the
// asked part marked, and E and V. Binomial, Hipergeométrica and Poisson as V.A.D., pág. 8 to 13; Normal (standardized,
// as the table is read), Exponencial and Uniforme as V.A.C., pág. 5 to 11; t de Student and chi-cuadrado as the
// intervals use them (Material 5, pág. 15 and 16). All in El Santo Resumen probabilidad-y-estadistica/parcial-2.md
// and parcial-3.md.

const LISTA = ['binomial', 'hipergeometrica', 'poisson', 'normal', 'exponencial', 'uniforme', 'student', 'chi'];
const OPCIONES_MODELO = LISTA.map((v) => ({ valor: v, texto: MODELOS[v].nombre }));

const NOMBRES = { n: 'Ensayos', pi: 'Probabilidad de éxito', N: 'Tamaño del lote', r: 'Defectuosos en el lote', m: 'Tamaño de la muestra', lam: 'Promedio de eventos', mu: 'Media', sig: 'Desvío', a: 'Extremo izquierdo', b: 'Extremo derecho', g: 'Grados de libertad' };
const nombreCampo = (modelo, clave) => (modelo === 'exponencial' && clave === 'lam' ? 'Parámetro' : NOMBRES[clave]);

/** The value's letter: x for X, t for T, and x for χ². */
const letraDe = (modelo) => (MODELOS[modelo].variable === 'T' ? 't' : 'x');

// Each model starts with an example of the notes. The Hipergeométrica has none in the notes: it starts with the one
// El Santo Resumen made up.
const INICIO = {
  binomial: { n: '5', pi: '0,2', que: 'igual', k: '2' },
  hipergeometrica: { N: '20', r: '5', m: '4', que: 'igual', k: '1' },
  poisson: { lam: '5', que: 'igual', k: '2' },
  normal: { mu: '10', sig: '1,6', que: 'mayor', x: '12,05', x2: '', p: '0,9' },
  exponencial: { lam: '0,2', que: 'menor', x: '4', x2: '', p: '0,5' },
  uniforme: { a: '1', b: '3', que: 'entre', x: '1,25', x2: '2,25', p: '0,5' },
  student: { g: '119', que: 'percentil', x: '', x2: '', p: '0,995' },
  chi: { g: '119', que: 'percentil', x: '', x2: '', p: '0,995' },
};

export const EJEMPLOS = {
  binomial: [{ nombre: 'Cinco personas', datos: { n: '5', pi: '0,2', que: 'igual', k: '2' } }],
  poisson: [
    { nombre: 'Llamadas', datos: { lam: '5', que: 'igual', k: '2' } },
    { nombre: 'Caídas en 10 horas', datos: { lam: '0,4', que: 'igual', k: '1' } },
    { nombre: 'Caídas en un día', datos: { lam: '0,96', que: 'igual', k: '0' } },
    { nombre: 'Caídas en 4 horas', datos: { lam: '0,16', que: 'desde', k: '1' } },
  ],
  normal: [
    { nombre: 'El ordenador', datos: { mu: '10', sig: '1,6', que: 'mayor', x: '12,05' } },
    { nombre: 'Percentil 0,90', datos: { mu: '10', sig: '1,6', que: 'percentil', p: '0,9' } },
  ],
  exponencial: [
    { nombre: 'Interrupciones', datos: { lam: '0,2', que: 'menor', x: '4' } },
    { nombre: 'Fusibles', datos: { lam: '0,25', que: 'mayor', x: '3' } },
  ],
  uniforme: [{ nombre: 'Área de un rectángulo', datos: { a: '1', b: '3', que: 'entre', x: '1,25', x2: '2,25' } }],
  student: [{ nombre: 'Intervalo del 99%', datos: { g: '119', que: 'percentil', p: '0,995' } }],
  chi: [
    { nombre: 'Intervalo del 99%, arriba', datos: { g: '119', que: 'percentil', p: '0,995' } },
    { nombre: 'Intervalo del 99%, abajo', datos: { g: '119', que: 'percentil', p: '0,005' } },
  ],
};

const f4 = (x) => coma(x, 4);
/** Small numbers with four significant figures, so 0,2¹⁰ doesn't read as 0. */
const cifra = (x) => (x === 0 || !Number.isFinite(x) ? coma(x) : coma(x, Math.min(10, Math.max(4, Math.ceil(-Math.log10(Math.abs(x))) + 3))));
const LARGA = 25;

function opcionesQue(modelo) {
  const v = MODELOS[modelo].variable;
  if (MODELOS[modelo].discreta) {
    return [
      { valor: 'igual', texto: `P(${v} = k)` },
      { valor: 'hasta', texto: `P(${v} ≤ k)` },
      { valor: 'desde', texto: `P(${v} ≥ k)` },
    ];
  }
  const l = letraDe(modelo);
  return [
    { valor: 'menor', texto: `P(${v} < ${l})` },
    { valor: 'mayor', texto: `P(${v} > ${l})` },
    { valor: 'entre', texto: `P(${l}₁ < ${v} < ${l}₂)` },
    { valor: 'percentil', texto: 'Percentil' },
  ];
}

/** Reads every field of the model and of what is asked. { d, pedido } or the errors by field and a general one. */
function leer(modelo, v) {
  const M = MODELOS[modelo];
  const errores = {};
  const d = {};
  const numero = (clave, simbolo) => {
    const r = leerNumero(v[clave] ?? '');
    if (r.falta) errores[clave] = `Falta ${simbolo}.`;
    else if (r.mal) errores[clave] = `«${String(v[clave]).trim()}» no es un número.`;
    return r.valor;
  };
  for (const clave of M.campos) {
    const valor = numero(clave, CAMPOS[clave].simbolo);
    if (errores[clave]) continue;
    const mal = revisarCampo(clave, valor);
    if (mal) errores[clave] = mal;
    else d[clave] = valor;
  }
  const pedido = { que: v.que };
  const l = letraDe(modelo);
  if (M.discreta) {
    const k = numero('k', 'k');
    if (!errores.k) {
      const mal = revisarCampo('k', k);
      if (mal) errores.k = mal;
      else pedido.k = k;
    }
  } else if (v.que === 'percentil') {
    const p = numero('p', 'p');
    if (!errores.p && !(p > 0 && p < 1)) errores.p = 'p va entre 0 y 1, sin incluirlos.';
    pedido.p = p;
  } else {
    pedido.x = numero('x', v.que === 'entre' ? `${l}₁` : l);
    if (v.que === 'entre') {
      pedido.x2 = numero('x2', `${l}₂`);
      if (!errores.x && !errores.x2 && !(pedido.x2 > pedido.x)) errores.x2 = `${l}₂ tiene que ser mayor que ${l}₁.`;
    }
  }
  if (Object.keys(errores).length) return { errores };
  const general = M.revisar?.(d);
  if (general) return { errores: {}, general };
  return { d, pedido };
}

/** P(X = k) of a discrete model, with the formula of the notes and, when they are readable, its numbers. */
function Puntual({ modelo, d, k }) {
  if (modelo === 'binomial') {
    const c = combinatorio(d.n, k);
    const a = d.pi ** k;
    const b = (1 - d.pi) ** (d.n - k);
    const valor = k > d.n ? 0 : c * a * b;
    return (
      <Cuenta>
        P(X = {k}) = <Comb n={d.n} k={k} />·{coma(d.pi)}
        <sup>{k}</sup>·{coma(1 - d.pi)}
        <sup>{d.n - k}</sup>
        {k <= d.n && c < 1e12 && a > 1e-6 && b > 1e-6 && ` = ${coma(c)}·${cifra(a)}·${cifra(b)}`} = {cifra(valor)}
      </Cuenta>
    );
  }
  if (modelo === 'hipergeometrica') {
    const arriba1 = combinatorio(d.r, k);
    const arriba2 = combinatorio(d.N - d.r, d.m - k);
    const abajo = combinatorio(d.N, d.m);
    const valor = MODELOS.hipergeometrica.pmf(d)(k);
    const legibles = valor > 0 && abajo < 1e12;
    return (
      <Cuenta>
        P(X = {k}) ={' '}
        <Frac
          arriba={
            <>
              <Comb n={d.r} k={k} />
              <Comb n={d.N - d.r} k={d.m - k} />
            </>
          }
          abajo={<Comb n={d.N} k={d.m} />}
        />
        {legibles && (
          <>
            {' = '}
            <Frac arriba={`${coma(arriba1)}·${coma(arriba2)}`} abajo={coma(abajo)} />
          </>
        )}{' '}
        = {cifra(valor)}
      </Cuenta>
    );
  }
  const e = Math.exp(-d.lam);
  const potencia = d.lam ** k;
  const valor = MODELOS.poisson.pmf(d)(k);
  let factorial = 1;
  for (let i = 2; i <= k; i += 1) factorial *= i;
  return (
    <Cuenta>
      P(X = {k}) ={' '}
      <Frac
        arriba={
          <>
            e<sup>−{coma(d.lam)}</sup>·{coma(d.lam)}
            <sup>{k}</sup>
          </>
        }
        abajo={`${k}!`}
      />
      {k <= 15 && e > 1e-6 && (
        <>
          {' = '}
          <Frac arriba={`${cifra(e)}·${cifra(potencia)}`} abajo={coma(factorial)} />
        </>
      )}{' '}
      = {cifra(valor)}
    </Cuenta>
  );
}

/** The general term, with the parameters in it and i free. */
function Termino({ modelo, d }) {
  if (modelo === 'binomial') {
    return (
      <Cuenta>
        P(X = i) = <Comb n={d.n} k="i" />·{coma(d.pi)}
        <sup>i</sup>·{coma(1 - d.pi)}
        <sup>{d.n} − i</sup>
      </Cuenta>
    );
  }
  if (modelo === 'hipergeometrica') {
    return (
      <Cuenta>
        P(X = i) ={' '}
        <Frac
          arriba={
            <>
              <Comb n={d.r} k="i" />
              <Comb n={d.N - d.r} k={`${d.m} − i`} />
            </>
          }
          abajo={<Comb n={d.N} k={d.m} />}
        />
      </Cuenta>
    );
  }
  return (
    <Cuenta>
      P(X = i) ={' '}
      <Frac
        arriba={
          <>
            e<sup>−{coma(d.lam)}</sup>·{coma(d.lam)}
            <sup>i</sup>
          </>
        }
        abajo="i!"
      />
    </Cuenta>
  );
}

function General({ modelo }) {
  if (modelo === 'binomial') {
    return (
      <Cuenta>
        P(X = k) = <Comb n="n" k="k" />·π<sup>k</sup>·(1 − π)<sup>n − k</sup>
      </Cuenta>
    );
  }
  if (modelo === 'hipergeometrica') {
    return (
      <Cuenta>
        P(X = k) ={' '}
        <Frac
          arriba={
            <>
              <Comb n="r" k="k" />
              <Comb n="N − r" k="n − k" />
            </>
          }
          abajo={<Comb n="N" k="n" />}
        />
      </Cuenta>
    );
  }
  return (
    <Cuenta>
      P(X = k) ={' '}
      <Frac
        arriba={
          <>
            e<sup>−λ</sup>·λ<sup>k</sup>
          </>
        }
        abajo="k!"
      />
    </Cuenta>
  );
}

function EsperanzaVarianza({ modelo, d }) {
  const M = MODELOS[modelo];
  const E = M.esperanza(d);
  const V = M.varianza(d);
  const v = M.variable;
  switch (modelo) {
    case 'binomial':
      return (
        <>
          <Cuenta>{`E(X) = n·π = ${d.n}·${coma(d.pi)} = ${f4(E)}`}</Cuenta>
          <Cuenta>{`V(X) = n·π·(1 − π) = ${d.n}·${coma(d.pi)}·${coma(1 - d.pi)} = ${f4(V)}`}</Cuenta>
        </>
      );
    case 'hipergeometrica': {
      const pi = d.r / d.N;
      return (
        <>
          <Cuenta>
            π = <Frac arriba="r" abajo="N" /> = <Frac arriba={d.r} abajo={d.N} /> = {f4(pi)}
          </Cuenta>
          <Cuenta>{`E(X) = n·π = ${d.m}·${f4(pi)} = ${f4(E)}`}</Cuenta>
          <Cuenta>
            V(X) = n·π·(1 − π)·
            <Frac arriba="N − n" abajo="N − 1" /> = {d.m}·{f4(pi)}·{f4(1 - pi)}·
            <Frac arriba={d.N - d.m} abajo={d.N - 1} /> = {f4(V)}
          </Cuenta>
        </>
      );
    }
    case 'poisson':
      return <Cuenta>{`E(X) = V(X) = λ = ${coma(d.lam)}`}</Cuenta>;
    case 'normal':
      return (
        <>
          <Cuenta>{`E(X) = μ = ${coma(d.mu)}`}</Cuenta>
          <Cuenta>
            V(X) = σ<sup>2</sup> = {coma(d.sig)}
            <sup>2</sup> = {f4(V)}
          </Cuenta>
        </>
      );
    case 'exponencial':
      return (
        <>
          <Cuenta>
            E(T) = <Frac arriba="1" abajo="λ" /> = <Frac arriba="1" abajo={coma(d.lam)} /> = {f4(E)}
          </Cuenta>
          <Cuenta>
            V(T) ={' '}
            <Frac
              arriba="1"
              abajo={
                <>
                  λ<sup>2</sup>
                </>
              }
            />{' '}
            ={' '}
            <Frac
              arriba="1"
              abajo={
                <>
                  {coma(d.lam)}
                  <sup>2</sup>
                </>
              }
            />{' '}
            = {f4(V)}
          </Cuenta>
        </>
      );
    default:
      return (
        <>
          <Cuenta>
            E({v}) = <Frac arriba="a + b" abajo="2" /> = <Frac arriba={`${coma(d.a)} + ${par(d.b)}`} abajo="2" /> = {f4(E)}
          </Cuenta>
          <Cuenta>
            V({v}) ={' '}
            <Frac
              arriba={
                <>
                  (b − a)<sup>2</sup>
                </>
              }
              abajo="12"
            />{' '}
            ={' '}
            <Frac
              arriba={
                <>
                  ({coma(d.b)} − {par(d.a)})<sup>2</sup>
                </>
              }
              abajo="12"
            />{' '}
            = {f4(V)}
          </Cuenta>
        </>
      );
  }
}

function ResolucionDiscreta({ modelo, d, pedido }) {
  const { que, k } = pedido;
  const r = discreta(modelo, d, que, k);
  const v = MODELOS[modelo].variable;
  const signo = { igual: '=', hasta: '≤', desde: '≥' }[que];
  const pregunta = `P(${v} ${signo} ${k})`;
  const marcado = (i) => (que === 'igual' ? i === k : que === 'hasta' ? i <= k : i >= k);
  const titulo = { binomial: `Binomial con n = ${d.n} y π = ${coma(d.pi)}`, hipergeometrica: `Hipergeométrica con N = ${d.N}, r = ${d.r} y n = ${d.m}`, poisson: `Poisson con λ = ${coma(d.lam)}` }[modelo];
  const tabla = (
    <Desborde etiqueta="Los términos de la suma">
      <table className="tabla-pasos">
        <caption className="solo-lectores">Cada valor de la suma con su probabilidad, y el total</caption>
        <thead>
          <tr>
            <th scope="col">i</th>
            <th scope="col">P(X = i)</th>
          </tr>
        </thead>
        <tbody>
          {r.terminos.map((t) => (
            <tr key={t.i}>
              <th scope="row">{t.i}</th>
              <td>{cifra(t.p)}</td>
            </tr>
          ))}
          <tr className="ce-suma">
            <th scope="row">Σ</th>
            <td>{f4(que === 'desde' ? r.complemento : r.valor)}</td>
          </tr>
        </tbody>
      </table>
    </Desborde>
  );
  const sumas = r.terminos.length > LARGA ? (
    <details className="calc-hoja__mas">
      <summary>{`Ver los ${r.terminos.length} términos`}</summary>
      {tabla}
    </details>
  ) : (
    tabla
  );
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Probabilidad', valor: `${pregunta} = ${f4(r.valor)}`, principal: true },
          { nombre: 'Esperanza', valor: `E(X) = ${f4(r.esperanza)}` },
          { nombre: 'Varianza', valor: `V(X) = ${f4(r.varianza)}` },
        ]}
        dicho={`${pregunta} da ${f4(r.valor)}.`}
      >
        <GraficoBastones
          puntos={r.tabla.map((t) => ({ x: t.i, y: t.p, marcado: marcado(t.i) }))}
          esperanza={r.esperanza}
          etiqueta={`Bastones de la ${titulo}. Están marcados los que suman ${pregunta}, que da ${f4(r.valor)}.`}
        />
      </Fichas>
      <Pasos>
        <Paso titulo="La fórmula">
          <General modelo={modelo} />
          {que === 'igual' ? <Puntual modelo={modelo} d={d} k={k} /> : <Termino modelo={modelo} d={d} />}
        </Paso>
        {que === 'hasta' && (
          <Paso titulo="La suma">
            <Cuenta>{`${pregunta} = Σ P(X = i), con i hasta ${k}`}</Cuenta>
            {sumas}
            <Cuenta>{`${pregunta} = ${f4(r.valor)}`}</Cuenta>
          </Paso>
        )}
        {que === 'desde' && (
          <Paso titulo="El complemento">
            {k <= 0 ? (
              <Cuenta>{`${pregunta} = 1`}</Cuenta>
            ) : (
              <>
                <Cuenta>{`${pregunta} = 1 − P(X ≤ ${k - 1})`}</Cuenta>
                {r.terminos.length > 0 && sumas}
                <Cuenta>{`${pregunta} = 1 − ${f4(r.complemento)} = ${f4(r.valor)}`}</Cuenta>
              </>
            )}
          </Paso>
        )}
        <Paso titulo="La esperanza y la varianza">
          <EsperanzaVarianza modelo={modelo} d={d} />
        </Paso>
      </Pasos>
    </Hoja>
  );
}

/** F at one value, with the formula of the model and the value in it. */
function Acumulada({ modelo, d, x }) {
  const F = MODELOS[modelo].F(d)(x);
  if (modelo === 'exponencial') {
    if (x <= 0) return <Cuenta>{`F(${coma(x)}) = 0`}</Cuenta>;
    return (
      <Cuenta>
        F({coma(x)}) = 1 − e<sup>−{coma(d.lam)}·{coma(x)}</sup> = 1 − {f4(Math.exp(-d.lam * x))} = {f4(F)}
      </Cuenta>
    );
  }
  if (modelo === 'uniforme') {
    if (x <= d.a) return <Cuenta>{`F(${coma(x)}) = 0`}</Cuenta>;
    if (x >= d.b) return <Cuenta>{`F(${coma(x)}) = 1`}</Cuenta>;
    return (
      <Cuenta>
        F({coma(x)}) = <Frac arriba={`${coma(x)} − ${par(d.a)}`} abajo={`${coma(d.b)} − ${par(d.a)}`} /> = {f4(F)}
      </Cuenta>
    );
  }
  return <Cuenta>{`F(${coma(x)}) = P(${MODELOS[modelo].variable} < ${coma(x)}) = ${f4(F)}`}</Cuenta>;
}

function FormulaAcumulada({ modelo }) {
  if (modelo === 'exponencial') {
    return (
      <Cuenta>
        F(t) = P(T &lt; t) = 1 − e<sup>−λ·t</sup>
      </Cuenta>
    );
  }
  return (
    <Cuenta>
      F(x) = <Frac arriba="x − a" abajo="b − a" />, con a &lt; x &lt; b
    </Cuenta>
  );
}

function ResolucionContinua({ modelo, d, pedido }) {
  const M = MODELOS[modelo];
  const { que } = pedido;
  const r = continua(modelo, d, que, pedido);
  const v = M.variable;
  const l = letraDe(modelo);
  const normal = modelo === 'normal';
  const tabla = modelo === 'student' || modelo === 'chi';
  const percentil = que === 'percentil';
  const pregunta = {
    menor: `P(${v} < ${coma(pedido.x)})`,
    mayor: `P(${v} > ${coma(pedido.x)})`,
    entre: `P(${coma(pedido.x)} < ${v} < ${coma(pedido.x2)})`,
  }[que];
  const nombreTabla = modelo === 'student' ? 'la t de Student' : 'la chi-cuadrado';
  const simboloPercentil =
    modelo === 'student' ? (
      <>
        t<sub>{`${d.g}; ${coma(pedido.p)}`}</sub>
      </>
    ) : modelo === 'chi' ? (
      <>
        χ<sup>2</sup>
        <sub>{`${d.g}; ${coma(pedido.p)}`}</sub>
      </>
    ) : (
      l
    );
  const dichoPercentil = `El valor que acumula ${coma(pedido.p)} es ${f4(r.valor)}.`;

  // The drawing: the density over its support, widened to show the values asked, with the asked area marked.
  const f = M.densidad(d);
  let [x0, x1] = M.soporte(d);
  const vistos = percentil ? [r.valor] : [pedido.x, pedido.x2].filter((w) => w !== undefined);
  for (const w of vistos) {
    const margen = (x1 - x0) * 0.08;
    if (w < x0) x0 = w - margen;
    if (w > x1) x1 = w + margen;
  }
  let tope = 0;
  for (let i = 1; i <= 200; i += 1) {
    const y = f(x0 + ((x1 - x0) * i) / 201);
    if (Number.isFinite(y) && y > tope) tope = y;
  }
  const [desde, hasta] = percentil ? [x0, r.valor] : que === 'menor' ? [x0, pedido.x] : que === 'mayor' ? [pedido.x, x1] : [pedido.x, pedido.x2];
  const etiqueta = `Densidad de ${v}, con el área ${percentil ? `que acumula ${coma(pedido.p)} hasta ${f4(r.valor)}` : `de ${pregunta}, que da ${f4(r.valor)}`} marcada.`;

  const fichas = [
    percentil
      ? { nombre: `Percentil ${coma(pedido.p)}`, valor: <>{simboloPercentil} = {f4(r.valor)}</>, principal: true }
      : { nombre: 'Probabilidad', valor: `${pregunta} = ${f4(r.valor)}`, principal: true },
    ...(r.esperanza !== undefined ? [{ nombre: 'Esperanza', valor: `E(${v}) = ${f4(r.esperanza)}` }, { nombre: 'Varianza', valor: `V(${v}) = ${f4(r.varianza)}` }] : []),
  ];

  let pasoCalculo;
  if (tabla) {
    pasoCalculo = (
      <Paso titulo="De la tabla">
        <p>{`Sale de la tabla de ${nombreTabla}, con ${d.g} grados de libertad.`}</p>
        {percentil ? (
          <Cuenta>
            {simboloPercentil} = {f4(r.valor)}
          </Cuenta>
        ) : que === 'entre' ? (
          <Cuenta>{`${pregunta} = F(${coma(pedido.x2)}) − F(${coma(pedido.x)}) = ${f4(r.F2)} − ${f4(r.F1)} = ${f4(r.valor)}`}</Cuenta>
        ) : (
          <Cuenta>{`${pregunta} = ${que === 'mayor' ? `1 − F(${coma(pedido.x)}) = 1 − ${f4(r.F)} = ` : ''}${f4(r.valor)}`}</Cuenta>
        )}
      </Paso>
    );
  } else if (normal && percentil) {
    pasoCalculo = (
      <>
        <Paso titulo="El percentil de Z">
          <Cuenta>
            z<sub>{coma(pedido.p)}</sub> = {f4(r.z)}
          </Cuenta>
          <p>Sale de la tabla de la Normal estándar.</p>
        </Paso>
        <Paso titulo="Volver a X">
          <Cuenta>
            x = μ + z<sub>{coma(pedido.p)}</sub>·σ = {coma(d.mu)} + {par(r.z)}·{coma(d.sig)} = {f4(r.valor)}
          </Cuenta>
        </Paso>
      </>
    );
  } else if (normal) {
    const zs = que === 'entre' ? [r.z1, r.z2] : [r.z];
    const xs = que === 'entre' ? [pedido.x, pedido.x2] : [pedido.x];
    const tablaZ = (z) => fiNormal(Math.round(z * 100) / 100);
    const conTabla = que === 'entre' ? tablaZ(r.z2) - tablaZ(r.z1) : que === 'mayor' ? 1 - tablaZ(r.z) : tablaZ(r.z);
    pasoCalculo = (
      <>
        <Paso titulo="Estandarizar">
          {zs.map((z, i) => (
            <Cuenta key={i}>
              z{zs.length > 1 ? (i ? '₂' : '₁') : ''} = <Frac arriba="x − μ" abajo="σ" /> = <Frac arriba={`${coma(xs[i])} − ${par(d.mu)}`} abajo={coma(d.sig)} /> = {f4(z)}
            </Cuenta>
          ))}
        </Paso>
        <Paso titulo="La probabilidad">
          {que === 'menor' && <Cuenta>{`${pregunta} = P(Z < ${f4(r.z)}) = ${f4(r.valor)}`}</Cuenta>}
          {que === 'mayor' && <Cuenta>{`${pregunta} = P(Z > ${f4(r.z)}) = 1 − P(Z < ${f4(r.z)}) = 1 − ${f4(fiNormal(r.z))} = ${f4(r.valor)}`}</Cuenta>}
          {que === 'entre' && <Cuenta>{`${pregunta} = P(${f4(r.z1)} < Z < ${f4(r.z2)}) = P(Z < ${f4(r.z2)}) − P(Z < ${f4(r.z1)}) = ${f4(r.F2)} − ${f4(r.F1)} = ${f4(r.valor)}`}</Cuenta>}
          <p className="calc-hoja__nota">{`Con la tabla, z se redondea a dos decimales y da ${f4(conTabla)}.`}</p>
        </Paso>
      </>
    );
  } else if (percentil) {
    pasoCalculo = (
      <Paso titulo="Despejar">
        <FormulaAcumulada modelo={modelo} />
        {modelo === 'exponencial' ? (
          <Cuenta>
            t = <Frac arriba={`−ln(1 − ${coma(pedido.p)})`} abajo={coma(d.lam)} /> = {f4(r.valor)}
          </Cuenta>
        ) : (
          <Cuenta>{`x = a + p·(b − a) = ${coma(d.a)} + ${coma(pedido.p)}·(${coma(d.b)} − ${par(d.a)}) = ${f4(r.valor)}`}</Cuenta>
        )}
      </Paso>
    );
  } else {
    pasoCalculo = (
      <Paso titulo="La acumulada">
        <FormulaAcumulada modelo={modelo} />
        <Acumulada modelo={modelo} d={d} x={pedido.x} />
        {que === 'entre' && <Acumulada modelo={modelo} d={d} x={pedido.x2} />}
        {que === 'menor' && <Cuenta>{`${pregunta} = F(${coma(pedido.x)}) = ${f4(r.valor)}`}</Cuenta>}
        {que === 'mayor' && <Cuenta>{`${pregunta} = 1 − F(${coma(pedido.x)}) = ${f4(r.valor)}`}</Cuenta>}
        {que === 'entre' && <Cuenta>{`${pregunta} = F(${coma(pedido.x2)}) − F(${coma(pedido.x)}) = ${f4(r.F2)} − ${f4(r.F1)} = ${f4(r.valor)}`}</Cuenta>}
      </Paso>
    );
  }

  return (
    <Hoja>
      <Fichas fichas={fichas} dicho={percentil ? dichoPercentil : `${pregunta} da ${f4(r.valor)}.`}>
        <Grafico etiqueta={etiqueta} alto={230} x={[x0, x1]} y={[0, tope * 1.15]} nombreX={l} nombreY={`f(${l})`}>
          {(e) => (
            <>
              <Relleno e={e} f={f} desde={desde} hasta={hasta} />
              <Curva e={e} f={f} />
              {percentil ? (
                <Vertical e={e} x={r.valor} texto={`${l} = ${f4(r.valor)}`} />
              ) : (
                vistos.map((w, i) => <Vertical key={i} e={e} x={w} texto={`${vistos.length > 1 ? `${l}${i ? '₂' : '₁'}` : l} = ${coma(w)}`} fila={i} />)
              )}
            </>
          )}
        </Grafico>
      </Fichas>
      <Pasos>
        {pasoCalculo}
        {r.esperanza !== undefined && (
          <Paso titulo="La esperanza y la varianza">
            <EsperanzaVarianza modelo={modelo} d={d} />
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

export default function Probabilidades() {
  const [guardado, setEstado] = useRecordado('calc:probabilidades', { modelo: 'binomial', datos: {} });
  const modelo = LISTA.includes(guardado.modelo) ? guardado.modelo : 'binomial';
  const valores = { ...INICIO[modelo], ...guardado.datos?.[modelo] };
  const M = MODELOS[modelo];
  const cambiar = (cambio) => setEstado({ modelo, datos: { ...guardado.datos, [modelo]: { ...valores, ...cambio } } });
  const leido = leer(modelo, valores);
  const errores = leido.errores ?? {};
  const l = letraDe(modelo);
  const que = valores.que;
  const ejemplos = EJEMPLOS[modelo] ?? [];

  const campo = (clave, nombre, simbolo, extra = {}) => (
    <Dato key={clave} nombre={nombre} simbolo={simbolo} valor={valores[clave] ?? ''} alCambiar={(t) => cambiar({ [clave]: t })} error={errores[clave]} modo={extra.modo ?? 'decimal'} />
  );

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="El modelo" nombre="modelo" opciones={OPCIONES_MODELO} valor={modelo} alCambiar={(m) => setEstado({ ...guardado, modelo: m })} chica />
          <div className="ce-dos">
            <Datos titulo="Los parámetros">{M.campos.map((clave) => campo(clave, nombreCampo(modelo, clave), CAMPOS[clave].simbolo, { modo: CAMPOS[clave].entero ? 'numeric' : 'decimal' }))}</Datos>
            <div>
              <Opciones leyenda="Qué calcular" nombre="que" opciones={opcionesQue(modelo)} valor={que} alCambiar={(q) => cambiar({ que: q })} chica />
              <Datos>
                {M.discreta && campo('k', 'Valor', 'k', { modo: 'numeric' })}
                {!M.discreta && que === 'percentil' && campo('p', 'Probabilidad acumulada', 'p')}
                {!M.discreta && (que === 'menor' || que === 'mayor') && campo('x', 'Valor', l)}
                {!M.discreta && que === 'entre' && [campo('x', 'Desde', `${l}₁`), campo('x2', 'Hasta', `${l}₂`)]}
              </Datos>
            </div>
          </div>
          {leido.general && (
            <p className="campo__error" role="alert">
              {leido.general}
            </p>
          )}
        </div>
        {ejemplos.length > 0 && <Ejemplos ejemplos={ejemplos} alElegir={(e) => cambiar(e.datos)} />}
      </section>

      {leido.d && (M.discreta ? <ResolucionDiscreta modelo={modelo} d={leido.d} pedido={leido.pedido} /> : <ResolucionContinua modelo={modelo} d={leido.d} pedido={leido.pedido} />)}
    </>
  );
}
