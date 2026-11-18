// @vitest-environment node
// What SQLite says when a statement fails, in the student's words: each statement is run broken by the real SQLite
// (sql.js, as the worker uses it) and its message goes through explicarSql as the page does.
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { enCriollo } from './mensajes';
import { explicarSql } from './sqlMensajes';

let db;
beforeAll(async () => {
  const SQL = await initSqlJs();
  db = new SQL.Database();
  db.run(`PRAGMA foreign_keys = ON;
CREATE TABLE t (a INT, b INT);
CREATE TABLE u (id INT PRIMARY KEY, n TEXT);
INSERT INTO u VALUES (1, 'x');
CREATE TABLE n (a INT NOT NULL, b INT);
CREATE TABLE p (id INTEGER PRIMARY KEY, nombre TEXT);
INSERT INTO p VALUES (1, 'a');
CREATE TABLE h (id INTEGER PRIMARY KEY, p_id INT REFERENCES p(id));
CREATE TABLE c (v INT CHECK (v > 0));
CREATE TABLE pk2 (a INT, b INT, PRIMARY KEY (a, b));
INSERT INTO pk2 VALUES (1, 1);
CREATE TABLE i (x INTEGER PRIMARY KEY);`);
});

/** What the console shows for a statement that fails: the translation and, under it, what SQLite said. */
function dicho(sql) {
  try {
    db.exec(sql);
  } catch (e) {
    return { original: String(e.message), dicho: explicarSql(String(e.message)) };
  }
  throw new Error(`No falló: ${sql}`);
}
const que = (sql) => dicho(sql).dicho;

describe('los errores de SQL, en criollo', () => {
  it('la sintaxis', () => {
    expect(que('SELECT * FORM t')).toBe('Algo está mal escrito cerca de `FORM`. Fijate esa palabra y también lo de justo antes, por si falta una coma o está mal escrita una palabra como `SELECT` o `FROM`.\nMensaje original: near "FORM": syntax error');
    expect(que('SELEC * FROM t')).toMatch(/cerca de `SELEC`/);
    expect(que('SELECT * FROM')).toMatch(/^La consulta está incompleta\./);
    expect(que('INSERT INTO t VALUES (1')).toMatch(/^La consulta está incompleta\. .*\nMensaje original: incomplete input$/);
    expect(que("SELECT 'abc")).toMatch(/^Falta cerrar las comillas de un texto\./);
    expect(que('SELECT # FROM t')).toMatch(/^SQL no entiende el símbolo `#`\./);
  });

  it('lo que no existe', () => {
    expect(que('SELECT * FROM nada')).toMatch(/^No existe la tabla `nada`\. Fijate cómo se escribe y que la hayas creado antes con `CREATE TABLE`\.\nMensaje original: no such table: nada$/);
    expect(que('SELECT zzz FROM t')).toMatch(/^No existe la columna `zzz`\. Fijate cómo se escribe y que sea de una de las tablas del `FROM`\./);
    expect(que('SELECT t.zzz FROM t')).toMatch(/No existe la columna `t\.zzz`/);
    expect(que('ALTER TABLE t DROP COLUMN zz')).toMatch(/No existe la columna `zz`\./);
    expect(que('INSERT INTO t (zzz) VALUES (1)')).toMatch(/^La tabla `t` no tiene una columna `zzz`\./);
    expect(que('SELECT foo(1)')).toMatch(/^No existe la función `foo\(\)`\./);
    expect(que('DROP INDEX nada')).toMatch(/^No existe el índice `nada`\./);
    expect(que('DROP VIEW nada')).toMatch(/^No existe la vista `nada`\./);
    expect(que('CREATE TRIGGER tr AFTER INSERT ON nada BEGIN SELECT 1; END')).toMatch(/^No existe la tabla `nada`\./);
    expect(que('SELECT id FROM p JOIN h ON p.id = h.p_id')).toMatch(/^La columna `id` está en más de una tabla y SQL no sabe cuál querés\. Escribila con la tabla adelante, como `tabla\.id`\./);
  });

  it('lo que la tabla no deja', () => {
    expect(que("INSERT INTO u VALUES (1, 'a')")).toMatch(/^Ya existe una fila de `u` con ese valor en `id`, y ahí no pueden repetirse\./);
    expect(que('INSERT INTO pk2 VALUES (1, 1)')).toMatch(/^Ya existe una fila de `pk2` con esa combinación de `a` y `b`, y no pueden repetirse\./);
    expect(que('INSERT INTO n (a) VALUES (NULL)')).toMatch(/^La columna `a` de `n` no puede quedar vacía \(`NULL`\) y no le diste un valor\.\nMensaje original: NOT NULL constraint failed: n\.a$/);
    expect(que('INSERT INTO n (b) VALUES (1)')).toMatch(/^La columna `a` de `n` no puede quedar vacía/);
    expect(que('INSERT INTO h VALUES (1, 99)')).toMatch(/^Ese valor apunta a una fila que no existe en la otra tabla/);
    expect(que('INSERT INTO c VALUES (-1)')).toMatch(/^El valor no cumple la condición `v > 0` que pide la tabla\./);
    expect(que('INSERT INTO i VALUES ("a")')).toMatch(/^Un valor no es del tipo que se espera\./);
    expect(que('CREATE TABLE t (a INT)')).toMatch(/^Ya existe la tabla `t`\. Usá otro nombre, o `CREATE TABLE IF NOT EXISTS`/);
    expect(que('ALTER TABLE t ADD COLUMN a INT')).toMatch(/^La columna `a` está repetida\./);
    expect(que('CREATE TABLE p3 (a INT PRIMARY KEY, b INT PRIMARY KEY)')).toMatch(/^La tabla `p3` tiene más de una clave primaria/);
  });

  it('los valores, las consultas y las transacciones', () => {
    expect(que('INSERT INTO t VALUES (1, 2, 3, 4, 5, 6, 7)')).toMatch(/^La tabla `t` tiene 2 columnas y le diste 7 valores\./);
    expect(que('INSERT INTO p VALUES (1)')).toMatch(/^La tabla `p` tiene 2 columnas y le diste 1 valor\./);
    expect(que('INSERT INTO p (id, nombre) VALUES (1)')).toMatch(/^Nombraste 2 columnas y diste 1 valor\./);
    expect(que("INSERT INTO p VALUES (1, 'a'), (2)")).toMatch(/^Todas las filas de `VALUES`/);
    expect(que('SELECT * FROM t WHERE a IN (SELECT a, b FROM t)')).toMatch(/^Una subconsulta devuelve 2 columnas y ahí se espera 1\./);
    expect(que('SELECT 1, 2 UNION SELECT 1')).toMatch(/^Los dos `SELECT` de un `UNION` tienen que devolver la misma cantidad de columnas\./);
    expect(que('SELECT * FROM t ORDER BY 9')).toMatch(/^Ese `ORDER BY` usa un número de columna que no existe\. Tiene que ir del 1 al 2\./);
    expect(que('SELECT * FROM t JOIN h USING (zzz)')).toMatch(/^La columna `zzz` del `USING` tiene que estar en las dos tablas\./);
    expect(que('SELECT *')).toMatch(/^`SELECT \*` necesita un `FROM`/);
    expect(que('SELECT length()')).toMatch(/^`length\(\)` no recibe esa cantidad de argumentos\./);
    expect(que('SELECT * FROM t WHERE sum(a) > 1')).toMatch(/^No se puede usar `sum\(\)` ahí\./);
    expect(que('SELECT a FROM t HAVING a > 1')).toMatch(/^`HAVING` va con `GROUP BY`/);
    expect(que('COMMIT')).toMatch(/^No hay ninguna transacción abierta para hacer `COMMIT`\./);
    expect(que('BEGIN; BEGIN')).toMatch(/^Ya hay una transacción abierta\./);
    expect(que('ROLLBACK TO x')).toMatch(/^No existe el punto de guardado `x`\./);
  });

  it('lo que no se conoce queda como viene, y el original siempre se puede leer', () => {
    expect(explicarSql('algo raro de SQLite')).toBe('algo raro de SQLite');
    expect(explicarSql('no-es-base')).toBe('no-es-base');
    expect(enCriollo('sql', null)).toBe(null);
    expect(enCriollo('sql', 'no such table: x')).toMatch(/\nMensaje original: no such table: x$/);
    for (const sql of ['SELECT * FROM nada', 'SELECT zzz FROM t', 'INSERT INTO u VALUES (1, "a")']) {
      const r = dicho(sql);
      expect(r.dicho.endsWith(`Mensaje original: ${r.original}`)).toBe(true);
    }
  });
});
