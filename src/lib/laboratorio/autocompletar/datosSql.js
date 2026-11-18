// What the autocomplete of SQL knows without the database: the words of SQLite and its functions, each one with how
// it's called.

export const CLAVES_SQL = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'GLOB', 'BETWEEN', 'EXISTS', 'AS', 'DISTINCT',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'OUTER',
  'CROSS', 'NATURAL', 'ON', 'USING', 'UNION', 'ALL', 'INTERSECT', 'EXCEPT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET',
  'DELETE', 'CREATE', 'TABLE', 'VIEW', 'INDEX', 'UNIQUE', 'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DROP', 'ALTER',
  'ADD', 'COLUMN', 'RENAME', 'TO', 'DEFAULT', 'CHECK', 'CONSTRAINT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'CAST',
  'INTEGER', 'TEXT', 'REAL', 'NUMERIC', 'BLOB', 'IF', 'WITH', 'RECURSIVE', 'TRIGGER', 'BEGIN', 'COMMIT', 'ROLLBACK',
  'TRANSACTION', 'AUTOINCREMENT', 'CASCADE', 'RESTRICT', 'COLLATE', 'NOCASE', 'ESCAPE', 'OVER', 'PARTITION BY', 'PRAGMA',
  'EXPLAIN', 'TRUE', 'FALSE',
];

export const FUNCIONES_SQL = [
  'COUNT(x)', 'SUM(x)', 'AVG(x)', 'MIN(x, ...)', 'MAX(x, ...)', 'TOTAL(x)', 'GROUP_CONCAT(x, separador)',
  'ABS(x)', 'ROUND(x, decimales)', 'RANDOM()', 'SIGN(x)',
  'LENGTH(texto)', 'LOWER(texto)', 'UPPER(texto)', 'TRIM(texto, caracteres)', 'LTRIM(texto, caracteres)',
  'RTRIM(texto, caracteres)', 'SUBSTR(texto, desde, largo)', 'REPLACE(texto, buscado, nuevo)', 'INSTR(texto, buscado)',
  'PRINTF(formato, ...)', 'FORMAT(formato, ...)', 'CHAR(codigo, ...)', 'UNICODE(texto)', 'QUOTE(x)', 'HEX(x)',
  'COALESCE(x, y, ...)', 'IFNULL(x, y)', 'NULLIF(x, y)', 'IIF(condicion, si, no)', 'TYPEOF(x)',
  'DATE(fecha, modificadores...)', 'TIME(fecha, modificadores...)', 'DATETIME(fecha, modificadores...)',
  'JULIANDAY(fecha, modificadores...)', 'STRFTIME(formato, fecha, modificadores...)', 'UNIXEPOCH(fecha)',
  'LAST_INSERT_ROWID()', 'CHANGES()',
  'ROW_NUMBER()', 'RANK()', 'DENSE_RANK()', 'NTILE(n)', 'LAG(x, desplazamiento, defecto)',
  'LEAD(x, desplazamiento, defecto)', 'FIRST_VALUE(x)', 'LAST_VALUE(x)',
];
