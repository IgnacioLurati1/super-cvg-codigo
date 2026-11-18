// @vitest-environment node
// MySQL dumps into the SQL lab: the real ones of volcados/ (mysqldump 8.0.44 of a database made for this, with and
// without --hex-blob; the same database as phpMyAdmin 5.2 exports it from MariaDB; a script of Workbench's Forward
// Engineering), loaded with the real SQLite of the worker.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { deMysql, esMysql, resumenAfuera } from './mysql';
import { armarBase } from './sqlBase';

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const volcado = (nombre) => readFileSync(resolve(import.meta.dirname, 'volcados', nombre));
const utf8 = (nombre) => new TextDecoder('utf-8', { fatal: true }).decode(volcado(nombre));
// How tuBase.js reads a dump that isn't UTF-8: byte by byte.
const porBytes = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const cargar = (texto, crudo = false) => armarBase(SQL, { origen: { tipo: 'sql', nombre: 'volcado.sql', texto, ...(crudo ? { crudo } : {}) }, tablas: [] });
const valores = (db, sql) => db.exec(sql)[0]?.values ?? [];

// What the inmobiliaria of volcados/ has, whichever tool exported it.
function revisarInmobiliaria(db) {
  expect(valores(db, 'SELECT id, apellido, nombre, tipo, intereses, nota FROM persona ORDER BY id')).toEqual([
    [100, "O'Brien", 'Ana', 'cliente', 'casa,depto', 'Dice "ya vuelvo";\nllamar a la tarde'],
    [101, 'Pérez', 'Bruno', 'propietario', null, 'Ruta C:\\Docs\\contrato.pdf y un 50% de seña'],
    [102, 'Núñez', 'Carla 😀', 'inquilino', 'local', null],
    [103, "D'Alessandro", 'Diego', 'cliente', '', 'Tab\taquí -- no es comentario /* tampoco */ # ni esto'],
  ]);
  expect(valores(db, 'SELECT id, apta_credito, hex(foto), datos, round(precio_m2, 2) FROM propiedad ORDER BY id')).toEqual([
    [1, 1, '89504E470D0A1A0A', expect.stringMatching(/^\{"(ambientes|balcon)"/), 2637.36],
    [2, 0, '', null, 1166.67],
    [3, 0, '', '{"nota": "it\'s ok"}', null],
  ]);
  expect(valores(db, 'SELECT * FROM visita ORDER BY fecha_hora')).toEqual([
    [1, 100, '2026-03-01 10:30:00.250', 'Le gustó; vuelve el lunes'],
    [1, 102, '2026-03-02 18:00:00.000', null],
    [2, 103, '2026-04-10 09:15:00.000', 'Pidió \\ descuento'],
  ]);
  expect(valores(db, 'SELECT * FROM propiedades_en_oferta')).toEqual([[1, 'Córdoba 1234, 3° B', 'Centro', 120000]]);
  expect(valores(db, 'PRAGMA foreign_key_check')).toEqual([]);
  expect(valores(db, 'PRAGMA foreign_keys')[0][0]).toBe(1);
  // AUTO_INCREMENT goes on from where it was, the keys are there and the foreign keys hold.
  db.exec("INSERT INTO zona (nombre) VALUES ('Alberdi')");
  expect(valores(db, "SELECT id FROM zona WHERE nombre = 'Alberdi'")).toEqual([[5]]);
  expect(() => db.exec("INSERT INTO zona (nombre) VALUES ('Centro')")).toThrow(/UNIQUE constraint failed: zona.nombre/);
  expect(() => db.exec("INSERT INTO propiedad (direccion, id_zona, id_propietario, superficie) VALUES ('X 1', 99, 100, 10)")).toThrow(/FOREIGN KEY constraint failed/);
  expect(() => db.exec("INSERT INTO propiedad (direccion, id_zona, id_propietario, superficie) VALUES ('X 1', 1, 100, 0)")).toThrow(/CHECK constraint failed/);
  db.exec('DELETE FROM persona WHERE id = 100');
  expect(valores(db, 'SELECT count(*) FROM visita WHERE id_persona = 100')).toEqual([[0]]);
  const indices = valores(db, "SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name").flat();
  expect(indices).toEqual(expect.arrayContaining(['persona_idx_apellido', 'propiedad_fk_propiedad_zona', 'visita_fk_visita_persona']));
}

describe('un volcado de MySQL, a la base de SQLite', () => {
  it('mysqldump tal cual sale, con los blobs en bytes (no es UTF-8): se lee byte a byte y queda entero', () => {
    const bytes = volcado('mysqldump.sql');
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(bytes)).toThrow();
    const r = cargar(porBytes(bytes), true);
    expect(r.error).toBeUndefined();
    revisarInmobiliaria(r.db);
    expect(r.afuera.map((a) => [a.que, a.nombre])).toEqual([['disparador', 'persona_au'], ['función', 'precio_dolar'], ['procedimiento', 'visitas_de']]);
    expect(resumenAfuera(r.afuera)).toBe('Quedaron afuera 1 disparador, 1 función y 1 procedimiento de MySQL.');
    r.db.close();
  });

  it('mysqldump con --hex-blob, una fila por INSERT y sin comentarios', () => {
    const r = cargar(utf8('mysqldump-hex.sql'));
    expect(r.error).toBeUndefined();
    revisarInmobiliaria(r.db);
    expect(r.afuera.map((a) => a.que)).toEqual(['disparador']);
    r.db.close();
  });

  it('phpMyAdmin: las claves, los AUTO_INCREMENT y las foráneas que suma al final van en su CREATE TABLE', () => {
    const r = cargar(utf8('phpmyadmin.sql'));
    expect(r.error).toBeUndefined();
    revisarInmobiliaria(r.db);
    expect(r.afuera.map((a) => [a.que, a.nombre, a.linea])).toEqual([['procedimiento', 'visitas_de', 28], ['función', 'precio_dolar', 35], ['disparador', 'persona_au', 78]]);
    r.db.close();
  });

  it('Workbench: sin el esquema en los nombres, con DEFAULT en los VALUES y la vista con OR REPLACE', () => {
    const r = cargar(utf8('workbench.sql'));
    expect(r.error).toBeUndefined();
    expect(r.afuera).toEqual([]);
    expect(valores(r.db, 'SELECT * FROM carrera')).toEqual([[1, 'Ingeniería en Sistemas', 2023], [2, 'Ingeniería Civil', null]]);
    expect(valores(r.db, 'SELECT legajo, nombre, promedio, regular FROM alumno')).toEqual([[51234, "Ana O'Connor", 8.5, 1], [51235, 'Bruno Díaz', 0, 0]]);
    expect(valores(r.db, "SELECT count(*) FROM inscripcion WHERE fecha LIKE '____-__-__ __:__:__'")).toEqual([[2]]);
    expect(valores(r.db, 'SELECT * FROM regulares')).toEqual([[51234, "Ana O'Connor", 'Ingeniería en Sistemas']]);
    expect(valores(r.db, 'PRAGMA foreign_key_list(alumno)')[0].slice(2, 4)).toEqual(['carrera', 'carrera_idcarrera']);
    r.db.close();
  });

  it('si algo no entra, dice la línea del archivo', () => {
    const texto = `${utf8('phpmyadmin.sql')}\nINSERT INTO \`zona\` (\`id\`, \`nombre\`) VALUES\n(9, NULL);\n`;
    const r = cargar(texto);
    expect(r).toMatchObject({ error: 'NOT NULL constraint failed: zona.nombre', linea: texto.split('\n').length - 2 });
  });
});

describe('cómo se pasa cada cosa', () => {
  const sql = (texto) => deMysql(texto).sentencias.map((s) => s.sql);

  it('reconoce lo que es de MySQL, y deja un script de SQLite como está', () => {
    expect(esMysql('CREATE TABLE `a` (x INT);')).toBe(true);
    expect(esMysql('create table a (id int auto_increment primary key);')).toBe(true);
    expect(esMysql("SELECT 'O\\'Brien';")).toBe(true);
    expect(esMysql('/*!40101 SET NAMES utf8 */;')).toBe(true);
    expect(esMysql('# un comentario\nSELECT 1;')).toBe(true);
    expect(esMysql('CREATE TABLE a (x INTEGER PRIMARY KEY AUTOINCREMENT);\nINSERT INTO a VALUES (1);')).toBe(false);
    expect(esMysql('PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\nCREATE TABLE "a" (x);')).toBe(false);
  });

  it('textos con barras, comillas y punto y coma adentro', () => {
    expect(sql("INSERT INTO `t` VALUES ('a\\'b','c\\\\d','e;f','g\\nh',\"i'j\",'k''l', _utf8mb4'ñ', N'm');")).toEqual([
      "INSERT INTO \"t\" VALUES ('a''b','c\\d','e;f','g\nh','i''j','k''l', 'ñ', 'm');",
    ]);
  });

  it('INSERT IGNORE, REPLACE, INSERT sin INTO y números en hexadecimal o bits', () => {
    expect(sql("INSERT IGNORE INTO t VALUES (1);\nREPLACE INTO t VALUES (2);\nINSERT t VALUE (0x0A, b'101', X'ff');")).toEqual([
      'INSERT OR IGNORE INTO t VALUES (1);',
      'REPLACE INTO t VALUES (2);',
      "INSERT INTO t VALUES (X'0A', 5, X'ff');",
    ]);
  });

  it('una columna con AUTO_INCREMENT que es la clave, como INTEGER PRIMARY KEY AUTOINCREMENT; si la clave es de varias, no', () => {
    expect(sql('CREATE TABLE a (id int(11) NOT NULL AUTO_INCREMENT, PRIMARY KEY (id)) ENGINE=InnoDB AUTO_INCREMENT=7;')[0]).toBe('CREATE TABLE "a" (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT\n);');
    expect(sql('CREATE TABLE b (id INT AUTO_INCREMENT, n INT, PRIMARY KEY (id, n)) ENGINE=MyISAM;')[0]).toBe('CREATE TABLE "b" (\n  "id" INTEGER,\n  "n" INTEGER,\n  PRIMARY KEY ("id", "n")\n);');
    expect(sql('CREATE TABLE c (id SERIAL);')[0]).toContain('"id" INTEGER NOT NULL UNIQUE');
  });

  it('los tipos de MySQL, por su afinidad en SQLite', () => {
    const [crear] = sql("CREATE TABLE t (a TINYINT(1) UNSIGNED ZEROFILL, b DOUBLE PRECISION, c DECIMAL(10,2), d VARCHAR(20) BINARY, e ENUM('x','y'), f LONGBLOB, g JSON, h DATETIME(6) DEFAULT NOW(), i NATIONAL VARCHAR(5), j TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, k VARCHAR(10) DEFAULT (uuid()), l INT DEFAULT -1 COMMENT 'menos uno');");
    expect(crear).toBe('CREATE TABLE "t" (\n  "a" INTEGER,\n  "b" REAL,\n  "c" DECIMAL(10,2),\n  "d" VARCHAR(20),\n  "e" TEXT,\n  "f" BLOB,\n  "g" TEXT,\n  "h" DATETIME DEFAULT CURRENT_TIMESTAMP,\n  "i" VARCHAR(5),\n  "j" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n  "k" VARCHAR(10),\n  "l" INTEGER DEFAULT -1\n);');
  });

  it('dos tablas con un índice del mismo nombre no chocan, y un índice sobre una expresión queda afuera', () => {
    const r = deMysql('CREATE TABLE a (x INT, KEY idx (x));\nCREATE TABLE b (x INT, KEY idx (x));\nCREATE INDEX idx ON a (x);\nCREATE INDEX f ON a ((x + 1));');
    const indices = r.sentencias.map((s) => s.sql).filter((s) => s.startsWith('CREATE INDEX'));
    expect(indices.sort()).toEqual(['CREATE INDEX "a_idx" ON "a" ("x");', 'CREATE INDEX "a_idx_2" ON "a" ("x");', 'CREATE INDEX "b_idx" ON "b" ("x");']);
    expect(r.afuera).toEqual([{ que: 'índice sobre una expresión', nombre: 'f', linea: 4 }]);
  });

  it('ALTER TABLE: lo que suma va en su CREATE TABLE; ADD COLUMN de una tabla que no está queda como ALTER', () => {
    const r = deMysql('CREATE TABLE a (id INT NOT NULL, n VARCHAR(5));\nALTER TABLE a ADD PRIMARY KEY (id), ADD UNIQUE KEY u (n);\nALTER TABLE a MODIFY id INT NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;\nALTER TABLE a CHANGE n nombre VARCHAR(9);\nALTER TABLE otra ADD COLUMN x INT DEFAULT 0;\nALTER TABLE otra RENAME TO otra2;');
    expect(r.sentencias.map((s) => s.sql)).toEqual(['CREATE TABLE "a" (\n  "id" INTEGER PRIMARY KEY AUTOINCREMENT,\n  "nombre" VARCHAR(9),\n  UNIQUE ("nombre")\n);', 'ALTER TABLE "otra" ADD COLUMN "x" INTEGER DEFAULT 0;']);
    expect(r.afuera).toEqual([{ que: 'cambio de tabla', nombre: 'otra', linea: 6 }]);
  });

  it('las vistas sin ALGORITHM, DEFINER ni SQL SECURITY; las rutinas y los disparadores con DELIMITER, afuera', () => {
    const texto = 'CREATE OR REPLACE ALGORITHM=MERGE DEFINER=`u`@`%` SQL SECURITY INVOKER VIEW `v` (a) AS\n  SELECT 1 WITH CASCADED CHECK OPTION;\nDELIMITER //\nCREATE PROCEDURE p()\nBEGIN\n  SELECT 1;\nEND//\nCREATE EVENT e ON SCHEDULE EVERY 1 DAY DO DELETE FROM t//\nDELIMITER ;\nSELECT 2;';
    const r = deMysql(texto);
    expect(r.sentencias.map((s) => s.sql)).toEqual(['DROP VIEW IF EXISTS "v";\nCREATE VIEW "v" ( "a" ) AS SELECT 1;', 'SELECT 2;']);
    expect(r.afuera).toEqual([{ que: 'procedimiento', nombre: 'p', linea: 4 }, { que: 'evento', nombre: 'e', linea: 8 }]);
    expect(resumenAfuera(r.afuera)).toBe('Quedaron afuera 1 procedimiento y 1 evento de MySQL.');
    expect(resumenAfuera([{ que: 'disparador' }])).toBe('Quedó afuera 1 disparador de MySQL.');
    expect(resumenAfuera([])).toBe('');
  });

  it('lo que sale de una sesión (SET, LOCK, USE, transacciones) no queda; el resto, en su línea', () => {
    const r = deMysql("SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nLOCK TABLES `t` WRITE;\nUNLOCK TABLES;\nSTART TRANSACTION;\nCOMMIT;\nCREATE DATABASE IF NOT EXISTS `db`;\nUSE `db`;\n-- nada\nSELECT *\nFROM `db`.`t` # comentario\nWHERE x = 'a';");
    expect(r.sentencias).toEqual([{ sql: 'SELECT *\nFROM "t"  \nWHERE x = \'a\';', linea: 10, exacta: true }]);
  });

  it('GROUP_CONCAT con SEPARATOR y ORDER BY, como lo escribe SQLite', () => {
    expect(sql("SELECT GROUP_CONCAT(nombre ORDER BY nombre SEPARATOR '; ') FROM t;\nSELECT group_concat(x separator '-'), group_concat(DISTINCT y SEPARATOR '/') FROM t;")).toEqual([
      "SELECT GROUP_CONCAT(nombre , '; ' ORDER BY nombre ) FROM t;",
      "SELECT group_concat(x , '-' ), group_concat(DISTINCT y ) FROM t;",
    ]);
  });

  it('una vista que SQLite no toma queda afuera, y el resto se carga', () => {
    const r = cargar('CREATE TABLE `t` (`x` int);\nINSERT INTO `t` VALUES (1);\nCREATE VIEW `v` AS SELECT x FROM t LIMIT 1, 2, 3;\nCREATE VIEW `w` AS SELECT x FROM t;');
    expect(r.afuera).toEqual([{ que: 'vista', nombre: 'v', linea: 3 }]);
    expect(valores(r.db, 'SELECT * FROM w')).toEqual([[1]]);
    r.db.close();
  });

  it('ANSI_QUOTES: las comillas dobles son nombres', () => {
    expect(sql('SET sql_mode = \'ANSI_QUOTES\';\nINSERT INTO "t" VALUES (1);')).toEqual(['INSERT INTO "t" VALUES (1);']);
  });

  it('un volcado de MariaDB con su primera línea de modo seguro', () => {
    expect(sql('/*M!999999\\- enable the sandbox mode */ \n/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;\nCREATE TABLE `a` (`x` int(11) DEFAULT NULL) ENGINE=InnoDB;')).toEqual(['CREATE TABLE "a" (\n  "x" INTEGER DEFAULT NULL\n);']);
  });
});
