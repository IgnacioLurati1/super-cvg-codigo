import { useId, useMemo, useState } from 'react';
import { leerPlanilla, letrasDe, TOPES } from '../lib/planilla';
import { useConsulta } from '../lib/useConsulta';
import './vistaPlanilla.css';

// An Excel or a CSV in the preview sheet (Previa.jsx): its values as a table, sheet by sheet, as text. Nothing of the file
// runs and nothing of it goes anywhere. Long sheets come in steps, so a big one doesn't freeze the page.
const DE_A = 200;
const leerSinRomper = (hoja) => {
  try {
    return hoja.leer();
  } catch {
    return null;
  }
};

export default function VistaPlanilla({ blob, tipo }) {
  const { datos: hojas, error } = useConsulta(() => leerPlanilla(blob, tipo), [blob, tipo]);
  const [elegida, setElegida] = useState(0);
  const id = useId();
  if (error) return <p className="previa__aviso" role="alert">No se pudo leer esta planilla. Bajala para abrirla.</p>;
  if (!hojas) return <p className="previa__aviso" role="status">Leyendo la planilla</p>;
  const actual = Math.min(elegida, hojas.length - 1);
  // A broken sheet says so in its tab; the others still open.
  const hoja = leerSinRomper(hojas[actual]);

  const mover = (e) => {
    const otra = e.key === 'ArrowRight' ? elegida + 1 : e.key === 'ArrowLeft' ? elegida - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? hojas.length - 1 : null;
    if (otra === null) return;
    e.preventDefault();
    const i = (otra + hojas.length) % hojas.length;
    setElegida(i);
    document.getElementById(`${id}-${i}`)?.focus();
  };

  return (
    <div className="planilla">
      {hojas.length > 1 && (
        <div className="planilla__hojas" role="tablist" aria-label="Hojas" onKeyDown={mover}>
          {hojas.map((h, i) => (
            <button
              key={i}
              id={`${id}-${i}`}
              type="button"
              role="tab"
              aria-selected={i === elegida}
              aria-controls={`${id}-panel`}
              tabIndex={i === elegida ? 0 : -1}
              className="planilla__hoja"
              title={h.nombre || undefined}
              onClick={() => setElegida(i)}
            >
              {h.nombre || `Hoja ${i + 1}`}
            </button>
          ))}
        </div>
      )}
      {hoja ? (
        <Hoja key={actual} hoja={hoja} nombre={hojas[actual].nombre} id={`${id}-panel`} etiqueta={hojas.length > 1 ? `${id}-${actual}` : null} />
      ) : (
        <div id={`${id}-panel`} {...(hojas.length > 1 ? { role: 'tabpanel', 'aria-labelledby': `${id}-${actual}` } : {})} className="planilla__vacia">
          <p className="previa__aviso" role="alert">No se pudo leer esta hoja. Bajá la planilla para abrirla.</p>
        </div>
      )}
      {hoja && (
        <p className="previa__nota">
          {hoja.recortada ? `Muestra hasta ${TOPES.filas.toLocaleString('es-AR')} filas y ${TOPES.columnas} columnas, sin formato ni gráficos. Bajala para verla entera.` : 'Son los valores, sin formato ni gráficos.'}
        </p>
      )}
    </div>
  );
}

function Hoja({ hoja, nombre, id, etiqueta }) {
  const [cuantas, setCuantas] = useState(DE_A);
  // Where a merged cell starts it spans the rest; the cells it covers aren't drawn.
  const { inicio, tapadas } = useMemo(() => {
    const inicio = new Map();
    const tapadas = new Set();
    for (const u of hoja.unidas) {
      inicio.set(`${u.fila}:${u.columna}`, u);
      for (let f = u.fila; f < u.fila + u.filas; f++) {
        for (let c = u.columna; c < u.columna + u.columnas; c++) if (f !== u.fila || c !== u.columna) tapadas.add(`${f}:${c}`);
      }
    }
    return { inicio, tapadas };
  }, [hoja]);
  const ancho = hoja.filas[0]?.length ?? 0;
  const panel = { id, ...(etiqueta ? { role: 'tabpanel', 'aria-labelledby': etiqueta } : {}) };

  if (!hoja.filas.length) return <div {...panel} className="planilla__vacia"><p className="previa__aviso">Esta hoja está vacía.</p></div>;
  const visibles = hoja.filas.slice(0, cuantas);
  return (
    <div {...panel} className="planilla__panel">
      <div className="planilla__marco" tabIndex={0} role="region" aria-label={nombre ? `Hoja ${nombre}` : 'Planilla'}>
        <table className="planilla__tabla">
          <thead>
            <tr>
              <th scope="col" className="planilla__esquina"><span className="solo-lectores">Fila</span></th>
              {Array.from({ length: ancho }, (_, c) => <th key={c} scope="col">{letrasDe(c)}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map((fila, f) => (
              <tr key={f}>
                <th scope="row">{f + 1}</th>
                {fila.map((celda, c) => {
                  if (tapadas.has(`${f}:${c}`)) return null;
                  const u = inicio.get(`${f}:${c}`);
                  return (
                    <td key={c} colSpan={u?.columnas > 1 ? u.columnas : undefined} rowSpan={u?.filas > 1 ? Math.min(u.filas, visibles.length - f) : undefined} data-numero={celda?.numero ? '' : undefined}>
                      {celda?.texto}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hoja.filas.length > DE_A && (
        <div className="planilla__pie">
          <p role="status">Mostrando {visibles.length.toLocaleString('es-AR')} de {hoja.filas.length.toLocaleString('es-AR')} filas</p>
          {cuantas < hoja.filas.length && (
            <button type="button" className="boton boton--secundario" onClick={() => setCuantas((n) => n + DE_A)}>
              Ver {Math.min(DE_A, hoja.filas.length - cuantas)} filas más
            </button>
          )}
        </div>
      )}
    </div>
  );
}
