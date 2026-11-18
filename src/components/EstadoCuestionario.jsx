import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cargarCuestionario } from '../lib/campus';
import { estadoDe, intentosEnTexto, notaSobre, TEXTO_ESTADO } from '../lib/cuestionarios';
import { fechaHora } from '../lib/datos';
import { useConsulta } from '../lib/useConsulta';
import { useHechaSola } from './Hecha';
import './estadoTarea.css';

export const rutaDeCuestionario = ({ materiaId, cmid }) => `/materias/${materiaId}/cuestionarios/${cmid}`;
export const rutaDeRevision = (cuestionario, intentoId) => `${rutaDeCuestionario(cuestionario)}/intentos/${intentoId}`;

// The colors of a task's state (estadoTarea.css), by where the student is with the quiz.
const COLOR = { 'sin-hacer': 'sin', 'en-curso': 'borrador', hecho: 'entregada', calificado: 'calificada' };

/** Where the student is with a quiz, as a word with its color: sin hacer, en curso, hecho or calificado. */
export function ChipCuestionario({ clave }) {
  return <span className="chip-tarea" data-estado={COLOR[clave]}>{TEXTO_ESTADO[clave]}</span>;
}

// The teacher's marks in the margin: a tick, a cross, half a circle, a clock and a dash. The word always goes next to
// them: the drawing and its color never say it alone.
const TRAZOS = {
  bien: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  mal: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  parcial: <><circle cx="12" cy="12" r="7.5" /><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" /></>,
  pendiente: <><circle cx="12" cy="12" r="7.5" /><path d="M12 8v4.5l3 2" /></>,
  sin: <path d="M7 12h10" />,
};

export function MarcaResultado({ resultado }) {
  const trazo = TRAZOS[resultado];
  if (!trazo) return null;
  return (
    <svg className="marca-resultado" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {trazo}
    </svg>
  );
}

/** The preview of a campus quiz (Previa.jsx): where the student is with it, its dates and the way to its page, where its
 * attempts and reviews are. `onIr` closes the preview, which stays mounted across pages. */
export default function CuestionarioPrevia({ item, onIr }) {
  const { materiaId, cmid } = item.cuestionario;
  const { datos, error, cargando } = useConsulta(() => cargarCuestionario(materiaId, cmid), [materiaId, cmid]);
  const [ahora] = useState(() => Date.now() / 1000);
  const c = datos?.cuestionario;
  const clave = c ? estadoDe(datos.intentos, datos.mejor) : null;
  // Done or graded, it leaves Hoy by itself, with what this already brought.
  useHechaSola(c ? `q${c.cmid}` : null, c?.cierra, clave === 'hecho' || clave === 'calificado');
  let dato = null;
  if (clave === 'calificado') dato = `Nota ${notaSobre(datos.mejor.nota, c.nota, c.decimales)}`;
  else if (c && c.intentos !== null && datos.intentos) dato = intentosEnTexto(c.intentos, datos.intentos.length);
  const fechas = item.fechas?.length
    ? item.fechas.map((f) => ({ etiqueta: f.etiqueta.replace(/:\s*$/, ''), cuando: f.cuando }))
    : [c?.abre && { etiqueta: c.abre > ahora ? 'Abre' : 'Abrió', cuando: c.abre }, c?.cierra && { etiqueta: c.cierra > ahora ? 'Cierra' : 'Cerró', cuando: c.cierra }].filter(Boolean);
  return (
    <div className="tarea-previa" aria-busy={cargando && !datos ? 'true' : undefined}>
      {cargando && !datos && (
        <div className="tarea-previa__esqueleto" role="status">
          <span className="solo-lectores">Buscando el cuestionario</span>
          <i aria-hidden="true" /><i aria-hidden="true" />
        </div>
      )}
      {error && !datos && <p className="previa__aviso" role="alert">{error}</p>}
      {c && (
        <div className="tarea-previa__estado">
          <ChipCuestionario clave={clave} />
          {dato && <p className="tarea-previa__dato">{dato}</p>}
        </div>
      )}
      {fechas.length > 0 && (
        <dl className="previa__fechas">
          {fechas.map((f) => (
            <div key={`${f.etiqueta}${f.cuando}`}>
              <dt>{f.etiqueta}</dt>
              <dd>{fechaHora(f.cuando)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="previa__acciones">
        {(!datos || c) && <Link className="boton" to={rutaDeCuestionario(item.cuestionario)} onClick={onIr}>Ver el cuestionario</Link>}
        <a className="boton boton--secundario" href={item.destino} target="_blank" rel="noreferrer">Abrir en el campus<span className="solo-lectores">, se abre en otra pestaña</span></a>
      </div>
    </div>
  );
}
