import { useEffect, useMemo, useRef, useState } from 'react';
import { cargarContenido } from '../lib/campus';
import { buscar } from '../lib/datos';
import { estaOculto, mioActual, personalizar } from '../lib/mio';
import { useConsulta } from '../lib/useConsulta';
import Campo from './Campo';
import { Cargando, datoDe, ErrorConReintento } from './Filas';

const llave = (materiaId, clave) => `${materiaId}:${clave}`;

function agrupar(items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.seccionId)) grupos.set(item.seccionId, { id: item.seccionId, nombre: item.seccion || 'General', items: [] });
    grupos.get(item.seccionId).items.push(item);
  }
  return [...grupos.values()];
}

/** A sheet to pick things of campus courses. They go in as references: the campus keeps them. `yaEstan`: the keys
 * already in the category, shown checked and fixed. Picks from several courses add up. */
export default function ElegirDelCampus({ materias, inicial, yaEstan, onAgregar, onCerrar }) {
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  const [materiaId, setMateriaId] = useState(() => String(inicial ?? materias[0]?.id ?? ''));
  const [filtro, setFiltro] = useState('');
  const [elegidos, setElegidos] = useState(() => new Map());
  const materia = materias.find((m) => String(m.id) === materiaId) ?? null;

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);

  const { datos: items, error, cargando, recargar } = useConsulta(async () => {
    if (!materia) return [];
    const mio = mioActual();
    return personalizar(await cargarContenido(materia), mio).filter((i) => !estaOculto(mio, i));
  }, [materiaId]);

  const grupos = useMemo(() => agrupar(filtro.trim() ? buscar(items ?? [], filtro, 1000) : items ?? []), [items, filtro]);

  const alternar = (lista, poner) => {
    setElegidos((antes) => {
      const nuevo = new Map(antes);
      for (const i of lista) {
        const k = llave(i.materiaId, i.clave);
        if (yaEstan.has(k)) continue;
        if (poner) nuevo.set(k, i);
        else nuevo.delete(k);
      }
      return nuevo;
    });
  };

  const agregar = () => {
    onAgregar([...elegidos.values()].map((i) => ({ tipo: 'campus', materiaId: i.materiaId, clave: i.clave, clase: i.tipo })));
    dialogo.current.close();
  };

  const cuantos = elegidos.size;
  const vacio = filtro.trim() ? 'No hay nada con ese nombre.' : 'Esta materia todavía no tiene contenido.';

  return (
    <dialog
      ref={dialogo}
      className="previa elegir"
      aria-labelledby="elegir-titulo"
      onClose={onCerrar}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja elegir__caja">
        <div className="previa__cabeza">
          <h2 id="elegir-titulo">Sumar del campus</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">Lo que elegís queda enlazado al campus. Si lo cambian allá, acá ves el cambio.</p>
        <div className="elegir__filtros">
          <Campo etiqueta="Materia">
            <select className="campo__control" value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              {materias.map((m) => <option key={m.id} value={String(m.id)}>{m.nombre}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="Buscar">
            <input className="campo__control" type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
          </Campo>
        </div>
        <p className="solo-lectores" role="status">{items ? (grupos.length ? '' : vacio) : ''}</p>
        <div className="elegir__lista" aria-busy={cargando && !items ? 'true' : undefined}>
          {error && !items && <ErrorConReintento texto={error} recargar={recargar} />}
          {cargando && !items && <Cargando texto="Buscando el contenido" cuantas={5} />}
          {items && !grupos.length && <p>{vacio}</p>}
          {grupos.map((g) => {
            const libres = g.items.filter((i) => !yaEstan.has(llave(i.materiaId, i.clave)));
            const todos = libres.length > 0 && libres.every((i) => elegidos.has(llave(i.materiaId, i.clave)));
            return (
              <fieldset className="elegir__seccion" key={g.id}>
                <legend className="elegir__titulo">{g.nombre}</legend>
                {libres.length > 1 && (
                  <button type="button" className="seccion__ocultar elegir__todo" onClick={() => alternar(libres, !todos)}>
                    {todos ? 'Sacar toda la sección' : 'Elegir toda la sección'}
                  </button>
                )}
                {g.items.map((i) => {
                  const k = llave(i.materiaId, i.clave);
                  const esta = yaEstan.has(k);
                  return (
                    <label className="opcion elegir__item" key={k}>
                      <input type="checkbox" checked={esta || elegidos.has(k)} disabled={esta} onChange={(e) => alternar([i], e.target.checked)} />
                      <span className="fila__texto">
                        <span className="fila__nombre">{i.nombre}</span>
                        <span className="fila__dato">{esta ? 'Ya está en esta categoría' : datoDe(i)}</span>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
        </div>
        <div className="elegir__pie">
          <button type="button" className="boton" onClick={agregar} disabled={!cuantos}>{cuantos ? `Sumar ${cuantos === 1 ? 'una cosa' : `${cuantos} cosas`}` : 'Elegí qué sumar'}</button>
          <button type="button" className="boton boton--secundario" onClick={() => dialogo.current.close()}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}
