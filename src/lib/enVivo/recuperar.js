import { tipoDeBytes } from './apunte';
import { pestanas } from './mesa';
import { origenAnotado } from './origenes';

// After a reload, what this browser put on the table comes back by itself (sesion.js keeps the files in memory only):
// - a file that nobody else here still has, brought again the way it came (origenes.js), from the campus through the
//   site's own functions or from one's own files in this browser, and offered again in the same tab;
// - a course, whose requests are answered again: its files are found again by their names.
// A file from the computer has no way back: its tab asks to choose it again (`recuperacion`, 'elegir').

const ID_ARCHIVO = /^[0-9a-f]{16}$/;
const conocido = (texto) => Object.assign(new Error(texto), { conocido: true });

// By file: 'trayendo', 'falla' or 'elegir'. In memory, as the files.
const estados = new Map();
/** What became of a file of this browser that nobody had after a reload: 'trayendo', 'falla', 'elegir' or null. */
export const recuperacion = (archivo) => estados.get(archivo) ?? null;

/** The bytes of a file again, from where it came. */
export async function traerDeOrigen(o) {
  if (o.b) {
    const [{ leerDeBodega }, { usuarioActual }] = await Promise.all([import('../bodega'), import('../mio')]);
    return leerDeBodega(usuarioActual(), o.b, o.n);
  }
  const [{ cargarContenido }, { traerArchivo }] = await Promise.all([import('../campus'), import('../archivos')]);
  const item = (await cargarContenido({ id: o.m, nombre: '' })).find((i) => i.tipo === 'archivo' && i.clave === o.c && String(i.id).startsWith(`${o.m}-`));
  if (!item) throw conocido('Ya no está en el campus.');
  return traerArchivo(item);
}

/** The files of a course again, for the requests of its tab (materiaMesa.js `atenderPedidos`): each item of the tab that
 * opens, found among what the course has now by its section and its name, or by its name alone. */
export async function volverAAtender(sesion, pestana, o) {
  const [{ seccionesDe }, { armarMateria, atenderPedidos, leerMateria }, { mioActual }] = await Promise.all([import('./deTusMaterias'), import('./materiaMesa'), import('../mio')]);
  const datos = sesion.doc.getMap(`h:${pestana}`);
  const m = leerMateria(datos);
  if (!m) return null;
  const ahora = armarMateria(m.nombre, await seccionesDe({ id: o.m, nombre: m.nombre }, mioActual()));
  const nuevos = ahora.compartido.secciones.flatMap((s) => s.items.filter((i) => i.abre).map((i) => ({ ...i, seccion: s.nombre })));
  const guardados = new Map();
  for (const s of m.secciones) {
    for (const i of s.items.filter((x) => x.abre)) {
      const igual = nuevos.find((n) => n.seccion === s.nombre && n.nombre === i.nombre) ?? nuevos.find((n) => n.nombre === i.nombre);
      if (igual) guardados.set(i.id, ahora.guardados.get(igual.id));
    }
  }
  // What was on its way when the page went is asked again.
  datos.forEach((p, clave) => {
    if (clave.startsWith('p:') && p?.estado === 'trayendo') datos.set(clave, { ...p, estado: 'pedido' });
  });
  return atenderPedidos(sesion, pestana, guardados);
}

const enMarcha = new WeakSet();

/** Watches the table of this session for what this browser shared before a reload. Once per session. */
export function recuperar(sesion, traer = traerDeOrigen) {
  if (enMarcha.has(sesion)) return;
  enMarcha.add(sesion);
  const materias = new Set();
  const marcar = (id, estado) => {
    if (estado) estados.set(id, estado);
    else estados.delete(id);
    sesion.avisar();
  };
  const revisar = () => {
    for (const p of pestanas(sesion.doc)) {
      const datos = sesion.doc.getMap(`h:${p.id}`);
      if (datos.get('de') !== sesion.yo.id) continue;
      if (p.tipo === 'materia' && !materias.has(p.id)) {
        materias.add(p.id);
        const o = origenAnotado(`m:${p.id}`);
        if (o) volverAAtender(sesion, p.id, o).catch(() => {});
        continue;
      }
      const id = datos.get('archivo');
      if (p.tipo !== 'apunte' || typeof id !== 'string' || !ID_ARCHIVO.test(id) || estados.has(id)) continue;
      const estado = sesion.archivos.estado(id);
      if (estado.tiene || !estado.nadie) continue;
      const o = origenAnotado(id);
      if (!o || (!o.b && !o.c)) {
        marcar(id, 'elegir');
        continue;
      }
      marcar(id, 'trayendo');
      (async () => {
        const blob = await traer(o);
        const tipo = blob ? await tipoDeBytes(blob) : null;
        if (!tipo) throw conocido('Solo se abren en la mesa los PDF y las fotos.');
        if (!sesion.archivos.estado(id).tiene) sesion.archivos.compartir(new Blob([blob], { type: tipo === 'pdf' ? 'application/pdf' : tipo }), datos.get('nombre') || 'Apunte', id);
        marcar(id, null);
      })().catch(() => marcar(id, 'falla'));
    }
  };
  sesion.suscribir(revisar);
  revisar();
}
