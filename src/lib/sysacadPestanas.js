import { normalizar } from './datos';

// Since Sysacad Lindo 2.4.0, the extension keeps a copy (text only) of the last time the student opened each of these
// tabs of Sysacad, and hands them to this page in the same window, like the finals (sysacad.js). The exact shape is
// docs/CONTRATO-SUPERCVG.md of the extension's repo:
//   page to extension   { fuente: 'super-cvg', pide: 'pestanas' | 'olvidar-pestanas' }
//   extension to page   { fuente: 'sysacad-lindo', para: 'super-cvg', v: 2, tipo: 'pestanas', vinculada, guarda,
//                         alumno: 'PEREZ, Juan' | null, pestanas: [{ clave, titulo, fecha, bloques }] }
// A block is { t: 'titulo', texto }, { t: 'texto', texto } or { t: 'tabla', titulo, columnas, filas }. Anything else,
// any key more or any limit passed, and the whole message is ignored. What comes stays in memory only. Lines inside a
// cell or a paragraph come joined by a middle dot between spaces (`ENTRE_LINEAS`).

/** The tabs of Sysacad the extension keeps, in its order: the key and the title of each one. */
export const PESTANAS_DE_SYSACAD = [
  { clave: 'estado', titulo: 'Estado académico' },
  { clave: 'parciales', titulo: 'Notas de parciales' },
  { clave: 'examenes', titulo: 'Exámenes' },
  { clave: 'plan', titulo: 'Materias del plan' },
  { clave: 'correlativas-cursar', titulo: 'Correlatividad para cursar' },
  { clave: 'correlativas-rendir', titulo: 'Correlatividad para rendir' },
  { clave: 'certificados', titulo: 'Certificados' },
];
const ORDEN = new Map(PESTANAS_DE_SYSACAD.map((p, i) => [p.clave, i]));
const TITULO = new Map(PESTANAS_DE_SYSACAD.map((p) => [p.clave, p.titulo]));

/** What joins the lines inside a cell or a paragraph. */
export const ENTRE_LINEAS = ' · ';

export const TOPES = { pestanas: 7, bloques: 60, texto: 2000, titulo: 200, columnas: 30, filas: 500, celda: 300, alumno: 120 };
const DIA_MS = 86_400_000;
const CLAVES = ['fuente', 'para', 'v', 'tipo', 'vinculada', 'guarda', 'alumno', 'pestanas'];
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]+/g;

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const conClaves = (o, claves) => esObjeto(o) && Object.keys(o).length === claves.length && claves.every((k) => Object.hasOwn(o, k));
const limpio = (t) => t.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
// A text within its limit, cleaned like the finals' names. `null` when it is not one.
const texto = (v, tope) => (typeof v === 'string' && v.length <= tope ? limpio(v) : null);

// Thrown inside the reader: one wrong piece and the whole message is out.
const NO_VALE = Symbol('no vale');
const exigir = (condicion) => {
  if (!condicion) throw NO_VALE;
};

function leerBloque(b) {
  exigir(esObjeto(b));
  if (b.t === 'titulo' || b.t === 'texto') {
    exigir(conClaves(b, ['t', 'texto']));
    const t = texto(b.texto, b.t === 'titulo' ? TOPES.titulo : TOPES.texto);
    exigir(t !== null);
    return t ? { t: b.t, texto: t } : null;
  }
  exigir(b.t === 'tabla' && conClaves(b, ['t', 'titulo', 'columnas', 'filas']));
  const titulo = b.titulo === null ? null : texto(b.titulo, TOPES.titulo);
  exigir(b.titulo === null || titulo !== null);
  exigir(Array.isArray(b.columnas) && b.columnas.length <= TOPES.columnas);
  exigir(Array.isArray(b.filas) && b.filas.length <= TOPES.filas);
  const celda = (c) => {
    const t = texto(c, TOPES.celda);
    exigir(t !== null);
    return t;
  };
  const columnas = b.columnas.map(celda);
  const ancho = columnas.length || TOPES.columnas;
  const filas = b.filas.map((f) => {
    exigir(Array.isArray(f) && f.length <= ancho);
    return f.map(celda);
  });
  return { t: 'tabla', titulo: titulo || null, columnas, filas };
}

function leerPestana(p, ahora) {
  exigir(conClaves(p, ['clave', 'titulo', 'fecha', 'bloques']));
  exigir(typeof p.clave === 'string' && TITULO.has(p.clave) && p.titulo === TITULO.get(p.clave));
  // Kept on this same computer: a date from the future (beyond a clock a little off) is not a real one.
  exigir(Number.isSafeInteger(p.fecha) && p.fecha > 0 && p.fecha <= ahora + DIA_MS);
  exigir(Array.isArray(p.bloques) && p.bloques.length <= TOPES.bloques);
  const bloques = p.bloques.map(leerBloque).filter(Boolean);
  return { clave: p.clave, titulo: p.titulo, fecha: p.fecha, bloques };
}

/**
 * What a message of the extension with the tabs says, as { vinculada, guarda, alumno, pestanas }, or null if it is not
 * exactly one. Texts come cleaned; a tab left with no blocks is dropped, and they come in the order of the table.
 */
export function leerPestanas(datos, ahora = Date.now()) {
  try {
    exigir(conClaves(datos, CLAVES));
    exigir(datos.fuente === 'sysacad-lindo' && datos.para === 'super-cvg' && datos.v === 2 && datos.tipo === 'pestanas');
    exigir(typeof datos.vinculada === 'boolean' && typeof datos.guarda === 'boolean');
    const alumno = datos.alumno === null ? null : texto(datos.alumno, TOPES.alumno);
    exigir(datos.alumno === null || alumno);
    exigir(Array.isArray(datos.pestanas) && datos.pestanas.length <= TOPES.pestanas);
    // Not linked, it has nothing to say: it does not keep, knows no one and has no tabs.
    if (!datos.vinculada) exigir(!datos.guarda && alumno === null && !datos.pestanas.length);
    const pestanas = datos.pestanas.map((p) => leerPestana(p, ahora));
    exigir(new Set(pestanas.map((p) => p.clave)).size === pestanas.length);
    return {
      vinculada: datos.vinculada,
      guarda: datos.guarda,
      alumno,
      pestanas: pestanas.filter((p) => p.bloques.length).sort((a, b) => ORDEN.get(a.clave) - ORDEN.get(b.clave)),
    };
  } catch (e) {
    if (e === NO_VALE) return null;
    throw e;
  }
}

// Whose copies these are. Sysacad writes «PEREZ, Juan Ignacio»; the campus, «Juan Pérez» or «Juan Ignacio PEREZ».
// Word by word, without accents, capitals, commas or small words: the shorter name has to be whole inside the longer
// one, with two words at least. One word alone could be anyone's.
const CHICAS = new Set(['da', 'das', 'de', 'del', 'di', 'do', 'dos', 'du', 'e', 'el', 'la', 'las', 'le', 'lo', 'los', 'van', 'von', 'y']);
const palabras = (nombre) => new Set(normalizar(nombre).split(/[^a-z0-9ñ]+/).filter((p) => p && !CHICAS.has(p)));

/** Whether the name Sysacad gives and the one of the campus account are the same person. */
export function mismoAlumno(deSysacad, delCampus) {
  const a = palabras(deSysacad);
  const b = palabras(delCampus);
  const [corto, largo] = a.size <= b.size ? [a, b] : [b, a];
  return corto.size >= 2 && [...corto].every((p) => largo.has(p));
}

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const mismoDia = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

/** How long ago a copy was taken: «recién», «hace 5 min», «hace 3 h», «ayer», «hace 4 días» or the day. */
export function vistoHace(fecha, ahora = Date.now()) {
  const s = Math.max(0, Math.round((ahora - fecha) / 1000));
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (mismoDia(fecha, ahora)) return `hace ${Math.floor(s / 3600)} h`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(fecha, ayer)) return 'ayer';
  const dias = Math.round((new Date(ahora).setHours(0, 0, 0, 0) - new Date(fecha).setHours(0, 0, 0, 0)) / DIA_MS);
  if (dias < 7) return `hace ${dias} días`;
  const otroAnio = new Date(fecha).getFullYear() !== new Date(ahora).getFullYear();
  return `el ${new Date(fecha).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', ...(otroAnio && { year: 'numeric' }) })}`;
}

/** The whole date of a copy: «martes 10 de noviembre de 2026, 14:32». */
export const fechaCompleta = (fecha) =>
  `${new Date(fecha).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${HORA.format(new Date(fecha))}`;

/** The rows of a table that have every word of the search, without accents or capitals. All of them with no search. */
export function filasQueCoinciden(filas, busqueda) {
  const buscadas = normalizar(busqueda).split(/\s+/).filter(Boolean);
  if (!buscadas.length) return filas;
  return filas.filter((f) => {
    const fila = normalizar(f.join(' '));
    return buscadas.every((p) => fila.includes(p));
  });
}

/** For the tables of a tab that share their columns (one per subject, in Exámenes): the share of the width each column
 * takes, the same in all of them, so their columns line up one under the other. By block; null for a table alone. */
export function anchosParejos(bloques) {
  const firma = (b) => (b.t === 'tabla' && b.columnas.length > 1 ? b.columnas.join('\u0000') : null);
  const grupos = new Map();
  bloques.forEach((b, i) => {
    const f = firma(b);
    if (f) grupos.set(f, [...(grupos.get(f) ?? []), i]);
  });
  const salida = bloques.map(() => null);
  for (const indices of grupos.values()) {
    if (indices.length < 2) continue;
    const { columnas } = bloques[indices[0]];
    const largo = (t) => Math.max(...String(t).split(ENTRE_LINEAS).map((l) => l.length));
    const anchos = columnas.map((c, j) => {
      let n = largo(c);
      for (const i of indices) for (const f of bloques[i].filas) if (f.length === columnas.length) n = Math.max(n, largo(f[j] ?? ''));
      return Math.min(40, Math.max(4, n));
    });
    const total = anchos.reduce((a, b) => a + b, 0);
    const parejos = { partes: anchos.map((a) => (a / total) * 100), minimo: total + 2 * anchos.length };
    for (const i of indices) salida[i] = parejos;
  }
  return salida;
}
