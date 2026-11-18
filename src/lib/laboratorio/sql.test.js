import { describe, expect, it } from 'vitest';
import { aCsv, decodificar, leerCsv, nombreSql, problemaDeNombre, proponerTabla, separadorDe, tipoDe, valoresDeFila } from './csv';
import { partirPista, pistasDeDialecto, sinTextos } from './dialecto';
import { carriles, ordenar, relaciones, trazo } from './dibujo';
import { consultaParaExplicar, explicarPlan, nombresDe, sentenciaEn, tienePlan } from './plan';

// The errors as SQLite 3.54 (sql.js) says them for the MySQL of the notes of Bases de Datos.
const pista = (sql, error) => pistasDeDialecto(sql, error).join(' | ');

describe('lo de MySQL de los apuntes, dicho como en SQLite', () => {
  it('transacciones, variables con @ y tablas temporales', () => {
    expect(pista('start transaction', 'near "start": syntax error')).toMatch(/`BEGIN;`/);
    expect(pista('SET autocommit = 0', 'near "SET": syntax error')).toMatch(/no tiene `autocommit`/);
    expect(pista("select id into @sheridan from persona where nombre='John'", 'near "into": syntax error')).toMatch(/variables con `@`/);
    expect(pista('set @x = 5', 'near "set": syntax error')).toMatch(/variables con `@`/);
    expect(pista('create temporary table val_act\nselect cod_tipo_viaje, max(fecha_desde) fec_val from tipos_viajes_valores', 'near "select": syntax error')).toMatch(/`CREATE TEMP TABLE val_act AS SELECT …`/);
    expect(pista('create temporary table if not exists tt (\n select 1 )', 'near "select": syntax error')).toMatch(/`CREATE TEMP TABLE tt AS SELECT …`/);
    expect(pista('create table copia select * from persona', 'near "select": syntax error')).toMatch(/`CREATE TABLE copia AS SELECT …`/);
    expect(pista('drop temporary table if exists TTempleados_fecha', 'near "temporary": syntax error')).toMatch(/`DROP TABLE IF EXISTS TTempleados_fecha;`/);
  });

  it('rutinas: delimiter, procedimientos, funciones y triggers', () => {
    expect(pista('DELIMITER $$\nUSE `inmobiliaria`$$\nCREATE PROCEDURE p () BEGIN select 1;', 'near "DELIMITER": syntax error')).toMatch(/`DELIMITER` sobra/);
    expect(pista('drop procedure if exists nuevo_valor', 'near "procedure": syntax error')).toMatch(/procedimientos ni funciones/);
    expect(pista("CREATE DEFINER=`root`@`localhost` PROCEDURE `p`(in tematica varchar(255)) BEGIN select 1;", 'near "DEFINER": syntax error')).toMatch(/procedimientos/);
    expect(pista('call nuevo_valor(12001,10)', 'near "call": syntax error')).toMatch(/procedimientos/);
    expect(pista('CREATE FUNCTION f (x int) RETURNS int READS SQL DATA BEGIN RETURN 1;', 'near "FUNCTION": syntax error')).toMatch(/procedimientos ni funciones/);
    expect(pista('CREATE DEFINER = CURRENT_USER TRIGGER tr AFTER INSERT ON t FOR EACH ROW BEGIN update t2 set x = x + new.a;', 'near "DEFINER": syntax error')).toMatch(/Queda `CREATE TRIGGER …`/);
    expect(pista('CREATE TRIGGER tr AFTER INSERT ON t FOR EACH ROW update t2 set x = x + new.a', 'near "update": syntax error')).toMatch(/entre `BEGIN` y `END;`/);
  });

  it('una sola base, sin usuarios', () => {
    expect(pista('use inmobiliaria', 'near "use": syntax error')).toMatch(/el `USE` sobra/);
    expect(pista('select * from `inmobiliaria`.`persona`', 'no such table: inmobiliaria.persona')).toMatch(/va `persona`, sin `inmobiliaria.`/);
    expect(pista('CREATE TABLE `saco_roto`.`unidades_medida` (x INT)', 'unknown database saco_roto')).toMatch(/va `unidades_medida`, sin `saco_roto.`/);
    expect(pista('grant insert, update on base.* to usuario@localhost', 'near "grant": syntax error')).toMatch(/usuarios ni permisos/);
    expect(pista("create user 'u'@'localhost' identified by 'x'", 'near "user": syntax error')).toMatch(/usuarios ni permisos/);
  });

  it('fechas y funciones: current_date(), now(), datediff, month y last_insert_id', () => {
    expect(pista('select current_date()', 'near "(": syntax error')).toMatch(/es `date\('now', 'localtime'\)`/);
    expect(pista('select now()', 'no such function: now')).toMatch(/datetime\('now', 'localtime'\)/);
    expect(pista('select curdate()', 'no such function: curdate')).toMatch(/date\('now', 'localtime'\)/);
    expect(pista('select datediff(l.fecha_vencimiento, e.fecha_entrega) retraso from entrega e', 'no such function: datediff')).toMatch(/julianday\(fin\) - julianday\(inicio\)/);
    expect(pista('select month(v.fecha_hora_visita) mes from visita v', 'no such function: month')).toMatch(/strftime\('%m', fecha\)/);
    expect(pista("select year('2025-03-10')", 'no such function: year')).toMatch(/strftime\('%Y', fecha\)/);
    expect(pista('select last_insert_id() into @sinclair', 'no such function: last_insert_id')).toMatch(/`last_insert_rowid\(\)`/);
  });

  it('crear y cambiar tablas: auto_increment, engine, comment y alter table', () => {
    expect(pista('CREATE TABLE `rol` (`codigo` INT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (`codigo`))', 'near "AUTO_INCREMENT": syntax error')).toMatch(/no tiene `AUTO_INCREMENT`/);
    expect(pista('create table p (c int unsigned not null, primary key (c)) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci', 'near "=": syntax error')).toMatch(/`ENGINE`, `CHARSET` y `COLLATE`/);
    expect(pista("create table m (cantidad decimal(10,3) not null COMMENT 'cantidad negativa indica salida de stock')", 'near "COMMENT": syntax error')).toMatch(/`COMMENT` sobra/);
    expect(pista('ALTER TABLE `encargado_evento`\n  ADD COLUMN fecha_asignacion date null,\n  ADD COLUMN fecha_fin_asignacion date null', 'near ",": syntax error')).toMatch(/un `ALTER TABLE` por cada cambio/);
    expect(pista('ALTER TABLE `materiales` ADD COLUMN `cod_unidad` INT NULL AFTER `unidad`;', 'near "AFTER": syntax error')).toMatch(/`AFTER` sobra/);
    expect(pista('alter table empleados modify column cod_categoria int unsigned not null', 'near "modify": syntax error')).toMatch(/no cambia una columna/);
    expect(pista('ALTER TABLE `evento` ADD INDEX `fk_evento_tematica_idx` (`id_tematica` ASC) VISIBLE', 'near "INDEX": syntax error')).toMatch(/`CREATE INDEX fk_evento_tematica_idx ON evento \(id_tematica\);`/);
    expect(pista('ALTER TABLE `evento` ADD CONSTRAINT `fk` FOREIGN KEY (`id_tematica`) REFERENCES `tematica` (`idtematica`)', 'near "CONSTRAINT": syntax error')).toMatch(/restricciones van en el `CREATE TABLE`/);
    expect(pista('alter table solicitud_contrato drop foreign key fk_solicitud_contrato_cliente', 'near "foreign": syntax error')).toMatch(/no saca restricciones/);
    expect(pista('update evento ev\ninner join tematica te on te.descripcion = ev.tematica\nset ev.id_tematica = te.idtematica', 'near "inner": syntax error')).toMatch(/`UPDATE evento AS ev SET … FROM tematica te WHERE …`/);
    expect(pista('update evento as ev set ev.id_tematica = te.idtematica from tematica te where te.descripcion = ev.tematica', 'near ".": syntax error')).toMatch(/`SET id_tematica = …`/);
    expect(pista('truncate table visita', 'near "truncate": syntax error')).toMatch(/`DELETE FROM visita;`/);
    // An INSERT that fails because the column was made with AUTO_INCREMENT after its type.
    const tipoDe = (t, c) => (t === 'movimiento_stock' && c === 'nro_movimiento' ? 'int unsigned auto_increment' : '');
    expect(pistasDeDialecto("insert into movimiento_stock(codigo_material, cantidad) values(10001, -20)", 'NOT NULL constraint failed: movimiento_stock.nro_movimiento', { tipoDe }).join()).toMatch(/`AUTO_INCREMENT` no numera/);
  });

  it('comentarios con # y comillas curvas de un PDF', () => {
    expect(pista('select a from t #puede hacerse con join', 'unrecognized token: "#"')).toMatch(/comentarios van con `--`/);
    expect(pista("select * from producto prod where prod.nombre like ‘%juguete%’", 'no such column: ‘')).toMatch(/comillas van rectas, `'%juguete%'`/);
  });

  it('lo que SQLite toma sin error y hace otra cosa: @, fechas sin guiones, auto_increment, current_date y divisiones', () => {
    expect(pista("select ps.legajo from proceso_seleccion ps where ps.cod_area = @area", '')).toMatch(/`@area` vale NULL/);
    expect(pista("where aa.fecha_hora_desde between '20250101' and '20251231T235959'", '')).toMatch(/fechas van con guiones, `'2025-01-01'`/);
    expect(pista("where ps.fecha_hora >= '01-01-2018'", '')).toMatch(/`'2018-01-01'`/);
    expect(pista('create table movimiento_stock (nro_movimiento int unsigned auto_increment not null, primary key (nro_movimiento))', '')).toMatch(/`AUTO_INCREMENT` no numera/);
    expect(pista('select * from salario s where s.fecha <= current_date', '')).toMatch(/UTC.*date\('now', 'localtime'\)/);
    expect(pista('create table m (f timestamp not null default current_timestamp)', '')).toMatch(/`CURRENT_TIMESTAMP` va en UTC/);
    expect(pista('select round(COUNT(*) * 100 / 7, 2) from solicitudes_puestos', '')).toMatch(/Multiplicá por `1.0`/);
    expect(pista('alter table persona add column barrio varchar(45) after domicilio', '')).toMatch(/`AFTER` quedó como parte del tipo/);
  });

  it('no dice nada de lo que está bien, ni de lo que está adentro de un texto o de un comentario', () => {
    expect(pista("select p.id, p.direccion from propiedad p where p.situacion = 'en oferta' limit 5", '')).toBe('');
    expect(pista("select ifnull(pe.numero, 'sin ventas') numero, concat(nombre, ' ', apellido) from pedido pe", '')).toBe('');
    expect(pista("select 'start transaction now() @x 20250101' as x", '')).toBe('');
    expect(pista("select * from visita v where v.fecha_hora_visita between '2025-01-01' and '2025-12-31 23:59:59'", '')).toBe('');
    expect(pista('select * from persona -- set @x = 1\n', '')).toBe('');
    expect(pista("select date('now', 'localtime'), COUNT(*) * 1.0 / 7", '')).toBe('');
    expect(pista('SELECT * FORM persona', 'near "FORM": syntax error')).toBe('');
    expect(pista('begin', '')).toBe('');
    expect(sinTextos("SELECT 'it''s' -- x\n, /* y */ 2")).toBe("SELECT ''  \n,   2");
    expect(pistasDeDialecto("start transaction;\nselect now() into @x", 'near "start": syntax error').length).toBeLessThanOrEqual(2);
  });

  it('una pista en pedazos de texto y de código', () => {
    expect(partirPista('En SQLite es `last_insert_rowid()`.')).toEqual([{ codigo: false, texto: 'En SQLite es ' }, { codigo: true, texto: 'last_insert_rowid()' }, { codigo: false, texto: '.' }]);
  });
});

describe('un CSV como tabla', () => {
  it('lee el texto en UTF-8, con BOM, en UTF-16 de SQL Server o en el Windows-1252 de Excel', () => {
    const utf8 = new TextEncoder().encode('Año;Señal\n');
    expect(decodificar(utf8)).toBe('Año;Señal\n');
    expect(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe('Año;Señal\n');
    expect(decodificar(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xf1, 0x00]))).toBe('Añ');
    expect(decodificar(new Uint8Array([0x41, 0xf1, 0x6f]))).toBe('Año');
  });

  it('separa con comillas, comillas dobles adentro, saltos de línea y líneas vacías', () => {
    expect(leerCsv('a,b\r\n"x, y","dice ""hola"""\n\n"dos\nlíneas",3')).toEqual([['a', 'b'], ['x, y', 'dice "hola"'], ['dos\nlíneas', '3']]);
    expect(separadorDe('legajo;nombre;nota\n1;Ana;8,5\n2;Bruno;6')).toBe(';');
    expect(separadorDe('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(separadorDe('legajo,nombre\n1,"Gómez, Ana"')).toBe(',');
  });

  it('deduce los tipos, y un código con ceros adelante queda texto', () => {
    expect(tipoDe(['1', '20', '', '-3'])).toBe('INTEGER');
    expect(tipoDe(['8.5', '6', '1e3'])).toBe('REAL');
    expect(tipoDe(['8,5', '6'], ';')).toBe('REAL');
    expect(tipoDe(['8,5', '6'], ',')).toBe('TEXT');
    expect(tipoDe(['007', '12'])).toBe('TEXT');
    expect(tipoDe(['2024-03-01'])).toBe('TEXT');
    expect(tipoDe(['', ' '])).toBe('TEXT');
    expect(tipoDe(['12345678901234567890'])).toBe('REAL');
  });

  it('nombres que se escriben sin comillas, sin repetir los que ya están', () => {
    expect(nombreSql('Nota final')).toBe('nota_final');
    expect(nombreSql('Año de ingreso')).toBe('anio_de_ingreso');
    expect(nombreSql('Órden')).toBe('orden');
    expect(nombreSql('order')).toBe('order_');
    expect(nombreSql('2do parcial')).toBe('columna_2do_parcial');
    expect(nombreSql('¿?')).toBe('columna');
    const p = proponerTabla('Legajo;Apellido;Nota final;Nota final\n50101;Gómez;8,5;7\n50102;Pereyra;6;\n', 'Notas TP.csv', ['notas_tp']);
    expect(p).toMatchObject({ tabla: 'notas_tp_2', separador: ';', encabezado: true, cuantas: 2 });
    expect(p.columnas).toEqual([{ nombre: 'legajo', tipo: 'INTEGER' }, { nombre: 'apellido', tipo: 'TEXT' }, { nombre: 'nota_final', tipo: 'REAL' }, { nombre: 'nota_final_2', tipo: 'INTEGER' }]);
    expect(p.muestra[1]).toEqual(['50102', 'Pereyra', '6', '']);
    // Without names in the first row, and the student can say it.
    expect(proponerTabla('1,2\n3,4', 'x.csv').encabezado).toBe(false);
    expect(proponerTabla('1,2\n3,4', 'x.csv', [], { encabezado: true, separador: ',' }).columnas.map((c) => c.nombre)).toEqual(['columna_1', 'columna_2']);
    expect(proponerTabla('\n\n', 'x.csv').error).toBe('vacio');
  });

  it('lo que el alumno escribe como nombre, con el porqué', () => {
    expect(problemaDeNombre('notas')).toBeNull();
    expect(problemaDeNombre(' ')).toBe('vacio');
    expect(problemaDeNombre('nota final')).toBe('letras');
    expect(problemaDeNombre('1ro')).toBe('letras');
    expect(problemaDeNombre('select')).toBe('reservada');
    expect(problemaDeNombre('sqlite_x')).toBe('reservada');
    expect(problemaDeNombre('Alumnos', ['alumnos'])).toBe('repetido');
  });

  it('los valores para la base: vacío es NULL y la coma decimal pasa a punto', () => {
    const cols = [{ tipo: 'INTEGER' }, { tipo: 'REAL' }, { tipo: 'TEXT' }];
    expect(valoresDeFila([' 8 ', '7,5', ' Ana '], cols, ';')).toEqual(['8', '7.5', ' Ana ']);
    expect(valoresDeFila(['', ' '], cols, ';')).toEqual([null, null, null]);
  });

  it('un resultado para Excel: BOM, punto y coma, coma decimal y nada que parezca una fórmula', () => {
    const csv = aCsv(['apellido', 'nota', 'dato'], [['Gómez', 8.5, null], ['Pe;rey "ra"', 7, '=HYPERLINK("x")'], ['-a', -2, { bytes: 3 }]]);
    expect(csv.startsWith('\uFEFFapellido;nota;dato\r\n')).toBe(true);
    expect(csv.split('\r\n').slice(1, 4)).toEqual(['Gómez;8,5;', '"Pe;rey ""ra""";7;"\'=HYPERLINK(""x"")"', "'-a;-2;blob de 3 bytes"]);
  });
});

describe('explicar la consulta', () => {
  const tablas = [{ nombre: 'alumnos' }, { nombre: 'inscripciones' }, { nombre: 'materias' }];

  it('la sentencia donde está el cursor, o la última antes de él', () => {
    const sql = 'SELECT 1;\n-- nota\nSELECT 2 FROM t;\n\n';
    expect(sentenciaEn(sql, 0)).toMatchObject({ texto: 'SELECT 1', linea: 1 });
    expect(sentenciaEn(sql, 9)).toMatchObject({ texto: 'SELECT 1' });
    expect(sentenciaEn(sql, 12)).toMatchObject({ texto: 'SELECT 2 FROM t', linea: 3 });
    expect(sentenciaEn(sql, sql.length)).toMatchObject({ texto: 'SELECT 2 FROM t' });
    expect(sentenciaEn('SELECT 3', 8)).toMatchObject({ texto: 'SELECT 3' });
    expect(sentenciaEn('  -- nada\n', 3)).toBeNull();
    // Only what has a plan is explained: a CREATE from «Crear SQL» (with AUTO_INCREMENT) says so instead of failing.
    expect(tienePlan({ texto: 'CREATE TABLE `a` (`id` INT NOT NULL AUTO_INCREMENT, PRIMARY KEY (`id`))' })).toBe(false);
    expect(tienePlan({ texto: 'DROP TABLE a' })).toBe(false);
    for (const t of ['SELECT 1', 'WITH x AS (SELECT 1) SELECT * FROM x', 'INSERT INTO a VALUES (1)', 'UPDATE a SET b = 1', 'DELETE FROM a', 'EXPLAIN QUERY PLAN SELECT 1', '(SELECT 1)']) expect(tienePlan({ texto: t })).toBe(true);
    expect(consultaParaExplicar({ texto: 'SELECT 2 FROM t', linea: 3 })).toBe('\n\nEXPLAIN QUERY PLAN SELECT 2 FROM t;');
    expect(consultaParaExplicar({ texto: 'EXPLAIN SELECT 2', linea: 1 })).toBe('EXPLAIN QUERY PLAN SELECT 2;');
  });

  it('cada alias con su tabla, y los nombres del WITH', () => {
    const n = nombresDe('WITH x AS (SELECT 1), y(a) AS (SELECT 2) SELECT * FROM inscripciones i JOIN alumnos AS a ON a.legajo = i.legajo, materias m WHERE 1', tablas);
    expect([...n.alias]).toEqual([['i', 'inscripciones'], ['a', 'alumnos'], ['m', 'materias']]);
    expect([...n.cte]).toEqual(['x', 'y']);
  });

  it('en palabras, con lo que se repite por cada fila', () => {
    const filas = [
      [7, 0, 204, 'SEARCH i USING INDEX ix_ins_nota (nota>?)'],
      [12, 0, 45, 'SEARCH a USING INTEGER PRIMARY KEY (rowid=?)'],
      [15, 0, 45, 'SEARCH m USING INTEGER PRIMARY KEY (rowid=?)'],
      [20, 0, 0, 'USE TEMP B-TREE FOR ORDER BY'],
    ];
    const sentencia = 'SELECT * FROM inscripciones i JOIN alumnos a ON a.legajo = i.legajo JOIN materias m ON m.id = i.materia ORDER BY nota';
    expect(explicarPlan(filas, { tablas, sentencia }).map((n) => n.texto)).toEqual([
      'Busca en inscripciones (i) con el índice ix_ins_nota, por nota.',
      'Por cada una de esas filas, va directo a alumnos (a) por su clave primaria.',
      'Por cada una de esas filas, va directo a materias (m) por su clave primaria.',
      'Arma una lista aparte para ordenar el resultado (ORDER BY).',
    ]);
  });

  it('recorrer toda la tabla se marca, y las subconsultas van adentro de su paso', () => {
    const plan = explicarPlan([[2, 0, 216, 'SCAN a'], [6, 0, 0, 'CORRELATED SCALAR SUBQUERY 1'], [12, 6, 62, 'SEARCH i USING INDEX sqlite_autoindex_inscripciones_1 (legajo=?)']], { tablas, sentencia: 'SELECT (SELECT max(nota) FROM inscripciones i WHERE i.legajo = a.legajo) FROM alumnos a' });
    expect(plan[0]).toMatchObject({ texto: 'Recorre toda la tabla alumnos (a), fila por fila.', todo: true });
    expect(plan[1].texto).toBe('Corre una subconsulta por cada fila.');
    expect(plan[1].hijos[0].texto).toBe('Busca en inscripciones (i) con el índice automático de la clave o el UNIQUE, por legajo.');
  });

  it('cada forma que tiene SQLite de decirlo', () => {
    const una = (detalle, sentencia = 'SELECT * FROM alumnos') => explicarPlan([[1, 0, 0, detalle]], { tablas, sentencia })[0].texto;
    expect(una('SCAN CONSTANT ROW')).toBe('No lee ninguna tabla, solo calcula el resultado.');
    expect(una('SEARCH materias USING COVERING INDEX sqlite_autoindex_materias_1 (nombre=?)')).toMatch(/^Busca con el índice automático de la clave o el UNIQUE, por nombre, y no necesita abrir la tabla materias\.$/);
    expect(una('SCAN inscripciones USING COVERING INDEX ix (legajo)')).toMatch(/^Recorre/);
    expect(una('SCAN inscripciones USING INDEX ix_ins_nota')).toBe('Recorre toda la tabla inscripciones en el orden del índice ix_ins_nota.');
    expect(una('SEARCH i USING AUTOMATIC PARTIAL COVERING INDEX (materia=?) LEFT-JOIN', 'SELECT * FROM alumnos a LEFT JOIN inscripciones i ON 1')).toBe('Arma un índice al vuelo sobre inscripciones (i), por materia, para no recorrerla entera cada vez, del LEFT JOIN.');
    expect(una('SEARCH alumnos USING INTEGER PRIMARY KEY (rowid>? AND rowid<?)')).toBe('Busca en alumnos un tramo de su clave primaria.');
    expect(una('USE TEMP B-TREE FOR GROUP BY')).toMatch(/agrupar/);
    expect(una('USE TEMP B-TREE FOR DISTINCT')).toMatch(/repetidos/);
    expect(una('USE TEMP B-TREE FOR LAST TERM OF ORDER BY')).toMatch(/casi ordenado/);
    expect(una('CO-ROUTINE x', 'WITH x AS (SELECT 1) SELECT * FROM x')).toBe('Arma x (la del WITH) de a poco, a medida que hace falta.');
    expect(una('SCAN (subquery-1)')).toBe('Recorre la subconsulta.');
    expect(una('MERGE (UNION)')).toMatch(/UNION, sin repetidos/);
    expect(una('MULTI-INDEX OR')).toMatch(/cada parte del OR/);
    expect(una('BLOOM FILTER ON i (materia=?)', 'SELECT * FROM inscripciones i')).toMatch(/filtro rápido sobre inscripciones \(i\), por materia/);
    expect(una('LIST SUBQUERY 1')).toMatch(/lista del IN/);
    expect(una('ALGO NUEVO DE SQLITE')).toBe('ALGO NUEVO DE SQLITE');
  });
});

describe('el dibujo de la base', () => {
  const esquema = [
    { nombre: 'correlativas', columnas: [{ nombre: 'materia', clave: 1 }, { nombre: 'requiere', clave: 2 }], foraneas: [{ tabla: 'materias', desde: ['materia'], hacia: ['id'] }, { tabla: 'materias', desde: ['requiere'], hacia: ['id'] }] },
    { nombre: 'inscripciones', columnas: [{ nombre: 'legajo', clave: 1 }, { nombre: 'materia', clave: 2 }], foraneas: [{ tabla: 'materias', desde: ['materia'], hacia: ['id'] }, { tabla: 'alumnos', desde: ['legajo'], hacia: null }] },
    { nombre: 'alumnos', columnas: [{ nombre: 'legajo', clave: 1 }], foraneas: [] },
    { nombre: 'materias', columnas: [{ nombre: 'id', clave: 1 }], foraneas: [] },
    { nombre: 'promedios', vista: true, columnas: [{ nombre: 'p', clave: 0 }], foraneas: [] },
    { nombre: 'huerfana', columnas: [{ nombre: 'x', clave: 0 }], foraneas: [{ tabla: 'no_esta', desde: ['x'], hacia: ['y'] }] },
  ];

  it('las tablas apuntadas primero, cerca de las que apuntan, y las vistas al final', () => {
    expect(ordenar(esquema).map((t) => t.nombre)).toEqual(['alumnos', 'huerfana', 'materias', 'inscripciones', 'correlativas', 'promedios']);
    // A circle doesn't hang it.
    expect(ordenar([{ nombre: 'a', columnas: [], foraneas: [{ tabla: 'b', desde: ['x'] }] }, { nombre: 'b', columnas: [], foraneas: [{ tabla: 'a', desde: ['y'] }] }]).length).toBe(2);
  });

  it('cada clave foránea, con la columna a la que apunta o la clave primaria de la otra', () => {
    const r = relaciones(esquema);
    expect(r).toContainEqual({ desde: { tabla: 'inscripciones', columna: 'legajo' }, hacia: { tabla: 'alumnos', columna: 'legajo' }, existe: true });
    expect(r).toContainEqual({ desde: { tabla: 'huerfana', columna: 'x' }, hacia: { tabla: 'no_esta', columna: 'y' }, existe: false });
  });

  it('las líneas que se cruzan van en carriles distintos; las que van al mismo lugar o no se tocan, comparten', () => {
    const l = (a, b) => ({ desde: { tabla: a }, hacia: { tabla: b } });
    const pos = { a: 0, b: 10, c: 20, d: 30 };
    expect(carriles([l('a', 'c'), l('b', 'c'), l('c', 'd')], (t) => pos[t])).toEqual({ carril: [0, 0, 0], cuantos: 1 });
    expect(carriles([l('a', 'c'), l('b', 'd')], (t) => pos[t])).toEqual({ carril: [0, 1], cuantos: 2 });
    expect(carriles([l('a', 'd'), l('b', 'c')], (t) => pos[t])).toEqual({ carril: [1, 0], cuantos: 2 });
    expect(carriles([l('a', 'b'), l('c', 'd')], (t) => pos[t]).cuantos).toBe(1);
    expect(trazo(40, 10, 50, 20)).toBe('M40 10H25Q20 10 20 15V45Q20 50 25 50H40');
    expect(trazo(40, 10, 10, 20)).toBe('M40 10H20V10H40');
  });
});
