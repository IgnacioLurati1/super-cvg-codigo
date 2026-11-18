// Printing a PDF drawn here, also on a phone that has no PDF viewer: each page becomes a picture on a sheet of its own,
// in a part of the page that only the printer sees (lector.css). It goes away after printing, or when the reader closes.

// Every page is in memory at once until the print is done: with many pages, each one gets fewer pixels.
const PIXELES = 8_000_000;
const PIXELES_MINIMO = 3_000_000;
const PIXELES_EN_TOTAL = 240_000_000;
/** More pages than this, the reader asks before preparing them: it takes long, and a phone can hang. */
export const MUCHAS_PARA_IMPRIMIR = 40;

/** Prepares every page and opens the browser's print. Returns how to clean up. `alAvanzar(n, total)` while drawing. */
export async function imprimir(pdf, { alAvanzar, senal }) {
  const caja = document.createElement('div');
  caja.className = 'impresion';
  const urls = [];
  const limpiar = () => {
    caja.remove();
    for (const u of urls) URL.revokeObjectURL(u);
    urls.length = 0;
  };
  const porHoja = Math.max(PIXELES_MINIMO, Math.min(PIXELES, PIXELES_EN_TOTAL / pdf.numPages));
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (senal.aborted) throw new DOMException('Cancelado', 'AbortError');
      alAvanzar(n, pdf.numPages);
      const hoja = await pdf.getPage(n);
      const uno = hoja.getViewport({ scale: 1 });
      const vista = hoja.getViewport({ scale: Math.min(2.2, Math.sqrt(porHoja / (uno.width * uno.height))) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vista.width);
      canvas.height = Math.floor(vista.height);
      await hoja.render({ canvas, viewport: vista }).promise;
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.92));
      canvas.width = 0;
      // What pdf.js kept to draw it: the picture is enough now.
      hoja.cleanup();
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      caja.append(img);
    }
    document.body.append(caja);
    // One at a time: all at once is every page uncompressed in memory together.
    for (const img of caja.querySelectorAll('img')) {
      if (senal.aborted) break;
      await img.decode().catch(() => {});
    }
    if (senal.aborted) throw new DOMException('Cancelado', 'AbortError');
  } catch (e) {
    limpiar();
    throw e;
  }
  const despues = () => {
    window.removeEventListener('afterprint', despues);
    limpiar();
  };
  window.addEventListener('afterprint', despues);
  window.print();
  return despues;
}
