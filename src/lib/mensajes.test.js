import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buscarPersonas, cargarConversaciones, cargarMensajes, contarSinLeer, escribirA, marcarComoLeida, responderEn,
} from './campus';
import {
  conversacion, conversaciones, cuandoCorto, diaDeMensajes, filtrarConversaciones, fotoDe, horaDeMensaje, iniciales,
  juntarMensajes, mismoTexto, persona, personasHalladas, porDia, tandaDeMensajes,
} from './mensajes';
import { TOKEN_DEMO } from './modoDemo';
import { CAMPUS } from './moodle';
import { iniciarSesion, tokenActual, vaciarCache } from './sesion';

const segundos = (...fecha) => new Date(...fecha).getTime() / 1000;
const AHORA = new Date(2026, 10, 7, 15, 0).getTime();
const gente = (id, fullname, extra = {}) => ({ id, fullname, profileimageurl: '', ...extra });
const escrito = (id, useridfrom, text, timecreated = 1000 + id) => ({ id, useridfrom, text, timecreated });

describe('fotoDe', () => {
  it('brings only the pictures people and groups uploaded to the campus, through the web service, without a key', () => {
    expect(fotoDe(`${CAMPUS}/pluginfile.php/301/user/icon/boost/f1?rev=12`)).toBe(`${CAMPUS}/webservice/pluginfile.php/301/user/icon/boost/f1?rev=12`);
    expect(fotoDe(`${CAMPUS}/webservice/pluginfile.php/301/user/icon/boost/f1?token=abc&rev=1`)).toBe(`${CAMPUS}/webservice/pluginfile.php/301/user/icon/boost/f1?rev=1`);
    expect(fotoDe(`${CAMPUS}/pluginfile.php/88/group/icon/1`)).toBe(`${CAMPUS}/webservice/pluginfile.php/88/group/icon/1`);
  });

  it('leaves the drawing for someone without a picture, other places and other files to the initials', () => {
    expect(fotoDe(`${CAMPUS}/theme/image.php/boost/core/1/u/f1`)).toBeNull();
    expect(fotoDe('https://otro.sitio/pluginfile.php/301/user/icon/boost/f1')).toBeNull();
    expect(fotoDe(`${CAMPUS}/pluginfile.php/301/mod_resource/content/1/tp.pdf`)).toBeNull();
    expect(fotoDe('no es una dirección')).toBeNull();
    expect(fotoDe('')).toBeNull();
  });
});

describe('iniciales', () => {
  it('takes the first and the last word', () => {
    expect(iniciales('Laura Méndez')).toBe('LM');
    expect(iniciales('María José Paz')).toBe('MP');
    expect(iniciales('ana')).toBe('A');
    expect(iniciales('(Tomás) Ferreyra')).toBe('TF');
    expect(iniciales('  ')).toBe('?');
  });
});

describe('persona', () => {
  it('says whether this person can get a message and which conversation the two already have', () => {
    expect(persona(gente(21, 'Laura &amp; Méndez', { canmessage: false, isblocked: true, conversations: [{ id: 9, type: 2 }, { id: 501, type: 1 }] }))).toEqual({
      id: 21, nombre: 'Laura & Méndez', foto: null, borrada: false, bloqueada: true, puedeRecibir: false, conversacion: 501,
    });
    expect(persona(gente(22, ''))).toMatchObject({ nombre: 'Alguien del campus', puedeRecibir: null, conversacion: null });
    expect(persona({ fullname: 'Sin número' })).toBeNull();
  });
});

describe('conversacion', () => {
  const yo = 1;

  it('names an individual one after the other person, wherever the campus puts the student', () => {
    const c = conversacion({ id: 501, type: 1, members: [gente(1, 'Yo'), gente(21, 'Laura Méndez')], messages: [escrito(7, 21, '<p>Hola</p>')], unreadcount: 2 }, yo);
    expect(c).toMatchObject({ id: 501, grupo: false, nombre: 'Laura Méndez', persona: { id: 21 }, sinLeer: 2, ultimo: { id: 7, de: 21, texto: 'Hola' } });
  });

  it('names a group one after the group, with the course and whoever wrote last', () => {
    const c = conversacion({
      id: 503, type: 2, name: 'Grupo 3', subname: 'Física I', membercount: 4, imageurl: `${CAMPUS}/theme/image.php/boost/core/1/g/g1`,
      members: [gente(24, 'Marcos Benítez')], messages: [escrito(8, 24, 'Dale')], unreadcount: null, isread: true,
    }, yo);
    expect(c).toMatchObject({ grupo: true, nombre: 'Grupo 3', detalle: 'Física I', personas: 4, foto: null, persona: { id: 24 }, sinLeer: 0 });
  });

  it('counts one unread when the campus only says it is not read', () => {
    expect(conversacion({ id: 2, type: 1, members: [gente(21, 'Laura')], messages: [], unreadcount: null, isread: false }, yo).sinLeer).toBe(1);
  });

  it('leaves out the conversation with oneself and anything it cannot read', () => {
    expect(conversaciones([
      { id: 1, type: 3, members: [gente(1, 'Yo')] },
      { id: 2, type: 1, members: [gente(1, 'Yo')] },
      null,
      { id: 3, type: 1, members: [gente(22, 'Tomás')], messages: [] },
    ], yo).map((c) => c.id)).toEqual([3]);
    expect(conversaciones({ exception: 'x' }, yo)).toEqual([]);
  });
});

describe('the messages of a conversation', () => {
  it('turns a batch asked newest first into oldest first', () => {
    const tanda = tandaDeMensajes({ id: 501, members: [gente(21, 'Laura')], messages: [escrito(3, 21, 'c'), escrito(2, 1, 'b'), escrito(1, 21, 'a')] });
    expect(tanda.mensajes.map((m) => m.texto)).toEqual(['a', 'b', 'c']);
    expect(tanda.miembros.map((m) => m.id)).toEqual([21]);
    expect(tandaDeMensajes(null)).toEqual({ mensajes: [], miembros: [] });
  });

  it('joins an older batch without showing twice a message that slid into it', () => {
    const vistos = tandaDeMensajes({ messages: [escrito(4, 1, 'd'), escrito(3, 21, 'c')] }).mensajes;
    const anteriores = tandaDeMensajes({ messages: [escrito(3, 21, 'c'), escrito(2, 1, 'b')] }).mensajes;
    expect(juntarMensajes(vistos, anteriores).map((m) => m.id)).toEqual([2, 3, 4]);
  });

  it('groups them by day', () => {
    const dias = porDia([escrito(1, 1, 'a', segundos(2026, 10, 5, 10)), escrito(2, 1, 'b', segundos(2026, 10, 5, 23)), escrito(3, 1, 'c', segundos(2026, 10, 6, 9))].map((m) => ({ id: m.id, cuando: m.timecreated })));
    expect(dias.map((d) => d.mensajes.map((m) => m.id))).toEqual([[1, 2], [3]]);
  });
});

describe('personasHalladas', () => {
  it('puts contacts first, once each, without the student or deleted accounts', () => {
    const halladas = personasHalladas({
      contacts: [gente(22, 'Tomás Ferreyra')],
      noncontacts: [gente(1, 'Yo'), gente(25, 'Martina Gómez'), gente(22, 'Tomás Ferreyra'), gente(30, 'Borrada', { isdeleted: true })],
    }, 1);
    expect(halladas.map((p) => p.id)).toEqual([22, 25]);
    expect(personasHalladas({}, 1)).toEqual([]);
  });
});

describe('filtrarConversaciones', () => {
  const lista = [
    { id: 1, nombre: 'Laura Méndez', detalle: '', persona: { nombre: 'Laura Méndez' }, ultimo: { texto: 'El TP 2 está corregido' } },
    { id: 2, nombre: 'Grupo 3', detalle: 'Física I', persona: { nombre: 'Marcos Benítez' }, ultimo: { texto: 'Nos vemos el jueves' } },
  ];

  it('finds every word, accents aside, in the name, the course, who wrote and the last message', () => {
    expect(filtrarConversaciones(lista, 'mendez').map((c) => c.id)).toEqual([1]);
    expect(filtrarConversaciones(lista, 'fisica jueves').map((c) => c.id)).toEqual([2]);
    expect(filtrarConversaciones(lista, 'benitez').map((c) => c.id)).toEqual([2]);
    expect(filtrarConversaciones(lista, 'laura jueves')).toEqual([]);
    expect(filtrarConversaciones(lista, '  ')).toBe(lista);
  });
});

describe('mismoTexto', () => {
  it('compares what was typed with what the campus keeps, as plain text', () => {
    expect(mismoTexto('Hola,\n\n¿todo bien?', 'Hola, ¿todo bien?')).toBe(true);
    expect(mismoTexto('Hola', 'Hola de nuevo')).toBe(false);
    expect(mismoTexto('   ', '')).toBe(false);
  });
});

describe('when', () => {
  it('says the hour today, «ayer», the day this week and the date before', () => {
    expect(horaDeMensaje(segundos(2026, 10, 7, 9, 5))).toBe('09:05');
    expect(cuandoCorto(segundos(2026, 10, 7, 19, 40), AHORA)).toBe('19:40');
    expect(cuandoCorto(segundos(2026, 10, 6, 22), AHORA)).toBe('ayer');
    expect(cuandoCorto(segundos(2026, 10, 4, 10), AHORA)).toBe('mié');
    expect(cuandoCorto(segundos(2026, 9, 20, 10), AHORA)).toBe('20 oct');
    expect(cuandoCorto(segundos(2025, 9, 20, 10), AHORA)).toBe('20 oct 2025');
    expect(cuandoCorto(0, AHORA)).toBe('');
  });

  it('heads a day of messages with «Hoy», «Ayer» or the date, with the year only when it is another one', () => {
    expect(diaDeMensajes(segundos(2026, 10, 7, 8), AHORA)).toBe('Hoy');
    expect(diaDeMensajes(segundos(2026, 10, 6, 8), AHORA)).toBe('Ayer');
    expect(diaDeMensajes(segundos(2026, 10, 5, 8), AHORA)).toBe('Jueves, 5 de noviembre');
    expect(diaDeMensajes(segundos(2025, 10, 5, 8), AHORA)).toBe('Miércoles, 5 de noviembre de 2025');
  });
});

describe('against the campus', () => {
  // A stand-in campus: each function answers what the test says, and every request is kept with its parameters.
  let respuestas;
  const pedidos = [];
  const del = (funcion) => pedidos.filter((p) => p.funcion === funcion);
  const negado = () => ({ exception: 'webservice_access_exception', errorcode: 'accessexception', message: 'Access control exception' });
  beforeEach(() => {
    vaciarCache();
    sessionStorage.clear();
    localStorage.clear();
    iniciarSesion('real');
    pedidos.length = 0;
    respuestas = { core_webservice_get_site_info: () => ({ userid: 9, firstname: 'Ana' }) };
    vi.stubGlobal('fetch', vi.fn(async (_url, { body }) => {
      const funcion = body.get('wsfunction');
      const parametros = Object.fromEntries([...body].filter(([k]) => !['wstoken', 'wsfunction', 'moodlewsrestformat'].includes(k)));
      pedidos.push({ funcion, parametros });
      const r = respuestas[funcion]?.(parametros);
      if (r instanceof Response) return r;
      return new Response(JSON.stringify(r ?? null), { headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('counts the unread conversations each time it is asked, never from memory', async () => {
    respuestas.core_message_get_unread_conversations_count = () => 3;
    expect(await contarSinLeer()).toBe(3);
    expect(await contarSinLeer()).toBe(3);
    expect(del('core_message_get_unread_conversations_count').map((p) => p.parametros)).toEqual([{ useridto: '9' }, { useridto: '9' }]);
    respuestas.core_message_get_unread_conversations_count = () => ({ nada: 1 });
    expect(await contarSinLeer()).toBe(0);
  });

  it('asks the conversations one more than it shows, to know whether there are more', async () => {
    const conv = (id) => ({ id, type: 1, members: [gente(100 + id, `Persona ${id}`)], messages: [escrito(id, 100 + id, 'hola')] });
    respuestas.core_message_get_conversations = (p) => ({ conversations: Array.from({ length: p.limitfrom === '0' ? 21 : 3 }, (_, i) => conv(Number(p.limitfrom) + i + 1)) });
    const primera = await cargarConversaciones(0);
    expect(primera.conversaciones).toHaveLength(20);
    expect(primera).toMatchObject({ mas: true, yo: 9 });
    const segunda = await cargarConversaciones(20);
    expect(segunda).toMatchObject({ mas: false });
    expect(del('core_message_get_conversations').map((p) => p.parametros)).toEqual([
      { userid: '9', limitfrom: '0', limitnum: '21' },
      { userid: '9', limitfrom: '20', limitnum: '21' },
    ]);
    await cargarConversaciones(0);
    expect(del('core_message_get_conversations')).toHaveLength(2);
    await cargarConversaciones(0, { fresco: true });
    expect(del('core_message_get_conversations')).toHaveLength(3);
  });

  it('asks a conversation newest first and shows it oldest first, with whether there are older ones', async () => {
    respuestas.core_message_get_conversation_messages = () => ({ id: 501, members: [], messages: Array.from({ length: 31 }, (_, i) => escrito(40 - i, 21, `m${40 - i}`)) });
    const tanda = await cargarMensajes(501, 0);
    expect(tanda.mas).toBe(true);
    expect(tanda.mensajes).toHaveLength(30);
    expect(tanda.mensajes[0].id).toBe(11);
    expect(tanda.mensajes.at(-1).id).toBe(40);
    expect(del('core_message_get_conversation_messages')[0].parametros).toEqual({ currentuserid: '9', convid: '501', limitfrom: '0', limitnum: '31', newest: '1' });
  });

  it('searches people with the student and the words as typed', async () => {
    respuestas.core_message_message_search_users = () => ({ contacts: [], noncontacts: [gente(25, 'Martina Gómez')] });
    expect((await buscarPersonas('mar')).map((p) => p.id)).toEqual([25]);
    expect(del('core_message_message_search_users')[0].parametros).toEqual({ userid: '9', search: 'mar', limitfrom: '0', limitnum: '20' });
  });

  it('answers once and gives back the message as the campus keeps it', async () => {
    respuestas.core_message_send_messages_to_conversation = (p) => [{ id: 77, useridfrom: 9, text: `<p>${p['messages[0][text]']}</p>`, timecreated: 2000 }];
    expect(await responderEn(501, 'Gracias', { despuesDe: 40 })).toMatchObject({ id: 77, de: 9, texto: 'Gracias' });
    expect(del('core_message_send_messages_to_conversation').map((p) => p.parametros)).toEqual([{ conversationid: '501', 'messages[0][text]': 'Gracias' }]);
  });

  it('looks the message up when the answer got lost, and does not send it again', async () => {
    respuestas.core_message_send_messages_to_conversation = () => new Response('', { status: 502 });
    respuestas.core_message_get_conversation_messages = () => ({ messages: [escrito(78, 9, '<p>Gracias</p>'), escrito(40, 21, 'De nada')] });
    expect(await responderEn(501, 'Gracias', { despuesDe: 40 })).toMatchObject({ id: 78 });
    expect(del('core_message_send_messages_to_conversation')).toHaveLength(1);
    expect(del('core_message_get_conversation_messages')[0].parametros).toMatchObject({ convid: '501', limitfrom: '0', limitnum: '5', newest: '1' });
  });

  it('says it did not go when the lookup does not find it, nor an older message with the same words', async () => {
    respuestas.core_message_send_messages_to_conversation = () => new Response('', { status: 502 });
    respuestas.core_message_get_conversation_messages = () => ({ messages: [escrito(40, 9, 'Gracias')] });
    await expect(responderEn(501, 'Gracias', { despuesDe: 40 })).rejects.toMatchObject({ codigo: 'http_502' });
    expect(del('core_message_send_messages_to_conversation')).toHaveLength(1);
  });

  it('does not look anything up after a clear no from the campus', async () => {
    respuestas.core_message_send_messages_to_conversation = () => ({ exception: 'moodle_exception', errorcode: 'errormessagetoolong' });
    await expect(responderEn(501, 'Gracias')).rejects.toMatchObject({ codigo: 'muy_largo' });
    expect(del('core_message_get_conversation_messages')).toHaveLength(0);
  });

  it('keeps the session when the campus only leaves messages closed for Super CVG', async () => {
    respuestas.core_message_send_messages_to_conversation = negado;
    await expect(responderEn(501, 'Gracias')).rejects.toMatchObject({ codigo: 'sin_permiso' });
    respuestas.core_message_get_unread_conversations_count = negado;
    await expect(contarSinLeer()).rejects.toMatchObject({ codigo: 'sin_permiso' });
    expect(tokenActual()).toBe('real');
  });

  it('says when messages are off in the campus', async () => {
    respuestas.core_message_get_unread_conversations_count = () => ({ exception: 'moodle_exception', errorcode: 'disabled' });
    await expect(contarSinLeer()).rejects.toMatchObject({ codigo: 'sin_mensajes' });
  });

  it('writes to someone and gives back the conversation the campus opened', async () => {
    respuestas.core_message_send_instant_messages = () => [{ msgid: 90, conversationid: 640, useridfrom: 9, text: 'Hola', timecreated: 3000, errormessage: '' }];
    expect(await escribirA(25, 'Hola')).toMatchObject({ conversacionId: 640, mensaje: { id: 90, texto: 'Hola' } });
    expect(del('core_message_send_instant_messages').map((p) => p.parametros)).toEqual([{ 'messages[0][touserid]': '25', 'messages[0][text]': 'Hola' }]);
  });

  it('says in words when the person does not take messages, without looking it up', async () => {
    respuestas.core_message_send_instant_messages = () => [{ msgid: -1, errormessage: 'El usuario solo acepta mensajes de sus contactos' }];
    await expect(escribirA(25, 'Hola')).rejects.toMatchObject({ codigo: 'rechazado' });
    expect(del('core_message_get_conversations')).toHaveLength(0);
  });

  it('finds a message to someone that seemed lost in the latest conversations', async () => {
    respuestas.core_message_send_instant_messages = () => new Response('', { status: 504 });
    respuestas.core_message_get_conversations = () => ({ conversations: [{ id: 640, type: 1, members: [gente(25, 'Martina Gómez')], messages: [escrito(91, 9, 'Hola')] }] });
    expect(await escribirA(25, 'Hola')).toMatchObject({ conversacionId: 640, mensaje: { id: 91 } });
    expect(del('core_message_send_instant_messages')).toHaveLength(1);
  });

  it('marks a conversation as read for the student', async () => {
    await marcarComoLeida(501);
    expect(del('core_message_mark_all_conversation_messages_as_read').map((p) => p.parametros)).toEqual([{ userid: '9', conversationid: '501' }]);
  });
});

describe('in the sample mode', () => {
  beforeEach(() => {
    vaciarCache();
    sessionStorage.clear();
    iniciarSesion(TOKEN_DEMO);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Nada sale a la red en el modo de ejemplo.'))));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('has conversations, people and pretend sending, without the network', async () => {
    expect(await contarSinLeer()).toBeGreaterThan(0);
    const { conversaciones: lista } = await cargarConversaciones(0);
    expect(lista.some((c) => c.grupo)).toBe(true);
    expect(lista.some((c) => c.sinLeer > 0)).toBe(true);
    const grupo = lista.find((c) => c.grupo);
    expect((await cargarMensajes(grupo.id, 0)).mas).toBe(true);
    const halladas = await buscarPersonas('mar');
    expect(halladas.length).toBeGreaterThan(0);
    expect(await responderEn(lista[0].id, 'Gracias')).toMatchObject({ texto: 'Gracias' });
    await expect(responderEn(lista[0].id, 'Este falla a propósito')).rejects.toBeTruthy();
    const nueva = halladas.find((p) => !p.conversacion);
    expect((await escribirA(nueva.id, 'Hola')).conversacionId).toBeGreaterThan(0);
    await marcarComoLeida(lista[0].id);
    expect(fetch).not.toHaveBeenCalled();
  });
});
