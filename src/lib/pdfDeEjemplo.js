// A small PDF of plain text, built here: for the sample mode (/?demo=1, demoPdf.js) and the flow tests. Helvetica with
// the Windows letters, so accents and «ñ» come out as they are, one page per entry and, if the pages have a title, an
// index with them. Nothing of a real course, and nothing runs in it.

// How wide each letter of Helvetica is, in thousandths of the size. The rest, like an «n».
const ANCHOS = {
  ' ': 278, '!': 278, '"': 355, '%': 889, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
  ':': 278, ';': 278, '?': 556, '«': 556, '»': 556, '¿': 611, '¡': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556,
  r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778,
  R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
};
const DE_WINDOWS = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

const sinTilde = (c) => c.normalize('NFD')[0];
const anchoDe = (texto, tamano, negrita) => [...texto].reduce((n, c) => n + (ANCHOS[c] ?? ANCHOS[sinTilde(c)] ?? 556), 0) * (tamano / 1000) * (negrita ? 1.07 : 1);

function renglones(texto, tamano, maximo, negrita = false) {
  const salida = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const probado = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoDe(probado, tamano, negrita) > maximo) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = probado;
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

/** A PDF string: each letter as its byte in the Windows encoding, with «(», «)» and «\» escaped. */
function cadena(texto) {
  let salida = '(';
  for (const c of texto) {
    let codigo = DE_WINDOWS[c] ?? c.charCodeAt(0);
    if (codigo > 255) codigo = 63;
    const letra = String.fromCharCode(codigo);
    salida += letra === '(' || letra === ')' || letra === '\\' ? `\\${letra}` : letra;
  }
  return `${salida})`;
}

// A black square as a scanner saves it: a 64 by 64 image in CCITT G4. Each row is one bit (white, like the row above),
// and /Decode turns the white into black. pdf.js draws it only with its WebAssembly decoder (opcionesPdf.js).
const ESCANEO = '\xff'.repeat(8);

/** The bytes of a PDF. `paginas`: [{ titulo, parrafos: [text], codigo: [line], dibujo, escaneo }], where `dibujo` is drawing as it goes
 * in a page (shapes, colors) before the text, and `escaneo` [x, y, side] puts a scanned black square there. */
export function armarPdf(paginas, { ancho = 595, alto = 842, margen = 64, tamano = 11 } = {}) {
  const objetos = [];
  // The number of the new object.
  const nuevo = (cuerpo) => objetos.push(cuerpo);
  const catalogo = nuevo(null);
  const arbol = nuevo(null);
  const normal = nuevo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const negrita = nuevo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const fija = nuevo('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const hojas = [];
  for (const pagina of paginas) {
    const lineas = [];
    let y = alto - margen;
    if (pagina.titulo) {
      for (const r of renglones(pagina.titulo, 18, ancho - 2 * margen, true)) {
        lineas.push(`BT /F2 18 Tf ${margen} ${y.toFixed(1)} Td ${cadena(r)} Tj ET`);
        y -= 24;
      }
      y -= 12;
    }
    for (const parrafo of pagina.parrafos ?? []) {
      const rs = renglones(parrafo, tamano, ancho - 2 * margen);
      if (rs.length) lineas.push(`BT /F1 ${tamano} Tf ${margen} ${y.toFixed(1)} Td ${(tamano * 1.45).toFixed(1)} TL ${rs.map(cadena).join(' Tj T* ')} Tj ET`);
      y -= rs.length * tamano * 1.45 + tamano * 0.8;
    }
    // Code in Courier, one line per row. Like most PDFs of a course, the indentation is where each line starts and not
    // spaces in its text, which is what the lab has to put back.
    for (const linea of pagina.codigo ?? []) {
      const sangria = linea.length - linea.trimStart().length;
      if (linea.trim()) lineas.push(`BT /F3 ${tamano} Tf ${(margen + sangria * tamano * 0.6).toFixed(1)} ${y.toFixed(1)} Td ${cadena(linea.trim())} Tj ET`);
      y -= tamano * 1.4;
    }
    let imagen = '';
    let escaneo = '';
    if (pagina.escaneo) {
      const [x, y, lado] = pagina.escaneo;
      const id = nuevo(`<< /Type /XObject /Subtype /Image /Width 64 /Height 64 /BitsPerComponent 1 /ColorSpace /DeviceGray /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns 64 /Rows 64 /EndOfBlock false >> /Decode [1 0] /Length ${ESCANEO.length} >>\nstream\n${ESCANEO}\nendstream`);
      imagen = ` /XObject << /Im1 ${id} 0 R >>`;
      escaneo = `q ${lado} 0 0 ${lado} ${x} ${y} cm /Im1 Do Q\n`;
    }
    const contenido = `${pagina.dibujo ? `${pagina.dibujo}\n` : ''}${escaneo}${lineas.join('\n')}`;
    const flujo = nuevo(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`);
    hojas.push(nuevo(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /Font << /F1 ${normal} 0 R /F2 ${negrita} 0 R /F3 ${fija} 0 R >>${imagen} >> /Contents ${flujo} 0 R >>`));
  }
  // The index: one entry per page with a title, pointing at its top.
  const conTitulo = paginas.map((p, i) => ({ titulo: p.titulo, hoja: hojas[i] })).filter((p) => p.titulo);
  let indice = '';
  if (conTitulo.length) {
    const raiz = nuevo(null);
    const entradas = conTitulo.map(() => nuevo(null));
    conTitulo.forEach((p, i) => {
      const vecinos = `${i > 0 ? ` /Prev ${entradas[i - 1]} 0 R` : ''}${i < entradas.length - 1 ? ` /Next ${entradas[i + 1]} 0 R` : ''}`;
      objetos[entradas[i] - 1] = `<< /Title ${cadena(p.titulo)} /Parent ${raiz} 0 R /Dest [${p.hoja} 0 R /XYZ 0 ${alto} 0]${vecinos} >>`;
    });
    objetos[raiz - 1] = `<< /Type /Outlines /First ${entradas[0]} 0 R /Last ${entradas.at(-1)} 0 R /Count ${entradas.length} >>`;
    indice = ` /Outlines ${raiz} 0 R`;
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R${indice} >>`;
  objetos[arbol - 1] = `<< /Type /Pages /Kids [${hojas.map((h) => `${h} 0 R`).join(' ')}] /Count ${hojas.length} >>`;

  let salida = '%PDF-1.4\n';
  const posiciones = objetos.map((cuerpo, i) => {
    const posicion = salida.length;
    salida += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
    return posicion;
  });
  const xref = salida.length;
  salida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posiciones.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('')}`;
  salida += `trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(salida, (c) => c.charCodeAt(0));
}
