import { useEffect, useRef, useState } from 'react';
import { cargarConsejos, consejoComoNota, urlDeConsejos } from '../lib/santoResumen';
import { useConsulta } from '../lib/useConsulta';
import { Cargando, ErrorConReintento } from './Filas';

const formato = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function votosDe(c) {
  if (!c.votos || c.prom === null) return `De ${c.usuario}, sin votos todavía`;
  return `De ${c.usuario}, ${formato.format(c.prom)} de 5 con ${c.votos === 1 ? 'un voto' : `${c.votos} votos`}`;
}

/** A sheet with the tips of El Santo Resumen for a subject, and the general ones, to add to the student's notes.
 * `santo`: { slug, nombre } of the subject. `nota`: the notes as they are now, so a tip already there shows as such. */
export default function ConsejosDelSanto({ santo, nota: anotaciones, onAgregar, onCerrar }) {
  const dialogo = useRef(null);
  const desdeFondo = useRef(false);
  const [elegidos, setElegidos] = useState(() => new Map());

  useEffect(() => {
    const el = dialogo.current;
    if (!el.open) el.showModal();
  }, []);

  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const [deLaMateria, generales] = await Promise.all([cargarConsejos(santo.slug), cargarConsejos('general')]);
    return [
      { id: 'materia', nombre: `De ${santo.nombre}`, consejos: deLaMateria },
      { id: 'general', nombre: 'Para toda la carrera', consejos: generales },
    ];
  }, [santo.slug]);

  const alternar = (c, poner) => {
    setElegidos((antes) => {
      const nuevo = new Map(antes);
      if (poner) nuevo.set(c.id, c);
      else nuevo.delete(c.id);
      return nuevo;
    });
  };

  const agregar = () => {
    onAgregar([...elegidos.values()]);
    dialogo.current.close();
  };

  const cuantos = elegidos.size;
  const ninguno = datos && !datos[0].consejos.length;
  const total = datos?.reduce((n, g) => n + g.consejos.length, 0) ?? 0;
  const cuenta = !datos ? '' : !total ? `Todavía nadie dejó un consejo para ${santo.nombre}.` : total === 1 ? 'Un consejo' : `${total} consejos`;

  return (
    <dialog
      ref={dialogo}
      className="previa elegir"
      aria-labelledby="consejos-titulo"
      onClose={onCerrar}
      onPointerDown={(e) => { desdeFondo.current = e.target === dialogo.current; }}
      onClick={(e) => { if (desdeFondo.current && e.target === dialogo.current) dialogo.current.close(); }}
    >
      <div className="previa__caja elegir__caja consejos__caja">
        <div className="previa__cabeza">
          <h2 id="consejos-titulo">Consejos de El Santo Resumen</h2>
          <button type="button" className="boton boton--secundario boton--chico" onClick={() => dialogo.current.close()}>Cerrar</button>
        </div>
        <p className="previa__dato">Los escribieron alumnos que ya cursaron. Los que elegís se suman al final de tus anotaciones.</p>
        <p className="solo-lectores" role="status">{cuenta}</p>
        <div className="elegir__lista" aria-busy={cargando && !datos ? 'true' : undefined}>
          {error && !datos && <ErrorConReintento texto={error} recargar={recargar} />}
          {cargando && !datos && <Cargando texto="Buscando los consejos" cuantas={4} />}
          {ninguno && (
            <p>
              Todavía nadie dejó un consejo para {santo.nombre}.{' '}
              <a href={urlDeConsejos(santo.slug)} target="_blank" rel="noreferrer">Dejá el tuyo en El Santo Resumen<span className="solo-lectores">, se abre en otra pestaña</span></a>
            </p>
          )}
          {datos?.filter((g) => g.consejos.length).map((g) => (
            <fieldset className="elegir__seccion" key={g.id}>
              <legend className="elegir__titulo">{g.nombre}</legend>
              {g.consejos.map((c) => {
                const esta = anotaciones.includes(consejoComoNota(c));
                return (
                  <label className="opcion elegir__item santo__consejo" key={c.id}>
                    <input type="checkbox" checked={esta || elegidos.has(c.id)} disabled={esta} onChange={(e) => alternar(c, e.target.checked)} />
                    <span className="fila__texto">
                      <span className="santo__consejo-texto">{c.texto}</span>
                      <span className="fila__dato">{esta ? 'Ya está en tus anotaciones' : votosDe(c)}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        <div className="elegir__pie">
          <button type="button" className="boton" onClick={agregar} disabled={!cuantos}>{cuantos ? `Sumar ${cuantos === 1 ? 'un consejo' : `${cuantos} consejos`}` : 'Elegí qué sumar'}</button>
          <button type="button" className="boton boton--secundario" onClick={() => dialogo.current.close()}>Cancelar</button>
        </div>
      </div>
    </dialog>
  );
}
