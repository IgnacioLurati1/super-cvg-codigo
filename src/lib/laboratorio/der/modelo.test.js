import { describe, expect, it } from 'vitest';
import { INSTRUMENTOS } from './instrumentos.fixture';
import { cardLimpia, derEnTexto, derVacio, leerCard, leerDer, tipoLimpio, tipoParecido } from './modelo';

describe('el archivo .der', () => {
  it('vacío, y de ida y vuelta queda igual', () => {
    expect(leerDer(derEnTexto(derVacio()))).toEqual(derVacio());
    const texto = derEnTexto(INSTRUMENTOS);
    expect(leerDer(texto)).toEqual(INSTRUMENTOS);
    expect(derEnTexto(leerDer(texto))).toBe(texto);
  });

  it('el texto va compacto, y los guardados con sangría se leen igual', () => {
    const texto = derEnTexto(INSTRUMENTOS);
    expect(texto.trim()).not.toContain('\n');
    expect(leerDer(JSON.stringify(JSON.parse(texto), null, 1))).toEqual(INSTRUMENTOS);
  });

  it('el óvalo corrido queda con su forma, recortado; sin él, va arriba', () => {
    const der = leerDer(JSON.stringify({
      v: 1,
      entidades: [
        { id: 'a', nombre: 'a', ovalo: { dx: 40.04, dy: -1e9 } },
        { id: 'b', nombre: 'b', ovalo: { dx: 'x' } },
        { id: 'c', nombre: 'c', ovalo: 3 },
      ],
      vinculos: [{ id: 'v', nombre: 'v', ovalo: { dx: -120, dy: 60 }, puntas: [{ a: 'a' }, { a: 'b' }] }],
    }));
    expect(der.entidades.map((e) => e.ovalo)).toEqual([{ dx: 40, dy: -2000 }, { dx: 0, dy: 0 }, undefined]);
    expect('ovalo' in der.entidades[2]).toBe(false);
    expect(der.vinculos[0].ovalo).toEqual({ dx: -120, dy: 60 });
    expect(leerDer(derEnTexto(der))).toEqual(der);
  });

  it('el texto no depende del orden de las claves de las decisiones', () => {
    const otro = { ...INSTRUMENTOS, decisiones: { ...INSTRUMENTOS.decisiones, cp: Object.fromEntries(Object.entries(INSTRUMENTOS.decisiones.cp).reverse()) } };
    expect(derEnTexto(otro)).toBe(derEnTexto(INSTRUMENTOS));
  });

  it('lo que no es un DER da null, sin tirar', () => {
    for (const t of [undefined, '', 'hola', '[]', 'null', '{"v":2}', '{"v":"1"}', '{', 'x'.repeat(1_000_001)]) expect(leerDer(t)).toBeNull();
    expect(leerDer('{"v":1}')).toEqual(derVacio());
  });

  it('descarta lo que no lee: ids malos o repetidos, puntas a nada, decisiones de otro', () => {
    const der = leerDer(
      JSON.stringify({
        v: 1,
        entidades: [
          { id: 'a', nombre: '  cliente\n‮nuevo  ', x: 1e9, y: 'x', atributos: [{ id: 'a1', nombre: 'id', clave: 'si' }, { id: 'a1', nombre: 'otro' }, 'nada'] },
          { id: 'a', nombre: 'repetida' },
          { id: '__proto__', nombre: 'mala' },
          { id: 'b', nombre: 'x'.repeat(200), debil: 1 },
        ],
        vinculos: [{ id: 'v', nombre: 'compra', puntas: [{ a: 'a', card: '0..n' }, { a: 'zzz', card: '1:1' }, { a: 'b', card: '1:N', rol: 7 }] }],
        jerarquias: [{ id: 'j', superclase: 'a', subclases: ['b', 'a', 'b', 'q'], tipo: 'X', pasaje: 'otro' }, { id: 'k', superclase: 'q' }],
        agregaciones: [{ id: 'g', vinculo: 'v' }, { id: 'h', vinculo: 'v' }, { id: 'i', vinculo: 'nada' }],
        decisiones: { cp: { v: ['a', 'a', 3, ''], otro: ['x'] }, lado11: { v: 'zzz' }, tipos: { 'a.id': 'int auto_increment', 'a.x': 'DROP TABLE', sinpunto: 'INT' } },
        extra: 'afuera',
      }).replace('"sinpunto"', '"__proto__":"INT","sinpunto"'),
    );
    expect(der.entidades.map((e) => e.id)).toEqual(['a', 'b']);
    expect(der.entidades[0]).toMatchObject({ nombre: 'cliente nuevo', x: 100000, y: 0, debil: false });
    expect(der.entidades[0].atributos).toEqual([{ id: 'a1', nombre: 'id', clave: false, multivaluado: false, derivado: false, partes: [] }]);
    expect(der.entidades[1].nombre).toHaveLength(64);
    expect(der.entidades[1].debil).toBe(false);
    expect(der.vinculos[0].puntas).toEqual([{ a: 'a', card: '0:N', rol: '' }, { a: 'b', card: '1:N', rol: '' }]);
    expect(der.jerarquias).toEqual([{ id: 'j', x: 0, y: 0, superclase: 'a', subclases: ['b'], tipo: 'D', total: false, pasaje: 'superclase' }]);
    expect(der.agregaciones).toEqual([{ id: 'g', nombre: '', vinculo: 'v' }]);
    expect(der.decisiones).toEqual({ cp: { v: ['a'] }, lado11: {}, tipos: { 'a.id': 'INT AUTO_INCREMENT' } });
    expect(Object.getPrototypeOf(der.decisiones.tipos)).toBe(Object.prototype);
    expect('extra' in der).toBe(false);
  });

  it('recorta cantidades y anidamientos', () => {
    let parte = { id: 'p0', nombre: 'p0', partes: [] };
    for (let i = 1; i < 10; i++) parte = { id: `p${i}`, nombre: `p${i}`, partes: [parte] };
    const der = leerDer(JSON.stringify({ v: 1, entidades: [...Array(500)].map((_, i) => ({ id: `e${i}`, nombre: `e${i}`, atributos: i ? [] : [parte] })) }));
    expect(der.entidades).toHaveLength(200);
    let profundidad = 0;
    for (let a = der.entidades[0].atributos[0]; a; a = a.partes[0]) profundidad++;
    expect(profundidad).toBe(3);
  });

  it('la cardinalidad como la escribe la cátedra', () => {
    expect(['0:N', '1:1', ' 1 : m ', '0..N', '1:L', '0:2'].map(cardLimpia)).toEqual(['0:N', '1:1', '1:M', '0:N', '1:L', '0:2']);
    expect(['', 'N', '1:', '1:NN', '1-1', 3].map(cardLimpia)).toEqual(['', '', '', '', '', '']);
    expect(leerCard('0:N')).toEqual({ min: 0, muchos: true });
    expect(leerCard('1:1')).toEqual({ min: 1, muchos: false });
    expect(leerCard('0:2')).toEqual({ min: 0, muchos: true });
    expect(leerCard('')).toBeNull();
  });

  it('los tipos de MySQL que acepta la vista de tablas', () => {
    expect(['int', 'varchar( 45 )', 'decimal(10, 2)', 'INT  UNSIGNED auto_increment', 'datetime'].map(tipoLimpio)).toEqual(['INT', 'VARCHAR(45)', 'DECIMAL(10,2)', 'INT UNSIGNED AUTO_INCREMENT', 'DATETIME']);
    expect(['INT; DROP TABLE x', 'VARCHAR', 'ENUM(1)', null].map(tipoLimpio)).toEqual(['', '', '', '']);
    // What a student writes in Spanish, or without the size, gets the MySQL type it means.
    expect(['ENTERO', 'entero', 'Número', 'texto', 'VARCHAR', 'decimal', 'fecha', 'Fecha y hora', 'hora', 'año', 'booleano', 'int(11)', 'entero sin signo'].map(tipoParecido)).toEqual([
      'INT', 'INT', 'INT', 'VARCHAR(100)', 'VARCHAR(100)', 'DECIMAL(10,2)', 'DATE', 'DATETIME', 'TIME', 'YEAR', 'BOOLEAN', 'INT', 'INT UNSIGNED',
    ]);
    expect(['INT', 'ENUM(1)', 'cualquier cosa', null].map(tipoParecido)).toEqual(['', '', '', '']);
    expect(['INT', 'VARCHAR(100)', 'DECIMAL(10,2)', 'DATE', 'DATETIME', 'TIME', 'YEAR', 'BOOLEAN', 'INT UNSIGNED', 'CHAR(1)', 'TEXT', 'BIGINT', 'SMALLINT'].every((t) => tipoLimpio(t) === t)).toBe(true);
  });
});
