import { Link } from 'react-router-dom';
import { agregarAGoogle } from '../lib/calendarioGoogle';
import { colorDeMateria, useColorDeMateria } from '../lib/colores';
import { fecha, horaDe } from '../lib/datos';
import { claveDeHecha, hechaDe } from '../lib/hechas';
import { textoDeTipo, tipoDe } from '../lib/tipos';
import { rutaDeCuestionario } from './EstadoCuestionario';
import { rutaDeTarea } from './EstadoTarea';
import { IconoHecha } from './Hecha';
import Simbolo from './Simbolo';

export const colorDe = (evento) => colorDeMateria(evento.materiaId);
// The symbol of a date that is not of a course.
const SIN_MATERIA = { facultad: 'facultad', sysacad: 'actividad' };

/** When a date happens. A campus date also says what happens then («Vence 12 de noviembre, 08:00 a. m.», «Abre a las
 * 09:00 a. m.»), since its title no longer does. The time goes apart (`hora`): in the week's narrow columns it never
 * splits from its «a. m.», and the words before it can wrap. */
function cuandoDe(evento, conFecha) {
  const palabra = evento.propio ? null : evento.momento === 'vence' ? 'Vence' : evento.momento === 'abre' ? 'Abre' : null;
  if (!palabra) {
    const hora = evento.sinHora ? 'Todo el día' : horaDe(evento.cuando);
    return { hora: conFecha ? `${fecha(evento.cuando)}, ${hora}` : hora };
  }
  if (evento.sinHora) return { antes: conFecha ? `${palabra} ${fecha(evento.cuando)}` : `${palabra} en el día` };
  const hora = horaDe(evento.cuando);
  return { antes: conFecha ? `${palabra} ${fecha(evento.cuando)},` : `${palabra} ${/^0?1:/.test(hora) ? 'a la' : 'a las'}`, hora };
}

function deDonde(evento) {
  if (evento.propio === 'facultad') return 'Calendario académico';
  if (evento.propio === 'sysacad') return 'Te anotaste en Sysacad';
  if (evento.propio === 'tarea') return ['Tarea tuya', evento.materia].filter(Boolean).join(', ');
  if (evento.propio === 'fecha') return ['Fecha que sumaste', evento.materia].filter(Boolean).join(', ');
  if (evento.propio === 'evento') return evento.materia ? `Fecha tuya, ${evento.materia}` : 'Fecha tuya';
  if (evento.corregida) return `${evento.materia}, corregida por vos`;
  if (evento.classroom) return ['Classroom', evento.materia].filter(Boolean).join(', ');
  return evento.materia;
}

/** One date. Exams, finals and deliveries carry their kind as a word and a color. The student's own dates open
 * to be changed when there's `onCambiar`, and with `aGoogle` carry a link to add them to Google Calendar. The page passes
 * it only until the student links Google Calendar (calendarioSincro.js takes them, and the campus' ones, by itself): it
 * reads that once, not every row. A campus date carries «Corregir» next to it with `onCorregir`. */
export default function Evento({ evento, conFecha = false, onCambiar, onCorregir, aGoogle = false }) {
  const colorDeLaMateria = useColorDeMateria();
  const tipo = tipoDe(evento);
  const marcado = tipo !== 'otro';
  const cuando = cuandoDe(evento, conFecha);
  const contenido = (
    <>
      <Simbolo id={evento.materiaId} nombre={evento.materia} sinMateria={SIN_MATERIA[evento.propio]} />
      <span className="evento__texto">
        <span className="evento__cuando">
          {marcado && <span className="evento__tipo">{textoDeTipo(tipo)}</span>}
          {cuando.antes && (cuando.hora ? `${cuando.antes} ` : cuando.antes)}
          {cuando.hora && <span className="evento__hora">{cuando.hora}</span>}
        </span>
        {/* A campus date marked as done stays, with its tick (hechas.js). */}
        <span className="evento__titulo">
          {evento.hecha && <IconoHecha className="icono-hecha evento__hecha" />}
          {evento.titulo}
          {evento.hecha && <span className="solo-lectores">{`, ${hechaDe(claveDeHecha(evento))}`}</span>}
        </span>
        <span className="evento__materia">{deDonde(evento)}</span>
      </span>
      {onCambiar && <span className="evento__cambiar">Cambiar</span>}
    </>
  );
  // A campus task or quiz opens its page here; anything else of the campus, the campus in another tab.
  const aca = evento.propio ? null : evento.tarea ? rutaDeTarea(evento.tarea) : evento.cuestionario ? rutaDeCuestionario(evento.cuestionario) : null;
  const conGoogle = aGoogle && Boolean(evento.propio);
  // Only the campus' dates are corrected here.
  const corregir = onCorregir && !evento.propio && !evento.classroom;
  return (
    <li data-materia={colorDeLaMateria(evento.materiaId)} data-tipo={marcado ? tipo : undefined} data-hecha={evento.hecha ? '' : undefined} className={conGoogle || corregir ? 'evento-con-google' : undefined}>
      {aca
        ? <Link className="evento" to={aca}>{contenido}</Link>
        : evento.url
          ? <a className="evento" href={evento.url} target="_blank" rel="noreferrer">{contenido}<span className="solo-lectores">, se abre en otra pestaña</span></a>
          : onCambiar
            ? <button type="button" className="evento" onClick={() => onCambiar(evento)}>{contenido}</button>
            : <span className="evento">{contenido}</span>}
      {/* Next to the date and not inside it: a link can't go in the button that opens it. */}
      {corregir && (
        <button type="button" className="evento__google evento__corregir" aria-label={`Corregir ${evento.titulo}`} onClick={() => onCorregir(evento)}>
          Corregir
        </button>
      )}
      {conGoogle && (
        <a className="evento__google" href={agregarAGoogle(evento)} target="_blank" rel="noreferrer" aria-label={`Agregar a Google Calendar, ${evento.titulo}, se abre en otra pestaña`}>
          Agregar a Google Calendar
        </a>
      )}
    </li>
  );
}
