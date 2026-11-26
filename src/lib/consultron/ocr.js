// Consultron's reader of photos. The model reads only text, so the text of a photo comes out here, with tesseract.js, in
// this browser. Its worker, its core (Tesseract in WebAssembly) and the Spanish and English data come from the site
// (/motores/ocr/, vite.config.js), never from outside. Its worker starts from a `blob:`, so it carries the page's CSP.
// Nothing of what it reads goes to disk: not even its data in IndexedDB (`cacheMethod: 'none'`), the browser's cache
// keeps the files. One worker for the tab, made with the first photo: after a minute without photos it goes, and its
// memory with it.

const IDIOMAS = ['spa', 'eng'];
const SUELTO_MS = 60_000;
// Loading takes a few seconds and downloads about 9 MB the first time: past this, something is wrong.
const CARGA_MS = 120_000;
/** The longest side a photo is read at: a phone's photo is twice that and reads the same, in a quarter of the time. */
export const LADO_MAX = 2400;
// Smaller than this (a cut of a screen), it's read twice as big: Tesseract reads small letters badly.
const LADO_MIN = 1000;
/** Below this mean confidence (0 to 100) what came out is noise, not text: handwriting, a blurred photo. */
export const CONFIANZA_MIN = 30;
// A line that goes in a PDF of the board: below this it is noise read in a drawing or a scribble.
const CONFIANZA_LINEA = 55;

const del = (archivo) => new URL(`${import.meta.env.BASE_URL}motores/ocr/${archivo}`, window.location.href).href;

let trabajador = null;
let cola = Promise.resolve();
let suelto = null;
// Who hears the progress of the photo being read now.
let oyente = null;

function crear() {
  return new Promise((listo, falla) => {
    let hecho = false;
    // A data file that doesn't load leaves tesseract.js waiting forever: this and the handler say it.
    const tope = setTimeout(() => falla(new Error('El lector de fotos no cargó')), CARGA_MS);
    const terminar = (f) => (v) => {
      clearTimeout(tope);
      if (!hecho) f(v);
      hecho = true;
    };
    import('tesseract.js')
      .then((t) =>
        (t.createWorker ?? t.default.createWorker)(IDIOMAS, 1, {
          workerPath: del('worker.min.js'),
          // A folder: it takes the build of the core this browser can run.
          corePath: del(''),
          langPath: del(''),
          cacheMethod: 'none',
          logger: (m) => oyente?.(m),
          errorHandler: (e) => terminar(falla)(new Error(String(e))),
        }),
      )
      // With a resolution of its own, the reader doesn't guess it, nor writes «Estimating resolution» to the console.
      .then(async (w) => {
        await w.setParameters({ user_defined_dpi: '300' }).catch(() => {});
        return w;
      })
      .then(terminar(listo), terminar(falla));
  });
}

function soltarLuego() {
  clearTimeout(suelto);
  suelto = setTimeout(async () => {
    const t = trabajador;
    trabajador = null;
    (await t?.catch(() => null))?.terminate();
  }, SUELTO_MS);
}

/** The photo as Tesseract reads it best: standing as it was taken, not bigger than LADO_MAX nor too small, on white. */
export async function prepararFoto(archivo) {
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' });
  try {
    const lado = Math.max(imagen.width, imagen.height);
    const escala = lado > LADO_MAX ? LADO_MAX / lado : lado < LADO_MIN ? 2 : 1;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.max(1, Math.round(imagen.width * escala));
    lienzo.height = Math.max(1, Math.round(imagen.height * escala));
    const ctx = lienzo.getContext('2d');
    // A cut with transparency: its letters on white, not on black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    return await new Promise((listo, falla) => lienzo.toBlob((b) => (b ? listo(b) : falla(new Error('No se pudo preparar la foto'))), 'image/png'));
  } finally {
    imagen.close();
  }
}

/** The lines read with what they say and where they are, in fractions of the photo; the ones it's unsure of, out. */
async function lineasDe(data, imagen) {
  const medida = await createImageBitmap(imagen);
  const { width: W, height: H } = medida;
  medida.close();
  return (data.blocks ?? [])
    .flatMap((b) => b.paragraphs ?? [])
    .flatMap((p) => p.lines ?? [])
    .filter((l) => l.confidence >= CONFIANZA_LINEA && String(l.text ?? '').trim())
    .map(({ text, bbox }) => ({ texto: text.trim(), x0: bbox.x0 / W, y0: bbox.y0 / H, x1: bbox.x1 / W, y1: bbox.y1 / H }));
}

/**
 * The text of a photo, or '' if it has none it can read. With `lineas`, { texto, lineas } (lineasDe). One photo at a time. `alAvance({ fase, fraccion })`: 'preparando'
 * while the reader loads (the first time), 'leyendo' with how much is done. Throws if the photo can't be opened
 * (`motivo: 'foto'`) or the reader didn't load (`motivo: 'lector'`). `senal`: if aborted before its turn, it isn't read.
 */
export function leerFoto(archivo, { alAvance = () => {}, senal, lineas = false } = {}) {
  const turno = cola.then(async () => {
    if (senal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    clearTimeout(suelto);
    let imagen;
    try {
      imagen = await prepararFoto(archivo);
    } catch {
      throw Object.assign(new Error('No se pudo abrir la foto'), { motivo: 'foto' });
    }
    oyente = ({ status, progress }) => alAvance(status === 'recognizing text' ? { fase: 'leyendo', fraccion: progress ?? 0 } : { fase: 'preparando', fraccion: 0 });
    try {
      if (!trabajador) {
        alAvance({ fase: 'preparando', fraccion: 0 });
        trabajador = crear();
      }
      let ocr;
      try {
        ocr = await trabajador;
      } catch {
        trabajador = null;
        throw Object.assign(new Error('No cargó el lector de fotos'), { motivo: 'lector' });
      }
      const { data } = await ocr.recognize(imagen, { rotateAuto: true }, lineas ? { text: true, blocks: true } : undefined);
      const texto = String(data?.text ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const legible = (data?.confidence ?? 0) >= CONFIANZA_MIN;
      if (lineas) return { texto: legible ? texto : '', lineas: legible ? await lineasDe(data, imagen) : [] };
      if (!legible) return '';
      return texto;
    } finally {
      oyente = null;
      soltarLuego();
    }
  });
  // The next one waits for this one, whether it went well or not.
  cola = turno.catch(() => {});
  return turno;
}
