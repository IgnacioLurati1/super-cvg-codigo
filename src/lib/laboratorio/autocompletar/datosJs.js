// What the autocomplete of JavaScript knows without reading the code: its words and what the lab's engine has (QuickJS,
// with the console of jsConsola.js): no Node, no DOM. Each name with how it's called, as `nombre(parámetros)`; without
// parentheses, a value.

export const CLAVES_JS = 'async await break case catch class const continue default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while yield'.split(' ');

// What is there without importing anything: functions of the engine and of the console of the lab, and the objects.
export const GLOBALES_JS = [
  'prompt(mensaje, porDefecto)',
  'alert(mensaje)',
  'parseInt(texto, base)',
  'parseFloat(texto)',
  'isNaN(valor)',
  'isFinite(valor)',
  'setTimeout(funcion, ms)',
  'setInterval(funcion, ms)',
  'clearTimeout(id)',
  'clearInterval(id)',
  'NaN',
  'Infinity',
  'globalThis',
];
export const OBJETOS_JS = ['console', 'Math', 'Object', 'Array', 'String', 'Number', 'JSON', 'Map', 'Set', 'Date', 'Promise', 'Boolean', 'Symbol', 'Error', 'BigInt', 'RegExp'];

// After `objeto.`: what each one has.
export const MIEMBROS_JS = {
  console: ['log(...valores)', 'error(...valores)', 'warn(...valores)', 'info(...valores)', 'table(datos, columnas)', 'dir(objeto)', 'clear()', 'count(etiqueta)', 'countReset(etiqueta)', 'time(etiqueta)', 'timeLog(etiqueta)', 'timeEnd(etiqueta)', 'group(...valores)', 'groupEnd()', 'assert(condicion, ...valores)', 'trace(...valores)'],
  Math: [
    'abs(x)', 'ceil(x)', 'floor(x)', 'round(x)', 'trunc(x)', 'sign(x)', 'sqrt(x)', 'cbrt(x)', 'pow(base, exponente)', 'max(...valores)', 'min(...valores)', 'random()', 'hypot(...valores)',
    'log(x)', 'log2(x)', 'log10(x)', 'exp(x)', 'sin(x)', 'cos(x)', 'tan(x)', 'asin(x)', 'acos(x)', 'atan(x)', 'atan2(y, x)', 'PI', 'E', 'LN2', 'LN10', 'SQRT2',
  ],
  Object: ['keys(objeto)', 'values(objeto)', 'entries(objeto)', 'fromEntries(pares)', 'assign(destino, ...origenes)', 'freeze(objeto)', 'hasOwn(objeto, clave)', 'create(prototipo)', 'groupBy(lista, funcion)'],
  Array: ['isArray(valor)', 'from(iterable, funcion)', 'of(...elementos)'],
  String: ['fromCharCode(...codigos)'],
  Number: ['isInteger(valor)', 'isFinite(valor)', 'isNaN(valor)', 'parseInt(texto, base)', 'parseFloat(texto)', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER', 'EPSILON', 'MAX_VALUE', 'MIN_VALUE'],
  JSON: ['stringify(valor, reemplazo, espacio)', 'parse(texto)'],
  Promise: ['all(promesas)', 'allSettled(promesas)', 'race(promesas)', 'any(promesas)', 'resolve(valor)', 'reject(motivo)'],
  Date: ['now()', 'parse(texto)'],
};

// After any other `algo.`: the methods of a list and of a text, the ones a student uses most. Without knowing what
// `algo` is, both: the name says of which it is.
export const DE_LISTA = [
  'length', 'push(...elementos)', 'pop()', 'shift()', 'unshift(...elementos)', 'slice(inicio, fin)', 'splice(inicio, cuantos, ...nuevos)', 'concat(...listas)', 'join(separador)', 'reverse()',
  'sort(comparar)', 'toSorted(comparar)', 'indexOf(elemento)', 'lastIndexOf(elemento)', 'includes(elemento)', 'find(funcion)', 'findIndex(funcion)', 'findLast(funcion)', 'filter(funcion)', 'map(funcion)',
  'forEach(funcion)', 'reduce(funcion, inicial)', 'some(funcion)', 'every(funcion)', 'flat(profundidad)', 'flatMap(funcion)', 'fill(valor, inicio, fin)', 'at(indice)', 'keys()', 'entries()',
];
export const DE_TEXTO = [
  'length', 'toUpperCase()', 'toLowerCase()', 'trim()', 'trimStart()', 'trimEnd()', 'split(separador)', 'slice(inicio, fin)', 'substring(inicio, fin)', 'includes(texto)', 'indexOf(texto)',
  'startsWith(texto)', 'endsWith(texto)', 'replace(buscado, nuevo)', 'replaceAll(buscado, nuevo)', 'repeat(veces)', 'padStart(largo, relleno)', 'padEnd(largo, relleno)', 'charAt(indice)', 'charCodeAt(indice)', 'at(indice)', 'concat(...textos)', 'localeCompare(otro)',
];
// Of a Map and a Set, and of any value.
export const DE_OTROS = ['get(clave)', 'set(clave, valor)', 'has(clave)', 'add(valor)', 'delete(clave)', 'clear()', 'size', 'toString()', 'toFixed(decimales)', 'then(funcion)', 'catch(funcion)'];
