import { traerArchivo } from '../archivos';
import { leerDeBodega } from '../bodega';
import { cargarContenido } from '../campus';
import { estaOculto, personalizar, usuarioActual } from '../mio';
import { esAgregada } from '../propias';
import { itemDeBloque, itemDeCampus, materiasQueUsa } from '../propiasVista';
import { llevarALaSesion, tipoDeBytes } from './apunte';
import { origenDe } from './origenes';

// What the table's «Abrir» brings from the student's courses (AbrirDeAfuera.jsx): a course's sections as this student
// sees them, the campus ones and their own, and a file of them brought in this browser and opened as an Apunte for
// everyone. Everything stays in memory, as in the course's own page.

const leer = (archivoId, nombre) => leerDeBodega(usuarioActual(), archivoId, nombre);
const conocido = (texto) => Object.assign(new Error(texto), { conocido: true });

function agrupar(items) {
  const grupos = new Map();
  for (const item of items) {
    if (!grupos.has(item.seccionId)) grupos.set(item.seccionId, { id: item.seccionId, nombre: item.seccion || 'General', items: [] });
    grupos.get(item.seccionId).items.push(item);
  }
  return [...grupos.values()];
}

/** The sections of a course, with what is in them: [{ nombre, items }], the empty ones out. `materia`: { id, nombre },
 * a number for the campus and «p…» for one's own. `mio`: what the student keeps (mio.js). */
export async function seccionesDe(materia, mio) {
  const propias = mio.propias ?? [];
  if (typeof materia.id === 'number') {
    const grupos = agrupar(personalizar(await cargarContenido(materia), mio).filter((i) => !estaOculto(mio, i)));
    // The student's own sections of the course, and their own files in the campus sections.
    for (const agregada of propias.filter((p) => esAgregada(p) && p.de === materia.id)) {
      for (const c of agregada.categorias) {
        const items = c.bloques.filter((b) => b.tipo !== 'campus').map((b) => itemDeBloque(b, { propia: agregada, categoria: c, leer })).filter(Boolean);
        const delCampus = c.campus !== undefined ? grupos.find((g) => String(g.id) === String(c.campus)) : null;
        if (delCampus) delCampus.items.push(...items);
        else grupos.push({ id: `p${c.id}`, nombre: c.nombre || 'Tuya', items });
      }
    }
    return grupos.filter((g) => g.items.length);
  }
  const propia = propias.find((p) => p.id === materia.id);
  if (!propia) return [];
  const contenidos = new Map(
    await Promise.all(materiasQueUsa(propia).map(async (id) => [id, personalizar(await cargarContenido({ id, nombre: '' }).catch(() => []), mio)])),
  );
  return propia.categorias
    .map((c) => ({ id: `p${c.id}`, nombre: c.nombre, items: c.bloques.map((b) => (b.tipo === 'campus' ? itemDeCampus(b, contenidos) : itemDeBloque(b, { propia, categoria: c, leer }))).filter(Boolean) }))
    .filter((g) => g.items.length);
}

/** Brings a file of a course (from the campus or from this browser) and opens it on the table as an Apunte. Returns the
 * tab's id. Throws with `conocido` what the student can read. */
export async function llevarArchivo(sesion, item) {
  const blob = item.traer ? await item.traer() : await traerArchivo(item);
  if (!blob) throw conocido('No se pudo traer el archivo. Probá de nuevo.');
  const tipo = await tipoDeBytes(blob);
  if (!tipo) throw conocido('Solo se abren en la mesa los PDF y las fotos.');
  return llevarALaSesion(sesion, new Blob([blob], { type: tipo === 'pdf' ? 'application/pdf' : tipo }), item.nombre || item.archivo, origenDe(item));
}
