// The text of a PowerPoint (.pptx), slide by slide, read in the browser without running anything of it: a .pptx is a ZIP
// of XML, and each slide's text is in its <a:t>. As El Santo Resumen shows one: only the text, without format or images.
import { unzipSync } from 'fflate';

const DIAPOSITIVA = /^ppt\/slides\/slide(\d{1,4})\.xml$/;
// A ZIP that unpacks to far more than a presentation's text is left alone.
const TOPE_XML = 40 * 1024 * 1024;
const TOPE_DIAPOSITIVAS = 500;

/** [{ numero, parrafos: [texto] }] in order, or throws if it isn't a PowerPoint. */
export function textoDePresentacion(bytes) {
  let total = 0;
  const archivos = unzipSync(new Uint8Array(bytes), {
    filter: (f) => {
      if (!DIAPOSITIVA.test(f.name)) return false;
      total += f.originalSize;
      return total <= TOPE_XML;
    },
  });
  const nombres = Object.keys(archivos)
    .map((n) => ({ n, numero: Number(DIAPOSITIVA.exec(n)[1]) }))
    .sort((a, b) => a.numero - b.numero)
    .slice(0, TOPE_DIAPOSITIVAS);
  if (!nombres.length) throw new Error('sin diapositivas');
  const lector = new TextDecoder();
  return nombres.map(({ n, numero }) => {
    const xml = new DOMParser().parseFromString(lector.decode(archivos[n]), 'application/xml');
    const parrafos = [...xml.getElementsByTagNameNS('*', 'p')]
      .map((p) => [...p.getElementsByTagNameNS('*', 't')].map((t) => t.textContent).join('').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return { numero, parrafos };
  });
}
