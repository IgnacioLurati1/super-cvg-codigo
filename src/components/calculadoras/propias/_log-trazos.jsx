import { Desborde } from '../Hoja';
import './_log-trazos.css';

// What the logic, databases and languages calculators draw on the sheet, as on the classroom board or in the notes: the
// vertices as small circles with their name, the edges in ink and the arrows with their tip. And the pieces they share on
// the board: the keys for the symbols the phone doesn't have. The leading «_» keeps this file out of the calculators.

/**
 * A drawing on the sheet, in its natural size (or up to `maximo` times it, where there is room) and never smaller than
 * `minimo` of it: on a narrow phone it shrinks a bit and, past that, it scrolls on its own. `etiqueta` says the
 * important part for a screen reader.
 */
export function Dibujo({ ancho, alto, etiqueta, minimo = 0.78, maximo = 1, className = '', children }) {
  return (
    <Desborde etiqueta={etiqueta} className="trz-marco">
      <svg
        className={`trz-dibujo ${className}`.trim()}
        viewBox={`0 0 ${ancho} ${alto}`}
        style={{ maxWidth: `${Math.round(ancho * maximo)}px`, minWidth: `${Math.round(ancho * minimo)}px` }}
        role="img"
        aria-label={etiqueta}
      >
        {children}
      </svg>
    </Desborde>
  );
}

/** The points of an arrow's tip that ends at (x, y) going in the direction (ux, uy). */
export const punta = (x, y, ux, uy, largo = 9, ancho = 4.5) => `${x},${y} ${x - ux * largo - uy * ancho},${y - uy * largo + ux * ancho} ${x - ux * largo + uy * ancho},${y - uy * largo - ux * ancho}`;

/** A vertex: a circle with its name. `marca`: 'visto' (with the highlighter), 'ahora' (circled with the focus ink),
 * 'final' (a double circle, as an accepting state). `numero`: the small number next to it, as written in class, on the
 * `lado` given (1 right, -1 left, 0 under it). */
export function Vertice({ x, y, r = 17, texto, marca, final = false, numero, lado = 1 }) {
  const largo = String(texto).length;
  const letra = largo > 3 ? 10 : largo > 2 ? 12 : 15;
  return (
    <g className="trz-vertice" data-marca={marca || undefined}>
      <circle cx={x} cy={y} r={r} className="trz-vertice__circulo" />
      {final && <circle cx={x} cy={y} r={r - 4} className="trz-vertice__doble" />}
      <text x={x} y={y} dy="0.35em" textAnchor="middle" fontSize={letra} className="trz-vertice__nombre">
        {texto}
      </text>
      {numero !== undefined && (
        <text x={x + lado * (r + 7)} y={lado ? y - r + 2 : y + r + 15} textAnchor="middle" fontSize="13" className="trz-vertice__numero">
          {numero}
        </text>
      )}
    </g>
  );
}

/** A straight or curved line between two circles, with its tip. `c`: the control point of a curve. */
export function Flecha({ desde, hasta, r = 17, c, marca, punteada, etiqueta, sinPunta = false, ladoEtiqueta = 1 }) {
  const control = c ?? { x: (desde.x + hasta.x) / 2, y: (desde.y + hasta.y) / 2 };
  const unidad = (a, b) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  const sale = unidad(desde, control);
  const llega = unidad(control, hasta);
  const x1 = desde.x + sale.x * r;
  const y1 = desde.y + sale.y * r;
  const x2 = hasta.x - llega.x * (r + 1.5);
  const y2 = hasta.y - llega.y * (r + 1.5);
  const d = c ? `M${x1},${y1} Q${c.x},${c.y} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
  // The label, on the outside of the curve or on the left of the line as it goes.
  const medio = c ? { x: 0.25 * x1 + 0.5 * c.x + 0.25 * x2, y: 0.25 * y1 + 0.5 * c.y + 0.25 * y2 } : { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  const normal = { x: llega.y * ladoEtiqueta, y: -llega.x * ladoEtiqueta };
  return (
    <g className="trz-flecha" data-marca={marca || undefined} data-punteada={punteada || undefined}>
      <path d={d} className="trz-flecha__linea" />
      {!sinPunta && <polygon points={punta(x2, y2, llega.x, llega.y)} className="trz-flecha__punta" />}
      {etiqueta !== undefined && (
        <text x={medio.x + normal.x * 10} y={medio.y + normal.y * 10} dy="0.35em" textAnchor="middle" fontSize="14" className="trz-flecha__etiqueta">
          {etiqueta}
        </text>
      )}
    </g>
  );
}

/** A loop over a vertex, pointing away from the center of the drawing (angle `ang`). */
export function Bucle({ x, y, r = 17, ang, marca }) {
  const ux = Math.cos(ang);
  const uy = Math.sin(ang);
  // Two points on the circle, 25° to each side of the angle, joined by a curve that goes out and comes back.
  const a1 = ang - 0.45;
  const a2 = ang + 0.45;
  const p1 = { x: x + r * Math.cos(a1), y: y + r * Math.sin(a1) };
  const p2 = { x: x + (r + 1.5) * Math.cos(a2), y: y + (r + 1.5) * Math.sin(a2) };
  const lejos = r * 3.3;
  const c1 = { x: x + lejos * Math.cos(ang - 0.55), y: y + lejos * Math.sin(ang - 0.55) };
  const c2 = { x: x + lejos * Math.cos(ang + 0.55), y: y + lejos * Math.sin(ang + 0.55) };
  const lx = p2.x - c2.x;
  const ly = p2.y - c2.y;
  const l = Math.hypot(lx, ly) || 1;
  return (
    <g className="trz-flecha" data-marca={marca || undefined} data-bucle={`${ux.toFixed(2)},${uy.toFixed(2)}`}>
      <path d={`M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`} className="trz-flecha__linea" />
      <polygon points={punta(p2.x, p2.y, lx / l, ly / l)} className="trz-flecha__punta" />
    </g>
  );
}

/**
 * A tree as drawn in class: the root on top, each level a row lower, the edges in ink. `vertices` come placed by column
 * (x) and level (y). `marcas` and `numeros` go by vertex id.
 */
export function DibujoArbol({ vertices, aristas, columnas, altura, etiqueta, marcas = {}, numeros = {}, pasoX = 46, pasoY = 64, r = 17 }) {
  const margen = r + 16;
  const ancho = Math.max(2 * margen, 2 * margen + (columnas - 1) * pasoX);
  const alto = 2 * margen + altura * pasoY + 6;
  const px = (v) => margen + v.x * pasoX;
  const py = (v) => margen - 4 + v.y * pasoY;
  // The number of each visit goes away from the edges: under a leaf, and on the outer side of the others.
  const lado = {};
  aristas.forEach((a) => {
    lado[a.a.id] = a.a.x > a.de.x ? 1 : -1;
  });
  vertices.forEach((v) => {
    if (!aristas.some((a) => a.de === v)) lado[v.id] = 0;
  });
  return (
    <Dibujo ancho={ancho} alto={alto} etiqueta={etiqueta} className="trz-arbol">
      {aristas.map((a) => (
        <line key={`${a.de.id}-${a.a.id}`} x1={px(a.de)} y1={py(a.de)} x2={px(a.a)} y2={py(a.a)} className="trz-arista" data-vacia={a.a.vacia || undefined} />
      ))}
      {vertices.map((v) => (
        <Vertice key={v.id} x={px(v)} y={py(v)} r={r} texto={v.e} marca={marcas[v.id]} numero={numeros[v.id]} lado={lado[v.id] ?? -1} />
      ))}
    </Dibujo>
  );
}

/** «sí» or «no», with its color and its word, so the color is never the only clue. */
export function SiNo({ si }) {
  return (
    <span className="trz-sino" data-si={si || undefined}>
      {si ? 'sí' : 'no'}
    </span>
  );
}

/**
 * The symbols the phone's keyboard doesn't have, written in chalk on the board. Each one goes where the cursor is in the
 * field `campo` (a ref), with a space around the connectives so the formula stays readable.
 */
export function Teclas({ teclas, campo, valor, alCambiar, etiqueta }) {
  const escribir = (t) => {
    const el = campo.current;
    const desde = el?.selectionStart ?? valor.length;
    const hasta = el?.selectionEnd ?? desde;
    const texto = t.espacio ? ` ${t.texto} ` : t.texto;
    const nuevo = `${valor.slice(0, desde)}${texto}${valor.slice(hasta)}`.replace(/ {2,}/g, ' ');
    alCambiar(nuevo);
    const lugar = Math.min(desde + texto.length, nuevo.length);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(lugar, lugar);
    });
  };
  return (
    <div className="trz-teclas" role="group" aria-label={etiqueta}>
      {teclas.map((t) => (
        <button key={t.texto} type="button" className="trz-tecla" aria-label={t.nombre} title={t.nombre} onClick={() => escribir(t)}>
          {t.texto}
        </button>
      ))}
    </div>
  );
}
