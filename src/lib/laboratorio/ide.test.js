// The IDE of the lab (docs/laboratorio-ide.md): what programs write, kept in the memory of the tab, and projects as zips.
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { anotarCorrida, descartarEscrito, escritosDe, mudarEscritos, paraLaCorrida, sumarEscrito, textoDe } from './escritos';
import { olvidarLaboratorio } from './pendiente';
import { MAX_CODIGO } from './saneo';
import { leerSubido, leerZip, partirNombre, textoSubido, zipDeCarpetas, zipDeProyecto } from './zip';

const bytes = (t) => new TextEncoder().encode(t);

describe('lo que escribe el programa', () => {
  const propios = [
    { nombre: 'main.c', contenido: 'int main(void){}' },
    { nombre: 'notas.txt', contenido: 'Ana 8\n' },
    { nombre: 'viejo.txt', contenido: 'x' },
  ];

  it('marca lo cambiado, lo nuevo y lo borrado; lo que volvió igual no', () => {
    olvidarLaboratorio();
    const dat = new Uint8Array([1, 0, 0, 0, 65, 0]);
    anotarCorrida('qabc12345', propios, {
      cambiados: [
        { nombre: 'notas.txt', contenido: bytes('Ana 8\r\n') },
        { nombre: 'alumnos.dat', contenido: dat },
        { nombre: 'reporte.txt', contenido: bytes('Promedio: 8\n') },
      ],
      borrados: ['viejo.txt', 'temporal.txt'],
    });
    const lista = escritosDe('qabc12345');
    expect(lista.map((e) => [e.nombre, e.texto, e.borrado])).toEqual([
      ['alumnos.dat', null, false],
      ['reporte.txt', 'Promedio: 8\n', false],
      ['viejo.txt', null, true],
    ]);
    // The next run gets the folder as this one left it: the binary .dat included, the deleted one not.
    expect(paraLaCorrida(propios, 'qabc12345').map((a) => [a.nombre, typeof a.contenido === 'string' ? a.contenido : [...a.contenido]])).toEqual([
      ['main.c', 'int main(void){}'],
      ['notas.txt', 'Ana 8\n'],
      ['alumnos.dat', [...dat]],
      ['reporte.txt', [...bytes('Promedio: 8\n')]],
    ]);
    // Another place sees nothing of it.
    expect(escritosDe('qotro1234')).toEqual([]);
    expect(paraLaCorrida(propios, 'qotro1234')).toBe(propios);
  });

  it('descartar, mudar y salir', () => {
    olvidarLaboratorio();
    sumarEscrito('mesa-1', 'datos.dat', new Uint8Array([0, 1]));
    sumarEscrito('mesa-1', 'otro.txt', bytes('hola'));
    descartarEscrito('mesa-1', 'otro.txt');
    mudarEscritos('mesa-1', 'labc12345');
    expect(escritosDe('mesa-1')).toEqual([]);
    expect(escritosDe('labc12345').map((e) => e.nombre)).toEqual(['datos.dat']);
    olvidarLaboratorio();
    expect(escritosDe('labc12345')).toEqual([]);
  });

  it('texto o binario', () => {
    expect(textoDe(bytes('a\r\nb'))).toBe('a\nb');
    expect(textoDe(new Uint8Array([0x41, 0]))).toBe(null);
    expect(textoDe(new Uint8Array([0xff, 0xfe, 0x41]))).toBe(null);
  });
});

describe('subir y bajar', () => {
  it('un .txt de Windows llega con \\n y sus acentos', () => {
    expect(textoSubido(new Uint8Array([0x47, 0xf3, 0x6d, 0x65, 0x7a, 0x0d, 0x0a, 0x38]))).toBe('Gómez\n8');
    expect(leerSubido('notas.txt', bytes('﻿Ana;8\r\nLuis;7\r\n'), 'c')).toEqual({ nombre: 'notas', ext: 'txt', codigo: 'Ana;8\nLuis;7\n' });
    expect(leerSubido('alumnos.dat', new Uint8Array([1, 0, 2]), 'c')).toMatchObject({ nombre: 'alumnos', ext: 'dat' });
    expect(leerSubido('foto.png', bytes('x'), 'c')).toEqual({ problema: 'extension' });
    expect(leerSubido('main.py', bytes('x'), 'c')).toEqual({ problema: 'extension' });
    expect(leerSubido('main.c', new Uint8Array([0, 1]), 'c')).toEqual({ problema: 'binario' });
    expect(leerSubido('main.c', bytes('x'.repeat(MAX_CODIGO + 1)), 'c')).toEqual({ problema: 'largo' });
  });

  it('nombres raros quedan afuera', () => {
    expect(partirNombre('../main.c')).toBe(null);
    expect(partirNombre('a/main.c')).toBe(null);
    expect(partirNombre('.oculto.c')).toBe(null);
    expect(partirNombre('C:main.c')).toBe(null);
    expect(partirNombre('Mi TP.C')).toEqual({ nombre: 'Mi TP', ext: 'c' });
  });

  it('un zip de una carpeta: los archivos de su lenguaje, sin rutas raras, y el .dat binario aparte', () => {
    const zip = zipSync({
      'TP1/main.c': strToU8('#include "notas.h"\r\nint main(void){return 0;}'),
      'TP1/notas.h': strToU8('int x;'),
      'TP1/alumnos.dat': new Uint8Array([7, 0, 0, 0]),
      'TP1/datos.csv': strToU8('a;b'),
      'TP1/foto.png': new Uint8Array([137, 80]),
      'TP1/sub/otro.c': strToU8('int y;'),
      'TP1/../fuera.c': strToU8('int z;'),
      'TP1/.oculto.c': strToU8(''),
      '__MACOSX/TP1/._main.c': strToU8(''),
    });
    const r = leerZip(zip);
    expect(r.lenguaje).toBe('c');
    expect(r.archivos.map((a) => `${a.nombre}.${a.ext}`)).toEqual(['datos.csv', 'main.c', 'notas.h']);
    expect(r.archivos.find((a) => a.ext === 'c').codigo).toBe('#include "notas.h"\nint main(void){return 0;}');
    expect(r.binarios.map((a) => [a.nombre, [...a.bytes]])).toEqual([['alumnos', [7, 0, 0, 0]]]);
    // What climbs out (..) or is hidden doesn't even unpack; what's in a folder or of another kind is said.
    expect(r.afuera.sort()).toEqual(['TP1/sub/otro.c', 'foto.png']);
  });

  it('un zip de JavaScript trae sus .js y sus datos', () => {
    const r = leerZip(zipSync({ 'main.js': strToU8("import { f } from './f.js';"), 'f.js': strToU8('export const f = 1;'), 'datos.json': strToU8('{}'), 'notas.py': strToU8('x = 1') }));
    expect(r.lenguaje).toBe('javascript');
    expect(r.archivos.map((a) => `${a.nombre}.${a.ext}`)).toEqual(['datos.json', 'f.js', 'main.js']);
    expect(r.afuera).toEqual(['notas.py']);
  });

  it('lo que no es un zip de un proyecto', () => {
    expect(leerZip(bytes('no soy un zip'))).toEqual({ problema: 'roto' });
    expect(leerZip(zipSync({ 'leeme.txt': strToU8('hola') }))).toEqual({ problema: 'sin-codigo' });
    expect(leerZip(zipSync({}))).toEqual({ problema: 'vacio' });
  });

  it('bajar el proyecto y subirlo de nuevo da lo mismo', () => {
    const zip = zipDeProyecto('Notas', [
      { nombre: 'main.py', contenido: 'print("hola")\n' },
      { nombre: 'datos.dat', contenido: new Uint8Array([0, 1, 2]) },
    ]);
    expect(Object.keys(unzipSync(zip))).toEqual(['Notas/main.py', 'Notas/datos.dat']);
    const r = leerZip(zip);
    expect(r.lenguaje).toBe('python');
    expect(r.archivos).toEqual([{ nombre: 'main', ext: 'py', codigo: 'print("hola")\n' }]);
    expect(r.binarios.map((b) => b.nombre)).toEqual(['datos']);
  });

  it('la carpeta compartida entera: cada proyecto en su carpeta, sin pisarse', () => {
    const zip = zipDeCarpetas([
      { carpeta: 'TP Mochila', archivos: [{ nombre: 'main.py', contenido: 'x = 1' }] },
      { carpeta: 'Consultas', archivos: [{ nombre: 'main.sql', contenido: 'SELECT 1;' }] },
      { carpeta: 'consultas', archivos: [{ nombre: 'otra.sql', contenido: 'SELECT 2;' }] },
    ]);
    expect(Object.keys(unzipSync(zip))).toEqual(['TP Mochila/main.py', 'Consultas/main.sql', 'consultas (2)/otra.sql']);
  });
});
