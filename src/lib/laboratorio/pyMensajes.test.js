// @vitest-environment node
// What Python says when a program breaks, in the student's words: each program is run broken by the real Pyodide (the
// one the site serves) with the runner of corredor.js, and its error goes through explicarPython as the page does.
import { loadPyodide } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { CORREDOR } from './corredor';
import { enCriollo } from './mensajes';
import { explicarPython } from './pyMensajes';

let correrPy;
beforeAll(async () => {
  const py = await loadPyodide({ env: { HOME: '/home/alumno', PYTHONHASHSEED: '0' }, jsglobals: Object.create(null), stdout: () => {}, stderr: () => {} });
  py.registerJsModule('_laboratorio', { pedir: () => null, sin_pausa: () => {}, imagen: () => {} });
  py.runPython(CORREDOR, { filename: '<laboratorio>' });
  const f = py.globals.get('_correr');
  correrPy = (codigo) => {
    const r = f(codigo, 'main.py', []);
    const [error, linea] = r.toJs();
    r.destroy();
    return { error, linea, dicho: explicarPython(error) };
  };
}, 120_000);

/** The last lines of what the console shows: what happened, and the original under it. */
const que = (codigo) => correrPy(codigo).dicho.trimEnd().split('\n').slice(-2).join('\n');

describe('los errores de Python, en criollo', () => {
  it('los nombres: NameError y UnboundLocalError', () => {
    expect(que('print(x)')).toBe("NameError: `x` no existe. Fijate que esté escrita igual, con las mismas mayúsculas, y que la hayas creado antes de usarla.\nMensaje original: NameError: name 'x' is not defined");
    expect(que('Print("a")')).toMatch(/^NameError: `Print` no existe.*¿Quisiste decir `print`\?\nMensaje original: NameError: name 'Print' is not defined\. Did you mean: 'print'\?$/s);
    expect(que('def f():\n    print(y)\n    y = 1\nf()')).toMatch(/^UnboundLocalError: Usaste `y` adentro de la función antes de darle un valor/);
  });

  it('la sintaxis dice qué falta', () => {
    expect(que('print("hola"')).toMatch(/^SyntaxError: Abriste un `\(` y no lo cerraste con su `\)`\.\nMensaje original: SyntaxError: '\(' was never closed$/);
    expect(que('x = [1, 2\ny = 3')).toMatch(/Abriste un `\[` y no lo cerraste con su `\]`/);
    expect(que('x = (1 + 2))')).toMatch(/Sobra un `\)`, porque no hay un `\(` abierto/);
    expect(que('def f()\n    pass')).toMatch(/^SyntaxError: Falta el `:` al final de esa línea\./);
    expect(que('if x = 3:\n    pass')).toMatch(/Para comparar se usa `==`/);
    expect(que('print("hola)')).toMatch(/Falta cerrar las comillas de un texto/);
    expect(que('print "hola"')).toMatch(/`print` lleva paréntesis/);
    expect(que('x = [1 2]')).toMatch(/Falta una coma entre dos valores/);
    expect(que('x = 5 +')).toMatch(/Esa línea está mal escrita/);
    expect(que('return 1')).toMatch(/`return` va adentro de una función/);
    expect(que('break')).toMatch(/`break` va adentro de un `for` o de un `while`/);
    expect(que('5 = x')).toMatch(/A la izquierda del `=` va una variable, y ahí hay un valor fijo/);
    expect(que('1x = 3')).toMatch(/Un nombre no puede empezar con un número/);
    expect(que('x = 1\u00a0+ 2')).toMatch(/carácter invisible \(U\+00A0\)/);
    expect(que('print(f"{x")')).toMatch(/En un f-string falta cerrar/);
    expect(que('print(end=1, 2)')).toMatch(/argumentos con nombre/);
  });

  it('la sangría', () => {
    expect(que('def f():\nprint(1)')).toMatch(/^IndentationError: Después de la línea 1 va un bloque con sangría.*`pass`\.\nMensaje original: IndentationError: expected an indented block after function definition on line 1$/s);
    expect(que('if True:')).toMatch(/Después de la línea 1 va un bloque con sangría/);
    expect(que('x = 1\n    y = 2')).toMatch(/espacios de más al principio/);
    expect(que('if True:\n    x = 1\n  y = 2')).toMatch(/no coinciden con los de ningún bloque/);
    expect(que('if True:\n\tx=1\n        y=2')).toMatch(/^TabError: Mezclaste tabuladores y espacios/);
  });

  it('los tipos', () => {
    expect(que('"a" + 1')).toMatch(/^TypeError: No se puede sumar un texto con un número entero\./);
    expect(que('1 + "a"')).toMatch(/No se puede hacer `\+` entre un número entero y un texto/);
    expect(que('len(5)')).toMatch(/`len\(\)` no sirve con un número entero/);
    expect(que('def f(a):\n    pass\nf(1, 2)')).toMatch(/`f` recibe 1 argumento y le pasaste 2\./);
    expect(que('def f(a, b):\n    pass\nf(1)')).toMatch(/A `f` le falta 1 argumento, `b`\./);
    expect(que('def f(a, b):\n    pass\nf()')).toMatch(/A `f` le faltan 2 argumentos, `a` y `b`/);
    expect(que('class A:\n    def f(): pass\nA().f()')).toMatch(/`f` recibe 0 argumentos y le pasaste 1\. Si es un método.*`self`/);
    expect(que('x = 5\nx()')).toMatch(/Llamaste con `\(\)` a un número entero, y no es una función/);
    expect(que('x = None\nx[0]')).toMatch(/Usaste `\[\]` sobre `None`.*le falta el `return`/);
    expect(que('t = (1,2)\nt[0] = 5')).toMatch(/^TypeError: Una tupla no se puede modificar elemento por elemento\./);
    expect(que('[1,2]["a"]')).toMatch(/El lugar que se pide de una lista tiene que ser un número entero, y le pasaste un texto/);
    expect(que('for i in 5:\n    pass')).toMatch(/No se puede recorrer un número entero\. Para recorrer números usá `range\(\)`/);
    expect(que('print(1 < "a")')).toMatch(/No se puede comparar un número entero con un texto usando `<`/);
    expect(que('d = {}\nd[[1]] = 2')).toMatch(/^TypeError: Una lista no puede ser clave de un diccionario/);
    expect(que('"abc" * "d"')).toMatch(/solo se multiplica por un número entero/);
    expect(que('range(1.5)')).toMatch(/Acá hace falta un número entero y llegó un número con coma/);
    expect(que('def f(a): pass\nf(x=1)')).toMatch(/`f` no tiene un parámetro que se llame `x`/);
    expect(que('x, y = 5')).toMatch(/No se puede repartir un número entero en varias variables/);
  });

  it('los números, las listas y los diccionarios', () => {
    expect(que('1 / 0')).toMatch(/^ZeroDivisionError: Dividiste por cero\..*\nMensaje original: ZeroDivisionError: division by zero$/s);
    expect(que('l = [1,2]\nl[5]')).toMatch(/^IndexError: Pediste un lugar de una lista que no existe\. Si tiene n elementos, los lugares van de 0 a n-1\./);
    expect(que('"abc"[10]')).toMatch(/Pediste un lugar de un texto que no existe/);
    expect(que('l=[1]\nl[3] = 1')).toMatch(/Para agregar al final usá `append\(\)`/);
    expect(que('l=[]\nl.pop()')).toMatch(/`pop\(\)` en una lista vacía/);
    expect(que('d = {"a": 1}\nd["b"]')).toMatch(/^KeyError: No hay ninguna clave 'b' en el diccionario\./);
    expect(que('int("abc")')).toMatch(/`int\(\)` no puede convertir 'abc' en un número entero/);
    expect(que('float("x")')).toMatch(/`float\(\)` no puede convertir 'x' en un número/);
    expect(que('a, b = [1, 2, 3]')).toMatch(/Querés repartir 3 valores en 2 variables/);
    expect(que('a, b, c = [1, 2]')).toMatch(/Querés repartir 2 valores en 3 variables/);
    expect(que('[1,2].index(5)')).toMatch(/Ese valor no está en la lista/);
    expect(que('import math\nmath.sqrt(-1)')).toMatch(/Esa función de `math` no está definida para ese número/);
    expect(que('import math\nmath.exp(1000)')).toMatch(/demasiado grande/);
  });

  it('los atributos, los módulos, los archivos y el teclado', () => {
    expect(que('x = 5\nx.foo')).toMatch(/^AttributeError: Un número entero y no tiene `foo`\./);
    expect(que('None.x')).toMatch(/El valor es `None` y no tiene `x`\. Seguro una función no devolvió nada/);
    expect(que('import math\nmath.foo')).toMatch(/El módulo `math` no tiene `foo`/);
    expect(que('import foo')).toMatch(/^ModuleNotFoundError: No se encuentra el módulo `foo`\. Fijate cómo está escrito\.\nMensaje original: ModuleNotFoundError: No module named 'foo'$/);
    expect(que('from math import foo')).toMatch(/El módulo `math` no tiene `foo`/);
    expect(que('input()')).toMatch(/^EOFError: `input\(\)` pidió un dato y no había nada para leer\./);
    expect(que('open("nada.txt")')).toMatch(/No existe el archivo `nada\.txt`/);
    expect(que('open("/")')).toMatch(/`\/` es una carpeta, no un archivo/);
    expect(que('def f():\n    return f()\nf()')).toMatch(/^RecursionError: La función se llamó a sí misma demasiadas veces\. Fijate que tenga un caso base/);
    expect(que('assert 1 == 2')).toMatch(/^AssertionError: Falló un `assert`\./);
    expect(que('assert False, "no"')).toMatch(/Falló un `assert` con el mensaje «no»/);
    expect(que('next(iter([]))')).toMatch(/`next\(\)` no tiene más elementos/);
  });

  it('la línea y lo de arriba no cambian, y el texto original queda debajo', () => {
    const r = correrPy('def dividir(a, b):\n    return a / b\n\nprint(dividir(1, 0))\n');
    expect(r.linea).toBe(2);
    // Everything but the last line is what Python wrote.
    const antes = r.error.trimEnd().split('\n').slice(0, -1).join('\n');
    expect(r.dicho.startsWith(`${antes}\nZeroDivisionError: Dividiste por cero.`)).toBe(true);
    expect(r.dicho.endsWith('Mensaje original: ZeroDivisionError: division by zero\n')).toBe(true);
    expect(r.dicho).toMatch(/File "main.py", line 4, in <module>/);
    expect(r.dicho).toMatch(/File "main.py", line 2, in dividir/);
  });

  it('lo que el alumno lanza con raise y lo que no se conoce quedan como vienen', () => {
    for (const codigo of ['raise ValueError("mala")', 'raise Exception("hola")', 'raise NotImplementedError', '"é".encode("ascii")', 'import json\njson.loads("{")']) {
      const r = correrPy(codigo);
      expect(r.dicho).toBe(r.error);
    }
    expect(explicarPython(null)).toBe('');
    expect(enCriollo('c', 'algo')).toBe('algo');
    expect(enCriollo('python', "NameError: name 'q' is not defined\n")).toMatch(/\nMensaje original: NameError: name 'q' is not defined\n$/);
  });
});
