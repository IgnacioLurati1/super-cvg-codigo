// What goes to Google Calendar, built here and nowhere else: the link to add one date by hand, and the events of the
// calendar «Super CVG» both ways (calendarioSincro.js): what goes, and what comes back as a date of the student's own.
import { claveDeFecha, claveDia, fechaDeClave, huella } from './datos';
import { TIPOS, textoDeTipo, tipoDe } from './tipos';

const HORA = 3600;
// The longest title and course name that go to Google: enough to read them, without a link miles long.
const MAX_TITULO = 200;
const MAX_MATERIA = 100;
/** The time zone of the calendar it creates: the campus is in Rosario. */
export const ZONA = 'America/Argentina/Buenos_Aires';

const sinGuiones = (clave) => clave.replace(/-/g, '');
// Cut by characters, not by halves of one: an emoji at the edge doesn't break.
const recortar = (texto, maximo) => {
  const letras = [...String(texto ?? '')];
  return letras.length > maximo ? `${letras.slice(0, maximo - 1).join('').trimEnd()}…` : letras.join('');
};
const utc = (segundos) => new Date(segundos * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const diaSiguiente = (cuando) => {
  const dia = fechaDeClave(claveDia(cuando));
  return claveDeFecha(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() + 1));
};
// The campus' events of the whole site come as «General»: they go without a course.
const conMateria = (evento) => (evento.materia && !(evento.materiaId === 0 && evento.materia === 'General') ? recortar(evento.materia, MAX_MATERIA) : null);
/** What goes in parentheses after the title: the course, if it has one. */
export const materiaEnTitulo = conMateria;
// The campus' date when an activity opens says so: its close comes with the same name.
const conMomento = (evento) => (!evento.propio && evento.momento === 'abre' ? `Abre ${evento.titulo}` : evento.titulo);
const tituloDe = (evento) => {
  const materia = conMateria(evento);
  const titulo = recortar(conMomento(evento), MAX_TITULO);
  return materia ? `${titulo} (${materia})` : titulo;
};
const detalleDe = (evento) => {
  if (evento.propio === 'sysacad') return 'Te anotaste en Sysacad, desde Super CVG';
  if (evento.propio === 'facultad') return 'Calendario académico, desde Super CVG';
  const tipo = tipoDe(evento);
  return tipo === 'otro' ? 'Desde Super CVG' : `${textoDeTipo(tipo)}, desde Super CVG`;
};

/** Google Calendar's screen to add one date, filled in. Nothing is saved until the student says so there. A date
 * without a time takes the whole day (the end is the next day, not included); with a time, it lasts an hour. */
export function agregarAGoogle(evento) {
  const fechas = evento.sinHora
    ? `${sinGuiones(claveDia(evento.cuando))}/${sinGuiones(diaSiguiente(evento.cuando))}`
    : `${utc(evento.cuando)}/${utc(evento.cuando + HORA)}`;
  const parametros = { action: 'TEMPLATE', text: tituloDe(evento), dates: fechas, details: detalleDe(evento) };
  // %20 and not «+» for the spaces, and the slash between the dates as is, the way these links are usually written.
  const consulta = Object.entries(parametros).map(([clave, valor]) => `${clave}=${encodeURIComponent(valor).replace(/%2F/g, '/')}`).join('&');
  return `https://calendar.google.com/calendar/render?${consulta}`;
}

// Google takes an event id of 5 to 1024 characters among 0-9 and a-v. The campus' ones are numbers; the student's own
// ones («e12», «f3-4», «t3-5») go as the hex of their letters, which are among those too. One that came from Google keeps
// Google's id (`gid`). The academic calendar's, by their day and title: the same date keeps its id when the faculty's
// calendar is written again with dates added or moved around it. An exam of Sysacad, by its day and subject.
const hex = (texto) => [...new TextEncoder().encode(texto)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** The id of a date in the calendar «Super CVG»: always the same for the same date, from any device. */
export const idEnGoogle = (evento) => {
  if (evento.gid) return evento.gid;
  // «mesa» and not «sysacad»: Google takes no «y».
  if (evento.propio === 'sysacad') return `mesa${hex(`${evento.dia} ${evento.materiaSysacad}`)}`;
  if (evento.propio === 'facultad') return `facultad${hex(`${claveDia(evento.cuando)} ${evento.titulo}`)}`;
  return evento.propio ? `propio${hex(String(evento.id))}` : `campus${evento.id}`;
};
/** Whether Google takes it as the id of a new event. */
export const idValido = (id) => typeof id === 'string' && /^[0-9a-v]{5,1024}$/.test(id);

const deHex = (h) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16)));
  } catch {
    return null;
  }
};
const numero = (t) => (Number.isSafeInteger(Number(t)) && Number(t) > 0 ? Number(t) : null);

/** Which date of the student's own an event of the calendar is, when Super CVG wrote it (from this device or another):
 * { propio: 'evento', id } or { propio: 'tarea' | 'fecha', materiaId, id }. Null for anything else. */
export function origenDeId(id) {
  const m = /^propio((?:[0-9a-f]{2}){2,40})$/.exec(String(id));
  const texto = m && deHex(m[1]);
  if (!texto) return null;
  let p = /^e(\d{1,16})$/.exec(texto);
  if (p) return numero(p[1]) ? { propio: 'evento', id: numero(p[1]) } : null;
  p = /^([tf])(\d{1,12})-(\d{1,16})$/.exec(texto);
  if (!p || !numero(p[2]) || !numero(p[3])) return null;
  return { propio: p[1] === 't' ? 'tarea' : 'fecha', materiaId: numero(p[2]), id: numero(p[3]) };
}

/** A whole number for a date that was born in Google, always the same for the same event: below the ones Super CVG gives
 * its own (those come from the clock), so they never meet. */
export function idDeGoogle(gid) {
  const a = parseInt(huella(gid), 36);
  const b = parseInt(huella(`·${gid}`), 36) & 0xffff;
  return a * 65_536 + b + 1;
}

/** A date of the calendar (the campus', the faculty's or the student's) as an event of the calendar «Super CVG». A date without a time
 * takes the whole day. A campus deadline ends at its time; anything else with a time starts at it. Both last an hour.
 * They don't mark the student as busy. One that was born in Google goes without a description: theirs stays. */
export function eventoParaGoogle(evento) {
  let start;
  let end;
  if (evento.sinHora) {
    start = { date: claveDia(evento.cuando) };
    end = { date: diaSiguiente(evento.cuando) };
  } else {
    const desde = !evento.propio && evento.vencimiento ? evento.cuando - HORA : evento.cuando;
    start = { dateTime: new Date(desde * 1000).toISOString(), timeZone: ZONA };
    end = { dateTime: new Date((desde + HORA) * 1000).toISOString(), timeZone: ZONA };
  }
  return {
    id: idEnGoogle(evento),
    status: 'confirmed',
    summary: tituloDe(evento),
    ...(evento.gid ? {} : { description: detalleDe(evento) }),
    start,
    end,
    transparency: 'transparent',
    ...(evento.url ? { source: { title: 'Campus', url: evento.url } } : {}),
    extendedProperties: { private: { cvg: '1', fuente: fuenteDe(evento) } },
  };
}

function fuenteDe(evento) {
  if (evento.propio === 'sysacad') return 'sysacad';
  if (evento.propio === 'facultad') return 'facultad';
  return evento.propio ? 'propio' : 'campus';
}

const inicioDe = (e) => {
  if (typeof e?.start?.date === 'string') return fechaDeClave(e.start.date).getTime() / 1000;
  const t = Date.parse(e?.start?.dateTime ?? '');
  return Number.isFinite(t) ? t / 1000 : null;
};
// The same moment, written by Super CVG or as Google gives it back, gives the same thing.
const momento = (m) => {
  if (typeof m?.date === 'string') return m.date;
  const t = Date.parse(m?.dateTime ?? '');
  return Number.isFinite(t) ? t / 1000 : null;
};
/** The fingerprint of what both sides share: the title and when it starts and ends. Not the description, the color or
 * the reminders the student set in Google: those are theirs. */
export const huellaGoogle = (e) => huella(JSON.stringify([e?.summary ?? '', momento(e?.start), momento(e?.end)]));

const tipoDeDetalle = (texto) => TIPOS.find((t) => t.valor !== 'otro' && texto === `${t.texto}, desde Super CVG`)?.valor ?? 'otro';

/** An event of Google as a date of the student's own: its title, course, day and time. The course in parentheses at the
 * end of the title is taken off when it is `materia` (what Super CVG put there) or one of the student's courses
 * (`nombres`, { materiaId: name }). With a time it takes when it starts; a whole day, its first day at noon. */
export function deGoogle(e, { nombres = {}, materia = null } = {}) {
  let titulo = String(e?.summary ?? '').trim();
  let materiaId;
  const parentesis = / \(([^()]{1,120})\)$/.exec(titulo);
  if (parentesis) {
    const conocida = Object.keys(nombres).find((id) => recortar(nombres[id], MAX_MATERIA) === parentesis[1]);
    if (conocida || (materia && parentesis[1] === materia)) {
      titulo = titulo.slice(0, parentesis.index).trim();
      if (conocida && parentesis[1] !== materia) materiaId = Number(conocida);
    }
  }
  let cuando;
  let sinHora;
  if (typeof e?.start?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.start.date)) {
    const dia = fechaDeClave(e.start.date);
    cuando = Math.floor(new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 12).getTime() / 1000);
    sinHora = true;
  } else {
    const t = Date.parse(e?.start?.dateTime ?? '');
    if (!Number.isFinite(t)) return null;
    cuando = Math.floor(t / 1000);
    sinHora = false;
  }
  if (!(cuando > 0)) return null;
  return { titulo: recortar(titulo || 'Sin título', MAX_TITULO), cuando, sinHora, tipo: tipoDeDetalle(e?.description), ...(materiaId === undefined ? {} : { materiaId }) };
}

// The dates that only go: the campus' and the faculty's academic calendar. Which one an event is, by what Super CVG wrote
// in it or, with nothing on either side, by its id.
const DE_IDA = new Set(['campus', 'facultad', 'sysacad']);
const fuenteEscrita = (e) => (e?.extendedProperties?.private?.cvg === '1' ? e.extendedProperties.private.fuente : null);
const fuenteDelId = (id) => {
  if (/^campus\d+$/.test(id)) return 'campus';
  if (/^facultad(?:[0-9a-f]{2})+$/.test(id)) return 'facultad';
  return /^mesa(?:[0-9a-f]{2})+$/.test(id) ? 'sysacad' : null;
};

/** Both sides as one calendar. `deseados` is what Super CVG has (built with eventoParaGoogle), `existentes` what the
 * calendar has, and `base`, { id: [here, there] }, the fingerprints of both the last time they agreed. Whatever changed
 * on one side goes to the other; changed on both, the latest wins (`tocado`, { id: ms }, says when it changed here).
 * The student's own dates and anything they write in Google come and go both ways. The campus' dates only go: the
 * campus is not changed from here. One the student deleted or changed in Google stays that way until the campus
 * changes it, and one the course took out is deleted from `desde` on, unless the student changed it. Without
 * `conCampus`, the campus' ones are left as they are. The faculty's academic calendar goes the same way as the campus',
 * always: it ships with the site. The exams of Sysacad go that way too; without `conSysacad` (Sysacad Lindo did not
 * say them for this student here), they are left as they are. Repeating events of Google stay only there.
 * Returns what to write (`poner`, new; `cambiar`, over what is there), what to delete (`quitar`), what to bring here
 * (`traer`: { id, como: 'nuevo' | 'cambio' | 'borrado', remoto }) and the new `base` (a null «here» is filled in once
 * what came is saved). `fuera` are own dates that are not in the calendar on purpose (a task done). */
export function planear({ deseados, existentes, base = {}, tocado = {}, desde = 0, conCampus = true, conSysacad = true, fuera = new Set() }) {
  const remotos = new Map();
  for (const e of existentes) {
    if (e && typeof e.id === 'string' && e.status !== 'cancelled' && !e.recurrence && !e.recurringEventId) remotos.set(e.id, e);
  }
  const locales = new Map(deseados.map((e) => [e.id, e]));
  const plan = { poner: [], cambiar: [], quitar: [], traer: [], base: {} };
  const anotar = (id, aca, alla) => {
    plan.base[id] = [aca, alla];
  };
  const escribir = (evento, nuevo) => {
    if (nuevo && !idValido(evento.id)) return false;
    (nuevo ? plan.poner : plan.cambiar).push(evento);
    anotar(evento.id, huellaGoogle(evento), huellaGoogle(evento));
    return true;
  };
  for (const id of new Set([...locales.keys(), ...remotos.keys(), ...Object.keys(base)])) {
    const local = locales.get(id);
    const remoto = remotos.get(id);
    const b = Array.isArray(base[id]) ? base[id] : null;
    const aca = local ? huellaGoogle(local) : null;
    const alla = remoto ? huellaGoogle(remoto) : null;
    const fuente = local ? fuenteEscrita(local) : remoto ? fuenteEscrita(remoto) : fuenteDelId(id);
    if (DE_IDA.has(fuente)) {
      if ((!conCampus && fuente === 'campus') || (!conSysacad && fuente === 'sysacad')) {
        if (b) anotar(id, ...b);
      } else if (local && remoto) {
        if (b ? aca !== b[0] : aca !== alla) escribir(local, false);
        else anotar(id, aca, alla);
      } else if (local) {
        // Deleted in Google: it stays deleted while the campus doesn't change it.
        if (b && aca === b[0]) anotar(id, ...b);
        else escribir(local, true);
      } else if (remoto && (inicioDe(remoto) ?? 0) >= desde) {
        if (b && alla !== b[1]) anotar(id, ...b);
        else plan.quitar.push(id);
      }
      continue;
    }
    const traer = (como) => {
      plan.traer.push({ id, como, remoto });
      if (como !== 'borrado') anotar(id, null, alla);
    };
    if (local && remoto) {
      const aqui = !b || aca !== b[0];
      const alli = !b || alla !== b[1];
      if (aca === alla || (!aqui && !alli)) anotar(id, aca, alla);
      else if (aqui && !alli) escribir(local, false);
      else if (!aqui && alli) traer('cambio');
      else if ((tocado[id] ?? 0) > (Date.parse(remoto.updated ?? '') || 0)) escribir(local, false);
      else traer('cambio');
    } else if (local) {
      // Deleted in Google, unless it changed here after that.
      if (b && aca === b[0]) traer('borrado');
      else escribir(local, true);
    } else if (remoto) {
      if (fuera.has(id)) plan.quitar.push(id);
      // Deleted here, unless it changed in Google after that.
      else if (b && alla === b[1]) plan.quitar.push(id);
      else traer('nuevo');
    }
  }
  return plan;
}
