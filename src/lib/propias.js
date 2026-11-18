// Courses of the student's own: made from scratch or on top of a campus course, with categories of their own. They
// live with the rest of the student's data (mio.js); the bytes of their files, in bodega.js. Every change goes
// through `cambiarMio`, which runs propiasSaneo.js again: nothing malformed gets saved.
import { borrarDeBodega } from './bodega';
import { cambiarMio, mioActual, useMio, usuarioActual } from './mio';
import { archivosDe, idChico, idPropia, LIMITES, linea } from './propiasSaneo';

export const usePropias = () => useMio().propias;
export const propiaDe = (mio, id) => mio.propias.find((p) => p.id === id) ?? null;
/** The student's own sections of a campus course: kept as a course of their own with `de`, never listed as one. */
export const agregadaDe = (mio, materiaId) => mio.propias.find((p) => p.de === materiaId) ?? null;
export const esAgregada = (propia) => propia.de !== null && propia.de !== undefined;
/** The student's own sections of a campus course, in their order: not the categories tied to a section of the campus. */
export const seccionesTuyas = (agregada) => (agregada?.categorias ?? []).filter((c) => c.campus === undefined);

const ahora = () => Math.floor(Date.now() / 1000);

function cambiarPropia(id, fn) {
  if (!propiaDe(mioActual(), id)) return false;
  return cambiarMio((mio) => ({ ...mio, propias: mio.propias.map((p) => (p.id === id ? { ...fn(p), cambiada: ahora() } : p)) }));
}

function cambiarCategoria(id, catId, fn) {
  return cambiarPropia(id, (p) => ({ ...p, categorias: p.categorias.map((c) => (c.id === catId ? fn(c) : c)) }));
}

const olvidarArchivos = (ids) => {
  if (ids.length) borrarDeBodega(usuarioActual(), ids).catch(() => {});
};

/** A new course. `categorias` without ids get them. Returns its id, or null if it could not be saved or there are
 * already too many. */
export function crearPropia({ nombre, base = null, classroom = null, de = null, categorias = [{ nombre: 'General' }] }) {
  if (!linea(nombre, LIMITES.nombre) || mioActual().propias.length >= LIMITES.materias) return null;
  const propia = {
    id: idPropia(),
    nombre,
    base,
    classroom,
    de,
    categorias: categorias.map((c) => ({ id: idChico(), nombre: c.nombre, bloques: (c.bloques ?? []).map((b) => ({ ...b, id: idChico() })) })),
    cambiada: ahora(),
  };
  return cambiarMio((mio) => ({ ...mio, propias: [...mio.propias, propia] })) ? propia.id : null;
}

/** Adds a course that arrived already clean (paquetePropia.js), keeping its ids. */
export function sumarPropia(propia) {
  if (mioActual().propias.length >= LIMITES.materias) return false;
  return cambiarMio((mio) => ({ ...mio, propias: [...mio.propias, { ...propia, cambiada: ahora() }] }));
}

/** Joins the course to a Classroom course (its number), or unjoins it with null. */
export const unirClassroomPropia = (id, curso) => cambiarPropia(id, (p) => ({ ...p, classroom: curso || null }));

// An empty name would make the course drop on the next save: it's refused here instead.
export const renombrarPropia = (id, nombre) => Boolean(linea(nombre, LIMITES.nombre)) && cambiarPropia(id, (p) => ({ ...p, nombre }));

export function borrarPropia(id) {
  const propia = propiaDe(mioActual(), id);
  if (!propia) return false;
  // Its marks (seen, for the exam, folded, names) go with it.
  const ok = cambiarMio((mio) => {
    const materias = { ...mio.materias };
    delete materias[id];
    return { ...mio, materias, propias: mio.propias.filter((p) => p.id !== id) };
  });
  if (ok) olvidarArchivos(archivosDe(propia));
  return ok;
}

const agregadaPara = (materiaId) => agregadaDe(mioActual(), materiaId)?.id ?? crearPropia({ nombre: 'Tus secciones', de: materiaId, categorias: [] });

/** A section of the student's own in a campus course. Returns { propia, categoria } (their ids), or null if it does
 * not fit. */
export function sumarSeccionPropia(materiaId, nombre) {
  if (!linea(nombre, LIMITES.nombre)) return null;
  const propia = agregadaPara(materiaId);
  const categoria = propia ? agregarCategoria(propia, linea(nombre, LIMITES.nombre)) : null;
  return categoria ? { propia, categoria } : null;
}

const esSeccionTuya = (seccionId) => typeof seccionId === 'string' && /^p\d{1,16}$/.test(seccionId);
const esSeccionValida = (seccionId) => esSeccionTuya(seccionId) || (Number.isSafeInteger(seccionId) && seccionId >= 0);
// The category where the blocks of a section are kept: the student's own section, or the one tied to the campus'.
const categoriaDeSeccion = (propia, seccionId) =>
  propia.categorias.find((c) => (esSeccionTuya(seccionId) ? `p${c.id}` === seccionId : c.campus === seccionId)) ?? null;

/** Adds blocks at the end of a section of a campus course: one of the student's own (`p` and its number) or one of
 * the campus (its number: they go in a category tied to it, made here with them). Returns { propia, ids } of what went
 * in, never more than the cap, or null if nothing could. */
export function sumarEnSeccion(materiaId, seccionId, bloques) {
  if (!esSeccionValida(seccionId)) return null;
  const tuya = esSeccionTuya(seccionId);
  const id = agregadaPara(materiaId);
  const propia = id ? propiaDe(mioActual(), id) : null;
  if (!propia) return null;
  const categoria = categoriaDeSeccion(propia, seccionId);
  if ((tuya && !categoria) || (!categoria && propia.categorias.length >= LIMITES.categorias)) return null;
  const entran = bloques.slice(0, Math.max(0, LIMITES.bloques - (categoria?.bloques.length ?? 0))).map((b) => ({ ...b, id: idChico() }));
  if (!entran.length) return null;
  const ok = cambiarPropia(id, (p) => ({
    ...p,
    categorias: categoria
      ? p.categorias.map((c) => (c.id === categoria.id ? { ...c, bloques: [...c.bloques, ...entran] } : c))
      : [...p.categorias, { id: idChico(), nombre: 'En el campus', campus: seccionId, bloques: entran }],
  }));
  return ok ? { propia: id, ids: entran.map((b) => b.id) } : null;
}

/** Takes one of the student's blocks of a campus course to another section, keeping its id (and with it, its marks).
 * It's kept where it shows: deleting the section it came from doesn't take it along. */
export function pasarASeccion(materiaId, bloqueId, seccionId) {
  const propia = agregadaDe(mioActual(), materiaId);
  const desde = propia?.categorias.find((c) => c.bloques.some((b) => b.id === bloqueId));
  if (!desde || !esSeccionValida(seccionId)) return false;
  const destino = categoriaDeSeccion(propia, seccionId);
  if (destino?.id === desde.id) return true;
  if (esSeccionTuya(seccionId) && !destino) return false;
  if (destino ? destino.bloques.length >= LIMITES.bloques : propia.categorias.length >= LIMITES.categorias) return false;
  const bloque = desde.bloques.find((b) => b.id === bloqueId);
  return cambiarPropia(propia.id, (p) => {
    const categorias = p.categorias.map((c) => {
      if (c.id === desde.id) return { ...c, bloques: c.bloques.filter((b) => b.id !== bloqueId) };
      if (c.id === destino?.id) return { ...c, bloques: [...c.bloques, bloque] };
      return c;
    });
    return { ...p, categorias: destino ? categorias : [...categorias, { id: idChico(), nombre: 'En el campus', campus: seccionId, bloques: [bloque] }] };
  });
}

export function agregarCategoria(id, nombre) {
  const propia = propiaDe(mioActual(), id);
  if (!propia || propia.categorias.length >= LIMITES.categorias) return null;
  const catId = idChico();
  return cambiarPropia(id, (p) => ({ ...p, categorias: [...p.categorias, { id: catId, nombre, bloques: [] }] })) ? catId : null;
}

export const renombrarCategoria = (id, catId, nombre) => cambiarCategoria(id, catId, (c) => ({ ...c, nombre }));

export function borrarCategoria(id, catId) {
  const categoria = propiaDe(mioActual(), id)?.categorias.find((c) => c.id === catId);
  const ok = cambiarPropia(id, (p) => ({ ...p, categorias: p.categorias.filter((c) => c.id !== catId) }));
  if (ok && categoria) olvidarArchivos(categoria.bloques.filter((b) => b.tipo === 'archivo').map((b) => b.archivoId));
  return ok;
}

const mover = (lista, indice, salto) => {
  const destino = indice + salto;
  if (indice < 0 || destino < 0 || destino >= lista.length) return lista;
  const copia = [...lista];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
};

/** Moves a category one place up (-1) or down (1). In a campus course, past the ones tied to a section of the campus,
 * which are not seen as sections. */
export function moverCategoria(id, catId, salto) {
  return cambiarPropia(id, (p) => {
    const indice = p.categorias.findIndex((c) => c.id === catId);
    if (indice === -1) return p;
    const atada = p.categorias[indice].campus !== undefined;
    let destino = indice + salto;
    while (destino >= 0 && destino < p.categorias.length && (p.categorias[destino].campus !== undefined) !== atada) destino += salto;
    if (destino < 0 || destino >= p.categorias.length) return p;
    const copia = [...p.categorias];
    [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
    return { ...p, categorias: copia };
  });
}

/** Puts a category in place `lugar` (0 is the first) of a course of one's own, dragged by its handle. */
export function ponerCategoria(id, catId, lugar) {
  return cambiarPropia(id, (p) => {
    const desde = p.categorias.findIndex((c) => c.id === catId);
    if (desde === -1 || lugar < 0 || lugar >= p.categorias.length || lugar === desde) return p;
    const copia = p.categorias.filter((c) => c.id !== catId);
    copia.splice(lugar, 0, p.categorias[desde]);
    return { ...p, categorias: copia };
  });
}

/** Takes a block to a category of the same course (the same one or another), right before the block `antesDe`, or at
 * the end without it. False if the other category is full. */
export function llevarBloque(id, bloqueId, aCat, antesDe = null) {
  const propia = propiaDe(mioActual(), id);
  const desde = propia?.categorias.find((c) => c.bloques.some((b) => b.id === bloqueId));
  const destino = propia?.categorias.find((c) => c.id === aCat);
  if (!desde || !destino || bloqueId === antesDe) return false;
  if (desde.id !== destino.id && destino.bloques.length >= LIMITES.bloques) return false;
  const bloque = desde.bloques.find((b) => b.id === bloqueId);
  return cambiarPropia(id, (p) => ({
    ...p,
    categorias: p.categorias.map((c) => {
      let bloques = c.id === desde.id ? c.bloques.filter((b) => b.id !== bloqueId) : c.bloques;
      if (c.id === destino.id) {
        const lugar = antesDe === null ? -1 : bloques.findIndex((b) => b.id === antesDe);
        bloques = [...bloques];
        bloques.splice(lugar === -1 ? bloques.length : lugar, 0, bloque);
      }
      return bloques === c.bloques ? c : { ...c, bloques };
    }),
  }));
}

/** A new name for a file of one's own. It keeps its extension, which says how it opens, even if the name leaves it out. */
export function renombrarArchivo(id, catId, bloqueId, nombre) {
  const bloque = propiaDe(mioActual(), id)?.categorias.find((c) => c.id === catId)?.bloques.find((b) => b.id === bloqueId);
  const limpio = linea(nombre, LIMITES.titulo);
  if (bloque?.tipo !== 'archivo' || !limpio) return false;
  const punto = bloque.nombre.lastIndexOf('.');
  const extension = punto > 0 ? bloque.nombre.slice(punto) : '';
  const sinExtension = extension && limpio.toLowerCase().endsWith(extension.toLowerCase()) ? limpio.slice(0, -extension.length).trim() : limpio;
  if (!sinExtension) return false;
  return cambiarBloque(id, catId, bloqueId, { nombre: `${sinExtension.slice(0, LIMITES.titulo - extension.length)}${extension}` });
}

/** Adds blocks at the end of a category. Each one gets its id here. How many fit, never more than the cap. */
export function agregarBloques(id, catId, bloques) {
  const categoria = propiaDe(mioActual(), id)?.categorias.find((c) => c.id === catId);
  if (!categoria) return 0;
  const entran = bloques.slice(0, Math.max(0, LIMITES.bloques - categoria.bloques.length)).map((b) => ({ ...b, id: idChico() }));
  if (!entran.length) return 0;
  return cambiarCategoria(id, catId, (c) => ({ ...c, bloques: [...c.bloques, ...entran] })) ? entran.length : 0;
}

export const cambiarBloque = (id, catId, bloqueId, cambios) =>
  cambiarCategoria(id, catId, (c) => ({ ...c, bloques: c.bloques.map((b) => (b.id === bloqueId ? { ...b, ...cambios, id: b.id, tipo: b.tipo } : b)) }));

export function borrarBloque(id, catId, bloqueId) {
  const bloque = propiaDe(mioActual(), id)?.categorias.find((c) => c.id === catId)?.bloques.find((b) => b.id === bloqueId);
  const ok = cambiarCategoria(id, catId, (c) => ({ ...c, bloques: c.bloques.filter((b) => b.id !== bloqueId) }));
  if (ok && bloque?.tipo === 'archivo') olvidarArchivos([bloque.archivoId]);
  return ok;
}

export const moverBloque = (id, catId, bloqueId, salto) =>
  cambiarCategoria(id, catId, (c) => ({ ...c, bloques: mover(c.bloques, c.bloques.findIndex((b) => b.id === bloqueId), salto) }));

/** Moves a block to the end of another category of the same course. */
export function pasarBloque(id, deCat, bloqueId, aCat) {
  const propia = propiaDe(mioActual(), id);
  const bloque = propia?.categorias.find((c) => c.id === deCat)?.bloques.find((b) => b.id === bloqueId);
  const destino = propia?.categorias.find((c) => c.id === aCat);
  if (!bloque || !destino || deCat === aCat || destino.bloques.length >= LIMITES.bloques) return false;
  return cambiarPropia(id, (p) => ({
    ...p,
    categorias: p.categorias.map((c) => {
      if (c.id === deCat) return { ...c, bloques: c.bloques.filter((b) => b.id !== bloqueId) };
      if (c.id === aCat) return { ...c, bloques: [...c.bloques, bloque] };
      return c;
    }),
  }));
}
