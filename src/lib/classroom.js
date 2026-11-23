import { dominioDe, enlaceSeguro, fecha, fechaHora, huella, idDeYoutube, normalizar, primeraFrase, sinExtension } from './datos';
import { cuentaGoogle, olvidarGoogle, renovarGoogle, tokenGoogle } from './google';
import { conRespaldo, sinRed } from './respaldo';
import { dibujoDeArchivoEnlazado, iconoDeEnlace } from './simbolos';

// What Super CVG reads from Classroom, read only, straight from the student's browser to Google. It stays in this
// tab's memory, per permission: a new permission (or another account) never sees what the previous one brought. With
// «Seguir conectado» it is also kept for offline (respaldo.js), for that campus student and that Google account only;
// offline Google is never asked, and Desconectar deletes it (google.js). Besides, on disk there is only which course
// goes with which campus course (mio.js, by number).
export const API_CLASSROOM = 'https://classroom.googleapis.com/v1';
const PAGINAS = 5;

const falla = (texto, codigo = '') => Object.assign(new Error(texto), { conocido: true, codigo });
const SIN_RED = 'No se pudo llegar a Classroom. Revisá internet y probá de nuevo.';
const ID = /^\d{1,24}$/;
// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

async function pedirUna(token, ruta, params) {
  if (import.meta.env.DEV && token === 'demo') {
    const { responderClassroom } = await import('./demoClassroom');
    return responderClassroom(ruta, params);
  }
  let r;
  try {
    r = await fetch(`${API_CLASSROOM}/${ruta}?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw falla(SIN_RED, 'red');
  }
  if (r.status === 401) {
    if (tokenGoogle() === token) {
      olvidarGoogle();
      renovarGoogle();
    }
    throw falla('Tu conexión con Classroom venció. Volvé a conectarla.', 'vencida');
  }
  if (r.status === 403) throw falla('Google no dio permiso para ver esto. Volvé a conectar Classroom y dejá marcadas todas las opciones.', 'permiso');
  if (r.status === 404) throw falla('Ese curso ya no está en tu Classroom.', 'no-existe');
  if (!r.ok) throw falla('Classroom no responde ahora. Probá de nuevo en un rato.', r.status >= 500 ? 'caido' : '');
  try {
    return await r.json();
  } catch {
    throw falla('Classroom no responde ahora. Probá de nuevo en un rato.');
  }
}

async function listar(token, ruta, campo, params, paginas = PAGINAS) {
  const todo = [];
  let pageToken = '';
  for (let i = 0; i < paginas; i++) {
    const json = await pedirUna(token, ruta, pageToken ? { ...params, pageToken } : params);
    if (Array.isArray(json?.[campo])) todo.push(...json[campo]);
    pageToken = typeof json?.nextPageToken === 'string' ? json.nextPageToken : '';
    if (!pageToken) break;
  }
  return todo;
}

// Per permission and once per tab: moving around does not ask Google again. A failure is not kept, nor what came from
// the disk: once the network is back, Google is asked. `traer(token)` gives what Google said, kept as it came;
// `leer` makes it what the screens use, both from Google and from the disk.
const guardados = new Map();
function enCache(clave, traer, leer = (x) => x) {
  const token = tokenGoogle();
  const k = `${token}:${clave}`;
  if (token && guardados.has(k)) return guardados.get(k);
  // Offline, only what was kept for this Google account: nothing goes to Google, also without the permission.
  const cuenta = cuentaGoogle();
  if (!token && !sinRed()) return Promise.reject(falla('Conectá Classroom para ver esto.', 'sin-conectar'));
  let deGoogle = false;
  const pedido = conRespaldo(`classroom.${clave}`, async () => {
    const datos = await traer(token);
    deGoogle = true;
    return datos;
  }, {
    de: cuenta,
    esRed: (e) => e?.codigo === 'red' || e?.codigo === 'caido',
    sinRedError: () => falla(SIN_RED, 'red'),
  }).then(leer);
  if (!token) return pedido;
  for (const viejo of guardados.keys()) if (!viejo.startsWith(`${token}:`)) guardados.delete(viejo);
  guardados.set(k, pedido.then((d) => {
    if (!deGoogle) guardados.delete(k);
    return d;
  }, (e) => {
    guardados.delete(k);
    throw e;
  }));
  return guardados.get(k);
}
export const olvidarClassroom = () => guardados.clear();

const deClassroom = (u) => {
  const limpia = enlaceSeguro(u);
  return limpia && dominioDe(limpia) === 'classroom.google.com' ? limpia : null;
};

/** The student's active courses, checked. */
export function leerCursos(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((c) => c && ID.test(c.id) && limpio(c.name, 120) && (!c.courseState || c.courseState === 'ACTIVE'))
    .map((c) => ({ id: c.id, nombre: limpio(c.name, 120), seccion: limpio(c.section, 80), url: deClassroom(c.alternateLink) }));
}

export const cargarCursos = () =>
  enCache('cursos', (token) => listar(token, 'courses', 'courses', { studentId: 'me', courseStates: 'ACTIVE', pageSize: '100' }), leerCursos);

const VACIAS = new Set(['a', 'con', 'de', 'del', 'e', 'el', 'en', 'la', 'las', 'los', 'para', 'y', 'comision', 'curso', 'utn', 'frro']);
const ROMANOS = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv' };
// «Física I» and «Física II» differ by their numeral: it counts as a word, written either way. A year does not count.
const palabras = (t) => normalizar(t).split(/[^a-z0-9]+/).filter((p) => p && !VACIAS.has(p) && !/^20\d\d$/.test(p)).map((p) => ROMANOS[p] ?? p);

/** The Classroom course that looks like a campus course by its words, or null if none or more than one fit as well. */
export function cursoParecido(nombre, cursos) {
  const del = palabras(nombre);
  if (!del.length) return null;
  let mejor = null;
  let empate = false;
  for (const c of cursos) {
    const suyas = new Set(palabras(`${c.nombre} ${c.seccion}`));
    const puntos = del.filter((p) => suyas.has(p)).length / del.length;
    if (puntos < 0.5) continue;
    if (!mejor || puntos > mejor.puntos) {
      mejor = { c, puntos };
      empate = false;
    } else if (puntos === mejor.puntos) empate = true;
  }
  return mejor && !empate ? mejor.c : null;
}

// Kinds of attachment Classroom added after the four classic ones. Any other that comes with a title and an address
// shows too, as «Adjunto de Classroom».
const OTROS_ADJUNTOS = { gem: 'Gem de Gemini', notebook: 'Cuaderno de NotebookLM' };
const esCarpeta = (url) => /^https:\/\/drive\.google\.com\/(drive\/(u\/\d+\/)?)?folders?\//.test(url ?? '');

// The drawing and color of a Drive file, as a file of the campus: by its extension or, if it is a Google document, a
// spreadsheet or slides, by its address. Any other, with the color of Drive. Always with the link badge.
function dibujoDeDrive(titulo, url) {
  const dibujo = dibujoDeArchivoEnlazado(url, titulo, true) ?? { simbolo: 'documento', tono: 'drive' };
  return { icono: dibujo.simbolo, tono: dibujo.tono, enlazado: true };
}

function adjunto(m) {
  if (m?.driveFile?.driveFile) {
    const f = m.driveFile.driveFile;
    const url = enlaceSeguro(f.alternateLink);
    // A folder's name keeps its dots: «TP 1. Consignas» is not a file with an extension.
    if (esCarpeta(url)) return { nombre: limpio(f.title, 200) || 'Carpeta de Drive', url, icono: 'carpeta', tono: 'drive', tipo: 'Carpeta de Drive' };
    const titulo = limpio(f.title, 200);
    return { nombre: sinExtension(titulo) || 'Archivo de Drive', url, ...dibujoDeDrive(titulo, url), tipo: 'Archivo de Drive', titulo };
  }
  if (m?.youtubeVideo) {
    return { nombre: limpio(m.youtubeVideo.title, 200) || 'Video', url: enlaceSeguro(m.youtubeVideo.alternateLink), icono: 'video', tono: 'video', tipo: 'Video' };
  }
  if (m?.link) {
    const url = enlaceSeguro(m.link.url);
    const { simbolo, tono } = iconoDeEnlace(url ?? '');
    return { nombre: limpio(m.link.title, 200) || dominioDe(url ?? '') || 'Enlace', url, icono: simbolo, tono, tipo: `Enlace a ${dominioDe(url ?? '')}` };
  }
  if (m?.form) return { nombre: limpio(m.form.title, 200) || 'Formulario', url: enlaceSeguro(m.form.formUrl), icono: 'formulario', tono: 'formulario', tipo: 'Formulario' };
  for (const [clase, v] of Object.entries(m && typeof m === 'object' ? m : {})) {
    if (!v || typeof v !== 'object') continue;
    const url = enlaceSeguro(v.alternateLink ?? v.url ?? v.formUrl);
    if (!url) continue;
    const tipo = OTROS_ADJUNTOS[clase] ?? 'Adjunto de Classroom';
    return { nombre: limpio(v.title, 200) || dominioDe(url) || tipo, url, icono: 'enlace', tono: 'enlace', tipo };
  }
  return null;
}

const cuandoDe = (p) => Date.parse(p?.updateTime ?? p?.creationTime ?? '') || 0;
/** When a post came out, in seconds: what marks it as new. */
const creadoDe = (p) => Math.floor((Date.parse(p?.creationTime ?? p?.updateTime ?? '') || 0) / 1000);
const publicado = (p) => p && ID.test(p.id) && (!p.state || p.state === 'PUBLISHED');

/** The due date of a task, in seconds, or null. Classroom gives it in UTC; without an hour, the end of that day. */
function venceDe(t) {
  const d = t.dueDate;
  if (!d || !Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) return null;
  const h = t.dueTime ?? {};
  return Date.UTC(d.year, d.month - 1, d.day, Number.isInteger(h.hours) ? h.hours : 23, Number.isInteger(h.minutes) ? h.minutes : 59) / 1000;
}

function entregaDe(t) {
  const vence = venceDe(t);
  return vence ? `Tarea, para el ${fecha(vence)}` : 'Tarea, sin fecha de entrega';
}

/** The rows of one post: the post itself if it is a task or has nothing attached, and one row per attachment. Each has
 * a key of its own («c», the number of the post, and a print of the address), the same for every student. */
function filasDe(post, clase) {
  const titulo = limpio(post.title, 200);
  const adjuntos = (Array.isArray(post.materials) ? post.materials : []).map(adjunto).filter((a) => a?.url);
  const propia = deClassroom(post.alternateLink);
  const filas = [];
  if (clase === 'tarea') filas.push({ clave: `c${post.id}`, nombre: titulo || 'Tarea', url: propia, icono: 'actividad', tono: 'actividad', dato: entregaDe(post), tarea: true, vence: venceDe(post) });
  else if (!adjuntos.length && clase === 'material') filas.push({ clave: `c${post.id}`, nombre: titulo || 'Material', url: propia, icono: 'texto', tono: 'texto', dato: 'Material de Classroom' });
  for (const a of adjuntos) {
    let donde = '';
    if (clase === 'aviso') donde = ', en un aviso';
    else if (clase === 'tarea') donde = titulo ? `, de la tarea «${titulo}»` : '';
    else if (titulo && titulo !== a.nombre) donde = `, en «${titulo}»`;
    filas.push({ clave: `c${post.id}.${huella(a.url)}`, nombre: a.nombre, url: a.url, icono: a.icono, tono: a.tono, enlazado: a.enlazado, titulo: a.titulo, dato: `${a.tipo}${donde}` });
  }
  return filas.filter((f) => f.url).map((f) => ({ ...f, cuando: cuandoDe(post), creado: creadoDe(post), enlace: propia }));
}

const temasDe = (temas) => {
  const grupos = new Map();
  for (const t of temas) {
    if (t && ID.test(t.topicId) && limpio(t.name, 120)) grupos.set(t.topicId, { id: t.topicId, nombre: limpio(t.name, 120), items: [] });
  }
  return grupos;
};

const postsDe = ({ materiales = [], tareas = [] }) => [
  ...materiales.filter(publicado).map((p) => ({ p, clase: 'material' })),
  ...tareas.filter(publicado).map((p) => ({ p, clase: 'tarea' })),
].sort((a, b) => cuandoDe(b.p) - cuandoDe(a.p));

/** A course as sections: its topics in Classroom's order, then what has no topic, then what came in announcements.
 * Inside each, the newest first, as in Classroom. The same address shows once. */
export function armarCurso({ temas = [], materiales = [], tareas = [], avisos = [] }) {
  const grupos = temasDe(temas);
  const sinTema = { id: 'sin-tema', nombre: 'Sin tema', items: [] };
  const enAvisos = { id: 'avisos', nombre: 'En los avisos', items: [] };
  // A file can live in two topics, as in Classroom; inside one topic it shows once. What an announcement repeats from a
  // topic does not show again.
  const todas = new Set();
  const sumar = (grupo, filas) => {
    const suyas = new Set(grupo.items.map((f) => f.url));
    for (const f of filas) {
      if (suyas.has(f.url) || (grupo === enAvisos && todas.has(f.url))) continue;
      suyas.add(f.url);
      todas.add(f.url);
      grupo.items.push(f);
    }
  };
  for (const { p, clase } of postsDe({ materiales, tareas })) sumar(grupos.get(p.topicId) ?? sinTema, filasDe(p, clase));
  for (const a of avisos.filter(publicado).sort((x, y) => cuandoDe(y) - cuandoDe(x))) sumar(enAvisos, filasDe(a, 'aviso'));
  return [...grupos.values(), sinTema, enAvisos]
    .filter((g) => g.items.length)
    .map((g) => ({ ...g, items: g.items.map((f, i) => ({ id: `${g.id}:${i}`, nombre: f.nombre, url: f.url, icono: f.icono, tono: f.tono, enlazado: f.enlazado, dato: f.dato, creado: f.creado })) }));
}

/** The topics and materials of a course as items of a campus course (`materia`), so the student can move them to a
 * section, hide them, rename them and mark them as with the campus. Their sections are «c» and the topic, or «c0». */
export function itemsDeCurso({ temas = [], materiales = [], tareas = [] }, materia) {
  const grupos = temasDe(temas);
  const sinTema = { id: '0', nombre: 'Sin tema', items: [] };
  for (const { p, clase } of postsDe({ materiales, tareas })) {
    const grupo = grupos.get(p.topicId) ?? sinTema;
    const descripcion = limpio(p.description, 600);
    for (const f of filasDe(p, clase)) {
      if (grupo.items.some((x) => x.clave === f.clave)) continue;
      const base = {
        id: `${materia.id}-${f.clave}`,
        clave: f.clave,
        nombre: f.nombre,
        seccion: grupo.nombre,
        seccionId: `c${grupo.id}`,
        materia: materia.nombre,
        materiaId: materia.id,
        origen: 'classroom',
        campus: f.enlace,
        detalle: f.dato,
        descripcion,
        creado: f.creado,
        modificado: 0,
        fechas: f.vence ? [{ etiqueta: 'Entrega', cuando: f.vence }] : [],
      };
      if (f.tarea || f.url === f.enlace) grupo.items.push({ ...base, tipo: 'actividad', clase: f.tarea ? 'Tarea de Classroom' : 'Material de Classroom', destino: f.url });
      else grupo.items.push({ ...base, tipo: 'enlace', destino: f.url, dominio: dominioDe(f.url), video: idDeYoutube(f.url), ...(f.titulo ? { tituloEnDrive: f.titulo } : {}) });
    }
  }
  return [...grupos.values(), sinTema].flatMap((g) => g.items);
}

// The text of a message keeps its lines.
// eslint-disable-next-line no-control-regex
const conRenglones = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '');

/** One message of the stream shaped like a text of the campus, and its attachments. */
function mensajeDe(a, materia) {
  const texto = conRenglones(a.text, 6000);
  // The same address twice shows once.
  const adjuntos = (Array.isArray(a.materials) ? a.materials : []).map(adjunto).filter((x, i, todos) => x?.url && todos.findIndex((y) => y?.url === x.url) === i);
  const creado = creadoDe(a);
  const mensaje = {
    id: `${materia.id}-m${a.id}`,
    nombre: primeraFrase(texto) || adjuntos[0]?.nombre || 'Mensaje',
    tipo: 'texto',
    clase: 'Mensaje del tablón',
    detalle: [creado ? fecha(creado) : null, adjuntos.length ? (adjuntos.length === 1 ? 'un adjunto' : `${adjuntos.length} adjuntos`) : null].filter(Boolean).join(', ') || null,
    texto,
    recortado: false,
    enlaces: adjuntos.map((x) => ({ texto: x.nombre, destino: x.url, dominio: dominioDe(x.url), ...(x.titulo ? { titulo: x.titulo } : {}) })),
    campus: deClassroom(a.alternateLink),
    materia: materia.nombre,
    materiaId: materia.id,
    origen: 'classroom',
    creado,
  };
  return { mensaje, adjuntos };
}

/** The messages of the stream, the newest first, shaped like a text of the campus: they open in the same preview.
 * Those that came after `revisado` (seconds) are new. */
export function mensajesDe({ avisos = [] }, materia, revisado) {
  return avisos
    .filter(publicado)
    .map((a) => {
      const { mensaje } = mensajeDe(a, materia);
      return { ...mensaje, nuevo: mensaje.creado > revisado };
    })
    .sort((x, y) => y.creado - x.creado);
}

/** The section of the stream in a campus course: it starts with «c» like the topics, so it stays in the card. */
export const SECCION_TABLON = 'ct';
export const delTablon = (item) => item.seccionId === SECCION_TABLON;

/** The stream as items of a campus course, so its messages and each attachment of them go to a section like the rest:
 * each message («t» and its number), then its attachments («t», the number and a print of the address, `adjuntoDe` its
 * message). The newest first. The keys are the same for every student, and only they are stored. */
export function itemsDelTablon({ avisos = [] }, materia) {
  const items = [];
  const avisosEnOrden = avisos.filter(publicado).sort((x, y) => creadoDe(y) - creadoDe(x) || cuandoDe(y) - cuandoDe(x));
  for (const a of avisosEnOrden) {
    const { mensaje, adjuntos } = mensajeDe(a, materia);
    const clave = `t${a.id}`;
    const comun = { seccion: 'Tablón', seccionId: SECCION_TABLON, materia: materia.nombre, materiaId: materia.id, origen: 'classroom', campus: mensaje.campus, creado: mensaje.creado, modificado: 0, fechas: [] };
    items.push({ ...mensaje, ...comun, id: `${materia.id}-${clave}`, clave });
    for (const x of adjuntos) {
      const suya = `${clave}.${huella(x.url)}`;
      // Two addresses with the same print: the first one stays, as in the topics.
      if (items.some((i) => i.clave === suya)) continue;
      items.push({
        ...comun,
        id: `${materia.id}-${suya}`,
        clave: suya,
        adjuntoDe: clave,
        nombre: x.nombre,
        detalle: `${x.tipo}, en un mensaje del tablón`,
        descripcion: '',
        tipo: 'enlace',
        destino: x.url,
        dominio: dominioDe(x.url),
        video: idDeYoutube(x.url),
        ...(x.titulo ? { tituloEnDrive: x.titulo } : {}),
      });
    }
  }
  return items;
}

const QUINCE_DIAS = 15 * 86_400;

/** The tasks with a due date not turned in, shaped like the campus' pending events. An overdue one counts for two weeks. */
export function pendientesDe({ tareas = [] }, entregadas, materia, ahora = Math.floor(Date.now() / 1000)) {
  return tareas
    .filter((t) => publicado(t) && !entregadas.has(t.id))
    .map((t) => ({ t, vence: venceDe(t) }))
    .filter(({ vence }) => vence && vence > ahora - QUINCE_DIAS)
    .map(({ t, vence }) => ({
      id: `classroom-${t.id}`,
      titulo: limpio(t.title, 200) || 'Tarea',
      tipo: 'Tarea de Classroom',
      materia: materia.nombre,
      materiaId: materia.id,
      vence,
      url: deClassroom(t.alternateLink),
    }));
}

/** Every task of a course with a due date, as the Calendario draws its dates: turned in, it reads as done. */
export function fechasDe({ tareas = [] }, entregadas, materia) {
  return tareas
    .filter((t) => publicado(t))
    .map((t) => ({ t, vence: venceDe(t) }))
    .filter(({ vence }) => vence)
    .map(({ t, vence }) => ({
      id: `classroom-${t.id}`,
      titulo: limpio(t.title, 200) || 'Tarea',
      tipo: 'entrega',
      classroom: true,
      vencimiento: true,
      momento: 'vence',
      cuando: vence,
      materia: materia.nombre,
      materiaId: materia.id,
      url: deClassroom(t.alternateLink),
      ...(entregadas.has(t.id) ? { hecha: true } : {}),
    }));
}

// A part the student did not allow (Google lets each permission be unchecked) comes empty instead of failing it all.
const sinPermiso = (e) => {
  if (e.codigo === 'permiso') return [];
  throw e;
};

// What was kept, as Google's: every part a list.
const listas = (d) => Object.fromEntries(['temas', 'materiales', 'tareas', 'avisos'].map((c) => [c, Array.isArray(d?.[c]) ? d[c] : []]));

/** What a course has, as Google gives it: { temas, materiales, tareas, avisos }. */
export const cargarDatosCurso = (id) => {
  if (!ID.test(String(id))) return Promise.reject(falla('Ese curso ya no está en tu Classroom.', 'no-existe'));
  return enCache(`curso:${id}`, async (token) => {
    const base = `courses/${id}`;
    const [temas, materiales, tareas, avisos] = await Promise.all([
      listar(token, `${base}/topics`, 'topic', { pageSize: '100' }).catch(sinPermiso),
      listar(token, `${base}/courseWorkMaterials`, 'courseWorkMaterial', { pageSize: '100' }).catch(sinPermiso),
      listar(token, `${base}/courseWork`, 'courseWork', { pageSize: '100' }).catch(sinPermiso),
      listar(token, `${base}/announcements`, 'announcements', { pageSize: '50' }, 1).catch(sinPermiso),
    ]);
    return { temas, materiales, tareas, avisos };
  }, listas);
};

export const cargarCurso = (id) => cargarDatosCurso(id).then(armarCurso);

/** The tasks of a course the student already turned in (their numbers). */
export const cargarEntregas = (id) => {
  if (!ID.test(String(id))) return Promise.reject(falla('Ese curso ya no está en tu Classroom.', 'no-existe'));
  return enCache(`entregas:${id}`, async (token) => {
    const lista = await listar(token, `courses/${id}/courseWork/-/studentSubmissions`, 'studentSubmissions', { userId: 'me', pageSize: '100' }).catch(sinPermiso);
    return lista.filter((e) => e && ID.test(e.courseWorkId) && (e.state === 'TURNED_IN' || e.state === 'RETURNED')).map((e) => e.courseWorkId);
  }, (ids) => new Set((Array.isArray(ids) ? ids : []).filter((x) => ID.test(x))));
};

const ADJUNTOS_EN_TEXTO = 12;
// What a post has attached, by name: «Adjuntos: Guía 3; Video de la clase.»
function adjuntosEnTexto(materials) {
  const nombres = (Array.isArray(materials) ? materials : []).map(adjunto).filter((x) => x?.url).map((x) => x.nombre);
  const unicos = [...new Set(nombres)].slice(0, ADJUNTOS_EN_TEXTO);
  return unicos.length ? `Adjuntos: ${unicos.join('; ')}.` : '';
}

/** What a course says in words, for Consultron: each task, material and message of the stream, the newest first, as
 * { id, clase, titulo, texto, url, creado }. Of what is attached, only the name: what a file says never comes. */
export function textosDeCurso({ materiales = [], tareas = [], avisos = [] }) {
  const junto = (...partes) => partes.filter(Boolean).join('\n');
  const salida = [];
  for (const t of tareas.filter(publicado)) {
    const titulo = limpio(t.title, 200) || 'Tarea';
    const vence = venceDe(t);
    const cuando = vence ? `Se entrega el ${fechaHora(vence)}.` : 'No tiene fecha de entrega.';
    salida.push({ id: `t${t.id}`, clase: 'Tarea', titulo, texto: junto(`Tarea «${titulo}». ${cuando}`, conRenglones(t.description, 6000), adjuntosEnTexto(t.materials)), url: deClassroom(t.alternateLink), creado: creadoDe(t) });
  }
  for (const m of materiales.filter(publicado)) {
    const titulo = limpio(m.title, 200) || 'Material';
    salida.push({ id: `m${m.id}`, clase: 'Material', titulo, texto: junto(`Material «${titulo}».`, conRenglones(m.description, 6000), adjuntosEnTexto(m.materials)), url: deClassroom(m.alternateLink), creado: creadoDe(m) });
  }
  for (const a of avisos.filter(publicado)) {
    const texto = conRenglones(a.text, 6000);
    const creado = creadoDe(a);
    const adjuntos = adjuntosEnTexto(a.materials);
    if (!texto && !adjuntos) continue;
    salida.push({ id: `a${a.id}`, clase: 'Mensaje', titulo: primeraFrase(texto) || 'Mensaje', texto: junto(`Mensaje del tablón${creado ? ` del ${fecha(creado)}` : ''}.`, texto, adjuntos), url: deClassroom(a.alternateLink), creado });
  }
  return salida.sort((x, y) => y.creado - x.creado);
}
