// A campus assignment (mod_assign) as the task screen shows it, and the checks a submission goes through before it
// leaves. Pure: no network here. What the campus answers is read field by field and shown only as text or as blocks
// (bloquesCampus.js): nothing of its HTML reaches the page.
import { leerBloques } from './bloquesCampus';
import { leerTexto, nombreDeArchivo, sinExtension, textoPlano } from './datos';
import { CAMPUS } from './moodle';

const numero = (n) => (Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : null);
const fechaO = (segundos) => numero(segundos);

// A file link in a campus text goes through the web service, which needs the key. The browser opens it with its own
// campus session instead, through the plain address.
const sinServicio = (html) => String(html ?? '').replaceAll(`${CAMPUS}/webservice/pluginfile.php/`, `${CAMPUS}/pluginfile.php/`);

/** A campus text with format, as blocks for <Bloques>. Long texts are kept whole up to about 20 000 characters. */
export const bloquesDe = (html) => leerBloques(sinServicio(html), 20_000);

/** The campus files of a task, as file items the preview and the rows already know (tipo 'archivo'). */
export function archivosDe(lista, { donde, materia = '', materiaId = null } = {}) {
  const vistos = new Set();
  const archivos = [];
  for (const f of Array.isArray(lista) ? lista : []) {
    if (!f?.filename || f.filename === '.' || !f.fileurl) continue;
    const clave = `${f.filepath ?? '/'}${f.filename}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    archivos.push({
      tipo: 'archivo',
      id: `${donde}-${clave}`,
      nombre: sinExtension(nombreDeArchivo(f.filename)),
      archivo: nombreDeArchivo(f.filename),
      direccion: String(f.fileurl),
      peso: Number(f.filesize) || 0,
      mime: String(f.mimetype ?? ''),
      modificado: Number(f.timemodified) || 0,
      materia,
      materiaId,
    });
  }
  return archivos;
}

// The groups of file kinds a teacher can pick in Moodle, by their extensions. Only the usual ones: a group not listed
// here is left to the campus, so no file is refused by mistake.
const GRUPOS = {
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'],
  document: ['doc', 'docx', 'epub', 'gdoc', 'odt', 'ott', 'oth', 'pdf', 'rtf'],
  spreadsheet: ['xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'ods', 'ots', 'csv', 'gsheet'],
  presentation: ['ppt', 'pptx', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp', 'key', 'gslides'],
  image: ['jpg', 'jpeg', 'jpe', 'png', 'gif', 'bmp', 'svg', 'svgz', 'tif', 'tiff', 'webp', 'heic'],
  web_image: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'wma', 'aif', 'aiff'],
  video: ['mp4', 'm4v', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'mpeg', 'mpg', '3gp', 'ogv'],
};
const DE_MIME = { 'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt', 'image/png': 'png', 'image/jpeg': 'jpg' };

/** What kinds of file a task takes, from the campus list («.pdf .docx», «document,image», «*» or empty for any).
 * { todos: true } when anything goes or the list names a group this does not know. */
export function tiposAceptados(lista) {
  const partes = String(lista ?? '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  if (!partes.length || partes.includes('*')) return { todos: true, extensiones: [] };
  const extensiones = new Set();
  for (const p of partes) {
    if (p.startsWith('.')) extensiones.add(p.slice(1));
    else if (p.includes('/')) {
      if (!DE_MIME[p]) return { todos: true, extensiones: [] };
      extensiones.add(DE_MIME[p]);
    } else if (GRUPOS[p]) GRUPOS[p].forEach((e) => extensiones.add(e));
    else if (/^[a-z0-9]{1,8}$/.test(p) && !/_/.test(p)) extensiones.add(p);
    else return { todos: true, extensiones: [] };
  }
  return { todos: false, extensiones: [...extensiones] };
}

/** The kinds in words, for the help of the field: «PDF, DOCX o ZIP». */
export function tiposEnTexto({ todos, extensiones }) {
  if (todos || !extensiones.length) return '';
  const nombres = extensiones.slice(0, 8).map((e) => e.toUpperCase());
  if (extensiones.length > 8) return `${nombres.join(', ')} y otros`;
  return nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} o ${nombres.at(-1)}` : nombres[0];
}

const configDe = (configs, plugin, nombre) =>
  (Array.isArray(configs) ? configs : []).find((c) => c?.subtype === 'assignsubmission' && c.plugin === plugin && c.name === nombre)?.value;

/** One task of `mod_assign_get_assignments`, or null when it lacks what identifies it. */
export function leerTarea(a, materia = '') {
  const id = numero(a?.id);
  const cmid = numero(a?.cmid);
  if (!id || !cmid) return null;
  const materiaId = numero(a.course);
  const conTexto = configDe(a.configs, 'onlinetext', 'enabled') === '1';
  const conArchivos = configDe(a.configs, 'file', 'enabled') === '1' && Number(configDe(a.configs, 'file', 'maxfilesubmissions')) > 0;
  const palabras = configDe(a.configs, 'onlinetext', 'wordlimitenabled') === '1' ? Number(configDe(a.configs, 'onlinetext', 'wordlimit')) || 0 : 0;
  const declaracion = Number(a.requiresubmissionstatement) === 1 ? textoPlano(a.submissionstatement) : null;
  return {
    id,
    cmid,
    materiaId,
    nombre: textoPlano(a.name) || 'Tarea',
    consigna: bloquesDe(a.intro),
    // Its pictures and files, which the blocks leave out, go with the attachments.
    adjuntos: archivosDe([...(a.introattachments ?? []), ...(a.introfiles ?? [])], { donde: `consigna-${id}`, materia, materiaId }),
    instrucciones: bloquesDe(a.activity),
    adjuntosInstrucciones: archivosDe(a.activityattachments, { donde: `instrucciones-${id}`, materia, materiaId }),
    abre: fechaO(a.allowsubmissionsfromdate),
    vence: fechaO(a.duedate),
    cierra: fechaO(a.cutoffdate),
    // With drafts the student saves first and then sends it to be graded (mod_assign_submit_for_grading).
    borradores: Number(a.submissiondrafts) === 1,
    // Asks to accept a statement before sending. `declaracion` is its text, empty when the campus did not send it.
    declaracion,
    sinEntrega: Number(a.nosubmissions) === 1,
    enGrupo: Number(a.teamsubmission) === 1,
    conTiempo: Number(a.timelimit) > 0,
    texto: conTexto ? { palabras } : null,
    archivos: conArchivos
      ? {
        cuantos: Number(configDe(a.configs, 'file', 'maxfilesubmissions')) || 1,
        peso: Number(configDe(a.configs, 'file', 'maxsubmissionsizebytes')) || 0,
        tipos: tiposAceptados(configDe(a.configs, 'file', 'filetypeslist')),
      }
      : null,
  };
}

/** Every task of a course in `mod_assign_get_assignments`. */
export function leerTareas(respuesta, materia = '') {
  return (respuesta?.courses ?? []).flatMap((c) => (c?.assignments ?? []).map((a) => leerTarea(a, materia))).filter(Boolean);
}

const pluginDe = (plugins, tipo) => (Array.isArray(plugins) ? plugins : []).find((p) => p?.type === tipo);
const areaDe = (plugin, area) => plugin?.fileareas?.find((f) => f?.area === area)?.files ?? [];
const campoDe = (plugin, nombre) => plugin?.editorfields?.find((f) => f?.name === nombre)?.text ?? '';

// Tags a text written in the campus editor may carry beyond paragraphs and line breaks.
const CON_FORMATO = /<(?!\/?(?:p|br|div|span)\b)[a-z][^>]*>/i;

function leerEnvio(envio, { materia, materiaId }) {
  if (!envio || !numero(envio.id)) return null;
  const texto = pluginDe(envio.plugins, 'onlinetext');
  const archivos = pluginDe(envio.plugins, 'file');
  const html = campoDe(texto, 'onlinetext');
  return {
    id: Number(envio.id),
    estado: ['new', 'draft', 'submitted', 'reopened'].includes(envio.status) ? envio.status : 'new',
    modificado: fechaO(envio.timemodified),
    intento: Number(envio.attemptnumber) || 0,
    texto: html ? { bloques: bloquesDe(html), plano: leerTexto(html).texto, conFormato: CON_FORMATO.test(html) } : null,
    archivos: archivosDe(areaDe(archivos, 'submission_files'), { donde: `envio-${envio.id}`, materia, materiaId }),
  };
}

// «-», «- / 10,00» or nothing: there is no grade yet.
const notaReal = (texto) => (/[\p{L}\p{N}]/u.test(texto.replace(/\/.*$/, '')) ? texto : null);

/** `mod_assign_get_submission_status`, as the screen needs it. */
export function leerEstado(r, { materia = '', materiaId = null } = {}) {
  const ultimo = r?.lastattempt ?? {};
  const envio = leerEnvio(ultimo.teamsubmission ?? ultimo.submission, { materia, materiaId });
  const devolucion = r?.feedback;
  const comentarios = pluginDe(devolucion?.plugins, 'comments');
  const nota = devolucion ? notaReal(textoPlano(devolucion.gradefordisplay ?? devolucion.grade?.gradefordisplay)) : null;
  const comentario = bloquesDe(campoDe(comentarios, 'comments'));
  const archivosDevolucion = [
    ...archivosDe(areaDe(pluginDe(devolucion?.plugins, 'file'), 'feedback_files'), { donde: 'devolucion', materia, materiaId }),
    ...archivosDe(areaDe(pluginDe(devolucion?.plugins, 'editpdf'), 'download'), { donde: 'devolucion-pdf', materia, materiaId }),
  ];
  return {
    envio,
    habilitada: ultimo.submissionsenabled !== false,
    bloqueada: Boolean(ultimo.locked),
    calificada: Boolean(ultimo.graded),
    puedeEditar: Boolean(ultimo.canedit),
    puedeEnviar: Boolean(ultimo.cansubmit),
    prorroga: fechaO(ultimo.extensionduedate),
    // Sent but the grade is still not out, with marking workflow (inmarking, readyforrelease...).
    devolucion: nota || comentario.length || archivosDevolucion.length
      ? { nota, fecha: fechaO(devolucion?.gradeddate), comentario, archivos: archivosDevolucion }
      : null,
  };
}

const tieneAlgo = (envio) => Boolean(envio && (envio.texto || envio.archivos.length));

/** The word for where the task is: 'sin' (nothing sent), 'borrador', 'entregada' or 'calificada'. */
export function estadoDe(estado) {
  if (estado?.devolucion?.nota) return 'calificada';
  const envio = estado?.envio;
  if (envio?.estado === 'submitted') return 'entregada';
  if (envio?.estado === 'draft' && tieneAlgo(envio)) return 'borrador';
  return 'sin';
}

export const TEXTO_ESTADO = { sin: 'Sin entregar', borrador: 'Borrador', entregada: 'Entregada', calificada: 'Calificada' };

/** When it is due for this student: the extension if there is one, or the due date. */
export const venceEl = (tarea, estado) => estado?.prorroga || tarea?.vence || null;

/** Whether the date passed without the task sent. */
export function estaVencida(tarea, estado, ahora) {
  const vence = venceEl(tarea, estado);
  return Boolean(vence && ahora > vence && ['sin', 'borrador'].includes(estadoDe(estado)));
}

/** Why the campus does not take a submission now, in words, or null when it does. */
export function porQueNo(tarea, estado, ahora) {
  if (tarea.sinEntrega || (!tarea.texto && !tarea.archivos)) return 'Esta tarea no se entrega por el campus.';
  if (estado.puedeEditar || estado.puedeEnviar) return tarea.conTiempo ? 'Tiene tiempo límite. Hacela desde el campus.' : null;
  if (estado.bloqueada) return 'Las entregas de esta tarea están bloqueadas en el campus.';
  if (tarea.abre && ahora < tarea.abre) return 'Todavía no abre para entregar.';
  if (estadoDe(estado) === 'calificada') return 'Ya está calificada.';
  if (estadoDe(estado) === 'entregada') return tarea.borradores ? 'Ya la enviaste para calificar. Para cambiarla, el docente la tiene que habilitar de nuevo.' : 'El campus ya no deja cambiarla.';
  if (tarea.cierra && ahora > tarea.cierra) return 'Ya cerró y no se puede entregar.';
  return 'El campus no deja entregarla ahora.';
}

/** Whether Super CVG can send it: a timed task has to be started on the campus, and some take nothing online. */
export const seEntregaAca = (tarea) => !tarea.conTiempo && !tarea.sinEntrega && Boolean(tarea.texto || tarea.archivos);

// ---------- Checks before sending ----------

/** Words the way the campus counts them (count_words): runs of anything that is not a space or a dash. */
export function contarPalabras(texto) {
  return String(texto ?? '').split(/[\p{Z}\p{Cc}—–]+/u).filter(Boolean).length;
}

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The text the student wrote as the campus keeps it (HTML): a paragraph per blank line, a break per line. */
export function aHtml(texto) {
  return String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split('\n').map((l) => escapar(l.trim())).join('<br>')}</p>`)
    .join('');
}

/** The text of a submission back in the form: a blank line between paragraphs. */
export const textoParaEditar = (envio) => (envio?.texto?.plano ?? '').split('\n').join('\n\n');

const extensionDe = (nombre) => (/\.([^.]+)$/.exec(String(nombre ?? ''))?.[1] ?? '').toLowerCase();

export const pesoEnTexto = (bytes, decimales = 1) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${(Number.isInteger(mb) ? String(mb) : mb.toFixed(decimales)).replace('.', ',')} MB`;
};

/** What is wrong with one file for this task, or ''. `archivo` is { nombre, peso }. */
export function revisarArchivo(archivo, reglas) {
  if (!reglas) return '';
  const { tipos, peso } = reglas;
  if (!tipos.todos && !tipos.extensiones.includes(extensionDe(archivo.nombre))) {
    return `Esta tarea no acepta este tipo de archivo. Va en ${tiposEnTexto(tipos)}.`;
  }
  if (peso && archivo.peso > peso) {
    // Just over the cap, one decimal would read the same as the cap («1,0 MB» and «1 MB»): two show it is over.
    const tope = pesoEnTexto(peso);
    const suyo = pesoEnTexto(archivo.peso).replace(/,0 /, ' ') === tope ? pesoEnTexto(archivo.peso, 2) : pesoEnTexto(archivo.peso);
    return `Pesa ${suyo} y el tope es ${tope}.`;
  }
  if (!archivo.peso && !archivo.yaEsta) return 'El archivo está vacío.';
  return '';
}

/** Everything wrong with a submission before it leaves: { texto, archivos, general, porArchivo } with '' when fine.
 * `archivos` are { id, nombre, peso, yaEsta }. `final` is true when this one goes to be graded. */
export function revisarEntrega(tarea, { texto = '', archivos = [], aceptada = false, final = true }) {
  const errores = { texto: '', archivos: '', general: '', declaracion: '', porArchivo: {} };
  const escrito = texto.trim();
  if (tarea.texto?.palabras) {
    const cuantas = contarPalabras(escrito);
    if (cuantas > tarea.texto.palabras) errores.texto = `Tiene ${cuantas} palabras y el tope es ${tarea.texto.palabras}.`;
  }
  if (tarea.archivos) {
    if (archivos.length > tarea.archivos.cuantos) {
      errores.archivos = tarea.archivos.cuantos === 1 ? 'Esta tarea acepta un solo archivo. Sacá alguno.' : `Esta tarea acepta hasta ${tarea.archivos.cuantos} archivos. Sacá alguno.`;
    }
    const nombres = new Map();
    for (const a of archivos) {
      const clave = a.nombre.toLowerCase();
      const error = nombres.has(clave) ? 'Ya hay otro archivo con este nombre.' : revisarArchivo(a, tarea.archivos);
      nombres.set(clave, true);
      if (error) errores.porArchivo[a.id] = error;
    }
  }
  if (!escrito && !archivos.length) {
    errores.general = tarea.texto && tarea.archivos ? 'Escribí el texto o elegí un archivo.' : tarea.texto ? 'Escribí el texto de la entrega.' : 'Elegí al menos un archivo.';
  }
  if (final && tarea.declaracion !== null && !aceptada) errores.declaracion = 'Para entregarla tenés que aceptar la declaración.';
  return errores;
}

export const hayErrores = (e) => Boolean(e.texto || e.archivos || e.general || e.declaracion || Object.keys(e.porArchivo).length);
