import { useEffect, useRef, useState } from 'react';
import { LIMITES } from '../lib/propiasSaneo';
import Campo from './Campo';

// The pieces of the sections of a course, the same in a campus course (Materia.jsx), in one of one's own (Propia.jsx)
// and in a course on a live session's table (enVivo/herramientas/Materia.jsx): the form for a new one, the one that
// renames it, their title and their drawings.

/** The name of a new section, right under the course's title. `onCrear(nombre)` returns an error, or nothing when it's
 * done. Cancelar (or Escape) closes it. `ayuda`: where it goes. */
export function SumarSeccion({ onCrear, onCerrar, ayuda = 'Por ejemplo, Para el final o Resúmenes. Va abajo de las del campus.' }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const campo = useRef(null);
  useEffect(() => campo.current?.focus(), []);
  return (
    <form
      id="sumar-seccion"
      className="materia__sumar"
      onKeyDown={(e) => { if (e.key === 'Escape') onCerrar(); }}
      onSubmit={(e) => {
        e.preventDefault();
        const falla = nombre.trim() ? onCrear(nombre) : 'Ponele un nombre.';
        if (falla) {
          setError(falla);
          campo.current?.focus();
        }
      }}
      noValidate
    >
      <Campo etiqueta="Nombre de la sección" ayuda={ayuda} error={error}>
        <input ref={campo} className="campo__control" value={nombre} maxLength={LIMITES.nombre} autoComplete="off" onChange={(e) => { setNombre(e.target.value); setError(''); }} />
      </Campo>
      <div className="materia__sumar-botones">
        <button type="submit" className="boton">Crear</button>
        <button type="button" className="boton boton--secundario" onClick={onCerrar}>Cancelar</button>
      </div>
    </form>
  );
}

/** A new name for a section, in place of its title. `original`: the name it has in the campus (or in Classroom, with
 * `deClassroom`, a topic of a course of one's own), when the student already changed it; `onVolver` gives it back. */
export function RenombrarSeccion({ nombre: actual, original = null, deClassroom = false, onGuardar, onVolver = null, onCerrar }) {
  const [nombre, setNombre] = useState(actual);
  const [error, setError] = useState('');
  const campo = useRef(null);
  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);
  return (
    <form
      className="seccion__renombrar"
      onKeyDown={(e) => { if (e.key === 'Escape') onCerrar(); }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!nombre.trim()) {
          setError('Ponele un nombre.');
          campo.current?.focus();
          return;
        }
        onGuardar(nombre);
      }}
      noValidate
    >
      <Campo etiqueta="Nombre de la sección" ayuda={original ? `En ${deClassroom ? 'Classroom' : 'el campus'} se llama ${original}` : undefined} error={error}>
        <input ref={campo} className="campo__control" value={nombre} maxLength={LIMITES.nombre} autoComplete="off" onChange={(e) => { setNombre(e.target.value); setError(''); }} />
      </Campo>
      <div className="materia__sumar-botones">
        <button type="submit" className="boton boton--chico">Guardar</button>
        {original && onVolver && <button type="button" className="boton boton--secundario boton--chico" onClick={onVolver}>{deClassroom ? 'Volver al nombre de Classroom' : 'Volver al nombre del campus'}</button>}
        <button type="button" className="boton boton--secundario boton--chico" onClick={onCerrar}>Cancelar</button>
      </div>
    </form>
  );
}

/** The title of a section: its name, as a button that folds it (`onAlternar`), and how many things it has while folded.
 * `id`: of the heading, which takes the focus (the index goes there); `cuerpo`: the id of what it folds. `sinPliegue`:
 * the name alone (a filter is on). `Nivel`: the heading's tag. */
export function TituloDeSeccion({ id, cuerpo, nombre, plegada = false, cuantos = 0, onAlternar, sinPliegue = false, Nivel = 'h2' }) {
  return (
    <>
      <Nivel id={id} tabIndex={-1}>
        {sinPliegue ? nombre : (
          <button type="button" className="seccion__titulo" aria-expanded={!plegada} aria-controls={cuerpo} onClick={onAlternar}>
            {nombre}
            <Chevron />
          </button>
        )}
      </Nivel>
      {plegada && (
        <span className="seccion__cuantos">
          {cuantos}
          <span className="solo-lectores">{cuantos === 1 ? ' ítem' : ' ítems'}</span>
        </span>
      )}
    </>
  );
}

export const Mas = () => <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>;
export const Chevron = () => <svg className="seccion__chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6" /></svg>;
export const Manija = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="9" cy="6" r="2" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="9" cy="18" r="2" /><circle cx="15" cy="18" r="2" />
  </svg>
);
export const Puntos = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
);
