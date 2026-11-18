// Code selected in a PDF, back to text that runs. The text layer of a PDF has each piece of a line in its place but
// not the spaces at its start: the indentation (which Python needs) comes back from how far right each line starts,
// measured in letters of that same code. What a PDF changes in passing (curly quotes, the long minus, ligatures, hard
// spaces) goes back to what a keyboard writes.

// By their codes: several of them look like a space, or like nothing.
const CAMBIOS = [
  [/[\u2018\u2019\u201a\u2032]/g, "'"],
  [/[\u201c\u201d\u201e\u2033]/g, '"'],
  [/[\u2010\u2011\u2012\u2013\u2212]/g, '-'],
  [/\ufb01/g, 'fi'],
  [/\ufb02/g, 'fl'],
  [/\ufb00/g, 'ff'],
  [/[\u00a0\u2002\u2003\u2007\u2009\u202f\u3000]/g, ' '],
  [/\u2026/g, '...'],
  [/\u200b|\u200c|\u200d|\ufeff|\u00ad/g, ''],
];

/** The code as a keyboard would have written it, without spaces at the end of its lines or blank lines around it. */
export function limpiarCodigo(texto) {
  let t = String(texto ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  for (const [de, a] of CAMBIOS) t = t.replace(de, a);
  const lineas = t.split('\n').map((l) => l.replace(/\s+$/, ''));
  while (lineas.length && !lineas[0].trim()) lineas.shift();
  while (lineas.length && !lineas.at(-1).trim()) lineas.pop();
  // What all lines share at their start goes: a block taken from the middle of something starts at the margin.
  const margen = Math.min(...lineas.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length));
  return lineas.map((l) => l.slice(Number.isFinite(margen) ? margen : 0)).join('\n');
}

const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/** The text of the pieces of a selection, each { x, y, ancho, alto, texto } in the same units (pixels of the screen),
 * in lines, with the indentation of each one. `pagina` keeps apart pieces of different pages. */
export function armarCodigo(piezas) {
  const validas = piezas.filter((p) => p && typeof p.texto === 'string' && p.texto.length && p.ancho > 0 && p.alto > 0);
  if (!validas.length) return '';
  // The width of one letter: what the pieces of this code measure per letter.
  const letra = mediana(validas.filter((p) => p.texto.trim().length >= 2).map((p) => p.ancho / p.texto.length)) || mediana(validas.map((p) => p.ancho / p.texto.length));
  const ordenadas = [...validas].sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0) || a.y + a.alto / 2 - (b.y + b.alto / 2) || a.x - b.x);
  const lineas = [];
  for (const p of ordenadas) {
    const medio = p.y + p.alto / 2;
    const ultima = lineas.at(-1);
    if (ultima && ultima.pagina === (p.pagina ?? 0) && Math.abs(ultima.medio - medio) < Math.min(ultima.alto, p.alto) / 2) ultima.piezas.push(p);
    else lineas.push({ pagina: p.pagina ?? 0, medio, alto: p.alto, piezas: [p] });
  }
  const izquierda = Math.min(...lineas.map((l) => Math.min(...l.piezas.map((p) => p.x))));
  const texto = lineas.map((l) => {
    const piezasDeLinea = [...l.piezas].sort((a, b) => a.x - b.x);
    const sangria = Math.max(0, Math.round((piezasDeLinea[0].x - izquierda) / letra));
    let linea = ' '.repeat(sangria) + piezasDeLinea[0].texto;
    for (let i = 1; i < piezasDeLinea.length; i += 1) {
      const antes = piezasDeLinea[i - 1];
      const hueco = piezasDeLinea[i].x - (antes.x + antes.ancho);
      const espacios = hueco > letra * 0.4 ? Math.max(1, Math.round(hueco / letra)) : 0;
      linea += (/\s$/.test(linea) || /^\s/.test(piezasDeLinea[i].texto) ? '' : ' '.repeat(espacios)) + piezasDeLinea[i].texto;
    }
    return linea;
  });
  return limpiarCodigo(texto.join('\n'));
}
