import { useId, useLayoutEffect, useRef, useState } from 'react';
import { coma } from '../../../lib/calculadoras/cifras';
import './_est-dibujo.css';

// The drawings on the sheet of the statistics, stocks and simulation calculators: axes in the sheet's soft ink, curves
// in ink, an area marked with the highlighter, sticks, steps. Drawn at the real width of the sheet, so the letters keep
// their size on the phone. Each drawing is an image with a description that says what matters.

/** A round step for the marks of an axis: 1, 2 or 5 by a power of ten. */
export function pasoLindo(bruto) {
  if (!(bruto > 0) || !Number.isFinite(bruto)) return 1;
  const p = 10 ** Math.floor(Math.log10(bruto));
  const m = bruto / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

/** Round marks between a and b, about `cuantas` of them. */
export function marcas(a, b, cuantas = 5) {
  const paso = pasoLindo((b - a) / Math.max(1, cuantas));
  const salida = [];
  for (let v = Math.ceil(a / paso - 1e-9) * paso; v <= b + paso * 1e-9; v += paso) salida.push(Math.round(v / paso) * paso);
  return salida;
}

/** The real width of a drawing and the root font size, measured again when they change. */
export function useMedida() {
  const caja = useRef(null);
  const [medida, setMedida] = useState({ ancho: 0, letra: 16 });
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => {
      const letra = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const ancho = Math.round(el.clientWidth);
      setMedida((m) => (m.ancho === ancho && m.letra === letra ? m : { ancho, letra }));
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return [caja, medida];
}

/** Marks given one by one keep one every few when their numbers wouldn't fit side by side. */
function ralear(ticks, X, formato, fs) {
  if (ticks.length < 3) return ticks;
  const ancho = Math.max(...ticks.map((v) => formato(v).length)) * fs * 0.62 + fs * 0.6;
  const lugar = Math.abs(X(ticks[1]) - X(ticks[0]));
  const cada = Math.ceil(ancho / Math.max(1, lugar));
  return cada <= 1 ? ticks : ticks.filter((_, i) => i % cada === 0);
}

/**
 * The frame: axes from x[0] to x[1] and from y[0] to y[1], their marks and names. `children(e)` draws with the
 * scales: e.X(valor), e.Y(valor), and e.recorte to keep a curve inside the frame.
 */
export function Grafico({ etiqueta, alto = 240, x, y, nombreX, nombreY, marcasX, marcasY, formatoX = (v) => coma(v, 4), formatoY = (v) => coma(v, 4), children }) {
  const [caja, { ancho, letra }] = useMedida();
  const id = useId().replace(/:/g, '');
  const fs = Math.round(letra * 0.8125);
  const [x0, x1] = x;
  const [y0, y1] = y;
  const altoReal = Math.round((alto * letra) / 16);
  const ticksY = marcasY ?? marcas(y0, y1, Math.max(2, Math.floor(altoReal / (fs * 3.2))));
  const largoY = Math.max(1, ...ticksY.map((v) => formatoY(v).length));
  const izq = Math.round(fs * (0.62 * largoY + 1.1));
  const der = ancho - Math.round(fs * 1.4);
  // With the y name, it gets its own row on top: the names of the guides go in the row below and never touch it.
  const arriba = Math.round(fs * (nombreY ? 3.1 : 1.9));
  const abajo = altoReal - Math.round(fs * 3);
  const X = (v) => izq + ((v - x0) / (x1 - x0 || 1)) * (der - izq);
  const Y = (v) => abajo - ((v - y0) / (y1 - y0 || 1)) * (abajo - arriba);
  const ticksX = ralear(marcasX ?? marcas(x0, x1, Math.max(2, Math.floor((der - izq) / (fs * 4.2)))), X, formatoX, fs);
  const e = { X, Y, x0, x1, y0, y1, izq, der, arriba, abajo, fs, recorte: `url(#${id}-r)` };
  return (
    <div className="ce-graf" ref={caja}>
      {ancho > 0 && (
        <svg className="ce-graf__svg" role="img" aria-label={etiqueta} width={ancho} height={altoReal} viewBox={`0 0 ${ancho} ${altoReal}`} style={{ '--ce-fs': `${fs}px` }}>
          <defs>
            <clipPath id={`${id}-r`}>
              <rect x={izq} y={arriba - fs * 0.5} width={Math.max(0, der - izq)} height={Math.max(0, abajo - arriba + fs * 0.5)} />
            </clipPath>
          </defs>
          <g className="ce-graf__ejes" aria-hidden="true">
            <line x1={izq} x2={der} y1={Y(Math.max(y0, Math.min(0, y1)))} y2={Y(Math.max(y0, Math.min(0, y1)))} />
            <line x1={izq} x2={izq} y1={nombreY ? fs * 1.5 : arriba - fs * 0.4} y2={abajo} />
            {ticksX.map((v) => (
              <g key={`x${v}`}>
                <line x1={X(v)} x2={X(v)} y1={abajo} y2={abajo + 5} />
                <text x={X(v)} y={abajo + fs * 1.45} textAnchor="middle">{formatoX(v)}</text>
              </g>
            ))}
            {ticksY.map((v) => (
              <g key={`y${v}`}>
                <line x1={izq - 5} x2={izq} y1={Y(v)} y2={Y(v)} />
                <text x={izq - 8} y={Y(v) + fs * 0.35} textAnchor="end">{formatoY(v)}</text>
              </g>
            ))}
            {nombreX && <text className="ce-graf__nombre" x={der} y={altoReal - fs * 0.35} textAnchor="end">{nombreX}</text>}
            {nombreY && <text className="ce-graf__nombre" x={izq + 6} y={fs * 1.15}>{nombreY}</text>}
          </g>
          {children(e)}
        </svg>
      )}
    </div>
  );
}

/** f between desde and hasta, sampled. */
const camino = (e, f, desde, hasta, n) => {
  let d = '';
  let afuera = true;
  for (let k = 0; k <= n; k += 1) {
    const v = desde + ((hasta - desde) * k) / n;
    const w = f(v);
    if (!Number.isFinite(w)) {
      afuera = true;
      continue;
    }
    const yy = Math.max(e.arriba - 4000, Math.min(e.abajo + 4000, e.Y(w)));
    d += `${afuera ? 'M' : 'L'}${e.X(v).toFixed(1)} ${yy.toFixed(1)}`;
    afuera = false;
  }
  return d;
};

export function Curva({ e, f, desde = e.x0, hasta = e.x1, tono = 'tinta', n = 240 }) {
  return <path className="ce-graf__curva" data-tono={tono} d={camino(e, f, desde, hasta, n)} clipPath={e.recorte} />;
}

/** The area between f and the axis, from desde to hasta, with the highlighter. */
export function Relleno({ e, f, desde, hasta, n = 160 }) {
  const a = Math.max(desde, e.x0);
  const b = Math.min(hasta, e.x1);
  if (!(b > a)) return null;
  const base = e.Y(Math.max(e.y0, 0));
  const d = `M${e.X(a).toFixed(1)} ${base.toFixed(1)}${camino(e, f, a, b, n).replace(/^M/, 'L')}L${e.X(b).toFixed(1)} ${base.toFixed(1)}Z`;
  return <path className="ce-graf__relleno" d={d} clipPath={e.recorte} />;
}

/** A vertical line at x, dashed, with its name on top. */
export function Vertical({ e, x, texto, tono = 'tinta', fila = 0 }) {
  if (!(x >= e.x0 && x <= e.x1)) return null;
  const xx = e.X(x);
  const ancla = xx < e.izq + e.fs * 3 ? 'start' : xx > e.der - e.fs * 3 ? 'end' : 'middle';
  return (
    <g className="ce-graf__guia" data-tono={tono}>
      <line x1={xx} x2={xx} y1={e.arriba + fila * e.fs * 1.2} y2={e.abajo} />
      {texto && <text x={xx} y={e.arriba - e.fs * 0.3 + fila * e.fs * 1.2} textAnchor={ancla}>{texto}</text>}
    </g>
  );
}

/** A horizontal line at y, dashed, with its name at one end (`lado`: 'der' or 'izq'). */
export function Horizontal({ e, y, texto, tono = 'tinta', lado = 'der' }) {
  if (!(y >= e.y0 && y <= e.y1)) return null;
  const izquierda = lado === 'izq';
  return (
    <g className="ce-graf__guia" data-tono={tono}>
      <line x1={e.izq} x2={e.der} y1={e.Y(y)} y2={e.Y(y)} />
      {texto && (
        <text x={izquierda ? e.izq + e.fs * 0.5 : e.der} y={e.Y(y) - e.fs * 0.4} textAnchor={izquierda ? 'start' : 'end'}>
          {texto}
        </text>
      )}
    </g>
  );
}

/** A point with its name, above it. */
export function Punto({ e, x, y, texto }) {
  if (!(x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1)) return null;
  const xx = e.X(x);
  const ancla = xx < e.izq + e.fs * 3 ? 'start' : xx > e.der - e.fs * 3 ? 'end' : 'middle';
  return (
    <g className="ce-graf__punto">
      <circle cx={xx} cy={e.Y(y)} r={4.5} />
      {texto && <text x={xx} y={e.Y(y) - e.fs * 0.8} textAnchor={ancla}>{texto}</text>}
    </g>
  );
}

/** Sticks of a discrete distribution: one per value, the marked ones in the probability asked, thicker. */
export function Bastones({ e, puntos }) {
  const ancho = Math.max(2, Math.min(5, ((e.der - e.izq) / Math.max(1, puntos.length)) * 0.3));
  return (
    <g className="ce-graf__bastones">
      {puntos.map((p) => (
        <g key={p.x} data-marcado={p.marcado || undefined}>
          {p.marcado && <rect className="ce-graf__fondo" x={e.X(p.x) - ancho * 2} y={e.Y(p.y) - 6} width={ancho * 4} height={Math.max(0, e.Y(0) - e.Y(p.y) + 6)} rx={3} />}
          <line x1={e.X(p.x)} x2={e.X(p.x)} y1={e.Y(0)} y2={e.Y(p.y)} style={{ strokeWidth: p.marcado ? ancho + 1 : ancho }} />
          <circle cx={e.X(p.x)} cy={e.Y(p.y)} r={ancho * 0.9 + 1} />
        </g>
      ))}
    </g>
  );
}

/**
 * A level over time in steps, as I(t) or Q(t): each value holds until the next event. The area above zero in one tone
 * and below in another (I⁺ and I⁻), besides the line.
 */
export function Escalones({ e, puntos }) {
  let linea = '';
  const cajas = { mas: '', menos: '' };
  puntos.forEach((p, k) => {
    linea += k ? `H${e.X(p.t).toFixed(1)}V${e.Y(p.v).toFixed(1)}` : `M${e.X(p.t).toFixed(1)} ${e.Y(p.v).toFixed(1)}`;
    const sig = puntos[k + 1];
    if (sig && p.v && sig.t > p.t) {
      const caja = `M${e.X(p.t).toFixed(1)} ${e.Y(0).toFixed(1)}H${e.X(sig.t).toFixed(1)}V${e.Y(p.v).toFixed(1)}H${e.X(p.t).toFixed(1)}Z`;
      if (p.v > 0) cajas.mas += caja;
      else cajas.menos += caja;
    }
  });
  return (
    <g className="ce-graf__escalones">
      {cajas.mas && <path className="ce-graf__area" data-signo="mas" d={cajas.mas} />}
      {cajas.menos && <path className="ce-graf__area" data-signo="menos" d={cajas.menos} />}
      <path className="ce-graf__curva" data-tono="tinta" d={linea} />
    </g>
  );
}

/** The names of what's drawn, under the drawing: its line or its color and what it is. */
export function Referencias({ items }) {
  return (
    <ul className="ce-graf__referencias" aria-hidden="true">
      {items.map((r) => (
        <li key={r.texto}>
          <span className="ce-graf__muestra" data-tipo={r.tipo} data-tono={r.tono} />
          {r.texto}
        </li>
      ))}
    </ul>
  );
}

/**
 * The sticks of a discrete distribution with E(X) marked, as the notes draw them (V.A.D., pág. 4). `puntos`:
 * [{ x, y, marcado }]. Few values get a mark each on the axis.
 */
export function GraficoBastones({ puntos, esperanza, etiqueta, nombreX = 'x', nombreY = 'P(X = x)', alto = 230 }) {
  const xs = puntos.map((p) => p.x);
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const margen = Math.max(0.5, (max - min) * 0.04);
  const tope = Math.max(...puntos.map((p) => p.y), 1e-9) * 1.18;
  const enteros = xs.every(Number.isInteger) && max - min <= 16;
  return (
    <Grafico etiqueta={etiqueta} alto={alto} x={[min - margen, max + margen]} y={[0, tope]} nombreX={nombreX} nombreY={nombreY} marcasX={enteros ? xs : undefined} marcasY={marcas(0, tope, 3)}>
      {(e) => (
        <>
          {esperanza !== undefined && <Vertical e={e} x={esperanza} texto={`E(X) = ${coma(esperanza, 3)}`} />}
          <Bastones e={e} puntos={puntos} />
        </>
      )}
    </Grafico>
  );
}
