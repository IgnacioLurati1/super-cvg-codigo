import { describe, expect, it } from 'vitest';
import { tituloLimpio } from './datos';
import {
  autorDe, cuantasSinVer, cuerpoLimpio, destinoDe, esNueva, haceCuanto, limpiarNotificacion, limpiarNotificaciones, LARGO_CUERPO,
  materiaDeNotificacion, momentoDe, porDia, vistoHasta,
} from './notificaciones';

const CAMPUS = 'https://frro.cvg.utn.edu.ar';
const MATERIAS = [
  { id: 41, nombre: 'Algoritmos y Estructuras de Datos', corto: 'ISI-AED-2026' },
  { id: 42, nombre: 'Paradigmas de Programación', corto: 'ISI-PDP-2026' },
  { id: 43, nombre: 'Física II', corto: 'FIS2' },
];
// 4 de noviembre de 2026, 10:12, hora de Argentina.
const CUANDO = Math.floor(new Date(2026, 10, 4, 10, 12).getTime() / 1000);

// As message_popup_get_popup_notifications sends them in Moodle 4.x, with the Spanish strings of the campus.
const aviso = (extra) => ({
  id: 9001, useridfrom: 3, useridto: 5, subject: 'Aviso', shortenedsubject: 'Aviso', text: '', fullmessage: '', fullmessageformat: 2,
  fullmessagehtml: '', smallmessage: '', contexturl: null, contexturlname: null, timecreated: CUANDO, timecreatedpretty: 'hace 1 día',
  timeread: null, read: false, deleted: false, iconurl: `${CAMPUS}/theme/image.php/boost/core/1/i/marker`, component: 'moodle', eventtype: 'notices',
  customdata: '{}', ...extra,
});

// A post of a forum, with the plain mail of Moodle: breadcrumb, lines, who wrote it and the footer of links.
const FORO_TEXTO = [
  'ISI-AED-2026 -> Foros -> Avisos -> Cambio de horario de consulta',
  '-----------------------------------------------------------------------',
  'Cambio de horario de consulta',
  'por Ana Ejemplo - martes, 4 de noviembre de 2026, 10:12',
  '-----------------------------------------------------------------------',
  'Hola a todos,',
  '',
  'La consulta del jueves pasa a las 18 en el aula 302. Traigan el TP 3 impreso.',
  '',
  'Saludos,',
  'Ana',
  '',
  '-----------------------------------------------------------------------',
  'Ver el mensaje en su contexto:',
  `${CAMPUS}/mod/forum/discuss.php?d=812#p2044`,
  '',
  `Darse de baja de este foro: ${CAMPUS}/mod/forum/subscribe.php?id=77`,
  `Darse de baja de esta discusión: ${CAMPUS}/mod/forum/subscribe.php?id=77&d=812`,
  `Cambiar sus preferencias de resumen del foro: ${CAMPUS}/mod/forum/index.php?id=1`,
].join('\n');
const FORO = aviso({
  id: 9101,
  subject: 'ISI-AED-2026: Cambio de horario de consulta',
  fullmessage: FORO_TEXTO,
  smallmessage: 'Ana Ejemplo publicó en Avisos: ISI-AED-2026: Avisos: Cambio de horario de consulta',
  contexturl: `${CAMPUS}/mod/forum/discuss.php?d=812#p2044`,
  contexturlname: 'Cambio de horario de consulta',
  component: 'mod_forum',
  eventtype: 'posts',
  customdata: '{"cmid":"4410","instance":"77","discussionid":"812","postid":"2044"}',
});
// The same post with the HTML mail: the same footer, as links.
const FORO_HTML = aviso({
  ...FORO,
  fullmessagehtml: '<div class="navbar"><a href="https://frro.cvg.utn.edu.ar/course/view.php?id=41">ISI-AED-2026</a> &raquo; <a href="#">Foros</a> &raquo; <a href="#">Avisos</a> &raquo; <a href="#">Cambio de horario de consulta</a></div>'
    + '<table><tr><td><div class="subject">Cambio de horario de consulta</div><div class="author">por <a href="https://frro.cvg.utn.edu.ar/user/view.php?id=3">Ana Ejemplo</a> - martes, 4 de noviembre de 2026, 10:12</div></td></tr>'
    + '<tr><td><p>Hola a todos,</p><p>La consulta del jueves pasa a las 18 en el <b>aula 302</b>. Traigan el TP 3 impreso.</p><p>Saludos,<br>Ana</p>'
    + '<div class="link"><a href="https://frro.cvg.utn.edu.ar/mod/forum/post.php?reply=2044">Responder</a></div>'
    + '<div class="link"><a href="https://frro.cvg.utn.edu.ar/mod/forum/discuss.php?d=812#p2044">Ver el mensaje en su contexto</a></div></td></tr></table>'
    + '<hr><div class="mdl-align unsubscribelink"><a href="https://frro.cvg.utn.edu.ar/mod/forum/subscribe.php?id=77">Darse de baja de este foro</a>&nbsp;<a href="https://frro.cvg.utn.edu.ar/mod/forum/subscribe.php?id=77&d=812">Darse de baja de esta discusión</a>&nbsp;<a href="https://frro.cvg.utn.edu.ar/mod/forum/index.php?id=1">Cambiar sus preferencias de resumen del foro</a></div>',
});

// A teacher gave feedback on a task: subject, plain mail and data as mod_assign sends them.
const DEVOLUCION = aviso({
  id: 9102,
  subject: 'Ana Ejemplo ha dado retroalimentación para la tarea TP 3 - Listas enlazadas',
  fullmessage: [
    'ISI-AED-2026 -> Tarea -> TP 3 - Listas enlazadas',
    '---------------------------------------------------------------------',
    "Ana Ejemplo ha publicado comentarios de retroalimentación en su tarea entregada para 'TP 3 - Listas enlazadas'",
    '',
    'Puede verlos añadidos a su tarea enviada:',
    '',
    `    ${CAMPUS}/mod/assign/view.php?id=4415`,
    '',
    '---------------------------------------------------------------------',
  ].join('\n'),
  contexturl: `${CAMPUS}/mod/assign/view.php?id=4415`,
  contexturlname: 'TP 3 - Listas enlazadas',
  component: 'mod_assign',
  eventtype: 'assign_notification',
  customdata: '{"cmid":4415,"instance":90,"messagetype":"feedbackavailable","blindmarking":false,"uniqueidforuser":0}',
});

// A campus date, the way this campus words it (see tituloLimpio in datos.test.js).
const ABRE = aviso({
  id: 9103,
  subject: 'Abre en sábado, 24 de octubre de 2026, 09:00: 2026- Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio',
  fullmessagehtml: '<p>Hola Ejemplo,</p><p>La actividad <b>Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio</b> abre el sábado, 24 de octubre de 2026, 09:00.</p>'
    + '<p><a href="https://frro.cvg.utn.edu.ar/mod/quiz/view.php?id=4430">Ir a la actividad</a></p>'
    + '<p>Este es un mensaje enviado automáticamente desde el Campus Virtual Global. Por favor, no respondas este correo.</p>'
    + '<p>Para dejar de recibir estos avisos, cambiá tus preferencias de notificación.</p>',
  contexturl: `${CAMPUS}/mod/quiz/view.php?id=4430`,
  customdata: '{"courseid":"42"}',
});

describe('tituloLimpio, con lo que agregan las notificaciones', () => {
  it('saca la palabra que la notificación pone antes de un «:»', () => {
    expect(tituloLimpio('Recordatorio: TP 4 - Árboles')).toBe('TP 4 - Árboles');
    expect(tituloLimpio('Vencida: TP 3')).toBe('TP 3');
    expect(tituloLimpio('Vence pronto: Parcial 1')).toBe('Parcial 1');
    expect(tituloLimpio('Fecha límite de entrega: TP 5')).toBe('TP 5');
  });

  it('y lo que pone atrás', () => {
    expect(tituloLimpio('TP 3 ya venció')).toBe('TP 3');
    // After «que», it is part of the name.
    expect(tituloLimpio('Entrega que venció')).toBe('Entrega que venció');
    expect(tituloLimpio('Foro que se cierra')).toBe('Foro que se cierra');
    expect(tituloLimpio('TP que ya venció')).toBe('TP que ya venció');
    expect(tituloLimpio('Parcial 1 cierra mañana')).toBe('Parcial 1');
    expect(tituloLimpio('TP 2 está vencida.')).toBe('TP 2');
    expect(tituloLimpio('Cuestionario 4 abre hoy')).toBe('Cuestionario 4');
  });

  it('sin el «:» deja la frase como está', () => {
    for (const titulo of ['Recordatorio del parcial', 'Vencidas las inscripciones a mesa', 'Próximo a vencer el plazo']) expect(tituloLimpio(titulo)).toBe(titulo);
  });
});

describe('limpiarNotificacion', () => {
  it('una fecha imposible queda en 0 y no rompe la campana al escribirla', () => {
    for (const raro of [9e15, -5, 4_102_444_800]) expect(limpiarNotificacion(aviso({ timecreated: raro }), MATERIAS).cuando).toBe(0);
  });

  it('un mensaje de un foro: el tema, el texto sin el pie del mail, quién lo escribió y su materia', () => {
    for (const n of [FORO, FORO_HTML]) {
      const limpia = limpiarNotificacion(n, MATERIAS);
      expect(limpia).toMatchObject({
        tipo: 'foro',
        titulo: 'Cambio de horario de consulta',
        cuerpo: 'La consulta del jueves pasa a las 18 en el aula 302. Traigan el TP 3 impreso.',
        autor: 'Ana Ejemplo',
        materia: { id: 41, nombre: 'Algoritmos y Estructuras de Datos' },
        leida: false,
        ruta: '/mensajes/foros/812',
        campus: `${CAMPUS}/mod/forum/discuss.php?d=812#p2044`,
      });
      expect(limpia.cuerpo).not.toMatch(/https?:|baja|contexto|preferencias|->|Foros|Hola/);
    }
  });

  it('una devolución: el nombre de la tarea, quién la dejó y la tarea en Super CVG', () => {
    expect(limpiarNotificacion(DEVOLUCION, MATERIAS)).toMatchObject({
      tipo: 'devolucion',
      titulo: 'TP 3 - Listas enlazadas',
      cuerpo: 'Ana Ejemplo te dejó una devolución.',
      materia: { id: 41 },
      ruta: '/materias/41/tareas/4415',
    });
    // Without what comes with it, by the words of the subject.
    const sola = limpiarNotificacion(aviso({ subject: DEVOLUCION.subject, fullmessage: DEVOLUCION.fullmessage, contexturl: DEVOLUCION.contexturl }), MATERIAS);
    expect(sola).toMatchObject({ tipo: 'devolucion', titulo: 'TP 3 - Listas enlazadas', cuerpo: 'Ana Ejemplo te dejó una devolución.', ruta: '/materias/41/tareas/4415' });
    // A course that isn't found: the task opens in the campus.
    const sinMateria = limpiarNotificacion({ ...DEVOLUCION, fullmessage: '' }, MATERIAS);
    expect(sinMateria).toMatchObject({ materia: null, ruta: null, campus: `${CAMPUS}/mod/assign/view.php?id=4415` });
  });

  it('el recibo de una entrega y la confirmación de un cuestionario, en dos palabras', () => {
    const entrega = aviso({ subject: 'Ha enviado su entrega de tarea para TP 3 - Listas enlazadas', contexturl: `${CAMPUS}/mod/assign/view.php?id=4415`, customdata: '{"courseid":41,"cmid":4415,"messagetype":"submissionreceipt"}' });
    expect(limpiarNotificacion(entrega, MATERIAS)).toMatchObject({ tipo: 'entrega', titulo: 'TP 3 - Listas enlazadas', cuerpo: 'Tu entrega llegó al campus.', ruta: '/materias/41/tareas/4415' });

    const cuestionario = aviso({
      subject: 'Confirmación de envío del cuestionario: Cuestionario Unidad 2',
      fullmessage: "Hola Ejemplo,\n\nGracias por enviar sus respuestas a 'Cuestionario Unidad 2' en el curso 'Algoritmos y Estructuras de Datos' a las martes, 4 de noviembre de 2026, 21:40.\n\nEste mensaje confirma que hemos recibido de forma segura sus respuestas.\n\nPuede acceder a este cuestionario en https://frro.cvg.utn.edu.ar/mod/quiz/view.php?id=4420.",
      contexturl: `${CAMPUS}/mod/quiz/view.php?id=4420`,
      contexturlname: 'Cuestionario Unidad 2',
      component: 'mod_quiz',
      eventtype: 'confirmation',
    });
    expect(limpiarNotificacion(cuestionario, MATERIAS)).toMatchObject({
      tipo: 'cuestionario', titulo: 'Cuestionario Unidad 2', cuerpo: 'Tus respuestas llegaron al campus.', materia: { id: 41 }, ruta: null, campus: `${CAMPUS}/mod/quiz/view.php?id=4420`,
    });
    expect(limpiarNotificacion(aviso({ subject: 'Intento ahora vencido: Parcial 1', component: 'mod_quiz', eventtype: 'attempt_overdue' }), MATERIAS)).toMatchObject({ tipo: 'intento', titulo: 'Parcial 1', cuerpo: 'Se terminó el tiempo y tu intento quedó sin enviar.' });
  });

  it('contenido nuevo o cambiado en una materia: el nombre de lo que subieron, y la materia en Super CVG', () => {
    const nuevo = aviso({
      subject: 'Paradigmas de Programación nuevo contenido',
      fullmessagehtml: '<p>Archivo <a href="https://frro.cvg.utn.edu.ar/mod/resource/view.php?id=5120">Apunte Unidad 4 - Haskell</a> es nuevo en el curso <a href="https://frro.cvg.utn.edu.ar/course/view.php?id=42">Paradigmas de Programación</a>.</p><p><a href="https://frro.cvg.utn.edu.ar/message/notificationpreferences.php">Cambie sus preferencias de notificación</a></p>',
      contexturl: `${CAMPUS}/mod/resource/view.php?id=5120`,
      contexturlname: 'Apunte Unidad 4 - Haskell',
      eventtype: 'coursecontentupdated',
    });
    expect(limpiarNotificacion(nuevo, MATERIAS)).toMatchObject({ tipo: 'contenido', titulo: 'Apunte Unidad 4 - Haskell', cuerpo: 'Nuevo en la materia.', materia: { id: 42 }, ruta: '/materias/42' });
    const cambiado = { ...nuevo, subject: 'Paradigmas de Programación contenido cambiado', fullmessagehtml: '<p>Archivo Apunte Unidad 4 - Haskell ha sido modificado en el curso Paradigmas de Programación.</p>' };
    expect(limpiarNotificacion(cambiado, MATERIAS)).toMatchObject({ titulo: 'Apunte Unidad 4 - Haskell', cuerpo: 'Cambió en la materia.' });
  });

  it('una fecha del campus: el nombre limpio y, en el texto, qué pasa y cuándo, sin el pie ni «Ir a la actividad»', () => {
    expect(limpiarNotificacion(ABRE, MATERIAS)).toMatchObject({
      tipo: 'fecha',
      titulo: 'Evaluación Nro. 2 de Regularidad (SQL) - Recuperatorio',
      cuerpo: 'Abre el sábado 24 de octubre, 09:00.',
      materia: { id: 42 },
      campus: `${CAMPUS}/mod/quiz/view.php?id=4430`,
    });
    const cierra = aviso({ subject: 'Se cierra en martes, 10 de noviembre de 2026, 23:59: TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI' });
    expect(limpiarNotificacion(cierra, MATERIAS)).toMatchObject({ titulo: 'TP UNIDAD 8 - CONTRATOS ADMINISTRATIVOS - COM 403 ISI', cuerpo: 'Cierra el martes 10 de noviembre, 23:59.' });
  });

  it('un recordatorio con todo el ruido de un mail: queda la frase que dice algo', () => {
    const recordatorio = aviso({
      subject: 'Recordatorio: TP 4 - Árboles',
      fullmessagehtml: '<p>Hola Ejemplo,</p><p>La entrega <strong>TP 4 - Árboles</strong> vence el viernes 13 de noviembre a las 23:59.</p>'
        + '<p><a href="https://frro.cvg.utn.edu.ar/mod/assign/view.php?id=4416">Ir a la actividad</a></p><hr>'
        + '<p>Este es un mensaje enviado automáticamente por el Campus Virtual Global de la UTN FRRO. Por favor, no lo respondas.</p>'
        + '<p>Para dejar de recibir estos avisos, cambiá tus preferencias de notificación en https://frro.cvg.utn.edu.ar/message/notificationpreferences.php</p>',
      contexturl: `${CAMPUS}/mod/assign/view.php?id=4416`,
      customdata: '{"courseid":"41"}',
    });
    expect(limpiarNotificacion(recordatorio, MATERIAS)).toMatchObject({
      titulo: 'TP 4 - Árboles',
      cuerpo: 'La entrega TP 4 - Árboles vence el viernes 13 de noviembre a las 23:59.',
      ruta: '/materias/41/tareas/4416',
    });
  });

  it('un resumen de los foros, sin el preámbulo ni los encabezados de cada foro', () => {
    const resumen = aviso({
      subject: 'CVG FRRO: resumen del foro',
      fullmessage: [
        `Este es su resumen diario de los mensajes nuevos de los foros de Campus Virtual Global. Para cambiar sus preferencias de correo predeterminadas, vaya a ${CAMPUS}/user/forum.php?id=5.`,
        '',
        '-----------------------------------------------------------------------',
        'Curso: ISI-AED-2026 -> Avisos',
        `${CAMPUS}/mod/forum/view.php?f=77`,
        'Cambio de horario de consulta',
        'por Ana Ejemplo - martes, 4 de noviembre de 2026, 10:12',
        '-----------------------------------------------------------------------',
        'La consulta del jueves pasa a las 18 en el aula 302.',
        '',
        `Ver este mensaje en su contexto: ${CAMPUS}/mod/forum/discuss.php?d=812#p2044`,
      ].join('\n'),
      component: 'mod_forum',
      eventtype: 'digests',
    });
    const limpia = limpiarNotificacion(resumen, MATERIAS);
    expect(limpia).toMatchObject({ tipo: 'resumen', titulo: 'Resumen de los foros', cuerpo: 'Cambio de horario de consulta. La consulta del jueves pasa a las 18 en el aula 302.' });
  });

  it('saca la materia repetida antes o después del título, y el «Re:» de una respuesta', () => {
    const conId = (subject) => limpiarNotificacion(aviso({ subject, customdata: '{"courseid":"41"}' }), MATERIAS).titulo;
    expect(conId('Algoritmos y Estructuras de Datos - Clase suspendida')).toBe('Clase suspendida');
    expect(conId('Clase suspendida (Algoritmos y Estructuras de Datos)')).toBe('Clase suspendida');
    expect(limpiarNotificacion(aviso({ subject: 'ISI-AED-2026: Re: Re: Consulta sobre el TP 3', component: 'mod_forum' }), MATERIAS)).toMatchObject({ titulo: 'Consulta sobre el TP 3', materia: { id: 41 } });
    // A name that only looks like the course stays.
    expect(conId('Algoritmos y Estructuras de Datos')).toBe('Algoritmos y Estructuras de Datos');
  });

  it('lleva a Notas, a Mensajes o a la materia cuando el campus apunta ahí', () => {
    const a = (contexturl, extra) => limpiarNotificacion(aviso({ contexturl, ...extra }), MATERIAS);
    expect(a(`${CAMPUS}/grade/report/user/index.php?id=43`)).toMatchObject({ ruta: null });
    expect(a(`${CAMPUS}/mod/quiz/review.php?attempt=77`, { component: 'mod_quiz', eventtype: 'attempt_grading_complete' })).toMatchObject({ ruta: null });
    expect(a(`${CAMPUS}/message/index.php?view=contactrequests`, { subject: 'Laura Méndez quiere agregarte como contacto' })).toMatchObject({ ruta: '/mensajes', titulo: 'Laura Méndez quiere agregarte como contacto' });
    expect(a(`${CAMPUS}/course/view.php?id=43`, { subject: 'Completaste el curso' })).toMatchObject({ ruta: '/materias/43', materia: { id: 43, nombre: 'Física II' } });
    // A course that isn't the student's (1 is the front page of the campus) is no course.
    expect(a(`${CAMPUS}/course/view.php?id=1`)).toMatchObject({ ruta: null, materia: null, campus: `${CAMPUS}/course/view.php?id=1` });
    // A forum post opens its discussion in Foros.
    expect(a(`${CAMPUS}/mod/forum/discuss.php?d=12#p44`)).toMatchObject({ ruta: '/mensajes/foros/12', campus: `${CAMPUS}/mod/forum/discuss.php?d=12#p44` });
    expect(a(`${CAMPUS}/mod/forum/discuss.php?d=x`)).toMatchObject({ ruta: null });
  });

  it('nada fuera del campus ni que pueda correr: el HTML queda como texto y un link raro, afuera', () => {
    const rara = limpiarNotificacion(aviso({
      subject: '<img src=x onerror="alert(1)"><b>Aviso</b> importante',
      fullmessagehtml: '<script>alert(1)</script><p>Texto <a href="javascript:alert(1)">acá</a></p>',
      contexturl: 'javascript:alert(1)',
    }), MATERIAS);
    expect(rara).toMatchObject({ titulo: 'Aviso importante', cuerpo: 'Texto acá', ruta: null, campus: null });
    expect(limpiarNotificacion(aviso({ contexturl: 'https://otro.example/frro.cvg.utn.edu.ar/mod/assign/view.php?id=1' }), MATERIAS)).toMatchObject({ ruta: null, campus: null });
    // The key never travels in what the bell links to.
    expect(destinoDe(aviso({ contexturl: `${CAMPUS}/mod/forum/discuss.php?d=1&token=secreta` }), null).campus).toBe(`${CAMPUS}/mod/forum/discuss.php?d=1`);
  });

  it('nunca deja el título vacío y corta un texto largo en una palabra', () => {
    expect(limpiarNotificacion(aviso({ subject: '' }), MATERIAS).titulo).toBe('Notificación del campus');
    expect(limpiarNotificacion(aviso({ subject: 'Se cierra' }), MATERIAS).titulo).toBe('Se cierra');
    const largo = limpiarNotificacion(aviso({ subject: 'Programa', fullmessage: 'palabra '.repeat(80) }), MATERIAS).cuerpo;
    expect(largo.length).toBeLessThanOrEqual(LARGO_CUERPO + 1);
    expect(largo).toMatch(/palabra…$/);
  });

  it('leída en el campus si lo dice read o timeread', () => {
    expect(limpiarNotificacion(aviso({ read: true }), MATERIAS).leida).toBe(true);
    expect(limpiarNotificacion(aviso({ timeread: CUANDO + 60 }), MATERIAS).leida).toBe(true);
    expect(limpiarNotificacion(aviso({}), MATERIAS).leida).toBe(false);
  });
});

describe('cuerpoLimpio', () => {
  it('sin título repetido, sin «Puede verlos…:» ni la dirección que presentaba', () => {
    expect(cuerpoLimpio(aviso({ fullmessage: 'TP 3\nLa nota ya está.\nPodés verla en:\nhttps://frro.cvg.utn.edu.ar/grade/report/user/index.php?id=41' }), { titulo: 'TP 3' })).toBe('La nota ya está.');
    expect(cuerpoLimpio(aviso({ fullmessage: 'Más info en: https://frro.cvg.utn.edu.ar/mod/page/view.php?id=3\nTraigan calculadora.' }), {})).toBe('Traigan calculadora.');
  });

  it('el contenido de un mensaje queda, aunque tenga palabras del pie', () => {
    const texto = 'Hola a todos, mañana no hay clase.\np -> q es lo que vimos.\nVer el apunte de la unidad 3 antes del jueves.';
    expect(cuerpoLimpio(aviso({ fullmessage: texto }), {})).toBe('Hola a todos, mañana no hay clase. p -> q es lo que vimos. Ver el apunte de la unidad 3 antes del jueves.');
  });

  it('una oración que el mail cortó en dos renglones sigue siendo una', () => {
    const texto = 'La consulta del jueves pasa a las 18 en el aula 302 y traigan el\nTP 3 impreso.';
    expect(cuerpoLimpio(aviso({ fullmessage: texto }), {})).toBe('La consulta del jueves pasa a las 18 en el aula 302 y traigan el TP 3 impreso.');
  });

  it('sin el saludo de despedida ni la miga de un paso que arranca con la materia', () => {
    const fisica = MATERIAS[2];
    const texto = 'Física II -> Calificaciones\n\nAna Ejemplo actualizó tu calificación en Parcial 1.\n\nSaludos cordiales, Ana\n\nPodés verla en https://frro.cvg.utn.edu.ar/grade/report/user/index.php?id=43';
    expect(cuerpoLimpio(aviso({ fullmessage: texto }), { materia: fisica })).toBe('Ana Ejemplo actualizó tu calificación en Parcial 1.');
    expect(cuerpoLimpio(aviso({ fullmessagehtml: '<p>Hola a todos,</p><p>La consulta pasa al aula 204.</p><p>Saludos</p>' }), {})).toBe('La consulta pasa al aula 204.');
    // A sentence that starts like a goodbye stays.
    expect(cuerpoLimpio(aviso({ fullmessage: 'Saludos a todos los que vinieron al parcial del sábado.' }), {})).toBe('Saludos a todos los que vinieron al parcial del sábado.');
  });

  it('vacío cuando solo había ruido', () => {
    expect(cuerpoLimpio(aviso({ fullmessagehtml: '<p>Hola Ejemplo,</p><p><a href="https://frro.cvg.utn.edu.ar/mod/assign/view.php?id=1">Ir a la tarea</a></p><p>Este es un mensaje automático.</p>' }), {})).toBe('');
  });
});

describe('materiaDeNotificacion', () => {
  it('por el número que manda el campus, por su dirección o por su nombre corto en el asunto', () => {
    expect(materiaDeNotificacion(aviso({ customdata: '{"courseid":"43"}' }), MATERIAS)?.id).toBe(43);
    expect(materiaDeNotificacion(aviso({ contexturl: `${CAMPUS}/course/view.php?id=42` }), MATERIAS)?.id).toBe(42);
    expect(materiaDeNotificacion(aviso({ subject: 'FIS2: Parcial corrido' }), MATERIAS)?.id).toBe(43);
    expect(materiaDeNotificacion(aviso({ customdata: '{roto' }), MATERIAS)).toBeNull();
    expect(materiaDeNotificacion(aviso({ subject: 'Física II en el aula magna' }), MATERIAS)).toBeNull();
  });
});

describe('autorDe y momentoDe', () => {
  it('quién escribió un mensaje de foro', () => {
    expect(autorDe(FORO)).toBe('Ana Ejemplo');
    expect(autorDe(aviso({ fullmessage: 'Sin firma' }))).toBe('');
  });

  it('qué pasa y cuándo, con el año solo si es otro', () => {
    expect(momentoDe('Abre en sábado, 24 de octubre de 2026, 09:00: Parcial', CUANDO)).toBe('Abre el sábado 24 de octubre, 09:00.');
    expect(momentoDe('Vence el 12/11/2026, 23:59 hs: TP 4', CUANDO)).toBe('Vence el 12/11/2026, 23:59.');
    expect(momentoDe('Cierra en lunes, 4 de enero de 2027, 10:00: Final', CUANDO)).toBe('Cierra el lunes 4 de enero de 2027, 10:00.');
    expect(momentoDe('Abre en breve: inscripciones', CUANDO)).toBe('');
  });
});

describe('lo nuevo y el número de la campana', () => {
  const lista = limpiarNotificaciones([
    aviso({ id: 1, timecreated: 100 }),
    aviso({ id: 2, timecreated: 300 }),
    aviso({ id: 3, timecreated: 200, read: true }),
    aviso({ id: 4, timecreated: 400, deleted: true }),
  ], MATERIAS);

  it('lo más nuevo primero, sin lo borrado, y con claves distintas aunque el campus repita el número', () => {
    expect(lista.map((n) => n.id)).toEqual([2, 3, 1]);
    const repetidas = limpiarNotificaciones([aviso({ id: 7 }), aviso({ id: 7 })], MATERIAS);
    expect(new Set(repetidas.map((n) => n.clave)).size).toBe(2);
    expect(limpiarNotificaciones(null, MATERIAS)).toEqual([]);
  });

  it('nueva: sin leer en el campus y después de la última vez que abrió la campana', () => {
    expect(lista.filter((n) => esNueva(n, 150)).map((n) => n.id)).toEqual([2]);
    expect(lista.filter((n) => esNueva(n, 0)).map((n) => n.id)).toEqual([2, 1]);
  });

  it('el número: el del campus si nunca la abrió, las nuevas después, y nada sin pendientes', () => {
    expect(cuantasSinVer(lista, 0, 37)).toBe(37);
    expect(cuantasSinVer(lista, 150, 2)).toBe(1);
    expect(cuantasSinVer(lista, 300, 2)).toBe(0);
    expect(cuantasSinVer(lista, 0, 0)).toBe(0);
    expect(cuantasSinVer(null, 150, 2)).toBe(0);
  });

  it('las que sacó no cuentan, nuevas o sin leer desde siempre', () => {
    expect(cuantasSinVer(lista, 150, 2, new Set([2]))).toBe(0);
    expect(cuantasSinVer(lista, 0, 37, new Set([1]))).toBe(36);
    expect(cuantasSinVer(lista, 0, 37, new Set([3]))).toBe(37);
    expect(cuantasSinVer(lista, 0, 1, new Set([1, 2]))).toBe(0);
  });

  it('abrirla deja vista hasta la más nueva, y nunca vuelve atrás', () => {
    expect(vistoHasta(lista, 0)).toBe(300);
    expect(vistoHasta(lista, 500)).toBe(500);
    expect(vistoHasta([], 0)).toBe(0);
  });
});

describe('haceCuanto y porDia', () => {
  const ahora = new Date(2026, 10, 8, 15, 0).getTime();
  const s = (d) => Math.floor(d.getTime() / 1000);

  it('hoy, cuánto hace; otro día, la hora', () => {
    expect(haceCuanto(s(new Date(2026, 10, 8, 14, 59, 30)), ahora)).toBe('recién');
    expect(haceCuanto(s(new Date(2026, 10, 8, 14, 40)), ahora)).toBe('hace 20 min');
    expect(haceCuanto(s(new Date(2026, 10, 8, 9, 0)), ahora)).toBe('hace 6 h');
    expect(haceCuanto(s(new Date(2026, 10, 7, 18, 20)), ahora)).toBe('18:20');
  });

  it('agrupa por día, lo más nuevo arriba, con Hoy, Ayer y la fecha', () => {
    const lista = [
      { cuando: s(new Date(2026, 10, 7, 9, 0)) },
      { cuando: s(new Date(2026, 10, 8, 10, 0)) },
      { cuando: s(new Date(2026, 10, 4, 10, 12)) },
      { cuando: s(new Date(2026, 10, 7, 18, 0)) },
    ];
    expect(porDia(lista, ahora).map((d) => [d.titulo, d.items.length])).toEqual([['Hoy', 1], ['Ayer', 2], ['Miércoles, 4 de noviembre', 1]]);
  });
});
