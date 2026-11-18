// @vitest-environment node
// The JavaScript of the lab with the real engine (vendor/js, the same the site serves), without the worker: the console,
// prompt(), the errors in their line and the imports of a project, as js.worker.js puts them together. The keyboard
// reads lines given before.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { correrJs, prepararJs, proyectoJs } from './jsMotor';

let motor;
beforeAll(async () => {
  motor = await prepararJs(new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../vendor/js/quickjs.wasm'))));
}, 30_000);

/** A run as the worker does it: { error, linea, archivo, salida, errores, preguntas, limpiada }. */
async function correr(pedido, { entrada = [], segundos = 5 } = {}) {
  const proyecto = proyectoJs(typeof pedido === 'string' ? { codigo: pedido, nombre: 'main.js' } : pedido);
  if (proyecto.error) return { error: proyecto.error };
  let salida = '';
  let errores = '';
  let limpiada = 0;
  const preguntas = [];
  const lineas = [...entrada];
  const hasta = Date.now() + segundos * 1000;
  const r = await correrJs(motor, proyecto, {
    escribir: (flujo, t) => {
      if (flujo === 'out') salida += t;
      else errores += t;
    },
    leer: async (pregunta) => {
      preguntas.push(pregunta);
      salida += pregunta;
      return lineas.length ? String(lineas.shift()) : null;
    },
    limpiar: () => {
      limpiada += 1;
      salida = '';
    },
    parar: () => Date.now() > hasta,
  });
  return { ...r, salida, errores, preguntas, limpiada };
}

const de = (archivos, principal = 'main.js') => ({ archivos: Object.entries(archivos).map(([nombre, contenido]) => [nombre, contenido]).map(([nombre, contenido]) => ({ nombre, contenido })), principal });

describe('el motor', () => {
  it('es el WebAssembly de quickjs-emscripten, igual byte por byte al de su JavaScript', () => {
    const npm = readFileSync(resolve(import.meta.dirname, '../../../node_modules/@jitl/quickjs-wasmfile-release-asyncify/dist/emscripten-module.wasm'));
    expect(readFileSync(resolve(import.meta.dirname, '../../../vendor/js/quickjs.wasm')).equals(npm)).toBe(true);
  });
});

describe('console.log', () => {
  it('escribe como Node: textos sueltos, arreglos, objetos, clases, Map y %d', async () => {
    const r = await correr(`console.log('hola', 3, true, null, undefined, 10n);
console.log([1, 2, 3], { nombre: 'Ana', edad: 20 }, [], {});
class Persona { constructor(n) { this.nombre = n; } }
console.log(new Persona('Luis'), new Map([['a', 1]]), new Set([1, 2]));
console.log('Tiene %d años y se llama %s', 20, 'Ana');
console.log([1, [2, [3, [4]]]], function suma() {}, () => 1, Persona);
console.error('cuidado');
console.log([3, 1, 2].toSorted(), [1, 2, 3].findLast((x) => x < 3), Object.groupBy([1, 2, 3], (x) => (x % 2 ? 'impar' : 'par')));
`);
    expect(r.error).toBe(null);
    expect(r.salida).toBe(`hola 3 true null undefined 10n
[ 1, 2, 3 ] { nombre: 'Ana', edad: 20 } [] {}
Persona { nombre: 'Luis' } Map(1) { 'a' => 1 } Set(2) { 1, 2 }
Tiene 20 años y se llama Ana
[ 1, [ 2, [ 3, [Array] ] ] ] [Function: suma] [Function (anonymous)] [class Persona]
[ 1, 2, 3 ] 2 [Object: null prototype] { impar: [ 1, 3 ], par: [ 2 ] }
`);
    expect(r.errores).toBe('cuidado\n');
  });

  it('lo largo va en varias líneas, console.table dibuja la tabla y console.clear limpia', async () => {
    const r = await correr(`console.log('antes');
console.clear();
console.log(Array.from({ length: 30 }, (_, i) => i * 100));
console.table([{ a: 1, b: 'x' }, { a: 2 }]);
const o = { yo: null }; o.yo = o; console.log(o);
`);
    expect(r.error).toBe(null);
    expect(r.limpiada).toBe(1);
    expect(r.salida).not.toContain('antes');
    expect(r.salida).toContain('[\n  0, 100, 200, 300');
    expect(r.salida).toContain(`┌─────────┬───┬─────┐
│ (index) │ a │ b   │
├─────────┼───┼─────┤
│ 0       │ 1 │ 'x' │
│ 1       │ 2 │     │
└─────────┴───┴─────┘`);
    expect(r.salida).toContain('{ yo: [Circular] }');
  });
});

describe('prompt()', () => {
  it('lee lo que escribe el alumno, con la pregunta, y null si no hay nada', async () => {
    const r = await correr(`const nombre = prompt('¿Cómo te llamás?');
const n = Number(prompt('¿Cuántos? '));
console.log('Hola, ' + nombre + '. El doble es ' + n * 2);
console.log(prompt());
`, { entrada: ['Ana', '21'] });
    expect(r.error).toBe(null);
    expect(r.preguntas).toEqual(['¿Cómo te llamás? ', '¿Cuántos? ', '']);
    expect(r.salida).toBe('¿Cómo te llamás? ¿Cuántos? Hola, Ana. El doble es 42\nnull\n');
  });
});

describe('errores', () => {
  it('uno de sintaxis dice qué falta, en su línea y con la marca', async () => {
    const r = await correr('let x = 1;\nfunction doble(n) {\n  return n * 2;\n\nconsole.log(doble(x));\n');
    expect(r.linea).toBeGreaterThan(0);
    expect(r.error).toMatch(/^SyntaxError: /m);
    const s = await correr('const notas = [7, 8;\nconsole.log(notas);\n');
    expect(s.linea).toBe(1);
    expect(s.error).toBe('  main.js, línea 1\n    const notas = [7, 8;\n                       ^\nSyntaxError: Falta cerrar un corchete, `]`.\nMensaje original: SyntaxError: expecting ' + "']'" + '');
    const t = await correr('let nombre = "Ana;\n');
    expect(t.error).toMatch(/SyntaxError: Falta cerrar las comillas de un texto\.\nMensaje original: SyntaxError: unexpected end of string$/);
    const u = await correr('let a = 1;\nlet a = 2;\n');
    expect([u.linea, u.error.split('\n').at(-2)]).toEqual([2, 'SyntaxError: `a` ya está declarada más arriba. Usá otro nombre, o sacale el `let` o `const`.']);
  });

  it('uno al correr dice la línea, la función y desde dónde la llamaron, en castellano', async () => {
    const r = await correr('function largo(o) {\n  return o.nombre.length;\n}\n\nconsole.log("antes");\nconsole.log(largo({}));\n');
    expect(r.salida).toBe('antes\n');
    expect(r.linea).toBe(2);
    expect(r.error).toBe('  en largo, línea 2\n  llamada desde main.js, línea 6\nTypeError: `o.nombre` vale `undefined` y no tiene `length`.\nMensaje original: TypeError: cannot read property ' + "'length' of undefined" + '');
    const n = await correr('let total = 0;\nconsole.log(totl);\n');
    expect([n.linea, n.error]).toEqual([2, '  en main.js, línea 2\nReferenceError: `totl` no está definida. Fijate que esté declarada y escrita igual.\nMensaje original: ReferenceError: \'totl\' is not defined']);
    const f = await correr('const lista = [1, 2];\nlista.agregar(3);\n');
    expect(f.error).toMatch(/TypeError: `lista\.agregar` no es una función\.\n/);
    const c = await correr('const PI = 3.14;\nPI = 3;\n');
    expect(c.error).toMatch(/TypeError: `PI` es una constante y no se le puede asignar otro valor\.\n/);
    const propio = await correr('function dividir(a, b) {\n  if (b === 0) throw new Error("No se divide por cero");\n  return a / b;\n}\ndividir(1, 0);\n');
    expect([propio.linea, propio.error]).toEqual([2, '  en dividir, línea 2\n  llamada desde main.js, línea 5\nError: No se divide por cero']);
    const suelto = await correr('throw "nada";\n');
    expect(suelto.error).toBe('Se lanzó `"nada"` con `throw` y nadie lo atrapó.');
  });

  it('lo de Node y de las páginas web dice qué usar', async () => {
    expect((await correr('const prompt = require("prompt-sync")();\n')).error).toMatch(/`require` es de Node\./);
    expect((await correr('document.getElementById("x");\n')).error).toMatch(/`document` es de las páginas web\./);
    const r = await correr('import readline from "readline";\nconsole.log(1);\n');
    expect([r.linea, r.error.split('\n').at(-1)]).toEqual([1, 'Error: `readline` es de Node. Para leer del teclado usá `prompt()`.']);
  });

  it('una recursión sin fin llena la pila y lo dice una vez', async () => {
    const r = await correr('function f(n) {\n  return f(n + 1);\n}\nf(0);\n');
    expect(r.linea).toBe(2);
    expect(r.error).toMatch(/^ {2}en f, línea 2\n {2}\(y \d+ veces más\)\n {2}llamada desde main\.js, línea 4\nInternalError: Se llenó la pila \(stack overflow\)\./);
  });

  it('un bucle infinito se para con el tope', async () => {
    const desde = Date.now();
    const r = await correr('let i = 0;\nwhile (true) {\n  i++;\n}\n', { segundos: 0.5 });
    expect(Date.now() - desde).toBeLessThan(3000);
    expect(r.error).toMatch(/InternalError: Lo paramos\.\nMensaje original: InternalError: interrupted$/);
  });
});

describe('proyectos', () => {
  it('los .js se importan entre sí, también en carpetas, y un .json llega como su valor', async () => {
    const r = await correr(de({
      'main.js': "import { contar } from './lib/listas.js';\nimport { saludo } from './saludo';\nimport datos from './datos.json' with { type: 'json' };\nimport notas from './notas.csv';\nconsole.log(saludo(datos.nombre), contar('a', ['a', 'b', 'a']), notas.split('\\n').length);\n",
      'lib/listas.js': "import otros from '../datos.json';\nexport function contar(base, lista) {\n  return lista.filter((x) => x === base).length + otros.extra;\n}\n",
      'saludo.js': 'export const saludo = (n) => `Hola, ${n}`;\n',
      'datos.json': '{ "nombre": "Ana", "extra": 0 }',
      'notas.csv': 'legajo,nota\n1,7\n2,8',
    }));
    expect(r.error).toBe(null);
    expect(r.salida).toBe('Hola, Ana 2 3\n');
  });

  it('un error en un módulo dice en qué archivo, y lo que falta también', async () => {
    const r = await correr(de({
      'main.js': "import { promedio } from './calculos.js';\nconsole.log(promedio([]));\n",
      'calculos.js': 'export function promedio(notas) {\n  return notas.reduce((a, b) => a + b) / notas.length;\n}\n',
    }));
    expect([r.archivo, r.linea]).toEqual(['calculos.js', 2]);
    expect(r.error).toMatch(/^ {2}en promedio, calculos\.js, línea 2\n {2}llamada desde main\.js, línea 2\nTypeError: `reduce` de un arreglo vacío necesita un valor inicial\.\nMensaje original: TypeError: empty array$/);
    const falta = await correr(de({ 'main.js': "\nimport { x } from './utiles.js';\n" }));
    expect([falta.archivo, falta.linea]).toEqual(['main.js', 2]);
    expect(falta.error).toMatch(/No está `\.\/utiles\.js` en el proyecto\./);
    const sintaxis = await correr(de({ 'main.js': "import { f } from './f.js';\nf();\n", 'f.js': 'export function f() {\n  return (1;\n}\n' }));
    expect([sintaxis.archivo, sintaxis.linea]).toEqual(['f.js', 2]);
  });

  it('corre el principal elegido, y sin .js no corre', async () => {
    const r = await correr(de({ 'a.js': 'console.log("a");\n', 'b.js': 'console.log("b");\n' }, 'b.js'));
    expect(r.salida).toBe('b\n');
    expect((await correr(de({ 'notas.txt': '7' }))).error).toBe('El proyecto no tiene ningún archivo .js para correr.');
  });
});

describe('await', () => {
  it('va también afuera de una función, y prompt() después de un await dice que no puede esperar', async () => {
    const r = await correr('const esperar = (ms) => new Promise((r) => setTimeout(r, ms));\nawait esperar(5);\nconsole.log("listo");\nawait Promise.reject(new Error("no"));\n');
    expect(r.salida).toBe('listo\n');
    expect([r.linea, r.error]).toEqual([4, '  en main.js, línea 4\nError: no']);
    const p = await correr('async function pedir() {\n  await null;\n  return prompt("¿Nombre?");\n}\npedir();\n', { entrada: ['Ana'] });
    expect([p.linea, p.error]).toEqual([3, '  en pedir, línea 3\nError: `prompt()` no puede esperar lo que escribís después de un `await`. Pedí los datos antes.']);
    // The engine is still whole for the next run.
    expect((await correr('console.log(prompt("¿Y?"));\n', { entrada: ['sí'] })).salida).toBe('¿Y? sí\n');
  });
});

describe('timers', () => {
  it('setTimeout y setInterval corren al final, en orden, y una promesa espera', async () => {
    const r = await correr(`let n = 0;
const id = setInterval(() => { n++; console.log('vuelta', n); if (n === 3) clearInterval(id); }, 5);
setTimeout(() => console.log('después'), 30);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => { await esperar(1); console.log('primero'); })();
`);
    expect(r.error).toBe(null);
    expect(r.salida).toBe('primero\nvuelta 1\nvuelta 2\nvuelta 3\ndespués\n');
  });
});

// Desarrollo de Software, parcial del 08/11/2017 (scripts/utn/fuente/desarrollo-de-software/emergencia.md).
describe('los ejercicios del apunte de Desarrollo de Software', () => {
  it('getAge, del ejercicio 2, calcula la edad', async () => {
    const r = await correr(`function getAge(dateString) {
    var today = new Date();
    var birthDate = new Date(dateString);
    var age = today.getFullYear() - birthDate.getFullYear();
    var m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
    }
    return age;
}
const hoy = new Date();
const hace20 = new Date(hoy.getFullYear() - 20, hoy.getMonth(), hoy.getDate());
const manana = new Date(hoy.getFullYear() - 20, hoy.getMonth(), hoy.getDate() + 1);
console.log(getAge(hace20.toISOString()), getAge(manana.toISOString()), typeof getAge('1990-01-01'));
`);
    expect(r.error).toBe(null);
    expect(r.salida).toBe('20 19 number\n');
  });

  it('coincidencias, del ejercicio 5, cuenta las palabras iguales a la base', async () => {
    const r = await correr(`function coincidencias(base, lista){
    let cantidad = 0;
    for (const palabra of lista) {
        if (palabra === base) cantidad++;
    }
    return cantidad;
}
console.log(coincidencias('sol', ['sol', 'luna', 'sol', 'Sol']));
console.log(coincidencias('x', []));
const palabra = prompt('Palabra:');
console.log(coincidencias(palabra, prompt('Lista:').split(',')));
`, { entrada: ['casa', 'casa,perro,casa'] });
    expect(r.error).toBe(null);
    expect(r.salida).toBe('2\n0\nPalabra: Lista: 2\n');
  });
});

describe('los errores, en criollo y con el mensaje original debajo', () => {
  const ultimas = async (codigo) => (await correr(codigo)).error.split('\n').slice(-2).join('\n');

  it('lo que faltaba traducir', async () => {
    expect(await ultimas('let x = {')).toBe("SyntaxError: Falta cerrar una llave o un paréntesis, o hay algo mal escrito dentro de un objeto.\nMensaje original: SyntaxError: invalid property name");
    expect(await ultimas('const a;')).toMatch(/^SyntaxError: Una constante tiene que tener su valor desde que se declara, como `const a = 1;`\.\nMensaje original: SyntaxError: missing initializer for const variable$/);
    expect(await ultimas('class { }')).toMatch(/^SyntaxError: Falta el nombre de la clase\./);
    expect(await ultimas('(1).toFixed(101)')).toMatch(/^RangeError: La cantidad de dígitos que pediste no es válida\./);
    expect(await ultimas('"a".repeat(-1)')).toMatch(/^RangeError: `repeat` necesita una cantidad de veces que no sea negativa\./);
    expect(await ultimas('1n + 1')).toMatch(/^TypeError: Un `BigInt`, como `1n`, no se puede mezclar con un número común/);
    expect(await ultimas('BigInt(1.5)')).toMatch(/^RangeError: Un `BigInt` solo puede ser un número entero\./);
    expect((await correr('null.x')).error).toMatch(/TypeError: No se puede leer `x` de `null`\./);
  });

  it('cada traducción deja lo que dijo el motor, para buscarlo', async () => {
    const r = await correr('let o;\no.x;\n');
    expect(r.linea).toBe(2);
    expect(r.error).toBe("  en main.js, línea 2\nTypeError: `o` vale `undefined` y no tiene `x`.\nMensaje original: TypeError: cannot read property 'x' of undefined");
    // What isn't known stays as the engine said it, with nothing added.
    expect((await correr('new Map(5)')).error).toMatch(/Mensaje original/);
    expect((await correr('throw new Error("mío")')).error).toBe('  en main.js, línea 1\nError: mío');
  });
});
