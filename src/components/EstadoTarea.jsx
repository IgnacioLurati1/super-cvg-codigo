import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarTarea } from '../lib/campus';
import { faltan, fechaHoraSuelta } from '../lib/datos';
import { estadoDe, estaVencida, porQueNo, seEntregaAca, TEXTO_ESTADO, venceEl } from '../lib/tareas';
import { useConsulta } from '../lib/useConsulta';
import { useHechaSola } from './Hecha';
import './estadoTarea.css';

export const rutaDeTarea = ({ materiaId, cmid }) => `/materias/${materiaId}/tareas/${cmid}`;

/** Where a task is, as a word with its color: sin entregar, borrador, entregada or calificada. */
export function ChipEstado({ clave }) {
  return <span className="chip-tarea" data-estado={clave}>{TEXTO_ESTADO[clave]}</span>;
}

/** The preview of a campus task (Previa.jsx): where it is and when it is due, and the way to its page, where it is
 * read whole and handed in. `onIr` closes the preview, which stays mounted across pages. */
export default function TareaPrevia({ item, onIr }) {
  const { materiaId, cmid } = item.tarea;
  const { datos, error, cargando } = useConsulta(() => cargarTarea(materiaId, cmid), [materiaId, cmid]);
  const [ahora] = useState(() => Date.now() / 1000);
  const tarea = datos?.tarea;
  const estado = datos?.estado;
  const clave = estado ? estadoDe(estado) : null;
  const vence = tarea ? venceEl(tarea, estado) : null;
  // Handed in or graded, it leaves Hoy by itself, with what this already brought.
  useHechaSola(tarea ? `t${tarea.cmid}` : null, vence, clave === 'entregada' || clave === 'calificada');
  const entregable = tarea && estado && seEntregaAca(tarea) && !porQueNo(tarea, estado, ahora);
  return (
    <div className="tarea-previa" aria-busy={cargando && !datos ? 'true' : undefined}>
      {cargando && !datos && (
        <div className="tarea-previa__esqueleto" role="status">
          <span className="solo-lectores">Buscando la tarea</span>
          <i aria-hidden="true" /><i aria-hidden="true" />
        </div>
      )}
      {error && !datos && <p className="previa__aviso" role="alert">{error}</p>}
      {tarea && estado && (
        <div className="tarea-previa__estado">
          <ChipEstado clave={clave} />
          {clave === 'calificada' && <p className="tarea-previa__dato">Nota {estado.devolucion.nota}</p>}
          {clave !== 'calificada' && vence && (
            <p className="tarea-previa__dato" data-vencida={estaVencida(tarea, estado, ahora) || undefined}>
              {faltan(vence, ahora)}
              <span className="tarea-previa__fecha">{fechaHoraSuelta(vence)}</span>
            </p>
          )}
        </div>
      )}
      <div className="previa__acciones">
        {(!datos || tarea) && (
          <Link className="boton" to={rutaDeTarea(item.tarea)} onClick={onIr}>{entregable ? 'Ver y entregar' : 'Ver la tarea'}</Link>
        )}
        <a className="boton boton--secundario" href={item.destino} target="_blank" rel="noreferrer">Abrir en el campus<span className="solo-lectores">, se abre en otra pestaña</span></a>
      </div>
    </div>
  );
}
