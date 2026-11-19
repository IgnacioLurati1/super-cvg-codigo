// What each screen asks for. Every read is cached per tab, so moving around does not
// repeat work on the campus server, and the index asks for at most two courses at a time.
import { aplanarContenido, eventosDelMes, normalizarAviso, normalizarEvento, textoPlano } from './datos';
import { armarAreas, cursoDelCatalogo, estaAbierta, inscripcionPropia, patronDeBusqueda } from './inscripcion';
import { esDemo } from './modoDemo';
import { bajarArchivo, enviarEntrega, ErrorCampus, guardarEntrega, inscribirse, leerInscripcion, llamar, subirArchivo } from './moodle';
import { leerMandado, leerPublicado, leerRespuesta, mandarMensaje, marcarLeida, responderEnConversacion, responderEnForo } from './moodle';
import { conversaciones, mensaje, mismoTexto, personasHalladas, tandaDeMensajes } from './mensajes';
import { fijarCursos } from './colores';
import { fijarUsuario } from './mio';
import { cerrarSesion, conCache, enCache, olvidar, tokenActual } from './sesion';
import { limpiarNotificacion, limpiarNotificaciones } from './notificaciones';
import { aHtml, leerEstado, leerTareas } from './tareas';
import { leerAcceso, leerCuestionarios, leerDevolucion, leerIntentos, leerMejorNota, leerOpcionesCombinadas, leerRevision, revisionDe, seVeLaDevolucion, terminados } from './cuestionarios';

// The campus says «accessexception» both to a dead key and to a function its app access leaves closed. The functions of
// Inscripción are newer to Super CVG and the campus may not open them: before closing the session over one of them,
// a look at the session tells the two apart.
const DE_INSCRIPCION = new Set([
  'core_course_get_categories', 'core_course_search_courses', 'core_course_get_courses_by_field',
  'core_enrol_get_course_enrolment_methods', 'enrol_self_get_instance_info', 'enrol_self_enrol_user',
]);
// The same with the tasks (Tareas): their reads and the three steps of handing one in.
const DE_TAREAS = new Set([
  'mod_assign_get_assignments', 'mod_assign_get_submission_status', 'webservice/upload.php', 'mod_assign_save_submission',
  'mod_assign_submit_for_grading',
]);
// The same with the quizzes (Cuestionarios), all reads.
const DE_CUESTIONARIOS = new Set([
  'mod_quiz_get_quizzes_by_courses', 'mod_quiz_get_user_attempts', 'mod_quiz_get_user_best_grade', 'mod_quiz_get_quiz_feedback_for_grade',
  'mod_quiz_get_quiz_access_information', 'mod_quiz_get_combined_review_options', 'mod_quiz_get_attempt_review',
]);
// And with Mensajes, whose count is asked on every screen: a campus that leaves it closed must not end the session.
const DE_MENSAJES = new Set([
  'core_message_get_unread_conversations_count', 'core_message_get_conversations', 'core_message_get_conversation_messages',
  'core_message_message_search_users', 'core_message_send_messages_to_conversation', 'core_message_send_instant_messages',
  'core_message_mark_all_conversation_messages_as_read',
]);
// And with the bell of the notifications (campana.js), asked on every screen too: without them the bell goes away.
const DE_NOTIFICACIONES = new Set(['message_popup_get_popup_notifications', 'message_popup_get_unread_popup_notification_count']);
// And with the forums (Foros), all reads.
const DE_FOROS = new Set(['mod_forum_get_forums_by_courses', 'mod_forum_get_forum_discussions', 'mod_forum_get_discussion_posts', 'mod_forum_add_discussion_post']);
const sigueViva = (token) => llamar(token, 'core_webservice_get_site_info').then(() => true, () => false);
const cerradaEnElCampus = async (error, funcion, token) =>
  error.campus === 'accessexception' && (DE_INSCRIPCION.has(funcion) || DE_TAREAS.has(funcion) || DE_MENSAJES.has(funcion) || DE_NOTIFICACIONES.has(funcion) || DE_CUESTIONARIOS.has(funcion) || DE_FOROS.has(funcion)) && (await sigueViva(token));

const pedir = async (funcion, parametros) => {
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  if (import.meta.env.DEV && esDemo(token)) {
    const { DEMO } = await import('./demo');
    return DEMO.responder(funcion, parametros);
  }
  try {
    return await llamar(token, funcion, parametros);
  } catch (error) {
    if (await cerradaEnElCampus(error, funcion, token)) throw new ErrorCampus('El campus no deja hacer esto desde Super CVG. Probá desde su página.', 'sin_permiso');
    // An answer about an old key must not close a session that started later.
    if (error.codigo === 'sesion' && tokenActual() === token) cerrarSesion();
    throw error;
  }
};

// `corto`: its short name, which forums put before the subject of their notifications.
const materia = (c) => ({ id: c.id, nombre: textoPlano(c.fullnamedisplay || c.displayname || c.fullname), corto: textoPlano(c.shortname), oculta: Boolean(c.hidden) });

export async function cargarPerfil() {
  const perfil = await conCache('perfil', 60, async () => {
    const info = await pedir('core_webservice_get_site_info');
    // The functions the campus opens to this access, when it lists them: the quizzes do not ask for one it leaves out.
    const funciones = Array.isArray(info.functions) && info.functions.length ? new Set(info.functions.map((f) => f?.name)) : null;
    // `completo`: the whole name, to tell whose the copies of Sysacad are (sysacadPestanas.js).
    const completo = textoPlano(info.fullname) || [info.firstname, info.lastname].map(textoPlano).filter(Boolean).join(' ');
    return { id: info.userid, nombre: textoPlano(info.firstname), completo, funciones };
  });
  fijarUsuario(perfil.id);
  return perfil;
}

/** { materiaId: name }, for what the student added on top of the campus. */
export async function cargarNombres() {
  const { enCurso, otras } = await cargarMaterias();
  return Object.fromEntries([...enCurso, ...otras].map((m) => [m.id, m.nombre]));
}

/** The list of subjects if a screen already brought it, to show a name before anything else arrives. */
export const materiasYaCargadas = () => enCache('materias');

export const cargarMaterias = () =>
  conCache('materias', 30, async () => {
    const { id } = await cargarPerfil();
    const [enCurso, todas] = await Promise.all([
      pedir('core_course_get_enrolled_courses_by_timeline_classification', { classification: 'inprogress', limit: 0 }),
      pedir('core_enrol_get_users_courses', { userid: id }),
    ]);
    const actuales = new Set((enCurso.courses ?? []).map((c) => c.id));
    const lista = todas.map(materia).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    // Each course in progress with a color of its own, the same in every screen.
    fijarCursos(lista.filter((m) => actuales.has(m.id)).map((m) => m.id));
    return {
      enCurso: lista.filter((m) => actuales.has(m.id)),
      otras: lista.filter((m) => !actuales.has(m.id)),
    };
  });

export const cargarPendientes = () =>
  conCache('pendientes', 5, async () => {
    const desde = Math.floor(Date.now() / 1000) - 30 * 86_400;
    const respuesta = await pedir('core_calendar_get_action_events_by_timesort', { timesortfrom: desde, limitnum: 50 });
    return (respuesta.events ?? []).map(normalizarEvento);
  });

// The latest notifications as the campus sends them: one request for Avisos in Hoy and for the bell (campana.js).
const NOTIFICACIONES = 20;
const leerNotificaciones = () =>
  conCache('notificaciones', 5, async () => {
    const { id } = await cargarPerfil();
    const respuesta = await pedir('message_popup_get_popup_notifications', { useridto: id, newestfirst: 1, limit: NOTIFICACIONES, offset: 0 });
    return Array.isArray(respuesta?.notifications) ? respuesta.notifications : [];
  });

// Avisos in Hoy, with the title cleaned as in the bell.
export const cargarAvisos = () =>
  conCache('avisos', 5, async () => {
    const [crudas, { enCurso, otras }] = await Promise.all([leerNotificaciones(), cargarMaterias()]);
    return crudas.slice(0, 10).map((n, i) => {
      const { titulo, tipo } = limpiarNotificacion(n, [...enCurso, ...otras], i);
      // The kind, so Hoy shows only the ones the student chose (avisos.js).
      return { ...normalizarAviso(n), titulo, tipo };
    });
  });

/** How many notifications are unread in the campus. Never cached: the bell asks it again on purpose (useSinLeer.js). */
export async function contarNotificaciones() {
  const { id } = await cargarPerfil();
  const n = Number(await pedir('message_popup_get_unread_popup_notification_count', { useridto: id }));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

/** The latest notifications for the bell, cleaned (notificaciones.js). `fresco`: asked again, when the count changed. */
export async function cargarNotificaciones({ fresco = false } = {}) {
  if (fresco) olvidar(['notificaciones', 'avisos']);
  const [crudas, { enCurso, otras }] = await Promise.all([leerNotificaciones(), cargarMaterias()]);
  return limpiarNotificaciones(crudas, [...enCurso, ...otras]);
}

export const cargarContenido = (m) =>
  conCache(`contenido.${m.id}`, 30, async () => aplanarContenido(await pedir('core_course_get_contents', { courseid: m.id }), m));

export async function cargarIndice(materias) {
  const pendientes = [...materias];
  const resultados = [];
  const token = tokenActual();
  const trabajador = async () => {
    while (pendientes.length && tokenActual() === token) resultados.push(...(await cargarContenido(pendientes.shift())));
  };
  await Promise.all([trabajador(), trabajador()]);
  return resultados;
}

export const cargarMes = (anio, mes) =>
  conCache(`mes.${anio}-${mes}`, 15, async () => eventosDelMes(await pedir('core_calendar_get_calendar_monthly_view', { year: anio, month: mes })));

// Enrolling in a course (Inscripción). The catalog is read like everything else, once per visit and only in memory.

/** The campus categories as departments and other areas (inscripcion.js). */
export const cargarAreas = () => conCache('inscripcion.areas', 60, async () => armarAreas(await pedir('core_course_get_categories')));

/** How many courses each search page asks for. */
export const POR_PAGINA = 50;

/** A page of the campus search for what was typed: { cursos, fin }. */
export const buscarCursos = (consulta, pagina) =>
  conCache(`inscripcion.buscar.${pagina}.${consulta}`, 10, async () => {
    const buscar = async (valor) => pedir('core_course_search_courses', { criterianame: 'search', criteriavalue: valor, page: pagina, perpage: POR_PAGINA });
    const patron = patronDeBusqueda(consulta);
    let respuesta = await buscar(patron);
    // Should the campus ever stop taking the wildcard of patronDeBusqueda, the words as typed still find something.
    if (pagina === 0 && !respuesta?.total && patron !== consulta) respuesta = await buscar(consulta);
    const cursos = (respuesta?.courses ?? []).map(cursoDelCatalogo).filter(Boolean);
    return { cursos, fin: !cursos.length || (pagina + 1) * POR_PAGINA >= (Number(respuesta?.total) || 0) };
  });

/** The courses of one category, the ones right in it, in the campus order. */
export const cursosDeCategoria = (categoriaId) =>
  conCache(`inscripcion.categoria.${categoriaId}`, 30, async () => {
    const respuesta = await pedir('core_course_get_courses_by_field', { field: 'category', value: categoriaId });
    return (respuesta?.courses ?? [])
      .map(cursoDelCatalogo)
      .filter(Boolean)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
  });

const yaEsMia = async (cursoId) => {
  const { enCurso, otras } = await cargarMaterias();
  return [...enCurso, ...otras].some((m) => m.id === cursoId);
};

/** Whether the student can enrol in a course now, and how. Read only, asked fresh each time the student goes for it:
 * { estado: 'sin' | 'cerrada' | 'ya' } or { estado: 'abierta', instancia, conClave }. */
export async function revisarInscripcion(cursoId) {
  const propia = inscripcionPropia(await pedir('core_enrol_get_course_enrolment_methods', { courseid: cursoId }));
  if (propia.estado === 'abierta') {
    const info = await pedir('enrol_self_get_instance_info', { instanceid: propia.instancia });
    if (estaAbierta(info?.status)) return { ...propia, conClave: Boolean(info?.enrolpassword) };
  }
  if (propia.estado === 'sin') return propia;
  // The campus also says «closed» to someone already in the course.
  return (await yaEsMia(cursoId)) ? { estado: 'ya' } : { estado: 'cerrada' };
}

/** Enrols the student in a course: the one write to the campus (moodle.js), after the screen asked. In the sample mode
 * it is pretend and nothing leaves the browser. Comes back with { ya: true } when the student turned out to be in it
 * already. Afterwards the new course shows in Materias, Hoy, Calendario and Notas. */
export async function inscribirmeEn(cursoId, { instancia, clave = '' }) {
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  try {
    if (import.meta.env.DEV && esDemo(token)) {
      const { DEMO } = await import('./demo');
      leerInscripcion(await DEMO.inscribir(cursoId, { instancia, clave }));
    } else {
      await inscribirse(token, cursoId, { instancia, clave });
    }
  } catch (error) {
    if (await cerradaEnElCampus(error, 'enrol_self_enrol_user', token)) {
      throw new ErrorCampus('El campus no deja inscribirse desde Super CVG. Hacelo desde su página.', 'sin_permiso');
    }
    if (error.codigo === 'sesion' && tokenActual() === token) cerrarSesion();
    // A cut connection may have enrolled all the same, and «closed» is also what the campus says to someone already
    // in: the student's courses are asked again.
    olvidar(['materias']);
    if (error.codigo === 'inscripcion_cerrada' && (await yaEsMia(cursoId).catch(() => false))) return { ya: true };
    throw error;
  }
  olvidar(['materias', 'pendientes', 'notas', 'mes.']);
  return { ya: false };
}

// Private messages (Mensajes). Read like the rest, only in memory; the count, on arrival and every two minutes while
// the tab is visible (useSinLeer.js). Answering and writing to someone go through the writes of moodle.js after the
// screen asked, and a conversation is marked as read when it is opened, like the campus does. In the sample mode it is
// all pretend (demoMensajes.js) and nothing leaves the browser.

/** How many conversations and messages each batch brings. */
export const CONVERSACIONES_POR_TANDA = 20;
export const MENSAJES_POR_TANDA = 30;

const apagados = (error) => (error?.campus === 'disabled' ? new ErrorCampus('Los mensajes están apagados en el campus.', 'sin_mensajes') : error);

const pedirMensajes = async (funcion, parametros) => {
  if (import.meta.env.DEV && esDemo(tokenActual())) {
    const { DEMO_MENSAJES } = await import('./demoMensajes');
    return DEMO_MENSAJES.leer(funcion, parametros);
  }
  return pedir(funcion, parametros).catch((error) => {
    throw apagados(error);
  });
};

/** How many conversations have unread messages. Never cached: it is asked again on purpose. */
export async function contarSinLeer() {
  const { id } = await cargarPerfil();
  const n = Number(await pedirMensajes('core_message_get_unread_conversations_count', { useridto: id }));
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

const leerConversaciones = async (desde) => {
  const { id } = await cargarPerfil();
  // One more than shown tells whether there are more, like the campus app does.
  const r = await pedirMensajes('core_message_get_conversations', { userid: id, limitfrom: desde, limitnum: CONVERSACIONES_POR_TANDA + 1 });
  const todas = Array.isArray(r?.conversations) ? r.conversations : [];
  return { conversaciones: conversaciones(todas.slice(0, CONVERSACIONES_POR_TANDA), id), mas: todas.length > CONVERSACIONES_POR_TANDA, yo: id };
};

/** A batch of the student's conversations, the latest first: { conversaciones, mas, yo }. `desde`: how many come before.
 * `fresco`: asked again, when the student wants to see what came in. */
export const cargarConversaciones = (desde = 0, { fresco = false } = {}) => {
  if (fresco) olvidar(['mensajes.lista.']);
  return conCache(`mensajes.lista.${desde}`, 5, () => leerConversaciones(desde));
};

const leerMensajes = async (conversacionId, desde, cuantos) => {
  const { id } = await cargarPerfil();
  return tandaDeMensajes(await pedirMensajes('core_message_get_conversation_messages', { currentuserid: id, convid: conversacionId, limitfrom: desde, limitnum: cuantos, newest: 1 }));
};

/** A batch of a conversation, from the newest back: { mensajes (oldest first), miembros, mas }. `desde`: how many of the
 * newest are already shown. */
export const cargarMensajes = (conversacionId, desde = 0, { fresco = false } = {}) => {
  if (fresco) olvidar([`mensajes.charla.${conversacionId}.`]);
  return conCache(`mensajes.charla.${conversacionId}.${desde}`, 5, async () => {
    const tanda = await leerMensajes(conversacionId, desde, MENSAJES_POR_TANDA + 1);
    const mas = tanda.mensajes.length > MENSAJES_POR_TANDA;
    return { ...tanda, mensajes: mas ? tanda.mensajes.slice(1) : tanda.mensajes, mas };
  });
};

/** People to write to, by name: contacts first, without the student. */
export const buscarPersonas = (consulta) =>
  conCache(`mensajes.personas.${consulta}`, 5, async () => {
    const { id } = await cargarPerfil();
    return personasHalladas(await pedirMensajes('core_message_message_search_users', { userid: id, search: consulta, limitfrom: 0, limitnum: 20 }), id);
  });

// The writes, with the care of inscribirmeEn: a function the campus leaves closed says so, and only an answer about the
// current key ends the session.
async function escribirMensajes(funcion, real, demo) {
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  try {
    if (import.meta.env.DEV && esDemo(token)) {
      const { DEMO_MENSAJES } = await import('./demoMensajes');
      return await demo(DEMO_MENSAJES);
    }
    return await real(token);
  } catch (error) {
    if (await cerradaEnElCampus(error, funcion, token).catch(() => false)) {
      throw new ErrorCampus('El campus no deja mandar mensajes desde Super CVG. Hacelo desde su página.', 'sin_permiso');
    }
    if (error.codigo === 'sesion' && tokenActual() === token) cerrarSesion();
    throw error;
  }
}

// A clear no from the campus says the message didn't go. A cut connection or a failed answer doesn't: it may have got
// there all the same, so it is looked up before saying «No salió», and trying again doesn't send it twice.
const enDuda = (error) => !(error instanceof ErrorCampus) || /^http_|^respuesta_invalida$|^sin_confirmar$/.test(error.codigo);

/** Answers in a conversation, after the screen asked: the message as the campus keeps it. `despuesDe`: the id of the
 * newest message shown, to find this one if the answer gets lost on the way. */
export async function responderEn(conversacionId, texto, { despuesDe = 0 } = {}) {
  const { id: yo } = await cargarPerfil();
  try {
    return mensaje(await escribirMensajes(
      'core_message_send_messages_to_conversation',
      (token) => responderEnConversacion(token, conversacionId, texto),
      async (D) => leerRespuesta(await D.responder(conversacionId, texto, yo)),
    ));
  } catch (error) {
    if (!enDuda(error)) throw error;
    const ultimos = await leerMensajes(conversacionId, 0, 5).catch(() => null);
    const llego = ultimos?.mensajes.findLast((m) => m.de === yo && m.id > despuesDe && mismoTexto(texto, m.texto));
    if (llego) return llego;
    throw error;
  } finally {
    olvidar(['mensajes.lista.', `mensajes.charla.${conversacionId}.`]);
  }
}

/** Writes to someone with no conversation yet, after the screen asked: { conversacionId, mensaje }. */
export async function escribirA(personaId, texto) {
  const { id: yo } = await cargarPerfil();
  try {
    const r = await escribirMensajes(
      'core_message_send_instant_messages',
      (token) => mandarMensaje(token, personaId, texto),
      async (D) => leerMandado(await D.mandar(personaId, texto, yo)),
    );
    return { conversacionId: r.conversationid, mensaje: mensaje(r) };
  } catch (error) {
    if (!enDuda(error)) throw error;
    const recientes = await leerConversaciones(0).catch(() => null);
    const llego = recientes?.conversaciones.find((c) => !c.grupo && c.persona.id === personaId && c.ultimo?.de === yo && mismoTexto(texto, c.ultimo.texto));
    if (llego) return { conversacionId: llego.id, mensaje: llego.ultimo };
    throw error;
  } finally {
    olvidar(['mensajes.lista.']);
  }
}

/** Marks a conversation as read when it is opened, what the campus does when it is opened there. It doesn't ask. */
export async function marcarComoLeida(conversacionId) {
  const { id } = await cargarPerfil();
  await escribirMensajes(
    'core_message_mark_all_conversation_messages_as_read',
    (token) => marcarLeida(token, id, conversacionId),
    (D) => D.marcar(conversacionId),
  );
  olvidar(['mensajes.lista.']);
}

// Pictures come three at a time: a list of conversations does not ask the campus for twenty at once.
let fotosEnCamino = 0;
const enEspera = [];
const turnoDeFoto = () => new Promise((listo) => {
  if (fotosEnCamino < 3) {
    fotosEnCamino += 1;
    listo();
  } else enEspera.push(listo);
});
const soltarFoto = () => {
  const siguiente = enEspera.shift();
  if (siguiente) siguiente();
  else fotosEnCamino -= 1;
};

/** The picture of a person or a group (`fotoDe` of mensajes.js), brought with the key in the body and kept in memory
 * for the visit as a blob address. Null when it doesn't come as an image: the initials stay. */
export const cargarFoto = (direccion) =>
  conCache(`foto.${direccion}`, 60, async () => {
    const token = tokenActual();
    if (!token) return null;
    if (import.meta.env.DEV && esDemo(token)) {
      const { fotoDemo } = await import('./demoMensajes');
      return fotoDemo(direccion);
    }
    await turnoDeFoto();
    try {
      const archivo = await bajarArchivo(token, direccion);
      return archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null;
    } finally {
      soltarFoto();
    }
  });

/** Title and channel of a video, only when the student opens its preview. Sends the video id and nothing else. */
export const cargarVideo = (id) =>
  conCache(`video.${id}`, 60, async () => {
    if (esDemo(tokenActual())) return { titulo: 'Video de ejemplo', canal: 'Canal de ejemplo' };
    const direccion = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const respuesta = await fetch(direccion, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!respuesta.ok) return null;
    const datos = await respuesta.json();
    return { titulo: textoPlano(datos.title), canal: textoPlano(datos.author_name) };
  });

// Tasks of a course (Tareas). Read like the rest, once per visit and only in memory; handing one in goes through the
// writes of moodle.js, after the screen asked.

/** The tasks of a course, with their instructions, dates and rules (tareas.js). */
export const cargarTareas = (materia) =>
  conCache(`tareas.${materia.id}`, 30, async () => leerTareas(await pedir('mod_assign_get_assignments', { 'courseids[0]': materia.id }), materia.nombre));

/** Where the student's submission of a task is: sent or not, the grade and the comment. */
export const cargarEstadoTarea = (tarea, materia) =>
  conCache(`tarea.${tarea.id}`, 5, async () => leerEstado(await pedir('mod_assign_get_submission_status', { assignid: tarea.id }), { materia: materia.nombre, materiaId: materia.id }));

/** A task by its course and its module number (`cmid`, the one in its campus address): { materia, tarea, estado }.
 * `materia` is null when the course is not the student's, and `tarea` when the course has no task with that number. */
export async function cargarTarea(materiaId, cmid) {
  await cargarPerfil();
  const { enCurso, otras } = await cargarMaterias();
  const materia = [...enCurso, ...otras].find((m) => m.id === materiaId) ?? null;
  if (!materia) return { materia: null, tarea: null, estado: null };
  const tarea = (await cargarTareas(materia)).find((t) => t.cmid === cmid) ?? null;
  return { materia, tarea, estado: tarea ? await cargarEstadoTarea(tarea, materia) : null };
}

/** Hands in a task, after the screen asked. Every file goes up to one draft of the student, also the ones already in the
 * submission (downloaded and up again, as the Moodle app does, or the campus would drop them); then the submission is
 * saved with them and the text, and with `enviar` it goes to be graded. Each step once and in order: if one fails, none
 * after it is tried. The error says which file it was (`archivo`) and whether the submission got saved (`guardada`).
 * A dead key does not close the session here, so the screen keeps what was written. In the sample mode it is pretend.
 * `archivos`: { id, nombre, blob } for a new one, { id, nombre, direccion } for one already handed in.
 * Comes back with the new state of the task and how many files the campus left out, if any. */
export async function entregarTarea(tarea, materia, { texto = '', archivos = [], enviar = false, aceptar = false, alAvanzar = () => {} }) {
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  let api = { subirArchivo, guardarEntrega, enviarEntrega, bajar: (direccion) => bajarArchivo(token, direccion) };
  if (import.meta.env.DEV && esDemo(token)) {
    const { DEMO } = await import('./demo');
    api = { ...DEMO.entrega, bajar: async () => new Blob(['Archivo de ejemplo']) };
  }
  let guardada = false;
  let enCurso = null;
  try {
    let borrador;
    if (tarea.archivos) {
      borrador = 0;
      for (const [i, a] of archivos.entries()) {
        enCurso = a.id;
        alAvanzar({ paso: 'subiendo', cual: i + 1, de: archivos.length });
        const blob = a.blob ?? (await api.bajar(a.direccion));
        borrador = await api.subirArchivo(token, blob, { nombre: a.nombre, borrador });
      }
      enCurso = null;
      // No file left: an empty draft number, as the Moodle app sends, so the campus takes the files out.
      if (!borrador) borrador = 1;
    }
    alAvanzar({ paso: 'guardando' });
    await api.guardarEntrega(token, tarea.id, { texto: tarea.texto ? aHtml(texto) : undefined, borrador });
    guardada = true;
    if (enviar) {
      alAvanzar({ paso: 'enviando' });
      await api.enviarEntrega(token, tarea.id, { aceptar });
    }
  } catch (error) {
    olvidar([`tarea.${tarea.id}`, 'pendientes']);
    const final = (await cerradaEnElCampus(error, 'mod_assign_save_submission', token).catch(() => false))
      ? new ErrorCampus('El campus no deja entregar desde Super CVG. Entregala desde su página.', 'sin_permiso')
      : error;
    final.guardada = guardada;
    if (enCurso) final.archivo = enCurso;
    throw final;
  }
  olvidar([`tarea.${tarea.id}`, 'pendientes']);
  const estado = await cargarEstadoTarea(tarea, materia).catch(() => null);
  const llegaron = estado?.envio?.archivos.length;
  return { estado, faltan: tarea.archivos && llegaron !== undefined ? Math.max(0, archivos.length - llegaron) : 0 };
}

/** Sends a saved draft to be graded, accepting the statement when the task asks for one. Same rules as entregarTarea. */
export async function enviarParaCalificar(tarea, materia, { aceptar = false } = {}) {
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  try {
    if (import.meta.env.DEV && esDemo(token)) {
      const { DEMO } = await import('./demo');
      await DEMO.entrega.enviarEntrega(token, tarea.id, { aceptar });
    } else {
      await enviarEntrega(token, tarea.id, { aceptar });
    }
  } catch (error) {
    olvidar([`tarea.${tarea.id}`, 'pendientes']);
    if (await cerradaEnElCampus(error, 'mod_assign_submit_for_grading', token).catch(() => false)) {
      throw new ErrorCampus('El campus no deja entregar desde Super CVG. Entregala desde su página.', 'sin_permiso');
    }
    throw error;
  }
  olvidar([`tarea.${tarea.id}`, 'pendientes']);
  return { estado: await cargarEstadoTarea(tarea, materia).catch(() => null) };
}

// Quizzes of a course (Cuestionarios). Read only, like the rest: once per visit and only in memory. Super CVG never
// starts nor continues an attempt: it links to the campus for that. A function the campus leaves closed, or does not
// list among its functions, takes its part out of the screen and the rest still shows, with the session on.

const ofrece = async (funcion) => {
  const { funciones } = await cargarPerfil();
  return !funciones || funciones.has(funcion);
};

/** One read the campus may leave closed: what `leer` makes of its answer, or null with its name in `cerradas`. */
async function siAbre(funcion, parametros, leer, cerradas) {
  if (await ofrece(funcion)) {
    try {
      return leer(await pedir(funcion, parametros));
    } catch (error) {
      if (error.codigo !== 'sin_permiso') throw error;
    }
  }
  cerradas.push(funcion);
  return null;
}

/** The quizzes of a course, with their rules and dates (cuestionarios.js), or null when the campus does not open them. */
export const cargarCuestionarios = (materia) =>
  conCache(`cuestionarios.${materia.id}`, 30, () => siAbre('mod_quiz_get_quizzes_by_courses', { 'courseids[0]': materia.id }, (r) => leerCuestionarios(r, materia.nombre), []));

/** Where the student is with a quiz: the attempts, what the campus lets do, the best grade and its feedback. Each part is
 * null when the campus leaves its function closed, and `cerradas` names them. */
export const cargarEstadoCuestionario = (c) =>
  conCache(`cuestionario.${c.id}`, 5, async () => {
    const cerradas = [];
    const [intentos, acceso] = await Promise.all([
      siAbre('mod_quiz_get_user_attempts', { quizid: c.id, status: 'all' }, leerIntentos, cerradas),
      siAbre('mod_quiz_get_quiz_access_information', { quizid: c.id }, leerAcceso, cerradas),
    ]);
    // Without the attempts, the grade may still come.
    const mejor = intentos === null || terminados(intentos).length ? await siAbre('mod_quiz_get_user_best_grade', { quizid: c.id }, leerMejorNota, cerradas) : null;
    let devolucion = [];
    if (c.conDevolucion && mejor?.nota !== null && mejor?.nota !== undefined) {
      // The quiz settings say whether it shows. Once it closed they do not come, and the campus says it.
      const seVe = seVeLaDevolucion(c, intentos, Date.now() / 1000)
        ?? (await siAbre('mod_quiz_get_combined_review_options', { quizid: c.id }, leerOpcionesCombinadas, cerradas))?.devolucion;
      if (seVe) devolucion = (await siAbre('mod_quiz_get_quiz_feedback_for_grade', { quizid: c.id, grade: mejor.nota }, leerDevolucion, cerradas)) ?? [];
    }
    return { intentos, acceso, mejor, devolucion, cerradas };
  });

/** A quiz by its course and its module number (the one in its campus address): { materia, cuestionario } and what
 * cargarEstadoCuestionario brings. `materia` is null when the course is not the student's, and `cuestionario` when the
 * course has no quiz with that number. `cerrado` when the campus does not open its quizzes: then `nombre` comes from
 * the course page, if it is there. */
export async function cargarCuestionario(materiaId, cmid) {
  await cargarPerfil();
  const { enCurso, otras } = await cargarMaterias();
  const materia = [...enCurso, ...otras].find((m) => m.id === materiaId) ?? null;
  if (!materia) return { materia: null, cuestionario: null };
  const lista = await cargarCuestionarios(materia);
  if (!lista) {
    const item = (await cargarContenido(materia).catch(() => [])).find((i) => i.clave === String(cmid));
    return { materia, cuestionario: null, cerrado: true, nombre: item?.nombre ?? null };
  }
  const cuestionario = lista.find((c) => c.cmid === cmid) ?? null;
  return cuestionario ? { materia, cuestionario, ...(await cargarEstadoCuestionario(cuestionario)) } : { materia, cuestionario: null };
}

/** The review of a finished attempt of the student: { revision } or { cerrada: 'docente' | 'campus' }. */
const cargarRevision = (intentoId) =>
  conCache(`cuestionario.revision.${intentoId}`, 15, async () => {
    try {
      const revision = await siAbre('mod_quiz_get_attempt_review', { attemptid: intentoId, page: -1 }, leerRevision, []);
      return revision ? { revision } : { cerrada: 'campus' };
    } catch (error) {
      // The quiz settings keep it closed for now, or the teacher closed it.
      // Moodle says it as noreview, noreviewattempt or noreviewuntil..., by version.
      if (/review|^attemptclosed$/i.test(String(error.codigo ?? ''))) return { cerrada: 'docente', abre: null };
      throw error;
    }
  });

/** One attempt of a quiz with its review: what cargarCuestionario brings, `intento`, and `revision` or `cerrada`
 * ('docente', with `abre` when the settings say when; or 'campus'). The review is not even asked for when the quiz
 * settings already say it is closed. */
export async function cargarIntento(materiaId, cmid, intentoId) {
  const datos = await cargarCuestionario(materiaId, cmid);
  const intento = datos.intentos?.find((i) => i.id === intentoId) ?? null;
  if (!datos.cuestionario || !intento || intento.estado !== 'terminado') return { ...datos, intento };
  const revisable = revisionDe(datos.cuestionario, intento, datos.acceso, Date.now() / 1000);
  if (revisable && !revisable.abierta) return { ...datos, intento, cerrada: 'docente', abre: revisable.abre };
  return { ...datos, intento, ...(await cargarRevision(intentoId)) };
}

// ── Foros ──────────────────────────────────────────────────────────────────────────────────────────────────────
// Read only. The forums of the courses in progress come in one request, and the discussions of each forum that has any
// in another, a few at a time. Nothing is asked again until the cache runs out or the student asks.
const FOROS_A_LA_VEZ = 4;
// How the campus' answers are read (foros.js) comes only with Foros, not with the first page.
const lectorDeForos = () => import('./foros');

/** The forums of the courses in progress: { foros } or { cerrado: true } when the campus does not open them. */
export const cargarForos = ({ fresco = false } = {}) => {
  if (fresco) olvidar(['foros']);
  return conCache('foros', 30, async () => {
    if (!(await ofrece('mod_forum_get_forums_by_courses'))) return { cerrado: true };
    const { enCurso } = await cargarMaterias();
    if (!enCurso.length) return { foros: [] };
    const nombres = Object.fromEntries(enCurso.map((m) => [m.id, m.nombre]));
    const parametros = Object.fromEntries(enCurso.map((m, i) => [`courseids[${i}]`, m.id]));
    const { leerForos } = await lectorDeForos();
    try {
      return { foros: leerForos(await pedir('mod_forum_get_forums_by_courses', parametros), nombres) };
    } catch (error) {
      if (error.codigo === 'sin_permiso') return { cerrado: true };
      throw error;
    }
  });
};

/** The latest discussions of one forum. */
export const cargarDiscusiones = (foro, { fresco = false } = {}) => {
  if (fresco) olvidar([`foros.discusiones.${foro.id}`]);
  return conCache(`foros.discusiones.${foro.id}`, 10, async () => {
    const { leerDiscusiones } = await lectorDeForos();
    return leerDiscusiones(await pedir('mod_forum_get_forum_discussions', { forumid: foro.id, page: 0, perpage: 50 }), foro);
  });
};

/** Every forum with its discussions: { foros, discusiones, fallaron } (the forums whose discussions did not come), or
 * { cerrado: true }. `fresco` asks the campus again. */
export async function cargarTodosLosForos({ fresco = false } = {}) {
  const datos = await cargarForos({ fresco });
  if (datos.cerrado) return datos;
  const conAlgo = datos.foros.filter((f) => f.discusiones > 0);
  const discusiones = [];
  const fallaron = [];
  for (let i = 0; i < conAlgo.length; i += FOROS_A_LA_VEZ) {
    const tanda = conAlgo.slice(i, i + FOROS_A_LA_VEZ);
    const resultados = await Promise.allSettled(tanda.map((f) => cargarDiscusiones(f, { fresco })));
    resultados.forEach((r, j) => {
      if (r.status === 'fulfilled') discusiones.push(...r.value);
      else if (r.reason?.codigo === 'sin_sesion') throw r.reason;
      else fallaron.push(tanda[j]);
    });
  }
  const { ordenarDiscusiones } = await lectorDeForos();
  return { foros: datos.foros, discusiones: ordenarDiscusiones(discusiones), fallaron };
}

/** The posts of one discussion, with its course: { posts, materiaId, materia, foroId }. */
export const cargarHilo = (discusionId, { fresco = false } = {}) => {
  if (fresco) olvidar([`foros.hilo.${discusionId}`]);
  return conCache(`foros.hilo.${discusionId}`, 5, async () => {
    const [respuesta, nombres, { leerHilo }] = await Promise.all([
      pedir('mod_forum_get_discussion_posts', { discussionid: discusionId, sortby: 'created', sortdirection: 'ASC' }),
      cargarNombres(),
      lectorDeForos(),
    ]);
    const materiaId = Number(respuesta?.courseid) || null;
    const materia = (materiaId && nombres[materiaId]) || '';
    return { posts: leerHilo(respuesta, { materia, materiaId }), materiaId, materia, foroId: Number(respuesta?.forumid) || null };
  });
};

/** Answers a post of a discussion, when the student tapped Publicar: { id } of the new post. Sent once. A clear no
 * says so; a cut connection or a lost answer is looked up in the discussion before saying it didn't go, so trying again
 * doesn't publish it twice. */
export async function publicarEnForo(discusionId, postId, asunto, texto) {
  const { id: yo } = await cargarPerfil();
  const token = tokenActual();
  if (!token) throw new ErrorCampus('Tu sesión terminó.', 'sin_sesion');
  const desde = Math.floor(Date.now() / 1000) - 120;
  try {
    if (import.meta.env.DEV && esDemo(token)) {
      const { FOROS_DEMO } = await import('./demoForos');
      return leerPublicado(FOROS_DEMO.publicar(postId, asunto, texto, yo));
    }
    return await responderEnForo(token, postId, asunto, texto);
  } catch (error) {
    if (await cerradaEnElCampus(error, 'mod_forum_add_discussion_post', token).catch(() => false)) {
      throw new ErrorCampus('El campus no deja responder en los foros desde Super CVG. Hacelo desde su página.', 'sin_permiso');
    }
    if (error.codigo === 'sesion' && tokenActual() === token) cerrarSesion();
    if (!enDuda(error)) throw error;
    const hilo = await cargarHilo(discusionId, { fresco: true }).catch(() => null);
    const llego = hilo?.posts.findLast((p) => p.autorId === yo && p.cuando >= desde && mismoTexto(texto, p.texto));
    if (llego) return { id: llego.id };
    throw error;
  } finally {
    olvidar([`foros.hilo.${discusionId}`, 'foros.discusiones.']);
  }
}
