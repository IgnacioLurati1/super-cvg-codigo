// The campus notifications, for the bell of the header (Campana.jsx): what Moodle 4.x sends through
// message_popup_get_popup_notifications, cleaned like the dates of the campus (tituloLimpio of datos.js) and without the
// boilerplate of its mails (footers, breadcrumbs, addresses, the preamble of a forum digest). Pure: no network and no
// storage here. Everything comes out as plain text, and the only links are campus addresses or routes of Super CVG.
import { seVeAviso } from './avisos';
import { enlaceSeguro, leerTexto, normalizar, textoPlano, tituloLimpio } from './datos';
import { diaDeMensajes } from './mensajes';
import { CAMPUS } from './moodle';

/** How long a body goes, at most: two lines in the bell. */
export const LARGO_CUERPO = 180;

const numero = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const leerJson = (texto) => {
  try {
    const o = JSON.parse(texto);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
};

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A campus address the notification points to, or null: anything outside the campus is left out. */
function delCampus(direccion) {
  const segura = enlaceSeguro(direccion);
  if (!segura) return null;
  const url = new URL(segura);
  return url.origin === CAMPUS ? url : null;
}

// Names of a course long enough to be told apart in a text: the full one and the short one (forums put the short one
// before the subject, «AED-2026: Cambio de horario»).
const nombresDe = (m) => [m?.nombre, m?.corto].filter((n) => typeof n === 'string' && n.trim().length >= 3).sort((a, b) => b.length - a.length);

// The text of the message, as lines: the HTML version when there is one, else the plain one, else the short one.
const lineasDe = (n) => leerTexto(n?.fullmessagehtml || n?.fullmessage || n?.text || n?.smallmessage || '').texto.split('\n');

/** The course of a notification among the student's ones (`materias`: { id, nombre, corto }), or null. By the number the
 * campus sends with it, by its address, or by its name at the start of the subject or in the breadcrumb of the
 * message. A course that is not the student's (the campus front page is course 1) counts as none. */
export function materiaDeNotificacion(n, materias) {
  const propias = Array.isArray(materias) ? materias : [];
  const datos = leerJson(n?.customdata);
  const url = delCampus(n?.contexturl);
  for (const id of [numero(datos.courseid), url?.pathname === '/course/view.php' ? numero(url.searchParams.get('id')) : null]) {
    const m = id && propias.find((x) => x.id === id);
    if (m) return m;
  }
  const asunto = normalizar(textoPlano(n?.subject));
  const lineas = lineasDe(n).slice(0, 6).map(normalizar);
  const candidatos = propias.flatMap((m) => nombresDe(m).map((nombre) => ({ m, nombre: normalizar(nombre) }))).sort((a, b) => b.nombre.length - a.nombre.length);
  for (const { m, nombre } of candidatos) {
    const e = escapar(nombre);
    if (new RegExp(`^${e}(?:\\s*[:\\-–—]|\\s+(?:nuevo|contenido)\\b)`, 'u').test(asunto)) return m;
    if (lineas.some((l) => new RegExp(`^${e}\\s*(?:->|»|›)`, 'u').test(l) || new RegExp(`\\bcurso\\s+["'«“]?${e}\\b`, 'u').test(l))) return m;
  }
  return null;
}

// The course where Moodle repeats it: before the subject («AED-2026: …», «Materia A - …») or after it («… (Materia A)»).
function sinMateria(texto, materia) {
  let t = texto;
  for (const nombre of nombresDe(materia)) {
    const e = escapar(nombre);
    t = t.replace(new RegExp(`^${e}\\s*(?::|-|–|—|->|»)\\s*`, 'iu'), '').replace(new RegExp(`\\s*(?:\\(${e}\\)|\\[${e}\\]|\\s[-–—]\\s+${e})$`, 'iu'), '');
  }
  return t.trim() || texto;
}

// «Re:» and its kin before the subject of a forum answer: the discussion is the same.
const RESPUESTA = /^(?:(?:re|rv|fw|fwd)\s*:\s*)+/iu;

// Lines of a campus mail that say nothing to the student. Matched against the line without accents and in lower case.
const RUIDO = [
  /^[-=_*~.•\s]{3,}$/,
  // «Materia A -> Foros -> Avisos -> Cambio de horario», with two steps at least: «p -> q» alone is a post about logic.
  /\s(?:->|»|›)\s.*\s(?:->|»|›)\s/,
  // The course over each forum of a digest: «Curso: ISI-AED-2026 -> Avisos».
  /^(?:curso|course)\s*:.*\s(?:->|»|›)\s/,
  // «por Ana Ejemplo - martes, 4 de noviembre de 2026, 10:12».
  /^(?:por|by)\s.{2,80}\s[-–—]\s.*\d/,
  // A greeting alone: «Hola Ejemplo,».
  /^(?:hola|hi|hello|estimad[oa]s?)(?:\s+\p{L}+){0,3}\s*[,!:]?$/u,
  // «Este es un mensaje enviado…», «Este es su resumen diario…», «Este correo fue generado…».
  /^est[ae]\s+(?:es\s+(?:un|una|el|su|tu)\s+)?(?:mensaje|correo|e-?mail|resumen|notificacion|aviso|copia)\b/,
  /^(?:this\s+is\s+(?:a|an|your)\b|here\s+is\s+your\b|aqui\s+(?:tiene|tenes|tienes)\s+(?:su|tu|el)\s+resumen)/,
  // «Para dejar de recibir…», «Si no querés recibir…», «Darse de baja de este foro».
  /\b(?:dejar\s+de\s+recibir|darse\s+de\s+baja|darte\s+de\s+baja|desuscribir(?:se|te)?|no\s+(?:quiere|queres|quieres|desea)\s+recibir|unsubscribe|stop\s+receiving)\b/,
  // «Ir a la actividad», «Ir al foro», «Ir a: Tarea 3», «Go to…».
  /^(?:ir|volver)\s+(?:a|al)\b/,
  /^go\s+to\b/,
  // «Ver el mensaje en su contexto», «Ver la discusión», «See this post in context».
  /^ver\s+(?:el|este|la|esta|los|todos\s+los)\s+(?:mensajes?|publicacion(?:es)?|discusion(?:es)?|tarea|actividad|entrega|foro|cuestionario|curso|notificaciones)\b.{0,30}$/,
  /\bin\s+context\b|\ben\s+su\s+contexto\b/,
  /^(?:responder|reply|ver|view)\s*:?$/,
  // «Cambie sus preferencias de notificación», «Preferencias de correo del foro».
  /\bpreferencias\s+(?:de|del)\s+(?:notificacion|notificaciones|correo|mensajes|resumen|foro|suscripcion)|\b(?:notification|email|digest)\s+preferences\b/,
  /^(?:cambi\w*|modific\w*|administr\w*|change)\s+(?:sus|tus|your)\s+preferencias|preferences\b/,
  /\b(?:no\s+respond\w*|do\s+not\s+reply)\b/,
  /^(?:enviado|sent)\s+(?:desde|por|from|by)\b/,
  // «Puede verlos añadidos a su tarea enviada:», «Puede acceder a este cuestionario en…».
  /^(?:usted\s+)?(?:puede|podes|podra|you\s+can)\s+(?:verl[oa]s?|ver|acceder|consultar|revisar|see|access|view)\b/,
];
const URL_SUELTA = /\b(?:https?:\/\/|www\.)\S+/giu;
// The goodbye, alone or with the name: «Saludos», «Saludos cordiales, Laura». The name may come on the lines under it.
const DESPEDIDA = /^(?:saludos(?:\s+cordiales)?|cordiales\s+saludos|atte\.?|atentamente|(?:un\s+)?abrazos?|regards|best\s+regards|cheers)(?:[\s,.!]+\p{L}+){0,3}[\s.,!]*$/u;
const FIRMA = /^\p{L}[\p{L}.'-]*(?:\s+\p{L}[\p{L}.'-]*){0,3}$/u;

// Cut at a word, with «…» when it goes on.
function cortar(texto, largo) {
  if (texto.length <= largo) return texto;
  const corte = texto.slice(0, largo);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > largo / 2 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.]+$/u, '')}…`;
}

/** The body of a notification as plain text, without the boilerplate of the campus mails, the addresses, the course and
 * the title repeated. Empty when nothing is left. */
export function cuerpoLimpio(n, { titulo = '', materia = null } = {}) {
  const repetidos = new Set([titulo, ...nombresDe(materia)].map(normalizar).filter(Boolean));
  // A breadcrumb of one step that starts with the course: «Materia A -> Calificaciones».
  const migas = nombresDe(materia).map((nombre) => new RegExp(`^${escapar(normalizar(nombre))}\\s*(?:->|»|›)\\s`, 'u'));
  const quedan = [];
  const lineas = lineasDe(n);
  let firmando = false;
  lineas.forEach((linea, i) => {
    const conDireccion = URL_SUELTA.test(linea);
    URL_SUELTA.lastIndex = 0;
    let texto = linea.replace(URL_SUELTA, ' ').replace(/[<>()[\]]\s*[<>()[\]]/gu, ' ').replace(/\s+/gu, ' ').trim();
    for (const nombre of nombresDe(materia)) texto = texto.replace(new RegExp(`^${escapar(nombre)}\\s*:\\s*`, 'iu'), '');
    const plano = normalizar(texto);
    if (!/[\p{L}\p{N}]/u.test(plano) || repetidos.has(plano.replace(RESPUESTA, '')) || RUIDO.some((r) => r.test(plano)) || migas.some((r) => r.test(plano))) return;
    if (DESPEDIDA.test(plano) || (firmando && FIRMA.test(plano))) {
      firmando = true;
      return;
    }
    firmando = false;
    // A line that only introduced an address, now gone: «Podés verla en:», «Ver más en».
    const siguiente = lineas.slice(i + 1).find((l) => l.trim());
    if (/:$/.test(texto) && (conDireccion || !siguiente || /^\s*(?:https?:\/\/|www\.)\S+\s*$/iu.test(siguiente))) return;
    quedan.push(texto);
  });
  // A heading (the name of a discussion) and the text under it read as two sentences, not one. Only a short line: a
  // long one may be a sentence the plain mail cut in two.
  const junto = quedan
    .map((t, i) => (t.length > 50 || /[.!?:;,…]$/u.test(t) || !/^[\p{Lu}¿¡]/u.test(quedan[i + 1] ?? '') ? t : `${t}.`))
    .join(' ')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .replace(/^[\s,.;:–—-]+/u, '')
    .trim();
  return normalizar(junto) === normalizar(titulo) ? '' : cortar(junto, LARGO_CUERPO);
}

/** Who wrote a forum post, from the line «por Ana Ejemplo - martes…» of its mail, or ''. */
export function autorDe(n) {
  for (const linea of lineasDe(n)) {
    const m = /^(?:por|by)\s+(.{2,80}?)\s+[-–—]\s+.*\d/iu.exec(linea.trim());
    if (m) return m[1];
  }
  return '';
}

// What happens and when, from a subject like «Abre en sábado, 24 de octubre de 2026, 09:00: Parcial 1».
const MOMENTO = /^(se\s+abre|abre|se\s+cierra|cierra|vence)\s+(?:en|el)\s+(.{4,70}?(?:\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?|\d{4}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?))(?:\s*h(?:s|rs)?\.?)?\s*:\s*\S/iu;

/** «Abre el sábado 24 de octubre, 09:00.», for a subject that carries what happens and when, or ''. The year goes only
 * when it is not the one of the notification. */
const HASTA_2100 = 4_102_444_800;

export function momentoDe(asunto, cuando = 0) {
  const m = MOMENTO.exec(String(asunto ?? '').trim());
  if (!m) return '';
  const verbo = normalizar(m[1]).replace(/^se\s+/, '');
  const anio = new Date((cuando || Date.now() / 1000) * 1000).getFullYear();
  const fecha = m[2].replace(/^(\p{L}+),\s+/u, '$1 ').replace(new RegExp(`\\s+de\\s+${anio}\\b`, 'u'), '').trim();
  return `${verbo.charAt(0).toUpperCase()}${verbo.slice(1)} el ${fecha}.`;
}

// The kinds of notification Super CVG says in its own words, by what the campus sends with them (component and
// eventtype) or, when those don't come, by the words of the subject, in Spanish or English.
const ENTRE_COMILLAS = String.raw`[«"'“]?(.+?)[»"'”]?\.?`;
const DEVOLUCION = new RegExp(String.raw`^(.+?)\s+(?:ha\s+(?:dado|dejado|publicado|realizado)|dio|dej[oó]|has\s+(?:given|posted))\b.*?\b(?:retroalimentaci[oó]n|comentarios?|devoluci[oó]n|feedback)\b.*?\b(?:tarea|assignment)(?:\s+(?:para|de|for))?\s+${ENTRE_COMILLAS}$`, 'iu');
const ENTREGA = new RegExp(String.raw`^(?:(?:usted\s+)?ha\s+enviado|enviaste|you\s+have\s+submitted)\b.*?\b(?:tarea|assignment)(?:\s+(?:para|de|for))?\s+${ENTRE_COMILLAS}$`, 'iu');
const CUESTIONARIO = /^(?:confirmaci[oó]n\s+de(?:l)?\s+env[ií]o\s+(?:del?\s+)?cuestionario|quiz\s+submission\s+confirmation)\s*:\s*(.+)$/iu;
const INTENTO = /^(?:(?:el\s+)?intento\s+(?:ahora\s+)?vencido|attempt\s+now\s+overdue)\s*:\s*(.+)$/iu;
const CONTENIDO = /(?:\bnuevo\s+contenido|\bcontenido\s+(?:nuevo|cambiado|actualizado|modificado)|\bnew\s+content|\bcontent\s+change)\s*$/iu;
const RESUMEN = /\bresumen\s+(?:diario\s+)?(?:del?|de\s+los)\s+foros?\b|\bforum\s+digest\b/iu;

function queEs(n, asunto) {
  const componente = String(n?.component ?? '');
  const evento = String(n?.eventtype ?? '');
  const datos = leerJson(n?.customdata);
  const nombre = textoPlano(n?.contexturlname);
  const devolucion = DEVOLUCION.exec(asunto);
  if (datos.messagetype === 'feedbackavailable' || devolucion) {
    const quien = devolucion?.[1];
    return { tipo: 'devolucion', titulo: nombre || devolucion?.[2], cuerpo: quien ? `${quien} te dejó una devolución.` : 'Te dejaron una devolución.' };
  }
  const entrega = ENTREGA.exec(asunto);
  if (/^submissionreceipt/.test(String(datos.messagetype ?? '')) || entrega) {
    return { tipo: 'entrega', titulo: nombre || entrega?.[1], cuerpo: 'Tu entrega llegó al campus.' };
  }
  const cuestionario = CUESTIONARIO.exec(asunto);
  if (cuestionario || (componente === 'mod_quiz' && /^(?:confirmation|submission)$/.test(evento))) {
    return { tipo: 'cuestionario', titulo: cuestionario?.[1] || nombre, cuerpo: 'Tus respuestas llegaron al campus.' };
  }
  const intento = INTENTO.exec(asunto);
  if (intento || (componente === 'mod_quiz' && evento === 'attempt_overdue')) {
    return { tipo: 'intento', titulo: intento?.[1] || nombre, cuerpo: 'Se terminó el tiempo y tu intento quedó sin enviar.' };
  }
  if (evento === 'coursecontentupdated' || CONTENIDO.test(asunto)) {
    const nuevo = /\bnuevo\b|\bnew\b/iu.test(asunto) || /\bes\s+nuev[oa]\b|\bis\s+new\b/iu.test(lineasDe(n).join(' '));
    return { tipo: 'contenido', titulo: nombre || (nuevo ? 'Contenido nuevo' : 'Contenido cambiado'), cuerpo: nuevo ? 'Nuevo en la materia.' : 'Cambió en la materia.' };
  }
  if (evento === 'digests' || RESUMEN.test(asunto)) return { tipo: 'resumen', titulo: 'Resumen de los foros' };
  if (/^assign_(?:due_soon|due_digest)$/.test(evento)) return { tipo: 'vence', cuerpo: momentoDe(asunto, n?.timecreated) || 'Vence pronto.' };
  if (evento === 'assign_overdue') return { tipo: 'vence', cuerpo: 'Ya venció.' };
  if (componente === 'mod_forum') return { tipo: 'foro', titulo: nombre };
  // Only so the student can choose which ones to see (avisos.js): the text is the campus's, as before.
  if (/grad/.test(evento)) return { tipo: 'nota' };
  if (evento === 'messagecontactrequests') return { tipo: 'contacto' };
  const momento = momentoDe(asunto, n?.timecreated);
  if (momento) return { tipo: 'fecha', cuerpo: momento };
  return { tipo: 'otro' };
}

/** Where a notification leads: a screen of Super CVG when there is one (the task, Mensajes or the course), and
 * its campus address. { ruta, campus }, each one or null. */
export function destinoDe(n, materia) {
  const url = delCampus(n?.contexturl);
  const campus = url?.href ?? null;
  const datos = leerJson(n?.customdata);
  const p = url?.pathname ?? '';
  const id = url ? numero(url.searchParams.get('id')) : null;
  const tarea = p === '/mod/assign/view.php' ? id : String(n?.component ?? '') === 'mod_assign' ? numero(datos.cmid) : null;
  if (tarea && materia) return { ruta: `/materias/${materia.id}/tareas/${tarea}`, campus };
  if (/^\/grade\//.test(p) || (p === '/course/user.php' && url.searchParams.get('mode') === 'grade') || /grad/.test(String(n?.eventtype ?? ''))) return { ruta: null, campus };
  if (/^\/message\//.test(p)) return { ruta: '/mensajes', campus };
  // A forum post: its discussion, read in Foros (inside Mensajes).
  const discusion = p === '/mod/forum/discuss.php' ? numero(url.searchParams.get('d')) : null;
  if (discusion) return { ruta: `/mensajes/foros/${discusion}`, campus };
  if (materia && ((p === '/course/view.php' && id === materia.id) || /^\/mod\/(?:resource|folder|url|page|book|label)\/view\.php$/.test(p))) {
    return { ruta: `/materias/${materia.id}`, campus };
  }
  return { ruta: null, campus };
}

/** One notification as the bell shows it: { clave, id, tipo, titulo, cuerpo, autor, cuando, leida, materia, ruta,
 * campus }. `materias`: the student's courses, { id, nombre, corto }. */
export function limpiarNotificacion(n, materias, indice = 0) {
  const materia = materiaDeNotificacion(n, materias);
  const asunto = sinMateria(textoPlano(n?.subject), materia).replace(RESPUESTA, '');
  const que = queEs(n, asunto);
  const titulo = tituloLimpio(sinMateria(que.titulo ? textoPlano(que.titulo) : asunto, materia)).replace(RESPUESTA, '') || 'Notificación del campus';
  const cuerpo = que.cuerpo ?? cuerpoLimpio(n, { titulo, materia });
  // A date a browser can write: a huge number would break the whole bell when formatting it.
  const segundos = numero(n?.timecreated) ?? 0;
  const cuando = segundos > 0 && segundos < HASTA_2100 ? segundos : 0;
  return {
    // The campus doesn't promise its ids are unique in one answer.
    clave: `${n?.id ?? 0}.${cuando}.${indice}`,
    id: n?.id ?? null,
    tipo: que.tipo,
    titulo,
    cuerpo,
    autor: que.tipo === 'foro' ? autorDe(n) : '',
    cuando,
    leida: Boolean(n?.read) || Boolean(numero(n?.timeread)),
    materia: materia ? { id: materia.id, nombre: materia.nombre } : null,
    ...destinoDe(n, materia),
  };
}

/** The notifications of an answer of the campus, newest first, without the deleted ones. */
export function limpiarNotificaciones(lista, materias) {
  return (Array.isArray(lista) ? lista : [])
    .filter((n) => n && typeof n === 'object' && !n.deleted)
    .map((n, i) => limpiarNotificacion(n, materias, i))
    .sort((a, b) => b.cuando - a.cuando);
}

/** Whether a notification looks unread: unread in the campus and newer than the last time the student opened the bell. */
export const esNueva = (n, visto) => !n.leida && n.cuando > visto;

/** The number on the bell. `conteo`: the unread ones the campus counts. `visto`: until when the student saw them (0,
 * never: then the campus count). `lista`: the latest ones, to tell which unread ones came after. `sacadas`: the numbers
 * of the ones the student took out (campana.js), that never count. `ocultos`: the kinds the student doesn't want to see
 * (avisos.js), that don't count either. */
export function cuantasSinVer(lista, visto, conteo, sacadas = new Set(), ocultos = new Set(), materiasFuera = new Set()) {
  if (!conteo) return 0;
  const fuera = (n) => sacadas.has(n.id) || !seVeAviso(n, ocultos, materiasFuera);
  if (!visto) return Math.max(0, conteo - (lista ?? []).filter((n) => !n.leida && fuera(n)).length);
  return Math.min(conteo, (lista ?? []).filter((n) => esNueva(n, visto) && !fuera(n)).length);
}

/** Until when the bell was seen, after opening it: the newest notification there is, never going back. */
export const vistoHasta = (lista, visto) => Math.max(visto || 0, ...(lista ?? []).map((n) => n.cuando));

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** When, next to a notification: «recién», «hace 5 min» or «hace 3 h» today, the hour before (the day goes above). */
export function haceCuanto(segundos, ahoraMs = Date.now()) {
  const ms = segundos * 1000;
  if (!mismoDia(ms, ahoraMs)) return HORA.format(new Date(ms));
  const s = Math.max(0, Math.round((ahoraMs - ms) / 1000));
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  return `hace ${Math.floor(s / 3600)} h`;
}

/** The notifications in runs of one day each, newest first: { clave, titulo («Hoy», «Ayer» or the date), items }. */
export function porDia(lista, ahoraMs = Date.now()) {
  const dias = [];
  for (const n of [...(lista ?? [])].sort((a, b) => b.cuando - a.cuando)) {
    const clave = new Date(n.cuando * 1000).toDateString();
    if (dias.at(-1)?.clave !== clave) dias.push({ clave, titulo: diaDeMensajes(n.cuando, ahoraMs), items: [] });
    dias.at(-1).items.push(n);
  }
  return dias;
}
