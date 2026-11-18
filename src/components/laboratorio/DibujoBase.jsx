import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAjustes } from '../../lib/ajustes';
import { carriles, ordenar, relaciones, trazo } from '../../lib/laboratorio/dibujo';

// The drawing of the database, on the squared sheet: each table a card with its columns (the primary key underlined,
// with its key), one under the other, and each foreign key a line of ink in the margin, from its column to the one it
// points to. One column, so it reads the same in the side of the lab and in a phone. The lines are drawn once the cards
// are laid out, and again when their width changes; what they say is also in the text of each row.

const PASO = 7;
const ANCHO_EN_COLUMNAS = 640;
const AIRE = 12;
const llave = (tabla, columna) => JSON.stringify([tabla, columna ?? '']);

function Llave() {
  return (
    <svg className="dibujo__llave" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="5" cy="8" r="3.25" />
      <path d="M8.25 8H15M12.5 8v2.75M14.5 8v2" />
    </svg>
  );
}

function Flecha() {
  return (
    <svg className="dibujo__flecha" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M1 6h8.5M6.5 3l3 3-3 3" />
    </svg>
  );
}

export default function DibujoBase({ esquema }) {
  const orden = useMemo(() => ordenar(esquema), [esquema]);
  const lineas = useMemo(() => relaciones(esquema), [esquema]);
  // Where each column points, for the text of its row.
  const apuntaA = useMemo(() => new Map(lineas.map((l) => [llave(l.desde.tabla, l.desde.columna), l.hacia])), [lineas]);
  const dibujables = useMemo(() => lineas.filter((l) => l.existe), [lineas]);
  // Each row by its place: table i, column j (the name of the table, j = 0). The lanes of the lines come from there.
  const { lugar, carril, cuantos } = useMemo(() => {
    const m = new Map();
    orden.forEach((t, i) => {
      m.set(llave(t.nombre), [i, 0]);
      t.columnas.forEach((c, j) => m.set(llave(t.nombre, c.nombre), [i, j + 1]));
    });
    const donde = (t, c) => m.get(llave(t, c)) ?? m.get(llave(t)) ?? [0, 0];
    const r = carriles(dibujables, (t, c) => donde(t, c)[0] * 1000 + donde(t, c)[1]);
    return { lugar: donde, ...r };
  }, [orden, dibujables]);
  const caja = useRef(null);
  const [trazos, setTrazos] = useState(null);
  // Wider than ANCHO_EN_COLUMNAS (the panel below the editor), the tables go side by side and where each key points is
  // said in its row only: the lines of the margin are for one column. Configuración can keep them always side by side,
  // or always one under the other (labBase).
  const forma = useAjustes().labBase;
  const [cabe, setCabe] = useState(false);
  const ancho = forma === 'lado' || (forma === 'auto' && cabe);
  const margen = dibujables.length && !ancho ? AIRE + cuantos * PASO : 0;

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return undefined;
    const ver = () => setCabe(el.getBoundingClientRect().width >= ANCHO_EN_COLUMNAS);
    ver();
    const observador = new ResizeObserver(ver);
    observador.observe(el);
    return () => observador.disconnect();
  }, [orden.length]);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || !dibujables.length || ancho) return undefined;
    const fila = (t, c) => el.querySelector(`[data-fila="${lugar(t, c).join('-')}"]`);
    const medir = () => {
      const base = el.getBoundingClientRect();
      const centro = (n) => {
        const r = n.getBoundingClientRect();
        return r.top - base.top + r.height / 2;
      };
      const lista = dibujables.map((l, i) => {
        const a = fila(l.desde.tabla, l.desde.columna);
        const b = fila(l.hacia.tabla, l.hacia.columna);
        if (!a || !b) return null;
        const x = a.closest('.dibujo__tabla').getBoundingClientRect().left - base.left;
        const y1 = centro(a);
        const y2 = centro(b);
        return { d: trazo(x, y1, y2, x - AIRE + 4 - carril[i] * PASO), x, y1, y2 };
      });
      setTrazos({ ancho: base.width, alto: base.height, lista: lista.filter(Boolean) });
    };
    medir();
    let cuadro = 0;
    const observador = new ResizeObserver(() => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(medir);
    });
    observador.observe(el);
    return () => {
      cancelAnimationFrame(cuadro);
      observador.disconnect();
    };
  }, [dibujables, lugar, carril, ancho]);

  if (!orden.length) return <p className="laboratorio__ayuda">No hay tablas. Creá una con CREATE TABLE o cargá tu base.</p>;

  return (
    <div ref={caja} className="dibujo" data-columnas={ancho || undefined} style={{ '--dibujo-margen': `${margen}px` }}>
      <ul className="dibujo__tablas">
        {orden.map((t, i) => (
          <li key={t.nombre} className="dibujo__tabla" data-vista={t.vista || undefined}>
            <h3 className="dibujo__nombre" data-fila={`${i}-0`}>
              {t.nombre}
              {t.vista && <span className="dibujo__vista"> (vista)</span>}
            </h3>
            <ul className="dibujo__columnas">
              {t.columnas.map((c, j) => {
                const hacia = apuntaA.get(llave(t.nombre, c.nombre));
                return (
                  <li key={c.nombre} className="dibujo__columna" data-fila={`${i}-${j + 1}`} data-clave={c.clave > 0 || undefined}>
                    <span className="dibujo__marca">{c.clave > 0 && <Llave />}</span>
                    <span className="dibujo__col">{c.nombre}</span>
                    {c.clave > 0 && <span className="solo-lectores">, clave primaria</span>}
                    {hacia ? (
                      <span className="dibujo__dato dibujo__dato--hacia">
                        <Flecha />
                        <span className="solo-lectores">{`, apunta a ${hacia.columna ? `${hacia.tabla}.${hacia.columna}` : hacia.tabla}`}</span>
                        <span aria-hidden="true">{hacia.tabla}</span>
                      </span>
                    ) : (
                      c.tipo && <span className="dibujo__dato">{c.tipo.toLowerCase()}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      {trazos && dibujables.length > 0 && !ancho && (
        <svg className="dibujo__lineas" width={trazos.ancho} height={trazos.alto} viewBox={`0 0 ${trazos.ancho} ${trazos.alto}`} aria-hidden="true" focusable="false">
          {trazos.lista.map((t, i) => (
            <g key={i} className="dibujo__linea">
              <path d={t.d} />
              <circle cx={t.x - 1} cy={t.y1} r="2.5" />
              <path className="dibujo__punta" d={`M${t.x - 6} ${t.y2 - 3.5}L${t.x} ${t.y2}L${t.x - 6} ${t.y2 + 3.5}Z`} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
