// Sample data to see the panel without an account, only in development (/?demo=1).
// Everything reads as an example: nothing here looks like a real course or grade. The one exception is the catalog of
// Inscripción, with departments and course names like the campus ones so the search can be tried: nothing in it is a student's.

import { DEMO_NOTIFICACIONES } from './demoNotificaciones';
import { CUESTIONARIOS_DEMO } from './demoCuestionarios';
import { TAREAS_DEMO } from './demoTareas';

const ahora = () => Math.floor(Date.now() / 1000);
const DIA = 86_400;
// File dates hang from the start of the day, not from this second: like on the real campus, a reload
// must give the same date, or every file would look changed again after «Ya lo revisé».
const inicioDelDia = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

const curso = (id, nombre) => ({ id, fullname: nombre, fullnamedisplay: nombre, displayname: nombre, hidden: false });
const CURSOS = [curso(1, 'Materia de ejemplo A'), curso(2, 'Materia de ejemplo B'), curso(3, 'Materia de ejemplo C')];

// `cmid`: the course module the date is of, the number in its campus address.
const evento = (id, nombre, curso_, dias, modulename = 'assign', cmid = id) => ({
  id,
  activityname: nombre,
  modulename,
  course: curso_,
  timesort: ahora() + dias * DIA,
  action: { url: `https://frro.cvg.utn.edu.ar/mod/${modulename}/view.php?id=${cmid}` },
});

const archivo = (nombre, dias) => ({
  type: 'file',
  filename: nombre,
  filepath: '/',
  filesize: 840_000,
  fileurl: `https://frro.cvg.utn.edu.ar/webservice/pluginfile.php/1/mod_resource/content/1/${encodeURIComponent(nombre)}`,
  timemodified: inicioDelDia() - dias * DIA,
});

const modulo = (id, modname, name, contents = []) => ({
  id,
  modname,
  name,
  uservisible: true,
  url: `https://frro.cvg.utn.edu.ar/mod/${modname}/view.php?id=${id}`,
  modplural: modname === 'quiz' ? 'Cuestionarios' : 'Actividades',
  contents,
});

const contenido = (id) => [
  { id: id * 100 + 1, name: 'Unidad 1 de ejemplo', uservisible: true, modules: [
    modulo(id * 10 + 1, 'resource', `Apunte de ejemplo ${id}`, [archivo(`apunte-ejemplo-${id}.pdf`, id)]),
    modulo(id * 10 + 2, 'url', 'Enlace de ejemplo', [{ type: 'url', fileurl: 'https://example.org/material', timemodified: 0 }]),
    ...CUESTIONARIOS_DEMO.modulos(id),
  ] },
  { id: id * 100 + 2, name: 'Notas 2023 de ejemplo', uservisible: true, modules: [
    modulo(id * 10 + 4, 'resource', `Guía de ejemplo ${id}`, [archivo(`guia-ejemplo-${id}.pdf`, id + 5)]),
  ] },
  ...TAREAS_DEMO.seccion(id),
  // A long one, to see how a section with many things shows only the first.
  { id: id * 100 + 4, name: 'Guías de problemas de ejemplo', uservisible: true, modules: Array.from({ length: 14 }, (_, k) => (
    modulo(90_000 + id * 100 + k, 'resource', `Guía ${k + 1} de ejemplo`, [archivo(`guia-${k + 1}-ejemplo.pdf`, id + k)])
  )) },
];

// Shaped like the real campus: the secretariats, Ingreso, Grado with its departments, and Posgrado with its kinds.
// The names carry years and commissions the way the campus writes them.
const CARRERAS = [
  [18, 'Sec. Académica', [], [[195, 'Educación Basada en Competencias', 'abierta']]],
  [6, 'Sec. de Extensión Universitaria', [], [[196, 'Análisis de Datos e Inteligencia Artificial', 'abierta'], [197, 'Curso de Java', 'sin']]],
  [1, 'Ingreso', [], [[191, 'Seminario Universitario 2027', 'abierta'], [192, 'Seminario Universitario - Convenio', 'abierta']]],
  [3, 'Grado', [
    [10, 'Depto Ingeniería Eléctrica', [[153, 'Integración Eléctrica I', 'abierta'], [154, 'Economía Ingeniería Eléctrica 2025', 'abierta'], [155, 'Electrotecnia 2026', 'clave']]],
    [11, 'Depto Ingeniería Mecánica', [[161, 'Ingeniería Mecánica I', 'abierta'], [163, 'Termodinámica', 'clave'], [164, 'Mecánica Racional', 'sin']]],
    [12, 'Depto Ingeniería Química', [[135, 'Introducción a la Ingeniería Química', 'abierta'], [141, 'Química Inorgánica', 'abierta'], [142, 'Termodinámica (Ing. Química)', 'sin']]],
    [13, 'Depto Ingeniería en Sistemas', [
      [1, 'Materia de ejemplo A', 'abierta'], [2, 'Materia de ejemplo B', 'abierta'], [3, 'Materia de ejemplo C', 'abierta'],
      [104, 'Lógica y Estructuras Discretas', 'sin'], [105, 'Algoritmos y Estructuras de Datos 2026', 'abierta'],
      [109, 'Algoritmos y Estructuras de Datos - Mesa de examen 2022', 'abierta'], [106, 'Arquitectura de Computadoras', 'sin'],
      [107, 'Sistemas y Procesos de Negocio', 'abierta'], [113, 'Paradigmas de Programación', 'llena'], [114, 'Sistemas Operativos', 'sin'],
      [115, 'Análisis de Sistemas de Información', 'abierta'], [116, 'Sintaxis y Semántica de los Lenguajes', 'abierta'],
      [122, 'Bases de Datos', 'clave'], [123, 'Diseño de Sistemas de Información 2026', 'cerrada'], [124, 'Comunicación de Datos', 'sin'],
      [125, 'Desarrollo de Software', 'abierta'], [128, 'Entornos Gráficos', 'abierta'], [129, 'Administración Gerencial 2024', 'abierta'],
    ]],
    [8, 'Depto Materias Básicas', [
      [101, 'Análisis Matemático I', 'abierta'], [102, 'Álgebra y Geometría Analítica', 'clave'], [103, 'Física I 2026', 'abierta'],
      [111, 'Análisis Matemático II-201ISI', 'abierta'], [112, 'Física II', 'clave'], [121, 'Probabilidad y Estadística', 'abierta'],
      [126, 'Análisis Numérico', 'abierta'], [127, 'Economía 2026', 'abierta'], [131, 'Química General', 'abierta'],
      [133, 'Física I (Ing. Química)', 'clave'], [143, 'Física II 2025', 'abierta'], [151, 'Física I IE', 'abierta'],
      [108, 'Inglés I', 'sin'], [118, 'Inglés II', 'sin'], [117, 'Ingeniería y Sociedad', 'abierta'],
    ]],
    [9, 'Depto Ingeniería Civil', [[171, 'Ingeniería Civil I', 'abierta'], [172, 'Análisis Estructural I', 'abierta'], [173, 'Física II IC', 'abierta'], [174, 'Estabilidad - Comisión 01', 'sin']]],
  ]],
  [2, 'Posgrado y Educación Continua', [
    [21, 'Diplomaturas', [[181, 'Diplomatura en Ciencia de Datos', 'abierta']]],
    [22, 'Maestrías', [[182, 'Maestría en Ingeniería en Sistemas de Información', 'sin']]],
  ]],
];

// Who gives each sample course, obviously made up.
const DOCENTES = ['Ana Ejemplo', 'Bruno Muestra', 'Carla Prueba', 'Diego Ejemplo', 'Elena Muestra', 'Fabián Prueba'];
const docentesDe = (id) => (id % 5 === 0 ? [] : [DOCENTES[id % 6], ...(id % 2 ? [DOCENTES[(id + 3) % 6]] : [])]);

const CATEGORIAS = [];
const CATALOGO = [];
{
  let orden = 0;
  const sumar = (id, nombre, padre, hijas, cursos = []) => {
    const camino = `${padre ? CATEGORIAS.find((c) => c.id === padre).path : ''}/${id}`;
    CATEGORIAS.push({ id, name: nombre, description: '', descriptionformat: 1, parent: padre, sortorder: (orden += 10_000), coursecount: cursos.length, depth: camino.split('/').length - 1, path: camino });
    cursos.forEach(([cursoId, nombreCurso, como], i) => CATALOGO.push({ id: cursoId, nombre: nombreCurso, como, categoria: id, categoriaNombre: nombre, orden: orden + i + 1 }));
    for (const [hijaId, hijaNombre, cursosHija] of hijas) sumar(hijaId, hijaNombre, id, [], cursosHija);
  };
  for (const [id, nombre, hijas, cursos] of CARRERAS) sumar(id, nombre, 0, hijas, cursos);
}

const inscriptas = new Set();
const cursosDeLaCuenta = () => [...CURSOS, ...CATALOGO.filter((c) => inscriptas.has(c.id)).map((c) => curso(c.id, c.nombre))];

const publico = (c) => ({
  id: c.id,
  fullname: c.nombre,
  displayname: c.nombre,
  shortname: `${c.nombre.split(' ').map((p) => p[0]).join('')}-${c.id}`,
  categoryid: c.categoria,
  categoryname: c.categoriaNombre,
  sortorder: c.orden,
  summary: '',
  summaryformat: 1,
  overviewfiles: [],
  showactivitydates: true,
  showcompletionconditions: true,
  contacts: docentesDe(c.id).map((fullname, i) => ({ id: 900 + c.id * 10 + i, fullname })),
  enrollmentmethods: c.como === 'sin' ? ['manual'] : ['manual', 'self'],
  customfields: [],
});

// Like the campus search: every word anywhere in the summary, the names or the short name, capitals aside but accents
// as written, with «_» standing for any one letter.
const comoLike = (palabra) => new RegExp(palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '.').replace(/%/g, '.*'), 'u');
const buscarEnCatalogo = (consulta) => {
  const palabras = String(consulta ?? '').toLowerCase().split(/\s+/).filter(Boolean).map(comoLike);
  return CATALOGO.filter((c) => palabras.every((p) => p.test(`${c.nombre} ${publico(c).shortname}`.toLowerCase())));
};

const INSTANCIA = (cursoId) => cursoId * 10 + 1;
const estadoDe = (c) => {
  if (inscriptas.has(c.id) || CURSOS.some((m) => m.id === c.id)) return 'No podés matricularte en este curso.';
  if (c.como === 'llena') return 'Se alcanzó el número máximo de matriculaciones.';
  if (c.como === 'cerrada') return 'No se admiten nuevas matriculaciones.';
  return true;
};
const metodoDe = (c) => {
  const status = estadoDe(c);
  return { id: INSTANCIA(c.id), courseid: c.id, type: 'self', name: 'Automatriculación (Estudiante)', status, ...(status === true && c.como === 'clave' ? { wsfunction: 'enrol_self_get_instance_info' } : {}) };
};
const LENTAS = new Set(['core_course_get_categories', 'core_course_search_courses', 'core_course_get_courses_by_field', 'core_enrol_get_course_enrolment_methods', 'enrol_self_get_instance_info']);
// The pause of the campus, left out of the unit tests.
const PAUSA = import.meta.env.MODE === 'test' ? 0 : 450;
const enUnRato = (valor) => new Promise((resolver) => setTimeout(() => resolver(valor), PAUSA));

export const DEMO = {
  /** Handing in a task, pretend (demoTareas.js). */
  entrega: TAREAS_DEMO.entrega,

  /** Pretend enrolment, with the answer the campus gives: { status, warnings }. Nothing leaves the browser. */
  inscribir(cursoId, { instancia, clave = '' }) {
    const c = CATALOGO.find((x) => x.id === cursoId && INSTANCIA(x.id) === instancia);
    if (!c || c.como === 'sin') return enUnRato({ exception: 'moodle_exception', errorcode: 'canntenrol' });
    const status = estadoDe(c);
    if (status !== true) return enUnRato({ status: false, warnings: [{ item: 'instance', itemid: instancia, warningcode: '1', message: status }] });
    if (c.como === 'clave' && clave !== 'demo') {
      return enUnRato({ status: false, warnings: [{ item: 'instance', itemid: instancia, warningcode: '4', message: 'Clave de matriculación incorrecta.' }] });
    }
    inscriptas.add(c.id);
    return enUnRato({ status: true, warnings: [] });
  },

  responder(funcion, parametros = {}) {
    const respuestas = {
      core_webservice_get_site_info: () => ({ userid: 1, firstname: 'Ejemplo', lastname: 'Rodríguez', fullname: 'Ejemplo Rodríguez' }),
      core_enrol_get_users_courses: () => cursosDeLaCuenta(),
      core_course_get_enrolled_courses_by_timeline_classification: () => ({ courses: cursosDeLaCuenta().filter((c) => c.id !== 3) }),
      core_course_get_categories: () => CATEGORIAS,
      core_course_search_courses: () => {
        const halladas = buscarEnCatalogo(parametros.criteriavalue);
        const porPagina = Number(parametros.perpage) || halladas.length;
        const desde = (Number(parametros.page) || 0) * porPagina;
        return { total: halladas.length, courses: halladas.slice(desde, desde + porPagina).map(publico), warnings: [] };
      },
      core_course_get_courses_by_field: () => ({
        courses: CATALOGO.filter((c) => parametros.field === 'category' && c.categoria === Number(parametros.value)).map(publico),
        warnings: [],
      }),
      core_enrol_get_course_enrolment_methods: () => CATALOGO.filter((c) => c.id === Number(parametros.courseid) && c.como !== 'sin').map(metodoDe),
      enrol_self_get_instance_info: () => {
        const c = CATALOGO.find((x) => INSTANCIA(x.id) === Number(parametros.instanceid));
        const { wsfunction: _, ...metodo } = metodoDe(c);
        return { ...metodo, ...(c.como === 'clave' ? { enrolpassword: 'Clave de matriculación' } : {}) };
      },
      // The tasks open the sample ones (demoTareas.js), and leave the list once they are handed in.
      core_calendar_get_action_events_by_timesort: () => ({ events: [
        evento(1, 'Entrega de ejemplo que venció', CURSOS[0], -2, 'assign', 16),
        evento(2, 'Entrega de ejemplo próxima', CURSOS[0], 2, 'assign', 15),
        evento(3, 'Autoevaluación de ejemplo, unidad 1', CURSOS[0], 5, 'quiz', 13),
        evento(4, 'Entrega de ejemplo lejana', CURSOS[1], 20, 'assign', 26),
      ].filter((e) => e.modulename !== 'assign' || !TAREAS_DEMO.entregada(Number(new URL(e.action.url).searchParams.get('id')))) }),
      mod_assign_get_assignments: () => TAREAS_DEMO.tareas(parametros),
      mod_assign_get_submission_status: () => TAREAS_DEMO.estado(parametros),
      // The quizzes, read only (demoCuestionarios.js).
      ...Object.fromEntries(Object.entries(CUESTIONARIOS_DEMO.respuestas).map(([f, responder]) => [f, () => responder(parametros)])),
      core_calendar_get_calendar_monthly_view: () => ({ weeks: [{ days: [{ events: [
        { id: 11, name: 'Entrega de ejemplo próxima', eventtype: 'due', course: CURSOS[0], timesort: ahora() + 2 * DIA, url: 'https://frro.cvg.utn.edu.ar/' },
        { id: 12, name: 'Clase de ejemplo', eventtype: 'course', course: CURSOS[1], timesort: ahora() + 3600, url: 'https://frro.cvg.utn.edu.ar/' },
      ] }] }] }),
      core_course_get_contents: () => contenido(Number(parametros.courseid)),
      // The bell and Avisos in Hoy, with the noise of the campus mails (demoNotificaciones.js).
      message_popup_get_popup_notifications: DEMO_NOTIFICACIONES.lista,
      message_popup_get_unread_popup_notification_count: DEMO_NOTIFICACIONES.sinLeer,
    };
    // The catalog takes a moment, like the campus, so its loading shapes can be seen.
    return LENTAS.has(funcion) ? enUnRato(respuestas[funcion]()) : Promise.resolve(respuestas[funcion]());
  },
};
