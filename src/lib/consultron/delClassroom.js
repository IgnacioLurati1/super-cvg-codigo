// What Consultron takes from Classroom: the tasks not turned in, for «¿qué tengo?», and what each course says in words
// (tasks, materials and messages of the stream), to look for answers there. Only if the student already connected
// their Google account: Consultron never asks for it. What a file attached there says never comes: Classroom gives its
// name and its link, nothing else. It stays where the rest of Classroom does (classroom.js): offline, what was kept.
import { cargarMaterias, cargarPerfil } from '../campus.js';
import { cargarCursos, cargarDatosCurso, cargarEntregas, cursoParecido, pendientesDe, textosDeCurso } from '../classroom.js';
import { guardadoSinRed, permisoGoogle } from '../google.js';
import { materiaDe, mioActual } from '../mio.js';
import { documentoDeTexto } from './adjuntar.js';

/** How many posts of each course go to the search: the newest. */
export const POSTS_POR_CURSO = 120;

/**
 * The Classroom course of each campus course in progress (the one chosen there, or the one named alike) and of each
 * course of the student's own, once each: [{ curso, materia: { id, nombre }, propia }]. `materia.id` is the campus
 * course, undefined for one of their own, whose id goes in `propia`. The same match as Hoy.
 */
export function unirCursos(enCurso, cursos, mio) {
  const unidos = new Map();
  for (const m of enCurso) {
    const elegido = materiaDe(mio, m.id).classroom;
    const curso = elegido ? cursos.find((c) => c.id === elegido) : cursoParecido(m.nombre, cursos);
    if (curso && !unidos.has(curso.id)) unidos.set(curso.id, { curso, materia: { id: m.id, nombre: m.nombre }, propia: null });
  }
  for (const p of mio.propias ?? []) {
    const curso = p.classroom ? cursos.find((c) => c.id === p.classroom) : null;
    if (!curso || unidos.has(curso.id)) continue;
    // The student's own sections of a campus course carry that course's name.
    const delCampus = p.de ? enCurso.find((m) => m.id === p.de) : null;
    unidos.set(curso.id, { curso, materia: { id: delCampus?.id, nombre: delCampus?.nombre ?? p.nombre }, propia: p.id });
  }
  return [...unidos.values()];
}

/** The student's Classroom courses with what each has, or [] without the permission (offline, what was kept). A course
 * that fails is left out. */
export async function cargarUnidos() {
  if (!permisoGoogle('classroom') && !guardadoSinRed('classroom')) return [];
  await cargarPerfil();
  const [{ enCurso }, cursos] = await Promise.all([cargarMaterias(), cargarCursos()]);
  const unidos = unirCursos(enCurso, cursos, mioActual());
  const completos = await Promise.all(
    unidos.map(async (u) => {
      try {
        const [datos, entregadas] = await Promise.all([cargarDatosCurso(u.curso.id), cargarEntregas(u.curso.id).catch(() => new Set())]);
        return { ...u, datos, entregadas };
      } catch {
        return null;
      }
    }),
  );
  return completos.filter(Boolean);
}

/** The tasks not turned in of those courses, shaped like the campus' pending events. */
export const pendientesDeUnidos = (unidos, ahora = Math.floor(Date.now() / 1000)) => unidos.flatMap((u) => pendientesDe(u.datos, u.entregadas, u.materia, ahora));

/**
 * What those courses say, as documents to search (fuentes.js): one per task, material or message. `de`: which ones,
 * { materias: Set of campus course ids, propias: Set of own course ids }; without it, all of them.
 */
export function docsDeClassroom(unidos, de = null) {
  const entra = (u) => !de || (u.materia.id !== undefined && de.materias.has(u.materia.id)) || (u.propia && de.propias.has(u.propia));
  return unidos.filter(entra).flatMap((u) =>
    textosDeCurso(u.datos)
      .slice(0, POSTS_POR_CURSO)
      .map((t) => documentoDeTexto(`classroom:${u.curso.id}:${t.id}`, { tipo: 'classroom', nombre: t.titulo, clase: t.clase, materia: u.materia.nombre, url: t.url }, t.texto)),
  );
}
