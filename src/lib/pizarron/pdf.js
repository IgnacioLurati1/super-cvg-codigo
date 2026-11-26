// The photos of a class, in one PDF: a page per photo, and under each photo, invisible, the text the photo reader got
// out of it, line by line where it is. So the PDF is searched like any other (Buscar, Consultron, the reader's search).

/** The long side of each page, in points: an A4 lying down. */
const LADO_PAGINA = 842;

/** Keeps of a text only what the PDF's font can write (Latin letters, accents and the usual signs). */
export function escribible(texto, puede) {
  return [...String(texto ?? '')].map((c) => (puede.has(c.codePointAt(0)) ? c : c.trim() ? '?' : ' ')).join('').replace(/\s+/g, ' ').trim();
}

/**
 * The PDF, as bytes. `paginas`: [{ blob (JPEG), ancho, alto, lineas: [{ texto, x0, y0, x1, y1 } in fractions of the
 * photo] }].
 */
export async function armarPdf(paginas, { titulo = 'Pizarrón' } = {}) {
  const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(titulo);
  doc.setProducer('Super CVG');
  doc.setCreator('Super CVG');
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  const puede = new Set(letra.getCharacterSet());
  for (const p of paginas) {
    const foto = await doc.embedJpg(new Uint8Array(await p.blob.arrayBuffer()));
    const k = LADO_PAGINA / Math.max(p.ancho, p.alto);
    const W = p.ancho * k;
    const H = p.alto * k;
    const pagina = doc.addPage([W, H]);
    pagina.drawImage(foto, { x: 0, y: 0, width: W, height: H });
    for (const l of p.lineas ?? []) {
      const texto = escribible(l.texto, puede);
      if (!texto) continue;
      const ancho = (l.x1 - l.x0) * W;
      const alto = (l.y1 - l.y0) * H;
      const porAncho = ancho / Math.max(0.01, letra.widthOfTextAtSize(texto, 1));
      const tam = Math.max(1, Math.min(alto * 0.9, porAncho));
      pagina.drawText(texto, { x: l.x0 * W, y: H - l.y1 * H + alto * 0.15, size: tam, font: letra, opacity: 0 });
    }
  }
  return doc.save();
}
