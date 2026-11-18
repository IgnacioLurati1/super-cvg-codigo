// @vitest-environment node
// A run of the editor of the SQL lab, as the worker does it (sql.worker.js), with the real SQLite (sql.js).
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { INSTRUMENTOS } from './der/instrumentos.fixture';
import { pasarATablas } from './der/pasaje';
import { crearSql } from './der/sql';
import { armarBase, esquemaDe } from './sqlBase';
import { codigoParaSqlite, correrEnBase, pistaDePractica } from './sqlCorrer';
import { revisarSql } from './sqlRevisar';

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

/** The practice database's worker, empty: { fin, mensajes, db }. */
function correr(codigo, db = armarBase(SQL, { origen: { tipo: 'sql', nombre: 'vacia.sql', texto: '' }, tablas: [] }).db) {
  const mensajes = [];
  const fin = correrEnBase(db, codigo, (m) => mensajes.push(m));
  return { fin, mensajes, db };
}

describe('correr el editor del laboratorio de SQL', () => {
  it('el script que crea «Crear SQL» desde el DER del alquiler de instrumentos corre, con sus tablas y claves foráneas', () => {
    const { sql } = crearSql(pasarATablas(INSTRUMENTOS));
    const { fin, mensajes, db } = correr(sql);
    expect(fin).toEqual({ error: null, linea: 0 });
    expect(mensajes.filter((m) => m.tipo === 'dialecto')).toEqual([]);
    // One `cambios` per CREATE TABLE, on the line where it starts in the file.
    const lineas = sql.split('\n').flatMap((l, i) => (l.startsWith('CREATE TABLE') ? [i + 1] : []));
    expect(mensajes.map((m) => [m.tipo, m.linea])).toEqual(lineas.map((l) => ['cambios', l]));
    const esquema = esquemaDe(db);
    expect(esquema).toHaveLength(14);
    expect(esquema.find((t) => t.nombre === 'prueba').foraneas).toEqual(
      expect.arrayContaining([{ tabla: 'vendedor_a_cargo', desde: ['id_vendedor', 'id_instrumento', 'fecha_hora_desde'], hacia: ['id_vendedor', 'id_instrumento', 'fecha_hora_desde'] }]),
    );
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([]);
    // The same text, checked while typing, has nothing to mark.
    expect(revisarSql(SQL, db, codigoParaSqlite(sql))).toEqual({ error: null, linea: 0 });
    db.close();
  });

  it('un CREATE de MySQL escrito a mano, con AUTO_INCREMENT: numera solo, y lo que sigue corre y dice su línea', () => {
    const codigo = [
      'CREATE TABLE `cliente` (',
      '  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,',
      '  `nombre` VARCHAR(45) NOT NULL,',
      '  PRIMARY KEY (`id`)',
      ') ENGINE=InnoDB;',
      '',
      "INSERT INTO `cliente` (`nombre`) VALUES ('Ana'), ('Bruno');",
      'SELECT id, nombre',
      '  FROM cliente ORDER BY id;',
      'SELECT * FROM no_esta;',
    ].join('\n');
    const { fin, mensajes, db } = correr(codigo);
    expect(mensajes.map((m) => [m.tipo, m.linea])).toEqual([['cambios', 1], ['cambios', 7], ['tabla', 8]]);
    expect(mensajes[1].cambios).toBe(2);
    expect(mensajes[2].filas).toEqual([[1, 'Ana'], [2, 'Bruno']]);
    expect(fin).toEqual({ error: 'no such table: no_esta', linea: 10 });
    // Checked while typing, the same: only the missing table.
    expect(revisarSql(SQL, db, codigoParaSqlite(codigo))).toEqual({ error: 'no such table: no_esta', linea: 10 });
    db.close();
  });

  it('un error adentro de un CREATE de MySQL apunta a esa sentencia', () => {
    const codigo = 'CREATE TABLE `a` (`id` INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`));\n\nCREATE TABLE `b` (\n  `id` INT NOT NULL,\n  `x` INT CHECK (,\n  PRIMARY KEY (`id`)\n);\n';
    const { fin, db } = correr(codigo);
    expect(fin.error).toMatch(/syntax error/);
    expect(fin.linea).toBe(3);
    db.close();
  });

  it('lo que no crea tablas corre como está escrito, con las pistas de MySQL de siempre', () => {
    const select = 'SELECT `nombre` FROM persona WHERE id = 1;\nselect now();';
    expect(codigoParaSqlite(select)).toBe(select);
    const db = armarBase(SQL, null).db;
    const { fin, mensajes } = correr(select, db);
    expect(mensajes[0]).toMatchObject({ tipo: 'tabla', linea: 1, filas: [['John']] });
    expect(fin).toEqual({ error: 'no such function: now', linea: 2 });
    expect(mensajes.at(-1)).toMatchObject({ tipo: 'dialecto', linea: 2, error: true });
    // A script with a routine stays as it was: SQLite doesn't have them, and the hint says so.
    const rutina = 'CREATE TABLE `t` (`id` INT AUTO_INCREMENT PRIMARY KEY);\nDELIMITER $$\nCREATE PROCEDURE p () BEGIN select 1; END$$\nDELIMITER ;\n';
    expect(codigoParaSqlite(rutina)).toBe(rutina);
    // And SQLite's own SQL, untouched.
    const propio = 'CREATE TABLE t (id INTEGER PRIMARY KEY, n TEXT);\nINSERT INTO t (n) VALUES (\'a\');';
    expect(codigoParaSqlite(propio)).toBe(propio);
    db.close();
  });
});

describe('en la base de práctica', () => {
  it('a table of the same name says where it comes from, and what to do', () => {
    expect(pistaDePractica('table propiedad already exists')).toMatch(/base de práctica ya trae una tabla propiedad.*vaciá la base/i);
    expect(pistaDePractica('table "propiedad" has no column named codigo')).toMatch(/tabla propiedad es la de la base de práctica/);
    expect(pistaDePractica('no such table: alquila')).toBeNull();
  });

  it('the hint goes first, only in the practice database', async () => {
    const SQL = await initSqlJs();
    for (const enPractica of [true, false]) {
      const db = new SQL.Database();
      db.run('CREATE TABLE propiedad (id INTEGER)');
      const llegado = [];
      const { error } = correrEnBase(db, 'CREATE TABLE propiedad (codigo INT);', (m) => llegado.push(m), { enPractica });
      expect(error).toMatch(/already exists/);
      const pistas = llegado.find((m) => m.tipo === 'dialecto')?.pistas ?? [];
      expect(pistas.some((p) => p.includes('base de práctica'))).toBe(enPractica);
      db.close();
    }
  });
});
