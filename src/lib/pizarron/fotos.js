// The photos of the board on this side: one worker for the tab (pizarron.worker.js), made with the first photo. After a
// while without photos it goes, and its memory with it. Like the others, it starts from a `blob:` so it carries the
// page's CSP.

import urlTrabajador from './pizarron.worker.js?worker&url';

const SUELTO_MS = 3 * 60_000;

let worker = null;
let soltarArranque = null;
let numero = 0;
let suelto = null;
const esperando = new Map();

/** Whether this browser can work the photos (a worker with its own canvas: Safari from 16.4, the rest for years). */
export const sePuede = () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined';

function crear() {
  const arranque = URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL(urlTrabajador, window.location.href).href)};\n`], { type: 'text/javascript' }));
  const w = new Worker(arranque, { type: 'module', name: 'pizarron' });
  w.onmessage = ({ data }) => {
    const p = esperando.get(data.n);
    if (!p) return;
    esperando.delete(data.n);
    if (data.ok) p.listo(data.r);
    else p.falla(new Error(data.error));
  };
  w.onerror = () => {
    for (const p of esperando.values()) p.falla(new Error('Se cortó el trabajo de las fotos'));
    esperando.clear();
    cerrar();
  };
  soltarArranque = () => URL.revokeObjectURL(arranque);
  return w;
}

function cerrar() {
  worker?.terminate();
  worker = null;
  soltarArranque?.();
  soltarArranque = null;
}

function pedir(mensaje) {
  clearTimeout(suelto);
  worker ??= crear();
  const n = ++numero;
  return new Promise((listo, falla) => {
    esperando.set(n, { listo, falla });
    worker.postMessage({ ...mensaje, n });
  }).finally(() => {
    clearTimeout(suelto);
    suelto = setTimeout(() => !esperando.size && cerrar(), SUELTO_MS);
  });
}

// The file of each open photo: the worker forgets them when it goes, and they open again when they're needed.
const archivos = new Map();

/** Opens a photo and looks for the board: { ancho, alto, tipo, esquinas (0 to 1), seguro }. */
export function abrirFoto(id, archivo) {
  archivos.set(id, archivo);
  return pedir({ que: 'abrir', id, archivo });
}

/** The board of an open photo, straightened and cleaned: { blob (JPEG), ancho, alto }. `lado`: its long side at most. */
export async function procesarFoto(id, { esquinas, tipo, modo, tiza = 'como', intensidad = 0.5, grosor = 0.5, repasos = null, marcar = false, lado = 2400, calidad = 0.88 }) {
  const pedido = { que: 'procesar', id, esquinas, tipo, modo, tiza, intensidad, grosor, repasos, marcar, lado, calidad };
  try {
    return await pedir(pedido);
  } catch (e) {
    // The worker went after a while without photos: the photo opens again, once.
    if (!archivos.has(id) || e?.message !== 'La foto ya no está') throw e;
    await pedir({ que: 'abrir', id, archivo: archivos.get(id) });
    return pedir(pedido);
  }
}

/** Lets an open photo go from memory. */
export function soltarFoto(id) {
  archivos.delete(id);
  return worker ? pedir({ que: 'soltar', id }).catch(() => {}) : Promise.resolve();
}
