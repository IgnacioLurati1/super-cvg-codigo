import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { guardarArchivo } from '../../lib/archivos';
import { aCsv } from '../../lib/laboratorio/csv';
import { partirError } from '../../lib/laboratorio/error';
import { pngValido } from '../../lib/laboratorio/graficos';
import { TOPE_FILAS } from '../../lib/laboratorio/lenguajes';
import { Dialecto, Pistas, Plan } from './Plan';

// What the last run left: what it printed (errors in their color), what the student typed, the tables of SQL and how
// it ended. Errors go as Python or SQLite say them, with a button to their line. While the program waits for something,
// a field right after what it asked: Enter sends it.

const numero = new Intl.NumberFormat('es-AR');

function Celda({ valor }) {
  if (valor === null || valor === undefined) return <td className="consola__nulo">NULL</td>;
  if (typeof valor === 'object') return <td className="consola__nulo">{`blob de ${numero.format(valor.bytes ?? 0)} bytes`}</td>;
  return <td data-numero={typeof valor === 'number' || undefined}>{String(valor)}</td>;
}

// A column of numbers: its heading goes over them, on the right.
const deNumeros = (filas, j) => filas.some((f) => typeof f[j] === 'number') && filas.every((f) => f[j] === null || f[j] === undefined || typeof f[j] === 'number');

/** A result as a table, with its line and «Bajar CSV». Also the live session's shared outputs. */
export function Tabla({ pieza }) {
  const filas = pieza.filas.length;
  const cuantas = filas === 1 ? '1 fila' : `${numero.format(filas)} filas`;
  return (
    <div className="consola__resultado">
      <div className="consola__cabeza">
        <p className="consola__dato">{`Línea ${pieza.linea}, ${pieza.recortada ? `las primeras ${numero.format(pieza.tope ?? TOPE_FILAS)} filas` : cuantas}`}</p>
        {/* SQL: what came, as Excel opens it (csv.js). */}
        {pieza.columnas.length > 0 && filas > 0 && (
          <button type="button" className="boton boton--secundario boton--chico" aria-label={`Bajar CSV de la línea ${pieza.linea}`} onClick={() => guardarArchivo(new Blob([aCsv(pieza.columnas, pieza.filas)], { type: 'text/csv;charset=utf-8' }), `resultado-linea-${pieza.linea}.csv`)}>
            Bajar CSV
          </button>
        )}
      </div>
      {pieza.columnas.length > 0 && filas > 0 ? (
        <div className="consola__tabla" role="region" aria-label={`Resultado de la línea ${pieza.linea}`} tabIndex={0}>
          <table>
            <thead><tr>{pieza.columnas.map((c, i) => <th key={`${c}-${i}`} scope="col" data-numero={deNumeros(pieza.filas, i) || undefined}>{c}</th>)}</tr></thead>
            <tbody>
              {pieza.filas.map((f, i) => (
                <tr key={i}>{f.map((v, j) => <Celda key={j} valor={v} />)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="consola__linea">No trajo filas.</p>
      )}
    </div>
  );
}

/** A matplotlib figure, from its PNG (graficos.js): an <img> from a blob, let go when it leaves the console. */
function Imagen({ pieza }) {
  const img = useRef(null);
  const valido = pngValido(pieza.png);
  useEffect(() => {
    if (!valido || !img.current) return undefined;
    const enlace = URL.createObjectURL(new Blob([pieza.png], { type: 'image/png' }));
    img.current.src = enlace;
    return () => URL.revokeObjectURL(enlace);
  }, [pieza.png, valido]);
  if (!valido) return null;
  return <img ref={img} className="consola__imagen" alt="Gráfico de matplotlib" />;
}

const cambiaron = (n) => (n === 1 ? 'Cambió 1 fila' : `Cambiaron ${numero.format(n)} filas`);

function Pieza({ pieza, alIrALinea }) {
  if (pieza.tipo === 'salida') return <span className={pieza.flujo === 'err' ? 'consola__err' : undefined}>{pieza.texto}</span>;
  if (pieza.tipo === 'entrada') return <span className="consola__escrito">{`${pieza.texto}\n`}</span>;
  if (pieza.tipo === 'tabla') return <Tabla pieza={pieza} />;
  if (pieza.tipo === 'imagen') return <Imagen pieza={pieza} />;
  if (pieza.tipo === 'plan') return <Plan pieza={pieza} />;
  if (pieza.tipo === 'dialecto') return <Dialecto pieza={pieza} />;
  if (pieza.tipo === 'cambios') return <p className="consola__linea">{`Línea ${pieza.linea}, listo${pieza.cambios > 0 ? `. ${cambiaron(pieza.cambios)}` : ''}.`}</p>;
  if (pieza.tipo === 'error') {
    const { donde, que } = partirError(pieza.texto);
    return (
      <div className="consola__error">
        {/* Where, as Python writes it and without wrapping, so the ^ point at their place (long lines scroll, also with the
            keys). What happened, below and wrapped, so a phone reads it whole. */}
        {donde && <pre className="consola__donde" role="region" aria-label="Dónde pasó" tabIndex={0}>{donde}</pre>}
        {que && <pre className="consola__que">{que}</pre>}
        {pieza.pistas?.length > 0 && <Pistas pistas={pieza.pistas} />}
        {pieza.linea > 0 && <button type="button" className="boton boton--secundario boton--chico" onClick={() => alIrALinea(pieza.linea)}>{`Ir a la línea ${pieza.linea}${pieza.archivo ? ` de ${pieza.archivo}` : ''}`}</button>}
      </div>
    );
  }
  return <p className={`consola__aviso consola__aviso--${pieza.tono ?? 'info'}`}>{pieza.texto}</p>;
}

/** What the program asks for, right where it asks: its question names the field. */
function Pedido({ pregunta, alMandar }) {
  const [texto, setTexto] = useState('');
  const campo = useRef(null);
  useEffect(() => {
    campo.current?.focus({ preventScroll: true });
    campo.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  return (
    <form
      className="consola__pedido"
      onSubmit={(e) => {
        e.preventDefault();
        alMandar(texto);
      }}
    >
      <input
        ref={campo}
        className="consola__campo"
        type="text"
        aria-label={pregunta.trim() || 'Lo que pide el programa'}
        aria-describedby="consola-enter"
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
      />
      <span id="consola-enter" className="solo-lectores">Enter para mandarlo.</span>
    </form>
  );
}

/** `piezas` of the run, `pide` { pregunta } while the program waits, `alMandar(texto)` and `alIrALinea(linea)`. */
export default function Consola({ piezas, pide, alMandar, alIrALinea, vacia }) {
  const caja = useRef(null);
  const abajo = useRef(true);

  // Following what comes, unless the student scrolled up to read.
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || !abajo.current) return;
    el.scrollTop = el.scrollHeight;
    // When the last block doesn't fit, what matters stays in sight: of an error, what happened and its button (the
    // traceback above it scrolls); of «Explicar la consulta», its first line.
    const ultimo = el.lastElementChild;
    const desde = ultimo?.matches('.consola__error') ? (ultimo.querySelector('.consola__que') ?? ultimo) : ultimo?.matches('.consola__plan') ? ultimo : null;
    if (desde) {
      const arriba = desde.getBoundingClientRect().top - el.getBoundingClientRect().top;
      if (arriba < 0) el.scrollTop += arriba - 8;
    }
  }, [piezas, pide]);

  const texto = [];
  const bloques = [];
  // The printed text and what was typed go together, as in a terminal; a table, an error or a notice, apart.
  piezas.forEach((p, i) => {
    if (p.tipo === 'salida' || p.tipo === 'entrada') texto.push(<Pieza key={i} pieza={p} />);
    else {
      if (texto.length) bloques.push(<div key={`t${i}`} className="consola__texto">{texto.splice(0)}</div>);
      bloques.push(<Pieza key={i} pieza={p} alIrALinea={alIrALinea} />);
    }
  });

  return (
    <div
      ref={caja}
      className="consola"
      role="region"
      aria-label="Salida"
      tabIndex={0}
      onScroll={(e) => {
        const el = e.currentTarget;
        abajo.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
    >
      {!piezas.length && !pide ? <p className="consola__vacia">{vacia}</p> : null}
      {bloques}
      {(texto.length > 0 || pide) && (
        <div className="consola__texto">
          {texto}
          {pide && <Pedido key={pide.vez} pregunta={pide.pregunta} alMandar={alMandar} />}
        </div>
      )}
    </div>
  );
}
