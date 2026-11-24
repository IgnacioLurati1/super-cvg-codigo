import { alumnoListo, cargarMaterias } from './campus';
import { cargarCursos, cargarDatosCurso, cargarEntregas, cursoParecido } from './classroom';
import { materiaDe, mioActual } from './mio';

/** The Classroom course of each campus course (chosen, or found by the name) and of each course of one's own, with
 * what it has and the tasks turned in. Only with Google already connected: it never asks. */
export async function cargarClassroomUnido() {
  await alumnoListo();
  const [{ enCurso }, cursos] = await Promise.all([cargarMaterias(), cargarCursos()]);
  const mio = mioActual();
  const unidos = new Map();
  for (const m of enCurso) {
    const unido = materiaDe(mio, m.id).classroom;
    const curso = unido ? cursos.find((c) => c.id === unido) : cursoParecido(m.nombre, cursos);
    if (curso && !unidos.has(curso.id)) unidos.set(curso.id, { curso, materia: { id: m.id, nombre: m.nombre }, ruta: `/materias/${m.id}` });
  }
  for (const p of mio.propias) {
    const curso = p.classroom ? cursos.find((c) => c.id === p.classroom) : null;
    if (curso && !unidos.has(curso.id)) unidos.set(curso.id, { curso, materia: { id: undefined, nombre: p.nombre }, ruta: `/propias/${p.id}` });
  }
  return Promise.all([...unidos.values()].map(async (u) => {
    const [datos, entregadas] = await Promise.all([cargarDatosCurso(u.curso.id), cargarEntregas(u.curso.id).catch(() => new Set())]);
    return { ...u, datos, entregadas };
  }));
}
