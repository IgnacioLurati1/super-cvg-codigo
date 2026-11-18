import { Fragment, useId, useLayoutEffect, useRef, useState } from 'react';
import { piezas } from '../../../lib/calculadoras/formula';
import { dec } from '../../../lib/calculadoras/decimales';
import './_an-grafico.css';

// What the analysis and physics calculators draw on the sheet: a graph drawn by hand on the squared paper, with its axes
// in pencil, the curve in pen and the construction of each method in red; arrows of a field; the formulas as they're
// written in the notes. The leading «_» keeps this file out of the calculators.

/** A round step for the marks of an axis: 1, 2 or 5 times a power of ten. */
export function pasoRedondo(ancho, cuantas) {
  const crudo = ancho / Math.max(1, cuantas);
  const base = 10 ** Math.floor(Math.log10(crudo));
  return [1, 2, 5, 10].map((k) => k * base).find((k) => k >= crudo * 0.999) ?? 10 * base;
}

/** [min, max] of the values, with a margin; a range with no width becomes ±1 around it. */
export function rango(valores, margen = 0.1) {
  const v = valores.filter((x) => Number.isFinite(x) && Math.abs(x) < 1e9);
  if (!v.length) return [-1, 1];
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const d = (hi - lo) * margen;
  return [lo - d, hi + d];
}

/** The vertical range of f over [a, b], with 0 inside. A pole doesn't flatten the rest: the extremes are cut. */
export function rangoDe(f, [a, b], extra = []) {
  const v = [0, ...extra];
  for (let i = 0; i <= 200; i += 1) {
    const w = f(a + ((b - a) * i) / 200);
    if (Number.isFinite(w) && Math.abs(w) < 1e9) v.push(w);
  }
  v.sort((p, q) => p - q);
  const q = (p) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return v[v.length - 1] - v[0] > 40 * (q(0.95) - q(0.05)) + 1e-9 ? rango([q(0.05), q(0.95), 0], 0.25) : rango(v, 0.1);
}

/** The path of y = f(x) on [a, b], cut where f isn't defined or jumps (a pole). */
export function camino(f, [a, b], sx, sy, muestras = 360) {
  const d = [];
  let previo = null;
  for (let i = 0; i <= muestras; i += 1) {
    const x = a + ((b - a) * i) / muestras;
    const y = f(x);
    const py = Number.isFinite(y) ? sy(y) : NaN;
    const sigue = Number.isFinite(py) && Math.abs(py) < 1e5;
    if (sigue) d.push(`${previo !== null && Math.abs(py - previo) < 2000 ? 'L' : 'M'}${sx(x).toFixed(1)} ${py.toFixed(1)}`);
    previo = sigue ? py : null;
  }
  return d.join('');
}

/** A broken line through points already on the sheet. */
export const linea = (puntos) => puntos.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** The width of the box, measured before painting and again whenever it changes. */
function useAncho() {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setAncho(Math.round(el.clientWidth));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [caja, ancho];
}

/**
 * A plane drawn on the sheet: axes, their marks and numbers, and what `children(plano)` draws inside, clipped to the
 * area. `igual`: the same scale on both axes, so angles and circles look as they are. `etiqueta` says what matters to a
 * screen reader. `evitar`: values of x whose own name goes under the axis, so the numbers there step aside.
 */
export function Plano({ x, y, igual = false, proporcion = 0.56, maxAlto = 440, etiqueta, nombreX = 'x', nombreY = 'y', formatoX, formatoY, evitar = [], children }) {
  const [caja, W] = useAncho();
  const id = useId().replace(/:/g, '');
  // Taller on the phone, where the sheet is narrow.
  const H = Math.round(Math.max(220, Math.min(W * (W < 520 ? Math.max(proporcion, 0.82) : proporcion), maxAlto)));
  let [x0, x1] = x;
  let [y0, y1] = y;
  const numX = formatoX ?? ((v) => dec(v, 6));
  const numY = formatoY ?? ((v) => dec(v, 6));
  // Room on the left for the longest number of the vertical axis.
  const pasoYTentativo = pasoRedondo(y1 - y0, 6);
  const largo = Math.max(...[y0, y1, (y0 + y1) / 2].map((v) => numY(Math.round(v / pasoYTentativo) * pasoYTentativo).length));
  const m = { i: Math.max(30, 8 + largo * 7.2), d: 12, a: 12, b: 30 };
  const anchoUtil = Math.max(1, W - m.i - m.d);
  const altoUtil = Math.max(1, H - m.a - m.b);
  if (igual) {
    const k = Math.min(anchoUtil / (x1 - x0), altoUtil / (y1 - y0));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    x0 = cx - anchoUtil / k / 2;
    x1 = cx + anchoUtil / k / 2;
    y0 = cy - altoUtil / k / 2;
    y1 = cy + altoUtil / k / 2;
  }
  const sx = (v) => m.i + ((v - x0) / (x1 - x0)) * anchoUtil;
  const sy = (v) => m.a + ((y1 - v) / (y1 - y0)) * altoUtil;
  const pasoX = pasoRedondo(x1 - x0, W < 420 ? 4 : 8);
  const pasoY = pasoRedondo(y1 - y0, H < 300 ? 4 : 6);
  const marcas = (a, b, p) => {
    const out = [];
    for (let v = Math.ceil(a / p - 1e-9) * p; v <= b + 1e-9 * p; v += p) out.push(Math.abs(v) < p * 1e-9 ? 0 : Number(v.toPrecision(12)));
    return out;
  };
  const ejeX = y0 <= 0 && y1 >= 0 ? sy(0) : sy(y0);
  const ejeY = x0 <= 0 && x1 >= 0 ? sx(0) : sx(x0);
  const area = { l: m.i, t: m.a, r: W - m.d, b: H - m.b };
  const plano = { sx, sy, X: [x0, x1], Y: [y0, y1], area, W, H, recorte: `url(#${id})` };

  return (
    <div ref={caja} className="graf">
      {W > 0 && (
        <svg className="graf__lamina" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={etiqueta}>
          <defs>
            <clipPath id={id}>
              <rect x={area.l} y={area.t} width={area.r - area.l} height={area.b - area.t} />
            </clipPath>
          </defs>
          <g aria-hidden="true">
            {marcas(x0, x1, pasoX).map((v) => (
              <g key={`x${v}`}>
                <line className="graf__marca" x1={sx(v)} x2={sx(v)} y1={ejeX - 4} y2={ejeX + 4} />
                {v !== 0 && !evitar.some((e) => Math.abs(sx(e) - sx(v)) < 22) && (
                  <text className="graf__numero" x={sx(v)} y={Math.min(H - 6, ejeX + 18)} textAnchor="middle">
                    {numX(v)}
                  </text>
                )}
              </g>
            ))}
            {marcas(y0, y1, pasoY).map((v) => (
              <g key={`y${v}`}>
                <line className="graf__marca" x1={ejeY - 4} x2={ejeY + 4} y1={sy(v)} y2={sy(v)} />
                {v !== 0 && (
                  <text className="graf__numero" x={Math.max(m.i - 6, ejeY - 7)} y={sy(v) + 4} textAnchor="end">
                    {numY(v)}
                  </text>
                )}
              </g>
            ))}
            <line className="graf__eje" x1={area.l} x2={area.r} y1={ejeX} y2={ejeX} />
            <line className="graf__eje" x1={ejeY} x2={ejeY} y1={area.t} y2={area.b} />
            {x0 <= 0 && x1 >= 0 && y0 <= 0 && y1 >= 0 && (
              <text className="graf__numero" x={sx(0) - 6} y={sy(0) + 16} textAnchor="end">
                0
              </text>
            )}
            <text className="graf__nombre-eje" x={area.r} y={ejeX - 7} textAnchor="end">
              {nombreX}
            </text>
            <text className="graf__nombre-eje" x={ejeY + 7} y={area.t + 12}>
              {nombreY}
            </text>
            {children(plano)}
          </g>
        </svg>
      )}
    </div>
  );
}

/** An arrow from (x1, y1) to (x2, y2), already on the sheet, with its tip. */
export function Vector({ x1, y1, x2, y2, className = '', punta = 7 }) {
  const l = Math.hypot(x2 - x1, y2 - y1);
  if (!(l > 0.5)) return null;
  const ux = (x2 - x1) / l;
  const uy = (y2 - y1) / l;
  const p = Math.min(punta, l * 0.5);
  const a = p * 0.55;
  return (
    <g className={`graf__vector ${className}`.trim()}>
      <line x1={x1} y1={y1} x2={x2 - ux * p * 0.6} y2={y2 - uy * p * 0.6} />
      <path d={`M${x2} ${y2}L${x2 - ux * p - uy * a} ${y2 - uy * p + ux * a}L${x2 - ux * p + uy * a} ${y2 - uy * p - ux * a}Z`} />
    </g>
  );
}

/** A name written next to what it names, with an edge of paper so the lines below don't cross it. */
export function Rotulo({ x, y, children, ancla = 'middle', className = '' }) {
  return (
    <text className={`graf__rotulo ${className}`.trim()} x={x} y={y} textAnchor={ancla}>
      {children}
    </text>
  );
}

/** What each line of a graph is: a piece of the same line and its name. */
export function Leyenda({ items }) {
  return (
    <ul className="graf-leyenda">
      {items.map((it) => (
        <li key={it.texto}>
          <svg viewBox="0 0 28 10" width="28" height="10" aria-hidden="true">
            {it.punto ? <circle cx="14" cy="5" r="4" className={it.clase} /> : <line x1="1" x2="27" y1="5" y2="5" className={it.clase} />}
          </svg>
          {it.texto}
        </li>
      ))}
    </ul>
  );
}

/** Back and forth between the iterations a graph shows: «Iteración 2 de 6». */
export function Recorrer({ actual, total, alCambiar, nombre = 'Iteración', primero = 1 }) {
  if (total < 2) return null;
  return (
    <div className="graf-recorrer" role="group" aria-label={`${nombre} del gráfico`}>
      <button type="button" className="graf-recorrer__boton" aria-label="Anterior" aria-disabled={actual <= 0} onClick={actual <= 0 ? undefined : () => alCambiar(actual - 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <output className="graf-recorrer__cual" aria-live="polite">
        {`${nombre} ${actual + primero} de ${total - 1 + primero}`}
      </output>
      <button type="button" className="graf-recorrer__boton" aria-label="Siguiente" aria-disabled={actual >= total - 1} onClick={actual >= total - 1 ? undefined : () => alCambiar(actual + 1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}

// ---------- Formulas ----------
function Piezas({ lista }) {
  return lista.map((p, i) => {
    if (typeof p === 'string') return <Fragment key={i}>{p}</Fragment>;
    if (p.par) {
      return (
        <Fragment key={i}>
          (<Piezas lista={p.par} />)
        </Fragment>
      );
    }
    return (
      <Fragment key={i}>
        <span className="solo-lectores"> a la </span>
        <sup>
          <Piezas lista={p.sup} />
        </sup>
      </Fragment>
    );
  });
}

/** A formula as the notes write it: −2x³ + 12x² − 20x + 8,5, e⁻ˣ − x, with the exponents raised. */
export function Formula({ nodo }) {
  return (
    <span className="fx">
      <Piezas lista={piezas(nodo)} />
    </span>
  );
}
