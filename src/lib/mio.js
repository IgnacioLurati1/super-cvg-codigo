import { useSyncExternalStore } from 'react';
import { claveDia, fechaDeClave } from './datos';
import { anotarCambio } from './marcas';
import { esIdDeEscrito, lugaresDeEscritos, MAX_TOTAL_CASOS, sanearEscritos, sanearLaboratorio, sanearProyectos } from './laboratorio/saneo';
import { sanearLecturas } from './lectura';
import { sanearPropias } from './propiasSaneo';
import { sanearRepaso } from './repaso';
import { HOY_VACIO, sanearHoy } from './hoy';
import { LUGARES_EN_MATERIAS, esEstiloDeTarjeta } from './tarjetas';
import { esTipo } from './tipos';
import { esGrupoDeAviso } from './avisos';
import { DRIVE_VACIO, sanearDriveMio } from './drivePublico';
import { ajustesActuales, aparienciaQueViaja } from './ajustes';

// What each student adds on top of the campus: hidden things, names, order, notes, tasks, dates, their own
// calendar dates (`eventos`, with or without a course) and the campus' calendar dates they corrected or deleted
// (`campus`, by the campus' id: what they confirmed in the form, or only that it is deleted).
// One entry per student, only in this browser. It survives leaving, so `borrarMio` exists.
// Campus data is not stored here, except what the student typed or confirmed: everything else is numbers.
const PREFIJO = 'cl.mio.';
const VIEJO = 'cl.pref.ocultas.';
const LIMITES = { nombre: 200, nota: 20_000, tarea: 200, titulo: 200, lista: 3000, tareas: 300, fechas: 200, eventos: 500, campus: 500 };

const A_MANO_VACIO = Object.freeze({ cursos: Object.freeze({}), extras: Object.freeze({}) });
const HORARIO_VACIO = Object.freeze({ extras: Object.freeze([]), aMano: A_MANO_VACIO });
const VACIO = Object.freeze({ materias: Object.freeze({}), eventos: Object.freeze([]), propias: Object.freeze([]), cursos: Object.freeze({}), campus: Object.freeze({}), horario: HORARIO_VACIO, lecturas: Object.freeze({}), hechas: Object.freeze({}), laboratorio: Object.freeze([]), proyectosLab: Object.freeze([]), escritos: Object.freeze([]), repaso: Object.freeze([]), hoy: HOY_VACIO, avisosOcultos: Object.freeze([]), drive: DRIVE_VACIO, apariencia: null });
const MATERIA_VACIA = Object.freeze({
  secciones: [], ocultos: [], nombres: {}, orden: {}, vistos: [], parcial: [], nota: '', tareas: [], fechas: [], descartes: [], foto: null, classroom: null, lugares: {},
  ordenSecciones: [], plegadas: [], comision: null, aulas: {},
  // Materias: pinned or archived (`enLista`), and the look of its card when it isn't the one of every course.
  enLista: null, tarjeta: null,
});
// Sections of a course in the order of its sections and in the folded ones: far more than a course has.
const MAX_SECCIONES = 500;

const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());
let usuario = null;
let leido = { clave: null, crudo: null, valor: VACIO };

const esMateriaId = (id) => /^[1-9]\d{0,11}$/.test(String(id));
// Where the marks of a course are kept: a campus course (its number) or a course of the student's own (its id), for
// what is seen, for the exam and folded in it.
const esDeMateria = (id) => esMateriaId(id) || /^p[0-9a-z]{6,20}$/.test(String(id));
// A campus item: its module number, and which file of it. A Classroom item: «c» and the number of its post, or «t» and
// the number of a message of its stream (with an attachment of it after the dot). One of the student's own in a
// section of theirs: «p» and the number of its block. In the names only, «s» and a section of the campus or a topic of
// Classroom: the name the student gave it.
const esClave = (c) => typeof c === 'string' && /^(\d{1,12}|[ct]\d{1,24}|p\d{1,16})(\.[0-9a-z]{1,12})?$/.test(c);
const esNombrado = (c) => esClave(c) || (typeof c === 'string' && /^s(\d{1,12}|c\d{1,24})$/.test(c));
const esCurso = (c) => typeof c === 'string' && /^\d{1,24}$/.test(c);
// A topic of the Classroom course of a course of one's own: «c» and its number («c0», what has no topic). There they
// are its sections, as the campus' are in a campus course.
const esTema = (s) => typeof s === 'string' && /^c\d{1,24}$/.test(s);
// A section of the campus (its number) or one of the student's own («p» and the number of its category); in a course of
// one's own, also a topic.
const esSeccionDelCampus = (s) => (Number.isInteger(s) && s >= 0) || (typeof s === 'string' && /^p\d{1,16}$/.test(s));
const esSeccionOTema = (s) => esSeccionDelCampus(s) || esTema(s);
const esSeccion = esSeccionOTema;
// The sections that keep a name of their own: the campus' and the topics.
const esRenombrable = (s) => (Number.isInteger(s) && s >= 0) || esTema(s);
const seccionDeClave = (k) => (/^\d+$/.test(k) ? Number(k) : k);
const texto = (t, limite) => (typeof t === 'string' ? t.slice(0, limite) : '');
const lista = (x, valida) => (Array.isArray(x) ? [...new Set(x.filter(valida))].slice(0, LIMITES.lista) : []);
const esFecha = (f) => typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(fechaDeClave(f).getTime());
// A commission as the faculty writes it («3K02», «3EK01»), or «ninguna» for a course the student doesn't take in any.
export const esComision = (c) => typeof c === 'string' && /^[1-6][EA]?[A-Z]\d{2}$/.test(c);
const comisionValida = (c) => esComision(c) || c === 'ninguna';
const MAX_AULA = 40;
const esDia = (d) => Number.isInteger(d) && d >= 1 && d <= 6;
// The classrooms the student wrote for a course, by day of the week (1 is Monday).
function sanearAulas(aulas) {
  const salida = {};
  for (const [dia, aula] of Object.entries(aulas && typeof aulas === 'object' ? aulas : {})) {
    const limpio = texto(aula, MAX_AULA).trim();
    if (esDia(Number(dia)) && limpio) salida[dia] = limpio;
  }
  return salida;
}
// The weekly classes of a subject the student changed by hand, in place of the faculty's: by the number of its course
// (`cursos`) or of the subject added from the schedules (`extras`). Each class, its day, its minutes, its classroom and
// its cuatrimestre (0, both).
const MAX_A_MANO = 60;
const MAX_CLASES_A_MANO = 12;
const esIdDeMateria = (id) => /^[1-9]\d{0,15}$/.test(String(id));
function sanearClaseAMano(k) {
  if (!k || !esDia(k.dia) || !Number.isInteger(k.desde) || !Number.isInteger(k.hasta)) return null;
  // A night class can end after midnight, until 2:00 (1560): the faculty's last hour ends at 00:10.
  if (k.desde < 0 || k.desde >= 1440 || k.hasta > 1560 || k.hasta <= k.desde) return null;
  return { dia: k.dia, desde: k.desde, hasta: k.hasta, aula: texto(k.aula, MAX_AULA).trim(), cuatrimestre: [1, 2].includes(k.cuatrimestre) ? k.cuatrimestre : 0 };
}
function sanearAMano(a, extras) {
  const salida = { cursos: {}, extras: {} };
  const deExtras = new Set(extras.map((x) => String(x.id)));
  for (const tipo of ['cursos', 'extras']) {
    const lista = a && typeof a === 'object' && a[tipo] && typeof a[tipo] === 'object' && !Array.isArray(a[tipo]) ? a[tipo] : {};
    for (const [id, clases] of Object.entries(lista)) {
      if (!esIdDeMateria(id) || !Array.isArray(clases) || (tipo === 'extras' && !deExtras.has(id))) continue;
      if (Object.keys(salida[tipo]).length >= MAX_A_MANO) break;
      salida[tipo][id] = clases.map(sanearClaseAMano).filter(Boolean).slice(0, MAX_CLASES_A_MANO);
    }
  }
  return salida;
}
// A subject of the faculty's schedules the student takes without a campus course: its official name (public data of
// the faculty, not of the campus), its commission and the classrooms they wrote.
const MAX_MATERIA = 120;
const MAX_EXTRAS = 20;
function sanearExtra(x) {
  if (!x || !Number.isInteger(x.id) || x.id <= 0) return null;
  const materia = texto(x.materia, MAX_MATERIA).trim();
  if (!materia) return null;
  return { id: x.id, materia, comision: esComision(x.comision) ? x.comision : null, aulas: sanearAulas(x.aulas) };
}

// The classes the student added one by one (`clases`) are no more: a subject's classes are changed by hand instead.
function sanearHorario(h) {
  if (!h || typeof h !== 'object') return { extras: [], aMano: { cursos: {}, extras: {} } };
  const extras = [];
  for (const x of (Array.isArray(h.extras) ? h.extras : []).map(sanearExtra)) {
    if (x && !extras.some((y) => y.id === x.id || y.materia === x.materia)) extras.push(x);
  }
  const suyas = extras.slice(0, MAX_EXTRAS);
  return { extras: suyas, aMano: sanearAMano(h.aMano, suyas) };
}

/** A campus course the student said has no Classroom: its course is not looked for by the name again. */
export const SIN_CLASSROOM = 'ninguno';
const cursoValido = (curso) => typeof curso === 'string' && (/^\d{1,24}$/.test(curso) || curso === SIN_CLASSROOM);

/** `conTemas`: a course of one's own, whose sections can also be the topics of its Classroom course. */
function sanearMateria(m, conTemas = false) {
  if (!m || typeof m !== 'object') return { ...MATERIA_VACIA };
  const esSeccion = conTemas ? esSeccionOTema : esSeccionDelCampus;
  const nombres = {};
  for (const [clave, nombre] of Object.entries(m.nombres ?? {})) {
    const limpio = texto(nombre, LIMITES.nombre).trim();
    if (esNombrado(clave) && (conTemas || !clave.startsWith('sc')) && limpio) nombres[clave] = limpio;
  }
  const orden = {};
  for (const [seccion, claves] of Object.entries(m.orden ?? {})) {
    if (esSeccion(seccionDeClave(seccion))) orden[seccion] = lista(claves, esClave);
  }
  // An item the student moved to another section of the campus course (or one of theirs): its key, and the section.
  const lugares = {};
  for (const [clave, seccion] of Object.entries(m.lugares ?? {}).slice(0, LIMITES.lista)) {
    if (esClave(clave) && esSeccion(seccion)) lugares[clave] = seccion;
  }
  const foto = {};
  for (const [clave, cuando] of Object.entries(m.foto ?? {})) {
    if (esClave(clave) && Number.isInteger(cuando) && cuando >= 0) foto[clave] = cuando;
  }
  return {
    secciones: lista(m.secciones, esSeccion),
    ocultos: lista(m.ocultos, esClave),
    nombres,
    orden,
    vistos: lista(m.vistos, esClave),
    parcial: lista(m.parcial, esClave),
    nota: texto(m.nota, LIMITES.nota),
    tareas: (Array.isArray(m.tareas) ? m.tareas : [])
      .filter((t) => t && Number.isInteger(t.id) && texto(t.texto, 1).length)
      .slice(0, LIMITES.tareas)
      .map((t) => ({ id: t.id, texto: texto(t.texto, LIMITES.tarea), hecha: t.hecha === true, fecha: esFecha(t.fecha) ? t.fecha : null })),
    fechas: (Array.isArray(m.fechas) ? m.fechas : [])
      .filter((f) => f && Number.isInteger(f.id) && Number.isInteger(f.cuando) && f.cuando > 0 && texto(f.titulo, 1).length)
      .slice(0, LIMITES.fechas)
      .map((f) => ({ id: f.id, titulo: texto(f.titulo, LIMITES.titulo), cuando: f.cuando, sinHora: f.sinHora === true })),
    descartes: lista(m.descartes, (d) => typeof d === 'string' && d.length <= 24),
    foto: m.foto && typeof m.foto === 'object' ? foto : null,
    // Which Classroom course goes with this one, by its number, or «ninguno» if the student said it has none. The old «no»
    // hid the list with no way back: it is dropped.
    classroom: cursoValido(m.classroom) ? m.classroom : null,
    lugares,
    // The sections in the order the student left them, and the ones folded to their title (campus numbers and «p» ids).
    ordenSecciones: lista(m.ordenSecciones, esSeccion).slice(0, MAX_SECCIONES),
    plegadas: lista(m.plegadas, esSeccion).slice(0, MAX_SECCIONES),
    // The commission the student takes this course in, when it isn't the one of their week, and its classrooms.
    comision: comisionValida(m.comision) ? m.comision : null,
    aulas: sanearAulas(m.aulas),
    // Where it goes in Materias, and the look of its card (tarjetas.js).
    enLista: LUGARES_EN_MATERIAS.includes(m.enLista) ? m.enLista : null,
    tarjeta: esEstiloDeTarjeta(m.tarjeta) ? m.tarjeta : null,
  };
}

function sanearEvento(e) {
  if (!e || !Number.isInteger(e.id) || !Number.isInteger(e.cuando) || e.cuando <= 0) return null;
  const titulo = texto(e.titulo, LIMITES.titulo).trim();
  if (!titulo) return null;
  return {
    id: e.id,
    titulo,
    cuando: e.cuando,
    sinHora: e.sinHora === true,
    tipo: esTipo(e.tipo) ? e.tipo : 'otro',
    materiaId: esMateriaId(e.materiaId) ? Number(e.materiaId) : null,
    // Born in Google Calendar: its id there (calendarioSincro.js).
    ...(typeof e.gid === 'string' && /^[A-Za-z0-9_@.-]{5,256}$/.test(e.gid) ? { gid: e.gid } : {}),
  };
}

const esIdDelCampus = (id) => /^[1-9]\d{0,14}$/.test(String(id));

// A campus date as the student corrected it, or only that they deleted it. `vence`: the campus marks it as a deadline.
function sanearCorreccion(c) {
  if (!c || typeof c !== 'object') return null;
  if (c.borrado === true) return { borrado: true };
  if (!Number.isInteger(c.cuando) || c.cuando <= 0) return null;
  const titulo = texto(c.titulo, LIMITES.titulo).trim();
  if (!titulo) return null;
  return {
    titulo,
    cuando: c.cuando,
    sinHora: c.sinHora === true,
    tipo: esTipo(c.tipo) ? c.tipo : 'otro',
    materiaId: esMateriaId(c.materiaId) ? Number(c.materiaId) : 0,
    vence: c.vence === true,
  };
}

// What the student marked as done, so it leaves Hoy (hechas.js makes the keys): a campus task «t» or quiz «q» by its
// module number, another campus date «e» by its number, a Classroom task «c» by its number. Only numbers: the second
// it is due (or was marked, without a date), to forget it 60 days after that. Negative, the student took the mark off,
// and the campus saying it is handed in does not put it back.
const esClaveHecha = (k) => typeof k === 'string' && /^[tqec]\d{1,24}$/.test(k);
const MAX_HECHAS = 400;
const VIDA_HECHAS = 60 * 86_400;
const esSegundo = (v) => Number.isSafeInteger(v) && v !== 0 && Math.abs(v) < 1e11;
function sanearHechas(h, ahora = Math.floor(Date.now() / 1000)) {
  const vivas = Object.entries(h && typeof h === 'object' && !Array.isArray(h) ? h : {})
    .filter(([k, v]) => esClaveHecha(k) && esSegundo(v) && Math.abs(v) + VIDA_HECHAS > ahora)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Object.fromEntries(vivas.slice(0, MAX_HECHAS));
}

/** Everything that enters from a file or a link goes through here: only known fields, types and sizes survive. */
export function sanearMio(datos) {
  const materias = {};
  for (const [id, materia] of Object.entries(datos?.materias ?? {})) {
    if (esDeMateria(id)) materias[id] = sanearMateria(materia, !esMateriaId(id));
  }
  const eventos = (Array.isArray(datos?.eventos) ? datos.eventos : []).map(sanearEvento).filter(Boolean).slice(0, LIMITES.eventos);
  // When the student last went over each Classroom course (its number), to mark what came after as new.
  const cursos = {};
  for (const [id, cuando] of Object.entries(datos?.cursos ?? {}).slice(0, 200)) {
    if (esCurso(id) && Number.isSafeInteger(cuando) && cuando > 0) cursos[id] = cuando;
  }
  const campus = {};
  for (const [id, c] of Object.entries(datos?.campus ?? {}).slice(0, LIMITES.campus)) {
    const limpio = esIdDelCampus(id) && sanearCorreccion(c);
    if (limpio) campus[id] = limpio;
  }
  // Highlights and notes in PDFs, by file (lectura.js): where they are, never the text of the file. The code of the
  // lab (laboratorio/saneo.js): what the student saved as theirs. Its test cases share one limit, files and projects.
  const casosLab = { queda: MAX_TOTAL_CASOS };
  const laboratorio = sanearLaboratorio(datos?.laboratorio, casosLab);
  // The projects of the lab (laboratorio/saneo.js): a name and which of their files runs.
  const proyectosLab = sanearProyectos(datos?.proyectosLab, casosLab);
  return {
    materias, eventos, propias: sanearPropias(datos?.propias), cursos, campus, horario: sanearHorario(datos?.horario), lecturas: sanearLecturas(datos?.lecturas), hechas: sanearHechas(datos?.hechas),
    laboratorio,
    proyectosLab,
    // What their programs wrote (laboratorio/escritos.js): names, sizes and the id of the bytes, of places that exist.
    escritos: sanearEscritos(datos?.escritos, lugaresDeEscritos(laboratorio, proyectosLab)),
    // The cards of Repaso (repaso.js): what the student wrote, or saved from a practice question.
    repaso: sanearRepaso(datos?.repaso),
    // How the student arranged Hoy and which courses they took out of it and the Calendario (hoy.js).
    hoy: sanearHoy(datos?.hoy),
    // The kinds of campus notification the student doesn't want to see (avisos.js): only their keys.
    avisosOcultos: lista(datos?.avisosOcultos, esGrupoDeAviso),
    // The Drive folders added, the career's taken away and what was hidden in them (drivePublico.js): ids and names.
    drive: sanearDriveMio(datos?.drive),
    // The look the student chose (ajustes.js): what differs from the default. Null until this device put its own.
    apariencia: datos?.apariencia && typeof datos.apariencia === 'object' ? aparienciaQueViaja(datos.apariencia) : null,
  };
}

function leer() {
  if (usuario === null) return VACIO;
  const clave = PREFIJO + usuario;
  let crudo = null;
  try {
    crudo = localStorage.getItem(clave);
  } catch {
    return VACIO;
  }
  if (leido.clave === clave && leido.crudo === crudo) return leido.valor;
  let valor = VACIO;
  try {
    if (crudo) valor = sanearMio(JSON.parse(crudo));
  } catch {
    valor = VACIO;
  }
  leido = { clave, crudo, valor };
  return valor;
}

// `marcar`: a change of the student's, noted for the copy in their Drive. What comes from that copy is not.
function escribir(datos, { marcar = true } = {}) {
  if (usuario === null) return false;
  const antes = marcar ? leer() : null;
  try {
    localStorage.setItem(PREFIJO + usuario, JSON.stringify(datos));
  } catch {
    return false;
  }
  if (marcar) anotarCambio(usuario, antes, datos);
  avisar();
  return true;
}

function migrar(id) {
  try {
    const viejo = localStorage.getItem(VIEJO + id);
    if (viejo === null) return;
    if (localStorage.getItem(PREFIJO + id) === null) {
      const materias = {};
      for (const [m, secciones] of Object.entries(JSON.parse(viejo))) materias[m] = { secciones };
      localStorage.setItem(PREFIJO + id, JSON.stringify(sanearMio({ materias })));
    }
    localStorage.removeItem(VIEJO + id);
  } catch {
    // A broken old value is not worth keeping.
  }
}

// The first time a student opens here since the look travels: if this device's look was changed, it becomes theirs,
// before any join, without counting as a change. A copy in Drive with a look of its own wins over it (union.js: no time
// is the oldest).
function sembrarApariencia() {
  const datos = leer();
  const aca = aparienciaQueViaja(ajustesActuales());
  if (datos.apariencia !== null || !Object.keys(aca).length) return;
  try {
    localStorage.setItem(PREFIJO + usuario, JSON.stringify({ ...datos, apariencia: aca }));
  } catch {
    // Without room it stays per device until there is.
  }
}

export function fijarUsuario(id) {
  const nuevo = Number.isInteger(id) ? id : null;
  if (nuevo === usuario) return;
  usuario = nuevo;
  if (nuevo !== null) {
    migrar(nuevo);
    sembrarApariencia();
  }
  avisar();
}

export const mioActual = leer;
/** The student whose data is open, or null. */
export const usuarioActual = () => usuario;
/** `fn` receives everything of this student and returns the changed version. False if it could not be saved. */
export const cambiarMio = (fn) => escribir(sanearMio(fn(leer())));
export const hayUsuario = () => usuario !== null;
/** What came joined from the copy in Drive (sincro.js): saved as is, without counting as a change of this device. */
export const ponerMioUnido = (datos) => escribir(sanearMio(datos), { marcar: false });
/** Calls `f` on every change, here or in another tab, and when the student changes. Returns how to stop. */
export function escucharMio(f) {
  avisados.add(f);
  return () => avisados.delete(f);
}

export function useMio() {
  return useSyncExternalStore((f) => {
    avisados.add(f);
    return () => avisados.delete(f);
  }, leer, () => VACIO);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key?.startsWith(PREFIJO)) avisar();
  });
}

export const materiaDe = (mio, id) => mio.materias[id] ?? MATERIA_VACIA;

/** `fn` receives the course's data and returns the changed version. Returns false if it could not be saved. */
export function cambiarMateria(id, fn) {
  if (!esDeMateria(id)) return false;
  const mio = leer();
  return escribir({ ...mio, materias: { ...mio.materias, [id]: fn(materiaDe(mio, id)) } });
}

/** A date of the student's own for the calendar. `materiaId` may be null. Returns false if it could not be saved. */
export function agregarEvento(evento) {
  const limpio = sanearEvento(evento);
  if (!limpio) return false;
  const mio = leer();
  // Full: nothing old goes away without the student knowing.
  if (mio.eventos.length >= LIMITES.eventos && !mio.eventos.some((e) => e.id === limpio.id)) return false;
  // Written over, it stays the same event in Google.
  const gid = mio.eventos.find((e) => e.id === limpio.id)?.gid;
  return escribir({ ...mio, eventos: [...mio.eventos.filter((e) => e.id !== limpio.id), gid && !limpio.gid ? { ...limpio, gid } : limpio] });
}

export const MAX_EVENTOS = LIMITES.eventos;
export const MAX_NOTA = LIMITES.nota;

export function cambiarEvento(id, cambios) {
  const mio = leer();
  const viejo = mio.eventos.find((e) => e.id === id);
  const limpio = viejo && sanearEvento({ ...viejo, ...cambios, id });
  if (!limpio) return false;
  return escribir({ ...mio, eventos: mio.eventos.map((e) => (e.id === id ? limpio : e)) });
}

export function borrarEvento(id) {
  const mio = leer();
  return escribir({ ...mio, eventos: mio.eventos.filter((e) => e.id !== id) });
}

// ---------- The week (facultad.js) ----------

/** The commission of one course: a code, «ninguna» (not taken), or null when not chosen yet. */
export const elegirComisionDe = (materia, codigo) => cambiarMateria(materia, (m) => ({ ...m, comision: comisionValida(codigo) ? codigo : null }));

/** The classroom of a course on a day of the week. Empty, it goes away. */
export const guardarAula = (materia, dia, aula) => cambiarMateria(materia, (m) => ({ ...m, aulas: { ...m.aulas, [dia]: aula } }));

export { MAX_CLASES_A_MANO };

/** The weekly classes of a subject changed by hand: `tipo` 'cursos' (by the number of its course) or 'extras' (of a
 * subject added from the schedules), and the list, or null to go back to the faculty's. False if it could not be
 * saved, a class is wrong or there are too many. */
export function guardarClasesAMano(tipo, id, clases) {
  if (!['cursos', 'extras'].includes(tipo) || !esIdDeMateria(id)) return false;
  const mio = leer();
  const horario = mio.horario ?? HORARIO_VACIO;
  const aMano = { cursos: { ...horario.aMano?.cursos }, extras: { ...horario.aMano?.extras } };
  if (clases === null) delete aMano[tipo][id];
  else {
    const limpias = (Array.isArray(clases) ? clases : []).map(sanearClaseAMano);
    if (limpias.some((k) => !k) || limpias.length > MAX_CLASES_A_MANO) return false;
    if (!(String(id) in aMano[tipo]) && Object.keys(aMano[tipo]).length >= MAX_A_MANO) return false;
    aMano[tipo][id] = limpias;
  }
  return escribir({ ...mio, horario: { ...horario, aMano } });
}

export const MAX_MATERIAS_DE_LA_FACULTAD = MAX_EXTRAS;

const cambiarExtras = (cambio) => {
  const mio = leer();
  const horario = mio.horario ?? HORARIO_VACIO;
  return escribir({ ...mio, horario: { ...horario, extras: cambio(horario.extras ?? []) } });
};

/** A subject of the faculty's schedules without a campus course, with its commission (or null). Returns its id, or
 * false if it was already there, the list is full or it could not be saved. */
export function sumarMateriaDeLaFacultad(materia, comision) {
  const extra = sanearExtra({ id: Date.now(), materia, comision, aulas: {} });
  const ya = leer().horario?.extras ?? [];
  if (!extra || ya.length >= MAX_EXTRAS || ya.some((x) => x.materia === extra.materia)) return false;
  return cambiarExtras((lista) => [...lista, extra]) ? extra.id : false;
}

/** Its commission: a code, or null for none yet. */
export const elegirComisionDeExtra = (id, codigo) => cambiarExtras((lista) => lista.map((x) => (x.id === id ? { ...x, comision: esComision(codigo) ? codigo : null } : x)));

/** Its classroom on a day of the week. Empty, it goes away. */
export const guardarAulaDeExtra = (id, dia, aula) => cambiarExtras((lista) => lista.map((x) => (x.id === id ? { ...x, aulas: sanearAulas({ ...x.aulas, [dia]: aula }) } : x)));

/** Out of the student's subjects, with its classes changed by hand. */
export function quitarMateriaDeLaFacultad(id) {
  const mio = leer();
  const horario = mio.horario ?? HORARIO_VACIO;
  const extras = { ...horario.aMano?.extras };
  delete extras[id];
  return escribir({ ...mio, horario: { ...horario, extras: (horario.extras ?? []).filter((x) => x.id !== id), aMano: { cursos: { ...horario.aMano?.cursos }, extras } } });
}

export const MAX_CORRECCIONES = LIMITES.campus;

/** A campus date corrected by the student, or deleted (`{ borrado: true }`). Only here: the campus stays as it is.
 * Returns false if it could not be saved. */
export function corregirDelCampus(id, correccion) {
  const limpio = esIdDelCampus(id) && sanearCorreccion(correccion);
  if (!limpio) return false;
  const mio = leer();
  if (Object.keys(mio.campus).length >= LIMITES.campus && !mio.campus[id]) return false;
  return escribir({ ...mio, campus: { ...mio.campus, [id]: limpio } });
}

/** Back to what the campus says. */
export function volverAlCampus(id) {
  const mio = leer();
  if (!mio.campus[id]) return true;
  const campus = { ...mio.campus };
  delete campus[id];
  return escribir({ ...mio, campus });
}

/** The campus' dates as the student left them: the deleted ones out, the corrected ones as they were saved (also when
 * the campus' own date falls out of what was asked, so one moved to another month shows there). `corregida` says so. */
export function conCorrecciones(eventos, mio, nombres = {}) {
  const correcciones = mio?.campus ?? {};
  const ids = Object.keys(correcciones);
  if (!ids.length) return eventos;
  const porId = new Map(eventos.map((e) => [String(e.id), e]));
  const salida = eventos.filter((e) => !correcciones[e.id]);
  for (const id of ids) {
    const c = correcciones[id];
    if (c.borrado) continue;
    const original = porId.get(id);
    const materiaId = original?.materiaId ?? c.materiaId;
    salida.push({
      id: Number(id),
      titulo: c.titulo,
      materia: original?.materia ?? nombres[materiaId] ?? (materiaId ? 'Materia' : 'General'),
      materiaId,
      vencimiento: c.vence || c.tipo !== 'otro',
      cuando: c.cuando,
      sinHora: c.sinHora,
      tipo: c.tipo,
      url: original?.url ?? null,
      momento: original?.momento ?? (c.vence ? 'vence' : undefined),
      vence: c.vence,
      corregida: true,
    });
  }
  return salida;
}

/** The campus' dates the student deleted, among the ones asked. */
export const borradasDelCampus = (eventos, mio) => eventos.filter((e) => mio?.campus?.[e.id]?.borrado);

const alternar = (l, valor) => (l.includes(valor) ? l.filter((v) => v !== valor) : [...l, valor]);

export const alternarSeccion = (materia, seccion) =>
  esSeccion(seccion) && cambiarMateria(materia, (m) => ({ ...m, secciones: alternar(m.secciones, seccion) }));

/** `que` is 'ocultos', 'vistos' or 'parcial'. */
export const alternarEn = (materia, que, clave) =>
  esClave(clave) && cambiarMateria(materia, (m) => ({ ...m, [que]: alternar(m[que], clave) }));

export const vaciarParcial = (materia) => cambiarMateria(materia, (m) => ({ ...m, parcial: [] }));

export const renombrar = (materia, clave, nombre) =>
  esClave(clave) && cambiarMateria(materia, (m) => {
    const nombres = { ...m.nombres };
    const limpio = texto(nombre, LIMITES.nombre).trim();
    if (limpio) nombres[clave] = limpio;
    else delete nombres[clave];
    return { ...m, nombres };
  });

/** The name the student gave a section of the campus (its number) or a topic of Classroom («c» and its number), or back
 * to the original one with an empty name. */
export const renombrarSeccion = (materia, seccion, nombre) =>
  esRenombrable(seccion) && cambiarMateria(materia, (m) => {
    const nombres = { ...m.nombres };
    const limpio = texto(nombre, LIMITES.nombre).trim();
    if (limpio) nombres[`s${seccion}`] = limpio;
    else delete nombres[`s${seccion}`];
    return { ...m, nombres };
  });

/** The name the student gave a section of the campus or a topic, or undefined. */
export const nombreDeSeccion = (m, seccion) => (esRenombrable(seccion) ? m.nombres[`s${seccion}`] : undefined);

export const fijarOrden = (materia, seccion, claves) =>
  esSeccion(seccion) && cambiarMateria(materia, (m) => ({ ...m, orden: { ...m.orden, [seccion]: claves.filter(esClave) } }));

/** The order of the sections of a course: every one of them, the campus' numbers and the «p» ids of the student's own. */
export const ordenarSecciones = (materia, ids) =>
  Array.isArray(ids) && cambiarMateria(materia, (m) => ({ ...m, ordenSecciones: ids.filter(esSeccion) }));

/** Folds a section to its title (`plegada` true) or opens it (false); without `plegada`, the other way round. */
export function plegarSeccion(materia, seccion, plegada) {
  if (!esSeccion(seccion) || !esDeMateria(materia)) return false;
  const { plegadas } = materiaDe(leer(), materia);
  const quiere = plegada ?? !plegadas.includes(seccion);
  if (quiere === plegadas.includes(seccion)) return true;
  return cambiarMateria(materia, (m) => ({ ...m, plegadas: quiere ? [...m.plegadas, seccion] : m.plegadas.filter((s) => s !== seccion) }));
}

export const guardarNota = (materia, nota) => cambiarMateria(materia, (m) => ({ ...m, nota: texto(nota, LIMITES.nota) }));

export const agregarTarea = (materia, textoTarea, fecha, id) =>
  cambiarMateria(materia, (m) => ({
    ...m,
    tareas: [...m.tareas, { id, texto: texto(textoTarea, LIMITES.tarea).trim(), hecha: false, fecha: esFecha(fecha) ? fecha : null }].slice(-LIMITES.tareas),
  }));

export const alternarTarea = (materia, id) =>
  cambiarMateria(materia, (m) => ({ ...m, tareas: m.tareas.map((t) => (t.id === id ? { ...t, hecha: !t.hecha } : t)) }));

export const borrarTarea = (materia, id) => cambiarMateria(materia, (m) => ({ ...m, tareas: m.tareas.filter((t) => t.id !== id) }));

export const agregarFecha = (materia, { id, titulo, cuando, sinHora = false }) =>
  cambiarMateria(materia, (m) => ({ ...m, fechas: [...m.fechas, { id, titulo: texto(titulo, LIMITES.titulo).trim(), cuando, sinHora }].slice(-LIMITES.fechas) }));

export const borrarFecha = (materia, id) => cambiarMateria(materia, (m) => ({ ...m, fechas: m.fechas.filter((f) => f.id !== id) }));

/** A suggestion the student said no to. `huella` is not the text: it's what the suggestion hashes to. */
export const descartarFecha = (materia, huella) => cambiarMateria(materia, (m) => ({ ...m, descartes: [...new Set([...m.descartes, String(huella)])] }));

export const unirClassroom = (materia, curso) => cambiarMateria(materia, (m) => ({ ...m, classroom: cursoValido(curso) ? curso : null }));

export const guardarFoto = (materia, foto) => cambiarMateria(materia, (m) => ({ ...m, foto }));

/** Moves an item to another section of its course (`seccion`), or back to where it came from (null). `claves` is the
 * new order of that section, with the item in it. */
export const ponerEnSeccion = (materia, clave, seccion, claves = null) =>
  esClave(clave) && cambiarMateria(materia, (m) => {
    const lugares = { ...m.lugares };
    if (seccion === null) delete lugares[clave];
    else lugares[clave] = seccion;
    const orden = claves && esSeccion(seccion) ? { ...m.orden, [seccion]: claves.filter(esClave) } : m.orden;
    return { ...m, lugares, orden };
  });

/** Without a review, what came in the last week counts as new. */
const SEMANA = 7 * 86_400;
export const revisadoClassroom = (mio, curso, ahora = Math.floor(Date.now() / 1000)) => mio.cursos?.[curso] ?? ahora - SEMANA;
export const revisarClassroom = (curso, cuando = Math.floor(Date.now() / 1000)) =>
  esCurso(curso) && cambiarMio((mio) => ({ ...mio, cursos: { ...mio.cursos, [curso]: cuando } }));

// ---------- What the student marked as done (hechas.js makes the keys) ----------

const segundoDe = (vence) => (Number.isFinite(vence) && vence > 0 ? Math.floor(vence) : Math.floor(Date.now() / 1000));
function ponerHecha(clave, valor) {
  if (!esClaveHecha(clave)) return false;
  const mio = leer();
  const hechas = { ...mio.hechas };
  if (valor === undefined) delete hechas[clave];
  else hechas[clave] = valor;
  return escribir({ ...mio, hechas: sanearHechas(hechas) });
}

/** Done, by the student's hand or handed in from here. `vence`: the second it is due, or null. False if it could not
 * be saved. */
export const marcarHecha = (clave, vence) => ponerHecha(clave, segundoDe(vence));

/** The student took the mark off: it is pending again, and the campus saying it is handed in does not mark it again. */
export const desmarcarHecha = (clave, vence) => ponerHecha(clave, -Math.abs(leer().hechas[clave] ?? segundoDe(vence)));

/** Done because the campus says it is handed in or graded: only if the student never marked it nor took the mark off. */
export const marcarHechaSola = (clave, vence) => esClaveHecha(clave) && (leer().hechas[clave] !== undefined || ponerHecha(clave, segundoDe(vence)));

/** Back to the mark it had (`valor`, from `mio.hechas`, or undefined for none): to undo. */
export const volverHecha = (clave, valor) => ponerHecha(clave, esSegundo(valor) ? valor : undefined);

export const exportarMio = () => JSON.stringify({ tipo: 'campus-lindo-mis-datos', version: 1, ...leer() }, null, 1);

/** Replaces what's in this browser with a saved copy. Throws if the file is something else. */
export function importarMio(texto_) {
  const datos = JSON.parse(texto_);
  if (datos?.tipo !== 'campus-lindo-mis-datos') throw new Error('No es una copia de Super CVG');
  return escribir(sanearMio(datos));
}

/** Salir: what the programs of the lab wrote leaves the data of every student of this browser, without counting as a
 * change, so the copy in their Drive brings it back. Returns, by student, the ids of the bytes to delete (bodega.js). */
export function sacarEscritosDeTodos() {
  const salida = [];
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIJO) && /^\d+$/.test(k.slice(PREFIJO.length))) claves.push(k);
    }
    for (const k of claves) {
      const datos = JSON.parse(localStorage.getItem(k));
      if (!Array.isArray(datos?.escritos) || !datos.escritos.length) continue;
      const ids = datos.escritos.map((e) => e?.id).filter(esIdDeEscrito);
      delete datos.escritos;
      localStorage.setItem(k, JSON.stringify(datos));
      salida.push({ usuario: Number(k.slice(PREFIJO.length)), ids });
    }
  } catch {
    // Storage unavailable or a broken entry: what it could, done.
  }
  avisar();
  return salida;
}

export function borrarMio() {
  if (usuario === null) return;
  localStorage.removeItem(PREFIJO + usuario);
  avisar();
}

export function estaOculto(mio, item) {
  const m = mio.materias[item.materiaId];
  if (!m) return false;
  return m.secciones.includes(item.seccionId) || m.ocultos.includes(item.clave);
}

/** An item with the name the student gave it and their marks (`m`, the data of its course): nothing moves. */
export function conMarcas(item, m) {
  const nombre = m.nombres[item.clave];
  return {
    ...item,
    nombre: nombre ?? item.nombre,
    nombreOriginal: nombre ? item.nombre : null,
    visto: m.vistos.includes(item.clave),
    parcial: m.parcial.includes(item.clave),
  };
}

/** The items with the student's names, marks, places and order. `extras`: sections with nothing in them yet that can
 * still receive items ({ materiaId, id, nombre }), such as the student's own. */
export function personalizar(items, mio, extras = []) {
  const secciones = new Map(extras.map((s) => [`${s.materiaId}|${s.id}`, s.nombre]));
  for (const item of items) {
    const k = `${item.materiaId}|${item.seccionId}`;
    if (!secciones.has(k)) secciones.set(k, nombreDeSeccion(materiaDe(mio, item.materiaId), item.seccionId) ?? item.seccion);
  }
  const grupos = new Map();
  for (const item of items) {
    const m = materiaDe(mio, item.materiaId);
    // Moved by the student to another section of the course, if that section is still there.
    const lugar = m.lugares[item.clave];
    const destino = lugar !== undefined && lugar !== item.seccionId ? `${item.materiaId}|${lugar}` : null;
    const movido = destino && secciones.has(destino) ? { seccionId: lugar, seccion: secciones.get(destino), seccionOriginal: item.seccionId } : null;
    const propio = {
      ...conMarcas(item, m),
      seccion: secciones.get(`${item.materiaId}|${item.seccionId}`) ?? item.seccion,
      ...movido,
    };
    const clave = `${item.materiaId}|${propio.seccionId}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(propio);
  }
  const salida = [];
  for (const grupo of grupos.values()) {
    const orden = materiaDe(mio, grupo[0].materiaId).orden[grupo[0].seccionId] ?? [];
    const lugar = (i) => {
      const p = orden.indexOf(i.clave);
      return p === -1 ? orden.length : p;
    };
    salida.push(...grupo.map((item, i) => ({ item, i })).sort((a, b) => lugar(a.item) - lugar(b.item) || a.i - b.i).map((x) => x.item));
  }
  return salida;
}

/** Tasks with a date, confirmed dates and the student's own dates, shaped like the campus' calendar events.
 * `nombres` is { materiaId: name }. */
/** Whose the marks kept under `id` are: a campus course (its number, named by `nombres`) or a course of the student's
 * own (its id and its name). The marks of a course of one's own that isn't there anymore are nobody's (null). */
export function materiaDeMarcas(mio, id, nombres = {}) {
  if (!String(id).startsWith('p')) return { materiaId: Number(id), materia: nombres[id] ?? 'Materia' };
  const propia = (mio.propias ?? []).find((p) => p.id === id);
  return propia ? { materiaId: propia.id, materia: propia.nombre } : { materiaId: null, materia: null };
}

export function eventosPropios(mio, nombres = {}) {
  const eventos = (mio.eventos ?? []).map((e) => ({
    id: `e${e.id}`,
    eventoId: e.id,
    titulo: e.titulo,
    materia: e.materiaId ? (nombres[e.materiaId] ?? 'Materia') : null,
    materiaId: e.materiaId,
    vencimiento: e.tipo !== 'otro',
    cuando: e.cuando,
    url: null,
    propio: 'evento',
    sinHora: e.sinHora,
    tipo: e.tipo,
    ...(e.gid ? { gid: e.gid } : {}),
  }));
  for (const [id, m] of Object.entries(mio.materias)) {
    const { materiaId, materia } = materiaDeMarcas(mio, id, nombres);
    if (materiaId === null) continue;
    for (const t of m.tareas) {
      if (t.hecha || !t.fecha) continue;
      eventos.push({ id: `t${id}-${t.id}`, titulo: t.texto, materia, materiaId, vencimiento: true, cuando: fechaDeClave(t.fecha).getTime() / 1000 + 12 * 3600, url: null, propio: 'tarea', sinHora: true });
    }
    for (const f of m.fechas) {
      eventos.push({ id: `f${id}-${f.id}`, titulo: f.titulo, materia, materiaId, vencimiento: true, cuando: f.cuando, url: null, propio: 'fecha', sinHora: f.sinHora });
    }
  }
  return eventos;
}

export const delMes = (eventos, anio, mes) => eventos.filter((e) => claveDia(e.cuando).startsWith(`${anio}-${String(mes).padStart(2, '0')}`));

/** Hoy as the student arranges it (hoy.js). `fn` receives its part and returns the changed version. */
export const cambiarHoy = (fn) => cambiarMio((d) => ({ ...d, hoy: fn(d.hoy ?? HOY_VACIO) }));
const conSin = (lista, valor, esta) => (esta ? [...new Set([...lista, valor])] : lista.filter((v) => v !== valor));
/** `cambio`: the order and the columns, as moverBloque of hoy.js gives them. */
export const ordenarHoy = ({ orden, columnas }) => cambiarHoy((h) => ({ ...h, orden, columnas }));
export const mostrarEnHoy = (clave, si) => cambiarHoy((h) => ({ ...h, ocultos: conSin(h.ocultos, clave, !si) }));
export const contarEnHoy = (cuenta) => cambiarHoy((h) => ({ ...h, cuenta }));
export const diasEnHoy = (dias) => cambiarHoy((h) => ({ ...h, dias }));
export const semanaEnHoy = (forma) => cambiarHoy((h) => ({ ...h, semana: forma === 'calendario' ? 'calendario' : null }));
export const materiaEnHoy = (id, si) => cambiarHoy((h) => ({ ...h, fuera: conSin(h.fuera, Number(id), !si) }));
/** Whether the notifications of a kind (avisos.js, its key) show in the bell and in Hoy. False if it couldn't be saved. */
export const verAvisos = (clave, ver) =>
  cambiarMio((mio) => ({ ...mio, avisosOcultos: ver ? mio.avisosOcultos.filter((c) => c !== clave) : [...mio.avisosOcultos, clave] }));

// ---------- Materias: pinned, archived and the look of each card (tarjetas.js) ----------

/** Up with the pinned ones ('fijada'), away with the archived ones ('archivada'), or back to its group (null). Works
 * the same for a campus course and one of the student's own. False if it could not be saved. */
export const ponerEnLista = (id, lugar) => cambiarMateria(id, (m) => ({ ...m, enLista: LUGARES_EN_MATERIAS.includes(lugar) ? lugar : null }));

/** The look of one course's card, or null for the one of every course. */
export const ponerTarjeta = (id, estilo) => cambiarMateria(id, (m) => ({ ...m, tarjeta: esEstiloDeTarjeta(estilo) ? estilo : null }));
