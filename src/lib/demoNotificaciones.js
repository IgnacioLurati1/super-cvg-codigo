// Sample notifications for the bell, only in development (/?demo=1). Shaped like what message_popup_get_popup_notifications
// sends in Moodle 4.x, with the noise of the campus mails on purpose (footers, breadcrumbs, addresses, «Ir a la
// actividad»), so the cleaning of notificaciones.js can be seen. Names and courses read as examples.
import { CAMPUS } from './moodle';

const MINUTO = 60;
const HORA = 3600;
const DIA = 86_400;
const ahora = () => Math.floor(Date.now() / 1000);
const FECHA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// «sábado, 14 de noviembre de 2026, 09:00», as Moodle writes a date.
const fechaMoodle = (segundos) => FECHA.format(new Date(segundos * 1000));

const PIE = '<hr><p>Este es un mensaje enviado automáticamente desde el Campus Virtual Global. Por favor, no respondas este correo.</p>'
  + `<p>Para dejar de recibir estos avisos, cambiá tus preferencias de notificación en ${CAMPUS}/message/notificationpreferences.php</p>`;

const notificacion = (id, hace, leida, datos) => ({
  id,
  useridfrom: 21,
  useridto: 1,
  subject: '',
  shortenedsubject: '',
  text: '',
  fullmessage: '',
  fullmessageformat: 2,
  fullmessagehtml: '',
  smallmessage: '',
  contexturl: null,
  contexturlname: null,
  timecreated: ahora() - hace,
  timecreatedpretty: '',
  timeread: leida ? ahora() - hace + HORA : null,
  read: leida,
  deleted: false,
  iconurl: `${CAMPUS}/theme/image.php/boost/core/1/i/marker`,
  component: 'moodle',
  eventtype: 'notices',
  customdata: '{}',
  ...datos,
});

const lista = () => {
  const abre = ahora() + 6 * DIA;
  return [
    notificacion(901, 25 * MINUTO, false, {
      subject: 'Materia de ejemplo A: Cambio de horario de consulta',
      fullmessagehtml: `<div class="navbar"><a href="${CAMPUS}/course/view.php?id=1">Materia de ejemplo A</a> &raquo; <a href="${CAMPUS}/mod/forum/index.php?id=1">Foros</a> &raquo; Avisos &raquo; Cambio de horario de consulta</div>`
        + `<div class="subject">Cambio de horario de consulta</div><div class="author">por Docente de ejemplo - ${fechaMoodle(ahora() - 25 * MINUTO)}</div>`
        + '<p>Hola a todos,</p><p>La consulta del jueves pasa a las 18 en el aula de ejemplo. Traigan el TP impreso.</p><p>Saludos</p>'
        + `<p><a href="${CAMPUS}/mod/forum/post.php?reply=44">Responder</a></p><p><a href="${CAMPUS}/mod/forum/discuss.php?d=12#p44">Ver el mensaje en su contexto</a></p>`
        + `<hr><p><a href="${CAMPUS}/mod/forum/subscribe.php?id=7">Darse de baja de este foro</a> <a href="${CAMPUS}/mod/forum/subscribe.php?id=7&d=12">Darse de baja de esta discusión</a></p>`,
      contexturl: `${CAMPUS}/mod/forum/discuss.php?d=12#p44`,
      contexturlname: 'Cambio de horario de consulta',
      component: 'mod_forum',
      eventtype: 'posts',
      customdata: '{"cmid":"18","instance":"7","discussionid":"12","postid":"44"}',
    }),
    notificacion(902, 3 * HORA, false, {
      subject: 'Docente de ejemplo ha dado retroalimentación para la tarea TP 1 de ejemplo',
      fullmessage: `Materia de ejemplo A -> Tarea -> TP 1 de ejemplo\n---------------------------------------------------------------------\nDocente de ejemplo ha publicado comentarios de retroalimentación en su tarea entregada para 'TP 1 de ejemplo'\n\nPuede verlos añadidos a su tarea enviada:\n\n    ${CAMPUS}/mod/assign/view.php?id=17\n\n---------------------------------------------------------------------\n`,
      contexturl: `${CAMPUS}/mod/assign/view.php?id=17`,
      contexturlname: 'TP 1 de ejemplo',
      component: 'mod_assign',
      eventtype: 'assign_notification',
      customdata: '{"cmid":17,"instance":1017,"messagetype":"feedbackavailable","blindmarking":false,"uniqueidforuser":0}',
    }),
    notificacion(903, 20 * HORA, false, {
      subject: `Abre en ${fechaMoodle(abre)}: ${new Date().getFullYear()}- Cuestionario de ejemplo`,
      fullmessagehtml: `<p>Hola Ejemplo,</p><p>El cuestionario <b>Cuestionario de ejemplo</b> abre el ${fechaMoodle(abre)}.</p><p><a href="${CAMPUS}/mod/quiz/view.php?id=23">Ir a la actividad</a></p>${PIE}`,
      contexturl: `${CAMPUS}/mod/quiz/view.php?id=23`,
      customdata: '{"courseid":"2"}',
    }),
    notificacion(904, DIA + 2 * HORA, true, {
      subject: 'Materia de ejemplo B nuevo contenido',
      fullmessagehtml: `<p>Archivo <a href="${CAMPUS}/mod/resource/view.php?id=24">Guía de ejemplo 2</a> es nuevo en el curso <a href="${CAMPUS}/course/view.php?id=2">Materia de ejemplo B</a>.</p><p><a href="${CAMPUS}/message/notificationpreferences.php">Cambie sus preferencias de notificación</a></p>`,
      contexturl: `${CAMPUS}/mod/resource/view.php?id=24`,
      contexturlname: 'Guía de ejemplo 2',
      eventtype: 'coursecontentupdated',
    }),
    notificacion(905, 2 * DIA + 5 * HORA, true, {
      subject: 'Confirmación de envío del cuestionario: Cuestionario de ejemplo',
      fullmessage: `Hola Ejemplo,\n\nGracias por enviar sus respuestas a 'Cuestionario de ejemplo' en el curso 'Materia de ejemplo B'.\n\nEste mensaje confirma que hemos recibido de forma segura sus respuestas.\n\nPuede acceder a este cuestionario en ${CAMPUS}/mod/quiz/view.php?id=23.`,
      contexturl: `${CAMPUS}/mod/quiz/view.php?id=23`,
      contexturlname: 'Cuestionario de ejemplo',
      component: 'mod_quiz',
      eventtype: 'confirmation',
    }),
    notificacion(906, 4 * DIA, true, {
      subject: 'Recordatorio: Entrega de ejemplo próxima está en fecha de entrega',
      fullmessagehtml: `<p>Hola Ejemplo,</p><p>Falta poco para la <strong>Entrega de ejemplo próxima</strong>. Subí tu archivo antes de la fecha.</p><p><a href="${CAMPUS}/mod/assign/view.php?id=15">Ir a la tarea</a></p>${PIE}`,
      contexturl: `${CAMPUS}/mod/assign/view.php?id=15`,
      customdata: '{"courseid":"1"}',
    }),
    notificacion(907, 5 * DIA, true, {
      subject: 'CVG: resumen del foro',
      fullmessage: `Este es su resumen diario de los mensajes nuevos de los foros de Campus Virtual Global. Para cambiar sus preferencias de correo predeterminadas, vaya a ${CAMPUS}/user/forum.php?id=1.\n\n-----------------------------------------------------------------------\nCurso: Materia de ejemplo C -> Consultas\n${CAMPUS}/mod/forum/view.php?f=9\nDuda sobre el parcial de ejemplo\npor Alumno de ejemplo - ${fechaMoodle(ahora() - 5 * DIA - HORA)}\n-----------------------------------------------------------------------\n¿Entra la unidad 3 en el parcial?\n\nVer este mensaje en su contexto: ${CAMPUS}/mod/forum/discuss.php?d=30`,
      component: 'mod_forum',
      eventtype: 'digests',
    }),
    notificacion(908, 6 * DIA, true, {
      subject: 'Persona de ejemplo quiere agregarte como contacto',
      contexturl: `${CAMPUS}/message/index.php?view=contactrequests`,
      eventtype: 'messagecontactrequests',
    }),
  ];
};

export const DEMO_NOTIFICACIONES = {
  /** message_popup_get_popup_notifications, newest first. */
  lista: () => ({ notifications: lista(), unreadcount: lista().filter((n) => !n.read).length }),
  /** message_popup_get_unread_popup_notification_count. */
  sinLeer: () => lista().filter((n) => !n.read).length,
};
