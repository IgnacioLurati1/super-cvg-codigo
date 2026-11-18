import { traerArchivo } from '../archivos';
import { enlaceSeguro } from '../datos';
import { tipoDeBytes } from './apunte';
import { abrirPestana, pestanas } from './mesa';
import { anotarOrigen, origenDe } from './origenes';

// A course on the table (a `materia` tab): its sections and what is in them as the one who brought it sees them. Only
// names and kinds go in the Y.Doc (and the address of a link): never a file, nor the address of one of the campus. A
// file is opened on request: whoever wants one asks for it in the tab (`p:<item>`), and the browser that brought the
// course (the only one with access to it) brings it from the campus, as its own preview does, and puts it on the table
// as an Apunte for everyone. What it can bring lives in that browser's memory only, while the session lasts.

export const MAX_SECCIONES = 60;
export const MAX_ITEMS = 400;
const MAX_NOMBRE = 160;
const MAX_URL = 600;
const MAX_ERROR = 160;
const ID_ITEM = /^i\d{1,4}$/;
const ID_PAR = /^[\w-]{1,64}$/;
const ID_PESTANA = /^[\w-]{1,40}$/;
const PEDIDO = /^p:(i\d{1,4})$/;
const ESTADOS = new Set(['pedido', 'trayendo', 'listo', 'falla']);
const TIPOS = new Set(['archivo', 'enlace', 'texto', 'otro']);
// What a section of a course opens on the table: a PDF or a picture.
const ABRE = /\.(pdf|png|jpe?g|gif|webp)$/i;
const MIME_ABRE = /^(application\/pdf|image\/(png|jpeg|gif|webp))$/;

// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const url = (v) => {
  const u = typeof v === 'string' && v.length <= MAX_URL ? enlaceSeguro(v) : null;
  return u && u.length <= MAX_URL ? u : '';
};

/** Whether a file of a course opens on the table, by what it says it is. The bytes decide after. */
export const seAbreEnLaMesa = (item) => item?.tipo === 'archivo' && (MIME_ABRE.test(item.mime ?? '') || ABRE.test(item.archivo ?? item.nombre ?? ''));

function claseDe(item) {
  if (item.tipo === 'archivo') {
    if (/^image\//.test(item.mime ?? '') || /\.(png|jpe?g|gif|webp)$/i.test(item.archivo ?? '')) return 'Foto';
    const ext = /\.([a-z0-9]{1,5})$/i.exec(item.archivo ?? '')?.[1];
    return ext ? ext.toUpperCase() : 'Archivo';
  }
  if (item.tipo === 'enlace') return item.video ? 'Video' : 'Link';
  if (item.tipo === 'texto') return 'Texto';
  return limpio(item.clase, 40) || 'En el campus';
}

/** What of a course goes on the table, and what stays in this browser to bring each file: { compartido, guardados }.
 * `grupos`: [{ nombre, items }] in the order on screen. */
export function armarMateria(nombre, grupos) {
  const guardados = new Map();
  let n = 0;
  const secciones = [];
  for (const g of grupos.slice(0, MAX_SECCIONES)) {
    const items = [];
    for (const item of g.items ?? []) {
      if (n >= MAX_ITEMS) break;
      const id = `i${n}`;
      n += 1;
      const tipo = TIPOS.has(item.tipo) ? item.tipo : 'otro';
      const abre = seAbreEnLaMesa(item);
      if (abre) guardados.set(id, item);
      items.push({
        id,
        nombre: limpio(item.nombre, MAX_NOMBRE) || 'Sin nombre',
        tipo,
        clase: claseDe(item),
        url: tipo === 'enlace' || tipo === 'otro' ? url(item.destino ?? item.campus) : '',
        abre,
      });
    }
    secciones.push({ nombre: limpio(g.nombre, MAX_NOMBRE) || 'General', items });
  }
  return { compartido: { nombre: limpio(nombre, MAX_NOMBRE) || 'Materia', secciones }, guardados };
}

/** The course of the tab ({ nombre, de, secciones }), checked and cut; null if it doesn't read. */
export function leerMateria(datos) {
  const m = datos?.get?.('materia');
  const de = datos?.get?.('de');
  if (!m || typeof m !== 'object' || !Array.isArray(m.secciones) || typeof de !== 'string' || !ID_PAR.test(de)) return null;
  let total = 0;
  const secciones = m.secciones.slice(0, MAX_SECCIONES).map((s) => {
    const items = (Array.isArray(s?.items) ? s.items : [])
      .filter((i) => i && typeof i === 'object' && typeof i.id === 'string' && ID_ITEM.test(i.id))
      .slice(0, Math.max(0, MAX_ITEMS - total))
      .map((i) => ({
        id: i.id,
        nombre: limpio(i.nombre, MAX_NOMBRE) || 'Sin nombre',
        tipo: TIPOS.has(i.tipo) ? i.tipo : 'otro',
        clase: limpio(i.clase, 40),
        url: url(i.url),
        abre: i.abre === true && i.tipo === 'archivo',
      }));
    total += items.length;
    return { nombre: limpio(s?.nombre, MAX_NOMBRE) || 'General', items };
  });
  return { nombre: limpio(m.nombre, MAX_NOMBRE) || 'Materia', de, secciones };
}

/** Where the request for a file is: { estado, por, nombre, pestana, error }, or null if nobody asked for it yet. */
export function leerPedido(datos, item) {
  const p = ID_ITEM.test(item) ? datos.get(`p:${item}`) : null;
  if (!p || typeof p !== 'object' || !ESTADOS.has(p.estado)) return null;
  return {
    estado: p.estado,
    por: typeof p.por === 'string' && ID_PAR.test(p.por) ? p.por : '',
    nombre: limpio(p.nombre, 60),
    pestana: typeof p.pestana === 'string' && ID_PESTANA.test(p.pestana) ? p.pestana : '',
    error: limpio(p.error, MAX_ERROR),
  };
}

/** Asks for a file of the course. Returns false if it's already on its way (or on the table). */
export function pedirArchivo(doc, datos, yo, item) {
  if (!ID_ITEM.test(item)) return false;
  const actual = leerPedido(datos, item);
  const abierta = actual?.estado === 'listo' && pestanas(doc).some((p) => p.id === actual.pestana);
  if (actual && (actual.estado === 'pedido' || actual.estado === 'trayendo' || abierta)) return false;
  datos.set(`p:${item}`, { estado: 'pedido', por: yo.id, nombre: yo.nombre, cuando: Date.now() });
  return true;
}

// What can go wrong bringing a file, said to whoever asked for it.
const NO_ABRE = 'Solo se abren en la mesa los PDF y las fotos.';
const NO_LLEGO = 'No se pudo traer del campus. Probá de nuevo.';

/** The browser that brought the course answers what the others ask: brings each file from the campus and opens it
 * on the table. Ends when the tab closes. `traer`: how a file is brought (the preview's own, by default). */
export function atenderPedidos(sesion, pestana, guardados, traer = (item) => (item.traer ? item.traer() : traerArchivo(item))) {
  const datos = sesion.doc.getMap(`h:${pestana}`);
  const lista = sesion.doc.getMap('pestanas');
  const enCurso = new Set();

  const atender = async (item) => {
    const original = guardados.get(item);
    const pedido = leerPedido(datos, item);
    if (!pedido || pedido.estado !== 'pedido' || enCurso.has(item)) return;
    if (!original) {
      datos.set(`p:${item}`, { ...pedido, estado: 'falla', error: NO_ABRE });
      return;
    }
    enCurso.add(item);
    datos.set(`p:${item}`, { ...pedido, estado: 'trayendo' });
    let fin;
    try {
      const blob = await traer(original);
      const tipo = await tipoDeBytes(blob);
      if (!tipo) throw Object.assign(new Error(NO_ABRE), { conocido: true });
      const archivo = tipo === 'pdf' ? blob : new Blob([blob], { type: tipo });
      const nombre = limpio(original.archivo || original.nombre, 120) || 'Apunte';
      const id = sesion.archivos.compartir(archivo, nombre);
      anotarOrigen(id, origenDe(original));
      const nueva = abrirPestana(sesion.doc, 'apunte', { titulo: limpio(original.nombre, 120) || nombre, datos: { archivo: id, nombre, de: sesion.yo.id }, por: pedido.nombre || sesion.yo.nombre });
      if (!nueva) throw Object.assign(new Error('La mesa ya tiene todas las pestañas que entran. Cerrá alguna.'), { conocido: true });
      fin = { ...pedido, estado: 'listo', pestana: nueva };
    } catch (e) {
      fin = { ...pedido, estado: 'falla', error: e?.conocido ? e.message : NO_LLEGO };
    }
    enCurso.delete(item);
    if (lista.has(pestana)) datos.set(`p:${item}`, fin);
  };

  const alCambiar = (evento) => {
    for (const clave of evento.keysChanged) {
      const m = PEDIDO.exec(clave);
      if (m) atender(m[1]);
    }
  };
  const alCerrar = () => {
    if (!lista.has(pestana)) terminar();
  };
  const terminar = () => {
    datos.unobserve(alCambiar);
    lista.unobserve(alCerrar);
    guardados.clear();
  };
  datos.observe(alCambiar);
  lista.observe(alCerrar);
  // What was asked before this browser was listening.
  datos.forEach((_, clave) => {
    const m = PEDIDO.exec(clave);
    if (m) atender(m[1]);
  });
  return terminar;
}

/** Opens the course on the table as a new tab for everyone, and starts answering its requests. Returns the tab's id.
 * `materia`: its number (or «p…» for one's own), to answer them again after a reload (recuperar.js). */
export function llevarMateria(sesion, nombre, grupos, materia = null) {
  const { compartido, guardados } = armarMateria(nombre, grupos);
  if (!compartido.secciones.some((s) => s.items.length)) throw Object.assign(new Error('Esta materia no tiene nada para mostrar.'), { conocido: true });
  const id = abrirPestana(sesion.doc, 'materia', { titulo: compartido.nombre, datos: { materia: compartido, de: sesion.yo.id }, por: sesion.yo.nombre });
  if (!id) throw Object.assign(new Error('La mesa ya tiene todas las pestañas que entran. Cerrá alguna.'), { conocido: true });
  anotarOrigen(`m:${id}`, { m: materia });
  atenderPedidos(sesion, id, guardados);
  return id;
}

/** The course as text, for the session's Consultron: its sections and what each one has. */
export function materiaEnTexto(m) {
  const lineas = [`Materia «${m.nombre}» en la mesa: sus secciones y lo que tiene cada una.`];
  for (const s of m.secciones) {
    lineas.push(`\n${s.nombre}`);
    for (const i of s.items) lineas.push(`- ${i.nombre} (${i.clase || i.tipo})`);
  }
  return lineas.join('\n').slice(0, 12_000);
}
