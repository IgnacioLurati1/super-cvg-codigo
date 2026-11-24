// The photos the student attached, for Gemini to look at them (nube.js): only with «Usar Gemini» and only with the
// question they go with. Each one shrinks here to a JPEG of at most LADO pixels on its longest side, about 200 KB,
// and goes in base64 (the service takes up to 3 of up to MAX_FOTO letters, reglas.ts of supercvg-consultron).
// Nothing is kept: they're made for that question and let go.

export const LADO = 1280;
export const MAX_FOTOS = 3;
export const MAX_FOTO = 1_000_000;
const CALIDAD = 0.8;

/** The photos of the pieces of a question: the attachments that are photos, each once, up to MAX_FOTOS. */
export function fotosDe(elegidos) {
  const vistas = new Set();
  const fotos = [];
  for (const e of elegidos ?? []) {
    const f = e?.trozo?.fuente;
    if (f?.tipo !== 'adjunto' || f.clase !== 'foto' || !f.archivo || vistas.has(f.adjunto)) continue;
    vistas.add(f.adjunto);
    fotos.push(f.archivo);
    if (fotos.length === MAX_FOTOS) break;
  }
  return fotos;
}

async function base64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

/** One photo as the service takes it ({ mime, datos }), or null if this browser can't draw it or it's still too big.
 * Transparent parts go white, as on paper. */
export async function fotoParaGemini(archivo) {
  try {
    const imagen = await createImageBitmap(archivo);
    const escala = Math.min(1, LADO / Math.max(imagen.width, imagen.height));
    const ancho = Math.max(1, Math.round(imagen.width * escala));
    const alto = Math.max(1, Math.round(imagen.height * escala));
    const lienzo = typeof OffscreenCanvas === 'undefined' ? Object.assign(document.createElement('canvas'), { width: ancho, height: alto }) : new OffscreenCanvas(ancho, alto);
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(imagen, 0, 0, ancho, alto);
    imagen.close?.();
    const blob = lienzo.convertToBlob
      ? await lienzo.convertToBlob({ type: 'image/jpeg', quality: CALIDAD })
      : await new Promise((listo) => lienzo.toBlob(listo, 'image/jpeg', CALIDAD));
    if (!blob) return null;
    const datos = await base64(blob);
    return datos.length <= MAX_FOTO ? { mime: 'image/jpeg', datos } : null;
  } catch {
    return null;
  }
}

/** All of them, without the ones that couldn't be made. `hacer`: how each one is made, for the tests. */
export async function fotosParaGemini(archivos, hacer = fotoParaGemini) {
  const hechas = await Promise.all((archivos ?? []).slice(0, MAX_FOTOS).map((a) => hacer(a)));
  return hechas.filter(Boolean);
}
