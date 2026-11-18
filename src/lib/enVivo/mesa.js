import { HERRAMIENTAS, TIPOS } from './herramientas';

// The table of a live session, in its Y.Doc: the open tabs and the chat. Everything here comes from the others too:
// it is read back checked and cut, and shown as text.

export const MAX_PESTANAS = 12;
export const MAX_MENSAJE = 2000;
export const MAX_CHAT = 500;
const MAX_TITULO = 60;

const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
// eslint-disable-next-line no-control-regex
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, max) : '');

/** The open tabs, in the order they were opened: [{ id, tipo, titulo, por, cuando }]. */
export function pestanas(doc) {
  const lista = [];
  doc.getMap('pestanas').forEach((p, id) => {
    if (!p || typeof p !== 'object' || !TIPOS.includes(p.tipo) || !/^[0-9a-f]{12}$/.test(id)) return;
    lista.push({ id, tipo: p.tipo, titulo: texto(p.titulo, MAX_TITULO) || 'Sin nombre', por: texto(p.por, 60), cuando: Number(p.cuando) || 0 });
  });
  return lista.sort((a, b) => a.cuando - b.cuando || a.id.localeCompare(b.id));
}

/** Opens a tab for everyone; `datos` are the tool's starting fields. Returns its id (null past the top). */
export function abrirPestana(doc, tipo, { titulo, datos = {}, por = '' } = {}) {
  if (!TIPOS.includes(tipo) || pestanas(doc).length >= MAX_PESTANAS) return null;
  const id = nuevoId();
  doc.transact(() => {
    const propios = doc.getMap(`h:${id}`);
    Object.entries({ ...HERRAMIENTAS[tipo].inicial?.(), ...datos }).forEach(([k, v]) => propios.set(k, v));
    doc.getMap('pestanas').set(id, { tipo, titulo: texto(titulo, MAX_TITULO), por: texto(por, 60), cuando: Date.now() });
  });
  return id;
}

export function renombrarPestana(doc, id, titulo) {
  const p = doc.getMap('pestanas').get(id);
  if (p) doc.getMap('pestanas').set(id, { ...p, titulo: texto(titulo, MAX_TITULO) });
}

/** Closes it for everyone, with what was in it. `por` ({ id, nombre }): who closes it, told to whoever was on it. */
export function cerrarPestana(doc, id, por = null) {
  doc.transact(() => {
    const p = doc.getMap('pestanas').get(id);
    if (por && p) doc.getMap('meta').set('cerrada', { pestana: id, titulo: texto(p.titulo, MAX_TITULO), de: texto(por.id, 40), nombre: texto(por.nombre, 60), cuando: Date.now() });
    doc.getMap('pestanas').delete(id);
    doc.getMap(`h:${id}`).clear();
  });
}

/** The last tab someone closed: { pestana, titulo, de, nombre }, checked; null if it doesn't read. */
export function leerCerrada(doc) {
  const v = doc.getMap('meta').get('cerrada');
  if (!v || typeof v !== 'object' || typeof v.pestana !== 'string' || !/^[0-9a-f]{12}$/.test(v.pestana)) return null;
  return { pestana: v.pestana, titulo: texto(v.titulo, MAX_TITULO) || 'Sin nombre', de: texto(v.de, 40), nombre: texto(v.nombre, 60) || 'Alguien' };
}

/** The name of a new tab of a tool: its own, numbered if the table already has one with it («Documento 2»). */
export function tituloNuevo(doc, nombre) {
  const usados = new Set(pestanas(doc).map((p) => p.titulo));
  if (!usados.has(nombre)) return nombre;
  let n = 2;
  while (usados.has(`${nombre} ${n}`)) n += 1;
  return `${nombre} ${n}`;
}

/**
 * The tab on screen, of the open ones (`ids`): following someone (`guia`), theirs while it is open; otherwise the one
 * chosen (`elegida`), or the first if it was closed. `propia` is the one chosen from now on: while following, the
 * guide's, so letting go (by hand, in a tool, or the guide gone) stays on it.
 */
export function enPantalla(ids, guia, elegida) {
  if (guia && ids.includes(guia.p)) return { activa: guia.p, propia: guia.p };
  return { activa: ids.includes(elegida) ? elegida : ids[0] ?? null, propia: elegida };
}

/** The chat: [{ id, de, nombre, color, texto, cuando }]. */
export function mensajes(doc) {
  return doc.getArray('chat').toArray().flatMap((m) => {
    if (!m || typeof m !== 'object') return [];
    const cuerpo = texto(m.texto, MAX_MENSAJE).trim();
    if (!cuerpo) return [];
    return [{ id: texto(m.id, 20), de: texto(m.de, 20), nombre: texto(m.nombre, 60) || 'Alguien', color: texto(m.color, 30), texto: cuerpo, cuando: Number(m.cuando) || 0 }];
  });
}

export function escribir(doc, yo, cuerpo) {
  const limpio = texto(cuerpo, MAX_MENSAJE).trim();
  if (!limpio) return false;
  const chat = doc.getArray('chat');
  doc.transact(() => {
    chat.push([{ id: nuevoId(), de: yo.id, nombre: yo.nombre, color: yo.color, texto: limpio, cuando: Date.now() }]);
    // The oldest go: a long session does not grow without end.
    if (chat.length > MAX_CHAT) chat.delete(0, chat.length - MAX_CHAT);
  });
  return true;
}
