// The forums of the campus (mod_forum) as Foros shows them. Pure: no network here. What the campus answers is read
// field by field and shown only as text or as blocks (bloquesCampus.js): nothing of its HTML reaches the page.
//   - Every forum of the courses in progress in one list, the discussions with the latest activity first.
//   - A discussion is read as a conversation: the first post on top, the answers in the order they were written, each
//     one saying whom it answers. «Re: Re:» and the message a mail answer quotes go away.
//   - What's new is kept by this browser (`cl.foros.<alumno>`): only numbers, the discussion and when it was last seen.
//     The campus is never told.
import { leerBloques } from './bloquesCampus';
import { normalizar, primeraFrase, textoPlano } from './datos';
import { CAMPUS } from './moodle';
import { archivosDe } from './tareas';

const numero = (n) => (Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : null);
const DIA = 86_400;

/** The campus' address of a forum, a discussion or one of its posts. Only numbers go in them. */
export const foroEnElCampus = (cmid) => `${CAMPUS}/mod/forum/view.php?id=${cmid}`;
export const discusionEnElCampus = (id, post = null) => `${CAMPUS}/mod/forum/discuss.php?d=${id}${post ? `#p${post}` : ''}`;
/** Where a discussion opens in Super CVG: Foros lives inside Mensajes. */
export const rutaDeDiscusion = (id) => `/mensajes/foros/${id}`;
export const rutaDeForo = (cmid) => `/mensajes/foros?foro=${cmid}`;

// «Re:», «RE:», «Re[2]:», «Rta:», «Fwd:» and their kin, as many as there are.
const PREFIJO = /^\s*(?:(?:re|rta|resp|fwd?|rv)\s*(?:\[\d+\])?\s*:\s*)+/iu;
/** A subject without the «Re:» an answer puts before it. */
export const sinRe = (asunto) => String(asunto ?? '').replace(PREFIJO, '').trim();

// The kinds of forum, as the campus calls them. «news» is the one of the teachers' announcements of each course.
const TIPOS = { news: 'avisos', qanda: 'preguntas', single: 'unico', eachuser: 'cada-uno', blog: 'blog', general: 'general' };

/** Every forum of `mod_forum_get_forums_by_courses` of a course in `materias` (id -> name), announcements first. */
export function leerForos(respuesta, materias) {
  const foros = [];
  for (const f of Array.isArray(respuesta) ? respuesta : []) {
    const id = numero(f?.id);
    const cmid = numero(f?.cmid);
    const materiaId = numero(f?.course);
    if (!id || !cmid || !materiaId || !(materiaId in materias)) continue;
    foros.push({
      id,
      cmid,
      materiaId,
      materia: materias[materiaId],
      nombre: textoPlano(f.name) || 'Foro',
      tipo: TIPOS[f.type] ?? 'general',
      discusiones: Math.max(0, Number(f.numdiscussions) || 0),
    });
  }
  return foros.sort((a, b) => a.materia.localeCompare(b.materia, 'es') || (b.tipo === 'avisos') - (a.tipo === 'avisos') || a.nombre.localeCompare(b.nombre, 'es'));
}

/** The discussions of one forum (`mod_forum_get_forum_discussions`), each one with its forum and course. */
export function leerDiscusiones(respuesta, foro) {
  const lista = [];
  for (const d of Array.isArray(respuesta?.discussions) ? respuesta.discussions : []) {
    const id = numero(d?.discussion);
    if (!id) continue;
    const texto = textoPlano(d.message);
    lista.push({
      id,
      foroId: foro.id,
      foroCmid: foro.cmid,
      foro: foro.nombre,
      avisos: foro.tipo === 'avisos',
      materiaId: foro.materiaId,
      materia: foro.materia,
      titulo: sinRe(textoPlano(d.name || d.subject)) || 'Sin título',
      autor: textoPlano(d.userfullname) || 'Alguien',
      ultimo: textoPlano(d.usermodifiedfullname) || textoPlano(d.userfullname) || '',
      creada: numero(d.created) ?? 0,
      actividad: numero(d.timemodified) ?? numero(d.modified) ?? numero(d.created) ?? 0,
      respuestas: Math.max(0, Number(d.numreplies) || 0),
      fijada: Boolean(d.pinned),
      cerrada: Boolean(d.locked),
      adjuntos: Boolean(d.attachment) || (Array.isArray(d.attachments) && d.attachments.length > 0),
      resumen: primeraFrase(texto.length > 160 ? `${texto.slice(0, 160)}…` : texto),
    });
  }
  return lista;
}

// Some courses keep discussions of many years back (from 2015 and on): one without activity for a year is old, and Foros
// leaves it out until the student asks for it.
const VIEJA = 365 * DIA;
/** Whether a discussion has had no activity for a year. */
export const esVieja = (discusion, ahora = Math.floor(Date.now() / 1000)) => discusion.actividad < ahora - VIEJA;

/** Pinned first, then the latest activity. */
export const ordenarDiscusiones = (lista) => [...lista].sort((a, b) => Boolean(b.fijada) - Boolean(a.fijada) || b.actividad - a.actividad || b.id - a.id);

// What a mail answer drags along: the message it answers, quoted below. A blockquote of the campus editor stays: a
// teacher quoting a statement means to.
const CITA = '.gmail_quote, .gmail_extra, .moz-cite-prefix, .yahoo_quoted, #divRplyFwdMsg, #appendonsend, blockquote[type="cite"]';
const DIJO = /\s(?:escribió|wrote)\s*:$/iu;

/** The HTML of a post without the message it quotes, and whether it quoted one. */
export function sinCita(html) {
  const documento = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  let citaba = false;
  for (const el of documento.body.querySelectorAll(CITA)) {
    el.remove();
    citaba = true;
  }
  // «El mar, 3 nov 2026 a las 10:12, Ana escribió:» and everything after it, unless that leaves nothing.
  const recorrido = documento.createTreeWalker(documento.body, 4);
  for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
    const linea = nodo.parentElement?.closest('p, div, span');
    const texto = (linea && linea !== documento.body ? linea.textContent : nodo.nodeValue) ?? '';
    if (texto.trim().length > 200 || !DIJO.test(texto.trim())) continue;
    const rango = documento.createRange();
    if (linea && linea !== documento.body && linea.textContent.trim().length <= 200) rango.setStartBefore(linea);
    else rango.setStartBefore(nodo);
    rango.setEnd(documento.body, documento.body.childNodes.length);
    const antes = documento.body.innerHTML;
    rango.deleteContents();
    if (documento.body.textContent.trim()) citaba = true;
    else documento.body.innerHTML = antes;
    break;
  }
  // Lines of a plain-text mail that start with «>».
  for (const p of documento.body.querySelectorAll('p, div')) {
    if (p.children.length === 0 && /^\s*>/.test(p.textContent ?? '')) {
      p.remove();
      citaba = true;
    }
  }
  return { html: documento.body.innerHTML, citaba };
}

// A file inside a post goes through the web service, like any other: the visor brings it with the key.
const IMAGEN = /\.(png|jpe?g|gif|webp|bmp)$/i;
function imagenesDe(html, donde, materia) {
  const documento = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const lista = [];
  for (const img of documento.querySelectorAll('img[src]')) {
    let url;
    try {
      url = new URL(img.getAttribute('src'), CAMPUS);
    } catch {
      continue;
    }
    if (url.origin !== CAMPUS || !/\/pluginfile\.php\//.test(url.pathname)) continue;
    url.pathname = url.pathname.replace(/^\/pluginfile\.php\//, '/webservice/pluginfile.php/');
    url.search = '';
    const nombre = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    if (!IMAGEN.test(nombre)) continue;
    lista.push({ filename: nombre, fileurl: url.href, filepath: `/img${lista.length}/`, mimetype: '' });
  }
  return archivosDe(lista, { donde, ...materia });
}

/** The posts of a discussion (`mod_forum_get_discussion_posts`) in the order they were written. Each one says whom it
 * answers when it is not the first post, with the start of what that one said. */
export function leerHilo(respuesta, { materia = '', materiaId = null } = {}) {
  const posts = [];
  for (const p of Array.isArray(respuesta?.posts) ? respuesta.posts : []) {
    const id = numero(p?.id);
    if (!id) continue;
    const borrado = Boolean(p.isdeleted);
    const { html, citaba } = borrado ? { html: '', citaba: false } : sinCita(p.message);
    const adjuntos = (Array.isArray(p.attachments) ? p.attachments : []).map((a) => ({ filename: a?.filename, fileurl: a?.url ?? a?.fileurl, filesize: a?.filesize, mimetype: a?.mimetype, filepath: a?.filepath, timemodified: a?.timemodified }));
    posts.push({
      id,
      padre: numero(p.parentid),
      autor: textoPlano(p.author?.fullname) || 'Alguien',
      autorId: numero(p.author?.id),
      cuando: numero(p.timecreated) ?? 0,
      asunto: sinRe(textoPlano(p.subject)),
      bloques: borrado ? [] : leerBloques(html.replaceAll(`${CAMPUS}/webservice/pluginfile.php/`, `${CAMPUS}/pluginfile.php/`), 20_000),
      texto: borrado ? '' : textoPlano(html),
      citaba,
      borrado,
      privado: Boolean(p.isprivatereply),
      // What the campus says this student may do with it. Without the field (an older campus), it lets the campus say.
      puedeResponder: !borrado && p.capabilities?.reply !== false,
      adjuntos: [...archivosDe(adjuntos, { donde: `post${id}`, materia, materiaId }), ...(borrado ? [] : imagenesDe(p.message, `post${id}`, { materia, materiaId }))],
    });
  }
  posts.sort((a, b) => a.cuando - b.cuando || a.id - b.id);
  const primero = posts.find((p) => !p.padre) ?? posts[0];
  const porId = new Map(posts.map((p) => [p.id, p]));
  return posts.map((p) => {
    const padre = p.padre && p !== primero ? porId.get(p.padre) : null;
    // Answering the first post is the usual: it says so only when it answers someone else's answer.
    const responde = padre && padre !== primero ? { id: padre.id, autor: padre.autor, inicio: primeraFrase(padre.texto) } : null;
    // A subject of its own, only when it says something the discussion's doesn't.
    const asunto = p !== primero && p.asunto && normalizar(p.asunto) !== normalizar(primero?.asunto ?? '') ? p.asunto : '';
    return { ...p, primero: p === primero, responde, asunto };
  });
}

// What's new, per student and on this browser only: when Foros was first opened (`desde`) and, per discussion, the
// activity it had when it was last opened. Before `desde`, only the last two weeks count as new, so the first visit
// doesn't light up every old discussion.
const PREFIJO_VISTO = 'cl.foros.';
const NUEVO_AL_EMPEZAR = 14 * DIA;
const MAX_VISTAS = 600;
export const claveDeVistas = (alumno) => PREFIJO_VISTO + alumno;

export function leerVistas(alumno, ahora = Math.floor(Date.now() / 1000)) {
  const vacio = { desde: ahora, vistas: {} };
  if (alumno === null || alumno === undefined) return vacio;
  try {
    const crudo = JSON.parse(localStorage.getItem(claveDeVistas(alumno)) ?? 'null');
    const desde = numero(crudo?.desde);
    if (!desde) return vacio;
    const vistas = {};
    for (const [k, v] of Object.entries(crudo.vistas ?? {})) if (numero(k) && numero(v)) vistas[k] = Number(v);
    return { desde, vistas };
  } catch {
    return vacio;
  }
}

export function guardarVistas(alumno, { desde, vistas }) {
  if (alumno === null || alumno === undefined) return;
  // The most recent ones, if there are too many: an old discussion forgotten only shows as new again if it moves.
  const recientes = Object.entries(vistas).sort((a, b) => b[1] - a[1]).slice(0, MAX_VISTAS);
  try {
    localStorage.setItem(claveDeVistas(alumno), JSON.stringify({ desde, vistas: Object.fromEntries(recientes) }));
  } catch {
    // Full or blocked: what's new just shows again next time.
  }
}

/** Whether a discussion moved since it was last opened here. */
export function esNueva(discusion, { desde, vistas }) {
  const vista = vistas[discusion.id];
  if (vista) return discusion.actividad > vista;
  return discusion.actividad > desde - NUEVO_AL_EMPEZAR;
}

/** The posts written after the discussion was last opened here (none the first time it is opened). */
export function postsNuevos(posts, vista) {
  if (!vista) return new Set();
  return new Set(posts.filter((p) => p.cuando > vista).map((p) => p.id));
}

/** The discussions that match a search, in their title, start, author, forum or course. Without accents or case. */
export function filtrarDiscusiones(lista, consulta) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return lista;
  return lista.filter((d) => {
    const texto = normalizar(`${d.titulo} ${d.resumen} ${d.autor} ${d.ultimo} ${d.foro} ${d.materia}`);
    return palabras.every((p) => texto.includes(p));
  });
}

/** The discussion id in the address of a campus forum notification (discuss.php?d=12#p44), or null. */
export function discusionDeEnlace(direccion) {
  try {
    const url = new URL(direccion);
    if (url.origin !== CAMPUS || url.pathname !== '/mod/forum/discuss.php') return null;
    return numero(url.searchParams.get('d'));
  } catch {
    return null;
  }
}
