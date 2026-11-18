import { useEffect, useRef, useState } from 'react';
import { cargarCurso, cargarCursos, cursoParecido } from '../lib/classroom';
import { useGoogle } from '../lib/google';
import { useConsulta } from '../lib/useConsulta';
import { BotonConectar, nombreDeCurso } from './Classroom';
import Campo from './Campo';
import { Cargando, ErrorConReintento } from './Filas';

function Lista({ curso, yaEstan, elegidos, alternar }) {
  const { datos: grupos, error, cargando, recargar } = useConsulta(() => cargarCurso(curso), [curso]);
  if (error && !grupos) return <ErrorConReintento texto={error} recargar={recargar} />;
  if (cargando && !grupos) return <Cargando texto="Buscando lo de Classroom" cuantas={5} />;
  if (!grupos.length) return <p>Este curso todavía no tiene materiales ni tareas.</p>;
  return grupos.map((g) => (
    <fieldset className="elegir__seccion" key={g.id}>
      <legend className="elegir__titulo">{g.nombre}</legend>
      {g.items.map((i) => {
        const esta = yaEstan.has(i.url);
        return (
          <label className="opcion elegir__item" key={i.id}>
            <input type="checkbox" checked={esta || elegidos.has(i.url)} disabled={esta} onChange={(e) => alternar(i, e.target.checked)} />
            <span className="fila__texto">
              <span className="fila__nombre">{i.nombre}</span>
              <span className="fila__dato">{esta ? 'Ya está en esta categoría' : i.dato}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  ));
}

function Cursos({ nombre, inicial, yaEstan, elegidos, alternar }) {
  const { datos: cursos, error, cargando, recargar } = useConsulta(cargarCursos);
  const [curso, setCurso] = useState(null);
  if (!cursos?.length) {
    return (
      <div className="elegir__lista" aria-busy={cargando && !cursos ? 'true' : undefined}>
        {error && !cursos && <ErrorConReintento texto={error} recargar={recargar} />}
        {cargando && !cursos && <Cargando texto="Buscando tus cursos de Classroom" cuantas={3} />}
        {cursos && <p>Tu cuenta de Google no tiene cursos activos en Classroom.</p>}
      </div>
    );
  }
  const elegido = curso ?? (cursos.find((c) => c.id === inicial) ?? cursoParecido(nombre, cursos) ?? cursos[0]).id;
  return (
    <>
      <div className="elegir__filtros">
        <Campo etiqueta="Curso de Classroom">
          <select className="campo__control" value={elegido} onChange={(e) => setCurso(e.target.value)}>
            {cursos.map((c) => <option key={c.id} value={c.id}>{nombreDeCurso(c)}</option>)}
          </select>
        </Campo>
      </div>
      <div className="elegir__lista">
        <Lista key={elegido} curso={elegido} yaEstan={yaEstan} elegidos={elegidos} alternar={alternar} />
      </div>
    </>
  );
}

/** A sheet to pick things of a Classroom course into a course of one's own. They go in as links, which open in
 * Classroom or Drive with the student's Google account. `inicial`: the course to open with, if known. */
export default function ElegirDelClassroom({ nombre, inicial = null, yaEstan, onAgregar, onCerrar }) {
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  const titulo = useRef(null);
  const google = useGoogle();
  const [elegidos, setElegidos] = useState(() => new Map());

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);

  const alternar = (item, poner) => {
    setElegidos((antes) => {
      const nuevo = new Map(antes);
      if (poner) nuevo.set(item.url, item);
      else nuevo.delete(item.url);
      return nuevo;
    });
  };

  const agregar = () => {
    onAgregar([...elegidos.values()].map((i) => ({ tipo: 'enlace', url: i.url, titulo: i.nombre.slice(0, 200) })));
    dialogo.current.close();
  };

  const cuantos = elegidos.size;

  return (
    <dialog
      ref={dialogo}
      className="previa elegir"
      aria-labelledby="classroom-elegir-titulo"
      onClose={onCerrar}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja elegir__caja classroom__caja">
        <div className="previa__cabeza">
          <h2 id="classroom-elegir-titulo" ref={titulo} tabIndex={-1}>Sumar del Classroom</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">Se suman como enlaces. Se abren en Classroom o en Drive con tu cuenta de Google.</p>
        {google.conectado ? (
          <Cursos nombre={nombre} inicial={inicial} yaEstan={yaEstan} elegidos={elegidos} alternar={alternar} />
        ) : (
          <div className="elegir__lista">
            <p>Conectá tu Classroom para elegir sus materiales. Super CVG solo los lee.</p>
            <BotonConectar alConectar={() => titulo.current?.focus()} />
          </div>
        )}
        <div className="elegir__pie">
          <button type="button" className="boton" onClick={agregar} disabled={!cuantos}>{cuantos ? `Sumar ${cuantos === 1 ? 'una cosa' : `${cuantos} cosas`}` : 'Elegí qué sumar'}</button>
          <button type="button" className="boton boton--secundario" onClick={() => dialogo.current.close()}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}
