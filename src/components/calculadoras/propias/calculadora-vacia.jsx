import { coma, entreParentesis as par, leerLista, leerNumero } from '../../../lib/calculadoras/cifras';
import { fiNormal } from '../../../lib/calculadoras/distribuciones';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { subindice } from '../../../lib/calculadoras/pruebaEscritorio';
import { basico, escalon, excedente, financiera, ingreso, periodo, seguridad } from '../../../lib/calculadoras/stocks';
import { Desborde, Ejemplos, Hoja, Opciones, Paso, Pasos } from '../Hoja';
import { Cuenta, Fichas, Frac, Raiz } from './_est-cuentas';
import { Curva, Grafico, Horizontal, Punto, Referencias, Relleno, Vertical } from './_est-dibujo';
import { Dato, Datos, leerFilas, TablaTiza } from './_est-tiza';

// Gestión de stocks of Investigación Operativa: the model and its data on the board, and on the sheet the lot, the
// cost and the period with the formulas of the notes and the numbers in them, the decision of each discount as the
// notes' procedure says it, and the drawing of the cost. Models and examples of the apunte de Gestión de Stocks, págs.
// 10 to 44 (El Santo Resumen, investigacion-operativa/parcial-3.md); the fields, the ones of its calculator.

const MODELOS = {
  basico: { nombre: 'Básico', campos: ['D', 'L', 'C', 'i', 'LT', 'Tc'] },
  ingreso: { nombre: 'Consumo durante el ingreso', campos: ['D', 'V', 'L', 'C', 'i', 'LT', 'Tc'] },
  escalon: { nombre: 'Un escalón', campos: ['D', 'L', 'i', 'C1', 'C2', 'a', 'LT'] },
  excedente: { nombre: 'Cantidad excedente', campos: ['D', 'L', 'i', 'C1', 'C2', 'a', 'LT'] },
  periodo: { nombre: 'Período común', campos: ['C', 'L', 'S', 'Tc'] },
  financiera: { nombre: 'Restricción financiera', campos: ['i', 'I0'] },
  seguridad: { nombre: 'Stock de seguridad', campos: ['media', 'desvio', 'LT', 'z'] },
};
const OPCIONES = Object.entries(MODELOS).map(([valor, m]) => ({ valor, texto: m.nombre }));

const CAMPO = {
  D: { simbolo: 'D', nombre: 'Demanda' },
  V: { simbolo: 'V', nombre: 'Velocidad de ingreso' },
  L: { simbolo: 'L', nombre: 'Costo fijo de la orden' },
  C: { simbolo: 'C', nombre: 'Costo unitario' },
  i: { simbolo: 'i', nombre: 'Tasa de mantenimiento' },
  LT: { simbolo: 'LT', nombre: 'Plazo de provisión', opcional: true, cero: true },
  Tc: { simbolo: 'Tc', nombre: 'Período corregido', opcional: true },
  C1: { simbolo: 'C₁', nombre: 'Precio sin descuento' },
  C2: { simbolo: 'C₂', nombre: 'Precio con descuento' },
  a: { simbolo: 'a', nombre: 'Cantidad del descuento' },
  S: { simbolo: 'S', nombre: 'Suma de δⱼ·Dⱼ' },
  I0: { simbolo: 'I₀', nombre: 'Tope de inversión' },
  media: { simbolo: 'D̄', nombre: 'Demanda media por período', di: 'la demanda media' },
  desvio: { simbolo: <>S<sub>D</sub></>, nombre: 'Desvío por período', di: 'el desvío', cero: true },
  z: { simbolo: 'z', nombre: 'Factor de seguridad', cero: true },
};
/** The same field named as the model uses it. */
const campoDe = (modelo, clave) => {
  if (modelo === 'periodo' && clave === 'C') return { ...CAMPO.C, nombre: 'Suma de Cⱼ·Dⱼ' };
  if (modelo === 'periodo' && clave === 'L') return { ...CAMPO.L, nombre: 'Suma de Lⱼ' };
  if (modelo === 'seguridad' && clave === 'LT') return { ...CAMPO.LT, nombre: 'Plazo en períodos', opcional: false, cero: false };
  return CAMPO[clave];
};

const ARTICULO = [
  { clave: 'D', titulo: 'D', dicho: 'Demanda', falta: 'la demanda', modo: 'decimal' },
  { clave: 'L', titulo: 'L', dicho: 'Costo fijo', falta: 'el costo fijo', modo: 'decimal' },
  { clave: 'C', titulo: 'C', dicho: 'Costo unitario', falta: 'el costo unitario', modo: 'decimal' },
];

// The notes' examples, each one the start of its model.
export const EJEMPLOS = {
  basico: { nombre: 'Mussi', datos: { D: '300', L: '200', C: '4', i: '0,025', LT: '0,23', Tc: '4' } },
  ingreso: { nombre: 'Northern Group', datos: { D: '2000', V: '5000', L: '950', C: '80', i: '0,02', LT: '0,16', Tc: '1' } },
  escalon: { nombre: 'Autoreptos', datos: { D: '250', L: '12', i: '0,025', C1: '10', C2: '8', a: '600', LT: '0,228' } },
  excedente: { nombre: 'Calvani', datos: { D: '20', L: '30', i: '0,025', C1: '2600', C2: '2300', a: '8', LT: '0,33' } },
  periodo: { nombre: 'Paper Center', datos: { C: '7136', L: '60', S: '142,72', Tc: '1' } },
  financiera: {
    nombre: 'Audio Ingeniería',
    datos: { i: '0,02', I0: '35000', articulos: [{ D: '600', L: '300', C: '160' }, { D: '313', L: '300', C: '120' }], pruebas: '0,03 0,015 0,012' },
  },
  seguridad: { nombre: 'Metalsur', datos: { media: '55,16', desvio: '3,75', LT: '12', z: '2,06' } },
};

const AYUDA = {
  periodo: 'δⱼ = Cⱼ·i en el modelo básico y Cⱼ·i·(1 − Dⱼ/Vⱼ) con consumo durante el ingreso. Los miles van sin punto.',
  seguridad: 'z sale de la tabla de la pág. 49 del apunte. Los miles van sin punto.',
  financiera: 'D e i van en la misma unidad de tiempo. Los miles van sin punto.',
};
const AYUDA_COMUN = 'D, i y LT van en la misma unidad de tiempo. Los miles van sin punto.';

/** Small costs with four decimals, as 4,3651; big ones with two, as 2.613,96. */
const n = (x) => coma(x, Math.abs(x) < 10 ? 4 : 2);
const q = (x) => coma(x, 2);

/** Reads the fields of the model. { d } or { errores } by field. */
function leer(modelo, v) {
  const errores = {};
  const d = {};
  for (const clave of MODELOS[modelo].campos) {
    const c = campoDe(modelo, clave);
    const di = c.di ?? (typeof c.simbolo === 'string' ? c.simbolo : clave);
    const r = leerNumero(v[clave] ?? '');
    if (r.falta) {
      if (!c.opcional) errores[clave] = `Falta ${di}.`;
      continue;
    }
    if (r.mal) errores[clave] = `«${String(v[clave]).trim()}» no es un número.`;
    else if (c.cero ? r.valor < 0 : r.valor <= 0) errores[clave] = `${di.charAt(0).toUpperCase()}${di.slice(1)} tiene que ser ${c.cero ? '0 o más' : 'mayor que 0'}.`;
    else d[clave] = r.valor;
  }
  if (modelo === 'ingreso' && !errores.V && !errores.D && d.V <= d.D) errores.V = 'V tiene que ser mayor que D.';
  if ((modelo === 'escalon' || modelo === 'excedente') && !errores.C1 && !errores.C2 && d.C2 >= d.C1) errores.C2 = 'C₂ tiene que ser menor que C₁.';
  if (modelo === 'financiera') {
    const filas = leerFilas(v.articulos ?? [], ARTICULO);
    if (filas.error) errores.articulos = filas.error;
    else {
      const malo = filas.valores.findIndex((f) => !(f.D > 0 && f.L > 0 && f.C > 0));
      if (malo >= 0) errores.articulos = { fila: malo, columna: ARTICULO.findIndex((c) => !(filas.valores[malo][c.clave] > 0)), mensaje: `Los datos del artículo ${malo + 1} tienen que ser mayores que 0.` };
      else d.articulos = filas.valores;
    }
    if ((v.pruebas ?? '').trim()) {
      const l = leerLista(v.pruebas, 20);
      if (l.error) errores.pruebas = l.error;
      else if (l.numeros.some((x) => x < 0)) errores.pruebas = 'Los valores de λ tienen que ser 0 o más.';
      else d.pruebas = l.numeros;
    } else d.pruebas = [];
  }
  return Object.keys(errores).length ? { errores } : { d };
}

// ----- Drawings

/** The y range that shows the key values of a cost curve with some air, without the hyperbola running to the sky. */
function rango(claves) {
  const lo = Math.min(...claves);
  const hi = Math.max(...claves);
  const aire = hi - lo || Math.abs(hi) * 0.01 || 1;
  return [lo - aire * 0.2, hi + aire * 0.45];
}

function DibujoLote({ C, L, delta, D, Q, CT, ingreso: conIngreso, etiqueta }) {
  const f = (x) => C + L / x + (delta * x) / (2 * D);
  const [y0, y1] = rango([C, CT, f(Q * 0.45), f(Q * 2.2)]);
  return (
    <>
      <Grafico etiqueta={etiqueta} alto={240} x={[Q * 0.15, Q * 2.6]} y={[Math.max(y0, C - (y1 - C) * 0.08), y1]} nombreX="Q" nombreY="CT(Q)" formatoX={(v) => coma(v, 0)} formatoY={(v) => coma(v, 3)}>
        {(e) => (
          <>
            <Horizontal e={e} y={C} texto="C" tono="suave" />
            <Curva e={e} f={(x) => C + L / x} tono="rojo" />
            <Curva e={e} f={(x) => C + (delta * x) / (2 * D)} tono="azul" />
            <Curva e={e} f={f} />
            <Vertical e={e} x={Q} texto={`Q* = ${q(Q)}`} />
            <Punto e={e} x={Q} y={CT} />
          </>
        )}
      </Grafico>
      <Referencias
        items={[
          { texto: 'CT(Q)', tono: 'tinta' },
          { texto: 'C + L/Q', tono: 'rojo' },
          { texto: conIngreso ? 'C + Ci(1 − D/V)·Q/2D' : 'C + Ci·Q/2D', tono: 'azul' },
        ]}
      />
    </>
  );
}

/** A cost by pieces: CT₁ up to a and CT₂ from a, with the optimum marked. */
function DibujoTramos({ CT1, CT2, a, Q, CT, x0, x1, abierto, etiqueta }) {
  const [y0, y1] = rango([CT, CT1(Math.min(a, x1)), CT2(Math.max(a, x0)), CT2(x1), CT1(Math.max(x0, Math.min(a, x1) * 0.6))]);
  return (
    <>
      <Grafico etiqueta={etiqueta} alto={240} x={[x0, x1]} y={[y0, y1]} nombreX="Q" nombreY="CT(Q)" formatoX={(v) => coma(v, 1)} formatoY={(v) => coma(v, Math.abs(v) < 10 ? 3 : 0)}>
        {(e) => (
          <>
            <Curva e={e} f={CT1} hasta={a} tono="rojo" />
            <Curva e={e} f={CT2} desde={a} tono="azul" />
            <Vertical e={e} x={a} texto={`a = ${q(a)}`} tono="suave" fila={abierto ? 1 : 0} />
            <Punto e={e} x={Q} y={CT} texto={`Q* = ${q(Q)}`} />
          </>
        )}
      </Grafico>
      <Referencias
        items={[
          { texto: 'CT₁, con C₁', tono: 'rojo' },
          { texto: 'CT₂, con C₂', tono: 'azul' },
        ]}
      />
    </>
  );
}

// ----- Each model on the sheet

function Lote({ modelo, d }) {
  const conIngreso = modelo === 'ingreso';
  const r = conIngreso ? ingreso(d) : basico(d);
  const factor = conIngreso ? r.factor : 1;
  const delta = d.C * d.i * factor;
  const CT = (Q) => d.C + d.L / Q + (delta * Q) / (2 * d.D);
  const Qc = d.Tc !== undefined ? d.Tc * d.D : undefined;
  const sumaCt = conIngreso ? `${coma(d.C)}·${coma(d.i)}·${n(factor)}` : `${coma(d.C)}·${coma(d.i)}`;
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Lote óptimo', valor: `Q* = ${q(r.Q)}`, principal: true },
          { nombre: 'Costo por unidad', valor: `CT(Q*) = ${n(r.CT)}` },
          { nombre: 'Período', valor: `T* = ${q(r.T)}` },
          ...(d.LT !== undefined ? [{ nombre: 'Punto de pedido', valor: `PP = ${q(r.PP)}` }] : []),
          ...(conIngreso ? [{ nombre: 'Existencia máxima', valor: `M = ${q(r.M)}` }] : []),
        ]}
        dicho={`El lote óptimo da ${q(r.Q)}, con un costo por unidad de ${n(r.CT)}.`}
      >
        <DibujoLote C={d.C} L={d.L} delta={delta} D={d.D} Q={r.Q} CT={r.CT} ingreso={conIngreso} etiqueta={`Costo por unidad según el lote, con su mínimo ${n(r.CT)} en Q* = ${q(r.Q)}. Ahí se cruzan los gastos fijos y el mantenimiento.`} />
      </Fichas>
      <Pasos>
        {conIngreso && (
          <Paso titulo="Lo que queda del ingreso">
            <Cuenta>
              1 − <Frac arriba="D" abajo="V" /> = 1 − <Frac arriba={coma(d.D)} abajo={coma(d.V)} /> = {n(factor)}
            </Cuenta>
          </Paso>
        )}
        <Paso titulo="El lote óptimo">
          <Cuenta>
            Q* ={' '}
            <Raiz>
              <Frac arriba="2DL" abajo={conIngreso ? 'Ci(1 − D/V)' : 'Ci'} />
            </Raiz>{' '}
            ={' '}
            <Raiz>
              <Frac arriba={`2·${coma(d.D)}·${coma(d.L)}`} abajo={sumaCt} />
            </Raiz>{' '}
            = {q(r.Q)}
          </Cuenta>
        </Paso>
        <Paso titulo="El costo por unidad">
          <Cuenta>
            CT(Q*) = C + <Frac arriba="L" abajo="Q*" /> + <Frac arriba={conIngreso ? 'Ci(1 − D/V)' : 'Ci'} abajo="2D" />
            ·Q*
          </Cuenta>
          <Cuenta>{`CT(Q*) = ${coma(d.C)} + ${n(r.fijos)} + ${n(r.mantenimiento)} = ${n(r.CT)}`}</Cuenta>
          <p className="calc-hoja__nota">En Q* los gastos fijos y el mantenimiento son iguales.</p>
        </Paso>
        {conIngreso && (
          <Paso titulo="El tiempo de ingreso y el máximo">
            <Cuenta>
              θ = <Frac arriba="Q*" abajo="V" /> = <Frac arriba={q(r.Q)} abajo={coma(d.V)} /> = {n(r.theta)}
            </Cuenta>
            <Cuenta>{`M = Q*·(1 − D/V) = ${q(r.Q)}·${n(factor)} = ${q(r.M)}`}</Cuenta>
          </Paso>
        )}
        <Paso titulo="El período">
          <Cuenta>
            T* = <Frac arriba="Q*" abajo="D" /> = <Frac arriba={q(r.Q)} abajo={coma(d.D)} /> = {q(r.T)}
          </Cuenta>
          <Cuenta>
            n* = <Frac arriba="D" abajo="Q*" /> = {n(d.D / r.Q)}
          </Cuenta>
        </Paso>
        {d.LT !== undefined && (
          <Paso titulo="El punto de pedido">
            <Cuenta>{`PP = D·LT = ${coma(d.D)}·${coma(d.LT)} = ${q(r.PP)}`}</Cuenta>
          </Paso>
        )}
        {Qc !== undefined && (
          <Paso titulo="El período corregido">
            <Cuenta>{`Qc = Tc·D = ${coma(d.Tc)}·${coma(d.D)} = ${q(Qc)}`}</Cuenta>
            <Cuenta>{`CT(Qc) = ${coma(d.C)} + ${n(d.L / Qc)} + ${n((delta * Qc) / (2 * d.D))} = ${n(CT(Qc))}`}</Cuenta>
            <p>{`Cuesta ${n(CT(Qc) - r.CT)} más por unidad que con Q*.`}</p>
            {conIngreso && <Cuenta>{`Stock promedio = Qc·(1 − D/V)/2 = ${q(Qc)}·${n(factor)}/2 = ${q((Qc * factor) / 2)}`}</Cuenta>}
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

function Descuento({ modelo, d }) {
  const esEscalon = modelo === 'escalon';
  const r = esEscalon ? escalon(d) : excedente(d);
  const x0 = Math.min(r.Q1, d.a) * 0.3;
  const x1 = Math.max(d.a, r.Q2) * 1.8;
  const ct = (C, Q) => `${coma(C)} + ${n(d.L / Q)} + ${n((C * d.i * Q) / (2 * d.D))}`;
  const ct2Excedente = (Q) => `(${coma(d.C2)} + ${n((r.k * d.i) / (2 * d.D))}) + ${n((d.L + r.k) / Q)} + ${n((d.C2 * d.i * Q) / (2 * d.D))}`;
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Lote óptimo', valor: `Q* = ${q(r.Q)}`, principal: true },
          { nombre: 'Costo por unidad', valor: `CT = ${n(r.CT)}` },
          ...(d.LT !== undefined ? [{ nombre: 'Punto de pedido', valor: `PP = ${q(r.PP)}` }] : []),
        ]}
        dicho={`Conviene un lote de ${q(r.Q)}, con un costo por unidad de ${n(r.CT)}.`}
      >
        <DibujoTramos CT1={r.CT1} CT2={r.CT2} a={d.a} Q={r.Q} CT={r.CT} x0={x0} x1={x1} abierto={Math.abs(r.Q - d.a) < 1e-9} etiqueta={`Costo por unidad según el lote. A la izquierda de a = ${q(d.a)} se paga C₁ y a la derecha C₂. El mínimo está en Q* = ${q(r.Q)}, con ${n(r.CT)}.`} />
      </Fichas>
      <Pasos>
        {!esEscalon && (
          <Paso titulo="El recargo del descuento">
            <Cuenta>{`k = (C₁ − C₂)·a = (${coma(d.C1)} − ${par(d.C2)})·${coma(d.a)} = ${q(r.k)}`}</Cuenta>
          </Paso>
        )}
        <Paso titulo="Los dos lotes">
          <Cuenta>
            Q₁* ={' '}
            <Raiz>
              <Frac arriba="2DL" abajo="C₁i" />
            </Raiz>{' '}
            ={' '}
            <Raiz>
              <Frac arriba={`2·${coma(d.D)}·${coma(d.L)}`} abajo={`${coma(d.C1)}·${coma(d.i)}`} />
            </Raiz>{' '}
            = {q(r.Q1)}
          </Cuenta>
          <Cuenta>
            Q₂* ={' '}
            <Raiz>
              <Frac arriba={esEscalon ? '2DL' : '2D(L + k)'} abajo="C₂i" />
            </Raiz>{' '}
            ={' '}
            <Raiz>
              <Frac arriba={esEscalon ? `2·${coma(d.D)}·${coma(d.L)}` : `2·${coma(d.D)}·(${coma(d.L)} + ${q(r.k)})`} abajo={`${coma(d.C2)}·${coma(d.i)}`} />
            </Raiz>{' '}
            = {q(r.Q2)}
          </Cuenta>
        </Paso>
        <Paso titulo="La decisión">
          {esEscalon && r.caso === 'a-antes' && (
            <>
              <p>{`a = ${q(d.a)} no pasa a Q₂* = ${q(r.Q2)}. El óptimo es Q₂*.`}</p>
              <Cuenta>{`CT₂(Q₂*) = ${ct(d.C2, r.Q2)} = ${n(r.CT)}`}</Cuenta>
            </>
          )}
          {esEscalon && r.caso === 'comparar' && (
            <>
              <p>{`a = ${q(d.a)} es mayor que Q₂* = ${q(r.Q2)}. Se comparan CT₁(Q₁*) y CT₂(a).`}</p>
              <Cuenta>{`CT₁(Q₁*) = ${ct(d.C1, r.Q1)} = ${n(r.ct1)}`}</Cuenta>
              <Cuenta>{`CT₂(a) = ${ct(d.C2, d.a)} = ${n(r.ct2)}`}</Cuenta>
              <p>{r.Q === d.a ? `CT₂(a) es menor. Conviene Q* = a = ${q(d.a)}.` : `CT₁(Q₁*) es menor. Conviene Q* = Q₁* = ${q(r.Q1)}.`}</p>
            </>
          )}
          {!esEscalon && r.caso === 'q1-pasa' && (
            <>
              <p>{`Q₁* = ${q(r.Q1)} llega a a = ${q(d.a)}. Entonces Q* = Q₂*.`}</p>
              <Cuenta>{`CT₂(Q₂*) = ${ct2Excedente(r.Q2)} = ${n(r.CT)}`}</Cuenta>
            </>
          )}
          {!esEscalon && r.caso === 'q2-no-llega' && (
            <>
              <p>{`Q₁* = ${q(r.Q1)} no llega a a = ${q(d.a)}. Q₂* = ${q(r.Q2)} tampoco lo pasa. Entonces Q* = Q₁*.`}</p>
              <Cuenta>{`CT₁(Q₁*) = ${ct(d.C1, r.Q1)} = ${n(r.CT)}`}</Cuenta>
            </>
          )}
          {!esEscalon && r.caso === 'comparar' && (
            <>
              <p>{`Q₁* = ${q(r.Q1)} no llega a a = ${q(d.a)}. Q₂* = ${q(r.Q2)} lo pasa. Se comparan CT₁(Q₁*) y CT₂(Q₂*).`}</p>
              <Cuenta>{`CT₁(Q₁*) = ${ct(d.C1, r.Q1)} = ${n(r.ct1)}`}</Cuenta>
              <Cuenta>{`CT₂(Q₂*) = ${ct2Excedente(r.Q2)} = ${n(r.ct2)}`}</Cuenta>
              <p>{r.Q === r.Q1 ? `CT₁(Q₁*) no es mayor. Conviene Q* = Q₁* = ${q(r.Q1)}.` : `CT₂(Q₂*) es menor. Conviene Q* = Q₂* = ${q(r.Q2)}.`}</p>
            </>
          )}
        </Paso>
        {d.LT !== undefined && (
          <Paso titulo="El punto de pedido">
            <Cuenta>{`PP = D·LT = ${coma(d.D)}·${coma(d.LT)} = ${q(r.PP)}`}</Cuenta>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

function Periodo({ d }) {
  const r = periodo(d);
  const [y0, y1] = rango([d.C, r.CT, r.curva(r.T * 0.4), r.curva(r.T * 2.4)]);
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Período óptimo', valor: `T* = ${q(r.T)}`, principal: true },
          { nombre: 'Costo total', valor: `CT(T*) = ${q(r.CT)}` },
          ...(d.Tc !== undefined ? [{ nombre: 'Con el período corregido', valor: `CT(Tc) = ${q(r.CTc)}` }] : []),
        ]}
        dicho={`El período óptimo da ${q(r.T)}, con un costo total de ${q(r.CT)}.`}
      >
        <Grafico etiqueta={`Costo total según el período, con su mínimo ${q(r.CT)} en T* = ${q(r.T)}.`} alto={240} x={[r.T * 0.15, r.T * 2.8]} y={[Math.max(y0, d.C - (y1 - d.C) * 0.08), y1]} nombreX="T" nombreY="CT(T)" formatoY={(v) => coma(v, 0)}>
          {(e) => (
            <>
              <Horizontal e={e} y={d.C} texto="C" tono="suave" />
              <Curva e={e} f={(t) => d.C + d.L / t} tono="rojo" />
              <Curva e={e} f={(t) => d.C + (d.S * t) / 2} tono="azul" />
              <Curva e={e} f={r.curva} />
              <Vertical e={e} x={r.T} texto={`T* = ${q(r.T)}`} />
              <Punto e={e} x={r.T} y={r.CT} />
              {d.Tc !== undefined && <Punto e={e} x={d.Tc} y={r.CTc} texto={Math.abs(d.Tc - r.T) > r.T * 0.25 ? 'Tc' : undefined} />}
            </>
          )}
        </Grafico>
        <Referencias
          items={[
            { texto: 'CT(T)', tono: 'tinta' },
            { texto: 'C + L/T', tono: 'rojo' },
            { texto: 'C + S·T/2', tono: 'azul' },
          ]}
        />
      </Fichas>
      <Pasos>
        <Paso titulo="El período óptimo">
          <Cuenta>
            T* ={' '}
            <Raiz>
              <Frac arriba="2L" abajo="S" />
            </Raiz>{' '}
            ={' '}
            <Raiz>
              <Frac arriba={`2·${coma(d.L)}`} abajo={coma(d.S)} />
            </Raiz>{' '}
            = {q(r.T)}
          </Cuenta>
          <p>Cada lote es Qⱼ* = Dⱼ·T*.</p>
        </Paso>
        <Paso titulo="El costo total">
          <Cuenta>
            CT(T*) = C + <Frac arriba="L" abajo="T*" /> + <Frac arriba="S" abajo="2" />
            ·T*
          </Cuenta>
          <Cuenta>{`CT(T*) = ${coma(d.C)} + ${q(r.fijos)} + ${q(r.mantenimiento)} = ${q(r.CT)}`}</Cuenta>
        </Paso>
        {d.Tc !== undefined && (
          <Paso titulo="El período corregido">
            <Cuenta>{`CT(Tc) = ${coma(d.C)} + ${q(d.L / d.Tc)} + ${q((d.S * d.Tc) / 2)} = ${q(r.CTc)}`}</Cuenta>
            <p>{`Cuesta ${q(r.CTc - r.CT)} más que con T*.`}</p>
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

function Financiera({ d }) {
  const r = financiera({ i: d.i, I0: d.I0, articulos: d.articulos, pruebas: d.pruebas });
  const m = d.articulos.length;
  const final = r.final;
  const filas = r.efectiva ? [r.libre, ...r.pruebas, final] : [r.libre];
  const tope = Math.max(final.lambda * 2.2, ...d.pruebas.map((x) => x * 1.15), d.i * 0.5);
  const [, yAlto] = rango([d.I0, r.libre.I, r.con(tope).I]);
  const lambdaT = coma(final.lambda, 4);
  return (
    <Hoja>
      <Fichas
        fichas={[
          r.efectiva ? { nombre: 'Multiplicador', valor: `λ = ${lambdaT}`, principal: true } : { nombre: 'Inversión media', valor: `I = ${q(r.libre.I)}`, principal: true },
          ...final.lotes.map((Q, j) => ({ nombre: `Lote del artículo ${j + 1}`, valor: `Q${subindice(j + 1)} = ${q(Q)}` })),
          ...(r.efectiva ? [{ nombre: 'Inversión media', valor: `I = ${q(final.I)}` }] : []),
        ]}
        dicho={r.efectiva ? `La restricción es efectiva. Con λ = ${lambdaT}, la inversión llega a ${q(d.I0)}.` : `La restricción no es efectiva. La inversión media da ${q(r.libre.I)}.`}
      >
        <Grafico etiqueta={`Inversión media según λ, que baja al subir λ. El tope I₀ = ${q(d.I0)} está marcado${r.efectiva ? `, y la cruza en λ = ${lambdaT}` : ''}.`} alto={230} x={[0, tope]} y={[0, yAlto]} nombreX="λ" nombreY="I(λ)" formatoY={(v) => coma(v, 0)}>
          {(e) => (
            <>
              <Horizontal e={e} y={d.I0} texto={`I₀ = ${q(d.I0)}`} tono="rojo" />
              <Curva e={e} f={(l) => r.con(l).I} />
              {r.pruebas.map((p, k) => (
                <Punto key={k} e={e} x={p.lambda} y={p.I} />
              ))}
              {r.efectiva && <Vertical e={e} x={final.lambda} texto={`λ = ${lambdaT}`} />}
            </>
          )}
        </Grafico>
      </Fichas>
      <Pasos>
        <Paso titulo="Sin restricción">
          <Cuenta>
            Qⱼ ={' '}
            <Raiz>
              <Frac arriba="2DⱼLⱼ" abajo="Cⱼ(i + λ)" />
            </Raiz>
            , con λ = 0
          </Cuenta>
          <Cuenta>
            I = Σ <Frac arriba="CⱼQⱼ" abajo="2" /> = {q(r.libre.I)}
          </Cuenta>
          <p>{r.efectiva ? `I pasa a I₀ = ${q(d.I0)}. La restricción es efectiva.` : `I no pasa a I₀ = ${q(d.I0)}. No hay restricción y los lotes quedan así.`}</p>
        </Paso>
        <Paso titulo={r.efectiva ? 'Las aproximaciones' : 'Los lotes'}>
          {r.efectiva && <p>Se prueban valores de λ hasta que I llega a I₀.</p>}
          <Desborde etiqueta="Cada λ probado con sus lotes y la inversión">
            <table className="tabla-pasos">
              <caption className="solo-lectores">Cada valor de λ con el lote de cada artículo y la inversión media</caption>
              <thead>
                <tr>
                  <th scope="col">λ</th>
                  {Array.from({ length: m }, (_, j) => (
                    <th key={j} scope="col">{`Q${subindice(j + 1)}`}</th>
                  ))}
                  <th scope="col">I</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, k) => (
                  <tr key={k} className={r.efectiva && k === filas.length - 1 ? 'ce-marcada' : undefined}>
                    <th scope="row">{coma(f.lambda, 4)}</th>
                    {f.lotes.map((Q, j) => (
                      <td key={j}>{q(Q)}</td>
                    ))}
                    <td>{q(f.I)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Desborde>
          {r.efectiva && <p className="calc-hoja__nota">{`La fila marcada es la de λ = ${lambdaT}, donde I = I₀.`}</p>}
        </Paso>
        {r.efectiva && (
          <Paso titulo="Los lotes con la restricción">
            {final.lotes.map((Q, j) => (
              <Cuenta key={j}>
                Q{subindice(j + 1)} ={' '}
                <Raiz>
                  <Frac arriba={`2·${coma(d.articulos[j].D)}·${coma(d.articulos[j].L)}`} abajo={`${coma(d.articulos[j].C)}·(${coma(d.i)} + ${lambdaT})`} />
                </Raiz>{' '}
                = {q(Q)}
              </Cuenta>
            ))}
          </Paso>
        )}
      </Pasos>
    </Hoja>
  );
}

/** D̄ with LT below, inside a drawing. */
const DLT = () => (
  <>
    D̄<tspan dy="0.3em">LT</tspan>
  </>
);

function Seguridad({ d }) {
  const r = seguridad(d);
  const s = r.desvioLT || 1e-9;
  const f = (x) => Math.exp(-0.5 * ((x - r.mediaLT) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
  const RF = 1 - fiNormal(d.z);
  const x0 = r.mediaLT - 4 * s;
  const x1 = Math.max(r.mediaLT + 4 * s, r.PP + s);
  return (
    <Hoja>
      <Fichas
        fichas={[
          { nombre: 'Punto de pedido', valor: `PP = ${q(r.PP)}`, principal: true },
          { nombre: 'Stock de seguridad', valor: `SS = ${q(r.SS)}` },
          { nombre: 'Demanda en el plazo', valor: <>D̄<sub>LT</sub> = {q(r.mediaLT)}</> },
          { nombre: 'Desvío en el plazo', valor: <>S<sub>DLT</sub> = {q(r.desvioLT)}</> },
        ]}
        dicho={`El punto de pedido da ${q(r.PP)}, con un stock de seguridad de ${q(r.SS)}.`}
      >
        <Grafico etiqueta={`Demanda durante el plazo, Normal con media ${q(r.mediaLT)} y desvío ${q(r.desvioLT)}. Lo que pasa del punto de pedido ${q(r.PP)} es el riesgo de faltante, ${coma(RF, 4)}.`} alto={220} x={[x0, x1]} y={[0, f(r.mediaLT) * 1.2]} nombreX={<DLT />} formatoY={() => ''} marcasY={[]} formatoX={(v) => coma(v, 0)}>
          {(e) => (
            <>
              <Relleno e={e} f={f} desde={r.PP} hasta={x1} />
              <Curva e={e} f={f} />
              <Vertical e={e} x={r.mediaLT} texto={<DLT />} tono="suave" />
              <Vertical e={e} x={r.PP} texto="PP" fila={1} />
            </>
          )}
        </Grafico>
        <p className="calc-hoja__nota ce-bajo-dibujo">{`El área marcada es el riesgo de faltante, 1 − P(Z < ${coma(d.z)}) = ${coma(RF, 4)}.`}</p>
      </Fichas>
      <Pasos>
        <Paso titulo="La demanda durante el plazo">
          <Cuenta>
            D̄<sub>LT</sub> = D̄·LT = {coma(d.media)}·{coma(d.LT)} = {q(r.mediaLT)}
          </Cuenta>
          <Cuenta>
            S<sub>DLT</sub> = <Raiz>LT</Raiz>·S<sub>D</sub> = <Raiz>{coma(d.LT)}</Raiz>·{coma(d.desvio)} = {q(r.desvioLT)}
          </Cuenta>
        </Paso>
        <Paso titulo="El stock de seguridad">
          <Cuenta>
            SS = z·S<sub>DLT</sub> = {coma(d.z)}·{q(r.desvioLT)} = {q(r.SS)}
          </Cuenta>
        </Paso>
        <Paso titulo="El punto de pedido">
          <Cuenta>
            PP = D̄<sub>LT</sub> + SS = {q(r.mediaLT)} + {q(r.SS)} = {q(r.PP)}
          </Cuenta>
        </Paso>
      </Pasos>
    </Hoja>
  );
}

const INICIO = Object.fromEntries(Object.entries(EJEMPLOS).map(([k, e]) => [k, e.datos]));

export default function Stocks() {
  const [guardado, setEstado] = useRecordado('calc:calculadora-vacia', { modelo: 'basico', datos: {} });
  const modelo = MODELOS[guardado.modelo] ? guardado.modelo : 'basico';
  const valores = { ...INICIO[modelo], ...guardado.datos?.[modelo] };
  const cambiar = (cambio) => setEstado({ modelo, datos: { ...guardado.datos, [modelo]: { ...valores, ...cambio } } });
  const leido = leer(modelo, valores);
  const errores = leido.errores ?? {};
  const ejemplo = EJEMPLOS[modelo];

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          <Opciones leyenda="El modelo" nombre="modelo" opciones={OPCIONES} valor={modelo} alCambiar={(m) => setEstado({ ...guardado, modelo: m })} chica />
          <Datos>
            {MODELOS[modelo].campos.map((clave) => {
              const c = campoDe(modelo, clave);
              return (
                <Dato
                  key={clave}
                  nombre={c.opcional ? `${c.nombre}, si lo hay` : c.nombre}
                  simbolo={c.simbolo}
                  valor={valores[clave] ?? ''}
                  alCambiar={(t) => cambiar({ [clave]: t })}
                  error={errores[clave]}
                />
              );
            })}
          </Datos>
          {modelo === 'financiera' && (
            <>
              <TablaTiza
                etiqueta="Los artículos"
                columnas={ARTICULO}
                filas={valores.articulos}
                error={errores.articulos}
                alCambiar={(articulos) => cambiar({ articulos })}
                vacia={{ D: '', L: '', C: '' }}
                nombreFilas="artículos"
                singular="artículo"
                articulo="Un"
                max={8}
              />
              {errores.articulos && (
                <p className="campo__error" role="alert">
                  {errores.articulos.mensaje}
                </p>
              )}
              <Dato nombre="Valores de λ para probar" valor={valores.pruebas ?? ''} alCambiar={(pruebas) => cambiar({ pruebas })} error={errores.pruebas} ancho modo="text" ayuda="Separados por espacios, como en las aproximaciones del apunte." />
            </>
          )}
          <p className="campo__ayuda">{AYUDA[modelo] ?? AYUDA_COMUN}</p>
        </div>
        <Ejemplos ejemplos={[ejemplo]} alElegir={(e) => cambiar(e.datos)} />
      </section>

      {leido.d &&
        (modelo === 'basico' || modelo === 'ingreso' ? (
          <Lote modelo={modelo} d={leido.d} />
        ) : modelo === 'escalon' || modelo === 'excedente' ? (
          <Descuento modelo={modelo} d={leido.d} />
        ) : modelo === 'periodo' ? (
          <Periodo d={leido.d} />
        ) : modelo === 'financiera' ? (
          <Financiera d={leido.d} />
        ) : (
          <Seguridad d={leido.d} />
        ))}
    </>
  );
}
