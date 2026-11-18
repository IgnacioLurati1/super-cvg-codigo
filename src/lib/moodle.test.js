import { afterEach, describe, expect, it, vi } from 'vitest';
import { bajarArchivo, CAMPUS, enviarEntrega, ErrorCampus, ESCRITURA, guardarEntrega, inscribirse, LARGO_MAXIMO, largoEnBytes, LECTURA, llamar, mandarMensaje, marcarLeida, pedirClave, responderEnConversacion, subirArchivo } from './moodle';

const responder = (cuerpo, { status = 200, tipo = 'application/json' } = {}) =>
  vi.fn(async () => new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status, headers: { 'content-type': tipo } }));

afterEach(() => vi.unstubAllGlobals());

describe('llamar', () => {
  it('rejects anything outside the read list before any request', async () => {
    const pedido = responder({});
    vi.stubGlobal('fetch', pedido);
    for (const funcion of ['mod_assign_save_submission', 'core_message_send_instant_messages', 'core_user_update_users']) {
      await expect(llamar('k', funcion)).rejects.toThrow(/lista de lectura/);
    }
    expect(pedido).not.toHaveBeenCalled();
  });

  it('only lists functions that read', () => {
    // The course and people searches read too, but their names do not say so: they are let in by their exact names.
    const leeSinDecirlo = new Set(['core_course_search_courses', 'core_message_message_search_users']);
    for (const funcion of LECTURA) if (!leeSinDecirlo.has(funcion)) expect(funcion).toMatch(/_get_|_view_|site_info/);
  });

  it('never sends the enrolment, nor anything else that writes', async () => {
    const pedido = responder({ status: true, warnings: [] });
    vi.stubGlobal('fetch', pedido);
    for (const funcion of ['enrol_self_enrol_user', ...ESCRITURA]) await expect(llamar('k', funcion)).rejects.toThrow(/lista de lectura/);
    for (const funcion of ESCRITURA) expect(LECTURA.has(funcion)).toBe(false);
    expect(pedido).not.toHaveBeenCalled();
  });

  it('sends the key in the body and never in the URL', async () => {
    const pedido = responder({ ok: 1 });
    vi.stubGlobal('fetch', pedido);
    await llamar('secreta', 'core_webservice_get_site_info');
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).not.toContain('secreta');
    expect(opciones.method).toBe('POST');
    expect(opciones.body.get('wstoken')).toBe('secreta');
  });

  it('turns an expired key into a session error', async () => {
    vi.stubGlobal('fetch', responder({ exception: 'x', errorcode: 'invalidtoken', message: 'internal text' }));
    await expect(llamar('k', 'core_webservice_get_site_info')).rejects.toMatchObject({ codigo: 'sesion', message: 'Tu sesión venció. Volvé a entrar.' });
  });

  it('does not show the raw campus message', async () => {
    vi.stubGlobal('fetch', responder({ exception: 'x', errorcode: 'dbfail', message: 'SQL internal text' }));
    const error = await llamar('k', 'core_webservice_get_site_info').catch((e) => e);
    expect(error).toBeInstanceOf(ErrorCampus);
    expect(error.message).not.toContain('SQL');
  });

  it('reports a server failure without breaking on an HTML body', async () => {
    vi.stubGlobal('fetch', responder('<html>503</html>', { status: 503, tipo: 'text/html' }));
    await expect(llamar('k', 'core_webservice_get_site_info')).rejects.toMatchObject({ codigo: 'http_503' });
  });
});

describe('inscribirse', () => {
  const ok = () => responder({ status: true, warnings: [] });
  const aviso = (warningcode, message = 'campus text') => responder({ status: false, warnings: [{ item: 'instance', itemid: 7, warningcode, message }] });

  it('writes only through enrol_self_enrol_user, whatever else comes in', async () => {
    expect(ESCRITURA.has('enrol_self_enrol_user')).toBe(true);
    const pedido = ok();
    vi.stubGlobal('fetch', pedido);
    await inscribirse('k', 5, { instancia: 7, clave: 'x', wsfunction: 'core_user_update_users', courseid: 99, wstoken: 'otra' });
    const cuerpo = pedido.mock.calls[0][1].body;
    expect(Object.fromEntries(cuerpo)).toEqual({ courseid: '5', instanceid: '7', password: 'x', wstoken: 'k', wsfunction: 'enrol_self_enrol_user', moodlewsrestformat: 'json' });
  });

  it('sends the course key and the session key in the body, never in the URL', async () => {
    const pedido = ok();
    vi.stubGlobal('fetch', pedido);
    expect(await inscribirse('secreta', 5, { instancia: 7, clave: 'clave-del-curso' })).toBe(true);
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).toBe(`${CAMPUS}/webservice/rest/server.php`);
    expect(opciones.method).toBe('POST');
    expect(opciones.redirect).toBe('error');
    expect(opciones.body.get('password')).toBe('clave-del-curso');
    expect(opciones.body.get('wstoken')).toBe('secreta');
  });

  it('never retries, also when the connection or the campus fails', async () => {
    const cortado = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', cortado);
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toThrow(TypeError);
    expect(cortado).toHaveBeenCalledTimes(1);
    const caido = responder('<html>503</html>', { status: 503, tipo: 'text/html' });
    vi.stubGlobal('fetch', caido);
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toMatchObject({ codigo: 'http_503' });
    expect(caido).toHaveBeenCalledTimes(1);
  });

  it('refuses a course or an instance that is not a number, before any request', async () => {
    const pedido = ok();
    vi.stubGlobal('fetch', pedido);
    for (const [curso, instancia] of [['5', 7], [5, '7'], [0, 7], [5, undefined], [Number.NaN, 7], [5.5, 7]]) {
      await expect(inscribirse('k', curso, { instancia })).rejects.toBeInstanceOf(ErrorCampus);
    }
    expect(pedido).not.toHaveBeenCalled();
  });

  it('explains a wrong key without the campus message, which carries a hint of it', async () => {
    for (const codigo of ['2', '3', '4']) {
      vi.stubGlobal('fetch', aviso(codigo, 'La clave empieza con «q»'));
      const error = await inscribirse('k', 5, { instancia: 7, clave: 'mal' }).catch((e) => e);
      expect(error).toMatchObject({ codigo: 'clave_incorrecta', message: 'La clave no es esa. Revisala y probá de nuevo.' });
    }
  });

  it('says when the enrolment is closed or full', async () => {
    vi.stubGlobal('fetch', aviso('1'));
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toMatchObject({ codigo: 'inscripcion_cerrada', message: 'La inscripción a esta materia está cerrada o llena.' });
    vi.stubGlobal('fetch', responder({ status: false, warnings: [] }));
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toMatchObject({ codigo: 'no_inscripto' });
  });

  it('turns the campus exceptions into words', async () => {
    vi.stubGlobal('fetch', responder({ exception: 'moodle_exception', errorcode: 'canntenrol', message: 'internal' }));
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toMatchObject({ codigo: 'sin_inscripcion' });
    vi.stubGlobal('fetch', responder({ exception: 'x', errorcode: 'invalidtoken', message: 'internal' }));
    await expect(inscribirse('k', 5, { instancia: 7 })).rejects.toMatchObject({ codigo: 'sesion' });
  });
});

describe('pedirClave', () => {
  it('asks once and explains a wrong password', async () => {
    const pedido = responder({ error: 'internal text', errorcode: 'invalidlogin' });
    vi.stubGlobal('fetch', pedido);
    await expect(pedirClave('u', 'p')).rejects.toThrow('El usuario o la contraseña no coinciden.');
    expect(pedido).toHaveBeenCalledTimes(1);
  });

  it('sends the password only to the campus, in the body', async () => {
    const pedido = responder({ token: 't', privatetoken: 'x' });
    vi.stubGlobal('fetch', pedido);
    expect(await pedirClave('u', 'p4ss')).toBe('t');
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url).startsWith(`${CAMPUS}/`)).toBe(true);
    expect(String(url)).not.toContain('p4ss');
    expect(opciones.body.get('password')).toBe('p4ss');
  });

  it('says so when the campus closes this access', async () => {
    vi.stubGlobal('fetch', responder({ error: 'x', errorcode: 'enablewsdescription' }));
    await expect(pedirClave('u', 'p')).rejects.toThrow(/no permite este acceso/);
  });
});

describe('bajarArchivo', () => {
  const direccion = `${CAMPUS}/webservice/pluginfile.php/1/mod_resource/content/1/a.pdf?forcedownload=1&token=vieja`;

  it('moves the key to the body and strips it from the URL', async () => {
    const pedido = responder('pdf', { tipo: 'application/pdf' });
    vi.stubGlobal('fetch', pedido);
    await bajarArchivo('secreta', direccion);
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).not.toMatch(/token|secreta|vieja/);
    expect(String(url)).toContain('forcedownload=1');
    expect(opciones.body.get('token')).toBe('secreta');
  });

  it('refuses to send the key anywhere else', async () => {
    const pedido = responder('x');
    vi.stubGlobal('fetch', pedido);
    for (const malo of ['https://evil.example/webservice/pluginfile.php/1/a.pdf', `${CAMPUS}/login/index.php`]) {
      await expect(bajarArchivo('secreta', malo)).rejects.toBeInstanceOf(ErrorCampus);
    }
    expect(pedido).not.toHaveBeenCalled();
  });

  it('treats a JSON answer as a failed download', async () => {
    vi.stubGlobal('fetch', responder({ error: 'x' }));
    await expect(bajarArchivo('k', direccion)).rejects.toMatchObject({ codigo: 'archivo_rechazado' });
  });

describe('lo que no se puede torcer', () => {
  it('los parámetros no pisan la función ni la clave', async () => {
    const pedido = vi.fn(async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', pedido);
    await llamar('k', 'core_webservice_get_site_info', { wsfunction: 'mod_assign_submit_for_grading', wstoken: 'otra' });
    const cuerpo = pedido.mock.calls[0][1].body;
    expect(cuerpo.get('wsfunction')).toBe('core_webservice_get_site_info');
    expect(cuerpo.get('wstoken')).toBe('k');
  });

  it('un redirect nunca se sigue con la clave o la contraseña', async () => {
    const pedido = vi.fn(async () => new Response('{"token":"t"}', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', pedido);
    await llamar('k', 'core_webservice_get_site_info');
    await pedirClave('u', 'c');
    await bajarArchivo('k', `${CAMPUS}/webservice/pluginfile.php/1/a.pdf`).catch(() => {});
    expect(pedido.mock.calls.map(([, o]) => o.redirect)).toEqual(['error', 'error', 'error']);
  });
});
});

describe('notificaciones', () => {
  it('reads the count and the list for the bell, and llamar never marks one as read', async () => {
    expect(LECTURA.has('message_popup_get_popup_notifications')).toBe(true);
    expect(LECTURA.has('message_popup_get_unread_popup_notification_count')).toBe(true);
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    for (const funcion of ['core_message_mark_notification_read', 'core_message_mark_all_notifications_as_read']) {
      expect(ESCRITURA.has(funcion)).toBe(false);
      await expect(llamar('k', funcion, { notificationid: 1 })).rejects.toThrow(/lista de lectura/);
    }
    expect(pedido).not.toHaveBeenCalled();
  });
});

describe('mensajes privados', () => {
  const ESCRIBEN = ['core_message_send_messages_to_conversation', 'core_message_send_instant_messages', 'core_message_mark_all_conversation_messages_as_read'];
  const cuerpoDe = (pedido) => Object.fromEntries(pedido.mock.calls[0][1].body);

  it('reads through LECTURA and writes only through ESCRITURA, which llamar never sends', async () => {
    for (const funcion of ['core_message_get_unread_conversations_count', 'core_message_get_conversations', 'core_message_get_conversation_messages', 'core_message_message_search_users']) {
      expect(LECTURA.has(funcion)).toBe(true);
    }
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    for (const funcion of ESCRIBEN) {
      expect(ESCRITURA.has(funcion)).toBe(true);
      expect(LECTURA.has(funcion)).toBe(false);
      await expect(llamar('k', funcion, { conversationid: 1 })).rejects.toThrow(/lista de lectura/);
    }
    expect(pedido).not.toHaveBeenCalled();
  });

  it('answers in a conversation with its one function, the text and the key in the body, once', async () => {
    const pedido = responder([{ id: 40, useridfrom: 5, text: '<p>hola</p>', timecreated: 100 }]);
    vi.stubGlobal('fetch', pedido);
    expect(await responderEnConversacion('secreta', 9, 'hola\nchau')).toEqual({ id: 40, useridfrom: 5, text: '<p>hola</p>', timecreated: 100 });
    expect(pedido).toHaveBeenCalledTimes(1);
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).toBe(`${CAMPUS}/webservice/rest/server.php`);
    expect(opciones.redirect).toBe('error');
    expect(cuerpoDe(pedido)).toEqual({ conversationid: '9', 'messages[0][text]': 'hola\nchau', wstoken: 'secreta', wsfunction: 'core_message_send_messages_to_conversation', moodlewsrestformat: 'json' });
  });

  it('writes to someone with its one function, once', async () => {
    const pedido = responder([{ msgid: 41, conversationid: 12, useridfrom: 5, text: 'hola', timecreated: 100 }]);
    vi.stubGlobal('fetch', pedido);
    expect(await mandarMensaje('k', 8, 'hola')).toMatchObject({ id: 41, conversationid: 12 });
    expect(cuerpoDe(pedido)).toEqual({ 'messages[0][touserid]': '8', 'messages[0][text]': 'hola', wstoken: 'k', wsfunction: 'core_message_send_instant_messages', moodlewsrestformat: 'json' });
  });

  it('marks a conversation as read with its one function, once', async () => {
    const pedido = responder(null);
    vi.stubGlobal('fetch', pedido);
    expect(await marcarLeida('k', 5, 9)).toBe(true);
    expect(cuerpoDe(pedido)).toEqual({ userid: '5', conversationid: '9', wstoken: 'k', wsfunction: 'core_message_mark_all_conversation_messages_as_read', moodlewsrestformat: 'json' });
  });

  it('never retries, also when the connection or the campus fails', async () => {
    const cortado = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', cortado);
    await expect(responderEnConversacion('k', 9, 'hola')).rejects.toThrow(TypeError);
    await expect(mandarMensaje('k', 8, 'hola')).rejects.toThrow(TypeError);
    expect(cortado).toHaveBeenCalledTimes(2);
    const caido = responder('<html>503</html>', { status: 503, tipo: 'text/html' });
    vi.stubGlobal('fetch', caido);
    await expect(responderEnConversacion('k', 9, 'hola')).rejects.toMatchObject({ codigo: 'http_503' });
    expect(caido).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty text, one past the campus limit or a number that is not one, before any request', async () => {
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    // The limit is in bytes: an «á» takes two.
    expect(largoEnBytes('á'.repeat(2048))).toBe(LARGO_MAXIMO);
    for (const [id, texto] of [[9, '   '], [9, ''], [9, 'á'.repeat(2048) + 'a'], ['9', 'hola'], [0, 'hola'], [9.5, 'hola'], [9, 42]]) {
      await expect(responderEnConversacion('k', id, texto)).rejects.toMatchObject({ codigo: 'datos_invalidos' });
      await expect(mandarMensaje('k', id, texto)).rejects.toMatchObject({ codigo: 'datos_invalidos' });
    }
    await expect(marcarLeida('k', 5, '9')).rejects.toMatchObject({ codigo: 'datos_invalidos' });
    expect(pedido).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', responder([{ id: 1, useridfrom: 5, text: 'x', timecreated: 1 }]));
    await expect(responderEnConversacion('k', 9, 'á'.repeat(2048))).resolves.toMatchObject({ id: 1 });
  });

  it('says no in words, without the campus messages', async () => {
    vi.stubGlobal('fetch', responder([{ msgid: -1, errormessage: 'Este usuario lo bloqueó' }]));
    const rechazo = await mandarMensaje('k', 8, 'hola').catch((e) => e);
    expect(rechazo).toMatchObject({ codigo: 'rechazado' });
    expect(rechazo.message).not.toContain('bloque');
    vi.stubGlobal('fetch', responder({ exception: 'moodle_exception', errorcode: 'errormessagetoolong', message: 'interno' }));
    await expect(responderEnConversacion('k', 9, 'hola')).rejects.toMatchObject({ codigo: 'muy_largo' });
    vi.stubGlobal('fetch', responder({ exception: 'moodle_exception', errorcode: 'disabled', message: 'interno' }));
    await expect(marcarLeida('k', 5, 9)).rejects.toMatchObject({ codigo: 'sin_mensajes' });
    vi.stubGlobal('fetch', responder({ exception: 'x', errorcode: 'invalidtoken', message: 'interno' }));
    await expect(mandarMensaje('k', 8, 'hola')).rejects.toMatchObject({ codigo: 'sesion' });
    vi.stubGlobal('fetch', responder([]));
    await expect(responderEnConversacion('k', 9, 'hola')).rejects.toMatchObject({ codigo: 'sin_confirmar' });
    await expect(mandarMensaje('k', 8, 'hola')).rejects.toMatchObject({ codigo: 'sin_confirmar' });
  });

  it('the parameters cannot change the function or the key', async () => {
    const pedido = responder(null);
    vi.stubGlobal('fetch', pedido);
    await marcarLeida('k', 5, 9, { wsfunction: 'core_user_update_users', wstoken: 'otra' });
    expect(cuerpoDe(pedido).wsfunction).toBe('core_message_mark_all_conversation_messages_as_read');
    expect(cuerpoDe(pedido).wstoken).toBe('k');
  });
});

describe('la lista de escritura', () => {
  it('has the three steps of handing in a task, apart from the reads', () => {
    for (const funcion of ['webservice/upload.php', 'mod_assign_save_submission', 'mod_assign_submit_for_grading']) {
      expect(ESCRITURA.has(funcion)).toBe(true);
      expect(LECTURA.has(funcion)).toBe(false);
    }
  });

  it('reads the tasks through LECTURA, and llamar never sends their writes', async () => {
    expect(LECTURA.has('mod_assign_get_assignments')).toBe(true);
    expect(LECTURA.has('mod_assign_get_submission_status')).toBe(true);
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    for (const funcion of ['mod_assign_save_submission', 'mod_assign_submit_for_grading', 'webservice/upload.php']) {
      await expect(llamar('k', funcion, { assignmentid: 1 })).rejects.toThrow(/lista de lectura/);
    }
    expect(pedido).not.toHaveBeenCalled();
  });
});

describe('subirArchivo', () => {
  const archivo = () => new Blob(['%PDF-1.4'], { type: 'application/pdf' });
  const subido = (itemid = 555) => responder([{ component: 'user', contextid: 9, userid: 1, filearea: 'draft', filename: 'tp.pdf', filepath: '/', itemid, license: 'allrightsreserved', author: 'x', source: 'x' }]);

  it('goes only to upload.php of the campus, with the key in the body and no redirects', async () => {
    const pedido = subido();
    vi.stubGlobal('fetch', pedido);
    expect(await subirArchivo('secreta', archivo(), { nombre: 'tp.pdf' })).toBe(555);
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).toBe(`${CAMPUS}/webservice/upload.php`);
    expect(opciones.method).toBe('POST');
    expect(opciones.redirect).toBe('error');
    expect(opciones.body).toBeInstanceOf(FormData);
    expect(opciones.body.get('token')).toBe('secreta');
    expect(opciones.body.get('filearea')).toBe('draft');
    expect(opciones.body.get('itemid')).toBe('0');
    expect(opciones.body.get('file_1').name).toBe('tp.pdf');
    expect([...opciones.body.keys()].sort()).toEqual(['file_1', 'filearea', 'filepath', 'itemid', 'token']);
  });

  it('puts the next files in the same draft', async () => {
    const pedido = subido(555);
    vi.stubGlobal('fetch', pedido);
    await subirArchivo('k', archivo(), { nombre: 'b.pdf', borrador: 555 });
    expect(pedido.mock.calls[0][1].body.get('itemid')).toBe('555');
  });

  it('never retries, also when the connection or the campus fails', async () => {
    const cortado = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', cortado);
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toThrow(TypeError);
    expect(cortado).toHaveBeenCalledTimes(1);
    const caido = responder('<html>503</html>', { status: 503, tipo: 'text/html' });
    vi.stubGlobal('fetch', caido);
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'http_503' });
    expect(caido).toHaveBeenCalledTimes(1);
  });

  it('says in words why the campus refused the file', async () => {
    vi.stubGlobal('fetch', responder([{ filename: 'a.pdf', errortype: 'fileoversized', error: 'internal text' }]));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'archivo_grande', message: 'El archivo pesa más de lo que acepta el campus.' });
    vi.stubGlobal('fetch', responder([{ filename: 'a.pdf', errortype: 'filenameexist', error: 'internal text' }]));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'archivo_repetido' });
    vi.stubGlobal('fetch', responder({ error: 'internal text', errorcode: 'userquotalimit' }, { status: 500 }));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'archivo_grande' });
    vi.stubGlobal('fetch', responder('<html>413</html>', { status: 413, tipo: 'text/html' }));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'archivo_grande' });
    vi.stubGlobal('fetch', responder({ error: 'internal text', errorcode: 'invalidtoken' }));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'sesion' });
    vi.stubGlobal('fetch', responder([]));
    await expect(subirArchivo('k', archivo(), { nombre: 'a.pdf' })).rejects.toMatchObject({ codigo: 'respuesta_invalida' });
  });

  it('refuses what is not a file or a draft number, before any request', async () => {
    const pedido = subido();
    vi.stubGlobal('fetch', pedido);
    for (const [a, opciones] of [['texto', { nombre: 'a.pdf' }], [archivo(), { nombre: '' }], [archivo(), { nombre: 'a.pdf', borrador: -1 }], [archivo(), { nombre: 'a.pdf', borrador: '5' }]]) {
      await expect(subirArchivo('k', a, opciones)).rejects.toBeInstanceOf(ErrorCampus);
    }
    expect(pedido).not.toHaveBeenCalled();
  });
});

describe('guardarEntrega', () => {
  it('writes only through mod_assign_save_submission, with the text and the draft of files', async () => {
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    expect(await guardarEntrega('k', 7, { texto: '<p>Hola</p>', borrador: 555, wsfunction: 'core_user_update_users', assignmentid: 99 })).toBe(true);
    const [url, opciones] = pedido.mock.calls[0];
    expect(String(url)).toBe(`${CAMPUS}/webservice/rest/server.php`);
    expect(opciones.redirect).toBe('error');
    expect(Object.fromEntries(opciones.body)).toEqual({
      assignmentid: '7',
      'plugindata[onlinetext_editor][text]': '<p>Hola</p>',
      'plugindata[onlinetext_editor][format]': '1',
      'plugindata[onlinetext_editor][itemid]': '0',
      'plugindata[files_filemanager]': '555',
      wstoken: 'k',
      wsfunction: 'mod_assign_save_submission',
      moodlewsrestformat: 'json',
    });
  });

  it('leaves out the part the task does not take', async () => {
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    await guardarEntrega('k', 7, { borrador: 555 });
    expect(pedido.mock.calls[0][1].body.has('plugindata[onlinetext_editor][text]')).toBe(false);
    await guardarEntrega('k', 7, { texto: '' });
    expect(pedido.mock.calls[1][1].body.has('plugindata[files_filemanager]')).toBe(false);
  });

  it('refuses a submission with nothing, or a task that is not a number, before any request', async () => {
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    for (const [id, datos] of [[7, {}], ['7', { texto: 'x' }], [0, { texto: 'x' }], [7, { borrador: 0 }], [7, { borrador: '5' }]]) {
      await expect(guardarEntrega('k', id, datos)).rejects.toBeInstanceOf(ErrorCampus);
    }
    expect(pedido).not.toHaveBeenCalled();
  });

  it('turns the campus notice into an error, with its words as plain text', async () => {
    vi.stubGlobal('fetch', responder([{ item: 'assignment', itemid: 7, warningcode: 'couldnotsavesubmission', message: '<span class="error">La fecha de entrega ya pasó</span>' }]));
    const error = await guardarEntrega('k', 7, { texto: 'x' }).catch((e) => e);
    expect(error).toMatchObject({ codigo: 'no_guardada', message: 'El campus no guardó la entrega.', detalle: 'La fecha de entrega ya pasó' });
  });

  it('never retries, and explains a locked task or a dead key', async () => {
    const cortado = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', cortado);
    await expect(guardarEntrega('k', 7, { texto: 'x' })).rejects.toThrow(TypeError);
    expect(cortado).toHaveBeenCalledTimes(1);
    vi.stubGlobal('fetch', responder({ exception: 'moodle_exception', errorcode: 'submissionslocked', message: 'internal' }));
    await expect(guardarEntrega('k', 7, { texto: 'x' })).rejects.toMatchObject({ codigo: 'bloqueada' });
    vi.stubGlobal('fetch', responder({ exception: 'x', errorcode: 'invalidtoken', message: 'internal' }));
    await expect(guardarEntrega('k', 7, { texto: 'x' })).rejects.toMatchObject({ codigo: 'sesion' });
  });
});

describe('enviarEntrega', () => {
  it('writes only through mod_assign_submit_for_grading, accepting the statement only when told so', async () => {
    const pedido = responder([]);
    vi.stubGlobal('fetch', pedido);
    expect(await enviarEntrega('k', 7, { aceptar: true, wsfunction: 'x' })).toBe(true);
    expect(Object.fromEntries(pedido.mock.calls[0][1].body)).toEqual({ assignmentid: '7', acceptsubmissionstatement: '1', wstoken: 'k', wsfunction: 'mod_assign_submit_for_grading', moodlewsrestformat: 'json' });
    await enviarEntrega('k', 7, { aceptar: 'si' });
    expect(pedido.mock.calls[1][1].body.get('acceptsubmissionstatement')).toBe('0');
  });

  it('does not show its notice, which carries internal numbers', async () => {
    vi.stubGlobal('fetch', responder([{ item: 'assignment', itemid: 7, warningcode: 'couldnotsubmitforgrading', message: 'User id: 5, Assignment id: 7 Notices:' }]));
    const error = await enviarEntrega('k', 7, { aceptar: true }).catch((e) => e);
    expect(error.codigo).toBe('no_enviada');
    expect(error.message).not.toMatch(/User id/);
    expect(error.detalle).toBeUndefined();
  });

  it('never retries', async () => {
    const caido = responder('<html>503</html>', { status: 503, tipo: 'text/html' });
    vi.stubGlobal('fetch', caido);
    await expect(enviarEntrega('k', 7)).rejects.toMatchObject({ codigo: 'http_503' });
    expect(caido).toHaveBeenCalledTimes(1);
  });
});
