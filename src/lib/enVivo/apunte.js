import { abrirPestana } from './mesa';
import { anotarOrigen } from './origenes';

// The Apunte of a live session: a PDF or a picture someone has, passed to the others in encrypted parts (sesion.js,
// `archivos`). It lives in each browser's memory only. Everything the others send here is read back checked.

const ID_ARCHIVO = /^[0-9a-f]{16}$/;
const ID_PAR = /^[\w-]{1,64}$/;
export const MAX_NOMBRE = 120;
// A view or a mark of someone else: a page number up to this, and the rest between 0 and 1.
const MAX_PAGINAS = 5000;
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 400;

// eslint-disable-next-line no-control-regex
const limpio = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const fraccion = (n) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null);
const pagina = (n) => (Number.isInteger(n) && n >= 1 && n <= MAX_PAGINAS ? n : null);

/** The tab's starting fields ({ archivo, nombre, de }), checked; null if they don't read. */
export function datosDeApunte(datos) {
  const archivo = datos?.get?.('archivo');
  const de = datos?.get?.('de');
  if (typeof archivo !== 'string' || !ID_ARCHIVO.test(archivo) || typeof de !== 'string' || !ID_PAR.test(de)) return null;
  return { archivo, de, nombre: limpio(datos.get('nombre'), MAX_NOMBRE) || 'Apunte' };
}

/** A view someone shares: { pagina, y (0 to 1 down that page), zoom ('ancho' or a percent) }, or null. */
export function leerVista(v) {
  if (!v || typeof v !== 'object') return null;
  const p = pagina(v.pagina);
  const y = fraccion(v.y);
  const zoom = v.zoom === 'ancho' ? 'ancho' : typeof v.zoom === 'number' && v.zoom >= ZOOM_MIN && v.zoom <= ZOOM_MAX ? Math.round(v.zoom) : null;
  return p && y !== null && zoom ? { pagina: p, y, zoom } : null;
}

/** Whether two views are the same place, near enough not to move. */
export const mismaVista = (a, b) => Boolean(a && b && a.pagina === b.pagina && a.zoom === b.zoom && Math.abs(a.y - b.y) < 0.02);

/** Where someone points: { pagina, x, y } on the page, from 0 to 1, or null. */
export function leerMarca(m) {
  if (!m || typeof m !== 'object') return null;
  const p = pagina(m.pagina);
  const x = fraccion(m.x);
  const y = fraccion(m.y);
  return p && x !== null && y !== null ? { pagina: p, x, y } : null;
}

// Only plain colors from the others: a hex, or rgb()/hsl() with numbers.
export const colorSeguro = (c) => (typeof c === 'string' && /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d.,%\s/]{5,40}\))$/i.test(c.trim()) ? c.trim() : null);

/** What the bytes are, by their first ones (never by the type someone says): 'pdf', a picture's MIME, or null. */
export async function tipoDeBytes(blob) {
  const b = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = (desde, largo) => String.fromCharCode(...b.subarray(desde, desde + largo));
  if (ascii(0, 5) === '%PDF-') return 'pdf';
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  return null;
}

/** Whether a file of the site can go to the table: a PDF or a picture (by its type or name; the bytes are checked
 * where it opens). */
export const sePuedeLlevar = (blob, nombre = '') =>
  blob instanceof Blob && (/^(application\/pdf|image\/(png|jpeg|gif|webp))$/.test(blob.type) || /\.(pdf|png|jpe?g|gif|webp)$/i.test(nombre));

/**
 * Puts a PDF or a picture on the table of a live session: it stays in this browser's memory, and whoever opens the tab
 * asks for it. Returns the id of the new tab. Throws an error with `conocido` (its message is for the student) if it
 * passes 25 MB or the table is full. `origen` (origenes.js): how this browser brings it again after a reload.
 */
export function llevarALaSesion(sesion, blob, nombre, origen = null) {
  if (!sePuedeLlevar(blob, nombre)) throw Object.assign(new Error('Solo se pueden llevar PDF o fotos.'), { conocido: true });
  const titulo = limpio(String(nombre ?? ''), MAX_NOMBRE) || 'Apunte';
  const archivo = sesion.archivos.compartir(blob, titulo);
  const id = abrirPestana(sesion.doc, 'apunte', { titulo, datos: { archivo, nombre: titulo, de: sesion.yo.id }, por: sesion.yo.nombre });
  if (!id) throw Object.assign(new Error('La mesa ya tiene todas las pestañas que entran. Cerrá alguna.'), { conocido: true });
  anotarOrigen(archivo, origen);
  return id;
}
