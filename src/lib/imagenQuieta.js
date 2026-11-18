import { useEffect, useState } from 'react';
import { useAjustes } from './ajustes';

// «Sensible a la luz» (ajustes.luz): an animated picture (GIF, WebP, PNG or AVIF) shows still, on its first frame, and
// moves only when the student asks. The first frame is drawn here, in a canvas of this browser: the picture goes
// nowhere. Read from its own bytes, never from the network.

const ascii = (b, desde, cuantos) => String.fromCharCode(...b.subarray(desde, desde + cuantos));
const largo32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;

// A GIF with more than one image in it. Walks its blocks: the header, the color tables, the extensions and each image
// with its data, until the end or a second image.
function gifAnimado(b) {
  let i = 13;
  if (b[10] & 0x80) i += 3 * 2 ** ((b[10] & 0x07) + 1);
  let imagenes = 0;
  const saltarSubbloques = () => {
    while (i < b.length && b[i] !== 0) i += b[i] + 1;
    i += 1;
  };
  while (i < b.length) {
    const bloque = b[i];
    if (bloque === 0x3b) break;
    if (bloque === 0x21) {
      i += 2;
      saltarSubbloques();
    } else if (bloque === 0x2c) {
      imagenes += 1;
      if (imagenes > 1) return true;
      const empaque = b[i + 9];
      i += 10;
      if (empaque & 0x80) i += 3 * 2 ** ((empaque & 0x07) + 1);
      i += 1;
      saltarSubbloques();
    } else {
      break;
    }
  }
  return false;
}

// A PNG with an animation chunk (APNG) before its image data.
function pngAnimado(b) {
  let i = 8;
  while (i + 8 <= b.length) {
    const tipo = ascii(b, i + 4, 4);
    if (tipo === 'acTL') return true;
    if (tipo === 'IDAT' || tipo === 'IEND') return false;
    i += 12 + largo32(b, i);
  }
  return false;
}

/** Whether the bytes of a picture are of an animated one. False for anything it can't read. */
export function esAnimada(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (b.length < 16) return false;
  if (ascii(b, 0, 4) === 'GIF8') return gifAnimado(b);
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return pngAnimado(b);
  // WebP: the extended header says it has an animation.
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return ascii(b, 12, 4) === 'VP8X' && b.length > 20 && Boolean(b[20] & 0x02);
  // AVIF: an image sequence says so among its brands.
  if (ascii(b, 4, 4) === 'ftyp') {
    const fin = Math.min(b.length, largo32(b, 0));
    for (let j = 8; j + 4 <= fin; j += 4) if (ascii(b, j, 4) === 'avis') return true;
  }
  return false;
}

/** The first frame of a picture as a PNG of its own (a data: address), or null when it can't be drawn. */
export async function primerCuadro(direccion) {
  const img = new Image();
  img.src = direccion;
  await img.decode();
  const lienzo = document.createElement('canvas');
  lienzo.width = img.naturalWidth || 1;
  lienzo.height = img.naturalHeight || 1;
  // Drawing an animated picture takes its first frame (or the one its format shows without animation).
  lienzo.getContext('2d').drawImage(img, 0, 0);
  return lienzo.toDataURL('image/png');
}

/**
 * The picture to show at `direccion`. Without «Sensible a la luz», as it is. With it, its first frame, still: `animada`
 * says whether it moves (from `blob`, its bytes: a Blob or an ArrayBuffer) and `alternar` lets it move or stops it again. Without `blob` (a
 * small picture with nothing to tap) it is always still. `src` is null while the frame is drawn, so nothing moves
 * before it.
 */
export function useImagenQuieta(direccion, blob = null) {
  const { luz } = useAjustes();
  const [quieta, setQuieta] = useState({ de: null, src: null, animada: false });
  // The picture the student set moving, by its address: another one starts still.
  const [moviendo, setMoviendo] = useState(null);

  useEffect(() => {
    if (!luz || !direccion) return undefined;
    let vivo = true;
    (async () => {
      const animada = blob ? esAnimada(blob instanceof Blob ? await blob.arrayBuffer() : blob) : true;
      // A still picture shows as it is; one that moves, or one whose bytes aren't at hand, through its first frame.
      const src = animada ? await primerCuadro(direccion).catch(() => null) : direccion;
      if (vivo) setQuieta({ de: direccion, src, animada: animada && Boolean(blob) && Boolean(src) });
    })().catch(() => vivo && setQuieta({ de: direccion, src: null, animada: false }));
    return () => {
      vivo = false;
    };
  }, [luz, direccion, blob]);

  if (!luz) return { src: direccion, animada: false, mover: false, alternar: () => {} };
  const lista = quieta.de === direccion;
  const mover = lista && quieta.animada && moviendo === direccion;
  return {
    src: lista ? (mover ? direccion : quieta.src) : null,
    animada: lista && quieta.animada,
    mover,
    alternar: () => setMoviendo((m) => (m === direccion ? null : direccion)),
  };
}
