// The bytes of the student's own files, in this browser's database: the local storage of mio.js can't hold files.
// Keyed by student and file, so two students on the same computer never see each other's. Nothing leaves the browser,
// unless the student saves in their own Google Drive (sincro.js).
import { falla } from './falla';
import { mimeDe } from './propiasSaneo';

const BASE = 'super-cvg';
const ALMACEN = 'archivos';
const SIN_LUGAR = 'No hay lugar en este navegador para ese archivo. Borrá alguno que no uses.';
const NO_ANDA = 'Este navegador no deja guardar archivos. Probá sin el modo privado.';
const FALLO = 'No se pudo usar el archivo en este navegador. Probá de nuevo.';

let abierta = null;
function abrir() {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      if (typeof indexedDB === 'undefined') return mal(falla(NO_ANDA));
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
      pedido.onsuccess = () => ok(pedido.result);
      pedido.onerror = () => mal(falla(NO_ANDA));
      pedido.onblocked = () => mal(falla(NO_ANDA));
    });
    abierta.catch(() => {
      abierta = null;
    });
  }
  return abierta;
}

const clave = (usuario, id) => `${usuario}:${id}`;

async function hacer(modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    let tx;
    let pedido;
    try {
      tx = db.transaction(ALMACEN, modo);
      pedido = fn(tx.objectStore(ALMACEN));
    } catch {
      // A database the browser closed under our feet: the next try opens it again.
      abierta = null;
      mal(falla(FALLO));
      return;
    }
    tx.oncomplete = () => ok(pedido?.result);
    const fallo = () => mal(tx.error?.name === 'QuotaExceededError' ? falla(SIN_LUGAR) : falla(FALLO));
    tx.onerror = fallo;
    tx.onabort = fallo;
  });
}

/** Saves a file of the student's own. Asks the browser to keep it even when space runs short. */
export async function guardarEnBodega(usuario, id, blob) {
  await hacer('readwrite', (s) => s.put(blob, clave(usuario, id)));
  navigator.storage?.persist?.().catch(() => {});
}

/** The file, typed only by its name: the browser downloads anything that isn't a PDF or a picture, never runs it. */
export async function leerDeBodega(usuario, id, nombre) {
  const blob = await hacer('readonly', (s) => s.get(clave(usuario, id)));
  if (!blob) throw falla('Este archivo ya no está en este navegador.');
  return new Blob([blob], { type: mimeDe(nombre) });
}

export const borrarDeBodega = (usuario, ids) => (ids.length ? hacer('readwrite', (s) => ids.forEach((id) => s.delete(clave(usuario, id)))) : Promise.resolve());

/** The ids of the files of one student in this browser, for the copy in their Drive (sincro.js). */
export async function idsEnBodega(usuario) {
  const claves = await hacer('readonly', (s) => s.getAllKeys(IDBKeyRange.bound(`${usuario}:`, `${usuario}:￿`)));
  return (claves ?? []).map((k) => String(k).slice(String(usuario).length + 1));
}

/** Everything of one student, for «Borrar mis datos». */
export const vaciarBodega = (usuario) => hacer('readwrite', (s) => s.delete(IDBKeyRange.bound(`${usuario}:`, `${usuario}:\uffff`)));
