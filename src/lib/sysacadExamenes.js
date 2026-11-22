import { esClaveDeDia, fechaDeClave, huella } from './datos';
import { mismoAlumno } from './sysacadPestanas';

// The exams the student signed up for in Sysacad, from Sysacad Lindo (since its 2.5.0), so they show in Calendario and
// go to the calendar «Super CVG» of Google. In memory only, like the finals: no storage, no address.
//   page to extension   { fuente: 'super-cvg', pide: 'examenes' }
//   extension to page   { fuente: 'sysacad-lindo', para: 'super-cvg', v: 3, tipo: 'examenes', vinculada, alumno,
//                         fecha, examenes: [{ materia, dia, turno, teorico, practico, tribunal }] }
// The contract is docs/CONTRATO-SUPERCVG.md of Sysacad Lindo. Only the subject, the day and the time are used: the turn
// and the examining board are read to check the message, and dropped.

export const TOPES = { examenes: 30, materia: 120, turno: 20, tribunal: 80, alumno: 120 };
const CLAVES = ['fuente', 'para', 'v', 'tipo', 'vinculada', 'alumno', 'fecha', 'examenes'];
const CLAVES_EXAMEN = ['materia', 'dia', 'turno', 'teorico', 'practico', 'tribunal'];
const DIA_MS = 86_400_000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const conClaves = (o, claves) => esObjeto(o) && Object.keys(o).length === claves.length && claves.every((k) => Object.hasOwn(o, k));
const NO_VALE = Symbol('no vale');
const exigir = (condicion) => {
  if (!condicion) throw NO_VALE;
};
// A text within its limit and without control characters, with its spaces evened out. Empty is no text.
function texto(v, tope) {
  exigir(typeof v === 'string' && v.length <= tope && !CONTROL.test(v));
  const t = v.replace(/\s+/g, ' ').trim();
  exigir(t);
  return t;
}
const textoONulo = (v, tope) => (v === null ? null : texto(v, tope));
const horaONula = (v) => {
  exigir(v === null || (typeof v === 'string' && HORA.test(v)));
  return v;
};

function leerExamen(e) {
  exigir(conClaves(e, CLAVES_EXAMEN));
  const materia = texto(e.materia, TOPES.materia);
  exigir(typeof e.dia === 'string' && esClaveDeDia(e.dia));
  textoONulo(e.turno, TOPES.turno);
  textoONulo(e.tribunal, TOPES.tribunal);
  return { materia, dia: e.dia, teorico: horaONula(e.teorico), practico: horaONula(e.practico) };
}

/** What a message of the extension with the exams says, as { vinculada, alumno, fecha, examenes }, or null if it is not
 * exactly one. A subject and day that repeat keep the first. */
export function leerExamenes(datos, ahora = Date.now()) {
  try {
    exigir(conClaves(datos, CLAVES));
    exigir(datos.fuente === 'sysacad-lindo' && datos.para === 'super-cvg' && datos.v === 3 && datos.tipo === 'examenes');
    exigir(typeof datos.vinculada === 'boolean' && Array.isArray(datos.examenes) && datos.examenes.length <= TOPES.examenes);
    // Not linked, it has nothing to say.
    if (!datos.vinculada) {
      exigir(datos.alumno === null && datos.fecha === null && !datos.examenes.length);
      return { vinculada: false, alumno: null, fecha: null, examenes: [] };
    }
    const alumno = textoONulo(datos.alumno, TOPES.alumno);
    // Read on this same computer: a date from the future (beyond a clock a little off) is not a real one.
    const { fecha } = datos;
    exigir(fecha === null ? !datos.examenes.length : Number.isSafeInteger(fecha) && fecha > 0 && fecha <= ahora + DIA_MS);
    const vistos = new Set();
    const examenes = [];
    for (const e of datos.examenes.map(leerExamen)) {
      const clave = `${e.dia} ${e.materia}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      examenes.push(e);
    }
    return { vinculada: true, alumno, fecha, examenes: examenes.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0)) };
  } catch (e) {
    if (e === NO_VALE) return null;
    throw e;
  }
}

/** The exams of the student signed in, or null when that is not known: no answer from the extension, not linked,
 * nothing read yet in that browser (no `fecha`), or Sysacad's name is not this campus account's (or one of the two is
 * missing). Not known, the ones already in Google stay: another browser may have read them. */
export function examenesDelAlumno(leidos, nombreDelCampus) {
  if (!leidos?.vinculada || !leidos.alumno || leidos.fecha === null || !nombreDelCampus?.trim()) return null;
  return mismoAlumno(leidos.alumno, nombreDelCampus) ? leidos.examenes : null;
}

// When the exam starts: the earlier of the theory and the practice parts. Without either, the whole day.
function cuandoDe({ dia, teorico, practico }) {
  const hora = [teorico, practico].filter(Boolean).sort()[0];
  const d = fechaDeClave(dia);
  const [h, m] = hora ? hora.split(':').map(Number) : [12, 0];
  d.setHours(h, m, 0, 0);
  return { cuando: Math.floor(d.getTime() / 1000), sinHora: !hora };
}

/** The exams as dates of the calendar, the same shape the calendar page draws. */
export const eventosDeExamenes = (examenes) => (examenes ?? []).map((e) => ({
  id: `x${e.dia.replace(/-/g, '')}-${huella(e.materia)}`,
  titulo: `Final de ${e.materia}`,
  ...cuandoDe(e),
  propio: 'sysacad',
  tipo: 'final',
  dia: e.dia,
  materiaSysacad: e.materia,
}));
