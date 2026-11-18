// Pure functions that turn campus responses into what the screens show. No network here.
import { leerBloques, sinEnlacesSolos } from './bloquesCampus';
import { CAMPUS } from './moodle';
import { textoDeTipo, tipoDe } from './tipos';

const DIA = 86_400;

/** Campus text can carry HTML. Screens only ever show it as plain text, so it can never run. */
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

export function textoPlano(html) {
  if (!html) return '';
  const documento = new DOMParser().parseFromString(String(html), 'text/html');
  return (documento.body.textContent ?? '').replace(BIDI, '').replace(/\s+/g, ' ').trim();
}

/** What a text area of the campus says, as plain text with one paragraph per line, and the http(s) links it
 * carries. Nothing of the HTML itself survives: no tags, no scripts, no images. */
export function leerTexto(html) {
  if (!html) return { texto: '', enlaces: [] };
  const conSaltos = String(html).replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote)\b[^>]*>/gi, '$&\n');
  const documento = new DOMParser().parseFromString(conSaltos, 'text/html');
  documento.querySelectorAll('script, style, template, noscript').forEach((el) => el.remove());
  const limpio = (t) => (t ?? '').replace(BIDI, '').replace(/\s+/g, ' ').trim();
  const enlaces = [];
  const vistos = new Set();
  for (const a of documento.querySelectorAll('a[href]')) {
    const destino = enlaceSeguro(a.getAttribute('href'));
    if (!destino || vistos.has(destino) || enlaces.length >= 50) continue;
    vistos.add(destino);
    enlaces.push({ texto: limpio(a.textContent) || dominioDe(destino), destino, dominio: dominioDe(destino) });
  }
  const texto = (documento.body.textContent ?? '').split('\n').map(limpio).filter(Boolean).join('\n');
  return { texto, enlaces };
}

/** A file name is not HTML. Drops what could disguise it or point to another folder. */
// The endings of the files that show up in courses. Only these: «Unidad 2.3» or «v1.0» stay as they are.
const EXTENSION = /\.(pdf|docx?|dotx|xlsx?|xlsm|csv|pptx?|ppsx?|od[tsgp]|rtf|txt|md|zip|rar|7z|tar|gz|png|jpe?g|gif|webp|bmp|svg|mp4|mov|avi|mkv|webm|mp3|m4a|wav|ogg|ipynb|py|java|cpp|c|h|js|html?|sql|xml|json)$/i;

/** A name to show, without the file's ending: the kind already goes next to it. Never empty. */
export function sinExtension(nombre) {
  const texto = String(nombre ?? '');
  const sin = texto.replace(EXTENSION, '').trimEnd();
  return sin && !/^[.\s]*$/.test(sin) ? sin : texto;
}

export function nombreDeArchivo(nombre) {
  const limpio = String(nombre ?? '').replace(/[\p{Cc}\p{Cf}/\\]/gu, '').trim();
  return limpio && !/^\.+$/.test(limpio) ? limpio : 'archivo';
}

/** The start of a text, to name it: up to 80 characters, cut at a word and marked with «…» when it goes on. */
export function primeraFrase(texto) {
  const linea = String(texto ?? '').split('\n').find((l) => l.trim())?.trim() ?? '';
  if (linea.length <= 80) return linea;
  const corte = linea.slice(0, 80);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > 40 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.]+$/, '')}…`;
}

/** Only http(s) links reach a screen. Anything else, such as javascript:, is dropped. */
export function enlaceSeguro(direccion) {
  if (!direccion) return null;
  try {
    const url = new URL(direccion);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.searchParams.delete('token');
    url.searchParams.delete('wstoken');
    return url.href;
  } catch {
    return null;
  }
}

export function dominioDe(direccion) {
  try {
    return new URL(direccion).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function idDeYoutube(direccion) {
  try {
    const url = new URL(direccion);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (host === 'youtu.be') id = url.pathname.slice(1);
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([^/]+)/.exec(url.pathname)?.[1] ?? null;
    }
    return id && /^[\w-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export const normalizar = (texto) =>
  (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const inicioDelDia = (segundos) => {
  const d = new Date(segundos * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime() / 1000;
};

export function faltan(vence, ahora) {
  const dias = Math.round((inicioDelDia(vence) - inicioDelDia(ahora)) / DIA);
  if (vence < ahora) {
    if (dias === 0) return 'Venció hoy';
    if (dias === -1) return 'Venció ayer';
    return `Venció hace ${-dias} días`;
  }
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

// Moodle wraps the name the teacher gave in its own sentence: «Se cierra TP 8», «Cuestionario 3 cierra», «Abre en
// sábado, 24 de octubre de 2026, 09:00: 2026- Parcial». The row already says what happens and when, so only the name
// stays. A date in front is cut where it ends in a time or a date followed by «:», never at its first «:».
const FECHA_DELANTE = String.raw`(?:en|el)\s+[^:]{0,60}?(?:\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?(?:\s*h(?:s|rs)?\.?)?|\d{4}|\d{1,2}/\d{1,2}(?:/\d{2,4})?|\d{1,2}\s+de\s+\p{L}+)\s*:`;
const DELANTE = new RegExp(String.raw`^(?:se\s+abre|abre|se\s+cierra|cierra|vence|apertura\s+del?|cierre\s+del?)(?:\s+${FECHA_DELANTE}|\s*:|\s+(?!\s|(?:en|el)\b))\s*`, 'iu');
const DETRAS = /(?:^|\s+)(?:(?:se\s+)?(?:abre|cierra|vence)(?:\s+(?:hoy|ma[ñn]ana|pronto))?|(?:ya\s+)?venci[oó]|est[aá]\s+vencid[oa]|deb(?:e|er[ií]a)\s+(?:entregarse|completarse|(?:ser|estar)\s+(?:entregad|completad)[oa])|est[aá]\s+(?:en\s+fecha\s+de\s+entrega|por\s+vencer))\s*\.?$/iu;
const QUE_AL_FINAL = /(?:^|\s)que(?:\s+(?:se|ya))?\s*$/iu;
// The notifications add a word of their own before a «:»: «Recordatorio: TP 3», «Vencida: TP 3». Only with the «:», so
// «Recordatorio del parcial» stays as it is.
const AVISO_DELANTE = /^(?:recordatorio|vencid[oa]|venci[oó]|(?:vence|cierra|abre)\s+pronto|pr[oó]xim[oa]\s+a\s+vencer|fecha\s+(?:l[ií]mite\s+)?de\s+entrega)\s*:\s*/iu;
// «2026- Parcial» but not «2026-11 Parcial».
const ANIO_SUELTO = /^20\d{2}\s*[-–—](?!\d)\s*/;

/** The name of a campus date or notification without what Moodle adds around it. Never empty: if nothing would be
 * left, the title as it came. */
export function tituloLimpio(titulo) {
  const original = String(titulo ?? '');
  const sinDelante = original.trim().replace(AVISO_DELANTE, '').replace(DELANTE, '').replace(ANIO_SUELTO, '');
  const sinDetras = sinDelante.replace(DETRAS, '');
  // After «que» it belongs to the name: «Entrega que venció», «Foro que se cierra» stay whole.
  const limpio = (QUE_AL_FINAL.test(sinDetras) ? sinDelante : sinDetras).trim();
  return /[\p{L}\p{N}]/u.test(limpio) ? limpio : original;
}

/** The course module of a campus activity of a kind from its address (/mod/<tipo>/view.php?id=…), or null. */
export function moduloDe(direccion, tipo) {
  try {
    const url = new URL(direccion);
    const id = Number(url.searchParams.get('id'));
    return url.origin === CAMPUS && url.pathname === `/mod/${tipo}/view.php` && Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** The course module of a campus task from its address (/mod/assign/view.php?id=…), or null. */
export const moduloDeTarea = (direccion) => moduloDe(direccion, 'assign');

export function normalizarEvento(evento) {
  const cmid = evento.modulename === 'assign' ? moduloDeTarea(evento.url) ?? moduloDeTarea(evento.action?.url) : null;
  const deCuestionario = evento.modulename === 'quiz' ? moduloDe(evento.url, 'quiz') ?? moduloDe(evento.action?.url, 'quiz') : null;
  return {
    id: evento.id,
    titulo: tituloLimpio(textoPlano(evento.activityname || evento.name)),
    materia: textoPlano(evento.course?.fullnamedisplay || evento.course?.fullname),
    materiaId: evento.course?.id ?? null,
    tipo: textoPlano(evento.modulename === 'assign' ? 'Entrega' : evento.modulename === 'quiz' ? 'Cuestionario' : evento.normalisedeventtypetext || 'Actividad'),
    vence: evento.timesort,
    url: enlaceSeguro(evento.action?.url || evento.url || evento.viewurl),
    // A campus task opens its page in Super CVG (Tarea.jsx).
    tarea: cmid && evento.course?.id ? { materiaId: evento.course.id, cmid } : null,
    // And a quiz, its page (Cuestionario.jsx).
    cuestionario: deCuestionario && evento.course?.id ? { materiaId: evento.course.id, cmid: deCuestionario } : null,
  };
}

export function agruparPendientes(eventos, ahora) {
  const ordenados = [...eventos].sort((a, b) => a.vence - b.vence);
  const finDeSemana = inicioDelDia(ahora) + 8 * DIA;
  return {
    vencidos: ordenados.filter((e) => e.vence < ahora).reverse(),
    semana: ordenados.filter((e) => e.vence >= ahora && e.vence < finDeSemana),
    despues: ordenados.filter((e) => e.vence >= finDeSemana),
  };
}

/** Same for every student of the course, and only numbers and letters: it can be stored and shared. */
export function huella(texto) {
  let h = 5381;
  for (const letra of String(texto)) h = ((h * 33) ^ letra.codePointAt(0)) >>> 0;
  return h.toString(36);
}

const conTipo = (base, contenido) => ({
  ...base,
  tipo: 'archivo',
  id: `${base.id}-${contenido.filepath ?? ''}${contenido.filename}`,
  clave: base.archivos > 1 ? `${base.clave}.${huella(`${contenido.filepath ?? ''}${contenido.filename}`)}` : base.clave,
  nombre: sinExtension(base.archivos > 1 ? nombreDeArchivo(contenido.filename) : base.nombre),
  archivo: nombreDeArchivo(contenido.filename),
  direccion: contenido.fileurl,
  peso: contenido.filesize ?? 0,
  mime: contenido.mimetype ?? '',
  modificado: contenido.timemodified || contenido.timecreated || 0,
});

/** One flat list of a course's files, links and activities. Items the student cannot see stay out. */
export function aplanarContenido(secciones, materia) {
  const items = [];
  for (const seccion of Array.isArray(secciones) ? secciones : []) {
    if (seccion.uservisible === false) continue;
    const nombreSeccion = textoPlano(seccion.name);
    for (const modulo of seccion.modules ?? []) {
      if (modulo.uservisible === false) continue;
      const archivos = (modulo.contents ?? []).filter((c) => c.type === 'file');
      const base = {
        id: `${materia.id}-${modulo.id}`,
        clave: String(modulo.id),
        nombre: textoPlano(modulo.name),
        seccion: nombreSeccion,
        seccionId: seccion.id ?? nombreSeccion,
        descripcion: textoPlano(modulo.description).slice(0, 600),
        fechas: (modulo.dates ?? []).map((d) => ({ etiqueta: textoPlano(d.label), cuando: d.timestamp })),
        materia: materia.nombre,
        materiaId: materia.id,
        campus: enlaceSeguro(modulo.url),
        archivos: archivos.length,
      };
      // A text area: some courses keep everything there (the Drive folder of each unit, the Zoom of each class).
      if (modulo.modname === 'label') {
        const { texto, enlaces } = leerTexto(modulo.description);
        if (texto || enlaces.length) {
          items.push({
            ...base,
            nombre: base.nombre || primeraFrase(texto) || 'Texto del campus',
            tipo: 'texto',
            clase: 'Texto',
            texto: texto.slice(0, 6000),
            // Its headings, lists and bold, to show it as the campus does.
            bloques: sinEnlacesSolos(leerBloques(modulo.description)),
            recortado: texto.length > 6000,
            descripcion: texto.slice(0, 600),
            enlaces,
            // A text area has no page of its own: the course page, at its place.
            campus: enlaceSeguro(`${CAMPUS}/course/view.php?id=${materia.id}#module-${modulo.id}`),
            destino: null,
            modificado: 0,
          });
        }
        continue;
      }
      if ((modulo.modname === 'resource' || modulo.modname === 'folder') && archivos.length) {
        for (const c of archivos) items.push(conTipo(base, c));
      } else if (modulo.modname === 'url') {
        const destino = enlaceSeguro(modulo.contents?.[0]?.fileurl) ?? base.campus;
        if (destino) items.push({ ...base, tipo: 'enlace', destino, dominio: dominioDe(destino), video: idDeYoutube(destino), modificado: modulo.contents?.[0]?.timemodified ?? 0 });
      } else if (base.campus) {
        // A task keeps its course and module: it opens its page in Super CVG, also from a course of one's own.
        const tarea = modulo.modname === 'assign' && Number.isSafeInteger(modulo.id) ? { materiaId: materia.id, cmid: modulo.id } : undefined;
        // A quiz too: its attempts, grade and review (Cuestionario.jsx).
        const cuestionario = modulo.modname === 'quiz' && Number.isSafeInteger(modulo.id) ? { materiaId: materia.id, cmid: modulo.id } : undefined;
        items.push({ ...base, tipo: 'actividad', clase: textoPlano(modulo.modplural), destino: base.campus, modificado: 0, tarea, cuestionario });
      }
    }
  }
  return items;
}

export function buscar(items, consulta, limite = 100) {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const halladas = [];
  for (const item of items) {
    const nombre = normalizar(`${item.nombre} ${item.nombreOriginal ?? ''} ${item.archivo ?? ''}`);
    // A text area is searched whole, links included: the Drive folder may be in its third paragraph.
    const enlaces = (item.enlaces ?? []).map((e) => `${e.texto} ${e.dominio}`).join(' ');
    const todo = `${nombre} ${normalizar(item.seccion)} ${normalizar(item.materia)} ${normalizar(item.texto ?? item.descripcion)} ${normalizar(item.dominio)} ${normalizar(enlaces)}`;
    if (!palabras.every((p) => todo.includes(p))) continue;
    halladas.push({ item, puntos: palabras.filter((p) => nombre.includes(p)).length });
  }
  return halladas
    .sort((a, b) => b.puntos - a.puntos || (b.item.modificado ?? 0) - (a.item.modificado ?? 0))
    .slice(0, limite)
    .map((h) => h.item);
}

export function recientes(items, ahora, { dias = 45, limite = 8 } = {}) {
  return items
    .filter((i) => i.modificado && ahora - i.modificado <= dias * DIA)
    .sort((a, b) => b.modificado - a.modificado)
    .slice(0, limite);
}

function cursoDelAviso(aviso) {
  try {
    const curso = Number(JSON.parse(aviso.customdata).courseid);
    return Number.isInteger(curso) && curso > 0 ? curso : null;
  } catch {
    return null;
  }
}

function moduloDelAviso(url) {
  if (!url) return null;
  const { pathname, searchParams } = new URL(url);
  return pathname.startsWith('/mod/') ? searchParams.get('id') : null;
}

export function normalizarAviso(aviso) {
  const url = enlaceSeguro(aviso.contexturl);
  return {
    id: aviso.id,
    titulo: tituloLimpio(textoPlano(aviso.subject)),
    cuando: aviso.timecreated,
    leido: Boolean(aviso.read),
    url,
    materiaId: cursoDelAviso(aviso),
    modulo: moduloDelAviso(url),
  };
}

/** The campus names the course in some notifications; in the others, the link points to one of its activities. */
export function materiaDeAviso(aviso, items) {
  const item = items.find((i) => (aviso.materiaId ? i.materiaId === aviso.materiaId : aviso.modulo && i.id.split('-')[1] === aviso.modulo));
  return item ? { id: item.materiaId, nombre: item.materia } : null;
}

export const peso = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
};

const FECHA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });
const FECHA_HORA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const HOY = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });

export const fecha = (segundos) => FECHA.format(new Date(segundos * 1000));
export const fechaHora = (segundos) => FECHA_HORA.format(new Date(segundos * 1000));
/** The same, standing alone as a value («Viernes 13 de noviembre, 23:59»): with its first letter up. */
export const fechaHoraSuelta = (segundos) => {
  const texto = fechaHora(segundos);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};
export function hoyEnTexto(ahoraMs) {
  const texto = HOY.format(new Date(ahoraMs));
  return texto.charAt(0).toLocaleUpperCase('es') + texto.slice(1);
}
export const enElCampus = (direccion) => Boolean(direccion?.startsWith(`${CAMPUS}/`));

// ---------- Calendar ----------
const dos = (n) => String(n).padStart(2, '0');
export const claveDeFecha = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
export const claveDia = (segundos) => claveDeFecha(new Date(segundos * 1000));
export const fechaDeClave = (clave) => {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
};
/** A real day between 2000 and 2100 written as YYYY-MM-DD. «2026-02-31» or the year 20 are not. */
export const esClaveDeDia = (t) =>
  typeof t === 'string' && /^(20\d{2}|2100)-\d{2}-\d{2}$/.test(t) && claveDeFecha(fechaDeClave(t)) === t;

/** The weeks of a month as Monday-first rows, including the neighboring days that fill them. */
export function armarMes(anio, mes) {
  const primero = new Date(anio, mes - 1, 1);
  const corrimiento = (primero.getDay() + 6) % 7;
  const ultimo = new Date(anio, mes, 0).getDate();
  const celdas = Math.ceil((corrimiento + ultimo) / 7) * 7;
  const semanas = [];
  for (let i = 0; i < celdas; i += 1) {
    const d = new Date(anio, mes - 1, 1 - corrimiento + i);
    if (i % 7 === 0) semanas.push([]);
    semanas.at(-1).push({ clave: claveDeFecha(d), dia: d.getDate(), delMes: d.getMonth() === mes - 1 });
  }
  return semanas;
}

const VENCIMIENTOS = new Set(['due', 'close', 'expectcompletionon']);

export function normalizarEventoMes(evento) {
  const url = enlaceSeguro(evento.url || evento.viewurl);
  const curso = Number.isSafeInteger(evento.course?.id) && evento.course.id > 0 ? evento.course.id : null;
  const cmid = curso ? moduloDeTarea(url) : null;
  const deCuestionario = curso && !cmid ? moduloDe(url, 'quiz') : null;
  return {
    id: evento.id,
    // The activity's own name when there is one: `name` is Moodle's sentence around it.
    titulo: tituloLimpio(textoPlano(evento.activityname) || textoPlano(evento.name)),
    materia: textoPlano(evento.course?.fullnamedisplay || evento.course?.fullname) || 'General',
    materiaId: evento.course?.id ?? 0,
    vencimiento: VENCIMIENTOS.has(evento.eventtype),
    // What happens at that time, since the title no longer says it. The row puts it before the date.
    momento: VENCIMIENTOS.has(evento.eventtype) ? 'vence' : evento.eventtype === 'open' ? 'abre' : undefined,
    cuando: evento.timesort || evento.timestart,
    url,
    // Like the dates of Hoy: a campus task or quiz opens its page in Super CVG, not the campus.
    ...(cmid ? { tarea: { materiaId: curso, cmid } } : {}),
    ...(deCuestionario ? { cuestionario: { materiaId: curso, cmid: deCuestionario } } : {}),
  };
}

export function eventosDelMes(respuesta) {
  const vistos = new Map();
  for (const semana of respuesta?.weeks ?? []) {
    for (const dia of semana.days ?? []) {
      for (const evento of dia.events ?? []) vistos.set(evento.id, normalizarEventoMes(evento));
    }
  }
  return [...vistos.values()].sort((a, b) => a.cuando - b.cuando);
}

export function porDia(eventos) {
  const dias = {};
  for (const e of eventos) (dias[claveDia(e.cuando)] ??= []).push(e);
  return dias;
}

export const horaDe = (segundos) => new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(segundos * 1000));
export const mesEnTexto = (anio, mes) => new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(anio, mes - 1, 1));
export const diaEnTexto = (clave) => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(fechaDeClave(clave));

const utc = (segundos) => new Date(segundos * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escaparIcs = (texto) => String(texto).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n?|\n/g, '\\n');
const plegar = (linea) => {
  const partes = [];
  let resto = linea;
  while (resto.length > 72) {
    partes.push(resto.slice(0, 72));
    resto = ` ${resto.slice(72)}`;
  }
  partes.push(resto);
  return partes.join('\r\n');
};

/** A calendar file any calendar app can import, built in the browser. */
// The campus' date when an activity opens says so: its close comes with the same name.
const conMomento = (e) => (!e.propio && e.momento === 'abre' ? `Abre ${e.titulo}` : e.titulo);

export function armarIcs(eventos, ahoraSegundos) {
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Super CVG//ES', 'CALSCALE:GREGORIAN'];
  for (const e of eventos) {
    lineas.push(
      'BEGIN:VEVENT',
      `UID:${String(e.id).replace(/[^\w-]/g, '')}@super-cvg`,
      `DTSTAMP:${utc(ahoraSegundos)}`,
      // A whole-day date stays on its day in any time zone.
      e.sinHora ? `DTSTART;VALUE=DATE:${claveDia(e.cuando).replace(/-/g, '')}` : `DTSTART:${utc(e.cuando)}`,
      `SUMMARY:${escaparIcs(e.materia ? `${conMomento(e)} (${e.materia})` : conMomento(e))}`,
    );
    const tipo = tipoDe(e);
    if (tipo !== 'otro') lineas.push(`CATEGORIES:${textoDeTipo(tipo)}`);
    if (e.url) lineas.push(`URL:${e.url}`);
    lineas.push('END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return `${lineas.map(plegar).join('\r\n')}\r\n`;
}
