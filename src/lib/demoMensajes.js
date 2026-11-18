// Sample messages to try Mensajes without an account, only in development (/?demo=1): a conversation with a teacher, a
// course group and one with unread messages, people to find, and pretend sending. Nothing leaves the browser, and what
// is sent lives only in this tab. Answers have the shape of the campus ones (Moodle 4.x, core_message_*).
import { CAMPUS, ErrorCampus } from './moodle';

const YO = 1;
const MINUTO = 60;
const HORA = 3600;
const DIA = 86_400;
const ahora = () => Math.floor(Date.now() / 1000);
// The pause of the campus, left out of the unit tests.
const PAUSA = import.meta.env.MODE === 'test' ? 0 : 700;
const enUnRato = (valor, ms = PAUSA) => new Promise((listo) => setTimeout(() => listo(valor), ms));

const FOTO_DOCENTE = `${CAMPUS}/pluginfile.php/301/user/icon/boost/f1?rev=1`;
const SIN_FOTO = `${CAMPUS}/theme/image.php/boost/core/1/u/f1`;
// A Drive file of the sample: the address of one, but no file is behind it.
const GUIA = 'https://drive.google.com/file/d/1demoGuiaDeEjercicios3000000000/view?usp=sharing';

const GENTE = [
  { id: YO, nombre: 'Ejemplo Alumno' },
  { id: 21, nombre: 'Laura Méndez', foto: FOTO_DOCENTE, contacto: true },
  { id: 22, nombre: 'Tomás Ferreyra', contacto: true },
  { id: 23, nombre: 'Sofía Ledesma' },
  { id: 24, nombre: 'Marcos Benítez' },
  { id: 25, nombre: 'Martina Gómez' },
  { id: 26, nombre: 'Mariano Quiroga' },
  { id: 27, nombre: 'María José Paz' },
  { id: 28, nombre: 'Lucía Paredes' },
];

const miembro = (id) => {
  const p = GENTE.find((g) => g.id === id);
  return {
    id: p.id,
    fullname: p.nombre,
    profileurl: `${CAMPUS}/user/profile.php?id=${p.id}`,
    profileimageurl: p.foto ?? SIN_FOTO,
    profileimageurlsmall: (p.foto ?? SIN_FOTO).replace('/f1', '/f2'),
    isonline: null,
    showonlinestatus: false,
    isblocked: false,
    iscontact: Boolean(p.contacto),
    isdeleted: false,
    canmessageevenifblocked: false,
    canmessage: true,
    requirescontact: false,
    contactrequests: [],
  };
};

// The campus keeps what was written as HTML: the sample ones too, so they go through the same drawing.
const comoHtml = (texto) => `<p>${String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</p>`;

let siguienteId = 9000;
const msj = (de, hace, text) => ({ id: (siguienteId += 1), useridfrom: de, text, timecreated: ahora() - hace });

// Six messages a day, at hours people write, ending yesterday.
const HORAS_DEL_GRUPO = [10.25, 12.6, 15.1, 18.5, 20.2, 22.75];
const horaDelGrupo = (i) => {
  const desdeElFinal = CHARLA_GRUPO.length - 1 - i;
  const dia = 1 + Math.floor(desdeElFinal / HORAS_DEL_GRUPO.length);
  const hora = HORAS_DEL_GRUPO[HORAS_DEL_GRUPO.length - 1 - (desdeElFinal % HORAS_DEL_GRUPO.length)];
  return Math.floor(new Date().setHours(0, 0, 0, 0) / 1000) - dia * DIA + Math.round(hora * HORA);
};

// The group, a week of a practical work, so «Ver anteriores» has something to bring.
const CHARLA_GRUPO = [
  [23, 'Hola, ¿armamos el grupo para el TP integrador?'],
  [24, 'Dale, yo me sumo.'],
  [YO, 'Yo también. ¿Somos tres entonces?'],
  [23, 'Sí, con eso alcanza. La profe dijo hasta tres.'],
  [24, '¿Alguien leyó el enunciado completo?'],
  [YO, 'Yo lo leí. Son cuatro partes y la última es la más larga.'],
  [23, 'Propongo que cada uno agarre una y la cuarta la hacemos juntos.'],
  [24, 'Me parece bien.'],
  [YO, 'Yo puedo la primera, la del relevamiento.'],
  [24, 'Me quedo con la segunda.'],
  [23, 'Entonces yo la tercera.'],
  [24, '¿Para cuándo nos ponemos de fecha interna?'],
  [23, 'El domingo tendríamos que tener cada parte en borrador.'],
  [YO, 'Bien, así el lunes lo revisamos.'],
  [24, '¿Usamos la plantilla que subieron al aula?'],
  [23, 'Sí, mejor, así no nos bajan puntos por formato.'],
  [YO, 'Ya la bajé, la pongo en la carpeta compartida.'],
  [24, 'Genial, gracias.'],
  [23, 'Una duda, ¿la bibliografía va al final o en cada parte?'],
  [YO, 'Al final, en un solo apartado. Lo dice el punto 6 del enunciado.'],
  [23, 'Cierto, gracias.'],
  [24, 'Subí mi borrador de la segunda parte.'],
  [YO, 'Lo miro esta noche.'],
  [23, 'Yo también subí lo mío. Le falta revisar la ortografía.'],
  [YO, 'Le paso el corrector después.'],
  [24, '¿Les parece si los diagramas los hago yo? Tengo el programa instalado.'],
  [23, 'Sí, de una.'],
  [YO, 'Perfecto, avisanos si necesitás datos de mi parte.'],
  [24, 'Me faltaría la lista de actores de la primera parte.'],
  [YO, 'Te la paso mañana temprano.'],
  [23, 'Armé el documento compartido con las tres partes juntas.'],
  [24, 'Genial. Yo me encargo de que los diagramas queden parejos.'],
  [YO, 'Yo hago la introducción y las conclusiones.'],
  [23, '<p>Joya. Nos juntamos el <strong>jueves a las 18</strong> para unir todo.</p>'],
];

const CONVERSACIONES = [
  {
    id: 501,
    type: 1,
    otra: 21,
    unread: 0,
    mensajes: [
      msj(YO, 3 * DIA + 2 * HORA, comoHtml('Profe, ¿la entrega del TP 2 se puede hacer en grupo de tres?')),
      msj(21, 3 * DIA + HORA, '<p>Hola, sí. Grupos de hasta <strong>tres</strong> personas. Suban un solo archivo por grupo con los nombres de todos.</p>'),
      msj(YO, 3 * DIA + 50 * MINUTO, comoHtml('Perfecto, gracias.')),
      msj(21, DIA + 4 * HORA, `<p>Les dejé en el aula el <a href="${CAMPUS}/mod/resource/view.php?id=11">enunciado actualizado del TP 2</a>.</p><p>Cualquier duda me escriben por acá.</p>`),
      // A file sent from Super CVG (adjuntos.js), as the campus keeps it: the link becomes a link.
      msj(21, DIA + 3 * HORA, `<p>Y la guía resuelta, para que se fijen cómo se presenta.<br /><br />Archivo adjunto: Guía de ejercicios 3.pdf (1,2 MB)<br /><a href="${GUIA}">${GUIA}</a></p>`),
    ],
  },
  {
    id: 502,
    type: 1,
    otra: 22,
    unread: 2,
    mensajes: [
      msj(YO, 6 * DIA, comoHtml('¿Vas a ir a la consulta del viernes?')),
      msj(22, 6 * DIA - 20 * MINUTO, comoHtml('Sí, ahí nos vemos.')),
      msj(22, 2 * HORA, comoHtml('¿Pudiste ver el ejercicio 4 de la guía?')),
      msj(22, HORA + 35 * MINUTO, comoHtml('Me da distinto que en la resolución. No sé si es un error del apunte o mío.')),
    ],
  },
  {
    id: 503,
    type: 2,
    name: 'Grupo 3',
    subname: 'Materia de ejemplo A',
    integrantes: [YO, 23, 24],
    unread: 0,
    mensajes: CHARLA_GRUPO.map(([de, texto], i) => ({ ...msj(de, 0, texto.startsWith('<p>') ? texto : comoHtml(texto)), timecreated: horaDelGrupo(i) })),
  },
  {
    id: 504,
    type: 1,
    otra: 28,
    unread: 0,
    mensajes: [
      msj(28, 24 * DIA, comoHtml('Te paso los apuntes de la clase del martes cuando los pase en limpio.')),
      msj(YO, 24 * DIA - HORA, comoHtml('¡Gracias! Me salvás.')),
    ],
  },
];

const ultimoDe = (c) => c.mensajes.at(-1);
const conversacion = (c) => {
  const ultimo = ultimoDe(c);
  return {
    id: c.id,
    name: c.name ?? '',
    subname: c.subname ?? null,
    imageurl: c.type === 2 ? `${CAMPUS}/theme/image.php/boost/core/1/g/g1` : null,
    type: c.type,
    membercount: c.type === 2 ? c.integrantes.length : 2,
    ismuted: false,
    isfavourite: false,
    isread: c.unread === 0,
    unreadcount: c.unread || null,
    // Like the campus: in a one to one, the other person; in a group, whoever wrote last.
    members: [miembro(c.type === 1 ? c.otra : ultimo.useridfrom)],
    messages: ultimo ? [ultimo] : [],
    candeletemessagesforallusers: false,
  };
};

const ordenadas = () => [...CONVERSACIONES].sort((a, b) => (ultimoDe(b)?.timecreated ?? 0) - (ultimoDe(a)?.timecreated ?? 0));

// Like the campus search: the name has what was typed, capitals aside but accents as written.
const halladas = (texto) => {
  const buscado = String(texto ?? '').trim().toLowerCase();
  return GENTE.filter((p) => buscado && p.nombre.toLowerCase().includes(buscado));
};
const conConversaciones = (p) => ({
  ...miembro(p.id),
  conversations: CONVERSACIONES.filter((c) => c.type === 1 && c.otra === p.id).map((c) => ({ id: c.id, type: 1, name: '', timecreated: c.mensajes[0].timecreated })),
});

const RESPUESTAS = {
  core_message_get_unread_conversations_count: () => CONVERSACIONES.filter((c) => c.unread > 0).length,
  core_message_get_conversations: (p) => {
    const desde = Number(p.limitfrom) || 0;
    const cuantos = Number(p.limitnum) || CONVERSACIONES.length;
    return { conversations: ordenadas().slice(desde, desde + cuantos).map(conversacion) };
  },
  core_message_get_conversation_messages: (p) => {
    const c = CONVERSACIONES.find((x) => x.id === Number(p.convid));
    if (!c) return { exception: 'moodle_exception', errorcode: 'User is not part of conversation.' };
    const desde = Number(p.limitfrom) || 0;
    const cuantos = Number(p.limitnum) || c.mensajes.length;
    const mensajes = [...c.mensajes].reverse().slice(desde, desde + cuantos);
    return { id: c.id, members: [...new Set(mensajes.map((m) => m.useridfrom))].map(miembro), messages: mensajes };
  },
  core_message_message_search_users: (p) => {
    const gente = halladas(p.search).filter((g) => g.id !== Number(p.userid));
    return { contacts: gente.filter((g) => g.contacto).map(conConversaciones), noncontacts: gente.filter((g) => !g.contacto).map(conConversaciones) };
  },
};

// A message that says «falla» doesn't go, to see what happens then.
const falla = (texto) => /falla/i.test(texto);

export const DEMO_MENSAJES = {
  /** The reads, with a short pause so the loading shapes can be seen. */
  leer(funcion, parametros = {}) {
    const respuesta = RESPUESTAS[funcion]?.(parametros);
    if (respuesta === undefined || respuesta?.exception) return Promise.reject(new ErrorCampus('El campus no pudo responder. Probá de nuevo en un rato.', 'demo'));
    return enUnRato(respuesta, funcion === 'core_message_get_unread_conversations_count' ? 0 : 250);
  },

  /** Pretend core_message_send_messages_to_conversation. */
  responder(conversacionId, texto, yo = YO) {
    const c = CONVERSACIONES.find((x) => x.id === conversacionId);
    if (!c || falla(texto)) return enUnRato({ exception: 'moodle_exception', errorcode: 'unabletosend', message: 'interno' });
    const nuevo = { id: (siguienteId += 1), useridfrom: yo, text: comoHtml(texto), timecreated: ahora() };
    c.mensajes.push(nuevo);
    return enUnRato([nuevo]);
  },

  /** Pretend core_message_send_instant_messages: opens the conversation if there is none. */
  mandar(personaId, texto, yo = YO) {
    if (falla(texto) || !GENTE.some((g) => g.id === personaId)) return enUnRato([{ msgid: -1, errormessage: 'No se pudo mandar' }]);
    let c = CONVERSACIONES.find((x) => x.type === 1 && x.otra === personaId);
    if (!c) {
      c = { id: 600 + personaId, type: 1, otra: personaId, unread: 0, mensajes: [] };
      CONVERSACIONES.push(c);
    }
    const nuevo = { id: (siguienteId += 1), useridfrom: yo, text: comoHtml(texto), timecreated: ahora() };
    c.mensajes.push(nuevo);
    return enUnRato([{ msgid: nuevo.id, conversationid: c.id, useridfrom: yo, text: nuevo.text, timecreated: nuevo.timecreated, candeletemessagesforallusers: false }]);
  },

  /** Pretend core_message_mark_all_conversation_messages_as_read. */
  marcar(conversacionId) {
    const c = CONVERSACIONES.find((x) => x.id === conversacionId);
    if (c) c.unread = 0;
    return enUnRato(null, 150);
  },
};

// A drawn face for the teacher, so a picture can be seen next to the initials of the rest.
const CARA = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#cfe0ee"/><path d="M10 66c2-14 11-21 22-21s20 7 22 21z" fill="#0b5a9e"/><circle cx="32" cy="27" r="11" fill="#e8b896"/><path d="M20 28c-1-11 5-17 12-17s13 5 12 17c-2-6-6-9-12-9s-10 3-12 9z" fill="#3b2a20"/></svg>`;

/** The picture of the sample people: only the teacher has one. */
export const fotoDemo = (direccion) => (direccion?.includes('/pluginfile.php/301/user/icon/') ? `data:image/svg+xml,${encodeURIComponent(CARA)}` : null);
