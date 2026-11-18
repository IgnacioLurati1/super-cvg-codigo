// @vitest-environment node
// The database of the SQL lab with the real SQLite (sql.js, as the worker uses it).
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { proponerTabla } from './csv';
import { pistasDeDialecto } from './dialecto';
import { armarBase, correrScript, esquemaDe, esSqlite, sentenciaDesde, sumarTabla, tipoDeColumna } from './sqlBase';

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const valores = (db, sql) => db.exec(sql)[0]?.values ?? [];

describe('la base del laboratorio de SQL', () => {
  it('vacía, sin tablas: un script del alumno crea las suyas aunque se llamen como las de práctica', () => {
    const { db } = armarBase(SQL, { origen: { tipo: 'vacia', nombre: 'Base vacía' }, tablas: [] });
    expect(esquemaDe(db)).toEqual([]);
    db.exec('CREATE TABLE persona (id INTEGER PRIMARY KEY)');
    expect(esquemaDe(db).map((t) => t.nombre)).toEqual(['persona']);
    expect(valores(db, 'PRAGMA foreign_keys')[0][0]).toBe(1);
  });

  it('la de práctica, la inmobiliaria de los apuntes, con sus claves primarias y foráneas en el dibujo', () => {
    const { db } = armarBase(SQL, null);
    const esquema = esquemaDe(db);
    expect(esquema.map((t) => t.nombre)).toEqual(['agente_asignado', 'garantia', 'persona', 'propiedad', 'solicitud_contrato', 'tipo_garantia', 'valor_propiedad', 'visita']);
    const garantia = esquema.find((t) => t.nombre === 'garantia');
    expect(garantia.columnas.filter((c) => c.clave).map((c) => [c.nombre, c.clave])).toEqual([['id_solicitud', 1], ['id_garante', 2]]);
    expect(garantia.foraneas).toEqual([{ tabla: 'tipo_garantia', desde: ['id_tipo_garantia'], hacia: ['id'] }, { tabla: 'persona', desde: ['id_garante'], hacia: ['id'] }, { tabla: 'solicitud_contrato', desde: ['id_solicitud'], hacia: ['id'] }]);
    expect(valores(db, 'PRAGMA foreign_keys')[0][0]).toBe(1);
    // An exercise of the notes, as SQLite writes it: the agents assigned in 2025 that made no visit that year.
    const sinVisitas = `select age.id, age.nombre, age.apellido
from persona age
where age.id in (
  select aa.id_agente from agente_asignado aa
  where aa.fecha_hora_desde between '2025-01-01' and '2025-12-31 23:59:59')
and age.id not in (
  select v.id_agente from visita v
  where v.fecha_hora_visita between '2025-01-01' and '2025-12-31 23:59:59');`;
    expect(valores(db, sinVisitas)).toEqual([[3, 'Michael', 'Garibaldi']]);
    db.close();
  });

  it('un .sql se corre entero y es la base nueva; si falla, dice la línea y nada queda', () => {
    const texto = '-- TP 2\nCREATE TABLE autos (patente TEXT PRIMARY KEY, marca TEXT);\nCREATE TABLE multas (id INTEGER PRIMARY KEY, patente TEXT REFERENCES autos, monto REAL);\nINSERT INTO autos VALUES (\'AB123CD\', \'Fiat\');\nINSERT INTO multas (patente, monto) VALUES (\'AB123CD\', 1500.5);\nSELECT * FROM autos;\n';
    const { db } = armarBase(SQL, { origen: { tipo: 'sql', nombre: 'tp.sql', texto }, tablas: [] });
    expect(valores(db, 'SELECT monto FROM multas')).toEqual([[1500.5]]);
    // Without the column it points to: the primary key of the other one.
    expect(esquemaDe(db).find((t) => t.nombre === 'multas').foraneas).toEqual([{ tabla: 'autos', desde: ['patente'], hacia: null }]);
    db.close();

    const malo = armarBase(SQL, { origen: { tipo: 'sql', nombre: 'malo.sql', texto: 'CREATE TABLE a (x);\n\nINSERT INTO b VALUES (1);\n' }, tablas: [] });
    expect(malo).toMatchObject({ error: 'no such table: b', linea: 3 });
    expect(malo.db).toBeUndefined();
  });

  it('un script de MySQL como los de la cátedra se carga pasado a SQLite; escrito en el editor, falla con su pista', () => {
    const workbench = 'USE `inmobiliaria`;\nCREATE TABLE `rol` (\n  `codigo` INT UNSIGNED NOT NULL AUTO_INCREMENT,\n  `descripcion` VARCHAR(45) NOT NULL,\n  PRIMARY KEY (`codigo`)\n) engine=InnoDB default charset=utf8mb4;\nINSERT INTO `rol` (`descripcion`) VALUES (\'Agente\'), (\'Garante\');\n';
    const r = armarBase(SQL, { origen: { tipo: 'sql', nombre: 'inmobiliaria.sql', texto: workbench }, tablas: [] });
    expect(r.afuera).toEqual([]);
    expect(valores(r.db, 'SELECT codigo, descripcion FROM rol')).toEqual([[1, 'Agente'], [2, 'Garante']]);
    r.db.close();
    // A MySQL line that fails says where it is in the file.
    const malo = armarBase(SQL, { origen: { tipo: 'sql', nombre: 'malo.sql', texto: `${workbench}\nINSERT INTO \`rol\` (\`descripcion\`)\n  VALUES (NULL);\n` }, tablas: [] });
    expect(malo).toMatchObject({ error: 'NOT NULL constraint failed: rol.descripcion', linea: 9 });
    const db = new SQL.Database();
    const sinUse = correrScript(db, 'create table movimiento_stock (nro_movimiento int unsigned auto_increment not null, cantidad decimal(10,3) not null, primary key (nro_movimiento));\ninsert into movimiento_stock (cantidad) values (-20);');
    expect(sinUse).toMatchObject({ error: 'NOT NULL constraint failed: movimiento_stock.nro_movimiento', linea: 2 });
    expect(sinUse.pistas.join()).toMatch(/`AUTO_INCREMENT` no numera/);
    db.close();
  });

  it('las pistas, con los errores reales de SQLite', () => {
    const { db } = armarBase(SQL, null);
    const error = (sql) => {
      try {
        db.exec(sql);
        return '';
      } catch (e) {
        return e.message;
      }
    };
    const casos = [
      'start transaction',
      'SET autocommit = 0',
      "select id into @sheridan from persona where nombre = 'John'",
      'create temporary table tt select * from persona',
      'drop temporary table if exists tt',
      'delimiter $$',
      'call nuevo_valor(12001, 10)',
      'select current_date()',
      'select now()',
      "select datediff('2025-03-10', '2025-03-01')",
      'select month(fecha_hora_visita) from visita',
      'select last_insert_id()',
      'select * from inmobiliaria.persona',
      'update visita as v set v.id_agente = 1',
      'alter table persona add column a int, add column b int',
      'alter table persona add column a int null after nombre',
      'alter table persona modify column nombre varchar(60) not null',
      'select * from persona # todos',
      'select * from persona where nombre like ‘J%’',
      'truncate table visita',
    ];
    for (const c of casos) expect(pistasDeDialecto(c, error(c), { tipoDe: tipoDeColumna(db) }).length, c).toBe(1);
    // An UPDATE with a JOIN, as MySQL writes it: the FROM, and the column of the SET without its table.
    const conJoin = 'update visita v inner join persona p on p.id = v.id_agente set v.id_agente = p.id';
    expect(pistasDeDialecto(conJoin, error(conJoin)).join(' | ')).toMatch(/`UPDATE visita AS v SET … FROM persona p WHERE …` | .*`SET id_agente = …`/);
    // What SQLite takes doing something else: a date without dashes, a variable that is NULL.
    const sinGuiones = "select count(*) from solicitud_contrato where fecha_solicitud between '20250101' and '20251231'";
    expect(error(sinGuiones)).toBe('');
    expect(valores(db, sinGuiones)).toEqual([[0]]);
    expect(valores(db, "select count(*) from solicitud_contrato where fecha_solicitud between '2025-01-01' and '2025-12-31'")).toEqual([[6]]);
    expect(pistasDeDialecto(sinGuiones, '').join()).toMatch(/`'2025-01-01'`/);
    expect(valores(db, 'select @area')).toEqual([[null]]);
    const despues = 'alter table persona add column b int after nombre';
    expect(error(despues)).toBe('');
    expect(pistasDeDialecto(despues, '').join()).toMatch(/como parte del tipo/);
    db.close();
  });

  it('un .db se abre como está, también uno guardado con WAL, y lo que no es una base se dice', () => {
    const origen = new SQL.Database();
    origen.exec("CREATE TABLE kiosco (id INTEGER PRIMARY KEY, producto TEXT); INSERT INTO kiosco (producto) VALUES ('alfajor')");
    const bytes = origen.export();
    origen.close();
    expect(esSqlite(bytes)).toBe(true);
    const { db } = armarBase(SQL, { origen: { tipo: 'db', nombre: 'kiosco.db', bytes }, tablas: [] });
    expect(valores(db, 'SELECT producto FROM kiosco')).toEqual([['alfajor']]);
    db.close();
    const wal = bytes.slice();
    wal[18] = 2;
    wal[19] = 2;
    const conWal = armarBase(SQL, { origen: { tipo: 'db', nombre: 'wal.db', bytes: wal }, tablas: [] });
    expect(valores(conWal.db, 'SELECT count(*) FROM kiosco')).toEqual([[1]]);
    conWal.db.close();
    expect(armarBase(SQL, { origen: { tipo: 'db', nombre: 'x.db', bytes: new TextEncoder().encode('hola, no soy una base') }, tablas: [] })).toEqual({ noEsBase: true });
    const roto = bytes.slice(0, 200);
    expect(armarBase(SQL, { origen: { tipo: 'db', nombre: 'roto.db', bytes: roto }, tablas: [] }).noEsBase).toBe(true);
  });

  it('un CSV es una tabla con sus tipos, de una vez, y al rearmar la base vuelve', () => {
    const texto = 'Legajo;Apellido;Nota final\r\n50101;Gómez;8,5\r\n50102;Pereyra;\r\n50103;Sosa;7\r\n';
    const p = proponerTabla(texto, 'notas.csv', []);
    const tabla = { archivo: 'notas.csv', tabla: p.tabla, separador: p.separador, encabezado: p.encabezado, columnas: p.columnas, texto };
    const { db } = armarBase(SQL, null);
    expect(sumarTabla(db, tabla)).toBe(3);
    expect(valores(db, 'SELECT legajo, typeof(legajo), nota_final, typeof(nota_final) FROM notas ORDER BY apellido')).toEqual([[50101, 'integer', 8.5, 'real'], [50102, 'integer', null, 'null'], [50103, 'integer', 7, 'real']]);
    // A name that is taken: nothing of it stays.
    expect(() => sumarTabla(db, { ...tabla, tabla: 'persona' })).toThrow(/already exists/);
    expect(valores(db, 'SELECT count(*) FROM persona')).toEqual([[10]]);
    db.close();
    const otra = armarBase(SQL, { origen: null, tablas: [tabla, { ...tabla, tabla: 'persona' }] });
    expect(esquemaDe(otra.db).map((t) => t.nombre)).toContain('notas');
    expect(valores(otra.db, 'SELECT count(*) FROM persona')).toEqual([[10]]);
    otra.db.close();
  });

  it('la sentencia que falló, desde donde empieza', () => {
    expect(sentenciaDesde('SELECT 1;\n-- x\nSELECT TOP 2 * FROM t;\nSELECT 3', 9)).toBe('SELECT TOP 2 * FROM t;');
  });
});
