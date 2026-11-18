import { IconoHecha } from './Hecha';
import Simbolo from './Simbolo';
import { useColorDeMateria } from '../lib/colores';
import { diaEnTexto } from '../lib/datos';
import { hechasEnTexto } from '../lib/hechas';
import { textoDeTipo, tipoDe, tiposEnTexto } from '../lib/tipos';

// A day as the Calendario's month draws it: its number, the academic calendar's band and a few chips. The Calendario's
// grid uses it, and Hoy's week when the student chooses it (hoy.js, `semana`).

const CHIPS = 2;
// On a phone each thing is a dot: up to four fit in the narrowest cell, or three and «+N».
const PUNTOS = 4;
const cantidadEnTexto = (n) => (n === 0 ? 'sin actividades' : n === 1 ? 'una actividad' : `${n} actividades`);
/** What a day says to a screen reader: the day, how many things and, if any, the exams and deliveries. */
export const diaConTodo = (clave, eventos, marca) => {
  const marcas = tiposEnTexto(eventos);
  return `${diaEnTexto(clave)}${marca ? `, ${marca.titulo}` : ''}, ${cantidadEnTexto(eventos.length)}${hechasEnTexto(eventos)}${marcas ? `, con ${marcas}` : ''}`;
};
// What the academic calendar paints whole (a day without classes, an exam call, the end of a cuatrimestre) goes as
// the cell's band, not as one more chip.
export const sinLoDeLaCasilla = (eventos) => eventos.filter((e) => !e.enLaCasilla);
// In a month's cell only a few fit: exams, finals and deliveries go first so they never hide behind «+1».
const PESO = { parcial: 0, final: 1, entrega: 2 };
// The academic calendar's dates (consultations, procedures) go after the student's own and the campus': those matter more.
export const deLaFacultad = (e) => (e.propio === 'facultad' ? 1 : 0);
const primeroLoMarcado = (eventos) => [...eventos].sort((a, b) => (PESO[tipoDe(a)] ?? 3) - (PESO[tipoDe(b)] ?? 3) || deLaFacultad(a) - deLaFacultad(b));

/** Inside the day's button or link, all hidden from screen readers: the element around it says it (`diaConTodo`).
 * `eventos`: already without what the band says. */
export function ContenidoDelDia({ numero, eventos, marca }) {
  const cantidad = eventos.length;
  const colorDe = useColorDeMateria();
  const ordenados = primeroLoMarcado(eventos);
  const puntos = cantidad > PUNTOS ? PUNTOS - 1 : cantidad;
  return (
    <>
      {/* «+N» goes next to the day: under two long titles it would be cut off at the bottom of the cell. */}
      <span className="cal__cabeza">
        <span className="cal__numero">{numero}</span>
        {cantidad > CHIPS && <span className="cal__mas" aria-hidden="true">+{cantidad - CHIPS}</span>}
      </span>
      {marca && <span className="cal__marca" aria-hidden="true">{marca.titulo}</span>}
      {cantidad > 0 && (
        <span className="cal__chips" aria-hidden="true">
          {ordenados.slice(0, CHIPS).map((e) => {
            const tipo = tipoDe(e);
            return (
              <span key={e.id} className="cal__chip" data-tipo={tipo === 'otro' ? undefined : tipo} data-hecha={e.hecha ? '' : undefined}>
                {/* On a phone the title doesn't fit: the kind's first letter keeps it from being only a color. */}
                {tipo !== 'otro' && <span className="cal__chip-letra">{textoDeTipo(tipo)[0]}</span>}
                <Simbolo id={e.materiaId} nombre={e.materia} tamano="mini" />
                {e.hecha && <IconoHecha />}
                <span className="cal__chip-texto">{e.titulo}</span>
              </span>
            );
          })}
        </span>
      )}
      {/* The phone's cell: the kind's color, or the course's for anything else; hollow once done. */}
      {cantidad > 0 && (
        <span className="cal__puntos" aria-hidden="true">
          {ordenados.slice(0, puntos).map((e) => {
            const tipo = tipoDe(e);
            return <span key={e.id} className="cal__punto" data-tipo={tipo === 'otro' ? undefined : tipo} data-materia={tipo === 'otro' ? colorDe(e.materiaId) : undefined} data-hecha={e.hecha ? '' : undefined} />;
          })}
          {cantidad > puntos && <span className="cal__puntos-mas">+{cantidad - puntos}</span>}
        </span>
      )}
    </>
  );
}
