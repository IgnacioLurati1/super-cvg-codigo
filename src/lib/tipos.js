// What kind of date something is, so exams and deliveries stand out in the calendar. The student picks it for the
// dates they add; for the campus' dates and the ones found in a course it's guessed from the title. Color never goes
// alone: the word is always next to it.

export const TIPOS = [
  { valor: 'parcial', texto: 'Parcial' },
  { valor: 'final', texto: 'Final' },
  { valor: 'entrega', texto: 'Entrega' },
  { valor: 'otro', texto: 'Otra cosa' },
];

export const esTipo = (t) => TIPOS.some((x) => x.valor === t);
export const textoDeTipo = (t) => TIPOS.find((x) => x.valor === t)?.texto ?? 'Otra cosa';

const normalizar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
const ENTREGA = /\bentregas?\b|\btps?\b|\btrabajos? practicos?\b/;

/** The kind a title points to, or null if it says nothing. «Entrega final» is a delivery, «Examen final» a final. */
export function adivinarTipo(titulo) {
  const t = normalizar(titulo);
  if (/\b(parcial(es)?|recuperatorios?|recu|coloquios?)\b/.test(t)) return 'parcial';
  if (/\bfinal(es)?\b|\bmesas? de examen(es)?\b/.test(t) && !ENTREGA.test(t)) return 'final';
  if (ENTREGA.test(t)) return 'entrega';
  if (/\bexamen(es)?\b/.test(t)) return 'parcial';
  return null;
}

/** The kind of a calendar event: the one chosen, or the one its title points to. */
export const tipoDe = (evento) => (esTipo(evento.tipo) ? evento.tipo : (adivinarTipo(evento.titulo) ?? 'otro'));

/** For a screen reader: which marked kinds a day has, as words («parcial y entrega»). Empty if none. */
export function tiposEnTexto(eventos) {
  const hay = TIPOS.filter((x) => x.valor !== 'otro' && eventos.some((e) => tipoDe(e) === x.valor)).map((x) => x.texto.toLocaleLowerCase('es'));
  return hay.length > 1 ? `${hay.slice(0, -1).join(', ')} y ${hay.at(-1)}` : (hay[0] ?? '');
}
