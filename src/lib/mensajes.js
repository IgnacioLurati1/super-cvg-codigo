// Private messages of the campus as Mensajes shows them. Pure functions: no network here. What the campus writes in a
// message is HTML: it only reaches the page as blocks of text (bloquesCampus.js) or as plain text.
import { leerAdjunto } from './adjuntos';
import { leerBloques } from './bloquesCampus';
import { normalizar, textoPlano } from './datos';
import { CAMPUS } from './moodle';

export { LARGO_MAXIMO, largoEnBytes } from './moodle';

const INDIVIDUAL = 1;
const GRUPO = 2;
const numero = (n) => Number.isSafeInteger(n) && n > 0;

/** The address to bring a picture from, only when it is one the person or the group uploaded to the campus. The campus
 * drawing for someone without one (theme/image.php) gives initials instead, with no request. */
export function fotoDe(direccion) {
  if (!direccion) return null;
  try {
    const url = new URL(direccion);
    const ruta = /^\/(?:webservice\/)?pluginfile\.php\/(\d+\/(?:user|group)\/icon\/[\w/.-]+)$/.exec(url.pathname);
    if (url.origin !== CAMPUS || !ruta) return null;
    url.searchParams.delete('token');
    url.searchParams.delete('wstoken');
    return `${CAMPUS}/webservice/pluginfile.php/${ruta[1]}${url.search}`;
  } catch {
    return null;
  }
}

/** Two letters for a name: the first and the last word. */
export function iniciales(nombre) {
  const palabras = String(nombre ?? '').trim().split(/\s+/).filter((p) => /\p{L}|\p{N}/u.test(p));
  const letras = palabras.length > 1 ? [palabras[0], palabras.at(-1)] : palabras;
  return letras.map((p) => [...p.replace(/^[^\p{L}\p{N}]+/u, '')][0] ?? '').join('').toLocaleUpperCase('es') || '?';
}

/** A member of a conversation or a search result. `puedeRecibir`: false when the campus says this person can't get
 * messages from the student, null when it didn't say (groups, searches). `conversacion`: the one between the two, if any. */
export function persona(m) {
  if (!m || !numero(m.id)) return null;
  const individual = (m.conversations ?? []).find((c) => c?.type === INDIVIDUAL && numero(c.id));
  return {
    id: m.id,
    nombre: textoPlano(m.fullname) || 'Alguien del campus',
    foto: fotoDe(m.profileimageurlsmall || m.profileimageurl),
    borrada: m.isdeleted === true,
    bloqueada: m.isblocked === true,
    puedeRecibir: typeof m.canmessage === 'boolean' ? m.canmessage : null,
    conversacion: individual ? individual.id : null,
  };
}

const textoDeBloques = (bloques) => bloques.flatMap((b) => (b.tipo === 'parrafo' ? b.lineas : b.tipo === 'lista' ? b.items : [b.partes])).map((partes) => partes.map((p) => p.texto).join('')).join(' ').trim();

/** One message: the text as blocks to draw, and as plain text for the search. One that ends in a file sent from Super
 * CVG (adjuntos.js) carries it in `adjunto`, out of its blocks. `vista`: what the list shows of it. */
export function mensaje(m) {
  if (!m || !numero(m.id)) return null;
  const bloques = leerBloques(m.text, 5000);
  const conArchivo = leerAdjunto(bloques);
  const texto = textoPlano(m.text);
  return {
    id: m.id,
    de: Number(m.useridfrom) || 0,
    bloques: conArchivo ? conArchivo.bloques : bloques,
    adjunto: conArchivo ? conArchivo.adjunto : null,
    texto,
    vista: conArchivo ? textoDeBloques(conArchivo.bloques) || `Archivo: ${conArchivo.adjunto.nombre}` : texto,
    cuando: Number(m.timecreated) || 0,
  };
}

/** One conversation of the list. Individual ones carry the other person; group ones (a course group), its name, the
 * course and, in `persona`, whoever wrote last. The one with oneself (type 3) stays out: it is not a message to anyone. */
export function conversacion(c, yo) {
  if (!c || !numero(c.id) || (c.type !== INDIVIDUAL && c.type !== GRUPO)) return null;
  const miembros = (c.members ?? []).map(persona).filter(Boolean);
  const ultimo = mensaje((c.messages ?? [])[0]);
  const sinLeer = Number(c.unreadcount) > 0 ? Number(c.unreadcount) : c.isread === false ? 1 : 0;
  if (c.type === INDIVIDUAL) {
    const otra = miembros.find((m) => m.id !== yo);
    if (!otra) return null;
    return { id: c.id, grupo: false, nombre: otra.nombre, detalle: '', foto: otra.foto, persona: otra, sinLeer, ultimo };
  }
  return {
    id: c.id,
    grupo: true,
    nombre: textoPlano(c.name) || 'Grupo',
    detalle: textoPlano(c.subname),
    foto: fotoDe(c.imageurl),
    personas: Number(c.membercount) || 0,
    persona: miembros[0] ?? null,
    sinLeer,
    ultimo,
  };
}

export const conversaciones = (lista, yo) => (Array.isArray(lista) ? lista : []).map((c) => conversacion(c, yo)).filter(Boolean);

/** A batch of a conversation, asked newest first: the messages from the oldest on, and who wrote them. */
export function tandaDeMensajes(respuesta) {
  const mensajes = (respuesta?.messages ?? []).map(mensaje).filter(Boolean).reverse();
  const miembros = (respuesta?.members ?? []).map(persona).filter(Boolean);
  return { mensajes, miembros };
}

/** Joins a new batch to what is shown: by id, so a message that slid into the next batch doesn't show twice. */
export function juntarMensajes(viejos, nuevos) {
  const vistos = new Set(viejos.map((m) => m.id));
  return [...nuevos.filter((m) => !vistos.has(m.id)), ...viejos].sort((a, b) => a.cuando - b.cuando || a.id - b.id);
}

/** People found by name: contacts first, without the student. */
export function personasHalladas(respuesta, yo) {
  const todas = [...(respuesta?.contacts ?? []), ...(respuesta?.noncontacts ?? [])].map(persona).filter((p) => p && p.id !== yo && !p.borrada);
  return [...new Map(todas.map((p) => [p.id, p])).values()];
}

/** The conversations that have every word of the search in their name, course or last message, accents aside. */
export function filtrarConversaciones(lista, consulta) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return lista;
  return lista.filter((c) => {
    const todo = normalizar(`${c.nombre} ${c.detalle} ${c.persona?.nombre ?? ''} ${c.ultimo?.texto ?? ''}`);
    return palabras.every((p) => todo.includes(p));
  });
}

/** Whether what was typed is what a message of the campus says, as plain text: to tell whether one that seemed lost
 * got there. */
const unaLinea = (texto) => normalizar(String(texto ?? '').replace(/\s+/g, ' '));
export const mismoTexto = (escrito, plano) => unaLinea(escrito) !== '' && unaLinea(escrito) === unaLinea(plano);

const inicioDelDia = (ms) => new Date(ms).setHours(0, 0, 0, 0);
const DIAS = (a, b) => Math.round((inicioDelDia(a) - inicioDelDia(b)) / 86_400_000);
// The hour as it is said here, «19:40».
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const DIA_MES = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });
const DIA_LARGO = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const sinPunto = (texto) => texto.replace('.', '');
const conMayuscula = (texto) => texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);

export const horaDeMensaje = (segundos) => HORA.format(new Date(segundos * 1000));

/** When, in the list: the hour today, «ayer», the day of the week this week, the date before. */
export function cuandoCorto(segundos, ahoraMs = Date.now()) {
  if (!segundos) return '';
  const ms = segundos * 1000;
  const dias = DIAS(ahoraMs, ms);
  if (dias <= 0) return horaDeMensaje(segundos);
  if (dias === 1) return 'ayer';
  if (dias < 7) return sinPunto(DIA_SEMANA.format(ms));
  const fecha = sinPunto(DIA_MES.format(ms));
  return new Date(ms).getFullYear() === new Date(ahoraMs).getFullYear() ? fecha : `${fecha} ${new Date(ms).getFullYear()}`;
}

/** The day over a run of messages: «Hoy», «Ayer» or the date, with the year when it is another one. */
export function diaDeMensajes(segundos, ahoraMs = Date.now()) {
  const ms = segundos * 1000;
  const dias = DIAS(ahoraMs, ms);
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const texto = conMayuscula(DIA_LARGO.format(ms));
  return new Date(ms).getFullYear() === new Date(ahoraMs).getFullYear() ? texto : `${texto} de ${new Date(ms).getFullYear()}`;
}

/** The messages in runs of one day each. */
export function porDia(mensajes) {
  const dias = [];
  for (const m of mensajes) {
    const clave = new Date(m.cuando * 1000).toDateString();
    if (dias.at(-1)?.clave !== clave) dias.push({ clave, cuando: m.cuando, mensajes: [] });
    dias.at(-1).mensajes.push(m);
  }
  return dias;
}
