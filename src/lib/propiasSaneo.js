// What a course of the student's own is made of, and the only door it comes in through. A course of their own lives in
// this browser and travels to other students by file or link, so whatever arrives is hostile until it passes here:
// only known fields, types and sizes survive. No React and no storage here, so it can be tested alone.
//
// A course: { id, nombre, base (campus course it came from, or null), classroom (number of its Classroom course, or
// null: its content is read live with the reader's own Google account), de (a campus course whose own sections these
// are, or null: then it is not a course of its own, its categories show inside that course), categorias:
// [{ id, nombre, bloques, campus? }], cambiada }
// `campus`, only in a course with `de`: the number of a section of that campus course. Its blocks show inside that
// section, and the category is not a section of its own. Its name is never shown (the section's comes from the campus),
// and it goes away when it's left empty.
// A block is one of:
//   { tipo: 'campus', materiaId, clave, clase }   something of a campus course, by reference: its name and its
//                                                  file come from the reader's own campus, never stored or copied
//   { tipo: 'archivo', archivoId, nombre, peso, mime }   a file of the student's own (the bytes live in bodega.js)
//   { tipo: 'enlace', url, titulo }                      any http(s) link, such as a page of El Santo Resumen
//   { tipo: 'texto', texto }                             text with a little formatting (formato.js)
import { enlaceSeguro, nombreDeArchivo } from './datos';

export const LIMITES = {
  materias: 50,
  categorias: 40,
  bloques: 300,
  nombre: 120,
  titulo: 200,
  texto: 20_000,
  url: 2000,
  // One file of the student's own. A whole course with its files has its own cap in paquetePropia.js.
  archivo: 25 * 1024 * 1024,
};

export const CLASES_CAMPUS = ['archivo', 'enlace', 'actividad', 'texto'];

// The only file types with a preview. Anything else is just downloaded, typed so the browser never runs it.
const TIPOS = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export const SIN_TIPO = 'application/octet-stream';
/** The type of a file of the student's own, from its name only: what another student wrote as type is ignored. */
export const mimeDe = (nombre) => TIPOS[String(nombre ?? '').split('.').pop()?.toLowerCase()] ?? SIN_TIPO;

const esMateriaId = (id) => /^[1-9]\d{0,11}$/.test(String(id));
const esClave = (c) => typeof c === 'string' && /^\d{1,12}(\.[0-9a-z]{1,12})?$/.test(c);
export const esIdPropia = (id) => typeof id === 'string' && /^p[0-9a-z]{6,20}$/.test(id);
export const esIdArchivo = (id) => typeof id === 'string' && /^[0-9a-z]{8,32}$/.test(id);
const esIdChico = (id) => Number.isSafeInteger(id) && id > 0;

/** One line of text: no invisible characters that disguise or flip it, no line breaks. */
export const linea = (t, limite) =>
  (typeof t === 'string' ? t : '').replace(/\p{Cf}/gu, '').replace(/[\p{Cc}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, limite);

/** Several lines: keeps the breaks and the tabs, drops the rest of the control and invisible characters. */
export const parrafos = (t, limite) =>
  (typeof t === 'string' ? t : '')
    .replace(/\r\n?/g, '\n')
    .replace(/\p{Cf}/gu, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, limite);

export function sanearBloque(b) {
  if (!b || typeof b !== 'object' || !esIdChico(b.id)) return null;
  if (b.tipo === 'campus') {
    if (!esMateriaId(b.materiaId) || !esClave(b.clave)) return null;
    // No name: campus data doesn't go to disk or to other students. The reader's campus says what it is.
    return { id: b.id, tipo: 'campus', materiaId: Number(b.materiaId), clave: b.clave, clase: CLASES_CAMPUS.includes(b.clase) ? b.clase : 'actividad' };
  }
  if (b.tipo === 'archivo') {
    if (!esIdArchivo(b.archivoId)) return null;
    const nombre = nombreDeArchivo(linea(b.nombre, LIMITES.titulo));
    const peso = Number.isSafeInteger(b.peso) && b.peso >= 0 && b.peso <= LIMITES.archivo ? b.peso : 0;
    return { id: b.id, tipo: 'archivo', archivoId: b.archivoId, nombre, peso, mime: mimeDe(nombre) };
  }
  if (b.tipo === 'enlace') {
    const url = typeof b.url === 'string' && b.url.length <= LIMITES.url ? enlaceSeguro(b.url.trim()) : null;
    if (!url) return null;
    return { id: b.id, tipo: 'enlace', url, titulo: linea(b.titulo, LIMITES.titulo) };
  }
  if (b.tipo === 'texto') {
    const texto = parrafos(b.texto, LIMITES.texto);
    return texto ? { id: b.id, tipo: 'texto', texto } : null;
  }
  return null;
}

function sanearCategoria(c, conCampus) {
  if (!c || typeof c !== 'object' || !esIdChico(c.id)) return null;
  const vistos = new Set();
  const bloques = [];
  for (const b of Array.isArray(c.bloques) ? c.bloques : []) {
    const limpio = sanearBloque(b);
    if (!limpio || vistos.has(limpio.id)) continue;
    vistos.add(limpio.id);
    bloques.push(limpio);
    if (bloques.length >= LIMITES.bloques) break;
  }
  const limpia = { id: c.id, nombre: linea(c.nombre, LIMITES.nombre) || 'Sin nombre', bloques };
  if (!conCampus || c.campus === undefined) return limpia;
  if (!Number.isSafeInteger(c.campus) || c.campus < 0 || !bloques.length) return null;
  return { ...limpia, campus: c.campus };
}

export function sanearPropia(p) {
  if (!p || typeof p !== 'object' || !esIdPropia(p.id)) return null;
  const nombre = linea(p.nombre, LIMITES.nombre);
  if (!nombre) return null;
  const de = esMateriaId(p.de) ? Number(p.de) : null;
  const vistas = new Set();
  const categorias = [];
  for (const c of Array.isArray(p.categorias) ? p.categorias : []) {
    const limpia = sanearCategoria(c, de !== null);
    if (!limpia || vistas.has(limpia.id)) continue;
    vistas.add(limpia.id);
    categorias.push(limpia);
    if (categorias.length >= LIMITES.categorias) break;
  }
  return {
    id: p.id,
    nombre,
    base: esMateriaId(p.base) ? Number(p.base) : null,
    classroom: typeof p.classroom === 'string' && /^\d{1,24}$/.test(p.classroom) ? p.classroom : null,
    de,
    categorias,
    cambiada: Number.isSafeInteger(p.cambiada) && p.cambiada > 0 ? p.cambiada : 0,
  };
}

export function sanearPropias(lista) {
  const vistas = new Set();
  const salida = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const limpia = sanearPropia(p);
    if (!limpia || vistas.has(limpia.id)) continue;
    vistas.add(limpia.id);
    salida.push(limpia);
    if (salida.length >= LIMITES.materias) break;
  }
  return salida;
}

/** The own files a course uses, by id. */
export const archivosDe = (propia) => propia.categorias.flatMap((c) => c.bloques.filter((b) => b.tipo === 'archivo').map((b) => b.archivoId));

let ultimo = 0;
/** An id for a category or a block: an integer like the ones sanearBloque accepts, never repeated in this tab, even
 * for the thousands of blocks of a whole course made in the same millisecond. */
export const idChico = () => {
  ultimo = Math.max(ultimo + 1, Date.now() * 1000);
  return ultimo;
};
const azar = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');
export const idPropia = () => `p${azar(12)}`;
export const idArchivo = () => azar(20);

/** Whether a link goes to El Santo Resumen, the study notes of the career. */
export function esDelSantoResumen(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'lutastudios.com' && (u.pathname === '/utn' || u.pathname.startsWith('/utn/'));
  } catch {
    return false;
  }
}
