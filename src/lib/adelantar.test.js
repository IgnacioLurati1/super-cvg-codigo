// What the site asks the campus as it opens (adelantarPedidos), with the campus answering batches like the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adelantarPedidos, cargarIndice, cargarMaterias } from './campus';
import { cerrarSesion, cursosRecordados, iniciarSesion, recordarAlumno, recordarCursos, vaciarCache } from './sesion';

const CURSOS = [
  { id: 3, fullname: 'Física', shortname: 'FIS' },
  { id: 4, fullname: 'Química', shortname: 'QUI' },
];
const RESPUESTAS = {
  core_webservice_get_site_info: () => ({ userid: 9, firstname: 'Ana' }),
  core_course_get_enrolled_courses_by_timeline_classification: () => ({ courses: CURSOS }),
  core_enrol_get_users_courses: () => CURSOS,
  core_course_get_contents: ({ courseid }) => [{ id: courseid * 10, name: `Unidad de ${courseid}`, modules: [{ id: courseid * 100, name: `Apunte ${courseid}`, modname: 'page', url: `https://frro.cvg.utn.edu.ar/mod/page/view.php?id=${courseid * 100}` }] }],
};

let tandas;
beforeEach(() => {
  tandas = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, { body }) => {
    const funciones = [];
    const responses = [];
    if (body.get('wsfunction') === 'tool_mobile_call_external_functions') {
      for (let i = 0; body.has(`requests[${i}][function]`); i++) {
        const f = body.get(`requests[${i}][function]`);
        funciones.push(f);
        responses.push({ error: false, data: JSON.stringify(RESPUESTAS[f]?.(JSON.parse(body.get(`requests[${i}][arguments]`))) ?? []) });
      }
      tandas.push(funciones);
      return new Response(JSON.stringify({ responses }));
    }
    const f = body.get('wsfunction');
    tandas.push([f]);
    const parametros = Object.fromEntries([...body].filter(([k]) => !['wstoken', 'wsfunction', 'moodlewsrestformat'].includes(k)));
    return new Response(JSON.stringify(RESPUESTAS[f]?.({ courseid: Number(parametros.courseid) }) ?? []));
  }));
});
afterEach(() => {
  cerrarSesion();
  vaciarCache();
  vi.unstubAllGlobals();
});

const contenidos = (tanda) => tanda.filter((f) => f === 'core_course_get_contents').length;
const esperar = () => new Promise((ok) => setTimeout(ok, 300));

describe('opening the site', () => {
  it('the first time, asks for the contents after the list of courses, and keeps only their numbers', async () => {
    iniciarSesion('clave');
    adelantarPedidos(true);
    await esperar();
    expect(tandas.findIndex((t) => contenidos(t))).toBeGreaterThan(0);
    expect(cursosRecordados()).toEqual([3, 4]);
    expect(sessionStorage.getItem('cl.sesion.cursos')).toMatch(/^[a-z0-9]+:3,4$/);
  });

  it('with the courses of the last visit, sends their contents in the first moment, apart from the light reads', async () => {
    iniciarSesion('clave');
    recordarAlumno(9);
    recordarCursos([3, 4]);
    adelantarPedidos(true);
    await esperar();
    const primera = tandas.findIndex((t) => t.includes('core_enrol_get_users_courses'));
    const deContenidos = tandas.findIndex((t) => contenidos(t) === 2);
    // The contents don't wait for the list of courses: they leave before it, or with it, in their own batch.
    expect(deContenidos).toBeGreaterThanOrEqual(0);
    expect(deContenidos).toBeLessThanOrEqual(primera + 1);
    expect(tandas[deContenidos]).toEqual(['core_course_get_contents', 'core_course_get_contents']);
    expect(contenidos(tandas[primera])).toBe(0);
    // Hoy takes them: nothing more is asked for the contents.
    const antes = tandas.length;
    const indice = await cargarIndice((await cargarMaterias()).enCurso);
    expect(indice.map((i) => i.nombre ?? i.titulo).join(' ')).toContain('Apunte 3');
    expect(tandas.length).toBe(antes);
  });

  it('a course no longer in progress is not shown, and one added is asked for', async () => {
    iniciarSesion('clave');
    recordarAlumno(9);
    recordarCursos([3, 99]);
    adelantarPedidos(true);
    await esperar();
    const indice = await cargarIndice((await cargarMaterias()).enCurso);
    const texto = JSON.stringify(indice);
    expect(texto).toContain('Apunte 3');
    expect(texto).toContain('Apunte 4');
    expect(texto).not.toContain('Apunte 99');
    expect(cursosRecordados()).toEqual([3, 4]);
  });

  it('outside Hoy, asks for no contents', async () => {
    iniciarSesion('clave');
    recordarAlumno(9);
    recordarCursos([3, 4]);
    adelantarPedidos(false);
    await esperar();
    expect(tandas.flat()).not.toContain('core_course_get_contents');
  });
});

describe('every course at once (Buscar, the palette, Consultron)', () => {
  // On 27/11 Buscar asked for the contents of all the student's courses in the same moment, and the campus fell.
  it('never more than two requests with contents at the same time, together or apart', async () => {
    for (const juntas of [true, false]) {
      let enVuelo = 0;
      let maximo = 0;
      const pedidos = [];
      vi.stubGlobal('fetch', vi.fn(async (_url, { body }) => {
        enVuelo++;
        maximo = Math.max(maximo, enVuelo);
        await new Promise((ok) => setTimeout(ok, 5));
        enVuelo--;
        if (body.get('wsfunction') === 'tool_mobile_call_external_functions') {
          if (!juntas) return new Response(JSON.stringify({ exception: 'x', errorcode: 'servicenotavailable' }));
          const responses = [];
          for (let i = 0; body.has(`requests[${i}][function]`); i++) {
            const { courseid } = JSON.parse(body.get(`requests[${i}][arguments]`));
            pedidos.push(courseid);
            responses.push({ error: false, data: JSON.stringify(RESPUESTAS.core_course_get_contents({ courseid })) });
          }
          return new Response(JSON.stringify({ responses }));
        }
        const courseid = Number(body.get('courseid'));
        pedidos.push(courseid);
        return new Response(JSON.stringify(RESPUESTAS.core_course_get_contents({ courseid })));
      }));
      iniciarSesion(juntas ? 'clave' : 'otra');
      const materias = Array.from({ length: 23 }, (_, i) => ({ id: i + 1, nombre: `Materia ${i + 1}` }));
      const indice = await cargarIndice(materias);
      expect(maximo).toBeLessThanOrEqual(2);
      expect(new Set(pedidos).size).toBe(23);
      expect(JSON.stringify(indice)).toContain('Apunte 23');
      cerrarSesion();
      vaciarCache();
    }
  });
});
