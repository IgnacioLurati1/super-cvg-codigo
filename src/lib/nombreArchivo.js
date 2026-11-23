// Apart from adjuntos.js, so the links of a message (temporales.js, on every page) don't bring Drive with them.
const LARGO_NOMBRE = 100;

/** A file name to upload and to show: nothing that hides or reorders letters (invisible marks, right-to-left
 * switches), no line breaks, no `<` or `>` (the campus would read them as HTML) and no slashes. Up to 100 letters,
 * keeping its ending. Never empty. */
export function sanearNombre(nombre) {
  let limpio = String(nombre ?? '')
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\p{Cf}/gu, '')
    .replace(/[<>]/g, '')
    .replace(/[/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const letras = [...limpio];
  if (letras.length > LARGO_NOMBRE) {
    const final = /\.[\p{L}\p{N}]{1,8}$/u.exec(limpio)?.[0] ?? '';
    limpio = `${letras.slice(0, LARGO_NOMBRE - [...final].length).join('').trimEnd()}${final}`;
  }
  return limpio && !/^[.\s-]*$/.test(limpio) ? limpio : 'archivo';
}
