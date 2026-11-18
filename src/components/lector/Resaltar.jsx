import { useEffect, useId, useRef, useState } from 'react';
import { COLORES, MAX_NOTA_RESALTADO } from '../../lib/lectura';

// Touching these buttons must not drop the selection the student just made.
const quieto = (e) => e.preventDefault();

// A toolbar moves with the arrows, from one button to the next.
function conFlechas(e) {
  const botones = [...e.currentTarget.querySelectorAll('button')];
  const i = botones.indexOf(document.activeElement);
  const destino = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: botones.length - 1 }[e.key];
  if (i === -1 || destino === undefined) return;
  e.preventDefault();
  botones[(destino + botones.length) % botones.length].focus();
}

/** Over what the student selected: a highlighter of each color, and one that also opens a note. With `onProbar`, what
 * was selected looks like code, and one more button takes it to the lab. With `onPreguntar`, one asks Consultron about
 * it. Without `onColor` nor `onNota` (an HTML summary, VisorResumen.jsx), it only asks: then its `nombre` says so.
 * `colorPropio`: in a live session each one highlights in their own color, so a single highlighter of it. */
export function BarraSeleccion({ estilo, ultimo, conTeclas = true, nombre = 'Resaltar lo seleccionado', colorPropio = null, onColor, onNota, onProbar, onPreguntar, alTocar }) {
  return (
    <div className="lector__barra-sel" role="toolbar" aria-label={nombre} style={estilo} onPointerDown={alTocar} onKeyDown={conFlechas}>
      {onColor && colorPropio && (
        <button type="button" className="lector__color lector__color--autor" style={{ '--autor': colorPropio }} aria-label="Resaltar" aria-keyshortcuts={conTeclas ? 'R' : undefined} onMouseDown={quieto} onClick={() => onColor(ultimo)} />
      )}
      {onColor && !colorPropio && COLORES.map((c) => (
        <button key={c} type="button" className="lector__color" data-color={c} aria-label={`Resaltar en ${c}`} aria-keyshortcuts={conTeclas && c === ultimo ? 'R' : undefined} onMouseDown={quieto} onClick={() => onColor(c)} />
      ))}
      {onNota && <button type="button" className="lector__barra-nota" aria-keyshortcuts={conTeclas ? 'N' : undefined} onMouseDown={quieto} onClick={onNota}>Nota</button>}
      {onProbar && <button type="button" className="lector__barra-nota" aria-label="Probar en el laboratorio" onMouseDown={quieto} onClick={onProbar}>Probar</button>}
      {onPreguntar && <button type="button" className="lector__barra-nota" aria-label="Preguntar a Consultron" title="Preguntale a Consultron" onMouseDown={quieto} onClick={onPreguntar}>Preguntar</button>}
    </div>
  );
}

/** A highlight already made: its color, its note to write or change, and the way to delete it. One of a live session
 * (`resaltado.autor`) says whose it is instead of its color, and only its author writes its note. A note being written
 * is never lost: closing the bubble any other way than «Cancelar» (Esc, touching outside, closing the file) keeps it,
 * through `onDejar(nota)`. */
export function Globo({ resaltado, estilo, editando, onColor, onGuardar, onDejar, onEditar, onBorrar, onCerrar }) {
  const id = useId();
  const caja = useRef(null);
  const [texto, setTexto] = useState(resaltado.nota);
  // What is written now, what it had when it opened, and whether «Guardar» or «Cancelar» already said what to do.
  const nota = useRef({ texto: resaltado.nota, antes: resaltado.nota, hecho: false });
  const dejar = useRef(onDejar);
  useEffect(() => {
    nota.current.texto = texto;
    dejar.current = onDejar;
  });
  useEffect(() => {
    if (!editando) return undefined;
    const n = nota.current;
    return () => {
      if (!n.hecho && n.texto !== n.antes) dejar.current?.(n.texto);
    };
  }, [editando]);

  useEffect(() => {
    // Without scrolling: the bubble is already beside its highlight.
    if (editando) caja.current?.querySelector('textarea')?.focus({ preventScroll: true });
    else caja.current?.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }, [editando]);

  const guardar = (e) => {
    e.preventDefault();
    nota.current.hecho = true;
    onGuardar(texto);
  };
  const cancelar = () => {
    nota.current.hecho = true;
    onCerrar();
  };

  return (
    <div
      ref={caja}
      className="lector__globo"
      role="dialog"
      aria-label={`Resaltado de la página ${resaltado.pagina}`}
      style={estilo}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        onCerrar();
      }}
    >
      {resaltado.autor ? (
        <p className="lector__globo-autor">
          <span className="lector__punto-autor" style={{ '--autor': resaltado.autor.color }} aria-hidden="true" />
          {resaltado.autor.propio ? 'Tu resaltado' : `Resaltado de ${resaltado.autor.nombre}`}
        </p>
      ) : (
        <div className="lector__colores" role="group" aria-label="Color">
          {COLORES.map((c) => (
            <button key={c} type="button" className="lector__color" data-color={c} aria-label={c} aria-pressed={resaltado.color === c} onClick={() => onColor(c)} />
          ))}
        </div>
      )}
      {editando ? (
        <form className="lector__globo-form" onSubmit={guardar}>
          <label className="solo-lectores" htmlFor={`${id}-nota`}>Nota</label>
          <textarea
            id={`${id}-nota`}
            className="campo__control lector__globo-texto"
            rows={4}
            maxLength={MAX_NOTA_RESALTADO}
            placeholder="Por ejemplo, entra en el parcial"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar(e);
            }}
          />
          <div className="lector__globo-botones">
            <button type="submit" className="boton boton--chico">Guardar</button>
            <button type="button" className="boton boton--secundario boton--chico" onClick={cancelar}>Cancelar</button>
          </div>
        </form>
      ) : (
        <>
          {resaltado.nota && <p className="lector__globo-nota">{resaltado.nota}</p>}
          <div className="lector__globo-botones">
            {(!resaltado.autor || resaltado.autor.propio) && <button type="button" className="boton boton--secundario boton--chico" onClick={onEditar}>{resaltado.nota ? 'Editar nota' : 'Sumar nota'}</button>}
            <button type="button" className="boton boton--secundario boton--chico" onClick={onBorrar}>Borrar</button>
            <button type="button" className="lector__boton lector__globo-cerrar" aria-label="Cerrar" onClick={onCerrar}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
