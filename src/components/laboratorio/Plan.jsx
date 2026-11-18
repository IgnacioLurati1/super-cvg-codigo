import { EditorView } from '@codemirror/view';
import { useId, useState } from 'react';
import { partirPista } from '../../lib/laboratorio/dialecto';
import './sql.css';

// What the console shows only in SQL: what a query does and how SQLite solves it (from «Explicar la consulta»), step
// by step, and the lines that say how SQLite writes what was written as in MySQL. All as text.

/** Where the cursor is in the editor inside `raiz`: what «Explicar la consulta» explains. */
export function cursorEn(raiz) {
  const contenido = raiz?.querySelector('.cm-content');
  const v = contenido && EditorView.findFromDOM(contenido);
  return v ? v.state.selection.main.head : 0;
}

function Pasos({ nodos }) {
  return (
    <ol className="plan">
      {nodos.map((n, i) => (
        <li key={i} className="plan__paso" data-todo={n.todo || undefined}>
          <span className="plan__texto">{n.texto}</span>
          {n.hijos.length > 0 && <Pasos nodos={n.hijos} />}
        </li>
      ))}
    </ol>
  );
}

// A short piece of code isn't cut in two; a long one wraps where it has to.
const Trozos = ({ trozos }) => trozos.map((t, j) => (t.codigo ? <code key={j} className={t.texto.length <= 28 ? 'consola__entero' : undefined}>{t.texto}</code> : <span key={j}>{t.texto}</span>));

/** What the query does (queHace.js), numbered in the order it's evaluated; a subquery, its list inside its step. */
function Logica({ pasos }) {
  return (
    <ol className="logica">
      {pasos.map((p, i) => (
        <li key={i}>
          <Trozos trozos={p.trozos} />
          {p.hijos.length > 0 && <Logica pasos={p.hijos} />}
        </li>
      ))}
    </ol>
  );
}

/** What the statement does and, folded below it, how SQLite runs it. Open if the first part couldn't be read. */
export function Plan({ pieza }) {
  const id = useId();
  const [abierto, setAbierto] = useState(!pieza.logica);
  return (
    <div className="consola__resultado consola__plan">
      <h2 className="consola__dato">{`Línea ${pieza.linea}, qué hace`}</h2>
      {pieza.logica ? <Logica pasos={pieza.logica} /> : <p className="consola__linea">No la pudimos leer paso a paso. Abajo está cómo la corre SQLite.</p>}
      <h3 className="plan__titulo">
        <button type="button" className="plan__abrir" aria-expanded={abierto} aria-controls={`${id}-plan`} onClick={() => setAbierto((a) => !a)}>
          Cómo la corre SQLite
          <svg className="plan__flecha" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h3>
      <div id={`${id}-plan`} hidden={!abierto || undefined}>
        {pieza.nodos.length ? <Pasos nodos={pieza.nodos} /> : <p className="consola__linea">Esa sentencia no lee ninguna tabla.</p>}
      </div>
    </div>
  );
}

export function Pistas({ pistas }) {
  return (
    <ul className="consola__pistas">
      {pistas.map((p, i) => (
        // A short piece of code isn't cut in two ('2025-01-01'); a long one wraps where it has to.
        <li key={i}>{partirPista(p).map((t, j) => (t.codigo ? <code key={j} className={t.texto.length <= 28 ? 'consola__entero' : undefined}>{t.texto}</code> : <span key={j}>{t.texto}</span>))}</li>
      ))}
    </ul>
  );
}

/** What SQLite took without an error but does another way than MySQL. */
export function Dialecto({ pieza }) {
  return (
    <div className="consola__dialecto">
      <p className="consola__dato">{`Ojo en la línea ${pieza.linea}`}</p>
      <Pistas pistas={pieza.pistas} />
    </div>
  );
}
