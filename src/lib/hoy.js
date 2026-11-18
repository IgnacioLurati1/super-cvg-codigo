// Hoy as each student arranges it (`hoy` of mio.js, chosen in Configuración): the order of its blocks and the hidden
// ones, what enters «Vencimientos», how many days «Próximas fechas» looks ahead, and the campus courses taken out of Hoy
// and the Calendario (only there: the campus and Google Calendar don't change), and how its week draws the days. Only
// keys and numbers. Pure, so it can
// be tested alone.
import { segun } from './ordenSecciones';

/** The blocks of Hoy, in the order they come, each in the column it starts in: the wide one, or the one at the side
 * (under the other on a phone and in the compact view). The student can pass one to the other column (`columnas`). */
export const BLOQUES_DE_HOY = [
  { clave: 'pendientes', columna: 'principal', nombre: 'Vencimientos' },
  { clave: 'hechas', columna: 'principal', nombre: 'Ya hecho' },
  { clave: 'tareas', columna: 'principal', nombre: 'Para hacer' },
  { clave: 'fechas', columna: 'principal', nombre: 'Próximas fechas' },
  { clave: 'facu', columna: 'costado', nombre: 'En la facu' },
  { clave: 'classroom', columna: 'costado', nombre: 'Conectar Classroom' },
  { clave: 'mensajes', columna: 'costado', nombre: 'Mensajes nuevos en Classroom' },
  { clave: 'cambios', columna: 'costado', nombre: 'Cambios desde tu última revisión' },
  { clave: 'avisos', columna: 'costado', nombre: 'Avisos' },
  { clave: 'ultimo', columna: 'costado', nombre: 'Último subido' },
];
const CLAVES = BLOQUES_DE_HOY.map((b) => b.clave);
export const COLUMNAS_DE_HOY = ['principal', 'costado'];

/** What can enter «Vencimientos»: all of it, until the student takes something out. */
export const CUENTAN_EN_HOY = ['entregas', 'cuestionarios', 'classroom', 'propias'];
const CUENTAN_DE_ENTRADA = CUENTAN_EN_HOY;
/** How many days «Próximas fechas» looks ahead. */
export const DIAS_DE_HOY = [7, 14, 30];
const DIAS_DE_ENTRADA = 14;
/** How the week at the top draws each day: how many dates it has, or as the Calendario's month draws it. */
export const SEMANAS_DE_HOY = ['numeros', 'calendario'];
const MAX_FUERA = 200;

export const HOY_VACIO = Object.freeze({ orden: Object.freeze([]), columnas: Object.freeze({}), ocultos: Object.freeze([]), cuenta: null, dias: null, fuera: Object.freeze([]), semana: null });
const COLUMNA_DE_ENTRADA = Object.fromEntries(BLOQUES_DE_HOY.map((b) => [b.clave, b.columna]));

const esMateria = (id) => /^[1-9]\d{0,11}$/.test(String(id));
const unicos = (x, valida) => (Array.isArray(x) ? [...new Set(x.filter(valida))] : []);

/** Only known keys, kinds, days and course numbers survive. `cuenta` stays null until the student chooses. */
export function sanearHoy(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return { ...HOY_VACIO };
  return {
    orden: unicos(h.orden, (c) => CLAVES.includes(c)),
    // Only the blocks out of the column they start in.
    columnas: Object.fromEntries(
      Object.entries(h.columnas && typeof h.columnas === 'object' && !Array.isArray(h.columnas) ? h.columnas : {})
        .filter(([c, col]) => CLAVES.includes(c) && COLUMNAS_DE_HOY.includes(col) && col !== COLUMNA_DE_ENTRADA[c])
        .sort(([a], [b]) => CLAVES.indexOf(a) - CLAVES.indexOf(b)),
    ),
    // A set: in the order of the blocks, so the same set is always the same list.
    ocultos: Array.isArray(h.ocultos) ? CLAVES.filter((c) => h.ocultos.includes(c)) : [],
    cuenta: Array.isArray(h.cuenta) ? CUENTAN_EN_HOY.filter((t) => h.cuenta.includes(t)) : null,
    dias: DIAS_DE_HOY.includes(h.dias) ? h.dias : null,
    semana: h.semana === 'calendario' ? 'calendario' : null,
    fuera: [...new Set((Array.isArray(h.fuera) ? h.fuera : []).filter(esMateria).map(Number))].sort((a, b) => a - b).slice(0, MAX_FUERA),
  };
}

const deHoy = (mio) => mio?.hoy ?? HOY_VACIO;

/** The column a block is in. */
export const columnaDe = (mio, clave) => deHoy(mio).columnas?.[clave] ?? COLUMNA_DE_ENTRADA[clave];

/** The keys of each column in the student's order, hidden ones included: what the order doesn't know, last. */
export function ordenDeHoy(mio) {
  const { orden } = deHoy(mio);
  return Object.fromEntries(COLUMNAS_DE_HOY.map((col) => [col, segun(CLAVES.filter((c) => columnaDe(mio, c) === col), orden, (c) => c)]));
}

/** The keys on view in each column, in order. */
export function bloquesVisibles(mio) {
  const ocultos = new Set(deHoy(mio).ocultos);
  const orden = ordenDeHoy(mio);
  return Object.fromEntries(COLUMNAS_DE_HOY.map((col) => [col, orden[col].filter((c) => !ocultos.has(c))]));
}

/** The whole order and the columns with `clave` moved to place `lugar` of column `col` (its own, if none). */
export function moverBloque(mio, clave, lugar, col = columnaDe(mio, clave)) {
  const orden = ordenDeHoy(mio);
  const columnas = { ...deHoy(mio).columnas };
  if (!CLAVES.includes(clave) || !COLUMNAS_DE_HOY.includes(col)) return { orden: [...orden.principal, ...orden.costado], columnas };
  const lista = orden[col].filter((c) => c !== clave);
  lista.splice(Math.max(0, Math.min(lugar, lista.length)), 0, clave);
  if (col === COLUMNA_DE_ENTRADA[clave]) delete columnas[clave];
  else columnas[clave] = col;
  return { orden: COLUMNAS_DE_HOY.flatMap((c) => (c === col ? lista : orden[c].filter((x) => x !== clave))), columnas };
}

export const cuentaEnHoy = (mio) => new Set(deHoy(mio).cuenta ?? CUENTAN_DE_ENTRADA);
export const diasDeHoy = (mio) => deHoy(mio).dias ?? DIAS_DE_ENTRADA;
export const semanaDeHoy = (mio) => deHoy(mio).semana ?? 'numeros';
/** The campus courses out of Hoy and the Calendario, by number. */
export const fueraDeHoy = (mio) => new Set(deHoy(mio).fuera);

/** Which kind of «Vencimientos» a pending thing is: a campus quiz, a Classroom task, a date of the student's own, or a
 * campus task or other activity with a date. */
export function tipoDePendiente(e) {
  if (e.propio) return 'propias';
  if (typeof e.id === 'string' && e.id.startsWith('classroom-')) return 'classroom';
  if (e.cuestionario || e.tipo === 'Cuestionario') return 'cuestionarios';
  return 'entregas';
}
