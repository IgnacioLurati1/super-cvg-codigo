import { useEffect, useId, useRef, useState } from 'react';
import { problemaDeNombre, proponerTabla } from '../../lib/laboratorio/csv';
import Campo from '../Campo';

// Before a CSV becomes a table: its name, if the first row has the names, how it's separated, and each column with its
// name and type, with the first rows as they'll look. Everything was guessed from the file; the student only fixes
// what came out wrong. Names go without quotes in a query, so they follow the same rules as SQL.

// Short, so the name of the column keeps its room in a phone.
const NOMBRES_DE_TIPO = { INTEGER: 'Entero', REAL: 'Decimal', TEXT: 'Texto' };
const NOMBRES_DE_SEPARADOR = { ',': 'Coma', ';': 'Punto y coma', '\t': 'Tabulación', '|': 'Barra vertical' };
const numero = new Intl.NumberFormat('es-AR');

const PROBLEMAS = {
  vacio: 'Ponele un nombre.',
  letras: 'Solo letras sin tilde, números y _, sin empezar con un número.',
  reservada: 'Ese nombre es una palabra de SQL. Probá con otro.',
};

export const PROBLEMAS_CSV = {
  vacio: (n) => `«${n}» no tiene filas.`,
  columnas: (n) => `«${n}» tiene más de 200 columnas. Probá con una parte.`,
  filas: (n) => `«${n}» tiene más de 200.000 filas. Probá con una parte.`,
};

/** `leido`: { nombre, texto } of the file, and `inicial`, what proponerTabla guessed from it. `existentes`: the tables
 * already there. `alCrear(tabla)` with what sqlBase.js needs; `alCerrar()` when it closes, created or not. */
export default function RevisarCsv({ leido, inicial, existentes, alCrear, alCerrar }) {
  const id = useId();
  const dialogo = useRef(null);
  const nombreTabla = useRef(null);
  const desdeFondo = useRef(false);
  const [forma, setForma] = useState({ separador: inicial.separador, encabezado: inicial.encabezado });
  const [propuesta, setPropuesta] = useState(inicial);
  const [tabla, setTabla] = useState(inicial.tabla);
  const [columnas, setColumnas] = useState(inicial.columnas);
  const [mostrarErrores, setMostrarErrores] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d.open) d.showModal();
    nombreTabla.current?.focus();
    nombreTabla.current?.select();
  }, []);

  // Another separator or another first row: the columns come out again.
  const cambiarForma = (cambio) => {
    const nueva = { ...forma, ...cambio };
    setForma(nueva);
    const p = proponerTabla(leido.texto, leido.nombre, existentes, nueva);
    setPropuesta(p);
    if (!p.error) setColumnas(p.columnas);
  };

  const problemaTabla = (() => {
    const p = problemaDeNombre(tabla, existentes);
    return p === 'repetido' ? 'Ya hay una tabla con ese nombre.' : p && PROBLEMAS[p];
  })();
  const problemasColumnas = columnas.map((c, i) => {
    const p = problemaDeNombre(c.nombre, columnas.filter((_, j) => j !== i).map((o) => o.nombre));
    return p === 'repetido' ? 'Ya hay otra columna con ese nombre.' : p && PROBLEMAS[p];
  });

  const cambiarColumna = (i, cambio) => setColumnas((cs) => cs.map((c, j) => (j === i ? { ...c, ...cambio } : c)));

  const crear = (e) => {
    e.preventDefault();
    if (propuesta.error) return;
    if (problemaTabla || problemasColumnas.some(Boolean)) {
      setMostrarErrores(true);
      // Before the errors are drawn: the first field with one, by its place.
      const primero = problemaTabla ? nombreTabla.current : dialogo.current.querySelectorAll('.csv__columna input')[problemasColumnas.findIndex(Boolean)];
      primero?.focus();
      return;
    }
    alCrear({ archivo: leido.nombre, tabla: tabla.trim(), separador: forma.separador, encabezado: forma.encabezado, columnas: columnas.map((c) => ({ nombre: c.nombre.trim(), tipo: c.tipo })), texto: leido.texto });
    dialogo.current.close();
  };

  return (
    <dialog
      ref={dialogo}
      className="previa csv"
      aria-labelledby={`${id}-titulo`}
      onClose={alCerrar}
      onPointerDown={(e) => {
        desdeFondo.current = e.target === dialogo.current;
      }}
      onClick={(e) => {
        if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close();
      }}
    >
      <form className="previa__caja csv__caja" onSubmit={crear} noValidate>
        <div className="previa__cabeza">
          <h2 id={`${id}-titulo`}>Revisá la tabla</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">
          {propuesta.error ? `Sale de «${leido.nombre}».` : `Sale de «${leido.nombre}», con ${propuesta.cuantas === 1 ? 'una fila' : `${numero.format(propuesta.cuantas)} filas`}.`}
        </p>

        <div className="csv__cuerpo">
          <div className="csv__forma">
            <Campo etiqueta="Nombre de la tabla" error={mostrarErrores ? problemaTabla : null}>
              <input ref={nombreTabla} className="campo__control csv__codigo" type="text" value={tabla} maxLength={40} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={(e) => setTabla(e.target.value)} />
            </Campo>
            <Campo etiqueta="Separa con">
              <select className="campo__control" value={forma.separador} onChange={(e) => cambiarForma({ separador: e.target.value })}>
                {Object.entries(NOMBRES_DE_SEPARADOR).map(([s, n]) => <option key={n} value={s}>{n}</option>)}
              </select>
            </Campo>
          </div>
          <label className="csv__opcion">
            <input type="checkbox" checked={forma.encabezado} onChange={(e) => cambiarForma({ encabezado: e.target.checked })} />
            La primera fila tiene los nombres
          </label>

          {propuesta.error ? (
            <p className="mensaje mensaje--error" role="alert">{PROBLEMAS_CSV[propuesta.error](leido.nombre)}</p>
          ) : (
            <>
              <fieldset className="csv__columnas">
                <legend>Columnas</legend>
                <ol className="csv__lista">
                  {columnas.map((c, i) => {
                    const problema = mostrarErrores ? problemasColumnas[i] : null;
                    return (
                      <li key={i} className="csv__columna">
                        <span className="csv__numero" aria-hidden="true">{i + 1}</span>
                        <input
                          className="campo__control csv__codigo"
                          type="text"
                          value={c.nombre}
                          maxLength={40}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          aria-label={`Nombre de la columna ${i + 1}`}
                          aria-invalid={problema ? true : undefined}
                          aria-describedby={problema ? `${id}-col-${i}` : undefined}
                          onChange={(e) => cambiarColumna(i, { nombre: e.target.value })}
                        />
                        <select className="campo__control" value={c.tipo} aria-label={`Tipo de la columna ${i + 1}`} onChange={(e) => cambiarColumna(i, { tipo: e.target.value })}>
                          {Object.entries(NOMBRES_DE_TIPO).map(([t, n]) => <option key={t} value={t}>{n}</option>)}
                        </select>
                        {problema && <span id={`${id}-col-${i}`} className="campo__error csv__error" role="alert">{problema}</span>}
                      </li>
                    );
                  })}
                </ol>
              </fieldset>

              {propuesta.muestra.length > 0 && (
                <div className="csv__muestra">
                  <p className="csv__subtitulo" id={`${id}-muestra`}>Primeras filas</p>
                  <div className="consola__tabla" role="region" aria-labelledby={`${id}-muestra`} tabIndex={0}>
                    <table>
                      <thead><tr>{columnas.map((c, i) => <th key={i} scope="col">{c.nombre}</th>)}</tr></thead>
                      <tbody>
                        {propuesta.muestra.map((f, i) => (
                          <tr key={i}>{f.map((v, j) => (v.trim() === '' ? <td key={j} className="consola__nulo">NULL</td> : <td key={j} data-numero={columnas[j]?.tipo !== 'TEXT' || undefined}>{v}</td>))}</tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="csv__pie">
          <button type="submit" className="boton" aria-disabled={propuesta.error ? 'true' : undefined}>Crear la tabla</button>
          <button type="button" className="boton boton--secundario" onClick={() => dialogo.current.close()}>Cancelar</button>
        </div>
      </form>
    </dialog>
  );
}
