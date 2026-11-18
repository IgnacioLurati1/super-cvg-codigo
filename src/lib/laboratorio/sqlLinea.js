// Where an SQL error is, to mark its line in the editor. SQLite says which statement failed (the engine knows where it
// started) and, for a syntax error, the word it stumbled on: «near "FORM": syntax error».

const lineaEn = (texto, i) => texto.slice(0, Math.max(0, i)).split('\n').length;

/** Where the statement starting at `desde` really starts: past spaces and comments. */
export function comienzo(sql, desde = 0) {
  let i = desde;
  while (i < sql.length) {
    if (/\s/.test(sql[i])) i += 1;
    else if (sql.startsWith('--', i)) {
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? sql.length : fin + 1;
    } else if (sql.startsWith('/*', i)) {
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? sql.length : fin + 2;
    } else break;
  }
  return i;
}

/** Where the statement starting at `desde` ends: its «;» outside of quotes and comments, or the end. */
export function final(sql, desde = 0) {
  let comilla = null;
  for (let i = desde; i < sql.length; i += 1) {
    const c = sql[i];
    if (comilla) {
      if (c === comilla) comilla = null;
    } else if (c === "'" || c === '"' || c === '`') comilla = c;
    else if (c === '[') comilla = ']';
    else if (sql.startsWith('--', i)) {
      const fin = sql.indexOf('\n', i);
      if (fin === -1) return sql.length;
      i = fin;
    } else if (sql.startsWith('/*', i)) {
      const fin = sql.indexOf('*/', i + 2);
      if (fin === -1) return sql.length;
      i = fin + 1;
    } else if (c === ';') return i + 1;
  }
  return sql.length;
}

/** The line (from 1) of the error `mensaje` of the statement that starts at `desde` in `sql`. */
export function lineaDelError(sql, desde, mensaje) {
  const inicio = comienzo(sql, desde);
  if (inicio >= sql.length) return lineaEn(sql, sql.trimEnd().length);
  const fin = final(sql, inicio);
  const sentencia = sql.slice(inicio, fin);
  const cerca = /(?:near|unrecognized token:) "((?:[^"]|"")*)"/.exec(String(mensaje ?? ''))?.[1]?.replace(/""/g, '"');
  if (cerca) {
    const i = sentencia.toLowerCase().indexOf(cerca.toLowerCase());
    if (i !== -1) return lineaEn(sql, inicio + i);
  }
  // Something left open: the statement goes on to the end, and that's where SQLite noticed.
  if (/incomplete input/.test(String(mensaje ?? ''))) return lineaEn(sql, inicio + sentencia.trimEnd().length);
  return lineaEn(sql, inicio);
}
