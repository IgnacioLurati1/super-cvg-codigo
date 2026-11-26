import { useEffect, useId, useRef } from 'react';
import Formula from '../consultron/Formula';
import { lenguajeDelLab, leerLectura, sinTexto, tablaEnTexto } from '../../lib/pizarron/lectura';

// What Gemini read on a board photo: the text with its formulas drawn, and each thing where it's used. Code goes to the
// Laboratorio, a DER to its sheet, a table copies to paste in a spreadsheet. `lectura`: { estado: 'leyendo' | 'lista' |
// 'error', texto, error }, or null before reading it.

// A formula on its own line can be wider than a phone: it scrolls sideways, also with the keyboard.
const formula = (p, i) =>
  p.bloque ? (
    <span key={i} className="pizarron__lectura-formula" tabIndex={0} role="group" aria-label="Fórmula">
      <Formula latex={p.formula} bloque />
    </span>
  ) : (
    <Formula key={i} latex={p.formula} />
  );

const partesDe = (partes) =>
  partes.map((p, i) => (p.formula !== undefined ? formula(p, i) : p.fuerte ? <strong key={i}>{p.texto}</strong> : p.codigo ? <code key={i}>{p.texto}</code> : <span key={i}>{p.texto}</span>));

function Bloque({ b, alCopiar, alLaboratorio, alDer }) {
  if (b.tipo === 'parrafo') return b.titulo ? <h4 className="pizarron__lectura-titulo">{partesDe(b.partes)}</h4> : <p>{partesDe(b.partes)}</p>;
  if (b.tipo === 'lista') {
    const Lista = b.numerada ? 'ol' : 'ul';
    return (
      <Lista start={b.numerada && b.inicio !== 1 ? b.inicio : undefined}>
        {b.items.map((item, i) => (
          <li key={i}>{partesDe(item)}</li>
        ))}
      </Lista>
    );
  }
  if (b.tipo === 'codigo') {
    const lab = lenguajeDelLab(b.lenguaje);
    return (
      <div className="pizarron__lectura-pieza">
        <pre tabIndex={0} role="region" aria-label={b.lenguaje ? `Código en ${b.lenguaje}` : 'Código'}>
          <code>{b.texto}</code>
        </pre>
        <div className="pizarron__lectura-acciones">
          {lab && <button type="button" className="boton boton--chico" onClick={() => alLaboratorio(b.texto, lab)}>Abrir en el Laboratorio</button>}
          {!lab && b.lenguaje && <span className="pizarron__lectura-nota">El Laboratorio no corre {b.lenguaje === 'matlab' ? 'MATLAB' : b.lenguaje}.</span>}
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => alCopiar(b.texto, 'Copiaste el código.')}>Copiar el código</button>
        </div>
      </div>
    );
  }
  if (b.tipo === 'tabla') {
    const [titulos, ...filas] = b.filas;
    return (
      <div className="pizarron__lectura-pieza">
        <div className="pizarron__lectura-tabla" tabIndex={0} role="region" aria-label="Tabla">
          <table>
            <thead>
              <tr>{titulos.map((c, i) => <th key={i} scope="col">{c}</th>)}</tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pizarron__lectura-acciones">
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => alCopiar(tablaEnTexto(b.filas), 'Copiaste la tabla. Pegala en una planilla.')}>Copiar la tabla</button>
        </div>
      </div>
    );
  }
  if (b.tipo === 'der') {
    const nombres = b.der.entidades.map((e) => e.nombre);
    return (
      <div className="pizarron__lectura-pieza">
        <p>
          <strong>Diagrama entidad-relación</strong> con {nombres.length === 1 ? 'una entidad' : `${nombres.length} entidades`}: {nombres.join(', ')}.
        </p>
        <div className="pizarron__lectura-acciones">
          <button type="button" className="boton boton--chico" onClick={() => alDer(b.der)}>Abrir en el DER</button>
        </div>
      </div>
    );
  }
  return null;
}

export default function Lectura({ lectura, alLeer, alCopiar, alLaboratorio, alDer, alPreguntar, conGemini, quedan }) {
  const id = useId();
  const encabezado = useRef(null);
  // When the reading starts, ends or fails, the button touched goes away: the focus goes to the heading, not to the page.
  const estado = lectura?.estado ?? null;
  const antes = useRef(estado);
  useEffect(() => {
    if (antes.current !== estado && estado) encabezado.current?.focus();
    antes.current = estado;
  }, [estado]);
  const preguntar = (
    <button type="button" className="boton boton--secundario" onClick={alPreguntar}>
      Preguntarle a Consultron
    </button>
  );
  let cuerpo;
  if (!lectura) {
    const nota = quedan === 0 ? 'Por hoy no te quedan preguntas con Gemini.' : `Gemini lo pasa a texto con las fórmulas, el código y las tablas.${conGemini && quedan !== null ? ` ${quedan === 1 ? 'Te queda 1 pregunta' : `Te quedan ${quedan} preguntas`} hoy.` : ''}`;
    cuerpo = (
      <>
        <p className="pizarron__lectura-nota" id={`${id}-nota`}>
          {nota}
        </p>
        <div className="pizarron__botones">
          <button type="button" className="boton" aria-describedby={`${id}-nota`} onClick={alLeer} aria-disabled={quedan === 0 ? 'true' : undefined}>
            Pasar a texto
          </button>
          {preguntar}
        </div>
      </>
    );
  } else if (lectura.estado === 'leyendo') {
    cuerpo = (
      <div className="pizarron__lectura-esqueleto" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    );
  } else if (lectura.estado === 'error') {
    cuerpo = (
      <>
        <p className="mensaje mensaje--error">{lectura.error}</p>
        <div className="pizarron__botones">
          <button type="button" className="boton boton--secundario" onClick={alLeer}>
            Probar de nuevo
          </button>
          {preguntar}
        </div>
      </>
    );
  } else {
    const bloques = sinTexto(lectura.texto) ? [] : leerLectura(lectura.texto);
    cuerpo = (
      <>
        <div className="pizarron__lectura-texto">
          {bloques.length ? bloques.map((b, i) => <Bloque key={i} b={b} alCopiar={alCopiar} alLaboratorio={alLaboratorio} alDer={alDer} />) : <p>No encontró nada escrito.</p>}
        </div>
        <div className="pizarron__botones">
          <button type="button" className="boton boton--secundario" onClick={() => alCopiar(lectura.texto, 'Copiaste el texto.')}>
            Copiar todo
          </button>
          {preguntar}
        </div>
        <button type="button" className="boton boton--chico boton--secundario pizarron__lectura-otra" onClick={alLeer} aria-disabled={quedan === 0 ? 'true' : undefined}>
          Leer de nuevo
        </button>
      </>
    );
  }
  return (
    <section className="pizarron__lectura" aria-labelledby={`${id}-titulo`} aria-busy={estado === 'leyendo' ? 'true' : undefined}>
      <h3 id={`${id}-titulo`} className="pizarron__subtitulo" ref={encabezado} tabIndex={-1}>
        Lo que dice
      </h3>
      {cuerpo}
    </section>
  );
}
