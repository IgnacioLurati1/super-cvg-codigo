// The photos of the board, worked out of the page's thread: a phone's photo is 12 million pixels. Each photo stays
// here, decoded, while the student works on it (`soltar` lets it go). Nothing goes to disk or to the network.

import { detectar, LADO_DETECTAR } from './detectar.js';
import { enderezar, tamanoDerecho } from './geometria.js';
import { elegir, LADO_ELEGIR } from './automatico.js';
import { limpiar } from './limpiar.js';

/** The longest side a photo is kept at: more than a board needs, and 4 times less memory than a 50 MP photo. */
const LADO_FOTO = 4000;

const fotos = new Map();
// What «Automático» chose for each photo, with the corners and the board it chose for: cleaning it again (a stroke, a
// slider, saving it bigger) doesn't choose again.
const elegidos = new Map();

function elegido(id, foto, puntos, esquinas, tipo) {
  const clave = JSON.stringify([esquinas, tipo]);
  const ya = elegidos.get(id);
  if (ya?.clave === clave) return ya.elegido;
  const nuevo = elegir(enderezar(foto, puntos, tamanoDerecho(puntos, LADO_ELEGIR)), tipo);
  elegidos.set(id, { clave, elegido: nuevo });
  return nuevo;
}

async function abrir(id, archivo) {
  const crudo = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  const k = Math.min(1, LADO_FOTO / Math.max(crudo.width, crudo.height));
  const ancho = Math.max(1, Math.round(crudo.width * k));
  const alto = Math.max(1, Math.round(crudo.height * k));
  const lienzo = new OffscreenCanvas(ancho, alto);
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(crudo, 0, 0, ancho, alto);
  crudo.close();
  const foto = ctx.getImageData(0, 0, ancho, alto);
  fotos.set(id, foto);
  // The small copy, for where the board is.
  const kc = LADO_DETECTAR / Math.max(ancho, alto);
  const chico = new OffscreenCanvas(Math.max(1, Math.round(ancho * kc)), Math.max(1, Math.round(alto * kc)));
  const cc = chico.getContext('2d', { willReadFrequently: true });
  cc.drawImage(lienzo, 0, 0, chico.width, chico.height);
  return { ancho, alto, ...detectar(cc.getImageData(0, 0, chico.width, chico.height)) };
}

async function procesar(id, { esquinas, tipo, modo, tiza, intensidad, grosor, repasos, marcar, lado, calidad }) {
  const foto = fotos.get(id);
  if (!foto) throw new Error('La foto ya no está');
  const puntos = esquinas.map(({ x, y }) => ({ x: x * foto.width, y: y * foto.height }));
  // «Automático» on a chalk board: the way it chose, in place of the sliders.
  const auto = tiza === 'auto' && modo !== 'original' ? elegido(id, foto, puntos, esquinas, tipo) : null;
  const como = auto ?? { tiza, intensidad, grosor };
  const derecho = limpiar(enderezar(foto, puntos, tamanoDerecho(puntos, lado)), tipo, modo, { ...como, repasos, marcar });
  const lienzo = new OffscreenCanvas(derecho.width, derecho.height);
  lienzo.getContext('2d').putImageData(new ImageData(derecho.data, derecho.width, derecho.height), 0, 0);
  const blob = await lienzo.convertToBlob({ type: 'image/jpeg', quality: calidad });
  return { blob, ancho: derecho.width, alto: derecho.height, elegido: auto, marcados: Boolean(derecho.marcados) };
}

self.onmessage = async ({ data }) => {
  const { n, que, id } = data;
  try {
    let r = null;
    if (que === 'abrir') r = await abrir(id, data.archivo);
    else if (que === 'procesar') r = await procesar(id, data);
    else if (que === 'soltar') {
      fotos.delete(id);
      elegidos.delete(id);
    }
    self.postMessage({ n, ok: true, r });
  } catch (err) {
    self.postMessage({ n, ok: false, error: String(err?.message ?? err) });
  }
};
