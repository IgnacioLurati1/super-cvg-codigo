// @vitest-environment node
// Checking the code while the student types, with the real engines (the ones the site serves), without the workers and
// without running anything: C compiles, JavaScript compiles, SQL prepares in a database apart and Python compiles and
// goes through pyflakes.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { compilar, prepararC, proyectoDe } from './cMotor';
import { prepararJs, revisarJs } from './jsMotor';
import { REVISOR_PYTHON } from './modulos';
import { marcasDeLaRevision, marcasDelArbol } from './revisar';
import { REVISOR_PY } from './revisarPython';
import { revisarSql } from './sqlRevisar';

const vendor = (...ruta) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../vendor', ...ruta)));

describe('C: compila sin correr', () => {
  let c;
  beforeAll(async () => {
    c = await prepararC(vendor('xcc', 'wccfiles.zip'));
  }, 30_000);

  const revisar = async (pedido) => {
    const r = await compilar(c, proyectoDe(pedido));
    return { error: r.error ?? null, linea: r.linea ?? 0, archivo: r.archivo ?? null, avisos: r.avisos ?? [] };
  };

  it('un `;` que falta marca su línea', async () => {
    const r = await revisar({ codigo: '#include <stdio.h>\n\nint main(void) {\n    int x = \n    return 0;\n}\n', nombre: 'tu_codigo.c' });
    const marcas = marcasDeLaRevision('c', r, { abierto: 'tu_codigo.c', principal: 'tu_codigo.c' });
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toMatchObject({ tono: 'error' });
    expect([4, 5]).toContain(marcas[0].linea);
    expect(marcas[0].texto.length).toBeGreaterThan(5);
  });

  it('un bucle infinito no se corre: compila y no marca nada', async () => {
    const desde = performance.now();
    const r = await revisar({ codigo: 'int main(void) {\n    while (1) {}\n}\n', nombre: 'tu_codigo.c' });
    expect(r.error).toBeNull();
    expect(marcasDeLaRevision('c', r, { abierto: 'tu_codigo.c', principal: 'tu_codigo.c' })).toEqual([]);
    expect(performance.now() - desde).toBeLessThan(2000);
  });

  it('en un proyecto, cada error y aviso en su archivo', async () => {
    const archivos = [
      { nombre: 'main.c', contenido: '#include "lista.h"\nint main(void) {\n    return suma(1, 2);\n}\n' },
      { nombre: 'lista.h', contenido: 'int suma(int a, int b);\n' },
      { nombre: 'lista.c', contenido: '#include "lista.h"\nint suma(int a, int b) {\n    return a + b\n}\n' },
    ];
    const r = await revisar({ archivos, principal: 'main.c' });
    expect(r.archivo).toBe('lista.c');
    expect(marcasDeLaRevision('c', r, { abierto: 'lista.c', principal: 'main.c' })).toEqual([expect.objectContaining({ tono: 'error', linea: expect.any(Number) })]);
    expect(marcasDeLaRevision('c', r, { abierto: 'main.c', principal: 'main.c' })).toEqual([]);
  });
});

describe('JavaScript: QuickJS compila sin evaluar', () => {
  let motor;
  beforeAll(async () => {
    motor = await prepararJs(vendor('js', 'quickjs.wasm'));
  }, 30_000);

  it('el error de sintaxis, con su línea', () => {
    const r = revisarJs(motor, { codigo: 'const a = 1;\nif (a > 0 {\n  console.log(a);\n}\n', nombre: 'main.js' });
    expect(r.linea).toBe(2);
    expect(marcasDeLaRevision('javascript', r, { abierto: 'main.js', principal: 'main.js' })[0]).toMatchObject({ linea: 2, tono: 'error' });
  });

  it('lo que solo falla al correr no se marca, y un bucle infinito no corre', () => {
    expect(revisarJs(motor, { codigo: 'pirnt(1);\nwhile (true) {}\n', nombre: 'main.js' }).error).toBeNull();
  });

  it('un módulo con import y un await afuera de una función compilan; un import que falta, no', () => {
    const codigo = "import { suma } from './utiles.js';\nconsole.log(suma(1, 2));\n";
    const archivos = [{ nombre: 'main.js', contenido: codigo }, { nombre: 'utiles.js', contenido: 'export const suma = (a, b) => a + b;\nwhile (true) {}\n' }];
    expect(revisarJs(motor, { codigo, nombre: 'main.js', archivos }).error).toBeNull();
    expect(revisarJs(motor, { codigo, nombre: 'main.js', archivos: archivos.slice(0, 1) })).toMatchObject({ linea: 1, archivo: 'main.js' });
    expect(revisarJs(motor, { codigo: 'const x = await Promise.resolve(1);\nconsole.log(x);\n', nombre: 'main.js' }).error).toBeNull();
  });
});

describe('SQL: cada sentencia preparada, sin correr y sin tocar la base', () => {
  let SQL;
  let db;
  beforeAll(async () => {
    SQL = await initSqlJs();
    db = new SQL.Database();
    db.run("CREATE TABLE persona (id INTEGER PRIMARY KEY, nombre TEXT); INSERT INTO persona VALUES (1, 'Ana');");
  });

  it('una palabra mal escrita marca su línea', () => {
    const r = revisarSql(SQL, db, 'SELECT *\nFORM persona;\n');
    expect(r.error).toMatch(/syntax error/);
    expect(r.linea).toBe(2);
  });

  it('lo que crea el archivo cuenta para lo que sigue, y la base de la pestaña queda igual', () => {
    const codigo = 'CREATE TABLE alumno (legajo INTEGER, nombre TEXT);\nINSERT INTO alumno VALUES (1, \'Lu\');\nDELETE FROM persona;\nDROP TABLE persona;\nSELECT legajo FROM alumno;\n';
    expect(revisarSql(SQL, db, codigo)).toEqual({ error: null, linea: 0 });
    expect(db.exec('SELECT count(*) FROM persona')[0].values[0][0]).toBe(1);
    expect(db.exec("SELECT count(*) FROM sqlite_schema WHERE name = 'alumno'")[0].values[0][0]).toBe(0);
  });

  it('una tabla que la base ya tiene, hecha de nuevo con otras columnas', () => {
    expect(revisarSql(SQL, db, 'CREATE TABLE persona (dni INTEGER);\nSELECT dni FROM persona;\n').error).toBeNull();
    const r = revisarSql(SQL, db, 'SELECT apellido FROM persona;\n');
    expect(r.error).toMatch(/no such column: apellido/);
  });

  it('una consulta recursiva sin fin no corre', () => {
    const codigo = 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT x FROM c;\nCREATE TABLE t AS WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT x FROM c;\nSELECT x FROM t;\n';
    expect(revisarSql(SQL, db, codigo)).toEqual({ error: null, linea: 0 });
  });
});

describe('Python: compile() y pyflakes, sin correr', () => {
  let py;
  let revisarPy;
  beforeAll(async () => {
    py = await loadPyodide({ env: { HOME: '/home/alumno' }, jsglobals: Object.create(null), stdout: () => {}, stderr: () => {} });
    const sitio = py.runPython('import site; site.getsitepackages()[0]');
    py.unpackArchive(vendor('python', REVISOR_PYTHON.archivo), 'wheel', { extractDir: sitio });
    py.runPython(REVISOR_PY, { filename: '<laboratorio>' });
    revisarPy = py.globals.get('_revisar');
  }, 120_000);

  const revisar = (codigo) => {
    const x = revisarPy(codigo, 'main.py');
    const [error, linea, marcas] = x.toJs();
    x.destroy();
    return marcasDeLaRevision('python', { error, linea, marcas }, { abierto: 'main.py', principal: 'main.py' });
  };

  it('`pirnt(1)`: no está definido, con lo que quiso decir', () => {
    expect(revisar('x = 1\npirnt(x)\n')).toEqual([{ linea: 2, tono: 'error', texto: '`pirnt` no está definido. ¿Quisiste decir `print`?' }]);
  });

  it('un error de sintaxis, con su línea y como lo dice Python', () => {
    const [m] = revisar('def f(:\n    return 1\n');
    expect(m).toMatchObject({ linea: 1, tono: 'error' });
    expect(m.texto).toMatch(/^SyntaxError: /);
    expect(revisar('print((1, 2)\nx = 3\n')[0].texto).toMatch(/no lo cerraste con su `\)`/);
  });

  it('imports sin usar y avisos de compile()', () => {
    expect(revisar('import os\nimport math\nprint(math.pi)\n')).toEqual([{ linea: 1, tono: 'aviso', texto: '`os` se importa y no se usa.' }]);
    expect(revisar('x = 1\nif x is 1:\n    print(x)\n')).toEqual([expect.objectContaining({ linea: 2, tono: 'aviso' })]);
  });

  it('un bucle infinito no se corre', () => {
    expect(revisar('while True:\n    pass\n')).toEqual([]);
  });

  it('lo que importa del proyecto o con * no es un nombre sin definir', () => {
    expect(revisar('from utiles import *\nsuma(1, 2)\n').filter((m) => m.tono === 'error')).toEqual([]);
    expect(revisar('import utiles\nprint(utiles.suma(1, 2))\n')).toEqual([]);
  });
});

describe('Python sin su motor: el árbol del editor', () => {
  it('marca dónde algo no cierra, sin nombrar el error', () => {
    const marcas = marcasDelArbol('python', 'x = (1, 2\nprint(x)\n');
    expect(marcas).toHaveLength(1);
    expect(marcas[0]).toMatchObject({ tono: 'error', texto: 'Algo no cierra acá.' });
    expect(marcasDelArbol('python', 'x = (1, 2)\nprint(x)\n')).toEqual([]);
  });
});
