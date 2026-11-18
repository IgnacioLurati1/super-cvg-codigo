// How a course of one's own is shown: each block becomes an item like the campus ones, so the rows and the preview
// sheet are the same everywhere. Campus blocks are looked up in the reader's own campus, which gives their name: what
// isn't there says why. Pure functions, no React.
import { dominioDe, sinExtension } from './datos';
import { segun } from './ordenSecciones';
import { esDelSantoResumen } from './propiasSaneo';

/** Why a campus block can't be opened, or null. `contenidos`: Map of course id to its items, null while it's being
 * looked up. `suyas`: the reader's courses, so a course just added that is still loading isn't taken as foreign. */
export function faltaDe(bloque, { contenidos, suyas, error = '' }) {
  const items = contenidos?.get(bloque.materiaId);
  if (!items) {
    if (suyas && !suyas.has(bloque.materiaId)) return 'materia';
    return error ? 'error' : 'buscando';
  }
  return items.some((i) => i.clave === bloque.clave) ? null : 'campus';
}

export const TEXTO_FALTA = {
  buscando: 'Buscando en el campus',
  materia: 'Es de una materia en la que no estás',
  campus: 'Ya no está en el campus',
  error: 'No se pudo buscar en el campus',
};

// Without the campus there is no name: only what kind of thing it is.
const SIN_NOMBRE = { archivo: 'Un archivo del campus', enlace: 'Un enlace del campus', actividad: 'Una actividad del campus', texto: 'Un texto del campus' };
export const nombreSinCampus = (bloque) => SIN_NOMBRE[bloque.clase] ?? 'Algo del campus';
const ICONO_CLASE = { archivo: 'documento', enlace: 'enlace', actividad: 'actividad', texto: 'texto' };
/** The icon of a campus block that can't be looked up, by the kind of thing it is. */
export const iconoSinCampus = (bloque) => ICONO_CLASE[bloque.clase] ?? 'actividad';

/** The campus item a block points to, with the reader's names and marks, or null. */
export const itemDeCampus = (bloque, contenidos) => contenidos?.get(bloque.materiaId)?.find((i) => i.clave === bloque.clave) ?? null;

/** The first line of a text, without its marks, as its name. */
export function primeraLinea(texto) {
  const linea = texto.split('\n').find((l) => l.trim()) ?? '';
  const limpia = linea.replace(/^#{1,3}\s+|^\s*[-*•]\s+/, '').replace(/\*+/g, '').trim();
  return limpia.length > 80 ? `${limpia.slice(0, 80)}…` : limpia;
}

/** The item an own file, link or text becomes. `leer(archivoId, nombre)` gets an own file. */
export function itemDeBloque(bloque, { propia, categoria, leer }) {
  const id = `${propia.id}-${bloque.id}`;
  const lugar = { materia: propia.nombre, seccion: categoria.nombre };
  if (bloque.tipo === 'archivo') {
    return { id, tipo: 'archivo', nombre: sinExtension(bloque.nombre), archivo: bloque.nombre, peso: bloque.peso, mime: bloque.mime, ...lugar, propio: true, archivoId: bloque.archivoId, traer: () => leer(bloque.archivoId, bloque.nombre) };
  }
  if (bloque.tipo === 'enlace') {
    const dominio = dominioDe(bloque.url);
    return { id, tipo: 'enlace', nombre: bloque.titulo || dominio, destino: bloque.url, dominio, santo: esDelSantoResumen(bloque.url), ...lugar };
  }
  if (bloque.tipo === 'texto') {
    return { id, tipo: 'texto', nombre: primeraLinea(bloque.texto) || 'Texto', texto: bloque.texto, formato: true, enlaces: [], ...lugar };
  }
  return null;
}

/** What a course of one's own brings in numbers, for its row in the list. */
export function resumenDePropia(propia) {
  const bloques = propia.categorias.flatMap((c) => c.bloques);
  if (!bloques.length) return 'Vacía';
  const archivos = bloques.filter((b) => b.tipo === 'archivo').length;
  const partes = [propia.categorias.length === 1 ? 'Una categoría' : `${propia.categorias.length} categorías`];
  if (archivos) partes.push(archivos === 1 ? 'un archivo tuyo' : `${archivos} archivos tuyos`);
  return partes.join(', ');
}

/** The courses whose content a course of one's own needs, by id. */
export const materiasQueUsa = (propia) => [...new Set(propia.categorias.flatMap((c) => c.bloques.filter((b) => b.tipo === 'campus').map((b) => b.materiaId)))];

/** The categories a course of the campus starts with when it's taken as the base: its sections, with what the student
 * sees in them. The section names stay because the student asked for them; the items go by number. */
export function categoriasDeCampus(materia, items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.seccionId)) grupos.set(item.seccionId, { nombre: item.seccion || 'General', bloques: [] });
    grupos.get(item.seccionId).bloques.push({ tipo: 'campus', materiaId: materia.id, clave: item.clave, clase: item.tipo });
  }
  return [...grupos.values()];
}

/** A section of a course of one's own with what the student added (`tuyos`, in the order of its category, each with
 * `tuyo`) and what was moved there from its Classroom course (`deClassroom`). Those of Classroom go where `orden` (the
 * keys, as the student left them) puts them; the student's own keep the order of the category, so it's the same when the
 * course is shared. */
export function mezclarConClassroom(tuyos, deClassroom, orden = []) {
  if (!deClassroom.length) return tuyos;
  const juntos = segun([...tuyos, ...deClassroom], orden, (i) => i.clave);
  let k = 0;
  return juntos.map((i) => (i.tuyo ? tuyos[k++] : i));
}
