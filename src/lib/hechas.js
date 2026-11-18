// What the student already did, among what the campus and Classroom mark as pending (`hechas` of mio.js, where the marks
// are read and written). Pure: the key of each thing, whether it is marked, and how it reads.
import { moduloDe, moduloDeTarea } from './datos';

/** The key of a pending item of Hoy or of a campus date of the calendar, or null when it has none. A campus task «t» or
 * quiz «q» by its module number, so its two dates and its page share it; another campus date «e» by its number; a
 * Classroom task «c» by its number. The student's own dates have their own «hecha». */
export function claveDeHecha(evento) {
  if (!evento || evento.propio) return null;
  if (evento.tarea?.cmid) return `t${evento.tarea.cmid}`;
  if (evento.cuestionario?.cmid) return `q${evento.cuestionario.cmid}`;
  if (typeof evento.id === 'string') {
    const classroom = /^classroom-(\d{1,24})$/.exec(evento.id);
    return classroom ? `c${classroom[1]}` : null;
  }
  const tarea = moduloDeTarea(evento.url);
  if (tarea) return `t${tarea}`;
  const cuestionario = moduloDe(evento.url, 'quiz');
  if (cuestionario) return `q${cuestionario}`;
  return Number.isSafeInteger(evento.id) && evento.id > 0 ? `e${evento.id}` : null;
}

/** Whether it is marked as done. A mark the student took off is negative: it counts as pending. */
export const estaHecha = (mio, clave) => Boolean(clave) && (mio?.hechas?.[clave] ?? 0) > 0;
export const esHecha = (mio, evento) => estaHecha(mio, claveDeHecha(evento));

/** «hecha» for a task of the campus or Classroom (una tarea), «hecho» for the rest: a quiz, and any other activity
 * (un foro, un cuestionario), where «hecho» is the neutral word. */
export const hechaDe = (clave) => (/^[tc]/.test(clave ?? '') ? 'hecha' : 'hecho');

/** The dates as they come, with `hecha` on the ones marked: they stay in the calendar and read as done. */
export function conHechas(eventos, mio) {
  if (!Object.keys(mio?.hechas ?? {}).length) return eventos;
  return eventos.map((e) => (esHecha(mio, e) ? { ...e, hecha: true } : e));
}

/** How many of a day's dates are done, said after how many there are: «, hecha», «, una hecha», «, 3 hechas» or
 * «, todas hechas». Empty without any. */
export function hechasEnTexto(eventos) {
  const cuantas = eventos.filter((e) => e.hecha).length;
  if (!cuantas) return '';
  if (cuantas === eventos.length) return cuantas === 1 ? ', hecha' : ', todas hechas';
  return cuantas === 1 ? ', una hecha' : `, ${cuantas} hechas`;
}
