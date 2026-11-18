// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fijarUsuario, mioActual, sanearMio } from '../mio';
import { adivinarLenguaje, pareceCodigo } from './adivinar';
import { armarCodigo, limpiarCodigo } from './desdePdf';
import { partirError } from './error';
import { borrarArchivo, cambiarArchivo, guardarArchivoNuevo, nombreDeArchivo, nombreSugerido } from './guardado';
import { borradorEscrito, guardarMesa, llevarAlLaboratorio, mesaGuardada, olvidarLaboratorio, alOlvidarLaboratorio, tomarDelPdf } from './pendiente';
import { LENGUAJES } from './lenguajes';
import { cerrarRed, SIN_RED } from './red';
import { cabeArchivo, MAX_ARCHIVOS, MAX_CODIGO, MAX_TOTAL, nombreValido, sanearArchivo, sanearLaboratorio } from './saneo';
import { comienzo, final, lineaDelError } from './sqlLinea';

const H = 1_800_000_000_000;
const archivo = (n, extra = {}) => ({ id: `l${String(n).padStart(8, '0')}`, nombre: `Archivo ${n}`, lenguaje: 'python', codigo: 'print(1)', materia: null, creado: H + n, cambiado: H + n, ...extra });

describe('adivinar el lenguaje', () => {
  it('Python, por sus def, sus dos puntos, print e input', () => {
    expect(adivinarLenguaje('def suma(a, b):\n    return a + b\n\nprint(suma(2, 3))').lenguaje).toBe('python');
    expect(adivinarLenguaje('n = int(input("Número: "))\nfor i in range(n):\n    print(i)').lenguaje).toBe('python');
  });

  it('SQL, en mayúsculas o minúsculas, también con JOIN y GROUP BY', () => {
    expect(adivinarLenguaje('SELECT nombre, nivel FROM materias WHERE nivel = 1;').lenguaje).toBe('sql');
    expect(adivinarLenguaje('select m.nombre, count(*) from inscripciones i join materias m on m.id = i.materia group by m.nombre').lenguaje).toBe('sql');
    expect(adivinarLenguaje('INSERT INTO alumnos VALUES (1, "Pérez");').lenguaje).toBe('sql');
    expect(adivinarLenguaje("UPDATE alumnos SET carrera = 'ISI' WHERE legajo = 3;").lenguaje).toBe('sql');
  });

  it('C, y también C++ y Prolog, que todavía no corren', () => {
    expect(adivinarLenguaje('#include <stdio.h>\nint main(void) {\n  printf("hola\\n");\n  return 0;\n}').lenguaje).toBe('c');
    expect(adivinarLenguaje('struct nodo *crear(int valor) {\n    struct nodo *n = malloc(sizeof(struct nodo));\n    n->valor = valor;\n    return n;\n}').lenguaje).toBe('c');
    expect(adivinarLenguaje('#include <iostream>\nusing namespace std;\nint main() { cout << "hola"; }').lenguaje).toBe('cpp');
    expect(adivinarLenguaje('padre(juan, ana).\nabuelo(X, Z) :- padre(X, Y), padre(Y, Z).\n?- abuelo(juan, Q).').lenguaje).toBe('prolog');
  });

  it('JavaScript, también el del apunte de Desarrollo de Software', () => {
    const getAge = 'function getAge(dateString) {\n    var today = new Date();\n    var birthDate = new Date(dateString);\n    var age = today.getFullYear() - birthDate.getFullYear();\n    var m = today.getMonth() - birthDate.getMonth();\n    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {\n    age--;\n    }\n    return age;\n}';
    expect(adivinarLenguaje(getAge).lenguaje).toBe('javascript');
    expect(adivinarLenguaje('function coincidencias(base, lista){}').lenguaje).toBe('javascript');
    expect(adivinarLenguaje('const doble = (n) => n * 2;\nconsole.log([1, 2, 3].map(doble));').lenguaje).toBe('javascript');
    expect(adivinarLenguaje("import { suma } from './utiles.js';\nexport default function () {}").lenguaje).toBe('javascript');
    // C and Python keep being theirs.
    expect(adivinarLenguaje('#include <stdio.h>\nint main(void) {\n    for (int i = 0; i < 3; i++) {\n        printf("%d", i);\n    }\n}').lenguaje).toBe('c');
    expect(adivinarLenguaje('import numpy as np\nfrom math import sqrt\nprint(np.array([1, 2]))').lenguaje).toBe('python');
  });

  it('un párrafo de un apunte no es código', () => {
    for (const texto of [
      'Un semáforo cuida la sección crítica.',
      'Para el final conviene repasar el problema del productor y el consumidor. Usa tres semáforos.',
      'Si la nota es mayor que 6, el alumno aprueba: se selecciona de la lista y se lo anota.',
      '',
    ]) expect(pareceCodigo(texto)).toBe(false);
  });
});

describe('el código de un PDF', () => {
  it('vuelve a lo que escribe un teclado: comillas, guiones, ligaduras y espacios raros', () => {
    const pdf = `print(${String.fromCharCode(0x201c)}hola${String.fromCharCode(0x201d)})\nx${String.fromCharCode(0xa0)}=${String.fromCharCode(0x2009)}a ${String.fromCharCode(0x2212)} 1\n${String.fromCharCode(0xfb01)}n = ${String.fromCharCode(0x2018)}x${String.fromCharCode(0x2019)}${String.fromCharCode(0x200b)}`;
    expect(limpiarCodigo(pdf)).toBe("print(\"hola\")\nx = a - 1\nfin = 'x'");
  });

  it('saca el margen que comparten las líneas, los espacios del final y las líneas vacías de los bordes', () => {
    expect(limpiarCodigo('\n\n    if x:   \n        y()\n    z()\n\n')).toBe('if x:\n    y()\nz()');
    expect(limpiarCodigo('a\tb\r\nc')).toBe('a    b\nc');
  });

  it('arma las líneas y la sangría de dónde empieza cada pedazo, medida en letras', () => {
    const letra = 6.6;
    const linea = (n, sangria, texto) => ({ x: 48 + sangria * letra, y: 100 + n * 15.4, ancho: texto.length * letra, alto: 11, texto, pagina: 1 });
    const piezas = [
      linea(0, 0, 'def factorial(n):'),
      linea(1, 4, 'if n <= 1:'),
      linea(2, 8, 'return 1'),
      linea(3, 4, 'return n * factorial(n - 1)'),
      // A line in two pieces, as pdf.js sometimes splits it, with the space between them as a gap.
      { x: 48, y: 100 + 4 * 15.4, ancho: 9 * letra, alto: 11, texto: 'print(f"{', pagina: 1 },
      { x: 48 + 10 * letra, y: 100 + 4 * 15.4 + 0.4, ancho: 4 * letra, alto: 11, texto: 'n}")', pagina: 1 },
    ];
    expect(armarCodigo([...piezas].reverse())).toBe('def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)\nprint(f"{ n}")');
  });

  it('sin pedazos válidos no inventa nada', () => {
    expect(armarCodigo([])).toBe('');
    expect(armarCodigo([{ x: 0, y: 0, ancho: 0, alto: 0, texto: 'x' }])).toBe('');
  });
});

describe('sanear los archivos', () => {
  it('se queda con lo que sirve y en su forma', () => {
    const a = sanearArchivo({ ...archivo(1), codigo: 'a\r\nb', materia: 7, extra: 'no', nombre: `  Mi${String.fromCharCode(0x2028)}archivo  ` });
    expect(a).toEqual({ id: 'l00000001', nombre: 'Mi archivo', lenguaje: 'python', codigo: 'a\nb', materia: 7, creado: H + 1, cambiado: H + 1 });
    expect(sanearArchivo({ ...archivo(1), materia: 'pabc12345' }).materia).toBe('pabc12345');
  });

  it('descarta lo que no es un archivo del laboratorio', () => {
    for (const malo of [null, 'x', { ...archivo(1), id: 'x1' }, { ...archivo(1), id: '__proto__' }, { ...archivo(1), lenguaje: 'cpp' }, { ...archivo(1), lenguaje: 'toString' }, { ...archivo(1), nombre: '   ' }]) {
      expect(sanearArchivo(malo)).toBe(null);
    }
    expect(sanearArchivo({ ...archivo(1), materia: '<b>' }).materia).toBe(null);
    expect(sanearArchivo({ ...archivo(1), materia: -3 }).materia).toBe(null);
    expect(sanearArchivo({ ...archivo(1), codigo: 5 }).codigo).toBe('');
  });

  it('un nombre ocupa una línea y tiene tope', () => {
    expect(nombreValido('uno\ndos\tTres')).toBe('uno dos Tres');
    expect(nombreValido('x'.repeat(200))).toHaveLength(80);
    expect(nombreValido(3)).toBe('');
  });

  it('la lista: en orden, sin repetidos y dentro de los topes', () => {
    expect(sanearLaboratorio([archivo(2), archivo(1), archivo(2, { nombre: 'Otro' })]).map((a) => a.id)).toEqual(['l00000001', 'l00000002']);
    expect(sanearLaboratorio(Array.from({ length: MAX_ARCHIVOS + 5 }, (_, i) => archivo(i)))).toHaveLength(MAX_ARCHIVOS);
    const largo = 'x'.repeat(MAX_CODIGO);
    const muchos = sanearLaboratorio(Array.from({ length: 30 }, (_, i) => archivo(i, { codigo: largo })));
    expect(muchos.reduce((n, a) => n + a.codigo.length, 0)).toBeLessThanOrEqual(MAX_TOTAL);
    expect(sanearArchivo({ ...archivo(1), codigo: 'y'.repeat(MAX_CODIGO + 10) }).codigo).toHaveLength(MAX_CODIGO);
    expect(sanearLaboratorio('nada')).toEqual([]);
  });

  it('cabe uno más mientras no pase los topes', () => {
    const lista = sanearLaboratorio([archivo(1), archivo(2)]);
    expect(cabeArchivo(lista, 100)).toBe(true);
    expect(cabeArchivo(lista, MAX_CODIGO + 1)).toBe(false);
    expect(cabeArchivo(Array.from({ length: MAX_ARCHIVOS }, (_, i) => archivo(i)), 10)).toBe(false);
    expect(cabeArchivo(Array.from({ length: MAX_ARCHIVOS }, (_, i) => archivo(i)), 10, 'l00000003')).toBe(true);
  });

  it('va en lo del alumno (mio), y lo de otra versión sin laboratorio queda vacío', () => {
    expect(sanearMio({}).laboratorio).toEqual([]);
    expect(sanearMio({ laboratorio: [archivo(1), { id: 'malo' }] }).laboratorio).toEqual([sanearArchivo(archivo(1))]);
  });
});

describe('guardar, cambiar y borrar', () => {
  beforeEach(() => {
    localStorage.clear();
    fijarUsuario(null);
    fijarUsuario(5);
  });

  it('guarda uno nuevo con su materia y lo cambia sin tocar cuándo se creó', () => {
    const id = guardarArchivoNuevo({ nombre: 'Primos', lenguaje: 'python', codigo: 'print(2)', materia: 7 }, H);
    expect(id).toMatch(/^l[0-9a-z]{6,24}$/);
    expect(mioActual().laboratorio).toEqual([{ id, nombre: 'Primos', lenguaje: 'python', codigo: 'print(2)', materia: 7, creado: H, cambiado: H }]);
    expect(JSON.parse(localStorage.getItem('cl.mio.5')).laboratorio).toHaveLength(1);
    expect(cambiarArchivo(id, { codigo: 'print(3)', lenguaje: 'sql', materia: null }, H + 5)).toBe(true);
    expect(mioActual().laboratorio[0]).toMatchObject({ codigo: 'print(3)', lenguaje: 'sql', materia: null, creado: H, cambiado: H + 5 });
    expect(cambiarArchivo('lnoexiste1', { codigo: 'x' })).toBe(false);
    borrarArchivo(id);
    expect(mioActual().laboratorio).toEqual([]);
  });

  it('no guarda código recortado ni lo que no entra', () => {
    expect(guardarArchivoNuevo({ nombre: 'Largo', lenguaje: 'python', codigo: 'x'.repeat(MAX_CODIGO + 1) })).toBe(null);
    expect(guardarArchivoNuevo({ nombre: 'C++', lenguaje: 'cpp', codigo: 'int x;' })).toBe(null);
    const id = guardarArchivoNuevo({ nombre: 'Corto', lenguaje: 'python', codigo: 'x' });
    expect(cambiarArchivo(id, { codigo: 'y'.repeat(MAX_CODIGO + 1) })).toBe(false);
    expect(mioActual().laboratorio[0].codigo).toBe('x');
    for (let i = 1; i < MAX_ARCHIVOS; i += 1) guardarArchivoNuevo({ nombre: `N${i}`, lenguaje: 'sql', codigo: 'SELECT 1;' }, H + i);
    expect(mioActual().laboratorio).toHaveLength(MAX_ARCHIVOS);
    expect(guardarArchivoNuevo({ nombre: 'Uno más', lenguaje: 'sql', codigo: 'SELECT 1;' })).toBe(null);
  });

  it('el nombre que sugiere sale del código, sin repetir', () => {
    expect(nombreSugerido('def es_primo(n):\n    pass', 'python')).toBe('es primo');
    expect(nombreSugerido('SELECT * FROM alumnos;', 'sql')).toBe('alumnos');
    expect(nombreSugerido('function coincidencias(base, lista){}', 'javascript')).toBe('coincidencias');
    expect(nombreSugerido('const doble = (n) => n * 2;', 'javascript')).toBe('doble');
    expect(nombreSugerido('console.log(1);', 'javascript')).toBe('Prueba 1');
    expect(nombreSugerido('print(1)', 'python')).toBe('Prueba 1');
    expect(nombreSugerido('print(1)', 'python', [{ nombre: 'Prueba 1' }])).toBe('Prueba 2');
    expect(nombreSugerido('SELECT * FROM alumnos;', 'sql', [{ nombre: 'Alumnos' }])).toBe('alumnos 1');
  });

  it('el nombre del archivo, para bajarlo y en los errores, sin tildes ni barras', () => {
    expect(nombreDeArchivo('Cálculo de promedio', 'python')).toBe('Calculo_de_promedio.py');
    expect(nombreDeArchivo('../../etc/x', 'sql')).toBe('etc_x.sql');
    expect(nombreDeArchivo('', 'python')).toBe('tu_codigo.py');
  });
});

describe('lo que viene de un PDF y el borrador', () => {
  it('queda en memoria, se toma una vez y se olvida al salir, con los motores', () => {
    let apagados = 0;
    alOlvidarLaboratorio(() => {
      apagados += 1;
    });
    llevarAlLaboratorio({ codigo: 'print(1)', lenguaje: 'python', adivinado: 'python', materia: 7, apunte: 'Apunte', pagina: 3 });
    expect(tomarDelPdf()).toEqual({ codigo: 'print(1)', lenguaje: 'python', adivinado: 'python', materia: 7, apunte: 'Apunte', pagina: 3 });
    expect(tomarDelPdf()).toBe(null);
    guardarMesa({ mesa: { codigo: 'x' }, abierto: null });
    llevarAlLaboratorio({ codigo: 'y', lenguaje: 'sql' });
    olvidarLaboratorio();
    expect(mesaGuardada()).toBe(null);
    expect(tomarDelPdf()).toBe(null);
    expect(apagados).toBe(1);
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });

  it('el borrador cuenta como escrito solo si el alumno lo cambió', () => {
    expect(borradorEscrito()).toBe(false);
    guardarMesa({ mesa: { codigo: LENGUAJES.python.ejemplo, lenguaje: 'python', tocada: true }, abierto: null });
    expect(borradorEscrito()).toBe(false);
    guardarMesa({ mesa: { codigo: '   ', lenguaje: 'python', tocada: true }, abierto: null });
    expect(borradorEscrito()).toBe(false);
    guardarMesa({ mesa: { codigo: 'print(1)', lenguaje: 'python', tocada: false }, abierto: null });
    expect(borradorEscrito()).toBe(false);
    guardarMesa({ mesa: { codigo: 'print(1)', lenguaje: 'python', tocada: true }, abierto: 'l00000001' });
    expect(borradorEscrito()).toBe(true);
    expect(borradorEscrito({ codigo: 'SELECT 1;', lenguaje: 'sql', tocada: true })).toBe(true);
    olvidarLaboratorio();
  });
});

describe('la línea de un error de SQL', () => {
  const sql = '-- Las materias\nSELECT nombre\nFROM materias;\n\n/* y un error */\nSELECT *\nFORM alumnos;\nSELECT 1;';

  it('cada sentencia empieza después de comentarios y termina en su punto y coma', () => {
    expect(sql.slice(comienzo(sql, 0), final(sql, comienzo(sql, 0)))).toBe('SELECT nombre\nFROM materias;');
    const segunda = comienzo(sql, final(sql, 0));
    expect(sql.slice(segunda, final(sql, segunda))).toBe('SELECT *\nFORM alumnos;');
    expect(final("SELECT ';' FROM t; x", 0)).toBe(18);
  });

  it('va a la palabra que SQLite nombra, o al principio de la sentencia', () => {
    const segunda = final(sql, 0);
    expect(lineaDelError(sql, segunda, 'near "FORM": syntax error')).toBe(7);
    expect(lineaDelError(sql, segunda, 'no such table: alumnoz')).toBe(6);
    expect(lineaDelError(sql, 0, 'no such column: nombre')).toBe(2);
    expect(lineaDelError('SELECT (1,\n2', 0, 'incomplete input')).toBe(2);
  });
});

describe('sin red adentro del motor', () => {
  it('saca todo lo que sale a la red, también de los prototipos, y no se puede volver a poner', () => {
    class Base {
      fetch() {
        return 'red';
      }
    }
    const global = Object.create(Base.prototype);
    Object.assign(global, { XMLHttpRequest: class {}, WebSocket: class {}, importScripts: () => {}, postMessage: () => {}, setTimeout });
    const habia = cerrarRed(global);
    expect(habia).toEqual(expect.arrayContaining(['fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'postMessage']));
    for (const n of SIN_RED) expect(global[n]).toBe(undefined);
    expect(Base.prototype.fetch).toBe(undefined);
    expect(() => {
      'use strict';
      global.fetch = () => 'otra vez';
    }).toThrow();
    expect(global.setTimeout).toBe(setTimeout);
  });
});

describe('un error en dos partes', () => {
  it('Python: dónde, con su ^ en su lugar, y qué pasó, aparte', () => {
    const texto = `Traceback (most recent call last):\n  File "tu_codigo.py", line 2, in <module>\n    promedio = sum(notas) / len(nota)\n                                ^^^^\nNameError: name 'nota' is not defined. Did you mean: 'notas'?\n`;
    const { donde, que } = partirError(texto);
    expect(donde.split('\n')).toHaveLength(4);
    expect(donde.endsWith('                                ^^^^')).toBe(true);
    expect(que).toBe("NameError: name 'nota' is not defined. Did you mean: 'notas'?");
  });

  it('un error de sintaxis sin Traceback, y uno de SQLite, que dice solo qué pasó', () => {
    expect(partirError('  File "tu_codigo.py", line 1\n    def f(:\n          ^\nSyntaxError: invalid syntax')).toEqual({ donde: '  File "tu_codigo.py", line 1\n    def f(:\n          ^', que: 'SyntaxError: invalid syntax' });
    expect(partirError('near "FORM": syntax error')).toEqual({ donde: '', que: 'near "FORM": syntax error' });
  });
});
