// What every engine takes from a project: the names of its files and how much it may bring (cMotor.js, pyProyecto.js).

// What a project may bring: its files and their bytes.
export const TOPE_PROYECTO = { archivos: 200, bytes: 16 * 1024 * 1024 };

/** A name for a file of the project, or null: folders with `/` (up to four), without `..`, a `/` at the start, `\` or
 * control characters. */
export function nombreDeArchivo(nombre) {
  const n = String(nombre ?? '');
  // eslint-disable-next-line no-control-regex
  if (!n || n.length > 200 || /[\\\u0000-\u001f\u007f]/.test(n)) return null;
  const partes = n.split('/');
  if (partes.length > 5 || partes.some((p) => !p.trim() || p === '.' || p === '..' || p.length > 80)) return null;
  return n;
}

/** The contents of a file as bytes (text, bytes or an ArrayBuffer), or null. */
export function bytesDe(c) {
  if (typeof c === 'string') return new TextEncoder().encode(c);
  if (c instanceof Uint8Array) return c;
  if (c instanceof ArrayBuffer) return new Uint8Array(c);
  return null;
}
