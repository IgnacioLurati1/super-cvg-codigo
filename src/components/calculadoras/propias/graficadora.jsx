import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { escribir } from '../../../lib/calculadoras/formula';
import { acercar, asintotas, cabe, enTexto, hueco, intervalos, leerTablero, MAX_TRAZOS, mover, nuevoTrazo, paraCampo, par, recta, TIPOS } from '../../../lib/calculadoras/graficadora';
import { useRecordado } from '../../../lib/calculadoras/memoria';
import { contorno, tramosDe, tramosDeCurva } from '../../../lib/calculadoras/trazado';
import { usePantallaDeConsultron } from '../../../lib/consultron/pantalla';
import { Anuncio, Ejemplos, Hoja, Paso, Pasos } from '../Hoja';
import { Formula, linea, Plano, Rotulo } from './_an-grafico';
import { Dato, ErrorDe, Escribir, Renglon } from './_an-pizarron';
import { Borrar, cuenta, Ecuacion, Entre, igualA, lista, Mando, n, Sumar, useRenglones, useUltimoBueno } from './_gr-piezas';
import './graficadora.css';

// Graficadora, of Análisis Matemático I: functions, the curve of an equation, curves by their parameter or in polar
// coordinates, and points or a figure, drawn on the squared sheet. The kinds are El Santo Resumen's :::grafico
// (plantilla/w.js), plus the equation. The first function, f, gets the study the exams ask for, in their order
// (parcial-2.md, «Estudio completo de una función»), its tangent line («La derivada») and an area (integrales.md,
// «Área entre curvas»), through lib/calculadoras/estudio.js.

const T = (id, tipo, datos) => ({ id, ...nuevoTrazo(tipo), ...datos });
const BASE = { x0: '-5', x1: '5', y0: '', y1: '', tangente: '', areaA: '', areaB: '' };

// The notes' own graphs and examples (parcial-1.md, parcial-2.md and integrales.md of Análisis Matemático I).
export const EJEMPLOS = [
  { ...BASE, nombre: 'Asíntotas de una homográfica', trazos: [T(1, 'funcion', { f: '1/(x - 2) + 1' })], x0: '-6', x1: '10', y0: '-6', y1: '8' },
  { ...BASE, nombre: 'Concavidad de x⁴ − 4x³', trazos: [T(1, 'funcion', { f: 'x^4 - 4x^3' })], x0: '-2', x1: '5', y0: '-40', y1: '40' },
  { ...BASE, nombre: 'Tangente a x² en 2', trazos: [T(1, 'funcion', { f: 'x^2' })], x0: '-3', x1: '5', tangente: '2' },
  { ...BASE, nombre: 'Área entre e^x y x', trazos: [T(1, 'funcion', { f: 'e^x' }), T(2, 'funcion', { f: 'x' })], x0: '-0,5', x1: '1,5', y0: '-0,5', y1: '3,5', areaA: '0', areaB: '1' },
  { ...BASE, nombre: 'Par e impar', trazos: [T(1, 'funcion', { f: 'x^2' }), T(2, 'funcion', { f: 'x^3' })], x0: '-2,5', x1: '2,5', y0: '-6', y1: '6' },
  {
    ...BASE,
    nombre: 'El fólium y su tangente',
    trazos: [T(1, 'ecuacion', { e: 'x^3 + y^3 = 6xy' }), T(2, 'ecuacion', { e: 'y = -x + 6' }), T(3, 'puntos', { p: '(3; 3)' })],
    x0: '-6',
    x1: '8',
  },
];

const INICIAL = { ...EJEMPLOS[0], nombre: undefined };

const NOMBRES_TIPO = { funcion: 'Función', ecuacion: 'Ecuación', parametrica: 'Paramétrica', polar: 'Polar', puntos: 'Puntos' };
const CUANTOS = {
  funcion: ['función', 'funciones'],
  ecuacion: ['ecuación', 'ecuaciones'],
  parametrica: ['curva paramétrica', 'curvas paramétricas'],
  polar: ['curva polar', 'curvas polares'],
  puntos: ['grupo de puntos', 'grupos de puntos'],
};
// ---------- What each thing is called ----------
function Nombre({ t }) {
  if (t.tipo === 'funcion') {
    return (
      <>
        {t.nombre}(x) = <Formula nodo={t.nodo} />
      </>
    );
  }
  if (t.tipo === 'ecuacion') {
    return (
      <>
        <Formula nodo={t.izq} /> = <Formula nodo={t.der} />
      </>
    );
  }
  if (t.tipo === 'parametrica') {
    return (
      <>
        x = <Formula nodo={t.nodoX} />, y = <Formula nodo={t.nodoY} />
      </>
    );
  }
  if (t.tipo === 'polar') {
    return (
      <>
        r = <Formula nodo={t.nodo} />
      </>
    );
  }
  return t.unir ? 'la figura' : t.puntos.length > 1 ? 'los puntos' : `el punto ${par(...t.puntos[0])}`;
}

function dicho(t) {
  if (t.tipo === 'funcion') return `${t.nombre} de x igual a ${escribir(t.nodo)}`;
  if (t.tipo === 'ecuacion') return `la curva ${escribir(t.izq)} igual a ${escribir(t.der)}`;
  if (t.tipo === 'parametrica') return `la curva x igual a ${escribir(t.nodoX)}, y igual a ${escribir(t.nodoY)}`;
  if (t.tipo === 'polar') return `la curva polar r igual a ${escribir(t.nodo)}`;
  return t.unir ? `una figura de ${t.puntos.length} puntos` : t.puntos.length > 1 ? `${t.puntos.length} puntos` : `el punto ${par(...t.puntos[0])}`;
}

// ---------- The drawing ----------
const tope = (v) => Math.max(-1e4, Math.min(1e4, v));

/** Everything inside the plane: the area, the asymptotes, each thing in its own pen, the tangent and the marks. */
function Dibujo({ m, p, alVentana }) {
  const { sx, sy, X, Y, area, recorte, W } = p;
  const [mira, setMira] = useState(null);
  const arrastre = useRef(null);
  const ancho = area.r - area.l;
  const alto = area.b - area.t;
  const aPx = ([x, y]) => [tope(sx(x)), tope(sy(y))];
  const e = m.estudio;

  // Each thing in its pen, worked out once per board and size: reading a value with the pointer doesn't draw them again.
  const plumas = useMemo(() => {
    const aPx = ([x, y]) => [tope(sx(x)), tope(sy(y))];
    const escY = alto / (Y[1] - Y[0]);
    const trazo = (t) => {
      const clase = `gr-serie gr-serie--${t.serie}`;
      if (t.tipo === 'funcion') {
        const d = tramosDe(t.fn, X[0], X[1], Math.max(240, Math.min(900, Math.round(ancho))), escY).map((tr) => linea(tr.map(aPx))).join('');
        return <path key={t.id} className={clase} d={d} />;
      }
      if (t.tipo === 'ecuacion') {
        const celdas = (px) => Math.max(40, Math.min(170, Math.round(px / 4)));
        const d = contorno(t.F, X, Y, celdas(ancho), celdas(alto))
          .map((tr) => linea(tr.map(aPx)))
          .join('');
        return <path key={t.id} className={clase} d={d} />;
      }
      if (t.tipo === 'puntos') {
        const pts = t.puntos.map(aPx);
        return (
          <g key={t.id}>
            {t.unir && <path className={clase} d={`${linea(pts)}${pts.length > 2 ? 'Z' : ''}`} />}
            {pts.map(([x, y], i) => (
              <circle key={i} className="graf__punto graf__punto--lleno" cx={x} cy={y} r={4.5} />
            ))}
          </g>
        );
      }
      const lejos = Math.max(X[1] - X[0], Y[1] - Y[0]) * 0.7;
      // A long way round takes more steps, so each turn keeps its shape.
      const pasos = Math.max(720, Math.min(6000, Math.round((t.t1 - t.t0) * 40)));
      const d = tramosDeCurva(t.fx, t.fy, t.t0, t.t1, pasos, lejos).map((tr) => linea(tr.map(aPx))).join('');
      return <path key={t.id} className={clase} d={d} />;
    };
    return m.trazos.map(trazo);
  }, [m.trazos, sx, sy, X, Y, ancho, alto]);

  // The region of the area: along f from a to b, and back along g (or the axis).
  let region = null;
  if (m.area) {
    const g = m.g ? m.g.fn : () => 0;
    const xs = Array.from({ length: 121 }, (_, i) => m.area.a + ((m.area.b - m.area.a) * i) / 120);
    region = `${linea(xs.map((x) => aPx([x, m.f.fn(x)])))}${linea(xs.reverse().map((x) => aPx([x, g(x)]))).replace('M', 'L')}Z`;
  }

  const xDe = (ev) => {
    const caja = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
    const px = ((ev.clientX - caja.left) * W) / caja.width;
    return X[0] + ((px - area.l) / ancho) * (X[1] - X[0]);
  };
  const alBajar = (ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    arrastre.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, X, Y, kx: (X[1] - X[0]) / ancho, ky: (Y[1] - Y[0]) / alto, movio: false };
  };
  const alMoverse = (ev) => {
    const a = arrastre.current;
    if (!a) {
      if (ev.pointerType !== 'touch') setMira(xDe(ev));
      return;
    }
    if (a.id !== ev.pointerId) return;
    const [dx, dy] = [ev.clientX - a.x, ev.clientY - a.y];
    if (!a.movio && Math.hypot(dx, dy) < 5) return;
    a.movio = true;
    setMira(null);
    alVentana(mover([a.X, a.Y], -dx * a.kx, dy * a.ky));
  };
  const alSoltar = (ev) => {
    const a = arrastre.current;
    if (!a || a.id !== ev.pointerId) return;
    arrastre.current = null;
    // A touch without dragging reads the values at that x. Another one takes the reading away.
    if (!a.movio && ev.pointerType === 'touch') setMira((v) => (v === null ? xDe(ev) : null));
  };

  const funciones = m.trazos.filter((t) => t.tipo === 'funcion');
  const lecturas = mira === null ? [] : funciones.map((t) => ({ t, y: t.fn(mira) })).filter((l) => Number.isFinite(l.y) && l.y >= Y[0] && l.y <= Y[1]);

  return (
    <>
      <g clipPath={recorte}>
        {region && <path className="gr-area" d={region} />}
        {e?.verticales.map((v) => (
          <line key={`v${v.x}`} className="graf__guia" x1={sx(v.x)} x2={sx(v.x)} y1={area.t} y2={area.b} />
        ))}
        {e?.lejos.map((a) => {
          const [xa, xb] = a.lado > 0 ? [Math.max(X[0], (X[0] + X[1]) / 2), X[1]] : [X[0], Math.min(X[1], (X[0] + X[1]) / 2)];
          const y = (x) => (a.tipo === 'horizontal' ? a.b : a.m * x + a.b);
          return <line key={`l${a.lado}`} className="graf__guia" x1={sx(xa)} y1={tope(sy(y(xa)))} x2={sx(xb)} y2={tope(sy(y(xb)))} />;
        })}
        {plumas}
        {m.tangente && <line className="graf__metodo" x1={sx(X[0])} y1={tope(sy(m.tangente.m * X[0] + m.tangente.b))} x2={sx(X[1])} y2={tope(sy(m.tangente.m * X[1] + m.tangente.b))} />}
        {e?.inflexiones.map((q) => (
          <circle key={`i${q.x}`} className="graf__punto" cx={sx(q.x)} cy={tope(sy(q.y))} r={4.5} />
        ))}
        {e?.extremos.map((q) => (
          <circle key={`e${q.x}`} className="graf__punto graf__punto--lleno" cx={sx(q.x)} cy={tope(sy(q.y))} r={4.5} />
        ))}
        {m.tangente && <circle className="graf__punto graf__punto--metodo" cx={sx(m.tangente.x0)} cy={tope(sy(m.tangente.y0))} r={5} />}
        {mira !== null && <line className="graf__guia" x1={sx(mira)} x2={sx(mira)} y1={area.t} y2={area.b} />}
      </g>
      {lecturas.map((l) => (
        <g key={l.t.id}>
          <circle className="graf__actual" cx={sx(mira)} cy={sy(l.y)} r={5.5} />
          <Rotulo x={sx(mira) + (sx(mira) > area.r - 110 ? -10 : 10)} y={sy(l.y) - 9} ancla={sx(mira) > area.r - 110 ? 'end' : 'start'}>
            {par(mira, l.y)}
          </Rotulo>
        </g>
      ))}
      <rect
        className="gr-toque"
        x={area.l}
        y={area.t}
        width={ancho}
        height={alto}
        onPointerDown={alBajar}
        onPointerMove={alMoverse}
        onPointerUp={alSoltar}
        onPointerCancel={() => {
          arrastre.current = null;
        }}
        onPointerLeave={() => {
          if (!arrastre.current) setMira(null);
        }}
      />
    </>
  );
}

function Lamina({ m, alVentana, alturaSola }) {
  const etiqueta = `Gráfico de ${lista(m.trazos.map(dicho))}, con x de ${n(m.X[0])} a ${n(m.X[1])}.`;
  const con = (k) => [acercar(m.X, k), m.alturaFija ? acercar(m.Y, k) : null];
  const entra = ([X, Y]) => cabe(X) && (!Y || cabe(Y));
  const zoom = (k) => entra(con(k)) && alVentana(con(k));
  const e = m.estudio;
  return (
    <div className="gr-lamina">
      <Plano x={m.X} y={m.Y} igual={m.igual} proporcion={0.62} maxAlto={520} etiqueta={etiqueta}>
        {(p) => <Dibujo m={m} p={p} alVentana={alVentana} />}
      </Plano>
      <div className="gr-pie">
        <ul className="graf-leyenda gr-leyenda">
          {m.trazos
            .filter((t) => t.tipo !== 'puntos' || t.unir)
            .map((t) => (
              <li key={t.id}>
                <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                  <line x1="1" x2="27" y1="5" y2="5" className={`gr-serie gr-serie--${t.serie}`} />
                </svg>
                <span>
                  <Nombre t={t} />
                </span>
              </li>
            ))}
          {m.tangente && (
            <li>
              <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <line x1="1" x2="27" y1="5" y2="5" className="graf__metodo" />
              </svg>
              la tangente
            </li>
          )}
          {e && e.verticales.length + e.lejos.length > 0 && (
            <li>
              <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <line x1="1" x2="27" y1="5" y2="5" className="graf__guia" />
              </svg>
              {`asíntotas de ${m.f.nombre}`}
            </li>
          )}
          {e?.extremos.length > 0 && (
            <li>
              <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <circle cx="14" cy="5" r="4" className="graf__punto graf__punto--lleno" />
              </svg>
              máximos y mínimos
            </li>
          )}
          {e?.inflexiones.length > 0 && (
            <li>
              <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
                <circle cx="14" cy="5" r="4" className="graf__punto" />
              </svg>
              inflexión
            </li>
          )}
        </ul>
        <div className="gr-mandos" role="group" aria-label="Ventana del gráfico">
          {m.alturaFija && (
            <Mando nombre="Ajustar la altura" alTocar={alturaSola} />
          )}
          <Mando nombre="Alejar" icono="menos" apagado={!entra(con(1.25))} alTocar={() => zoom(1.25)} />
          <Mando nombre="Acercar" icono="mas" apagado={!entra(con(0.8))} alTocar={() => zoom(0.8)} />
        </div>
      </div>
    </div>
  );
}

// ---------- The study, step by step ----------
const Suelta = ({ children }) => <p className="calc-hoja__suelta">{children}</p>;
const Cuenta = ({ children }) => <p className="calc-hoja__cuenta an-cuenta">{children}</p>;

function Asintotas({ e, f }) {
  return asintotas(e, f).map((frase) => <Suelta key={frase}>{frase}</Suelta>);
}

function Estudio({ m }) {
  const e = m.estudio;
  const f = m.f.nombre;
  const [crece, decrece, constante] = [intervalos(e.crecimiento, 1), intervalos(e.crecimiento, -1), intervalos(e.crecimiento, 0)];
  const [arriba, abajo] = [intervalos(e.concavidad, 1), intervalos(e.concavidad, -1)];
  const t = m.tangente;
  const a = m.area;
  const piso = m.g ? m.g.nombre : 'el eje x';
  return (
    <Pasos>
      <Paso titulo="La función">
        <Cuenta>
          {f}(x) = <Formula nodo={e.nodo} />
        </Cuenta>
        <Cuenta>
          {`${f}'(x) = `}
          <Formula nodo={e.nodoD} />
        </Cuenta>
        <Cuenta>
          {`${f}''(x) = `}
          <Formula nodo={e.nodoD2} />
        </Cuenta>
      </Paso>
      <Paso titulo="Dominio">
        <Suelta>{e.huecos.length ? `${f} no da un número real ${lista(e.huecos.map((h) => hueco(h, e.X)))}.` : `En esta ventana, ${f} da un número real en todo x.`}</Suelta>
        <p className="calc-hoja__nota">{`Lo que sigue se busca en la ventana, de x = ${n(e.X[0])} a x = ${n(e.X[1])}. Los valores con ≈ son aproximados.`}</p>
      </Paso>
      <Paso titulo="Intersección con los ejes">
        <Suelta>{e.ordenada === null ? `${f} no está definida en x = 0. No corta al eje y.` : `Con el eje y, ${f}(0) ${igualA(e.ordenada)}. Corta en ${par(0, e.ordenada)}.`}</Suelta>
        <Suelta>{e.ceros.length ? `Con el eje x, ${f}(x) = 0 en ${lista(e.ceros.map((c) => `x ${igualA(c)}`))}.` : 'No corta al eje x en esta ventana.'}</Suelta>
      </Paso>
      {e.paridad && (
        <Paso titulo="Paridad">
          {e.paridad.tipo === 'dominio' ? (
            <Suelta>{`${f} está definida en x = ${n(e.paridad.x)} y no en x = ${n(-e.paridad.x)}. El dominio no es simétrico respecto del origen. No es par ni impar.`}</Suelta>
          ) : (
            <>
              <Cuenta>{`${f}(${n(e.paridad.x)}) ${igualA(e.paridad.fx)} y ${f}(${n(-e.paridad.x)}) ${igualA(e.paridad.fmx)}`}</Cuenta>
              <Suelta>
                {e.paridad.tipo === 'par' && `${f}(−x) = ${f}(x). Es par, simétrica respecto del eje y.`}
                {e.paridad.tipo === 'impar' && `${f}(−x) = −${f}(x). Es impar, simétrica respecto del origen.`}
                {e.paridad.tipo === 'ninguna' && 'No es par ni impar.'}
              </Suelta>
            </>
          )}
        </Paso>
      )}
      <Paso titulo="Asíntotas">
        <Asintotas e={e} f={f} />
      </Paso>
      <Paso titulo="Crecimiento y extremos">
        {crece.length > 0 && <Suelta>{`${f}' > 0 y ${f} crece en ${lista(crece)}.`}</Suelta>}
        {decrece.length > 0 && <Suelta>{`${f}' < 0 y ${f} decrece en ${lista(decrece)}.`}</Suelta>}
        {constante.length > 0 && <Suelta>{`${f}' = 0 y ${f} es constante en ${lista(constante)}.`}</Suelta>}
        {e.extremos.map((x) => (
          <Suelta key={x.x}>{`${x.tipo === 'max' ? 'Máximo' : 'Mínimo'} relativo en ${par(x.x, x.y)}${x.derivada === 'cero' ? '' : `, donde ${f}' no existe`}.`}</Suelta>
        ))}
        {!e.extremos.length && <Suelta>No tiene extremos relativos en esta ventana.</Suelta>}
      </Paso>
      <Paso titulo="Concavidad e inflexión">
        {arriba.length > 0 && <Suelta>{`${f}'' > 0 y ${f} es cóncava hacia arriba en ${lista(arriba)}.`}</Suelta>}
        {abajo.length > 0 && <Suelta>{`${f}'' < 0 y ${f} es cóncava hacia abajo en ${lista(abajo)}.`}</Suelta>}
        {!arriba.length && !abajo.length && <Suelta>{`${f}'' da 0 en toda la ventana. No hay concavidad.`}</Suelta>}
        {e.inflexiones.length > 0 && <Suelta>{`${e.inflexiones.length > 1 ? 'Puntos' : 'Punto'} de inflexión en ${lista(e.inflexiones.map((q) => par(q.x, q.y)))}.`}</Suelta>}
        {!e.inflexiones.length && (arriba.length > 0 || abajo.length > 0) && <Suelta>No tiene puntos de inflexión en esta ventana.</Suelta>}
      </Paso>
      {t && (
        <Paso titulo={`La recta tangente en x₀ = ${n(t.x0)}`}>
          <Cuenta>{`${f}(${n(t.x0)}) ${igualA(t.y0)} y ${f}'(${n(t.x0)}) ${igualA(t.m)}`}</Cuenta>
          <Cuenta>{`y = ${f}(x₀) + ${f}'(x₀)(x − x₀)`}</Cuenta>
          <Cuenta>
            {`y = ${n(t.y0)} ${t.m < 0 ? '−' : '+'} ${n(Math.abs(t.m))}(x ${t.x0 < 0 ? '+' : '−'} ${n(Math.abs(t.x0))}), o sea `}
            <span className="cuenta-fin">{recta(t.m, t.b)}</span>
          </Cuenta>
        </Paso>
      )}
      {a && (
        <Paso titulo={`El área entre ${f} y ${piso}`}>
          {m.g && <Suelta>{a.cortes.length ? `Se cruzan en ${lista(a.cortes.map((c) => `x ${igualA(c)}`))}. Ahí se parte la integral.` : `Entre ${n(a.a)} y ${n(a.b)} no se cruzan.`}</Suelta>}
          {a.tramos.map((tr) => {
            const [arribaDe, abajoDe] = tr.techo === 'f' ? [`${f}(x)`, m.g ? `${m.g.nombre}(x)` : null] : [m.g ? `${m.g.nombre}(x)` : null, `${f}(x)`];
            const integrando = arribaDe && abajoDe ? `[${arribaDe} − ${abajoDe}]` : arribaDe ? arribaDe : `[−${abajoDe}]`;
            return (
              <Cuenta key={tr.a}>
                <span aria-hidden="true">
                  ∫<sub>{n(tr.a)}</sub>
                  <sup>{n(tr.b)}</sup>
                  {` ${integrando} dx ≈ `}
                </span>
                <span className="solo-lectores">{`De ${n(tr.a)} a ${n(tr.b)}, la integral de techo menos piso da aproximadamente `}</span>
                {n(tr.valor)}
              </Cuenta>
            );
          })}
          <Cuenta>
            {'A ≈ '}
            <span className="cuenta-fin">{n(a.total)}</span>
          </Cuenta>
        </Paso>
      )}
    </Pasos>
  );
}

// ---------- The board ----------
/** «x de −5 a 5»: the two ends of a range, each with its own name for a screen reader. */
/** One thing of the board, with what its kind asks for and its own way out. */
function Fila({ t, i, nombre, error, cambiar, borrar, enfocar }) {
  const id = useId();
  const caja = useRef(null);
  useEffect(() => {
    if (enfocar) caja.current?.querySelector('input')?.focus();
  }, [enfocar]);
  const mal = (campo) => error?.campo === `t${i}.${campo}`;
  const delTrazo = error?.campo.startsWith(`t${i}.`);
  const errorId = `${id}-e`;
  const formula = (campo, etiqueta, decir, maximo) => (
    <Escribir id={`${id}-${campo}`} nombre={etiqueta} decir={decir} valor={t[campo]} alCambiar={cambiar(campo)} invalido={mal(campo)} errorId={errorId} maximo={maximo} />
  );
  const rango = (
    <Entre
      id={`${id}-t`}
      nombre="t"
      decir="el parámetro t"
      desde={t.t0}
      hasta={t.t1}
      alDesde={cambiar('t0')}
      alHasta={cambiar('t1')}
      malDesde={mal('t0')}
      malHasta={mal('t1')}
      errorId={errorId}
    />
  );
  const queEs = { funcion: `${nombre}(x)`, ecuacion: 'la ecuación', parametrica: 'la curva paramétrica', polar: 'la curva polar', puntos: 'los puntos' }[t.tipo];
  return (
    <li className="gr-trazo" ref={caja}>
      <div className="gr-trazo__campos">
        {t.tipo === 'funcion' && formula('f', `${nombre}(x)`)}
        {t.tipo === 'ecuacion' && (
          <Ecuacion id={`${id}-e0`} valor={t.e} alCambiar={cambiar('e')} invalido={mal('e')} errorId={errorId} />
        )}
        {t.tipo === 'parametrica' && (
          <>
            {formula('x', 'x(t)')}
            {formula('y', 'y(t)')}
            {rango}
          </>
        )}
        {t.tipo === 'polar' && (
          <>
            {formula('r', 'r(t)', 'el radio según el ángulo t')}
            {rango}
          </>
        )}
        {t.tipo === 'puntos' && (
          <>
            {formula('p', 'P', 'los puntos', 400)}
            <label className="gr-trazo__casilla">
              <input type="checkbox" checked={t.unir} onChange={(ev) => cambiar('unir')(ev.target.checked)} />
              <span>Unirlos en una figura</span>
            </label>
          </>
        )}
        <ErrorDe id={errorId} texto={delTrazo && error.texto} />
      </div>
      <Borrar queEs={queEs} renglon={i + 1} alBorrar={borrar} />
    </li>
  );
}

export default function Graficadora() {
  const [estado, setEstado] = useRecordado('calc:graficadora', INICIAL);
  const sumar = useRef(null);
  const id = useId();
  const m = useMemo(() => leerTablero(estado), [estado]);
  const visto = useUltimoBueno(m);
  // Consultron reads the drawing as text.
  usePantallaDeConsultron(useMemo(() => enTexto(visto), [visto]));
  const { recien, lleno, borrado, agregar, borrar, deshacer, olvidar } = useRenglones(estado, setEstado, MAX_TRAZOS, nuevoTrazo);
  const error = m.error;
  const mal = (campo) => error?.campo === campo;
  const cambiar = (campo) => (v) => setEstado((e) => ({ ...e, [campo]: v }));
  const cambiarTrazo = (idTrazo) => (campo) => (v) => setEstado((e) => ({ ...e, trazos: e.trazos.map((t) => (t.id === idTrazo ? { ...t, [campo]: v } : t)) }));
  // The window stays where it can be drawn: dragging or zooming past the end does nothing.
  const alVentana = ([X, Y]) =>
    cabe(X) &&
    (!Y || cabe(Y)) &&
    setEstado((e) => ({
      ...e,
      x0: paraCampo(X[0], X[1] - X[0]),
      x1: paraCampo(X[1], X[1] - X[0]),
      ...(Y ? { y0: paraCampo(Y[0], Y[1] - Y[0]), y1: paraCampo(Y[1], Y[1] - Y[0]) } : {}),
    }));

  let cuantas = 0;
  const nombres = estado.trazos.map((t) => (t.tipo === 'funcion' ? ['f', 'g', 'h', 'p', 'q', 's'][cuantas++] : null));
  const hayFuncion = cuantas > 0;
  const malVentana = error && ['x0', 'x1', 'y0', 'y1'].includes(error.campo);
  const malSobre = error && ['tangente', 'areaA', 'areaB'].includes(error.campo);

  return (
    <>
      <section className="calc__ejercicio" aria-labelledby="ejercicio-titulo">
        <h2 id="ejercicio-titulo" className="calc__titulo">El ejercicio</h2>
        <div className="calc__campos">
          {estado.trazos.length > 0 && (
            <ul className="gr-trazos">
              {estado.trazos.map((t, i) => (
                <Fila key={t.id} t={t} i={i} nombre={nombres[i]} error={error} cambiar={cambiarTrazo(t.id)} borrar={() => borrar(t.id)} enfocar={recien === t.id} />
              ))}
            </ul>
          )}
          <Sumar
            id={`${id}-sumar`}
            caja={sumar}
            tipos={TIPOS}
            nombres={NOMBRES_TIPO}
            lleno={lleno}
            hay={estado.trazos.length > 0}
            alSumar={agregar}
            alDeshacer={borrado === null ? null : deshacer}
            claveDeshacer={borrado}
          />
          <p className="campo__ayuda pz-ayuda">
            {lleno ? `Entran hasta ${MAX_TRAZOS}. ` : ''}
            Una función va con x, como <code>x^3 - 3x</code>. Una ecuación, con x e y, como <code>x^2 + y^2 = 9</code>. Los puntos, como <code>(0; 0) (3; 0) (0; 4)</code>.
          </p>
          <Renglon titulo="La ventana" error={malVentana && error.texto} errorId={`${id}-ev`}>
            <Entre id={`${id}-x`} nombre="x" decir="la ventana en x" desde={estado.x0} hasta={estado.x1} alDesde={cambiar('x0')} alHasta={cambiar('x1')} malDesde={mal('x0')} malHasta={mal('x1')} errorId={`${id}-ev`} />
            <Entre id={`${id}-y`} nombre="y" decir="la ventana en y" desde={estado.y0} hasta={estado.y1} alDesde={cambiar('y0')} alHasta={cambiar('y1')} malDesde={mal('y0')} malHasta={mal('y1')} errorId={`${id}-ev`} vacio="sola" />
          </Renglon>
          {hayFuncion && (
            <>
              <Renglon titulo="Sobre f" error={malSobre && error.texto} errorId={`${id}-es`}>
                <Dato id={`${id}-tg`} nombre="x₀" decir="donde va la recta tangente" ancho={4.25} valor={estado.tangente} alCambiar={cambiar('tangente')} invalido={mal('tangente')} errorId={`${id}-es`} />
                <Dato id={`${id}-aa`} nombre="a" decir="donde empieza el área" ancho={4.25} valor={estado.areaA} alCambiar={cambiar('areaA')} invalido={mal('areaA')} errorId={`${id}-es`} />
                <Dato id={`${id}-ab`} nombre="b" decir="donde termina el área" ancho={4.25} valor={estado.areaB} alCambiar={cambiar('areaB')} invalido={mal('areaB')} errorId={`${id}-es`} />
              </Renglon>
              <p className="campo__ayuda pz-ayuda">x₀ suma la recta tangente a f. a y b, el área entre f y g. Sin g, entre f y el eje x.</p>
            </>
          )}
        </div>
        <Ejemplos
          ejemplos={EJEMPLOS}
          alElegir={({ nombre: _n, ...e }) => {
            setEstado(e);
            olvidar();
          }}
        />
      </section>

      {visto && !visto.vacio && (
        <Hoja titulo="El gráfico y el estudio">
          {/* With a mistake on the board, what was drawn before waits, dimmed. */}
          <div className={error ? 'gr-espera' : undefined}>
            <Lamina m={visto} alVentana={alVentana} alturaSola={() => setEstado((e) => ({ ...e, y0: '', y1: '' }))} />
            <Anuncio texto={error ? '' : `Gráfico con ${cuenta(visto.trazos, CUANTOS)}.`} />
            {visto.estudio && <Estudio m={visto} />}
          </div>
        </Hoja>
      )}
    </>
  );
}
