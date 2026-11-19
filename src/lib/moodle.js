// The only module that talks to the campus. Three rules are enforced here:
//   - Read only: `llamar` throws before any request for a function outside LECTURA.
//   - The writes, apart: `inscribirse` enrols the student in a course, and `subirArchivo`, `guardarEntrega` and
//     `enviarEntrega` hand in a task. Only through ESCRITURA, one attempt each, and only after the screen asked.
//     `responderEnConversacion` and `mandarMensaje` send a private message, after asking too, and `marcarLeida` marks a
//     conversation as read when it is opened, like the campus does. `responderEnForo` answers a post of a forum, when
//     the student taps Publicar.
//   - Quizzes are read only: an attempt is started and continued on the campus, never from here.
//   - The key never travels in a URL: it always goes in the request body.
export const CAMPUS = 'https://frro.cvg.utn.edu.ar';

export const LECTURA = new Set([
  'core_webservice_get_site_info',
  'core_enrol_get_users_courses',
  'core_course_get_enrolled_courses_by_timeline_classification',
  'core_calendar_get_action_events_by_timesort',
  'core_calendar_get_calendar_monthly_view',
  'core_course_get_contents',
  'message_popup_get_popup_notifications',
  // How many notifications are unread, for the bell. Marking one as read is left out on purpose.
  'message_popup_get_unread_popup_notification_count',
  // Finding a course to enrol in: the categories, the search, a category's courses and how each one takes students.
  'core_course_get_categories',
  'core_course_search_courses',
  'core_course_get_courses_by_field',
  'core_enrol_get_course_enrolment_methods',
  'enrol_self_get_instance_info',
  // A task of a course: its instructions, dates and rules, and where the student's submission is.
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  // A quiz of a course: its rules, the student's attempts and grade, the feedback for that grade, what it lets do and
  // the review of a finished attempt. Never one that starts, continues or logs an attempt (start_attempt, view_*).
  'mod_quiz_get_quizzes_by_courses',
  'mod_quiz_get_user_attempts',
  'mod_quiz_get_user_best_grade',
  'mod_quiz_get_quiz_feedback_for_grade',
  'mod_quiz_get_quiz_access_information',
  'mod_quiz_get_combined_review_options',
  'mod_quiz_get_attempt_review',
  // Private messages: how many conversations have unread ones, the conversations, the messages of one, and finding
  // someone to write to.
  'core_message_get_unread_conversations_count',
  'core_message_get_conversations',
  'core_message_get_conversation_messages',
  'core_message_message_search_users',
  // The forums of the courses, the discussions of one and the posts of one, to read them (Foros). Never one that
  // writes or logs a view (add_discussion, add_discussion_post, view_forum*).
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
  'mod_forum_get_discussion_posts',
]);

// The only function that changes something in the campus, kept out of LECTURA so `llamar` never sends it.
const INSCRIBIR = 'enrol_self_enrol_user';
// Handing in a task: the files go up to a draft area of the student (upload.php, not a function of server.php), the
// submission is saved with them, and, when the task asks for it, sent to be graded.
const SUBIR = 'webservice/upload.php';
const GUARDAR_ENTREGA = 'mod_assign_save_submission';
const ENVIAR_ENTREGA = 'mod_assign_submit_for_grading';
// Private messages: answering in a conversation and writing to someone, after the screen asked, and marking a
// conversation as read when it is opened, like the campus does.
const RESPONDER = 'core_message_send_messages_to_conversation';
const MANDAR = 'core_message_send_instant_messages';
const MARCAR_LEIDA = 'core_message_mark_all_conversation_messages_as_read';
// Forums: an answer to a post of a discussion. Never a discussion of its own, an edit or a deletion.
const RESPONDER_EN_FORO = 'mod_forum_add_discussion_post';
export const ESCRITURA = new Set([INSCRIBIR, SUBIR, GUARDAR_ENTREGA, ENVIAR_ENTREGA, RESPONDER, MANDAR, MARCAR_LEIDA, RESPONDER_EN_FORO]);

export class ErrorCampus extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.conocido = true;
    this.codigo = codigo;
  }
}

const SESION_VENCIDA = new Set(['invalidtoken', 'accessexception', 'sitepolicynotagreed', 'usernotfullysetup']);

function errorSegun(codigo) {
  if (codigo === 'invalidlogin') return new ErrorCampus('El usuario o la contraseña no coinciden.', codigo);
  if (codigo === 'enablewsdescription' || codigo === 'servicenotavailable') {
    return new ErrorCampus('El campus no permite este acceso ahora. Entrá desde su página.', codigo);
  }
  if (SESION_VENCIDA.has(codigo)) return new ErrorCampus('Tu sesión venció. Volvé a entrar.', 'sesion');
  return new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', codigo);
}

// `campus` keeps the campus's own code: «accessexception» is a dead key, but also a function its app access left closed.
function errorDeAcceso(codigo) {
  const error = errorSegun(codigo);
  error.campus = codigo;
  return error;
}

async function leerJson(respuesta) {
  if (!respuesta.ok) throw new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', `http_${respuesta.status}`);
  try {
    return await respuesta.json();
  } catch {
    throw new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', 'respuesta_invalida');
  }
}

/** Exchanges the password for a key. One attempt per call: it never retries, so a typo cannot add failed logins. */
export async function pedirClave(usuario, contrasena) {
  const respuesta = await fetch(`${CAMPUS}/login/token.php`, {
    method: 'POST',
    redirect: 'error',
    body: new URLSearchParams({ username: usuario, password: contrasena, service: 'moodle_mobile_app' }),
  });
  const datos = await leerJson(respuesta);
  if (!datos.token) throw errorDeAcceso(datos.errorcode);
  return datos.token;
}

// One request to the web service, with the key in the body. Each caller says which list the function has to be in.
async function enviar(lista, token, funcion, parametros) {
  if (!lista.has(funcion)) throw new Error(`Función fuera de la lista: ${funcion}`);
  const respuesta = await fetch(`${CAMPUS}/webservice/rest/server.php`, {
    method: 'POST',
    redirect: 'error',
    body: new URLSearchParams({ ...parametros, wstoken: token, wsfunction: funcion, moodlewsrestformat: 'json' }),
  });
  return leerJson(respuesta);
}

export async function llamar(token, funcion, parametros = {}) {
  if (!LECTURA.has(funcion)) throw new Error(`Función fuera de la lista de lectura: ${funcion}`);
  const datos = await enviar(LECTURA, token, funcion, parametros);
  if (datos?.exception) throw errorDeAcceso(datos.errorcode);
  return datos;
}

const CLAVE_MAL = new Set(['2', '3', '4']);

/** What the campus answered to an enrolment: true, or an error that says why in words. Its own messages are not shown:
 * one of them carries the first letter of the course key. */
export function leerInscripcion(datos) {
  if (datos?.status === true || datos?.status === 1) return true;
  const codigos = (datos?.warnings ?? []).map((w) => String(w?.warningcode));
  if (codigos.some((c) => CLAVE_MAL.has(c))) throw new ErrorCampus('La clave no es esa. Revisala y probá de nuevo.', 'clave_incorrecta');
  if (codigos.includes('1')) throw new ErrorCampus('La inscripción a esta materia está cerrada o llena.', 'inscripcion_cerrada');
  throw new ErrorCampus('No pudimos inscribirte. Probá de nuevo en un rato.', 'no_inscripto');
}

const numero = (n) => Number.isSafeInteger(n) && n > 0;

/** Enrols the student in a course through one of its self enrolments. The only write: it sends INSCRIBIR and nothing
 * else, with the course key in the body. One attempt per call, it never retries: a slow answer cannot enrol twice or
 * add failed key attempts. */
export async function inscribirse(token, cursoId, { instancia, clave = '' } = {}) {
  if (!numero(cursoId) || !numero(instancia)) throw new ErrorCampus('No pudimos inscribirte. Probá de nuevo en un rato.', 'datos_invalidos');
  const datos = await enviar(ESCRITURA, token, INSCRIBIR, { courseid: String(cursoId), instanceid: String(instancia), password: String(clave) });
  if (datos?.exception) {
    // No self enrolment left in the course, or the course is out of sight.
    if (datos.errorcode === 'canntenrol') throw new ErrorCampus('Esta materia no deja inscribirse desde el campus. Pedíselo a quien la da.', 'sin_inscripcion');
    if (datos.errorcode === 'coursehidden') throw new ErrorCampus('Esta materia no está abierta en el campus.', 'oculta');
    throw errorDeAcceso(datos.errorcode);
  }
  return leerInscripcion(datos);
}

// Private messages. Each write sends its one function and nothing else, once: it never retries, so a slow answer
// cannot send a message twice.

/** The longest message the campus takes: core_message\api::MESSAGE_MAX_LENGTH, measured in bytes of UTF-8. */
export const LARGO_MAXIMO = 4096;
export const largoEnBytes = (texto) => new TextEncoder().encode(String(texto ?? '')).length;
const mensajeValido = (texto) => typeof texto === 'string' && texto.trim() !== '' && largoEnBytes(texto) <= LARGO_MAXIMO;
const NO_SALIO = 'No pudimos mandar el mensaje. Probá de nuevo.';

function errorDeMensaje(codigo) {
  if (codigo === 'errormessagetoolong') return new ErrorCampus('El mensaje es muy largo para el campus. Acortalo y probá de nuevo.', 'muy_largo');
  if (codigo === 'disabled') return new ErrorCampus('Los mensajes están apagados en el campus.', 'sin_mensajes');
  return errorDeAcceso(codigo);
}

/** What the campus answered to an answer in a conversation: the message as it keeps it, { id, useridfrom, text,
 * timecreated }, or an error in words. */
export function leerRespuesta(datos) {
  if (datos?.exception) throw errorDeMensaje(datos.errorcode);
  const mensaje = Array.isArray(datos) ? datos[0] : null;
  if (!numero(mensaje?.id)) throw new ErrorCampus('El campus no confirmó el mensaje.', 'sin_confirmar');
  return mensaje;
}

/** What the campus answered to a message to someone. It says no (blocked, only takes messages from contacts) with
 * msgid -1 and its own words, which are not shown. */
export function leerMandado(datos) {
  if (datos?.exception) throw errorDeMensaje(datos.errorcode);
  const r = Array.isArray(datos) ? datos[0] : null;
  if (!r || typeof r.msgid !== 'number') throw new ErrorCampus('El campus no confirmó el mensaje.', 'sin_confirmar');
  if (!numero(r.msgid)) throw new ErrorCampus('El campus no dejó mandarlo. Puede que esa persona no reciba mensajes tuyos.', 'rechazado');
  return { id: r.msgid, conversationid: r.conversationid, useridfrom: r.useridfrom, text: r.text, timecreated: r.timecreated };
}

/** Answers in a conversation of the student: sends RESPONDER, with the text as the campus page sends it. */
export async function responderEnConversacion(token, conversacionId, texto) {
  if (!numero(conversacionId) || !mensajeValido(texto)) throw new ErrorCampus(NO_SALIO, 'datos_invalidos');
  return leerRespuesta(await enviar(ESCRITURA, token, RESPONDER, { conversationid: String(conversacionId), 'messages[0][text]': texto }));
}

/** Writes to someone, with or without a conversation between the two (the campus opens one): sends MANDAR. */
export async function mandarMensaje(token, personaId, texto) {
  if (!numero(personaId) || !mensajeValido(texto)) throw new ErrorCampus(NO_SALIO, 'datos_invalidos');
  return leerMandado(await enviar(ESCRITURA, token, MANDAR, { 'messages[0][touserid]': String(personaId), 'messages[0][text]': texto }));
}

/** Marks every message of a conversation as read for the student, what the campus does when it is opened there:
 * sends MARCAR_LEIDA. */
export async function marcarLeida(token, usuarioId, conversacionId) {
  if (!numero(usuarioId) || !numero(conversacionId)) throw new ErrorCampus('No pudimos marcarla como leída.', 'datos_invalidos');
  const datos = await enviar(ESCRITURA, token, MARCAR_LEIDA, { userid: String(usuarioId), conversationid: String(conversacionId) });
  if (datos?.exception) throw errorDeMensaje(datos.errorcode);
  return true;
}

/** Downloads a campus file with the key in the body. Refuses any address outside the campus. */
export async function bajarArchivo(token, direccion) {
  const url = new URL(direccion);
  if (url.origin !== CAMPUS || !url.pathname.startsWith('/webservice/pluginfile.php/')) {
    throw new ErrorCampus('Ese archivo no está en el campus.', 'fuera_del_campus');
  }
  url.searchParams.delete('token');
  url.searchParams.delete('wstoken');
  const respuesta = await fetch(url, { method: 'POST', redirect: 'error', body: new URLSearchParams({ token }) });
  if (!respuesta.ok) throw new ErrorCampus('No se pudo bajar el archivo. Probá de nuevo.', `http_${respuesta.status}`);
  if ((respuesta.headers.get('content-type') ?? '').includes('application/json')) {
    throw new ErrorCampus('No se pudo bajar el archivo. Probá de nuevo.', 'archivo_rechazado');
  }
  return respuesta.blob();
}

// ---------- Handing in a task ----------

const MUY_GRANDE = 'El archivo pesa más de lo que acepta el campus.';
const GRANDE = new Set(['fileoversized', 'upload_error_ini_size', 'upload_error_form_size', 'userquotalimit', 'http_413']);

// What the campus says to a write about a task, in words. Its own messages are not shown: some are technical.
function errorDeEntrega(codigo) {
  if (GRANDE.has(codigo)) return new ErrorCampus(MUY_GRANDE, 'archivo_grande');
  if (codigo === 'filenameexist') return new ErrorCampus('Ya hay otro archivo con ese nombre.', 'archivo_repetido');
  if (codigo === 'virusfounduser' || codigo === 'virusfound') return new ErrorCampus('El campus rechazó el archivo.', 'archivo_rechazado');
  if (codigo === 'submissionslocked') return new ErrorCampus('Las entregas de esta tarea están bloqueadas en el campus.', 'bloqueada');
  if (codigo === 'nopermission' || codigo === 'nopermissions' || codigo === 'notingroup') return new ErrorCampus('El campus no te deja entregar esta tarea.', 'sin_permiso');
  return errorDeAcceso(codigo);
}

const sinEtiquetas = (texto) => String(texto ?? '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);

/** Uploads one file to the student's draft area and returns its number (`itemid`). `borrador` 0 starts a new one; the
 * rest of the files go to the same. Only to the campus, with the key in the body and no redirects. One attempt per
 * call, it never retries. */
export async function subirArchivo(token, archivo, { nombre, borrador = 0 } = {}) {
  if (!ESCRITURA.has(SUBIR)) throw new Error(`Función fuera de la lista: ${SUBIR}`);
  if (!(archivo instanceof Blob) || !String(nombre ?? '').trim() || !Number.isSafeInteger(borrador) || borrador < 0) {
    throw new ErrorCampus('No pudimos subir el archivo. Probá de nuevo.', 'datos_invalidos');
  }
  const cuerpo = new FormData();
  cuerpo.append('token', token);
  cuerpo.append('filearea', 'draft');
  cuerpo.append('itemid', String(borrador));
  cuerpo.append('filepath', '/');
  cuerpo.append('file_1', archivo, String(nombre));
  const respuesta = await fetch(`${CAMPUS}/${SUBIR}`, { method: 'POST', redirect: 'error', body: cuerpo });
  if (respuesta.status === 413) throw errorDeEntrega('http_413');
  // A refusal of upload.php comes as JSON, sometimes with an error status: its code says why.
  const datos = await respuesta.json().catch(() => undefined);
  if (datos?.exception || datos?.errorcode) throw errorDeEntrega(datos.errorcode);
  if (!respuesta.ok) throw new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', `http_${respuesta.status}`);
  const subido = Array.isArray(datos) ? datos[0] : null;
  if (subido?.error || subido?.errortype) throw errorDeEntrega(subido.errortype);
  const itemid = Number(subido?.itemid);
  if (!Number.isSafeInteger(itemid) || itemid <= 0) throw new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', 'respuesta_invalida');
  return itemid;
}

const tarea = (n) => Number.isSafeInteger(n) && n > 0;

/** Saves the submission of a task with what goes in it: `texto`, the HTML of the online text, and `borrador`, the draft
 * area with every file (subirArchivo). Each one only when the task takes it: a part left out stays as it was on the
 * campus. With drafts on it stays as a draft; without them, it is handed in. One attempt, it never retries. */
export async function guardarEntrega(token, tareaId, { texto, borrador } = {}) {
  const conTexto = typeof texto === 'string';
  const conArchivos = Number.isSafeInteger(borrador) && borrador > 0;
  if (!tarea(tareaId) || (!conTexto && !conArchivos)) throw new ErrorCampus('No pudimos guardar la entrega. Probá de nuevo.', 'datos_invalidos');
  const parametros = { assignmentid: String(tareaId) };
  if (conTexto) {
    // No pictures inside the text: its draft area is none (0), as in the Moodle app.
    parametros['plugindata[onlinetext_editor][text]'] = texto;
    parametros['plugindata[onlinetext_editor][format]'] = '1';
    parametros['plugindata[onlinetext_editor][itemid]'] = '0';
  }
  if (conArchivos) parametros['plugindata[files_filemanager]'] = String(borrador);
  const datos = await enviar(ESCRITURA, token, GUARDAR_ENTREGA, parametros);
  if (datos?.exception) throw errorDeEntrega(datos.errorcode);
  const avisos = Array.isArray(datos) ? datos : (datos?.warnings ?? []);
  if (avisos.length) {
    // These notices are the campus's words for the student (the date passed, the word limit): they go as a detail.
    const error = new ErrorCampus('El campus no guardó la entrega.', 'no_guardada');
    error.detalle = avisos.map((a) => sinEtiquetas(a?.message)).filter(Boolean).join(' ');
    throw error;
  }
  return true;
}

/** Sends a saved submission to be graded, accepting the statement when the task asks for one. One attempt. */
export async function enviarEntrega(token, tareaId, { aceptar = false } = {}) {
  if (!tarea(tareaId)) throw new ErrorCampus('No pudimos enviarla. Probá de nuevo.', 'datos_invalidos');
  const datos = await enviar(ESCRITURA, token, ENVIAR_ENTREGA, { assignmentid: String(tareaId), acceptsubmissionstatement: aceptar === true ? '1' : '0' });
  if (datos?.exception) throw errorDeEntrega(datos.errorcode);
  const avisos = Array.isArray(datos) ? datos : (datos?.warnings ?? []);
  // Its notice carries internal numbers: never shown.
  if (avisos.length) throw new ErrorCampus('El campus no la envió para calificar. Quedó guardada como borrador.', 'no_enviada');
  return true;
}

// Forum answers. Sent once, never retried, like a message.

/** The longest answer taken here: the campus has no limit of its own for a post, this one keeps it a post. */
export const LARGO_FORO = 20_000;
const LARGO_ASUNTO = 255;
const escaparHtml = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** What the student wrote, as the HTML of a post: everything escaped, a blank line starts a paragraph and a line break
 * stays one. Nothing of what was written becomes a tag. */
export function textoAHtml(texto) {
  return String(texto ?? '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)
    .map((parrafo) => parrafo.trim()).filter(Boolean)
    .map((parrafo) => `<p>${parrafo.split('\n').map(escaparHtml).join('<br>')}</p>`).join('');
}

function errorDeForo(codigo) {
  if (codigo === 'nopostforum' || codigo === 'cannotreply') return new ErrorCampus('El campus no te deja responder en esta discusión.', 'no_responde');
  if (codigo === 'discussionlocked') return new ErrorCampus('Esta discusión está cerrada.', 'cerrada');
  return errorDeAcceso(codigo);
}

/** What the campus answered to an answer in a forum: { id } of the new post, or an error in words. */
export function leerPublicado(datos) {
  if (datos?.exception) throw errorDeForo(datos.errorcode);
  if (!numero(datos?.postid)) throw new ErrorCampus('El campus no confirmó la respuesta.', 'sin_confirmar');
  return { id: datos.postid };
}

/** Answers a post of a discussion: sends RESPONDER_EN_FORO with the text as HTML and the subject the campus puts. */
export async function responderEnForo(token, postId, asunto, texto) {
  const valido = typeof texto === 'string' && texto.trim() !== '' && texto.length <= LARGO_FORO;
  if (!numero(postId) || !valido || typeof asunto !== 'string' || !asunto.trim()) throw new ErrorCampus('No pudimos publicarla. Probá de nuevo.', 'datos_invalidos');
  return leerPublicado(await enviar(ESCRITURA, token, RESPONDER_EN_FORO, {
    postid: String(postId),
    subject: asunto.trim().slice(0, LARGO_ASUNTO),
    message: textoAHtml(texto),
    messageformat: '1',
  }));
}
