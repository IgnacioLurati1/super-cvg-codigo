// What Consultron knows of the student's own term: what's due and when (the campus), their classes of the week (Tu
// horario) and the faculty's calendar (exam calls, holidays, breaks). A question like «¿qué tengo esta semana?» or
// «¿cuándo vence el TP de Redes?» is answered with these pieces, never with the notes nor with what it knows in general.
// With them go the dates the student loaded (Calendario, the tasks and dates of each course), the campus' dates as they
// corrected them, and the Classroom tasks not turned in, if their Google account is connected. What they marked as done
// isn't pending. Everything comes from what Super CVG already asked the campus (conCache) and stays in memory.
import { CALENDARIO } from '../../data/facultad/calendario.js';
import { cargarMaterias, cargarMes, cargarPendientes, cargarPerfil } from '../campus.js';
import { claveDeFecha, fechaDeClave } from '../datos.js';
import { armarSemana, cuatrimestreQueSigue, horaEnTexto, sinClasesEl } from '../facultad.js';
import { conHechas, esHecha } from '../hechas.js';
import { cargarHorarios } from '../horarioDatos.js';
import { conCorrecciones, eventosPropios, mioActual } from '../mio.js';
import { textoDeTipo, tipoDe } from '../tipos.js';
import { cargarUnidos, pendientesDeUnidos } from './delClassroom.js';
import { plegar } from './fragmentos.js';

const DIA_MS = 86_400_000;
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const FECHA = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// How far ahead it looks: the rest of this month and the next.
const ADELANTE_DIAS = 45;

const cuandoEs = (segundos) => `${FECHA.format(new Date(segundos * 1000))} a las ${HORA.format(new Date(segundos * 1000))}`;
const diaDeClave = (clave) => FECHA.format(fechaDeClave(clave));
const diaDe = (segundos) => FECHA.format(new Date(segundos * 1000));

// The question is about the student's own term: what's due, their classes, the faculty's dates. «Hoy» or «parcial»
// alone aren't («¿qué se usa hoy en redes?», «¿qué es una derivada parcial?»).
const DE_CURSADA =
  /\b(que tengo|tengo que (entregar|rendir|hacer|presentar)|que (hay|tengo) (hoy|manana|esta semana)|esta semana|la semana que viene|proxima semana|cuando (vence|vencen|cierra|cierran|rindo|curso|tengo|empieza|termina|arranca|empiezan|terminan|son las mesas|son los finales|es el (parcial|recuperatorio|final|tp|trabajo))|(que|cual|cuales|cuando)\b.*\b(vence|vencen|se vence|cierra|cierran)|(proxim|siguient)[oa]s? (tareas?|entregas?|tps?|trabajos?|cuestionarios?|parcial|parciales|examen|examenes|final|finales|recuperatorios?|vencimientos?|clases?|mesas?)|(que |cuales |mis )?(tareas?|entregas?|tps?|cuestionarios?) (que me quedan|que tengo|que hay|me quedan|pendientes?|para (hoy|manana|esta semana))|vencimientos?|pendientes|mis (clases|entregas|parciales|materias|tareas|cuestionarios|horarios?|fechas)|que fechas tengo|fechas que (cargue|agregue|anote|puse)|(tareas?|entregas?) (de|del|en) classroom|mi horario|que curso|hay clases?|mesas? de (examen|finales)|llamados? (a|de) finales?|feriados?|receso|vacaciones|(mi|el|en el) calendario|que (hay|tengo)\b.*\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo|pasado manana)|(para|el|este|del|hasta el) (lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;

/** Whether a question is about the student's own term. */
export const esDeCursada = (pregunta) => DE_CURSADA.test(plegar(pregunta));

const NUMERO_DE_DIA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

/** The day a question asks about, at its midnight: «hoy», «mañana», «pasado mañana» or a weekday (the next one, today
 * included). Null if it names none. */
export function diaPreguntado(pregunta, ahora = new Date()) {
  const p = plegar(pregunta);
  const en = (n) => new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + n);
  if (/\bpasado ma[nñ]ana\b/.test(p)) return en(2);
  const dia = p.match(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/);
  if (dia) return en((NUMERO_DE_DIA[dia[1]] - ahora.getDay() + 7) % 7);
  if (/\bma[nñ]ana\b/.test(p)) return en(1);
  if (/\bhoy\b/.test(p)) return en(0);
  return null;
}

const entre = (clave, desde, hasta = desde) => clave >= desde && clave <= hasta;

/**
 * Everything of one day, already picked, so the model doesn't have to work out dates: what's due, the campus calendar,
 * the dates they loaded, their classes and the faculty's calendar. `datos`: { campus, classroom, propias, calendario,
 * clases }, as deCursada gathers them.
 */
export function piezaDelDia(dia, { campus = [], classroom = [], propias = [], calendario = [], clases = [] }, cal = CALENDARIO) {
  const clave = claveDeFecha(dia);
  const deEseDia = (segundos) => claveDeFecha(new Date(segundos * 1000)) === clave;
  const hora = (segundos) => HORA.format(new Date(segundos * 1000));
  const cosas = [];
  const vistos = new Set();
  const sumar = (titulo, texto) => {
    if (vistos.has(titulo)) return;
    vistos.add(titulo);
    cosas.push(texto);
  };
  for (const e of campus.filter((x) => deEseDia(x.vence))) sumar(e.titulo, `vence ${e.tipo.toLocaleLowerCase('es')} «${e.titulo}» de ${e.materia}, a las ${hora(e.vence)}`);
  for (const e of classroom.filter((x) => deEseDia(x.vence))) sumar(e.titulo, `vence la tarea de Classroom «${e.titulo}» de ${e.materia}, a las ${hora(e.vence)}`);
  for (const e of calendario.filter((x) => deEseDia(x.cuando))) {
    const que = e.momento === 'vence' ? 'vence' : e.momento === 'abre' ? 'abre' : 'hay';
    sumar(e.titulo, `${que} «${e.titulo}» de ${e.materia}${e.sinHora ? '' : `, a las ${hora(e.cuando)}`}${e.hecha ? ' (ya lo marcó como hecho)' : ''}`);
  }
  for (const e of propias.filter((x) => deEseDia(x.cuando))) sumar(e.titulo, `${claseDePropia(e)} «${e.titulo}»${e.materia ? ` de ${e.materia}` : ''}${e.sinHora ? '' : `, a las ${hora(e.cuando)}`}`);

  const libre = cal.sinClases.find(([d]) => d === clave);
  const receso = cal.recesos.find((r) => entre(clave, r.desde, r.hasta));
  const cuatri = cal.cuatrimestres.find((c) => entre(clave, c.desde, c.hasta));
  if (libre) cosas.push(`no hay clases (${libre[2]})`);
  else if (receso) cosas.push(`no hay clases (${receso.titulo.toLocaleLowerCase('es')})`);
  else if (cuatri) {
    const suyas = clases.filter((c) => c.dia === dia.getDay());
    if (suyas.length) cosas.push(`tiene clase de ${suyas.map((c) => `${c.nombre} de ${horaEnTexto(c.desde)} a ${horaEnTexto(c.hasta)}${c.aula ? `, aula ${c.aula}` : ''}`).join(' y de ')}`);
  }
  for (const c of cal.cuatrimestres) {
    if (c.desde === clave) cosas.push(`empieza el ${c.numero}.º cuatrimestre`);
    if (c.hasta === clave) cosas.push(`termina el ${c.numero}.º cuatrimestre`);
  }
  for (const l of cal.llamados) {
    if (l.examenes.includes(clave)) cosas.push(`hay mesas de finales (${l.numero}.º llamado)`);
    else if (entre(clave, l.consulta[0], l.consulta.at(-1))) cosas.push(`es semana de consultas del ${l.numero}.º llamado a finales`);
  }
  for (const t of cal.tramites) if (entre(clave, t.desde, t.hasta ?? t.desde)) cosas.push(t.titulo.charAt(0).toLocaleLowerCase('es') + t.titulo.slice(1));
  const fecha = FECHA.format(dia);
  const texto = cosas.length ? `Lo que tiene el ${fecha}: ${cosas.join('; ')}. Nada más ese día.` : `El ${fecha} no tiene nada: ni entregas, ni fechas suyas, ni clases, ni nada del calendario de la facultad.`;
  return pieza('cursada:dia', texto, { tipo: 'guia', nombre: 'Calendario', a: '/calendario' });
}

const pieza = (doc, texto, fuente) => ({ trozo: { doc, pagina: 1, texto, fuente }, puntaje: Infinity, cubre: 0 });

// «Parcial», «final», «entrega»; a task of a course is a «tarea», and one without a kind, a «fecha».
const claseDePropia = (e) => {
  if (e.propio === 'tarea') return 'tarea';
  const tipo = tipoDe(e);
  return tipo === 'otro' ? 'fecha' : textoDeTipo(tipo).toLocaleLowerCase('es');
};

// Each thing with a date as { cuando (s), texto }, the next ones first. From the campus, what's due.
const delCampus = (eventos, ahora) =>
  eventos
    .filter((e) => e.vence >= ahora - DIA_MS / 1000)
    .sort((a, b) => a.vence - b.vence)
    .slice(0, 15)
    .map((e) => ({ cuando: e.vence, texto: `${e.tipo} «${e.titulo}» de ${e.materia}, vence el ${cuandoEs(e.vence)}${e.vence < ahora ? ' (ya venció)' : ''}` }));

// The Classroom tasks not turned in. An overdue one counts for two weeks, as in Hoy (classroom.js, pendientesDe).
const deClassroom = (pendientes, ahora) =>
  [...pendientes]
    .sort((a, b) => a.vence - b.vence)
    .slice(0, 15)
    .map((e) => ({ cuando: e.vence, texto: `tarea de Classroom «${e.titulo}» de ${e.materia}, vence el ${cuandoEs(e.vence)}${e.vence < ahora ? ' (ya venció)' : ''}` }));

// The dates the student loaded, from yesterday on.
const dePropias = (eventos, ahora) =>
  eventos
    .filter((e) => e.cuando >= ahora - DIA_MS / 1000)
    .sort((a, b) => a.cuando - b.cuando)
    .slice(0, 25)
    .map((e) => ({ cuando: e.cuando, texto: `${claseDePropia(e)} «${e.titulo}»${e.materia ? ` de ${e.materia}` : ''}, el ${e.sinHora ? diaDe(e.cuando) : cuandoEs(e.cuando)}` }));

const enLista = (items) => items.map((i) => i.texto).join('; ');

/** The piece of what's due: { titulo, materia, tipo, vence (s) } from the campus, the next ones first. */
export function piezaDePendientes(eventos, ahoraMs) {
  const vienen = delCampus(eventos, ahoraMs / 1000);
  const texto = vienen.length ? `Lo que tiene pendiente en el campus: ${enLista(vienen)}.` : 'No tiene nada pendiente en el campus.';
  return pieza('cursada:pendientes', texto, { tipo: 'guia', nombre: 'Tus pendientes', a: '/' });
}

/**
 * What the student has ahead, as pieces. `campus`: what's due there, or null if it couldn't be asked. `classroom`: the
 * tasks not turned in ({ titulo, materia, vence (s) } of classroom.js, `pendientesDe`). `propias`: the dates the student
 * loaded ({ titulo, materia, cuando (s), sinHora, tipo, propio } of mio.js, `eventosPropios`).
 * With something of Classroom or of the student's own, all goes in one list by date: apart, the model answers «¿qué
 * tengo esta semana?» with the campus' list and leaves the rest out. With the campus alone, its piece of always.
 */
export function piezasDeLoQueViene({ campus = null, classroom = [], propias = [] }, ahoraMs) {
  const ahora = ahoraMs / 1000;
  const deAfuera = deClassroom(classroom, ahora);
  const suyas = dePropias(propias, ahora);
  if (!deAfuera.length && !suyas.length) return campus ? [piezaDePendientes(campus, ahoraMs)] : [];
  const todo = [...(campus ? delCampus(campus, ahora) : []), ...deAfuera, ...suyas].sort((a, b) => a.cuando - b.cuando);
  // With Classroom in it, a saved talk keeps no text of the piece (charlas.js).
  return [pieza(deAfuera.length ? 'cursada:classroom' : 'cursada:pendientes', `Lo que tiene por delante, por fecha: ${enLista(todo)}.`, { tipo: 'guia', nombre: 'Tus pendientes y fechas', a: '/' })];
}

/** The campus calendar of the coming days: { titulo, materia, cuando (s), momento } of cargarMes, maybe corrected by
 * the student (`sinHora`) or marked as done (`hecha`). */
export function piezaDeCalendario(eventos, ahoraMs) {
  const desde = ahoraMs / 1000 - DIA_MS / 1000;
  const hasta = desde + ADELANTE_DIAS * 86_400;
  const vienen = eventos.filter((e) => e.cuando >= desde && e.cuando <= hasta).sort((a, b) => a.cuando - b.cuando).slice(0, 25);
  if (!vienen.length) return null;
  const texto = `En el calendario del campus: ${vienen.map((e) => `${e.momento === 'vence' ? 'vence ' : e.momento === 'abre' ? 'abre ' : ''}«${e.titulo}» de ${e.materia}, el ${e.sinHora ? diaDe(e.cuando) : cuandoEs(e.cuando)}${e.hecha ? ' (ya lo marcó como hecho)' : ''}`).join('; ')}.`;
  return pieza('cursada:calendario', texto, { tipo: 'guia', nombre: 'Calendario', a: '/calendario' });
}

/** The classes of the week: { dia (0 Sunday), desde, hasta (minutes), nombre, aula } of armarSemana. */
export function piezaDeClases(clases) {
  if (!clases?.length) return null;
  const porDia = new Map();
  for (const c of clases) (porDia.get(c.dia) ?? porDia.set(c.dia, []).get(c.dia)).push(`${c.nombre} de ${horaEnTexto(c.desde)} a ${horaEnTexto(c.hasta)}${c.aula ? `, aula ${c.aula}` : ''}`);
  const dias = [1, 2, 3, 4, 5, 6, 0].filter((d) => porDia.has(d)).map((d) => `el ${DIAS[d]}, ${porDia.get(d).join(' y ')}`);
  return pieza('cursada:clases', `Sus clases de cada semana: ${dias.join('; ')}.`, { tipo: 'guia', nombre: 'Tu horario', a: '/horario' });
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * «¿Cuándo son las mesas de diciembre?»: the exam days of that month, by call, already picked (a small model keeps one
 * call and drops the other). Null if the question names no month or isn't about finals.
 */
export function piezaDeMesasDelMes(pregunta, hoy, cal = CALENDARIO) {
  const p = plegar(pregunta);
  if (!/\b(mesas?|finales|final|llamados?)\b/.test(p)) return null;
  const mes = MESES.findIndex((m) => new RegExp(`\\b${m}\\b`).test(p));
  if (mes < 0) return null;
  const delMes = (d) => Number(d.slice(5, 7)) === mes + 1 && d >= hoy.slice(0, 7);
  const llamados = cal.llamados.map((l) => ({ ...l, dias: l.examenes.filter(delMes) })).filter((l) => l.dias.length);
  const texto = llamados.length
    ? `Mesas de finales en ${MESES[mes]}: ${llamados.map((l) => `el ${l.numero}.º llamado, el ${l.dias.map((d) => diaDeClave(d).replace(',', '')).join(', ')}`).join('; ')}. No hay otras mesas en ${MESES[mes]}.`
    : `No hay mesas de finales en ${MESES[mes]}.`;
  return pieza('cursada:mesas', texto, { tipo: 'guia', nombre: 'Calendario académico', a: '/calendario' });
}

/** The faculty's calendar from today: the term, the next exam call, days without classes and breaks. */
export function piezaDeFacultad(hoy, cal = CALENDARIO) {
  const partes = [];
  const cuatri = cal.cuatrimestres.find((c) => c.numero === cuatrimestreQueSigue(hoy, cal));
  if (cuatri) partes.push(`El ${cuatri.numero}.º cuatrimestre va del ${diaDeClave(cuatri.desde)} al ${diaDeClave(cuatri.hasta)}.`);
  const libre = sinClasesEl(hoy, cal);
  if (libre) partes.push(`Hoy no hay clases: ${libre.titulo}.`);
  const vienen = cal.llamados.filter((l) => l.examenes.at(-1) >= hoy).slice(0, 4);
  if (vienen.length) partes.push(`Los llamados a finales que vienen: ${vienen.map((l) => `el ${l.numero}.º, con mesas el ${l.examenes.map((d) => diaDeClave(d).replace(',', '')).join(', ')}`).join('; ')}.`);
  const hasta = claveDeFecha(new Date(fechaDeClave(hoy).getTime() + ADELANTE_DIAS * DIA_MS));
  const sinClases = cal.sinClases.filter(([d]) => d > hoy && d <= hasta).map(([d, , titulo]) => `el ${diaDeClave(d)} (${titulo})`);
  if (sinClases.length) partes.push(`No hay clases ${sinClases.join(', ')}.`);
  const receso = cal.recesos.find((r) => r.hasta >= hoy);
  if (receso) partes.push(`El ${receso.titulo.toLocaleLowerCase('es')} va del ${diaDeClave(receso.desde)} al ${diaDeClave(receso.hasta)}.`);
  return pieza('cursada:facultad', `Calendario académico de la facultad. ${partes.join(' ')}`, { tipo: 'guia', nombre: 'Calendario académico', a: '/calendario' });
}

/**
 * The pieces of the student's term for a question about it, the date of today first. What the campus can't give
 * (offline, a failure) is left out: it answers with the rest.
 */
export async function deCursada(ahora = new Date(), pregunta = '') {
  const hoy = claveDeFecha(ahora);
  const ms = ahora.getTime();
  const proximo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
  const intento = (p) => p.catch(() => null);
  await intento(cargarPerfil());
  const mio = mioActual();
  const [pendientes, mes, siguiente, materias, horarios, unidos] = await Promise.all([
    intento(cargarPendientes()),
    intento(cargarMes(ahora.getFullYear(), ahora.getMonth() + 1)),
    intento(cargarMes(proximo.getFullYear(), proximo.getMonth() + 1)),
    intento(cargarMaterias()),
    intento(cargarHorarios()),
    intento(cargarUnidos()),
  ]);
  const nombres = Object.fromEntries([...(materias?.enCurso ?? []), ...(materias?.otras ?? [])].map((m) => [m.id, m.nombre]));
  // A date that falls in both months comes once. The student's corrections go over the campus' own.
  const delCampus = mes || siguiente ? conHechas(conCorrecciones([...new Map([...(mes ?? []), ...(siguiente ?? [])].map((e) => [e.id, e])).values()], mio, nombres), mio) : null;
  const sinHacer = (lista) => lista.filter((e) => !esHecha(mio, e));
  const cuatri = cuatrimestreQueSigue(hoy);
  const semana = horarios && materias ? armarSemana({ datos: horarios, cursos: materias.enCurso, mio, cuatrimestre: cuatri }) : null;
  const hoyTexto = pieza('cursada:hoy', `Hoy es ${FECHA.format(ahora)} de ${ahora.getFullYear()}, son las ${HORA.format(ahora)}.`, { tipo: 'guia', nombre: 'Hoy', a: '/' });
  // The exam days of a month named: those alone.
  const mesas = piezaDeMesasDelMes(pregunta, hoy);
  if (mesas) return [hoyTexto, mesas];
  // A day named («¿qué tengo el viernes?»): that day alone, already picked.
  const dia = diaPreguntado(pregunta, ahora);
  if (dia) {
    const ahoraS = Math.floor(ms / 1000);
    return [
      hoyTexto,
      piezaDelDia(dia, {
        campus: pendientes ? sinHacer(pendientes) : [],
        classroom: unidos?.length ? sinHacer(pendientesDeUnidos(unidos, ahoraS)) : [],
        propias: eventosPropios(mio, nombres),
        calendario: delCampus ?? [],
        clases: semana?.clases ?? [],
      }),
    ];
  }
  return [
    hoyTexto,
    ...piezasDeLoQueViene(
      {
        campus: pendientes ? sinHacer(pendientes) : null,
        classroom: unidos?.length ? sinHacer(pendientesDeUnidos(unidos, Math.floor(ms / 1000))) : [],
        propias: eventosPropios(mio, nombres),
      },
      ms,
    ),
    delCampus ? piezaDeCalendario(delCampus, ms) : null,
    piezaDeClases(semana?.clases),
    piezaDeFacultad(hoy),
  ].filter(Boolean);
}
