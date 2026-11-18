// Enrolling in a course (Inscripción): the campus catalog shaped for the screen. Pure functions, no network here:
// the requests are in campus.js, and the one write in moodle.js.
import { coincidencias, palabrasDe } from './coincidir';
import { normalizar, textoPlano } from './datos';

const MARCAS = /[̀-ͯ]/g;
const id = (n) => Number.isSafeInteger(n) && n > 0;

const sinMarcas = (texto) => texto.normalize('NFD').replace(MARCAS, '').toLowerCase().trim();

/** A department as students say it: «Depto Ingeniería en Sistemas» is «Sistemas», «Depto Materias Básicas» is «Básicas». */
export function nombreCorto(nombre) {
  const corto = String(nombre ?? '')
    .replace(/^\s*(depto\.?|dpto\.?|departamento)\s+(de\s+)?/i, '')
    .replace(/^ingenier[ií]a\s+(en\s+)?/i, '')
    .replace(/^materias\s+/i, '')
    .trim();
  return corto ? corto[0].toLocaleUpperCase('es') + corto.slice(1) : String(nombre ?? '');
}

/** The campus categories as the screen shows them. The departments are the ones inside «Grado» (Sistemas, Civil,
 * Básicas…), by name. The other top categories (Ingreso, Posgrado, the secretariats) go apart, in the campus order.
 * Empty ones are left out. A category whose parent is out of sight hangs from the first ancestor in sight.
 *   { departamentos: [{ id, nombre, corto, cursos, partes }], otras: [same], categorias: Map(id → { id, nombre, camino, cursos, orden }) }
 * `cursos` counts the courses anywhere inside; `partes` are the categories inside that hold courses. */
export function armarAreas(respuesta) {
  const categorias = new Map();
  for (const c of Array.isArray(respuesta) ? respuesta : []) {
    if (!id(c?.id)) continue;
    const camino = String(c.path ?? '').split('/').map(Number).filter(id);
    if (camino.at(-1) !== c.id) camino.push(c.id);
    categorias.set(c.id, { id: c.id, nombre: textoPlano(c.name) || 'Sin nombre', camino, cursos: Math.max(0, Number(c.coursecount) || 0), orden: Number(c.sortorder) || 0 });
  }
  // Only the ancestors in sight count, so the path always starts at the top.
  for (const c of categorias.values()) c.camino = c.camino.filter((n) => categorias.has(n));
  // Courses anywhere below each category, its own included.
  const debajo = new Map();
  for (const c of categorias.values()) for (const n of c.camino) debajo.set(n, (debajo.get(n) ?? 0) + c.cursos);
  const conCursos = (c) => debajo.get(c.id) > 0;
  const enOrden = [...categorias.values()].sort((a, b) => a.orden - b.orden || a.id - b.id);
  const area = (c) => ({
    id: c.id,
    nombre: c.nombre,
    corto: nombreCorto(c.nombre),
    cursos: debajo.get(c.id),
    partes: enOrden
      .filter((d) => d.id !== c.id && d.camino.includes(c.id) && conCursos(d))
      .map((d) => ({ id: d.id, nombre: d.camino.slice(d.camino.indexOf(c.id) + 1).map((n) => categorias.get(n).nombre).join(', ') })),
  });
  const arriba = enOrden.filter((c) => c.camino.length === 1 && conCursos(c));
  const grado = arriba.find((c) => sinMarcas(c.nombre) === 'grado');
  const departamentos = grado
    ? enOrden
      .filter((c) => c.camino.length === 2 && c.camino[0] === grado.id && conCursos(c))
      .map(area)
      .sort((a, b) => a.corto.localeCompare(b.corto, 'es'))
    : [];
  const otras = arriba.filter((c) => c !== grado || !departamentos.length).map(area);
  return { departamentos, otras, categorias, grado: departamentos.length ? grado.id : 0, cortos: new Map(departamentos.map((d) => [d.id, d.corto])) };
}

/** Whether a course's category is the one chosen or inside it. Nothing chosen: every course. */
export function enRama(arbol, categoriaId, raiz) {
  if (!raiz) return true;
  return Boolean(arbol.categorias.get(categoriaId)?.camino.includes(raiz));
}

/** Where a course is, as students say it: «Sistemas», «Posgrado y Educación Continua, Diplomaturas». «Grado» goes
 * without saying, and a department by its short name. From under `desde` when one is chosen, since the screen already
 * says it (empty when the course is right in it). */
export function lugarDe(arbol, curso, desde = 0) {
  const categoria = arbol.categorias.get(curso.categoria);
  if (!categoria) return curso.categoriaNombre;
  const camino = desde && categoria.camino.includes(desde) ? categoria.camino.slice(categoria.camino.indexOf(desde) + 1) : categoria.camino;
  return camino
    .filter((n) => n !== arbol.grado)
    .map((n) => arbol.cortos?.get(n) ?? arbol.categorias.get(n).nombre)
    .join(', ');
}

// A year in a course name: «Física II 2026», «Economía 3°01-2025», «Seminario 2027 - Convenio». Not inside a code.
const ANIO = /(?<![\p{L}\p{N}°º])((?:19|20)\d{2})(?!\p{N})/gu;

/** The year a course name says, the last one if it says more than one, or null. */
export function anioDe(nombre) {
  const anios = [...String(nombre ?? '').matchAll(ANIO)].map((m) => Number(m[1]));
  return anios.length ? anios.at(-1) : null;
}

/** The name without its year, which the screen shows apart: «Algoritmos y Estructuras de Datos 2026» is
 * «Algoritmos y Estructuras de Datos». The name as it is when nothing would be left. */
export function sinAnio(nombre) {
  const texto = String(nombre ?? '');
  const limpio = texto
    .replace(/\s*[([]\s*(?:19|20)\d{2}\s*[)\]]/g, '')
    .replace(/\s*[-–_/]?\s*(?<![\p{L}\p{N}°º])(?:19|20)\d{2}(?!\p{N})/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–_/]+|[\s\-–_/]+$/g, '')
    .trim();
  return limpio || texto;
}

/** Whether a course is from a year before `anio`: it says one and it is earlier. One without a year is never old. */
export const esDeOtroAnio = (curso, anio) => {
  const suyo = anioDe(curso.nombre);
  return suyo !== null && suyo < anio;
};

/** The first letter a course is listed under: accents out, numbers and signs under «#». */
export function letraDe(nombre) {
  const primera = sinMarcas(sinAnio(nombre)).replace(/^[^\p{L}\p{N}]+/u, '')[0] ?? '';
  return /\p{L}/u.test(primera) ? primera.toLocaleUpperCase('es') : '#';
}

/** Courses by their first letter, in alphabetical order, for going through a whole department. */
export function porLetra(cursos) {
  const enOrden = [...cursos].sort((a, b) => sinAnio(a.nombre).localeCompare(sinAnio(b.nombre), 'es', { sensitivity: 'base' }) || (anioDe(b.nombre) ?? 0) - (anioDe(a.nombre) ?? 0));
  const grupos = [];
  for (const curso of enOrden) {
    const letra = letraDe(curso.nombre);
    if (grupos.at(-1)?.letra !== letra) grupos.push({ letra, cursos: [] });
    grupos.at(-1).cursos.push(curso);
  }
  return grupos;
}

/** Who gives a course, in a line: «Con Ana Pérez», «Con Ana Pérez y Beto Gómez», «Con Ana, Beto y 2 más». */
export function conDocentes(docentes) {
  const nombres = (docentes ?? []).filter(Boolean);
  if (!nombres.length) return '';
  if (nombres.length === 1) return `Con ${nombres[0]}`;
  if (nombres.length <= 3) return `Con ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
  return `Con ${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
}

/** The categories with courses of their own inside `raiz`, in the campus order: where to list a career from. */
export function categoriasConCursos(arbol, raiz) {
  return [...arbol.categorias.values()]
    .filter((c) => c.cursos > 0 && c.camino.includes(raiz))
    .sort((a, b) => a.orden - b.orden || a.id - b.id)
    .map((c) => c.id);
}

/** A course of the catalog (search or category), with only what the screen shows. */
export function cursoDelCatalogo(c) {
  if (!id(c?.id)) return null;
  return {
    id: c.id,
    nombre: textoPlano(c.displayname || c.fullname) || 'Materia sin nombre',
    corto: textoPlano(c.shortname),
    categoria: c.categoryid,
    categoriaNombre: textoPlano(c.categoryname),
    // Who gives it, as the campus lists them for anyone looking for a course.
    docentes: (Array.isArray(c.contacts) ? c.contacts : []).map((p) => textoPlano(p?.fullname)).filter(Boolean),
    // A self enrolment turned on. It may still be closed or full: that is asked when the student goes for it.
    propia: Array.isArray(c.enrollmentmethods) && c.enrollmentmethods.includes('self'),
    orden: Number(c.sortorder) || 0,
  };
}

// The campus search compares accents as they are written, but leaves the one-letter wildcard of SQL free. Each
// vowel goes as that wildcard, so «fisica» also finds «Física». Signs that would change the search (+, -, %) go out.
const letraDelPatron = (c) => {
  if (c === 'ñ') return c;
  const base = c.normalize('NFD').replace(MARCAS, '');
  if (/^[aeiou]$/.test(base)) return '_';
  return /^[\p{L}\p{N}]$/u.test(base) ? base : '';
};

/** What goes to the campus search for what was typed. With nothing but vowels, the words as they are. */
export function patronDeBusqueda(consulta) {
  const palabras = String(consulta ?? '').toLowerCase().split(/\s+/);
  const patron = palabras.map((p) => [...p].map(letraDelPatron).join('')).filter(Boolean).join(' ');
  if (/[^_ ]/.test(patron)) return patron;
  return palabras.map((p) => p.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).join(' ');
}

/** Whether every word typed is in the course's name or short name, without minding capitals or accents. */
export function coincide(curso, consulta) {
  const texto = normalizar(`${curso.nombre} ${curso.corto}`);
  return palabrasDe(consulta).every((p) => texto.includes(p));
}

/** The name in pieces, with what matched marked. */
export function partesDe(nombre, consulta) {
  return coincidencias([{ nombre }], consulta)[0]?.partes ?? [{ texto: nombre, marca: false }];
}

/** Whether an enrolment status from the campus says yes. Anything else is a reason why not, in the campus words. */
export const estaAbierta = (status) => status === true || status === 1 || status === '1' || status === 'true';

/** From the enrolment methods of a course: its self enrolment open now, if it has one. */
export function inscripcionPropia(metodos) {
  const propias = (Array.isArray(metodos) ? metodos : []).filter((m) => m?.type === 'self' && id(m.id));
  if (!propias.length) return { estado: 'sin' };
  const abierta = propias.find((m) => estaAbierta(m.status));
  return abierta ? { estado: 'abierta', instancia: abierta.id } : { estado: 'cerrada' };
}

/** Courses from consecutive batches (search pages, or categories) until there are `quiero` of them that `aceptar`
 * keeps, or `vueltas` batches were asked, or there are no more. `traer(n)` gives { cursos, fin }.
 * Comes back with what it kept and the batch to go on from, or null when there is nothing left. */
export async function juntar(traer, { desde = 0, aceptar = () => true, quiero = 20, vueltas = 4, vistos = new Set() } = {}) {
  const cursos = [];
  let n = desde;
  let fin = false;
  for (let i = 0; i < vueltas && !fin && cursos.length < quiero; i++) {
    const tanda = await traer(n);
    for (const c of tanda.cursos) {
      if (!c || vistos.has(c.id) || !aceptar(c)) continue;
      vistos.add(c.id);
      cursos.push(c);
    }
    fin = Boolean(tanda.fin);
    n += 1;
  }
  return { cursos, siguiente: fin ? null : n };
}
