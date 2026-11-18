import { describe, expect, it } from 'vitest';
import { comoTexto, queHace } from './queHace';

const dice = (sql) => comoTexto(queHace(sql));

describe('qué hace una consulta, con las del alumno que lo pidió', () => {
  it('JOIN, GROUP BY y HAVING', () => {
    expect(dice('SELECT c.nombre, COUNT(*) AS propiedades FROM cliente c JOIN alquila a ON a.dni = c.dni GROUP BY c.dni, c.nombre HAVING COUNT(*) > 1;')).toEqual([
      'Combina cliente (c) con alquila (a) cuando `a.dni = c.dni`. Quedan solo las filas con coincidencia en las dos tablas.',
      'Agrupa las filas por `c.dni` y `c.nombre`.',
      'Cuenta las filas de cada grupo.',
      'Se queda con los grupos que cumplen `COUNT(*) > 1`.',
      'Muestra `c.nombre` y `COUNT(*)` como `propiedades`.',
    ]);
  });

  it('dos JOIN y ORDER BY', () => {
    expect(dice('SELECT c.nombre, p.direccion, a.fecha_inicio FROM cliente c JOIN alquila a ON a.dni = c.dni JOIN propiedad p ON p.codigo = a.codigo ORDER BY c.nombre;')).toEqual([
      'Combina cliente (c) con alquila (a) cuando `a.dni = c.dni`. Quedan solo las filas con coincidencia en las dos tablas.',
      'Combina el resultado con propiedad (p) cuando `p.codigo = a.codigo`. Quedan solo las filas con coincidencia.',
      'Muestra `c.nombre`, `p.direccion` y `a.fecha_inicio`.',
      'Ordena por `c.nombre`.',
    ]);
  });

  it('una suma por grupo', () => {
    expect(dice('SELECT e.nombre, SUM(a.precio) AS total_cobrado FROM empleado e JOIN alquila a ON a.legajo = e.legajo GROUP BY e.legajo, e.nombre;')).toEqual([
      'Combina empleado (e) con alquila (a) cuando `a.legajo = e.legajo`. Quedan solo las filas con coincidencia en las dos tablas.',
      'Agrupa las filas por `e.legajo` y `e.nombre`.',
      'Suma `a.precio` en cada grupo.',
      'Muestra `e.nombre` y `SUM(a.precio)` como `total_cobrado`.',
    ]);
  });
});

// The solutions of the notes (2° parcial, parcialitos 2025), as they're written there: aliases without AS, # comments,
// dates as '20250101', variables with @.
describe('qué hace una consulta, con las resoluciones de la cátedra', () => {
  it('301.1: INNER JOIN, WHERE y ORDER BY con desc; más de cuatro columnas van en una lista', () => {
    const sql = `select per_age.id id_agente, per_age.nombre nombre_agente,
  per_age.apellido apellido_agente
  , sc.id id_solicitud, sc.importe_mensual
  , tg.nombre tipo_garantia
  , g.fecha_alta, g.fecha_baja
from solicitud_contrato sc
inner join persona per_age
  on per_age.id=sc.id_agente
inner join garantia g
  on g.id_solicitud=sc.id
inner join tipo_garantia tg
  on g.id_tipo_garantia=tg.id
where g.estado<>'rechazada'
order by per_age.apellido, per_age.nombre, g.fecha_alta desc;`;
    expect(dice(sql)).toEqual([
      'Combina solicitud_contrato (sc) con persona (per_age) cuando `per_age.id = sc.id_agente`. Quedan solo las filas con coincidencia en las dos tablas.',
      'Combina el resultado con garantia (g) cuando `g.id_solicitud = sc.id`. Quedan solo las filas con coincidencia.',
      'Combina el resultado con tipo_garantia (tg) cuando `g.id_tipo_garantia = tg.id`. Quedan solo las filas con coincidencia.',
      "Se queda con las filas que cumplen `g.estado <> 'rechazada'`.",
      [
        'Muestra estas columnas:',
        ['`per_age.id` como `id_agente`', '`per_age.nombre` como `nombre_agente`', '`per_age.apellido` como `apellido_agente`', '`sc.id` como `id_solicitud`', '`sc.importe_mensual`', '`tg.nombre` como `tipo_garantia`', '`g.fecha_alta`', '`g.fecha_baja`'],
      ],
      'Ordena por `per_age.apellido`, `per_age.nombre` y `g.fecha_alta` descendente.',
    ]);
  });

  it('301.2: LEFT JOIN con la condición en el on, como dicen los apuntes', () => {
    const sql = `select prop.id id_propiedad, prop.direccion, prop.zona
from propiedad prop
inner join solicitud_contrato sc
  on sc.id_propiedad=prop.id
left join garantia g
  on g.id_solicitud=sc.id
  and g.estado='rechazada'
left join persona per_gar
  on per_gar.id=g.id_garante
where prop.situacion='en oferta';`;
    expect(dice(sql)).toEqual([
      'Combina propiedad (prop) con solicitud_contrato (sc) cuando `sc.id_propiedad = prop.id`. Quedan solo las filas con coincidencia en las dos tablas.',
      "Combina el resultado con garantia (g) cuando `g.id_solicitud = sc.id and g.estado = 'rechazada'`. Quedan todas las filas del resultado. Las de garantia (g), si hay. Si no hay, quedan en nulo.",
      'Combina el resultado con persona (per_gar) cuando `per_gar.id = g.id_garante`. Quedan todas las filas del resultado. Las de persona (per_gar), si hay. Si no hay, quedan en nulo.',
      "Se queda con las filas que cumplen `prop.situacion = 'en oferta'`.",
      'Muestra `prop.id` como `id_propiedad`, `prop.direccion` y `prop.zona`.',
    ]);
  });

  it('301.3: count(*) y count(distinct), WHERE antes de agrupar y HAVING después', () => {
    const sql = `select tg.id, tg.nombre
  , g.estado
  , count(*), count(distinct id_garante)
from tipo_garantia tg
inner join garantia g
  on tg.id=g.id_tipo_garantia
where g.fecha_baja is null
group by tg.id, g.estado
having count(*) >= 5;`;
    expect(dice(sql)).toEqual([
      'Combina tipo_garantia (tg) con garantia (g) cuando `tg.id = g.id_tipo_garantia`. Quedan solo las filas con coincidencia en las dos tablas.',
      'Se queda con las filas que cumplen `g.fecha_baja is null`.',
      'Agrupa las filas por `tg.id` y `g.estado`.',
      'Cuenta las filas de cada grupo.',
      'Cuenta los valores diferentes de `id_garante` en cada grupo.',
      'Se queda con los grupos que cumplen `count(*) >= 5`.',
      ['Muestra estas columnas:', ['`tg.id`', '`tg.nombre`', '`g.estado`', '`count(*)`', '`count(distinct id_garante)`']],
    ]);
  });

  it('301.4: IN y NOT IN con subconsultas, cada una con sus pasos', () => {
    const sql = `select age.id, age.nombre, age.apellido
from persona age
where age.id in ( # se puede hacer con un inner join + distinct
  select aa.id_agente
  from agente_asignado aa
  where aa.fecha_hora_desde between '20250101' and '20251231T235959'
  )
  and age.id not in (
  select v.id_agente
  from visita v
  where v.fecha_hora_visita between '20250101' and '20251231T235959'
  );`;
    expect(dice(sql)).toEqual([
      'Toma las filas de persona (age).',
      [
        'Se queda con las filas que cumplen `age.id in (subconsulta 1) and age.id not in (subconsulta 2)`.',
        [
          ['La subconsulta 1 arma la lista del `IN`.', ['Toma las filas de agente_asignado (aa).', "Se queda con las filas que cumplen `aa.fecha_hora_desde between '20250101' and '20251231T235959'`.", 'Devuelve `aa.id_agente`.']],
          ['La subconsulta 2 arma la lista del `NOT IN`.', ['Toma las filas de visita (v).', "Se queda con las filas que cumplen `v.fecha_hora_visita between '20250101' and '20251231T235959'`.", 'Devuelve `v.id_agente`.']],
        ],
      ],
      'Muestra `age.id`, `age.nombre` y `age.apellido`.',
    ]);
  });

  it('301.5: WITH, las tablas comunes primero', () => {
    const sql = `with imp as (
  select sc.id_propiedad, max(sc.importe_mensual) max_imp
  from solicitud_contrato sc
  where sc.estado='en alquiler'
  group by sc.id_propiedad
), cant as (
  select sc.id_propiedad, count(sc.nro_contrato) cant_contratos
  , count(*)-count(sc.nro_contrato) cant_sin_contratos
  from solicitud_contrato sc
  group by sc.id_propiedad
)
select p.id id_propiedad, max_imp, cant.cant_contratos
from propiedad p
left join imp
  on p.id=imp.id_propiedad
left join cant
  on p.id=cant.id_propiedad`;
    expect(dice(sql)).toEqual([
      [
        'Arma la tabla común `imp`.',
        ['Toma las filas de solicitud_contrato (sc).', "Se queda con las filas que cumplen `sc.estado = 'en alquiler'`.", 'Agrupa las filas por `sc.id_propiedad`.', 'Busca el mayor `sc.importe_mensual` de cada grupo.', 'Devuelve `sc.id_propiedad` y `max(sc.importe_mensual)` como `max_imp`.'],
      ],
      [
        'Arma la tabla común `cant`.',
        [
          'Toma las filas de solicitud_contrato (sc).',
          'Agrupa las filas por `sc.id_propiedad`.',
          'Cuenta las filas de cada grupo con `sc.nro_contrato` no nulo.',
          'Cuenta las filas de cada grupo.',
          'Devuelve `sc.id_propiedad`, `count(sc.nro_contrato)` como `cant_contratos` y `count(*) - count(sc.nro_contrato)` como `cant_sin_contratos`.',
        ],
      ],
      'Combina propiedad (p) con la tabla común imp cuando `p.id = imp.id_propiedad`. Quedan todas las filas de propiedad (p). Las de la tabla común imp, si hay. Si no hay, quedan en nulo.',
      'Combina el resultado con la tabla común cant cuando `p.id = cant.id_propiedad`. Quedan todas las filas del resultado. Las de la tabla común cant, si hay. Si no hay, quedan en nulo.',
      'Muestra `p.id` como `id_propiedad`, `max_imp` y `cant.cant_contratos`.',
    ]);
  });

  it('301.6: la transacción, sentencia por sentencia (INTO, INSERT, INSERT … SELECT y UPDATE)', () => {
    expect(dice("select id into @sheridan\nfrom persona\nwhere nombre='John' and apellido='Sheridan';")).toEqual(['Toma las filas de persona.', "Se queda con las filas que cumplen `nombre = 'John' and apellido = 'Sheridan'`.", 'Guarda `id` en `@sheridan`.']);
    expect(dice("insert into persona (tipo_doc, nro_doc, nombre)\nvalues ('ssn', '94890124', 'Jeffrey');")).toEqual(['Agrega 1 fila a persona. Completa `tipo_doc`, `nro_doc` y `nombre`.']);
    expect(dice('select last_insert_id() into @sinclair;')).toEqual(['Guarda `last_insert_id()` en `@sinclair`.']);
    expect(dice('insert into agente_asignado (id_agente, id_propiedad, fecha_hora_desde)\nselect @sinclair, id_propiedad, now()\nfrom agente_asignado\nwhere id_agente=@sheridan #puede hacerse con join\nand fecha_hora_hasta is null;')).toEqual([
      'Toma las filas de agente_asignado.',
      'Se queda con las filas que cumplen `id_agente = @sheridan and fecha_hora_hasta is null`.',
      'Arma cada fila nueva con `@sinclair`, `id_propiedad` y `now()`.',
      'Agrega esas filas a agente_asignado. Completa `id_agente`, `id_propiedad` y `fecha_hora_desde`.',
    ]);
    expect(dice('update agente_asignado\nset fecha_hora_hasta=now()\nwhere id_agente=@sheridan;')).toEqual(['Toma las filas de agente_asignado que cumplen `id_agente = @sheridan`.', 'En esas filas pone `fecha_hora_hasta = now()`.']);
  });

  it('el UPDATE con JOIN de MySQL, el LEFT JOIN con group by por número y el DELETE sin WHERE', () => {
    expect(dice('update encargado_evento\ninner join rol on rol.descripcion = encargado_evento.rol\nset encargado_evento.rol = rol.codigo;')).toEqual([
      'Combina encargado_evento con rol cuando `rol.descripcion = encargado_evento.rol`. Quedan solo las filas con coincidencia en las dos tablas.',
      'En esas filas pone `encargado_evento.rol = rol.codigo`.',
    ]);
    expect(dice('select em.cuil, COUNT(ev.cuilempleado)\nfrom empleados em\nLEFT join eventos ev\non ev.cuilempleado = em.cuil\ngroup by 1;')).toEqual([
      'Combina empleados (em) con eventos (ev) cuando `ev.cuilempleado = em.cuil`. Quedan todas las filas de empleados (em). Las de eventos (ev), si hay. Si no hay, quedan en nulo.',
      'Agrupa las filas por la columna 1.',
      'Cuenta las filas de cada grupo con `ev.cuilempleado` no nulo.',
      'Muestra `em.cuil` y `COUNT(ev.cuilempleado)`.',
    ]);
    expect(dice('delete from visita where id_agente = 1')).toEqual(['Toma las filas de visita que cumplen `id_agente = 1`.', 'Borra esas filas. La tabla sigue.']);
    expect(dice('delete from visita')).toEqual(['Toma todas las filas de visita, porque no tiene `WHERE`.', 'Borra esas filas. La tabla sigue.']);
  });
});

describe('qué hace una consulta: lo demás que se escribe', () => {
  it('producto cartesiano, producto natural, tabla derivada y una subconsulta que usa la fila de afuera', () => {
    expect(dice('select * from (select a, b from t) x, u where x.a = u.a')).toEqual([
      ['Arma el producto cartesiano de la subconsulta x y u. Son todas las combinaciones de filas.', ['Toma las filas de t.', 'Devuelve `a` y `b`.']],
      'Se queda con las filas que cumplen `x.a = u.a`.',
      'Muestra todas las columnas.',
    ]);
    expect(dice('select a.nombre, (select max(n.nota) from notas n where n.legajo = a.legajo) mejor from alumnos a natural join inscripciones')).toEqual([
      'Hace el producto natural de alumnos (a) e inscripciones. Combina por las columnas que se llaman igual.',
      [
        'Muestra `a.nombre` y `(subconsulta 1)` como `mejor`.',
        [['La subconsulta 1 da un solo valor. Usa `a.legajo` de la consulta de afuera. Se corre de nuevo para cada fila.', ['Toma las filas de notas (n).', 'Se queda con las filas que cumplen `n.legajo = a.legajo`.', 'Toma todas las filas como un solo grupo.', 'Busca el mayor `n.nota`.', 'Devuelve `max(n.nota)`.']]],
      ],
    ]);
  });

  it('EXISTS, DISTINCT, UNION y LIMIT', () => {
    expect(dice('select distinct t.a from t where not exists (select 1 from u where u.id = t.id) limit 10 offset 5')).toEqual([
      'Toma las filas de t.',
      ['Se queda con las filas que cumplen `not exists (subconsulta 1)`.', [['La subconsulta 1 es la del `NOT EXISTS`. Cumple si no trae ninguna fila. Usa `t.id` de la consulta de afuera. Se corre de nuevo para cada fila.', ['Toma las filas de u.', 'Se queda con las filas que cumplen `u.id = t.id`.', 'Devuelve `1`.']]]],
      'Muestra `t.a`.',
      'Saca las filas repetidas (`DISTINCT`).',
      'Saltea 5 filas. Se queda con las 10 siguientes.',
    ]);
    expect(dice('select nombre from alumnos union select nombre from docentes order by 1 limit 1')).toEqual([
      ['Consulta 1.', ['Toma las filas de alumnos.', 'Devuelve `nombre`.']],
      ['Consulta 2.', ['Toma las filas de docentes.', 'Devuelve `nombre`.']],
      'Une las filas de las consultas 1 y 2 (`UNION`). Saca las repetidas.',
      'Ordena por la columna 1.',
      'Se queda con la primera fila.',
    ]);
  });

  it('lo que no conoce no lo adivina', () => {
    for (const sql of ['CREATE TABLE a (id INT)', 'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT x FROM n', 'SELECT a, row_number() OVER (ORDER BY a) FROM t', 'SELECT * FROM t WHERE a > ALL (SELECT b FROM u)', 'REPLACE INTO t VALUES (1)', 'INSERT INTO t VALUES (1) ON DUPLICATE KEY UPDATE a = 2', 'DELETE t FROM t JOIN u ON u.id = t.id', 'SELECT * FROM t FULL JOIN u ON u.id = t.id', 'SELECT * FROM json_each(x)', 'SELECT a FROM t GROUP BY a WITH ROLLUP', 'SELECT * FROM t WHERE', "SELECT 'sin cerrar", '']) {
      expect(queHace(sql), sql).toBeNull();
    }
  });
});
