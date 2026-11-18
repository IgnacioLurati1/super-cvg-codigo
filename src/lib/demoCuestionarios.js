// Sample quizzes for `/?demo=1` in `npm run dev`, with the shape of mod_quiz in Moodle 4.4. Three of them: one open,
// with attempts left and one attempt done; one already closed, with its whole review; and one whose review and grade
// open only once it closes. Like the campus, each answer brings only what the quiz settings show at that moment, and the
// review settings come only while the quiz is open. Reading only: nothing here starts an attempt. Only loaded in
// development (demo.js).
import { ErrorCampus } from './moodle';
import { MOMENTO, momentoDe } from './cuestionarios';

const DIA = 86_400;
const MIN = 60;
const ahora = () => Math.floor(Date.now() / 1000);
const BASE = ahora();
const PAUSA = import.meta.env.MODE === 'test' ? 0 : 350;
const enUnRato = (valor) => new Promise((resolver) => setTimeout(() => resolver(valor), PAUSA));
const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const { alTerminar, despues, alCerrar } = MOMENTO;
const SIEMPRE = alTerminar | despues | alCerrar;

// The questions, with what the student answered. `fraccion` is how much of the question went right.
const PREGUNTAS = {
  // Autoevaluación de ejemplo, unidad 1.
  3013: [
    { tipo: 'multichoice', texto: '<p>¿Qué estructura de datos sigue el orden <strong>LIFO</strong>?</p>', opciones: ['Cola', 'Pila', 'Árbol binario', 'Grafo'], correctas: [1], elegidas: [1], general: '<p>En una pila, lo último que entra es lo primero que sale.</p>' },
    { tipo: 'truefalse', texto: '<p>Una cola común deja sacar elementos por los dos extremos.</p>', correcta: false, elegida: true, general: '<p>Eso es una cola doble. Una cola común saca solo por el frente.</p>' },
    { tipo: 'shortanswer', texto: '<p>¿De qué orden es la búsqueda binaria en el peor caso? Escribilo como O(...).</p>', correcta: 'O(log n)', respuesta: 'O(log n)', fraccion: 1 },
    { tipo: 'match', texto: '<p>Uní cada estructura con la forma en que saca sus elementos.</p>', pares: [['Pila', 'LIFO'], ['Cola', 'FIFO']], opciones: ['LIFO', 'FIFO', 'Por prioridad'], elegidas: ['LIFO', 'Por prioridad'] },
  ],
  // Parcial de ejemplo 1.
  3023: [
    { tipo: 'multichoice', texto: '<p>¿Qué hace el planificador de corto plazo?</p>', opciones: ['Elige qué proceso listo usa la CPU', 'Decide qué procesos entran a memoria', 'Atiende las interrupciones de entrada y salida'], correctas: [0], elegidas: [0], general: '<p>El de largo plazo decide qué entra a memoria. El de corto plazo reparte la CPU.</p>' },
    { tipo: 'multichoice', varias: true, texto: '<p>¿Cuáles son condiciones necesarias para un interbloqueo? Elegí todas las que correspondan.</p>', opciones: ['Exclusión mutua', 'Retención y espera', 'Apropiación', 'Espera circular'], correctas: [0, 1, 3], elegidas: [0, 1, 2], fraccion: 0.5, general: '<p>Son cuatro. Exclusión mutua, retención y espera, sin apropiación y espera circular.</p>' },
    { tipo: 'numerical', texto: '<p>Un proceso llega en t = 0 y tarda 8 ms. Otro llega en t = 2 y tarda 4 ms. Con FCFS, ¿cuántos ms espera el segundo?</p>', correcta: '6', respuesta: '6', fraccion: 1 },
    { tipo: 'truefalse', texto: '<p>La paginación produce fragmentación externa.</p>', correcta: false, elegida: false },
    { tipo: 'essay', maximo: 2, texto: '<p>Explicá con tus palabras qué es la memoria virtual y para qué sirve.</p>', respuesta: '<p>Es una técnica que deja usar más memoria de la que hay en RAM.</p><p>Las páginas que no se usan quedan en el disco y se traen cuando hacen falta.</p>', fraccion: 0.75, comentario: '<p>Bien la idea. Faltó nombrar el reemplazo de páginas.</p>' },
  ],
  // Parcialito de ejemplo 2.
  3027: [
    { tipo: 'multichoice', texto: '<p>¿Qué algoritmo de reemplazo saca la página que hace más tiempo no se usa?</p>', opciones: ['FIFO', 'LRU', 'Óptimo'], correctas: [1], elegidas: [1] },
    { tipo: 'truefalse', texto: '<p>La TLB guarda traducciones de páginas recientes.</p>', correcta: true, elegida: true },
    { tipo: 'shortanswer', texto: '<p>¿Cómo se llama la falta de una página en memoria?</p>', correcta: 'Fallo de página', respuesta: 'Page fault', fraccion: 1 },
  ],
};

const fraccionDe = (q) => {
  if (q.fraccion !== undefined) return q.fraccion;
  if (q.tipo === 'truefalse') return q.correcta === q.elegida ? 1 : 0;
  if (q.tipo === 'match') return q.pares.filter(([, bien], i) => q.elegidas[i] === bien).length / q.pares.length;
  return q.elegidas.every((e) => q.correctas.includes(e)) && q.elegidas.length === q.correctas.length ? 1 : 0;
};
const maximoDe = (q) => q.maximo ?? 1;
const puntosDe = (q) => fraccionDe(q) * maximoDe(q);
const sumaDe = (cuestionarioId) => PREGUNTAS[cuestionarioId].reduce((n, q) => n + puntosDe(q), 0);
const totalDe = (cuestionarioId) => PREGUNTAS[cuestionarioId].reduce((n, q) => n + maximoDe(q), 0);

const cuestionario = (id, cmid, curso, nombre, extra) => ({
  id, coursemodule: cmid, course: curso, name: nombre, introformat: 1, introfiles: [], grademethod: 1, decimalpoints: 2,
  questiondecimalpoints: -1, grade: 10, sumgrades: totalDe(id), preferredbehaviour: 'deferredfeedback', hasquestions: 1, ...extra,
});

const CUESTIONARIOS = [
  cuestionario(3013, 13, 1, 'Autoevaluación de ejemplo, unidad 1', {
    intro: '<p>Cuatro preguntas de repaso de la unidad 1 de ejemplo. Tenés tres intentos y vale el mejor.</p>',
    timeopen: BASE - 10 * DIA, timeclose: BASE + 5 * DIA, timelimit: 30 * MIN, attempts: 3,
    // The right answers only once it closes, so nobody passes them around.
    revision: { attempt: SIEMPRE, correctness: SIEMPRE, marks: SIEMPRE, specificfeedback: SIEMPRE, generalfeedback: SIEMPRE, rightanswer: alCerrar, overallfeedback: SIEMPRE },
    devolucion: '<p>Vas bien. Repasá colas antes del parcial.</p>',
    reglas: ['quizaccess_openclosedate', 'quizaccess_timelimit', 'quizaccess_numattempts'],
  }),
  cuestionario(3023, 23, 2, 'Parcial de ejemplo 1', {
    intro: '<p>Primer parcial de ejemplo. Una hora y media, un solo intento.</p><ul><li>Las preguntas de opción múltiple no restan.</li><li>La de desarrollo la corrige el docente.</li></ul>',
    timeopen: BASE - 20 * DIA, timeclose: BASE - 12 * DIA, timelimit: 90 * MIN, attempts: 1,
    revision: { attempt: alCerrar, correctness: alCerrar, marks: alCerrar, specificfeedback: alCerrar, generalfeedback: alCerrar, rightanswer: alCerrar, overallfeedback: alCerrar },
    devolucion: '<p>Muy bien. Para el final, repasá reemplazo de páginas.</p>',
    reglas: ['quizaccess_openclosedate', 'quizaccess_timelimit', 'quizaccess_numattempts', 'quizaccess_password'],
  }),
  cuestionario(3027, 27, 2, 'Parcialito de ejemplo 2', {
    intro: '<p>Parcialito de ejemplo de memoria. La nota y la revisión se ven cuando cierra.</p>',
    timeopen: BASE - 3 * DIA, timeclose: BASE + 3 * DIA, timelimit: 20 * MIN, attempts: 1,
    revision: { attempt: alCerrar, correctness: alCerrar, marks: alCerrar, specificfeedback: alCerrar, generalfeedback: alCerrar, rightanswer: alCerrar, overallfeedback: alCerrar },
    reglas: ['quizaccess_openclosedate', 'quizaccess_timelimit', 'quizaccess_numattempts'],
  }),
];

// The student's attempts, one per quiz.
const INTENTOS = [
  { id: 8013, quiz: 3013, attempt: 1, timestart: BASE - 2 * DIA, timefinish: BASE - 2 * DIA + 22 * MIN + 13 },
  { id: 8023, quiz: 3023, attempt: 1, timestart: BASE - 14 * DIA, timefinish: BASE - 14 * DIA + 72 * MIN + 40 },
  { id: 8027, quiz: 3027, attempt: 1, timestart: BASE - DIA, timefinish: BASE - DIA + 17 * MIN + 5 },
];

const abierto = (c, momento = ahora()) => (!c.timeopen || momento >= c.timeopen) && (!c.timeclose || momento < c.timeclose);
const comoLeido = (c) => ({ cierra: c.timeclose, revision: null });
const comoIntento = (a) => ({ estado: 'terminado', termino: a.timefinish });

/** What the quiz settings show for an attempt now (display_options::make_from_quiz). */
function opcionesAhora(c, a) {
  const momento = momentoDe(comoLeido(c), comoIntento(a), ahora());
  const ve = (bits) => (bits & momento) !== 0;
  const r = c.revision;
  return {
    intento: ve(r.attempt), correccion: ve(r.correctness), puntos: ve(r.marks), especifica: ve(r.specificfeedback),
    general: ve(r.generalfeedback), correcta: ve(r.rightanswer), global: ve(r.overallfeedback),
  };
}

const coma = (n) => n.toFixed(2).replace('.', ',');
const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CLASE = { bien: 'correct', mal: 'incorrect', parcial: 'partiallycorrect' };
const PALABRA = { bien: 'Correcta', mal: 'Incorrecta', parcial: 'Parcialmente correcta' };
const ICONO = {
  bien: '<i class="icon fa fa-check text-success fa-fw " title="Correcta" role="img" aria-label="Correcta"></i>',
  mal: '<i class="icon fa fa-remove text-danger fa-fw " title="Incorrecta" role="img" aria-label="Incorrecta"></i>',
  parcial: '<i class="icon fa fa-check-square fa-fw text-warning " title="Parcialmente correcta" role="img" aria-label="Parcialmente correcta"></i>',
};
const marcaPor = (fraccion) => (fraccion >= 0.999 ? 'bien' : fraccion <= 0.001 ? 'mal' : 'parcial');
const LETRAS = 'abcdefgh';

// The part of the question with the answer, as Moodle renders it in a review.
function respuestaHtml(q, nombre, ver) {
  const marcaDeElegida = (bien) => (ver.correccion ? (bien ? 'bien' : 'mal') : null);
  if (q.tipo === 'multichoice') {
    const tipo = q.varias ? 'checkbox' : 'radio';
    const filas = q.opciones.map((texto, i) => {
      const elegida = q.elegidas.includes(i);
      const marca = elegida ? marcaDeElegida(q.correctas.includes(i)) : null;
      return `<div class="r${i % 2}${marca ? ` ${CLASE[marca]}` : ''}"><input type="${tipo}" name="${nombre}_choice${i}" value="${i}" id="${nombre}_answer${i}" aria-labelledby="${nombre}_answer${i}_label" disabled="disabled"${elegida ? ' checked="checked"' : ''} /><div class="d-flex w-auto" id="${nombre}_answer${i}_label" data-region="answer-label"><span class="answernumber">${LETRAS[i]}. </span><div class="flex-fill ml-1">${escapar(texto)}</div></div> ${marca ? ICONO[marca] : ''}</div>`;
    }).join('\n');
    return `<div class="ablock no-overflow visual-scroll-x"><div class="prompt">${q.varias ? 'Seleccione una o más de una:' : 'Seleccione una:'}</div><div class="answer">${filas}</div></div>`;
  }
  if (q.tipo === 'truefalse') {
    const filas = [[true, 'Verdadero'], [false, 'Falso']].map(([valor, texto], i) => {
      const elegida = q.elegida === valor;
      const marca = elegida ? marcaDeElegida(valor === q.correcta) : null;
      return `<div class="r${i}${marca ? ` ${CLASE[marca]}` : ''}"><input type="radio" name="${nombre}_answer" value="${valor ? 1 : 0}" id="${nombre}_answer${valor ? 'true' : 'false'}" disabled="disabled"${elegida ? ' checked="checked"' : ''} /><label for="${nombre}_answer${valor ? 'true' : 'false'}" class="ml-1">${texto}</label> ${marca ? ICONO[marca] : ''}</div>`;
    }).join('');
    return `<div class="ablock"><div class="prompt">Seleccione una:</div><div class="answer">${filas}</div></div>`;
  }
  if (q.tipo === 'shortanswer' || q.tipo === 'numerical') {
    const marca = ver.correccion ? marcaPor(fraccionDe(q)) : null;
    return `<div class="ablock form-inline"><label for="${nombre}_answer">Respuesta:</label><span class="answer"><input type="text" name="${nombre}_answer" value="${escapar(q.respuesta)}" id="${nombre}_answer" size="30" class="form-control d-inline${marca ? ` ${CLASE[marca]}` : ''}" readonly="readonly" /> ${marca ? ICONO[marca] : ''}</span></div>`;
  }
  if (q.tipo === 'essay') {
    return `<div class="ablock"><div class="answer"><div class="qtype_essay_response readonly">${q.respuesta}</div></div><div class="attachments"></div></div>`;
  }
  // Match: each row with its list, and what was picked.
  const filas = q.pares.map(([item, bien], i) => {
    const marca = marcaDeElegida(q.elegidas[i] === bien);
    const opciones = q.opciones.map((o, j) => `<option value="${j + 1}"${o === q.elegidas[i] ? ' selected="selected"' : ''}>${escapar(o)}</option>`).join('');
    return `<tr class="r${i % 2}"><td class="text"><p>${escapar(item)}</p></td><td class="control${marca ? ` ${CLASE[marca]}` : ''}"><label class="accesshide" for="menu${nombre}_sub${i}">Respuesta ${i + 1}</label><select id="menu${nombre}_sub${i}" class="select custom-select${marca ? ` ${CLASE[marca]}` : ''}" name="${nombre}_sub${i}" disabled="disabled"><option value="0">Elegir...</option>${opciones}</select> ${marca ? ICONO[marca] : ''}</td></tr>`;
  }).join('');
  return `<div class="ablock no-overflow visual-scroll-x"><table class="answer"><tbody>${filas}</tbody></table></div>`;
}

const correctaEnTexto = (q) => {
  if (q.tipo === 'truefalse') return `La respuesta correcta es '${q.correcta ? 'Verdadero' : 'Falso'}'`;
  if (q.tipo === 'multichoice') return `${q.correctas.length > 1 ? 'Las respuestas correctas son' : 'La respuesta correcta es'}: ${q.correctas.map((i) => q.opciones[i]).join(', ')}`;
  if (q.tipo === 'match') return `La respuesta correcta es: ${q.pares.map(([item, bien]) => `${item} → ${bien}`).join(', ')}`;
  return `La respuesta correcta es: ${q.correcta}`;
};

/** A question of the review as mod_quiz_get_attempt_review gives it, with its HTML. */
function pregunta(q, slot, ver) {
  const nombre = `q9${slot}:${slot}`;
  const fraccion = fraccionDe(q);
  const marca = marcaPor(fraccion);
  const estado = q.tipo === 'essay' ? { bien: 'mangrright', mal: 'mangrwrong', parcial: 'mangrpartial' }[marca] : { bien: 'gradedright', mal: 'gradedwrong', parcial: 'gradedpartial' }[marca];
  const palabra = ver.correccion ? PALABRA[marca] : 'Finalizado';
  const especifica = ver.especifica && q.tipo !== 'essay' ? `<div class="specificfeedback">Tu respuesta es ${palabra.toLowerCase()}.</div>` : '';
  const general = ver.general && q.general ? `<div class="generalfeedback">${q.general}</div>` : '';
  const correcta = ver.correcta && q.tipo !== 'essay' ? `<div class="rightanswer">${escapar(correctaEnTexto(q))}</div>` : '';
  const devolucion = especifica + general + correcta;
  const html = [
    `<div id="question-9000-${slot}" class="que ${q.tipo} deferredfeedback ${ver.correccion ? CLASE[marca] : 'complete'}">`,
    `<div class="info"><h3 class="no">Pregunta <span class="qno">${slot}</span></h3><div class="state">${palabra}</div>`,
    `<div class="grade">${ver.puntos ? `Se puntúa ${coma(puntosDe(q))} sobre ${coma(maximoDe(q))}` : `Puntúa como ${coma(maximoDe(q))}`}</div>`,
    `<div class="questionflag"><input type="hidden" name="${nombre}_:flagged" value="0" /><img src="${CAMPUS}/theme/image.php/boost/core/1/i/unflagged" alt="" class="questionflagimage" /><span>Marcar pregunta</span></div></div>`,
    `<div class="content"><div class="formulation clearfix"><h4 class="accesshide">Enunciado de la pregunta</h4><input type="hidden" name="${nombre}_:sequencecheck" value="2" />`,
    `<div class="qtext">${q.texto}</div>${respuestaHtml(q, nombre, ver)}</div>`,
    devolucion ? `<div class="outcome clearfix"><h4 class="accesshide">Retroalimentación</h4><div class="feedback">${devolucion}</div></div>` : '',
    ver.especifica && q.comentario ? `<div class="comment clearfix"><h4 class="accesshide">Comentario</h4>Comentario: ${q.comentario}</div>` : '',
    '</div></div>',
  ].join('');
  return {
    slot, type: q.tipo, page: 0, questionnumber: String(slot), number: slot, html, responsefileareas: [], sequencecheck: 2,
    lastactiontime: BASE, hasautosavedstep: false, flagged: false, blockedbyprevious: false, settings: '{}',
    stateclass: ver.correccion ? CLASE[marca] : 'complete', status: palabra, maxmark: maximoDe(q),
    ...(ver.correccion ? { state: estado } : {}),
    ...(ver.puntos ? { mark: coma(puntosDe(q)) } : {}),
  };
}

const cuestionarioDe = (id) => CUESTIONARIOS.find((c) => c.id === Number(id));
const intentosDe = (id) => INTENTOS.filter((a) => a.quiz === Number(id));
const escala = (c, puntos) => Math.round((puntos / c.sumgrades) * c.grade * 100) / 100;

const delCampus = (c, a) => {
  const ver = opcionesAhora(c, a);
  return {
    id: a.id, quiz: c.id, userid: 1, attempt: a.attempt, uniqueid: a.id + 100, layout: '1,2,3,0', currentpage: 0, preview: 0,
    state: 'finished', timestart: a.timestart, timefinish: a.timefinish, timemodified: a.timefinish, timemodifiedoffline: 0,
    timecheckstate: null, sumgrades: ver.puntos ? sumaDe(c.id) : null, gradednotificationsenttime: a.timefinish,
  };
};

// Like the campus: an error answer of its web service becomes the same error moodle.js would throw.
const errorDelCampus = (codigo) => {
  const error = new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', codigo);
  error.campus = codigo;
  return Promise.reject(error);
};

export const CUESTIONARIOS_DEMO = {
  /** The quizzes of a course as modules of its contents, with the dates the campus puts on them. */
  modulos(curso) {
    return CUESTIONARIOS.filter((c) => c.course === curso).map((c) => ({
      id: c.coursemodule, instance: c.id, modname: 'quiz', name: c.name, uservisible: true, modplural: 'Cuestionarios', contents: [],
      url: `${CAMPUS}/mod/quiz/view.php?id=${c.coursemodule}`,
      dates: [
        { label: c.timeopen <= ahora() ? 'Abrió:' : 'Abre:', timestamp: c.timeopen },
        { label: c.timeclose <= ahora() ? 'Cerró:' : 'Cierra:', timestamp: c.timeclose },
      ],
    }));
  },

  /** The read functions of mod_quiz, answered like the campus. */
  respuestas: {
    mod_quiz_get_quizzes_by_courses(p) {
      const curso = Number(p['courseids[0]']);
      return enUnRato({
        quizzes: CUESTIONARIOS.filter((c) => c.course === curso).map(({ revision, devolucion, reglas: _, ...c }) => ({
          ...c,
          hasfeedback: devolucion ? 1 : 0,
          // The review settings only while it is open, as prevent_access() leaves them.
          ...(abierto(c) ? {
            reviewattempt: revision.attempt, reviewcorrectness: revision.correctness, reviewmarks: revision.marks,
            reviewspecificfeedback: revision.specificfeedback, reviewgeneralfeedback: revision.generalfeedback,
            reviewrightanswer: revision.rightanswer, reviewoverallfeedback: revision.overallfeedback, reviewmaxmarks: SIEMPRE,
            questionsperpage: 1, navmethod: 'free', browsersecurity: '-', delay1: 0, delay2: 0, showuserpicture: 0,
            showblocks: 0, completionattemptsexhausted: 0, completionpass: 0, overduehandling: 'autosubmit', graceperiod: 0,
            canredoquestions: 0, allowofflineattempts: 0, autosaveperiod: 60,
          } : {}),
        })),
        warnings: [],
      });
    },
    mod_quiz_get_user_attempts: (p) => {
      const c = cuestionarioDe(p.quizid);
      return enUnRato({ attempts: c ? intentosDe(c.id).map((a) => delCampus(c, a)) : [], warnings: [] });
    },
    mod_quiz_get_quiz_access_information: (p) => {
      const c = cuestionarioDe(p.quizid);
      const cerro = c.timeclose <= ahora();
      return enUnRato({
        canattempt: true, canmanage: false, canpreview: false, canreviewmyattempts: true, canviewreports: false,
        accessrules: [], activerulenames: c.reglas, preventaccessreasons: cerro ? ['Este cuestionario está cerrado.'] : [], warnings: [],
      });
    },
    mod_quiz_get_user_best_grade: (p) => {
      const c = cuestionarioDe(p.quizid);
      const visibles = intentosDe(c.id).map((a) => delCampus(c, a));
      const todas = visibles.length > 0 && visibles.every((a) => a.sumgrades !== null);
      return enUnRato(todas ? { hasgrade: true, grade: Math.max(...visibles.map((a) => escala(c, a.sumgrades))), warnings: [] } : { hasgrade: false, warnings: [] });
    },
    mod_quiz_get_combined_review_options: (p) => {
      const c = cuestionarioDe(p.quizid);
      const todas = intentosDe(c.id).map((a) => opcionesAhora(c, a));
      const opcion = (nombre, clave) => [{ name: nombre, value: todas.every((o) => o[clave]) ? 1 : 0 }, { name: nombre, value: todas.some((o) => o[clave]) ? 1 : 0 }];
      const pares = [['feedback', 'especifica'], ['generalfeedback', 'general'], ['rightanswer', 'correcta'], ['overallfeedback', 'global']].map(([n, k]) => opcion(n, k));
      const marks = [todas.every((o) => o.puntos) ? 2 : 1, todas.some((o) => o.puntos) ? 2 : 1];
      return enUnRato({
        someoptions: [...pares.map((x) => x[1]), { name: 'marks', value: marks[1] }],
        alloptions: [...pares.map((x) => x[0]), { name: 'marks', value: marks[0] }],
        warnings: [],
      });
    },
    mod_quiz_get_quiz_feedback_for_grade: (p) => {
      const c = cuestionarioDe(p.quizid);
      return enUnRato({ feedbacktext: c.devolucion ?? '', feedbacktextformat: 1, feedbackinlinefiles: [], warnings: [] });
    },
    mod_quiz_get_attempt_review: (p) => {
      const a = INTENTOS.find((x) => x.id === Number(p.attemptid));
      const c = a && cuestionarioDe(a.quiz);
      if (!c) return errorDelCampus('invalidrecord');
      const ver = opcionesAhora(c, a);
      if (!ver.intento) return errorDelCampus('noreview');
      const intento = delCampus(c, a);
      return enUnRato({
        grade: ver.puntos ? String(escala(c, intento.sumgrades)) : undefined,
        attempt: intento,
        additionaldata: [
          { id: 'startedon', title: 'Comenzado el', content: 'Ejemplo' },
          { id: 'state', title: 'Estado', content: 'Finalizado' },
          ...(ver.global && c.devolucion ? [{ id: 'feedback', title: 'Retroalimentación', content: c.devolucion }] : []),
        ],
        questions: PREGUNTAS[c.id].map((q, i) => pregunta(q, i + 1, ver)),
        warnings: [],
      });
    },
  },
};
