// @vitest-environment node
// The script of a pasaje, run as the Laboratorio runs a project's .sql: through mysql.js into the real SQLite (sql.js).
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { armarBase, esquemaDe } from '../sqlBase';
import { INSTRUMENTOS } from './instrumentos.fixture';
import { IDIOMAS } from './idiomas.fixture';
import { pasarATablas } from './pasaje';
import { crearSql, nombreSql, tipoDe, tipoSugerido } from './sql';

let SQL;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const correr = (sql) => armarBase(SQL, { origen: { tipo: 'sql', nombre: 'base.sql', texto: sql }, tablas: [] });
const valores = (db, sql) => db.exec(sql)[0]?.values ?? [];

describe('el SQL del pasaje', () => {
  it('los tipos por el nombre, y las CF con el de la columna a la que apuntan', () => {
    const r = pasarATablas(INSTRUMENTOS);
    const t = (tabla) => r.tablas.find((x) => x.nombre === tabla);
    const tipo = (tabla, col, tipos) => tipoDe(t(tabla), col, r, tipos);
    expect(tipoSugerido(t('persona'), 'id', r)).toBe('INT AUTO_INCREMENT');
    expect(tipo('persona', 'email')).toBe('VARCHAR(100)');
    expect(tipo('vendedor_a_cargo', 'fecha_hora_desde')).toBe('DATETIME');
    expect(tipo('alquiler', 'fecha_pedido')).toBe('DATE');
    expect(tipo('vendedor_a_cargo', 'id_vendedor')).toBe('INT');
    expect(tipo('alquiler', 'fecha_hora_desde')).toBe('DATETIME');
    // The student's type, and the CFs that point to it follow.
    const tipos = { 'instrumento.id': 'VARCHAR(20)', 'aval.estado': 'VARCHAR(20)', 'aval.fecha_alta': 'INT AUTO_INCREMENT' };
    expect(tipo('instrumento', 'id', tipos)).toBe('VARCHAR(20)');
    expect(tipo('prueba', 'id_instrumento', tipos)).toBe('VARCHAR(20)');
    expect(tipo('aval', 'estado', tipos)).toBe('VARCHAR(20)');
    // AUTO_INCREMENT only on a key alone.
    expect(tipo('aval', 'fecha_alta', tipos)).toBe('INT');
  });

  it('nombres en ASCII snake_case', () => {
    expect(['habitación', 'Fecha Hora Estado', 'fechaHoraEstado', 'año', '1er_turno', '¿?', 'cabaña'].map(nombreSql)).toEqual(['habitacion', 'fecha_hora_estado', 'fecha_hora_estado', 'ano', 't_1er_turno', 'x', 'cabana']);
  });

  it('no se crea mientras falta decidir algo', () => {
    const r = pasarATablas({ ...INSTRUMENTOS, decisiones: { cp: {}, lado11: {}, tipos: {} } });
    const { sql, faltan } = crearSql(r);
    expect(sql).toBeNull();
    // Each one says which table: the Crear SQL bar lists them.
    expect(faltan).toEqual(r.pendientes.map((p) => `A «${p.tabla}» le falta la clave primaria.`));
    expect(faltan).toHaveLength(4);
    const sinClave = pasarATablas({ v: 1, entidades: [{ id: 'a', nombre: 'a', debil: false, x: 0, y: 0, atributos: [] }] });
    expect(crearSql(sinClave).faltan).toEqual(['A «a» le falta la clave primaria.']);
    expect(crearSql(pasarATablas(null)).sql).toBeNull();
    const unoAUno = pasarATablas({ v: 1, entidades: ['a', 'b'].map((n) => ({ id: n, nombre: n, debil: false, x: 0, y: 0, atributos: [{ id: `${n}-id`, nombre: 'id', clave: true, multivaluado: false, derivado: false, partes: [] }] })), vinculos: [{ id: 'v', nombre: 'tiene', identificador: false, x: 0, y: 0, atributos: [], puntas: [{ a: 'a', card: '1:1', rol: '' }, { a: 'b', card: '0:1', rol: '' }] }] });
    expect(crearSql(unoAUno).faltan).toEqual(['«tiene» es 1 a 1. Falta elegir dónde va la CF.']);
    // A hierarchy pressed twice: empty, or with one subclass, it keeps the SQL from being created too.
    const ent = (n) => ({ id: n, nombre: n, debil: false, x: 0, y: 0, atributos: n === 'propiedad' ? [{ id: 'p-id', nombre: 'id', clave: true, multivaluado: false, derivado: false, partes: [] }] : [] });
    const jer = (subclases) => pasarATablas({ v: 1, entidades: ['propiedad', 'casa', 'departamento'].map(ent), jerarquias: [{ id: 'j', x: 0, y: 0, superclase: 'propiedad', subclases, tipo: 'D', total: false, pasaje: 'superclase' }] });
    expect(crearSql(jer([])).faltan).toContain('La jerarquía de «propiedad» necesita dos subclases o más.');
    expect(crearSql(jer(['casa'])).faltan).toContain('La jerarquía de «propiedad» necesita dos subclases o más.');
    expect(crearSql(jer(['casa', 'departamento'])).sql).toContain('CREATE TABLE `propiedad`');
  });

  it('el alquiler de instrumentos: el script de MySQL corre en el motor del Laboratorio, con sus tablas y claves foráneas', () => {
    const { sql, faltan } = crearSql(pasarATablas(INSTRUMENTOS));
    expect(faltan).toEqual([]);
    expect(sql).toContain('CREATE TABLE `persona` (\n  `id` INT NOT NULL AUTO_INCREMENT,\n  `tipo_doc` VARCHAR(100),');
    expect(sql).toContain(
      'CREATE TABLE `tarifa` (\n  `id_instrumento` INT NOT NULL,\n  `fecha_hora_desde` DATETIME NOT NULL,\n  `precio_diario` VARCHAR(100),\n  PRIMARY KEY (`id_instrumento`, `fecha_hora_desde`),\n  CONSTRAINT `fk_tarifa_instrumento` FOREIGN KEY (`id_instrumento`) REFERENCES `instrumento` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE\n);',
    );
    expect(sql).toContain('CREATE TABLE `reparacion` (');
    expect(sql).not.toContain('ALTER TABLE');

    const r = correr(sql);
    expect(r.error).toBeUndefined();
    expect(r.afuera).toEqual([]);
    const esquema = esquemaDe(r.db);
    expect(esquema.map((t) => t.nombre)).toEqual([
      'alquiler', 'aval', 'consignatario_instrumento', 'cuota', 'especificacion', 'especificacion_instrumento', 'instrumento', 'persona', 'prueba', 'reparacion', 'tarifa', 'tipo_aval', 'tipo_reparacion', 'vendedor_a_cargo',
    ]);
    const de = (nombre) => esquema.find((t) => t.nombre === nombre);
    expect(de('alquiler').foraneas).toEqual(
      expect.arrayContaining([
        { tabla: 'vendedor_a_cargo', desde: ['id_vendedor', 'id_instrumento', 'fecha_hora_desde'], hacia: ['id_vendedor', 'id_instrumento', 'fecha_hora_desde'] },
        { tabla: 'persona', desde: ['id_musico'], hacia: ['id'] },
      ]),
    );
    expect(de('aval').columnas.filter((c) => c.clave).map((c) => c.nombre)).toEqual(['id_avalista', 'id_alquiler']);
    expect(de('aval').foraneas.map((f) => f.tabla).sort()).toEqual(['alquiler', 'persona', 'tipo_aval']);

    // The keys work: the ids come by themselves, a CF to nothing fails.
    const db = r.db;
    expect(valores(db, 'PRAGMA foreign_keys')[0][0]).toBe(1);
    expect(valores(db, 'PRAGMA foreign_key_check')).toEqual([]);
    db.exec("INSERT INTO persona (tipo_doc, nro_doc, nombre) VALUES ('dni', '1', 'Ana'), ('dni', '2', 'Bruno')");
    db.exec("INSERT INTO instrumento (marca) VALUES ('Fender')");
    db.exec("INSERT INTO vendedor_a_cargo VALUES (1, 1, '2025-01-01 09:00:00', NULL)");
    db.exec("INSERT INTO alquiler (fecha_pedido, id_vendedor, id_instrumento, fecha_hora_desde, id_musico) VALUES ('2025-02-10', 1, 1, '2025-01-01 09:00:00', 2)");
    expect(valores(db, 'SELECT id, id_musico FROM alquiler')).toEqual([[1, 2]]);
    expect(() => db.exec("INSERT INTO prueba VALUES (2, 1, 1, '2024-01-01 00:00:00', '2025-02-01 10:00:00')")).toThrow(/FOREIGN KEY/);
    expect(() => db.exec('DELETE FROM persona WHERE id = 1')).toThrow(/FOREIGN KEY/);
    db.close();
  });

  it('la escuela de idiomas también corre, con la agregación que recibe una CF y la débil con clave compuesta', () => {
    const { sql } = crearSql(pasarATablas(IDIOMAS));
    const r = correr(sql);
    expect(r.error).toBeUndefined();
    const esquema = esquemaDe(r.db);
    expect(esquema.find((t) => t.nombre === 'comision_inscripcion_alumno').foraneas).toEqual(
      expect.arrayContaining([{ tabla: 'inscripcion_alumno', desde: ['id_inscripcion', 'id_alumno'], hacia: ['id_inscripcion', 'id_alumno'] }]),
    );
    expect(valores(r.db, 'PRAGMA foreign_key_check')).toEqual([]);
    r.db.close();
  });

  it('un ciclo de CF se cierra con ALTER TABLE, que también corre', () => {
    const e = (id) => ({ id, nombre: id, debil: false, x: 0, y: 0, atributos: [{ id: `${id}-id`, nombre: 'id', clave: true, multivaluado: false, derivado: false, partes: [] }] });
    const v = (id, a, b) => ({ id, nombre: id, identificador: false, x: 0, y: 0, atributos: [], puntas: [{ a, card: '0:1', rol: '' }, { a: b, card: '0:N', rol: '' }] });
    const r = pasarATablas({ v: 1, entidades: [e('a'), e('b')], vinculos: [v('ab', 'a', 'b'), v('ba', 'b', 'a')] });
    const { sql } = crearSql(r);
    expect(sql).toContain('ALTER TABLE `a` ADD CONSTRAINT `fk_a_b` FOREIGN KEY (`id_b`) REFERENCES `b` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;');
    const base = correr(sql);
    expect(base.error).toBeUndefined();
    expect(esquemaDe(base.db).find((t) => t.nombre === 'a').foraneas).toEqual([{ tabla: 'b', desde: ['id_b'], hacia: ['id'] }]);
    base.db.close();
  });
});
