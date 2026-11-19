import { leerCorrelatividad, leerEstado } from './carrera';
import { normalizar } from './datos';
import { ordenarFrenos } from './frenos';
import { esTroncal } from './santoResumen';
import { ENTRE_LINEAS } from './sysacadPestanas';

// The Sysacad screen (pages/Sysacad.jsx) shows each copy the way Sysacad Lindo redraws that page of Sysacad: what
// matters first (an average, a count), filters with how many each one leaves, the subjects by year and each state in
// words. Only reading here: what the copies say, turned into what the screen draws. Anything that doesn't have the
// expected columns goes back as null, and the screen shows it as a plain table.

/** The first table among the blocks whose columns include all of these (compared without accents or capitals). */
function tablaCon(bloques, columnas) {
  for (const b of bloques) {
    if (b.t !== 'tabla') continue;
    const nombres = b.columnas.map(normalizar);
    if (columnas.every((c) => nombres.includes(c))) return { indice: (c) => nombres.indexOf(c), filas: b.filas, bloque: b };
  }
  return null;
}

const anioDe = (texto) => {
  const n = Number.parseInt(texto ?? '', 10);
  return Number.isSafeInteger(n) && n >= 0 && n <= 9 ? n : null;
};

const SYSACAD_AL = /^(.+?)\s+de\s+.+?\s+al\s+(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)\s*$/;

/**
 * Sysacad's own title row («Exámenes de Pérez, Ana al 2/11/2026 22:03:03») turned into the date the data is from, as
 * Sysacad Lindo says it under the title. The row goes, and so does a repeat of the tab's name.
 */
export function datosDe(pestana) {
  const [primero, ...resto] = pestana.bloques;
  if (primero?.t !== 'titulo') return { al: null, bloques: pestana.bloques };
  const partes = primero.texto.match(SYSACAD_AL);
  if (partes) return { al: partes[2], bloques: resto };
  if (normalizar(primero.texto) === normalizar(pestana.titulo)) return { al: null, bloques: resto };
  return { al: null, bloques: pestana.bloques };
}

/** A text all in capitals («IMPORTANTE: AL GENERAR…») in sentence case, the way the rest of the site writes. */
export function sinMayusculas(texto) {
  const letras = texto.replace(/[^\p{L}]/gu, '');
  if (letras.length < 8 || letras !== letras.toUpperCase()) return texto;
  const bajo = texto.toLocaleLowerCase('es-AR');
  return bajo.charAt(0).toLocaleUpperCase('es-AR') + bajo.slice(1);
}

const esComplementaria = (nombre) => /^compl/i.test(nombre.trim());
// Electives: marked by Sysacad, or, when the plan is one El Santo Resumen knows (most of its subjects are there), not a
// subject of that plan, as in Tu carrera. For any other career, only Sysacad's mark: otherwise every subject would be one.
// The entrance course is never one, nor a complement for those who changed plans.
const MARCA_ELECTIVA = /\(elec/i;
function reglaDeElectivas(nombres) {
  const del = nombres.filter((x) => x.anio !== 0 && !esComplementaria(x.nombre) && !MARCA_ELECTIVA.test(x.nombre));
  const conocido = del.length > 0 && del.filter((x) => esTroncal(x.nombre)).length * 2 >= del.length;
  return ({ nombre, anio }) => MARCA_ELECTIVA.test(nombre) || (conocido && anio !== 0 && !esComplementaria(nombre) && !esTroncal(nombre));
}
const deUnoADiez = (n) => (n !== null && n >= 1 && n <= 10 ? n : null);

export const decimal = (n) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nota = (n) => String(n).replace('.', ',');

/** What one cell of Estado académico says, the way Sysacad Lindo shows it: the state in words, when, the record
 * (tomo and folio), the hours and the grade. */
export function estadoDeMateria(texto, { electiva = false, complementaria = false, notaAparte = null } = {}) {
  const { tipo, nota: conNota, crudo } = leerEstado(texto);
  const cuando = crudo.match(/\ben\s+(\d{4})(\s*\([^)]+\))?/i);
  const tomo = crudo.match(/tomo:?\s*([^\s,]+)/i)?.[1];
  const folio = crudo.match(/folio:?\s*([^\s,]+)/i)?.[1];
  const horas = crudo.match(/\((\d+)\s*hs/i)?.[1];
  const en = cuando ? ` en ${cuando[1]}${cuando[2] ?? ''}` : '';
  const dice = tipo === 'aprobada' ? `Aprobada${en}`
    : tipo === 'regular' ? `Regular${en}`
      : tipo === 'pendiente' ? (complementaria ? 'Complementaria, sin cursar' : electiva ? 'Electiva, sin cursar' : 'Sin cursar')
        : tipo === 'cursando' ? (/^inscript/i.test(crudo) ? 'Inscripto' : 'Cursando')
          : crudo;
  return {
    tipo,
    dice,
    registro: tomo ? (folio ? `Tomo ${tomo}, folio ${folio}` : `Tomo ${tomo}`) : '',
    horas: horas ? Number(horas) : 0,
    nota: tipo === 'aprobada' ? (deUnoADiez(conNota) ?? deUnoADiez(notaAparte)) : null,
  };
}

/**
 * Estado académico: every subject with its state, the average of the grades, how far along the career is and the
 * electives apart. Null when the copy has no table with Año, Materia and Estado.
 *
 * `materias`: [{ anio, nombre, electiva, deLaCarrera, tipo, dice, registro, horas, nota }]. `deLaCarrera`: counts for
 * the progress (not an elective, nor a complementary one never taken).
 */
export function leerEstadoAcademico(bloques) {
  const t = tablaCon(bloques, ['ano', 'materia', 'estado']);
  if (!t) return null;
  const [a, m, e, n] = ['ano', 'materia', 'estado', 'nota'].map(t.indice);
  const filas = t.filas.filter((f) => f[m]?.trim());
  if (!filas.length) return null;
  const esElectiva = reglaDeElectivas(filas.map((f) => ({ nombre: f[m].trim(), anio: anioDe(f[a]) })));
  const materias = filas.map((f) => {
    const nombre = f[m].trim();
    const anio = anioDe(f[a]);
    const electiva = esElectiva({ nombre, anio });
    const complementaria = esComplementaria(nombre);
    const aparte = n >= 0 ? Number.parseFloat((f[n] ?? '').replace(',', '.')) : Number.NaN;
    const estado = estadoDeMateria(f[e], { electiva, complementaria, notaAparte: aparte >= 1 && aparte <= 10 ? aparte : null });
    return { anio, nombre, electiva, deLaCarrera: !electiva && !(complementaria && estado.tipo === 'pendiente'), ...estado };
  });
  const carrera = materias.filter((x) => x.deLaCarrera);
  const cuantas = (lista, tipo) => lista.filter((x) => x.tipo === tipo).length;
  const conNota = materias.filter((x) => x.nota !== null);
  const electivas = materias.filter((x) => x.electiva);
  return {
    tabla: t.bloque,
    materias,
    promedio: conNota.length ? conNota.reduce((s, x) => s + x.nota, 0) / conNota.length : null,
    notas: conNota.length,
    total: carrera.length,
    aprobadas: cuantas(carrera, 'aprobada'),
    regulares: cuantas(carrera, 'regular'),
    cursando: cuantas(carrera, 'cursando'),
    sinCursar: cuantas(carrera, 'pendiente'),
    electivas: {
      total: electivas.length,
      aprobadas: cuantas(electivas, 'aprobada'),
      regulares: cuantas(electivas, 'regular'),
      horas: electivas.filter((x) => x.tipo === 'aprobada').reduce((s, x) => s + x.horas, 0),
    },
  };
}

const CORTE = 39;

/**
 * A Correlatividad copy (para cursar or para rendir): each subject not passed yet, whether it can and what is missing
 * («Regularizar Comunicación de Datos»), what holds back the most and how many can. Null without Año, Materia and
 * Correlatividad.
 *
 * `materias`: [{ anio, nombre, electiva, puede, faltan: [texto] }]. `frenos`: [{ nombre, abre, frena }], two or more,
 * counted only from this copy (frenos.js). `para`: 'cursar' or 'rendir', which copy it is.
 */
export function leerCorrelativas(bloques, para = 'cursar') {
  const t = tablaCon(bloques, ['ano', 'materia', 'correlatividad']);
  if (!t) return null;
  const [a, m, c] = ['ano', 'materia', 'correlatividad'].map(t.indice);
  const filas = t.filas.filter((f) => f[m]?.trim()).map((f) => ({ anio: anioDe(f[a]), corto: f[m].trim(), ...leerCorrelatividad(f[c]) }));
  // Sysacad cuts the subject at 40 characters; the requirements bring the whole names.
  const enteros = new Map();
  for (const f of filas) for (const r of f.faltan) enteros.set(r.clave, r.texto);
  const completar = (corto) => {
    if (corto.length < CORTE) return corto;
    const n = normalizar(corto).trim();
    // Only when one name fits: two that start alike are left as Sysacad cut them.
    const candidatos = [...enteros].filter(([clave]) => clave.startsWith(n) && clave !== n);
    return candidatos.length === 1 ? candidatos[0][1] : corto;
  };
  if (!filas.length) return null;
  const nombres = filas.map((f) => ({ nombre: completar(f.corto), anio: f.anio }));
  const esElectiva = reglaDeElectivas(nombres);
  const materias = filas.map((f, i) => {
    const { nombre } = nombres[i];
    const propia = normalizar(nombre);
    // For the final, «No regularizó <itself>» is that it isn't regular yet.
    const faltan = [
      ...f.faltan.map((r) => (r.clave === propia ? 'Regularizarla' : `${r.accion} ${r.texto}`)),
      ...f.otros,
    ];
    const electiva = esElectiva(nombres[i]);
    const requisitos = f.faltan.filter((r) => r.clave !== propia);
    // For the final it opens only once it is regular (it doesn't lack itself).
    const lado = f.puede ? null : { clave: propia, electiva, para, faltan: requisitos, abre: !f.otros.length && (para !== 'rendir' || requisitos.length === f.faltan.length) };
    return { anio: f.anio, nombre, electiva, puede: f.puede, faltan, lado };
  });
  const lados = materias.map((x) => x.lado).filter(Boolean);
  const nombresDe = new Map();
  for (const l of lados) if (!l.electiva) for (const r of l.faltan) if (!nombresDe.has(r.clave)) nombresDe.set(r.clave, r.texto);
  const frenos = ordenarFrenos(lados, [...nombresDe].map(([clave, nombre]) => ({ clave, nombre })), { minimo: 2 })
    .map(({ nombre, abre, frena }) => ({ nombre, abre, frena }));
  return {
    tabla: t.bloque,
    materias: materias.map(({ lado: _, ...x }) => x),
    pueden: materias.filter((x) => x.puede).length,
    total: materias.length,
    frenos,
  };
}

/** The years among the subjects, in order, the ones without a year last. */
export function aniosDe(materias) {
  const anios = [...new Set(materias.map((x) => x.anio))];
  return anios.sort((x, y) => (x === null) - (y === null) || x - y);
}

// ---------- Any other table: search, filters by the columns that repeat, and sorting by any column ----------

/** A row with fewer cells than columns: Sysacad's total («Promedio con aplazos: 7,50»), not a row of the list. */
export const esTotal = (fila, columnas) => columnas.length > 1 && fila.length < columnas.length;

// Columns Sysacad Lindo never filters by: each row says its own thing there.
const SIN_FILTRO = /^(materia|notas?|obs|inasistencias|horarios?|fecha|codigo|aula)$/;

/**
 * The columns a table can be filtered by, with Sysacad Lindo's rule: from six rows, a value that repeats, between two
 * and eight of them, all short. The two with fewest values. [{ indice, nombre, valores: [{ valor, cuantas }] }]
 */
export function filtrosDe(columnas, filas) {
  if (filas.length < 6) return [];
  return columnas
    .map((nombre, indice) => {
      const cuantas = new Map();
      for (const f of filas) {
        const v = (f[indice] ?? '').trim();
        if (v) cuantas.set(v, (cuantas.get(v) ?? 0) + 1);
      }
      const valores = [...cuantas].map(([valor, n]) => ({ valor, cuantas: n })).sort((x, y) => comparar(x.valor, y.valor));
      return { indice, nombre, valores };
    })
    .filter(({ nombre, valores }) => nombre.trim() && !SIN_FILTRO.test(normalizar(nombre).trim().replace(/\.$/, ''))
      && valores.length >= 2 && valores.length <= 8 && valores.length < filas.length
      && valores.every((v) => v.valor.length <= 28 && !v.valor.includes(ENTRE_LINEAS)))
    .sort((x, y) => x.valores.length - y.valores.length)
    .slice(0, 2);
}

const NUMEROS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];

/** What a cell weighs when sorting: a date (dd/mm/yyyy), a grade in numbers or in words, a number, or its text. */
export function pesoDe(texto) {
  const t = (texto ?? '').trim();
  const fecha = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (fecha) return Number(fecha[3]) * 10_000 + Number(fecha[2]) * 100 + Number(fecha[1]);
  const palabra = NUMEROS.indexOf(normalizar(t));
  if (palabra >= 0) return palabra;
  if (/^-?\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return null;
}

/** Two cells compared: by their weight when both have one, by their text otherwise; the empty ones last. */
export function comparar(x, y) {
  if (!x?.trim() !== !y?.trim()) return x?.trim() ? -1 : 1;
  const px = pesoDe(x);
  const py = pesoDe(y);
  if (px !== null && py !== null) return px - py;
  if (px !== null || py !== null) return px !== null ? -1 : 1;
  return (x ?? '').localeCompare(y ?? '', 'es', { sensitivity: 'base', numeric: true });
}

/** The rows sorted by a column, up or down, the same order among equals. In a column of dates or grades, what isn't
 * one («Ausen.») goes after them, and the empty ones always last, whichever the way. */
export function ordenar(filas, indice, sube = true) {
  const conPeso = filas.some((f) => pesoDe(f[indice]) !== null);
  const grupo = (f) => (!(f[indice] ?? '').trim() ? 2 : conPeso && pesoDe(f[indice]) === null ? 1 : 0);
  return filas
    .map((f, i) => [f, i])
    .sort(([x, i], [y, j]) => grupo(x) - grupo(y) || (sube ? 1 : -1) * comparar(x[indice], y[indice]) || i - j)
    .map(([f]) => f);
}

/** «8» as the site writes a grade. */
export const notaComoTexto = nota;
