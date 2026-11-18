// A campus quiz (mod_quiz) as its screens show it: the rules, the student's attempts, the grade and the review of a
// finished attempt. Pure: no network here. Super CVG only reads: an attempt is started and continued on the campus.
// What the campus answers is read field by field and shown only as text or as blocks (bloquesCampus.js): nothing of its
// HTML reaches the page. The question HTML of a review is taken apart in an inert document (DOMParser), which runs no
// script and loads no picture.
import { fechaHora, textoPlano } from './datos';
import { archivosDe, bloquesDe } from './tareas';

const DIA = 86_400;
const numero = (n) => (Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : null);
const fechaO = (segundos) => numero(segundos);
const BIDI = /[‪-‮⁦-⁩]/g;
const limpio = (texto) => String(texto ?? '').replace(BIDI, '').replace(/\s+/g, ' ').trim();

// ---------- Numbers and words ----------

/** A number the campus may send as a number, in Spanish («0,50») or in English («0.50»). Null when it is not one. */
export function leerNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  const texto = String(valor ?? '').trim();
  if (!/^-?\d+(?:[.,]\d+)?$/.test(texto)) return null;
  return Number(texto.replace(',', '.'));
}

const FORMATOS = new Map();
/** A grade the way the campus writes it in Spanish, with the quiz's decimals and a comma: «7,50». */
export function nota(valor, decimales = 2) {
  const d = Math.min(5, Math.max(0, Math.trunc(Number(decimales) || 0)));
  if (!FORMATOS.has(d)) FORMATOS.set(d, new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false }));
  // -0 would read «-0,00».
  return FORMATOS.get(d).format(Number(valor) || 0);
}

/** «7,50 / 10,00». */
export const notaSobre = (valor, maximo, decimales) => `${nota(valor, decimales)} / ${nota(maximo, decimales)}`;

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** A length of time in words, the two largest parts: «45 minutos», «1 hora y 30 minutos», «2 días y 3 horas». */
export function duracion(segundos) {
  const total = Math.floor(Math.max(0, Number(segundos) || 0) / 60);
  if (total < 1) return 'Menos de un minuto';
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const minutos = total % 60;
  const partes = dias
    ? [[dias, 'día', 'días'], [horas, 'hora', 'horas']]
    : [[horas, 'hora', 'horas'], [minutos, 'minuto', 'minutos']];
  return partes.filter(([n]) => n > 0).map(([n, uno, varios]) => plural(n, uno, varios)).join(' y ');
}

const inicioDelDia = (segundos) => new Date(segundos * 1000).setHours(0, 0, 0, 0) / 1000;
const diasEntre = (desde, hasta) => Math.round((inicioDelDia(hasta) - inicioDelDia(desde)) / DIA);

/** How long until it closes, or since it closed: «Cierra mañana», «Cerró hace 3 días». */
export function cuandoCierra(cierra, ahora) {
  const dias = diasEntre(ahora, cierra);
  if (cierra <= ahora) {
    if (dias === 0) return 'Cerró hoy';
    if (dias === -1) return 'Cerró ayer';
    return `Cerró hace ${-dias} días`;
  }
  if (dias === 0) return 'Cierra hoy';
  if (dias === 1) return 'Cierra mañana';
  return `Cierra en ${dias} días`;
}

/** How long until it opens: «Abre hoy», «Abre en 4 días». */
export function cuandoAbre(abre, ahora) {
  const dias = diasEntre(ahora, abre);
  if (dias <= 0) return 'Abre hoy';
  if (dias === 1) return 'Abre mañana';
  return `Abre en ${dias} días`;
}

/** How many attempts it allows and how many the student made: «Hiciste 1 de 3», «Sin límite». */
export function intentosEnTexto(limite, hechos) {
  if (limite) {
    if (!hechos) return limite === 1 ? 'Uno solo' : `Tenés ${limite}`;
    return `Hiciste ${hechos} de ${limite}`;
  }
  return hechos ? `Hiciste ${hechos}, sin límite` : 'Sin límite';
}

// ---------- The quiz ----------

// How the campus grades a quiz of several attempts (QUIZ_GRADEHIGHEST, QUIZ_GRADEAVERAGE, QUIZ_ATTEMPTFIRST, QUIZ_ATTEMPTLAST).
const METODOS = { 1: 'mas-alta', 2: 'promedio', 3: 'primero', 4: 'ultimo' };
export const TEXTO_METODO = { 'mas-alta': 'La nota más alta', promedio: 'El promedio de tus intentos', primero: 'El primer intento', ultimo: 'El último intento' };

// When each part of a review shows (mod_quiz display_options): during the attempt, right after it (two minutes), later
// while the quiz is open, and after it closes. Each setting of the quiz is a sum of these.
export const MOMENTO = { durante: 0x10000, alTerminar: 0x01000, despues: 0x00100, alCerrar: 0x00010 };
const AL_TERMINAR = 120;
const OPCIONES = {
  intento: 'reviewattempt',
  correccion: 'reviewcorrectness',
  puntos: 'reviewmarks',
  especifica: 'reviewspecificfeedback',
  general: 'reviewgeneralfeedback',
  correcta: 'reviewrightanswer',
  global: 'reviewoverallfeedback',
};

/** The review settings of a quiz, as numbers by part, or null: the campus leaves them out once the quiz closed or
 * before it opens, and then only it can say. */
export function opcionesDeRevision(q) {
  if (q?.reviewattempt === undefined || q?.reviewattempt === null) return null;
  return Object.fromEntries(Object.entries(OPCIONES).map(([parte, campo]) => [parte, Number(q[campo]) || 0]));
}

const entero = (valor, minimo, maximo, siNo) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= minimo && n <= maximo ? n : siNo;
};

/** One quiz of `mod_quiz_get_quizzes_by_courses`, or null when it lacks what identifies it. `intentos` 0 is without a
 * limit; `null`, `tiempo` and `metodo` null when the campus did not say. */
export function leerCuestionario(q, materia = '') {
  const id = numero(q?.id);
  const cmid = numero(q?.coursemodule);
  if (!id || !cmid) return null;
  const materiaId = numero(q.course);
  const decimales = entero(q.decimalpoints, 0, 5, 2);
  return {
    id,
    cmid,
    materiaId,
    nombre: textoPlano(q.name) || 'Cuestionario',
    consigna: bloquesDe(q.intro),
    adjuntos: archivosDe(q.introfiles, { donde: `cuestionario-${id}`, materia, materiaId }),
    abre: fechaO(q.timeopen),
    cierra: fechaO(q.timeclose),
    tiempo: q.timelimit === undefined ? null : Math.max(0, Number(q.timelimit) || 0),
    intentos: q.attempts === undefined ? null : Math.max(0, Number(q.attempts) || 0),
    metodo: METODOS[Number(q.grademethod)] ?? null,
    // The grade it is out of, and the sum of the marks of its questions: an attempt's marks scale to the grade.
    nota: Math.max(0, Number(q.grade) || 0),
    puntos: Math.max(0, Number(q.sumgrades) || 0),
    decimales,
    // Each question's marks: -1 says the same as the quiz.
    decimalesPregunta: entero(q.questiondecimalpoints, 0, 5, decimales),
    conDevolucion: Number(q.hasfeedback) === 1,
    conPreguntas: q.hasquestions === undefined ? null : Number(q.hasquestions) === 1,
    revision: opcionesDeRevision(q),
  };
}

/** Every quiz in `mod_quiz_get_quizzes_by_courses`. */
export function leerCuestionarios(respuesta, materia = '') {
  return (Array.isArray(respuesta?.quizzes) ? respuesta.quizzes : []).map((q) => leerCuestionario(q, materia)).filter(Boolean);
}

// ---------- The attempts ----------

const ESTADOS_INTENTO = { inprogress: 'en-curso', overdue: 'vencido', finished: 'terminado', abandoned: 'abandonado' };
export const TEXTO_INTENTO = { 'en-curso': 'En curso', vencido: 'Falta enviarlo', terminado: 'Terminado', abandonado: 'No se envió' };

const puntosO = (valor) => (valor === null || valor === undefined || valor === '' ? null : leerNumero(valor));

/** One attempt of the student: its number, where it is, when it started and ended, and its marks (null when hidden). */
export function leerIntento(a) {
  const id = numero(a?.id);
  if (!id || Number(a.preview) === 1) return null;
  const termino = fechaO(a.timefinish);
  return {
    id,
    numero: numero(a.attempt) ?? 0,
    estado: ESTADOS_INTENTO[a.state] ?? (termino ? 'terminado' : 'en-curso'),
    empezo: fechaO(a.timestart),
    termino,
    puntos: puntosO(a.sumgrades),
  };
}

/** `mod_quiz_get_user_attempts`, in order. */
export function leerIntentos(respuesta) {
  return (Array.isArray(respuesta?.attempts) ? respuesta.attempts : []).map(leerIntento).filter(Boolean).sort((a, b) => a.numero - b.numero);
}

export const abierto = (intento) => intento.estado === 'en-curso' || intento.estado === 'vencido';
export const terminados = (intentos) => (intentos ?? []).filter((i) => i.estado === 'terminado');

const redondear = (n, decimales) => Math.round(n * 10 ** decimales) / 10 ** decimales;

/** An attempt's grade in the quiz scale («7,50 / 10,00» is 7.5), or null when its marks do not show. */
export function notaDeIntento(c, intento) {
  if (intento?.puntos === null || intento?.puntos === undefined || !c?.puntos || !c?.nota) return null;
  return redondear((intento.puntos / c.puntos) * c.nota, c.decimales);
}

/** The id of the attempt that counts for the grade, when there are several with marks and the method picks one. */
export function intentoQueVale(c, intentos) {
  const conNota = terminados(intentos).filter((i) => i.puntos !== null);
  if (conNota.length < 2) return null;
  if (c.metodo === 'primero') return conNota[0].id;
  if (c.metodo === 'ultimo') return conNota.at(-1).id;
  if (c.metodo === 'mas-alta') return conNota.reduce((mejor, i) => (i.puntos > mejor.puntos ? i : mejor)).id;
  return null;
}

/** `mod_quiz_get_user_best_grade`: the grade in the quiz scale (null when it does not show) and the one to pass. */
export function leerMejorNota(r) {
  const valor = r?.hasgrade ? leerNumero(r.grade) : null;
  const aprobar = leerNumero(r?.gradetopass);
  return { nota: valor, aprobar: aprobar && aprobar > 0 ? aprobar : null };
}

/** `mod_quiz_get_quiz_feedback_for_grade`: what the teacher wrote for that grade, as blocks. */
export const leerDevolucion = (r) => bloquesDe(r?.feedbacktext);

/** Where the student is with the quiz: 'sin-hacer', 'en-curso', 'hecho' or 'calificado'. */
export function estadoDe(intentos, mejor) {
  if ((intentos ?? []).some(abierto)) return 'en-curso';
  if (mejor?.nota !== null && mejor?.nota !== undefined) return 'calificado';
  return terminados(intentos).length ? 'hecho' : 'sin-hacer';
}

export const TEXTO_ESTADO = { 'sin-hacer': 'Sin hacer', 'en-curso': 'En curso', hecho: 'Hecho', calificado: 'Calificado' };

// ---------- What the campus lets see and do ----------

/** The moment of an attempt for its review, like quiz_attempt_state of Moodle. */
export function momentoDe(c, intento, ahora) {
  if (intento.estado === 'en-curso') return MOMENTO.durante;
  if (c.cierra && ahora >= c.cierra) return MOMENTO.alCerrar;
  if (intento.termino && ahora < intento.termino + AL_TERMINAR) return MOMENTO.alTerminar;
  return MOMENTO.despues;
}

/** Whether a part set by `bits` shows now for an attempt, and if not, when it will: { abierta, abre }. `abre` is null
 * when the settings do not open it again. */
export function cuandoSeVe(bits, c, intento, ahora) {
  const momento = momentoDe(c, intento, ahora);
  if (bits & momento) return { abierta: true, abre: null };
  if (momento === MOMENTO.alTerminar && bits & MOMENTO.despues) return { abierta: false, abre: intento.termino + AL_TERMINAR };
  if (momento !== MOMENTO.alCerrar && bits & MOMENTO.alCerrar && c.cierra) return { abierta: false, abre: c.cierra };
  return { abierta: false, abre: null };
}

/** Whether the review of an attempt opens now: { abierta, abre }, or null when only the campus can say. */
export function revisionDe(c, intento, acceso, ahora) {
  if (intento.estado !== 'terminado') return { abierta: false, abre: null };
  if (acceso && !acceso.puedeRevisar) return { abierta: false, abre: null };
  return c.revision ? cuandoSeVe(c.revision.intento, c, intento, ahora) : null;
}

/** Why a finished attempt shows no grade: 'corregir' (the marks show but a question waits for the teacher), 'despues'
 * (with `abre`), 'oculta' (the settings never show it) or 'no-se-sabe'. */
export function porQueNoSeVeLaNota(c, intento, ahora) {
  if (!c.revision) return { motivo: 'no-se-sabe', abre: null };
  const { abierta, abre } = cuandoSeVe(c.revision.puntos, c, intento, ahora);
  if (abierta) return { motivo: 'corregir', abre: null };
  return abre ? { motivo: 'despues', abre } : { motivo: 'oculta', abre: null };
}

const cuando = (segundos) => fechaHora(segundos).replace(/\.$/, '');

/** Why the review of a finished attempt is closed, in words. `abre` as revisionDe gives it. */
export function revisionCerradaEnTexto(abre, c) {
  if (abre && abre === c.cierra) return `La revisión abre cuando cierre el cuestionario, el ${cuando(abre)}.`;
  if (abre) return 'La revisión abre en un par de minutos.';
  return 'La revisión de este intento está cerrada.';
}

/** Why the grade does not show, in words: `corta` for the row of an attempt, and the sentence for the card. */
export function notaOcultaEnTexto({ motivo, abre }, c, { corta = false } = {}) {
  const alCerrarse = abre && abre === c.cierra;
  if (corta) return { corregir: 'Falta corregir', despues: alCerrarse ? 'Se ve cuando cierre' : 'En un par de minutos', oculta: 'No se muestra' }[motivo] ?? 'No se ve todavía';
  if (motivo === 'corregir') return 'Falta que la corrijan.';
  if (motivo === 'despues') return alCerrarse ? `La nota se ve cuando cierre, el ${cuando(abre)}.` : 'La nota se ve en un par de minutos.';
  if (motivo === 'oculta') return 'Este cuestionario no muestra la nota.';
  return 'La nota todavía no se ve.';
}

/** Whether the feedback for the grade shows: what the campus page does with all the attempts (alloptions). Null when the
 * settings did not come. */
export function seVeLaDevolucion(c, intentos, ahora) {
  if (!c.revision || !intentos?.length) return null;
  return intentos.every((i) => (c.revision.global & momentoDe(c, i, ahora)) !== 0);
}

/** `mod_quiz_get_combined_review_options`: what shows for every attempt (`todas`) and for some (`algunas`). */
export function leerOpcionesCombinadas(r) {
  const leer = (lista) => Object.fromEntries((Array.isArray(lista) ? lista : []).filter((o) => typeof o?.name === 'string').map((o) => [o.name, Number(o.value) || 0]));
  const todas = leer(r?.alloptions);
  const algunas = leer(r?.someoptions);
  // Marks: 0 hidden, 1 only what each question is worth, 2 the mark too.
  return {
    notas: (todas.marks ?? 0) >= 2,
    devolucion: Boolean(todas.overallfeedback),
    algunaNota: (algunas.marks ?? 0) >= 2,
    algunaCorrecta: Boolean(algunas.rightanswer),
  };
}

// The rules a quiz may add that its dates, attempts and time limit do not already say.
const REGLAS = {
  quizaccess_password: 'Pide una contraseña',
  quizaccess_seb: 'Se hace con Safe Exam Browser',
  quizaccess_ipaddress: 'Solo desde algunas redes',
  quizaccess_securewindow: 'Se abre en una ventana aparte',
  quizaccess_delaybetweenattempts: 'Hay que esperar entre un intento y otro',
};

/** `mod_quiz_get_quiz_access_information`: whether the student can attempt it and review it, what stops it now, and the
 * rules to know beforehand. */
export function leerAcceso(r) {
  const lista = (x) => (Array.isArray(x) ? x : []);
  return {
    puedeHacerlo: r?.canattempt !== false,
    puedeRevisar: r?.canreviewmyattempts !== false,
    trabas: lista(r?.preventaccessreasons).map((t) => textoPlano(t)).filter(Boolean),
    reglas: [...new Set(lista(r?.activerulenames).map((n) => REGLAS[n]).filter(Boolean))],
  };
}

/** What the campus would let do now: { accion: 'seguir' | 'hacer' } or { accion: null, motivo }. A guide for the link
 * to the campus, which is the one that decides: Super CVG never starts nor continues an attempt. */
export function queSePuede(c, intentos, acceso, ahora) {
  if ((intentos ?? []).some(abierto)) return { accion: 'seguir', motivo: null };
  if (c.abre && ahora < c.abre) return { accion: null, motivo: 'Todavía no abre.' };
  if (c.cierra && ahora >= c.cierra) return { accion: null, motivo: 'Ya cerró.' };
  const hechos = intentos?.length ?? 0;
  if (c.intentos && hechos >= c.intentos) return { accion: null, motivo: c.intentos === 1 ? 'Ya hiciste tu intento.' : `Ya hiciste tus ${c.intentos} intentos.` };
  if (c.conPreguntas === false) return { accion: null, motivo: 'Todavía no tiene preguntas.' };
  if (acceso && (!acceso.puedeHacerlo || acceso.trabas.length)) return { accion: null, motivo: 'El campus no deja hacerlo ahora.' };
  return { accion: 'hacer', motivo: null };
}

// ---------- The review of an attempt ----------

// Where each question is once graded (question_state of Moodle), when the review shows it.
const RESULTADOS = {
  gradedright: 'bien', mangrright: 'bien',
  gradedwrong: 'mal', mangrwrong: 'mal',
  gradedpartial: 'parcial', mangrpartial: 'parcial',
  gaveup: 'sin', mangaveup: 'sin',
  needsgrading: 'pendiente',
};
export const TEXTO_RESULTADO = { bien: 'Correcta', mal: 'Incorrecta', parcial: 'Parcialmente correcta', sin: 'Sin responder', pendiente: 'Falta corregir' };

const CLASES = [['partiallycorrect', 'parcial'], ['incorrect', 'mal'], ['correct', 'bien']];
const marcaDe = (el) => CLASES.find(([clase]) => el?.classList?.contains(clase))?.[1] ?? null;

// The kinds of question whose answer this knows how to read. The rest (drag and drop, ordering...) show the statement,
// the marks and the feedback, and point to the campus for the rest.
const CON_OPCIONES = new Set(['multichoice', 'truefalse', 'calculatedmulti']);
const DE_TEXTO = new Set(['shortanswer', 'numerical', 'calculated', 'calculatedsimple']);
const DE_PARES = new Set(['match', 'randomsamatch']);
const EN_EL_TEXTO = new Set(['gapselect', 'multianswer']);
const VISUAL = 'img, picture, svg, video, audio, iframe, object, embed, canvas';
const DE_TEXTO_LIBRE = 'input[type="text"], input:not([type])';

const textoDe = (el) => limpio(el?.textContent);
const fuera = (lista, dentro) => [...lista].filter((el) => !dentro?.contains(el));
const elegido = (select) => select?.querySelector('option[selected]') ?? null;

// The student's answers inside the statement (gaps and embedded answers) become text in bold: [París].
function respuestasEnElTexto(qtext, doc) {
  for (const el of [...qtext.querySelectorAll(`select, ${DE_TEXTO_LIBRE}, input[type="radio"], input[type="checkbox"]`)]) {
    let valor = null;
    if (el.tagName === 'SELECT') {
      const opcion = elegido(el);
      valor = opcion && opcion.getAttribute('value') !== '' ? textoDe(opcion) : '';
    } else if (el.type === 'radio' || el.type === 'checkbox') {
      valor = el.hasAttribute('checked') ? 'X' : null;
    } else valor = el.getAttribute('value') ?? '';
    if (valor === null) {
      el.remove();
      continue;
    }
    const marca = doc.createElement('strong');
    marca.textContent = `[${limpio(valor) || '…'}]`;
    el.replaceWith(marca);
  }
}

function opcionesDe(formulacion) {
  const filas = [...(formulacion.querySelector('.answer')?.children ?? [])]
    .filter((f) => f.querySelector('input[type="radio"], input[type="checkbox"]') && !f.querySelector('input[value="-1"]'));
  return filas.map((f) => {
    const control = f.querySelector('input[type="radio"], input[type="checkbox"]');
    const devolucion = f.querySelector('.specificfeedback, .feedback');
    const copia = f.cloneNode(true);
    copia.querySelectorAll('input, .specificfeedback, .feedback, .icon').forEach((el) => el.remove());
    return {
      texto: textoDe(copia),
      elegida: control.hasAttribute('checked'),
      varias: control.type === 'checkbox',
      marca: marcaDe(f),
      devolucion: devolucion ? bloquesDe(devolucion.innerHTML) : [],
      conImagen: Boolean(copia.querySelector(VISUAL)),
    };
  }).filter((o) => o.texto || o.conImagen);
}

function respuestaDe(tipo, formulacion, qtext) {
  if (CON_OPCIONES.has(tipo)) {
    const opciones = opcionesDe(formulacion);
    return opciones.length ? { tipo: 'opciones', opciones } : null;
  }
  if (DE_TEXTO.has(tipo)) {
    const campos = fuera(formulacion.querySelectorAll(DE_TEXTO_LIBRE), qtext);
    if (!campos.length) return null;
    // A unit picked from a list goes after the number.
    const unidad = fuera(formulacion.querySelectorAll('select'), qtext).map((s) => textoDe(elegido(s))).filter(Boolean);
    const texto = [...campos.map((c) => limpio(c.getAttribute('value'))), ...unidad].filter(Boolean).join(' ');
    return { tipo: 'texto', texto, marca: campos.map(marcaDe).find(Boolean) ?? null };
  }
  if (tipo === 'essay') {
    const escrita = formulacion.querySelector('.qtype_essay_response');
    const archivos = [...formulacion.querySelectorAll('.attachments a')].map(textoDe).filter(Boolean);
    if (!escrita && !archivos.length) return null;
    const bloques = escrita ? (escrita.tagName === 'TEXTAREA' ? bloquesDe(`<p>${escrita.innerHTML}</p>`) : bloquesDe(escrita.innerHTML)) : [];
    return { tipo: 'escrita', bloques, archivos };
  }
  if (DE_PARES.has(tipo)) {
    const pares = [...formulacion.querySelectorAll('table.answer tr')].filter((tr) => tr.querySelector('select')).map((tr) => {
      const opcion = elegido(tr.querySelector('select'));
      return {
        item: textoDe(tr.querySelector('td.text')),
        elegido: opcion && !['', '0'].includes(opcion.getAttribute('value')) ? textoDe(opcion) : '',
        marca: marcaDe(tr.querySelector('td.control')) ?? marcaDe(tr.querySelector('select')),
      };
    });
    return pares.length ? { tipo: 'pares', pares } : null;
  }
  return null;
}

// «La respuesta correcta es: Pila», «The correct answer is 'True'»: what is left is the answer.
const PREFIJO = /^(?:la respuesta correcta es|las respuestas correctas son|the correct answers? (?:is|are))\s*:?\s*/i;
const COMILLAS = /^['"«“](.*)['"»”]$/;
const sinPrefijo = (texto) => {
  const resto = limpio(texto).replace(PREFIJO, '');
  return resto.replace(COMILLAS, '$1');
};
// The campus's own feedback that only repeats whether it went right («Tu respuesta es correcta.»): the mark says it.
const REPITE = /^(?:tu respuesta es |respuesta )?(?:correcta|incorrecta|parcialmente correcta)\.?$|^your answer is (?:correct|incorrect|partially correct)\.?$/i;
const sinRepetir = (bloques) => (bloques.length === 1 && bloques[0].tipo === 'parrafo' && REPITE.test(limpio(bloques[0].lineas.flat().map((p) => p.texto).join(' '))) ? [] : bloques);
// A comment of the teacher comes after its own «Comentario:».
const sinRotulo = (el) => {
  const primero = el.firstChild;
  if (primero?.nodeType === 3) primero.nodeValue = primero.nodeValue.replace(/^\s*(?:comentario|comment)\s*:\s*/i, '');
  return el;
};

/** One question of `mod_quiz_get_attempt_review`, as the review shows it: its statement, the student's answer with its
 * marks, the right answer when the review shows it, and the feedback. Null when it lacks its slot. */
export function leerPregunta(p) {
  const slot = numero(p?.slot);
  if (!slot) return null;
  const tipo = String(p.type ?? '');
  const numeroTexto = limpio(p.questionnumber) || (numero(p.number) ? String(p.number) : '');
  const doc = new DOMParser().parseFromString(String(p.html ?? ''), 'text/html');
  doc.querySelectorAll('script, style, template, noscript, .accesshide, .sr-only, .visually-hidden, .questionflag, .history, .feedbackspan, .im-controls').forEach((el) => el.remove());
  const formulacion = doc.querySelector('.formulation') ?? doc.body;
  const qtext = formulacion.querySelector('.qtext');
  const conImagen = Boolean(qtext?.querySelector(VISUAL));
  if (qtext && EN_EL_TEXTO.has(tipo)) respuestasEnElTexto(qtext, doc);
  const respuesta = respuestaDe(tipo, formulacion, qtext);

  const resultado = doc.querySelector('.outcome') ?? doc.body;
  const suelto = (selector) => [...resultado.querySelectorAll(selector)].find((el) => !el.closest('.answer, .formulation'));
  const especifica = suelto('.specificfeedback');
  const general = suelto('.generalfeedback');
  const partes = suelto('.numpartscorrect');
  const correcta = suelto('.rightanswer');
  const comentario = [...doc.querySelectorAll('.comment')].find((el) => !el.closest('.formulation'));

  const informacion = tipo === 'description' || (!numeroTexto && !p.maxmark && !p.state);
  const maximo = leerNumero(p.maxmark);
  return {
    slot,
    numero: numeroTexto || String(slot),
    informacion,
    tipo,
    texto: qtext ? bloquesDe(qtext.innerHTML) : [],
    conImagen,
    respuesta,
    // What the campus shows only there: a kind this does not read, or no statement nor answer at all.
    enElCampus: !informacion && !respuesta && !EN_EL_TEXTO.has(tipo),
    resultado: RESULTADOS[p.state] ?? null,
    // The campus's word for where it is when the review hides whether it is right («Respuesta guardada»).
    estado: limpio(textoPlano(p.status)),
    puntos: maximo !== null ? leerNumero(p.mark) : null,
    maximo,
    correcta: correcta ? sinPrefijo(correcta.textContent) : '',
    devolucion: [
      ...(especifica ? sinRepetir(bloquesDe(especifica.innerHTML)) : []),
      ...(partes && textoDe(partes) ? [{ tipo: 'parrafo', lineas: [[{ tipo: 'texto', texto: textoDe(partes) }]] }] : []),
    ],
    general: general ? bloquesDe(general.innerHTML) : [],
    comentario: comentario ? bloquesDe(sinRotulo(comentario).innerHTML) : [],
  };
}

/** `mod_quiz_get_attempt_review`: the attempt, its grade in the quiz scale (null when hidden), the feedback for that
 * grade and the questions in order. */
export function leerRevision(r) {
  const extra = Array.isArray(r?.additionaldata) ? r.additionaldata : [];
  return {
    intento: r?.attempt ? leerIntento(r.attempt) : null,
    nota: r?.grade === null || r?.grade === undefined ? null : leerNumero(r.grade),
    devolucion: bloquesDe(extra.find((d) => d?.id === 'feedback')?.content),
    preguntas: (Array.isArray(r?.questions) ? r.questions : []).map(leerPregunta).filter(Boolean).sort((a, b) => a.slot - b.slot),
  };
}
