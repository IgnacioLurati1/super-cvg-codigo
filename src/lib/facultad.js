// The faculty's own information: its academic calendar and the class schedules of each commission. Both come from its
// public pages (scripts/facultad/), ship with the site and change once or twice a year. Pure: no storage, no network.
//
// The schedule of a student is built here from what the site knows: each campus course is matched to its subject in
// the commission the student studies in. That commission is, first, the one chosen for that course; if not, the one in
// the course's name («Física II - 2K3»); and if not, the one chosen for all. Nothing of the campus is kept: only the
// student's choices, in mio.js.
import { CALENDARIO } from '../data/facultad/calendario';
import { claveDeFecha, fechaDeClave, normalizar } from './datos';
import { resumenDe } from './santoResumen';
import { palabrasDe } from './sysacad';

// ---------- Calendar ----------

const ORDINALES = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo', 'undécimo', 'duodécimo'];
const ordinal = (n) => ORDINALES[n - 1] ?? `${n}.º`;
// A day's date as the seconds of its noon: whole-day dates stay on their day.
const segundosDe = (clave) => {
  const d = fechaDeClave(clave);
  d.setHours(12, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};
const diaYMes = (clave) => new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(fechaDeClave(clave));
const entre = (clave, desde, hasta) => clave >= desde && clave <= (hasta ?? desde);

/** Why there are no classes on a day (a holiday, a day the faculty closes, a recess), or null. */
export function sinClasesEl(clave, cal = CALENDARIO) {
  const dia = cal.sinClases.find(([d]) => d === clave);
  if (dia) return { tipo: dia[1], titulo: dia[2] };
  const receso = cal.recesos.find((r) => entre(clave, r.desde, r.hasta));
  return receso ? { tipo: 'receso', titulo: receso.titulo } : null;
}

/** The cuatrimestre a day is in (1 or 2), or null outside both. */
export const cuatrimestreEl = (clave, cal = CALENDARIO) => cal.cuatrimestres.find((c) => entre(clave, c.desde, c.hasta))?.numero ?? null;

/** The cuatrimestre whose schedule matters on a day: the one going on or, in between, the next one. After the last
 * one of the cycle, the last one. */
export function cuatrimestreQueSigue(clave, cal = CALENDARIO) {
  const ahora = cuatrimestreEl(clave, cal);
  if (ahora) return ahora;
  return cal.cuatrimestres.find((c) => c.desde > clave)?.numero ?? cal.cuatrimestres.at(-1).numero;
}

/** What paints a whole day in the Calendario, or null: a day without classes (holiday, closed, recess), a day of an
 * exam call, or the end of a cuatrimestre. With the words that say it, so it is never only a color. */
export function marcaDelDia(clave, cal = CALENDARIO) {
  const libre = sinClasesEl(clave, cal);
  if (libre) return { tipo: 'libre', titulo: libre.tipo === 'feriado' ? `${libre.titulo}, feriado` : libre.tipo === 'sinActividad' ? `${libre.titulo}, sin clases` : libre.titulo };
  const llamado = cal.llamados.find((l) => l.examenes.includes(clave));
  if (llamado) return { tipo: 'examen', titulo: 'Mesa de examen' };
  const termina = cal.cuatrimestres.find((c) => c.hasta === clave);
  if (termina) return { tipo: 'cuatrimestre', titulo: `Termina el ${ordinal(termina.numero)} cuatrimestre` };
  return null;
}

/** True once the cycle of this calendar is over: its dates are old and the site says it. */
export const calendarioViejo = (clave, cal = CALENDARIO) => clave > cal.hasta;

/** The calendar's dates as whole-day events, the same shape the calendar page draws. */
export function eventosDeLaFacultad(cal = CALENDARIO) {
  const eventos = [];
  // `enLaCasilla`: the Calendario paints that day whole with it (marcaDelDia), so it isn't a chip too.
  // `tipo` always set: guessed from the title, «Consultas para las mesas de examen» would read as an exam.
  const sumar = (clave, titulo, tipo, enLaCasilla) => eventos.push({ id: `f${clave.replace(/-/g, '')}-${eventos.length}`, titulo, cuando: segundosDe(clave), sinHora: true, propio: 'facultad', tipo: tipo ?? 'otro', ...(enLaCasilla ? { enLaCasilla: true } : {}) });
  for (const c of cal.cuatrimestres) {
    sumar(c.desde, `Empieza el ${ordinal(c.numero)} cuatrimestre`);
    sumar(c.hasta, `Termina el ${ordinal(c.numero)} cuatrimestre`, null, true);
  }
  for (const r of cal.recesos) sumar(r.desde, `${r.titulo}, hasta el ${diaYMes(r.hasta)}`);
  for (const l of cal.llamados) {
    for (const d of l.examenes) sumar(d, 'Mesa de examen', 'final', true);
    const [desde, hasta] = l.consulta;
    sumar(desde, hasta ? `Consultas para las mesas de examen, hasta el ${diaYMes(hasta)}` : 'Consultas para las mesas de examen');
  }
  for (const t of cal.tramites) {
    sumar(t.desde, t.hasta ? `${t.titulo}, hasta el ${diaYMes(t.hasta)}` : t.titulo);
    if (t.hasta) sumar(t.hasta, `Último día de ${t.titulo.charAt(0).toLocaleLowerCase('es')}${t.titulo.slice(1)}`);
  }
  for (const [clave, tipo, titulo] of cal.sinClases) sumar(clave, `${titulo} (${tipo === 'feriado' ? 'feriado' : 'sin clases'})`, null, true);
  return eventos.sort((a, b) => a.cuando - b.cuando);
}

/** The next exam call that hasn't ended, as { numero, desde, hasta }, or null. */
export function proximoLlamado(clave, cal = CALENDARIO) {
  const l = cal.llamados.find((x) => x.examenes.at(-1) >= clave);
  return l ? { numero: l.numero, desde: l.examenes[0], hasta: l.examenes.at(-1) } : null;
}

// ---------- Schedules ----------

export const DIAS_DE_CLASE = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// The last class of the night ends after midnight (23:25 to 00:10, 1450): the clock starts over.
export const horaEnTexto = (minutos) => {
  const m = minutos % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const TURNOS = ['Mañana', 'Tarde', 'Noche'];

/** The careers by the letter of their commissions, as the faculty writes them («3O01» is Civil, «3K02» Sistemas), in
 * the order the site lists them. `corto` is how students call each one. */
export const CARRERAS = {
  O: { nombre: 'Ingeniería Civil', corto: 'Civil' },
  Q: { nombre: 'Ingeniería en Energía Eléctrica', corto: 'Eléctrica' },
  S: { nombre: 'Ingeniería Mecánica', corto: 'Mecánica' },
  V: { nombre: 'Ingeniería Química', corto: 'Química' },
  K: { nombre: 'Ingeniería en Sistemas de Información', corto: 'Sistemas' },
};
const LETRAS = Object.keys(CARRERAS);

/** A commission as the faculty writes it («3K02», «3EK01»), from how it comes in a course name («3k2», «3 K 02»), or
 * null. The year goes first and the number last, with two digits. Química writes its electives with the E last
 * («2V02E»): the same commission as «2EV02». */
export function codigoDeComision(texto) {
  const m = String(texto ?? '').toUpperCase().match(/(?:^|[^A-Z0-9])([1-6])\s*([EA]?)\s*([A-Z])\s*0?(\d{1,2})(E?)(?![A-Z0-9])/);
  if (!m || !LETRAS.includes(m[3])) return null;
  return `${m[1]}${m[2] || m[5]}${m[3]}${m[4].padStart(2, '0')}`;
}

/** The letter of the career of a commission: «K» for «3K02» and «3EK01». */
export const letraDe = (codigo) => /^[1-6][EA]?([A-Z])\d{2}$/.exec(codigo ?? '')?.[1] ?? null;

/** The careers a student takes subjects in, by their letters: the commissions they chose and the ones in the names
 * of their courses. */
export function letrasDelAlumno(mio, cursos = []) {
  const codigos = [
    ...Object.values(mio?.materias ?? {}).map((m) => m?.comision),
    ...(mio?.horario?.extras ?? []).map((x) => x.comision),
    ...cursos.map((c) => codigoDeComision(c.nombre)),
  ];
  return [...new Set(codigos.map(letraDe).filter(Boolean))];
}

/** The year of the schedules that matter to a student: the oldest one of their careers (each department publishes
 * when it can), or the newest of all while their careers aren't known. */
export function cicloDe(datos, letras = []) {
  const suyas = (datos?.carreras ?? []).filter((c) => letras.includes(c.letra) && c.ciclo);
  return suyas.length ? Math.min(...suyas.map((c) => c.ciclo)) : datos?.ciclo ?? null;
}

const enLista = (cosas) => new Intl.ListFormat('es', { type: 'conjunction' }).format(cosas);

/** What the schedules of a career lack, in words for the site, or null. `carrera` is one of `datos.carreras`: the
 * commissions only Básicas gave (`soloBasicas`, with the basic subjects alone) and the files of its page that couldn't
 * be read (`faltan`). */
export function notaDeCarrera(datos, carrera) {
  const propias = (datos?.comisiones ?? []).filter((c) => letraDe(c.codigo) === carrera.letra);
  const basicas = carrera.soloBasicas ?? [];
  const faltan = carrera.faltan ?? [];
  if (!propias.length) return 'Sus horarios no se pueden leer.';
  if (basicas.length && basicas.length === propias.length) return 'Solo las materias básicas. Los horarios de su página no se pueden leer.';
  const partes = [];
  if (basicas.length) partes.push(`De ${enLista(basicas)}, solo las materias básicas.`);
  const noAbren = faltan.filter((f) => f.motivo === 'no-abre').map((f) => `«${f.texto}»`);
  if (noAbren.length) partes.push(`${noAbren.length === 1 ? 'No abre' : 'No abren'} ${enLista(noAbren)}.`);
  const imagenes = faltan.filter((f) => f.motivo === 'sin-texto').length;
  // The images are the commissions Básicas filled, when there are some: already said.
  if (imagenes && !basicas.length) partes.push(imagenes === 1 ? 'Un horario es una imagen y no se puede leer.' : `${imagenes} horarios son imágenes y no se pueden leer.`);
  return partes.join(' ') || null;
}

/** Commissions to pick from, by career: [{ letra, nombre, opciones }]. The student's careers (`primeras`, letters) go
 * first and the rest in the order of CARRERAS. */
export function porCarrera(opciones, primeras = []) {
  const grupos = new Map();
  for (const o of opciones) {
    const letra = letraDe(o.codigo);
    if (!grupos.has(letra)) grupos.set(letra, []);
    grupos.get(letra).push(o);
  }
  const lugar = (l) => (primeras.includes(l) ? 0 : 10) + (LETRAS.includes(l) ? LETRAS.indexOf(l) : 9);
  return [...grupos.entries()]
    .sort((a, b) => lugar(a[0]) - lugar(b[0]))
    .map(([letra, lista]) => ({ letra, nombre: CARRERAS[letra]?.corto ?? 'Otras', opciones: lista }));
}

/** Whether a campus course is a subject of the schedule: every word of the subject is in the course's name, or El
 * Santo Resumen says they are the same subject. Abbreviations of the sheets («Adm.») only match by their full name. */
export function esLaMateria(nombreCurso, materia) {
  const delCurso = new Set(palabrasDe(nombreCurso));
  const deLaMateria = palabrasDe(materia);
  if (deLaMateria.length && deLaMateria.every((p) => delCurso.has(p))) return true;
  const a = resumenDe(nombreCurso);
  const b = resumenDe(materia);
  return Boolean(a && b && a.slug === b.slug && normalizar(a.nombre) === normalizar(b.nombre));
}

const comisionPorCodigo = (datos) => new Map((datos?.comisiones ?? []).map((c) => [c.codigo, c]));

/** The classes of a course in a commission. When several subjects match its name, the one with more words wins
 * («Física II» over «Física»); a tie between two is none: better no class than the classes of another subject. */
function mejorMateria(nombreCurso, indices, materias) {
  const candidatas = indices.filter((i) => esLaMateria(nombreCurso, materias[i]));
  if (!candidatas.length) return null;
  const largo = (i) => palabrasDe(materias[i]).length;
  const mayor = Math.max(...candidatas.map(largo));
  const mejores = candidatas.filter((i) => largo(i) === mayor);
  return mejores.length === 1 ? mejores[0] : null;
}

function clasesDelCurso(nombreCurso, comision, materias) {
  const indice = mejorMateria(nombreCurso, [...new Set((comision?.clases ?? []).map((x) => x[4]))], materias);
  return indice === null ? [] : comision.clases.filter((x) => x[4] === indice);
}

/** The official subject a campus course is, among all of the schedules, with the same rule; or null. */
export function materiaDelCurso(datos, nombreCurso) {
  const materias = datos?.materias ?? [];
  const indice = mejorMateria(nombreCurso, materias.map((_, i) => i), materias);
  return indice === null ? null : materias[indice];
}

/** The commissions that have a subject, for the student to pick among them. */
export function comisionesCon(datos, nombreCurso) {
  return (datos?.comisiones ?? [])
    .filter((c) => clasesDelCurso(nombreCurso, c, datos.materias).length)
    .map((c) => ({ codigo: c.codigo, turno: c.turno }));
}

/** The commissions that have a subject of the schedules, by its official name. */
export function comisionesDeLaMateria(datos, materia) {
  const indice = (datos?.materias ?? []).indexOf(materia);
  if (indice < 0) return [];
  return datos.comisiones.filter((c) => c.clases.some((x) => x[4] === indice)).map((c) => ({ codigo: c.codigo, turno: c.turno }));
}

/** The official subjects of the schedules, in alphabetical order, for the student to add one without a campus course. */
export const materiasDeLosHorarios = (datos) => [...(datos?.materias ?? [])].sort((a, b) => a.localeCompare(b, 'es'));

/** The commission of each course: the one the student chose for it, or the one in its name; with where it came from.
 * Each subject goes on its own: nobody takes them all in one commission. */
export function comisionDe(curso, mio) {
  const elegida = mio?.materias?.[curso.id]?.comision;
  if (elegida) return { codigo: elegida === 'ninguna' ? null : elegida, origen: 'elegida' };
  const delNombre = codigoDeComision(curso.nombre);
  if (delNombre) return { codigo: delNombre, origen: 'nombre' };
  return { codigo: null, origen: null };
}

/** The student's week for a cuatrimestre: { clases, sinHorario, materias }.
 *   `clases`: the classes of each subject in its commission, or the ones the student changed by hand for it
 *     (`mio.horario.aMano`, with `aMano: true` and their `indice` in that list; `cambiada` when the faculty has no class
 *     on that day and hours).
 *   `sinHorario`: the subjects without classes yet (no commission, or not in it), to pick one for them.
 *   `materias`: every subject of the student, for the list where each gets its commission: the campus courses and the
 *     subjects of the schedules they added without a course (`extra`). A course marked «ninguna» goes only here. Each
 *     with `deLaFacultad` (its classes in its commission, both cuatrimestres, to start changing them by hand), `aMano`
 *     and `materia`, its official name in the schedules (null for a course that isn't in them). */
export function armarSemana({ datos, cursos = [], mio, cuatrimestre }) {
  const porCodigo = comisionPorCodigo(datos);
  const clases = [];
  const sinHorario = [];
  const materias = [];
  const enEste = (c) => !c || !cuatrimestre || c === cuatrimestre;
  const deLaFacultad = (suyas, aulas) => suyas.map(([c, dia, desde, hasta]) => ({ dia, desde, hasta, aula: aulas[dia] ?? '', cuatrimestre: c || 0 }));
  const sumar = (suyas, base, aulas) => {
    for (const [i, [c, dia, desde, hasta, , docentes]] of suyas.entries()) {
      if (!enEste(c)) continue;
      // With its place in the list: two classes of one subject can share day and hour (two classrooms).
      clases.push({ ...base, id: `${base.id}-${dia}-${desde}-${i}`, materia: datos.materias[suyas[0][4]], dia, desde, hasta, docentes, aula: aulas[dia] ?? '', cuatrimestre: c || 0 });
    }
  };
  // The ones changed by hand take the place of the faculty's, also an empty list. Each with its own classroom: the ones
  // of the faculty's classes go with them when the student starts changing them.
  const aMano = (lista, base, materia, suyas) => {
    const deLaFacultad = new Set(suyas.map(([c, dia, desde, hasta]) => [dia, desde, hasta, c || 0].join('|')));
    for (const [indice, k] of lista.entries()) {
      if (!enEste(k.cuatrimestre)) continue;
      clases.push({ ...base, id: `${base.id}-m${indice}`, aMano: true, indice, cambiada: !deLaFacultad.has([k.dia, k.desde, k.hasta, k.cuatrimestre].join('|')), materia, dia: k.dia, desde: k.desde, hasta: k.hasta, docentes: '', aula: k.aula, cuatrimestre: k.cuatrimestre });
    }
  };
  for (const curso of cursos) {
    const { codigo, origen } = comisionDe(curso, mio);
    const noLaCursa = origen === 'elegida' && !codigo;
    const aulas = mio?.materias?.[curso.id]?.aulas ?? {};
    const propias = mio?.horario?.aMano?.cursos?.[curso.id] ?? null;
    const suyas = noLaCursa ? [] : clasesDelCurso(curso.nombre, codigo ? porCodigo.get(codigo) : null, datos.materias);
    const oficial = suyas.length ? datos.materias[suyas[0][4]] : materiaDelCurso(datos, curso.nombre);
    materias.push({ clave: `c${curso.id}`, curso, nombre: curso.nombre, materia: oficial, codigo, origen, noLaCursa, aMano: !noLaCursa && Boolean(propias), deLaFacultad: deLaFacultad(suyas, aulas) });
    if (noLaCursa) continue;
    const base = { id: curso.id, cursoId: curso.id, nombre: curso.nombre, comision: codigo };
    if (propias) aMano(propias, base, oficial ?? curso.nombre, suyas);
    // Not in that commission (or no commission yet): the student picks one for it.
    else if (!suyas.length) sinHorario.push({ curso, codigo });
    else sumar(suyas, base, aulas);
  }
  for (const extra of mio?.horario?.extras ?? []) {
    const indice = datos.materias.indexOf(extra.materia);
    const suyas = indice >= 0 && extra.comision ? (porCodigo.get(extra.comision)?.clases ?? []).filter((x) => x[4] === indice) : [];
    const propias = mio?.horario?.aMano?.extras?.[extra.id] ?? null;
    materias.push({ clave: `x${extra.id}`, extra, nombre: extra.materia, materia: extra.materia, codigo: extra.comision, origen: extra.comision ? 'elegida' : null, noLaCursa: false, aMano: Boolean(propias), deLaFacultad: deLaFacultad(suyas, extra.aulas) });
    const base = { id: `x${extra.id}`, extra: extra.id, cursoId: null, nombre: extra.materia, comision: extra.comision };
    if (propias) aMano(propias, base, extra.materia, suyas);
    else if (!suyas.length) sinHorario.push({ extra, codigo: extra.comision });
    else sumar(suyas, base, extra.aulas);
  }
  // Courses with classes this cuatrimestre are never «sin horario», even if another one of the same name isn't.
  const conClases = new Set(clases.map((x) => x.cursoId).filter(Boolean));
  return {
    clases: clases.sort((a, b) => a.dia - b.dia || a.desde - b.desde),
    sinHorario: sinHorario.filter((s) => !s.curso || !conClases.has(s.curso.id)),
    materias,
  };
}

/** What is going on now and what comes next today: { ahora, despues } (classes, or null), from the minute of the day. */
export function ahoraYDespues(clases, fecha = new Date()) {
  const dia = fecha.getDay();
  const minuto = fecha.getHours() * 60 + fecha.getMinutes();
  const deHoy = clases.filter((c) => c.dia === dia);
  return {
    ahora: deHoy.find((c) => c.desde <= minuto && minuto < c.hasta) ?? null,
    despues: deHoy.find((c) => c.desde > minuto) ?? null,
  };
}

/** Today's date as the calendar keys it. */
export const hoyClave = (fecha = new Date()) => claveDeFecha(fecha);

/** The commissions the student can choose for all, grouped by year, with their shift. */
export function comisionesPorAnio(datos) {
  const anios = new Map();
  for (const c of datos?.comisiones ?? []) {
    // Electives and the intermediate degree go apart: nobody takes all of one.
    if (!/^\d[A-Z]\d{2}$/.test(c.codigo)) continue;
    const anio = Number(c.codigo[0]);
    if (!anios.has(anio)) anios.set(anio, []);
    anios.get(anio).push({ codigo: c.codigo, turno: c.turno });
  }
  return [...anios.entries()].sort((a, b) => a[0] - b[0]);
}
