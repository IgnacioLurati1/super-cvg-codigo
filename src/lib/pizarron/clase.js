// Which course a photo of the board belongs to, by the student's timetable: the class going on, or one that just ended
// (the photo of the last minutes is taken on the way out) or is about to start.

/** Minutes before a class starts and after it ends that still count as it. */
export const ANTES_MIN = 10;
export const DESPUES_MIN = 30;

/**
 * The class of `fecha` among `clases` ({ dia (0 Sunday), desde, hasta (minutes), cursoId, nombre } of armarSemana): the
 * one going on, else the nearest within the margins. Null when there's none, or it's not a campus course.
 */
export function claseDeAhora(clases, fecha = new Date()) {
  const dia = fecha.getDay();
  const minuto = fecha.getHours() * 60 + fecha.getMinutes();
  const lejania = (c) => (minuto < c.desde ? c.desde - minuto : minuto >= c.hasta ? minuto - c.hasta + 1 : 0);
  const cerca = (c) => c.dia === dia && minuto >= c.desde - ANTES_MIN && minuto < c.hasta + DESPUES_MIN;
  const clase = (clases ?? []).filter(cerca).sort((a, b) => lejania(a) - lejania(b))[0];
  return clase && clase.cursoId !== null && clase.cursoId !== undefined ? clase : null;
}

/** The name of the PDF of a class: «Pizarrón del 26-11». */
export const nombreDelPdf = (fecha = new Date()) =>
  `Pizarrón del ${String(fecha.getDate()).padStart(2, '0')}-${String(fecha.getMonth() + 1).padStart(2, '0')}.pdf`;
