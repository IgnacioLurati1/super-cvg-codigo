import { alumnoListo, cargarMaterias } from './campus';
import { cargarCursos, cargarDatosCurso, cargarEntregas, cursoParecido } from './classroom';
import { cursosDeClassroom, disponibleGoogle, permisoGoogle, recordarCursosDeClassroom, renovarGoogle, tokenGoogle, usosDeGoogle } from './google';
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
  if (tokenGoogle()) recordarCursosDeClassroom([...unidos.keys()]);
  return Promise.all([...unidos.values()].map(async (u) => {
    const [datos, entregadas] = await Promise.all([cargarDatosCurso(u.curso.id), cargarEntregas(u.curso.id).catch(() => new Set())]);
    return { ...u, datos, entregadas };
  }));
}

/** As the site opens on Hoy (main.jsx): the permission renewed if it ended, and then the list of courses and what each
 * course joined last time has, without waiting for Hoy to draw or for the list. Each answer waits in classroom.js for
 * cargarClassroomUnido. Measured on his phone on 24/11: the list took 1.4 s before any course was asked for. */
export function adelantarClassroom() {
  if (!disponibleGoogle() || !usosDeGoogle().includes('classroom')) return;
  const nada = () => {};
  const ir = () => {
    if (!permisoGoogle('classroom')) return;
    cargarCursos().catch(nada);
    for (const id of cursosDeClassroom()) {
      cargarDatosCurso(id).catch(nada);
      cargarEntregas(id).catch(nada);
    }
  };
  if (tokenGoogle()) ir();
  else renovarGoogle().then((si) => si && ir(), nada);
}
