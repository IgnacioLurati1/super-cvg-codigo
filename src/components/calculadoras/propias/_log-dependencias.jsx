import { useLayoutEffect, useRef, useState } from 'react';
import { bits } from '../../../lib/calculadoras/dependencias';
import { Dibujo } from './_log-trazos';
import './_log-dependencias.css';

// The dependency diagram of Bases de Datos, as El Santo Resumen draws it (fuente/bases-de-datos/interactivos.js,
// diagrama): the attributes in a row and, under them, one line per DF, with a dot on what determines and an arrow to
// what it determines. On a narrow sheet the same diagram goes standing: the attributes one under the other and the DF
// to their right. The key is underlined. The leading «_» keeps this file out of the calculators.

const ALTO = 26;
const SEP = 10;
const M = 8;
const CARRIL = 15;
const MINIMO = 0.85;
const anchoDe = (a) => Math.max(40, Math.round(a.length * 7.6 + 18));

/** Where each DF touches an attribute: side by side when several DF use the same one. */
function corrimiento(attrs, dfs, medida) {
  const usos = attrs.map(() => []);
  dfs.forEach((d, i) => bits(d.izq | d.der).forEach((b) => usos[b].push(i)));
  return (b, i) => {
    const u = usos[b];
    const paso = Math.min(8, (medida(b) - 14) / Math.max(1, u.length - 1));
    return (u.indexOf(i) - (u.length - 1) / 2) * paso;
  };
}

function Caja({ x, y, w, texto, marcada, clave }) {
  return (
    <g className="dep-caja" data-marcada={marcada || undefined}>
      <rect x={x} y={y} width={w} height={ALTO} rx={3} className="dep-caja__borde" />
      <text x={x + w / 2} y={y + ALTO / 2} dy="0.35em" textAnchor="middle" fontSize="13" className="dep-caja__nombre">
        {texto}
      </text>
      {clave && <line x1={x + 7} x2={x + w - 7} y1={y + ALTO - 5} y2={y + ALTO - 5} className="dep-caja__subrayado" />}
    </g>
  );
}

function medidasAcostado(attrs, dfs) {
  const anchos = attrs.map(anchoDe);
  const xs = [];
  let x = M;
  anchos.forEach((w) => {
    xs.push(x);
    x += w + SEP;
  });
  const base = M + ALTO;
  return { anchos, xs, base, ancho: Math.max(120, x - SEP + M), alto: dfs.length ? base + 14 + (dfs.length - 1) * CARRIL + 10 : base + M };
}

function Acostado({ attrs, dfs, clave, resaltar, tipos, etiqueta }) {
  const { anchos, xs, base, ancho, alto } = medidasAcostado(attrs, dfs);
  const corre = corrimiento(attrs, dfs, (b) => anchos[b]);
  const lugar = (b, i) => xs[b] + anchos[b] / 2 + corre(b, i);
  return (
    <Dibujo ancho={ancho} alto={alto} etiqueta={etiqueta} minimo={MINIMO} maximo={1.3} className="dep-diagrama">
      {attrs.map((a, b) => (
        <Caja key={a} x={xs[b]} y={M} w={anchos[b]} texto={a} marcada={Boolean((resaltar >> b) & 1)} clave={Boolean((clave >> b) & 1)} />
      ))}
      {dfs.map((d, i) => {
        const y = base + 14 + i * CARRIL;
        const todos = bits(d.izq | d.der).map((b) => lugar(b, i));
        return (
          <g key={`${i}-${d.izq}-${d.der}`} className="dep-df" data-tipo={tipos?.[i] || undefined}>
            <line x1={Math.min(...todos)} x2={Math.max(...todos)} y1={y} y2={y} />
            {bits(d.izq).map((b) => (
              <g key={b}>
                <line x1={lugar(b, i)} x2={lugar(b, i)} y1={base} y2={y} />
                <circle cx={lugar(b, i)} cy={y} r={2.6} className="dep-df__punto" />
              </g>
            ))}
            {bits(d.der).map((b) => {
              const sx = lugar(b, i);
              return (
                <g key={b}>
                  <line x1={sx} x2={sx} y1={y} y2={base + 7} />
                  <polygon points={`${sx},${base + 1} ${sx - 4},${base + 8} ${sx + 4},${base + 8}`} className="dep-df__punta" />
                </g>
              );
            })}
          </g>
        );
      })}
    </Dibujo>
  );
}

function Parado({ attrs, dfs, clave, resaltar, tipos, etiqueta }) {
  const w = Math.max(...attrs.map(anchoDe));
  const ys = attrs.map((_, b) => M + b * (ALTO + SEP));
  const borde = M + w;
  const alto = M + attrs.length * (ALTO + SEP) - SEP + M;
  const ancho = dfs.length ? borde + 14 + (dfs.length - 1) * CARRIL + 10 : borde + M;
  const corre = corrimiento(attrs, dfs, () => ALTO);
  const lugar = (b, i) => ys[b] + ALTO / 2 + corre(b, i);
  return (
    <Dibujo ancho={ancho} alto={alto} etiqueta={etiqueta} minimo={1} maximo={1.15} className="dep-diagrama">
      {attrs.map((a, b) => (
        <Caja key={a} x={M} y={ys[b]} w={w} texto={a} marcada={Boolean((resaltar >> b) & 1)} clave={Boolean((clave >> b) & 1)} />
      ))}
      {dfs.map((d, i) => {
        const x = borde + 14 + i * CARRIL;
        const todos = bits(d.izq | d.der).map((b) => lugar(b, i));
        return (
          <g key={`${i}-${d.izq}-${d.der}`} className="dep-df" data-tipo={tipos?.[i] || undefined}>
            <line x1={x} x2={x} y1={Math.min(...todos)} y2={Math.max(...todos)} />
            {bits(d.izq).map((b) => (
              <g key={b}>
                <line x1={borde} x2={x} y1={lugar(b, i)} y2={lugar(b, i)} />
                <circle cx={x} cy={lugar(b, i)} r={2.6} className="dep-df__punto" />
              </g>
            ))}
            {bits(d.der).map((b) => {
              const sy = lugar(b, i);
              return (
                <g key={b}>
                  <line x1={x} x2={borde + 7} y1={sy} y2={sy} />
                  <polygon points={`${borde + 1},${sy} ${borde + 8},${sy - 4} ${borde + 8},${sy + 4}`} className="dep-df__punta" />
                </g>
              );
            })}
          </g>
        );
      })}
    </Dibujo>
  );
}

/**
 * The diagram of the relation. `clave` (underlined) and `resaltar` (with the highlighter) are sets of attributes;
 * `tipos`, per DF, 'parcial', 'transitiva' or ''. It goes lying down while it fits on the sheet, and standing if not.
 */
export function DiagramaDependencias({ attrs, dfs, clave = 0, resaltar = 0, tipos, etiqueta }) {
  const caja = useRef(null);
  const [lugar, setLugar] = useState(null);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const medir = () => setLugar(el.clientWidth);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  const entra = lugar === null || lugar >= medidasAcostado(attrs, dfs).ancho * MINIMO;
  const datos = { attrs, dfs, clave, resaltar, tipos, etiqueta };
  return (
    <div ref={caja} className="dep-lugar">
      {entra ? <Acostado {...datos} /> : <Parado {...datos} />}
    </div>
  );
}

/** What the marked lines of the diagram are, each with a piece of its line. */
export function LeyendaDependencias({ tipos = [] }) {
  const hay = new Set(tipos.filter(Boolean));
  if (!hay.size) return null;
  return (
    <ul className="dep-leyenda">
      {['parcial', 'transitiva'].filter((t) => hay.has(t)).map((t) => (
        <li key={t} className="dep-leyenda__uno">
          <span className="dep-leyenda__muestra" data-tipo={t} aria-hidden="true" />
          {t === 'parcial' ? 'Parcial' : 'Transitiva'}
        </li>
      ))}
    </ul>
  );
}
