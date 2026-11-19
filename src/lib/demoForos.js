// Sample forums for the demo (/?demo=1), shaped like Moodle 4.4 gives them: the announcements and a forum of questions
// of each sample course, with what makes the campus forums hard to read (answers to answers, «Re: Re:», a mail answer
// that quotes the whole message, a picture inside a post, files). Everything reads as an example.
import { textoAHtml } from './moodle';

const HORA = 3600;
const DIA = 86_400;
const BASE = Math.floor(Date.now() / 1000);
const hace = (segundos) => BASE - segundos;
const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const archivo = (nombre, post, mime = 'application/pdf') => ({
  filename: nombre,
  filepath: '/',
  filesize: 320_000,
  mimetype: mime,
  url: `${CAMPUS}/webservice/pluginfile.php/1/mod_forum/attachment/${post}/${encodeURIComponent(nombre)}`,
});

const ANA = { id: 61, fullname: 'Ana Ejemplo (docente)' };
const LUIS = { id: 62, fullname: 'Luis Ejemplo (ayudante)' };
const YO = { id: 1, fullname: 'Ejemplo Rodríguez' };
const SOFI = { id: 63, fullname: 'Sofía Compañera' };
const TOMI = { id: 64, fullname: 'Tomás Compañero' };

// [course, forum id, cmid, name, type]
const FOROS = [
  [1, 701, 7011, 'Avisos', 'news'],
  [1, 702, 7012, 'Consultas de ejemplo', 'general'],
  [2, 703, 7021, 'Avisos', 'news'],
  [2, 704, 7022, 'Foro de ejemplo para el TP', 'general'],
  [3, 705, 7031, 'Avisos', 'news'],
];

const post = (id, discusion, padre, autor, cuando, asunto, mensaje, extra = {}) => ({
  id, discussionid: discusion, parentid: padre, author: autor, timecreated: cuando, subject: asunto, message: mensaje, attachments: [], isdeleted: false, isprivatereply: false, ...extra,
});

// discussion id -> its posts, oldest first.
const HILOS = {
  // Announcements of course A: one pinned, one with a file.
  801: [post(9001, 801, 0, ANA, hace(40 * DIA), 'Bienvenida y forma de cursado', '<p>Les damos la bienvenida a la materia de ejemplo.</p><p>Las clases son los <b>martes y jueves</b>. La guía de cursado está adjunta.</p>', { attachments: [archivo('guia-de-cursado-ejemplo.pdf', 9001)] })],
  802: [post(9002, 802, 0, ANA, hace(5 * HORA), 'Cambio de aula para el parcial', '<p>El parcial de ejemplo se toma en el <b>aula 305</b>, no en la de siempre.</p><ul><li>Lleven calculadora.</li><li>Llegar 10 minutos antes.</li></ul>')],
  803: [post(9003, 803, 0, LUIS, hace(9 * DIA), 'Notas del TP 1 de ejemplo', '<p>Ya están cargadas las notas del TP 1. Las devoluciones van por mail.</p>')],
  // Old ones, like the campus keeps from years back: out of Foros until asked for.
  804: [post(9004, 804, 0, LUIS, hace(3950 * DIA), 'Inscripción a la materia de ejemplo 2015', '<p>Recuerden inscribirse antes del viernes.</p>')],
  813: [
    post(9301 + 500, 813, 0, SOFI, hace(800 * DIA), 'Consulta vieja de ejemplo', '<p>¿Alguien tiene el apunte del año pasado?</p>'),
    post(9302 + 500, 813, 9801, TOMI, hace(799 * DIA), 'Re: Consulta vieja de ejemplo', '<p>Está en la fotocopiadora.</p>'),
  ],
  // Questions of course A: answers to answers, a mail answer that quotes everything, a picture in a post.
  811: [
    post(9101, 811, 0, SOFI, hace(3 * DIA), '¿Qué entra en el parcial de ejemplo?', '<p>Hola, ¿entra la unidad 3 o solo hasta la 2?</p>'),
    post(9102, 811, 9101, ANA, hace(3 * DIA - 2 * HORA), 'Re: ¿Qué entra en el parcial de ejemplo?', '<p>Entran las unidades 1 a 3, como dice el programa de ejemplo.</p>'),
    post(9103, 811, 9102, TOMI, hace(2 * DIA), 'Re: Re: ¿Qué entra en el parcial de ejemplo?', '<p>¿La parte de ejercicios combinados de la 3 también?</p><div class="gmail_quote"><p>El mar, Ana Ejemplo (docente) escribió:</p><blockquote><p>Entran las unidades 1 a 3, como dice el programa de ejemplo.</p></blockquote></div>'),
    post(9104, 811, 9103, ANA, hace(20 * HORA), 'Re: Re: Re: ¿Qué entra en el parcial de ejemplo?', '<p>Sí, también. Les dejo un ejercicio resuelto de ejemplo:</p><p><img src="' + CAMPUS + '/webservice/pluginfile.php/1/mod_forum/post/9104/ejercicio-resuelto.png" alt=""></p>'),
    post(9105, 811, 9101, YO, hace(3 * HORA), 'Re: ¿Qué entra en el parcial de ejemplo?', '<p>Gracias, ¿hay consulta antes del parcial?</p>'),
    post(9106, 811, 9105, LUIS, hace(1 * HORA), 'Re: Re: ¿Qué entra en el parcial de ejemplo?', '<p>Sí, el lunes a las 18 en el laboratorio de ejemplo.</p>'),
  ],
  812: [
    post(9201, 812, 0, TOMI, hace(12 * DIA), 'Error en el ejercicio 4 de la guía de ejemplo', '<p>En el ejercicio 4 el resultado da distinto al de la guía.</p>'),
    post(9202, 812, 9201, LUIS, hace(11 * DIA), 'Re: Error en el ejercicio 4 de la guía de ejemplo', '<p>Tenés razón, es una errata. El resultado correcto es 12.</p>'),
  ],
  // Course B.
  821: [post(9301, 821, 0, ANA, hace(2 * DIA), 'Consigna del TP de ejemplo', '<p>Ya está la consigna del TP de ejemplo. Se hace en grupos de hasta 4.</p>', { attachments: [archivo('consigna-tp-ejemplo.pdf', 9301)] })],
  831: [
    post(9401, 831, 0, SOFI, hace(6 * DIA), 'Busco grupo para el TP', '<p>Me falta grupo, ¿alguien tiene lugar?</p>'),
    post(9402, 831, 9401, TOMI, hace(5 * DIA), 'Re: Busco grupo para el TP', '<p>Nosotros somos 3, sumate. Lo que tenemos está en <a href="https://drive.google.com/drive/folders/1DemoCarpetaDelGrupo0">la carpeta del grupo</a>.</p>'),
  ],
  // The worst content: a link with no spaces as the title, a long name and an empty answer.
  832: [
    post(9601, 832, 0, { id: 65, fullname: 'María Florencia de los Ángeles Compañera Ejemplo Larguísima' }, hace(4 * DIA), 'Drive del grupo https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ejemplo', '<p>Ahí subí todo: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ejemplo</p>'),
    post(9602, 832, 9601, TOMI, hace(4 * DIA - HORA), 'Re: Drive del grupo', ''),
  ],
  // Course C: an old one.
  841: [post(9501, 841, 0, LUIS, hace(60 * DIA), 'Horarios de consulta de ejemplo', '<p>Las consultas son los viernes a las 17.</p>')],
};

// [discussion, forum, pinned]
const DISCUSIONES = [[801, 701, true], [802, 701, false], [803, 701, false], [804, 701, false], [813, 702, false], [811, 702, false], [812, 702, false], [821, 703, false], [831, 704, false], [832, 704, false], [841, 705, false]];

const deCurso = (id) => FOROS.filter((f) => f[0] === id);

function discusion([id, foro, fijada]) {
  const posts = HILOS[id];
  const primero = posts[0];
  const ultimo = posts.at(-1);
  return {
    id: primero.id,
    discussion: id,
    name: primero.subject,
    subject: primero.subject,
    message: primero.message,
    userfullname: primero.author.fullname,
    usermodifiedfullname: ultimo.author.fullname,
    created: primero.timecreated,
    timemodified: ultimo.timecreated,
    modified: ultimo.timecreated,
    numreplies: posts.length - 1,
    pinned: fijada,
    locked: false,
    attachment: primero.attachments.length ? '1' : '',
    forum: foro,
  };
}

export const FOROS_DEMO = {
  /** The forum modules of a sample course, for its contents. */
  modulos: (curso) => deCurso(curso).map(([, , cmid, nombre]) => ({
    id: cmid, modname: 'forum', name: nombre, uservisible: true, url: `${CAMPUS}/mod/forum/view.php?id=${cmid}`, modplural: 'Foros', contents: [],
  })),
  respuestas: {
    mod_forum_get_forums_by_courses: (p) => {
      const cursos = new Set(Object.entries(p).filter(([k]) => k.startsWith('courseids[')).map(([, v]) => Number(v)));
      return FOROS.filter((f) => cursos.has(f[0])).map(([course, id, cmid, name, type]) => ({
        id, course, cmid, name, type, intro: '', numdiscussions: DISCUSIONES.filter((d) => d[1] === id).length,
      }));
    },
    mod_forum_get_forum_discussions: (p) => ({ discussions: DISCUSIONES.filter((d) => d[1] === Number(p.forumid)).map(discusion), warnings: [] }),
    mod_forum_get_discussion_posts: (p) => {
      const id = Number(p.discussionid);
      const d = DISCUSIONES.find((x) => x[0] === id);
      if (!d) return { posts: [], warnings: [] };
      const curso = FOROS.find((f) => f[1] === d[1])[0];
      // In the announcements only the teachers answer, like on the campus.
      const avisos = FOROS.find((f) => f[1] === d[1])[4] === 'news';
      return { posts: HILOS[id].map((x) => ({ ...x, capabilities: { reply: !avisos } })), forumid: d[1], courseid: curso, warnings: [] };
    },
  },
  /** An answer of the student: it stays in the discussion until the page reloads. */
  publicar(postId, asunto, texto, yo) {
    const id = Number(Object.keys(HILOS).find((d) => HILOS[d].some((x) => x.id === postId)));
    if (!id) return { exception: 'moodle_exception', errorcode: 'invalidpostid' };
    const nuevo = Math.max(...Object.values(HILOS).flat().map((x) => x.id)) + 1;
    const parrafos = textoAHtml(texto);
    HILOS[id].push(post(nuevo, id, postId, { ...YO, id: yo ?? YO.id }, Math.floor(Date.now() / 1000), asunto, parrafos));
    return { postid: nuevo, warnings: [] };
  },
};
