import { useSyncExternalStore } from 'react';
import { escucharMio, mioActual } from './mio';

// The color of each of the student's subjects: a different one for each, the same in every screen (Horario, Hoy,
// Calendario, Materias). By order, so adding one doesn't change the others: the courses in progress by their number,
// then the subjects added from the faculty's schedules (mio.js) by theirs. Only numbers, only in memory.
// An id outside that list (an old course, or before the list came) keeps the color of its number, as before.

/** How many colors there are: `--materia-0` to `--materia-9` in tokens.css. */
export const COLORES = 10;
const VIEJOS = 6;

let cursos = [];
const avisados = new Set();

/** The courses in progress, when campus.js gets them. */
export function fijarCursos(ids) {
  const nuevos = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  if (nuevos.join() === cursos.join()) return;
  cursos = nuevos;
  avisados.forEach((f) => f());
}

/** By id, the color of each subject of the list: the courses, then the extras, in the order of their numbers. */
export function ordenDeColores(idsDeCursos, idsDeExtras) {
  const mapa = new Map();
  for (const id of [...idsDeCursos, ...[...idsDeExtras].sort((a, b) => a - b)]) if (!mapa.has(id)) mapa.set(id, mapa.size % COLORES);
  return mapa;
}

let ultimo = { clave: null, mapa: new Map() };
function mapaActual() {
  const extras = (mioActual().horario?.extras ?? []).map((x) => x.id);
  const clave = `${cursos.join()}|${extras.join()}`;
  if (clave !== ultimo.clave) ultimo = { clave, mapa: ordenDeColores(cursos, extras) };
  return ultimo.mapa;
}

const colorEn = (mapa, id) => (Number.isInteger(id) && id > 0 ? mapa.get(id) ?? id % VIEJOS : undefined);

/** The color of a subject (0 to COLORES - 1) by the id of its course or of its extra, or undefined without one. */
export const colorDeMateria = (id) => colorEn(mapaActual(), id);

function suscribir(f) {
  avisados.add(f);
  const dejar = escucharMio(f);
  return () => {
    avisados.delete(f);
    dejar();
  };
}

/** The same, for a component: it draws again when the list changes. */
export function useColorDeMateria() {
  const mapa = useSyncExternalStore(suscribir, mapaActual, mapaActual);
  return (id) => colorEn(mapa, id);
}
