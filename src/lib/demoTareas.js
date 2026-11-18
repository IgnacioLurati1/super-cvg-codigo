// Sample tasks for `/?demo=1` in `npm run dev`, with the shape of mod_assign_get_assignments and
// mod_assign_get_submission_status. One of each kind: to hand in with text and files, overdue, handed in, graded with a
// comment, and a draft that asks to accept the statement. Handing one in is pretend: it changes this list, in memory,
// and nothing leaves the browser. Only loaded in development (demo.js).
import { ErrorCampus } from './moodle';

const DIA = 86_400;
const ahora = () => Math.floor(Date.now() / 1000);
const BASE = ahora();
const PAUSA = import.meta.env.MODE === 'test' ? 0 : 350;
const enUnRato = (valor) => new Promise((resolver) => setTimeout(() => resolver(valor), PAUSA));
const CAMPUS = 'https://frro.cvg.utn.edu.ar';

const archivo = (nombre, donde, peso, dias = 3) => ({
  filename: nombre,
  filepath: '/',
  filesize: peso,
  fileurl: `${CAMPUS}/webservice/pluginfile.php/1/${donde}/${encodeURIComponent(nombre)}`,
  timemodified: BASE - dias * DIA,
  mimetype: nombre.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
});

const config = (plugin, name, value) => ({ plugin, subtype: 'assignsubmission', name, value: String(value) });
const conTexto = (palabras = 0) => [config('onlinetext', 'enabled', 1), config('onlinetext', 'wordlimitenabled', palabras ? 1 : 0), config('onlinetext', 'wordlimit', palabras)];
const conArchivos = (cuantos, megas, tipos) => [config('file', 'enabled', 1), config('file', 'maxfilesubmissions', cuantos), config('file', 'maxsubmissionsizebytes', megas * 1024 * 1024), config('file', 'filetypeslist', tipos)];

const tarea = (cmid, curso, nombre, { intro, adjuntos = [], vence, cierra = 0, borradores = false, declaracion = '', configs }) => ({
  id: 1000 + cmid,
  cmid,
  course: curso,
  name: nombre,
  nosubmissions: 0,
  submissiondrafts: borradores ? 1 : 0,
  duedate: BASE + vence * DIA,
  allowsubmissionsfromdate: BASE - 30 * DIA,
  cutoffdate: cierra ? BASE + cierra * DIA : 0,
  gradingduedate: 0,
  teamsubmission: 0,
  requiresubmissionstatement: declaracion ? 1 : 0,
  ...(declaracion ? { submissionstatement: declaracion, submissionstatementformat: 1 } : {}),
  timelimit: 0,
  configs,
  intro,
  introformat: 1,
  introfiles: [],
  introattachments: adjuntos,
});

const TAREAS = [
  tarea(15, 1, 'Entrega de ejemplo próxima', {
    intro: '<p>Resolvé los ejercicios de la <strong>guía 2 de ejemplo</strong> y subí el desarrollo.</p><h4>Qué tiene que tener</h4><ul><li>Los cinco ejercicios, con el paso a paso.</li><li>Una conclusión corta de cada uno.</li><li>Tu nombre y legajo en la primera hoja.</li></ul><p>Si tenés dudas, escribí en el <a href="https://frro.cvg.utn.edu.ar/mod/forum/view.php?id=1">foro de consultas</a>.</p>',
    adjuntos: [archivo('guia-2-ejemplo.pdf', 'mod_assign/introattachment/0', 420_000, 6)],
    vence: 2,
    borradores: true,
    configs: [...conTexto(300), ...conArchivos(3, 5, '.pdf .docx .zip')],
  }),
  tarea(16, 1, 'Entrega de ejemplo que venció', {
    intro: '<p>Subí el informe de laboratorio de ejemplo, en PDF o Word. Va con carátula.</p>',
    vence: -2,
    cierra: 1,
    configs: conArchivos(1, 10, 'document'),
  }),
  tarea(17, 1, 'TP 1 de ejemplo', {
    intro: '<p>Primer trabajo práctico de ejemplo. Respondé las preguntas de la unidad 1 y adjuntá los cálculos.</p>',
    vence: -10,
    cierra: -9,
    configs: [...conTexto(), ...conArchivos(2, 5, '')],
  }),
  tarea(25, 2, 'Resumen de ejemplo', {
    intro: '<p>Escribí un resumen de ejemplo de la unidad 1, de hasta 200 palabras.</p>',
    vence: 6,
    configs: conTexto(200),
  }),
  tarea(26, 2, 'Entrega de ejemplo lejana', {
    intro: '<p>Trabajo final de ejemplo. Subí un solo PDF con todo el desarrollo.</p>',
    vence: 20,
    borradores: true,
    declaracion: '<p>Esta entrega es mi propio trabajo, salvo donde reconocí el uso del trabajo de otras personas.</p>',
    configs: conArchivos(1, 20, '.pdf'),
  }),
];

const subidos = (id, lista) => lista.map((a) => archivo(a.nombre, `assignsubmission_file/submission_files/${id}`, a.peso, 0));
const plugins = (id, { texto, archivos }) => [
  ...(texto !== undefined ? [{ type: 'onlinetext', name: 'Texto en línea', editorfields: [{ name: 'onlinetext', description: 'Texto en línea', text: texto, format: 1 }], fileareas: [{ area: 'submissions_onlinetext', files: [] }] }] : []),
  ...(archivos !== undefined ? [{ type: 'file', name: 'Archivos enviados', fileareas: [{ area: 'submission_files', files: archivos }] }] : []),
];

// Where each task is, by its id: the submission and, for the graded one, the feedback.
const ESTADOS = new Map([
  [1015, { estado: 'new', texto: '', archivos: [], editar: true }],
  [1016, { estado: 'new', archivos: [], editar: true }],
  [1017, {
    estado: 'submitted',
    cuando: BASE - 11 * DIA,
    texto: '<p>Adjunto los cálculos de ejemplo. Las respuestas están en el PDF.</p>',
    archivos: [archivo('tp1-ejemplo.pdf', 'assignsubmission_file/submission_files/1017', 610_000, 11)],
    editar: false,
    devolucion: {
      gradefordisplay: '8,00&nbsp;/&nbsp;10,00',
      gradeddate: BASE - 5 * DIA,
      grade: { id: 1, userid: 1, attemptnumber: 0, timecreated: BASE - 5 * DIA, timemodified: BASE - 5 * DIA, grader: -1, grade: '8.00000' },
      plugins: [
        { type: 'comments', name: 'Comentarios de retroalimentación', editorfields: [{ name: 'comments', description: 'Comentarios', text: '<p>Muy bien el planteo. En el ejercicio 3 faltó justificar el último paso.</p><p>Revisá las unidades en el <strong>ejercicio 5</strong>.</p>', format: 1 }] },
        { type: 'file', name: 'Archivos de retroalimentación', fileareas: [{ area: 'feedback_files', files: [archivo('correcciones-tp1.pdf', 'assignfeedback_file/feedback_files/1', 230_000, 5)] }] },
      ],
    },
  }],
  [1025, { estado: 'submitted', cuando: BASE - DIA, texto: '<p>La unidad 1 de ejemplo presenta los conceptos básicos.</p><p>Primero define cada término y después lo aplica a un caso.</p>', editar: true }],
  [1026, { estado: 'draft', cuando: BASE - 2 * DIA, archivos: [archivo('borrador-trabajo-final.pdf', 'assignsubmission_file/submission_files/1026', 1_300_000, 2)], editar: true }],
]);

const tieneAlgo = (e) => Boolean((e.texto ?? '').replace(/<[^>]*>/g, '').trim() || e.archivos?.length);

function estadoDe(id) {
  const t = TAREAS.find((x) => x.id === id);
  const e = ESTADOS.get(id);
  if (!t || !e) return { warnings: [] };
  const conTextoActivo = t.configs.some((c) => c.plugin === 'onlinetext' && c.name === 'enabled');
  const conArchivosActivo = t.configs.some((c) => c.plugin === 'file' && c.name === 'enabled');
  return {
    lastattempt: {
      submission: {
        id: 5000 + id, userid: 1, attemptnumber: 0, timecreated: BASE - 20 * DIA, timemodified: e.cuando ?? BASE - 20 * DIA, status: e.estado, groupid: 0,
        plugins: plugins(5000 + id, { texto: conTextoActivo ? (e.texto ?? '') : undefined, archivos: conArchivosActivo ? (e.archivos ?? []) : undefined }),
      },
      submissionsenabled: true,
      locked: false,
      graded: Boolean(e.devolucion),
      canedit: e.editar,
      caneditowner: e.editar,
      cansubmit: Boolean(t.submissiondrafts && e.editar && e.estado === 'draft' && tieneAlgo(e)),
      extensionduedate: null,
      blindmarking: false,
      gradingstatus: e.devolucion ? 'graded' : 'notgraded',
      usergroups: [],
    },
    ...(e.devolucion ? { feedback: e.devolucion } : {}),
    assignmentdata: {},
    warnings: [],
  };
}

// The pretend drafts: their number and what went up to each.
const borradores = new Map();
let proximo = 7_000_000;

export const TAREAS_DEMO = {
  /** mod_assign_get_assignments for one course. */
  tareas(parametros) {
    const curso = Number(parametros['courseids[0]']);
    return { courses: [{ id: curso, fullname: '', shortname: '', timemodified: BASE, assignments: TAREAS.filter((t) => t.course === curso) }], warnings: [] };
  },
  estado: (parametros) => estadoDe(Number(parametros.assignid)),
  /** The assignments of a course as modules of its contents, in a section of their own. */
  seccion(curso) {
    const lista = TAREAS.filter((t) => t.course === curso);
    if (!lista.length) return [];
    return [{ id: curso * 100 + 3, name: 'Trabajos prácticos de ejemplo', uservisible: true, modules: lista.map((t) => ({
      id: t.cmid, instance: t.id, modname: 'assign', name: t.name, uservisible: true, modplural: 'Tareas', contents: [],
      url: `${CAMPUS}/mod/assign/view.php?id=${t.cmid}`,
      dates: [{ label: 'Vencimiento:', timestamp: t.duedate }],
    })) }];
  },
  /** Whether the task of a course module is handed in, so Hoy stops listing it. */
  entregada: (cmid) => ESTADOS.get(1000 + cmid)?.estado === 'submitted',

  // The writes of moodle.js, pretend: the same names, arguments and errors.
  entrega: {
    async subirArchivo(_token, blob, { nombre, borrador = 0 }) {
      const numero = borrador || (proximo += 1);
      const lista = borradores.get(numero) ?? [];
      if (lista.some((a) => a.nombre === nombre)) throw new ErrorCampus('Ya hay otro archivo con ese nombre.', 'archivo_repetido');
      borradores.set(numero, [...lista, { nombre, peso: blob.size }]);
      return enUnRato(numero);
    },
    async guardarEntrega(_token, tareaId, { texto, borrador }) {
      const t = TAREAS.find((x) => x.id === tareaId);
      const e = ESTADOS.get(tareaId);
      if (!t || !e?.editar) throw new ErrorCampus('El campus no te deja entregar esta tarea.', 'sin_permiso');
      if (t.cutoffdate && ahora() > t.cutoffdate) {
        const error = new ErrorCampus('El campus no guardó la entrega.', 'no_guardada');
        error.detalle = 'La fecha de entrega de esta tarea ya pasó.';
        throw error;
      }
      if (typeof texto === 'string') e.texto = texto;
      if (borrador) e.archivos = subidos(tareaId, borradores.get(borrador) ?? []);
      e.estado = t.submissiondrafts ? 'draft' : 'submitted';
      e.cuando = ahora();
      return enUnRato(true);
    },
    async enviarEntrega(_token, tareaId, { aceptar = false } = {}) {
      const t = TAREAS.find((x) => x.id === tareaId);
      const e = ESTADOS.get(tareaId);
      if (!t || !e || (t.requiresubmissionstatement && !aceptar)) throw new ErrorCampus('El campus no la envió para calificar. Quedó guardada como borrador.', 'no_enviada');
      e.estado = 'submitted';
      e.cuando = ahora();
      e.editar = false;
      return enUnRato(true);
    },
  },
};
