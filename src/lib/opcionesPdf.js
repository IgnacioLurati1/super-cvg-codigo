// How every PDF opens (the viewer, Buscar, the reader): besides the file, where pdf.js finds what it needs to draw any
// page. The decoders of scanned pages (WebAssembly), the standard fonts for a PDF that doesn't carry its own, the maps of
// Asian text and the color profile, all served by the site at /pdfjs/ (vite.config.js, recursosPdf). Without them a
// scanned page comes out blank. Never runs what a PDF carries.

const carpeta = (nombre) => new URL(`${import.meta.env.BASE_URL}pdfjs/${nombre}/`, globalThis.location?.href ?? 'http://localhost/').href;

/** The options of `getDocument` for these bytes; without them, for a file that comes by parts (VisorPdf.jsx). */
export function opcionesPdf(pdfjs, data) {
  return {
    ...(data ? { data } : {}),
    isEvalSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    wasmUrl: carpeta('wasm'),
    cMapUrl: carpeta('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: carpeta('standard_fonts'),
    iccUrl: carpeta('iccs'),
  };
}
