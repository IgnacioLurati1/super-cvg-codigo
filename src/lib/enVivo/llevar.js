// What «Llevar a la sesión» runs from a summary or a course (LlevarALaSesion `llevar`). The session's code loads only on
// click: these stay tiny, in the screens that show the button.

/** A summary of El Santo Resumen (resumenMesa.js). */
export const llevarResumen = (r) => async (sesion) => (await import('./resumenMesa')).llevarResumen(sesion, r);

/** A course, with its sections as this student sees them now (`grupos()`, read on click; materiaMesa.js). `materia`:
 * its number, or «p…» for one's own. */
export const llevarMateria = (nombre, grupos, materia) => async (sesion) => (await import('./materiaMesa')).llevarMateria(sesion, nombre, grupos(), materia);
