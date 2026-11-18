// An error of the JavaScript of the lab (jsMotor.js), as the console shows it: where it happened (the functions of the
// student, innermost first, or the line with a ^ for a syntax error) and what happened, in Spanish for the usual ones,
// with the kind of error in English as JavaScript names it (TypeError), so it can be looked up. As the C ones
// (cMensajes.js): `{ error, linea, archivo }`, the line and file being the first of the project where it broke.
import { conMarca, finDelAnterior } from './cMensajes';
import { conOriginal } from './error';

const codigo = (t) => `\`${t}\``;
// How many frames are said: a recursion that doesn't end has thousands of the same.
const MAX_MARCOS = 6;

// What only Node or a web page has, and what to use here instead.
const DE_AFUERA = {
  require: '`require` es de Node. Acá los archivos se unen con `import` y `export`.',
  module: '`module.exports` es de Node. Acá se exporta con `export`.',
  exports: '`exports` es de Node. Acá se exporta con `export`.',
  process: '`process` es de Node. Para mostrar algo usá `console.log()`.',
  document: '`document` es de las páginas web. El laboratorio corre JavaScript de consola, sin HTML.',
  window: '`window` es de las páginas web. El laboratorio corre JavaScript de consola, sin HTML.',
  fetch: '`fetch` no está porque el laboratorio no tiene internet.',
  XMLHttpRequest: '`XMLHttpRequest` no está porque el laboratorio no tiene internet.',
  WebSocket: '`WebSocket` no está porque el laboratorio no tiene internet.',
  importScripts: '`importScripts` no está porque el laboratorio no tiene internet.',
};
// Modules of Node or of npm that a program may import to read the keyboard or files.
const DE_NODE = /^(?:node:)?(?:readline|readline\/promises|fs|fs\/promises|process|path|os|util|events|child_process|http|https|prompt-sync)$/;

// The name just before `columna` (from 1) in `fuente`: what was called, read or declared there.
function antesDe(fuente, columna, conLlamada = false) {
  const antes = String(fuente ?? '').slice(0, Math.max(0, columna - 1)).trimEnd();
  const m = (conLlamada ? /([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[^\]\n]{1,30}\])*)$/ : /([A-Za-z_$][\w$]*)$/).exec(antes);
  return m ? m[1] : '';
}

// Each known message: the pattern of what QuickJS says, and how it's said here with what it names and the place it
// points at ({ fuente, columna, funcion }).
const TRADUCCIONES = [
  [/^'([^']+)' is not defined$/, (m) => DE_AFUERA[m[1]] ?? `${codigo(m[1])} no está definida. Fijate que esté declarada y escrita igual.`],
  [/^(\S+) is not initialized$/, (m) => `Usaste ${codigo(m[1])} antes de la línea donde se declara.`],
  [/^not a function$/, (m, l) => {
    const f = antesDe(l.fuente, l.columna, true);
    return f ? `${codigo(f)} no es una función.` : 'Lo que llamaste no es una función.';
  }],
  [/^not a constructor$/, () => 'Eso no se puede crear con `new`.'],
  [/^cannot read property '(.+)' of (undefined|null)$/, (m, l) => {
    const o = antesDe(l.fuente, l.columna, true);
    return o && o !== m[1] && o !== m[2] ? `${codigo(o)} vale ${codigo(m[2])} y no tiene ${codigo(m[1])}.` : `No se puede leer ${codigo(m[1])} de ${codigo(m[2])}.`;
  }],
  [/^cannot set property '(.+)' of (undefined|null)$/, (m, l) => {
    const o = antesDe(l.fuente, l.columna, true);
    return o && o !== m[1] && o !== m[2] ? `${codigo(o)} vale ${codigo(m[2])} y no se le puede asignar ${codigo(m[1])}.` : `No se puede asignar ${codigo(m[1])} a ${codigo(m[2])}.`;
  }],
  [/^'([^']+)' is read-only$/, (m) => `${codigo(m[1])} es una constante y no se le puede asignar otro valor.`],
  [/^class constructors must be invoked with 'new'$/, (m, l) => (l.funcion ? `${codigo(l.funcion)} es una clase. Se crea con ${codigo(`new ${l.funcion}()`)}.` : 'Una clase se crea con `new`.')],
  [/^value is not iterable$|^not iterable$/, () => 'Eso no se puede recorrer. `for...of` y `...` van con arreglos, textos, Map o Set.'],
  [/^cannot convert to object$/, () => 'No se puede sacar nada de `null` ni de `undefined`.'],
  [/^invalid array length$/, () => 'El largo de un arreglo tiene que ser un entero positivo.'],
  [/^BigInt division by zero$/, () => 'División por cero.'],
  [/^empty array$/, () => '`reduce` de un arreglo vacío necesita un valor inicial.'],
  [/^stack overflow$|^Maximum call stack size exceeded$/, () => 'Se llenó la pila (stack overflow). Seguro es una recursión que no termina.'],
  [/^out of memory$/, () => 'Se quedó sin memoria. Seguro es un arreglo o un texto que crece sin parar.'],
  [/^interrupted$/, () => 'Lo paramos.'],
  [/^unexpected end of string$/, () => 'Falta cerrar las comillas de un texto.'],
  [/^unexpected end of comment$/, () => 'Falta cerrar un comentario con `*/`.'],
  [/^unexpected end of regexp$/, () => 'Falta cerrar una expresión regular con `/`.'],
  [/^expecting '\)'$/, () => 'Falta cerrar un paréntesis, `)`.'],
  [/^expecting '\]'$/, () => 'Falta cerrar un corchete, `]`.'],
  [/^expecting '\}'$/, () => 'Falta una coma o cerrar la llave, `}`.'],
  [/^expecting ','$/, () => 'Falta una coma o cerrar el paréntesis.'],
  [/^expecting ';'$/, () => 'Falta un `;` o algo está fuera de lugar.'],
  [/^expecting '(.+)'$/, (m) => `Falta ${codigo(m[1])}.`],
  [/^unexpected token in expression: ''$|^unexpected end of input$/, () => 'El código termina sin cerrar algo, como un paréntesis o una llave.'],
  [/^unexpected token in expression: '(.+)'$|^unexpected token: '(.+)'$/, (m) => `Sobra ${codigo(m[1] ?? m[2])} o está fuera de lugar.`],
  [/^unexpected token/, () => 'Algo sobra o está fuera de lugar.'],
  [/^invalid redefinition of (?:lexical identifier|global identifier|parameter name)$/, (m, l) => {
    const n = antesDe(l.fuente, l.columna);
    return n ? `${codigo(n)} ya está declarada más arriba. Usá otro nombre, o sacale el \`let\` o \`const\`.` : 'Ese nombre ya está declarado más arriba.';
  }],
  [/^invalid number literal$/, () => 'Ese número está mal escrito. Un nombre no puede empezar con un número.'],
  [/^function name expected$/, () => 'Falta el nombre de la función.'],
  [/^variable name expected$/, () => 'Falta el nombre de la variable.'],
  [/^return not in a function$/, () => '`return` va adentro de una función.'],
  [/^invalid assignment left-hand side$/, () => 'A la izquierda del `=` va una variable. Para comparar, `===`.'],
  [/^'await' is only valid in async functions/, () => '`await` va adentro de una función `async`.'],
  [/^invalid property name$/, () => 'Falta cerrar una llave o un paréntesis, o hay algo mal escrito dentro de un objeto.'],
  [/^missing initializer for const variable$/, () => 'Una constante tiene que tener su valor desde que se declara, como `const a = 1;`.'],
  [/^class statement requires a name$/, () => 'Falta el nombre de la clase.'],
  [/^invalid number of digits$/, () => 'La cantidad de dígitos que pediste no es válida. `toFixed` acepta de 0 a 100.'],
  [/^invalid repeat count$/, () => '`repeat` necesita una cantidad de veces que no sea negativa.'],
  [/^cannot convert bigint to number$/, () => 'Un `BigInt`, como `1n`, no se puede mezclar con un número común en una cuenta. Convertí uno de los dos.'],
  [/^cannot convert to BigInt: not an integer$/, () => 'Un `BigInt` solo puede ser un número entero.'],
  [/^could not load module '(.+)'$/, (m) => `No está ${codigo(m[1])} en el proyecto.`],
];

function traducir(mensaje, lugar) {
  for (const [patron, decir] of TRADUCCIONES) {
    const m = patron.exec(mensaje);
    if (m) return decir(m, lugar);
  }
  return null;
}

// The frames of a stack of QuickJS: «    at f (main.js:2:18)», «    at main.js:3:11» (a syntax error).
function marcosDe(pila) {
  const marcos = [];
  for (const l of String(pila ?? '').split('\n')) {
    const m = /^\s*at (?:(.+?) \()?([^()]+?):(\d+)(?::(\d+))?\)?\s*$/.exec(l);
    if (m) marcos.push({ funcion: m[1] ?? null, archivo: m[2], linea: Number(m[3]), columna: Number(m[4] ?? 0) });
  }
  return marcos;
}

const SIN_NOMBRE = new Set(['<eval>', '<anonymous>', '<main>', '']);

// «en contar, línea 2», «llamada desde main.js, línea 5»: the file goes when the project has more than one.
function decirMarcos(marcos, varios) {
  const lineas = [];
  for (let i = 0; i < marcos.length && lineas.length < MAX_MARCOS; ) {
    const m = marcos[i];
    let iguales = 1;
    while (i + iguales < marcos.length && ['funcion', 'archivo', 'linea'].every((k) => marcos[i + iguales][k] === m[k])) iguales += 1;
    const quien = m.funcion && !SIN_NOMBRE.has(m.funcion) ? `${m.funcion}, ` : '';
    const donde = `${quien}${varios || !quien ? `${m.archivo}, ` : ''}línea ${m.linea}`;
    lineas.push(`  ${i ? 'llamada desde' : 'en'} ${donde}`);
    if (iguales > 1) lineas.push(`  (y ${iguales - 1} ${iguales === 2 ? 'vez' : 'veces'} más)`);
    i += iguales;
  }
  return lineas;
}

const mostrar = (v) => {
  if (typeof v === 'string') return codigo(JSON.stringify(v));
  try {
    return codigo(String(JSON.stringify(v) ?? String(v)));
  } catch {
    return 'un valor';
  }
};

/**
 * What the program threw and nobody caught, as `ctx.dump` gives it: an Error ({ name, message, stack }) or any value.
 * `fuentes`: Map of the project's files by name. `faltante`: an import of a file that isn't there ({ desde, pedido }).
 */
export function explicarError(valor, fuentes, { faltante = null } = {}) {
  const lineasDe = (archivo) => String(fuentes.get(archivo) ?? '').split('\n');
  const varios = [...fuentes.keys()].filter((n) => /\.m?js$/i.test(n)).length > 1;
  if (faltante) {
    const lineas = lineasDe(faltante.desde);
    const n = lineas.findIndex((l) => l.includes(`'${faltante.pedido}'`) || l.includes(`"${faltante.pedido}"`)) + 1;
    const pista = DE_NODE.test(faltante.pedido)
      ? `${codigo(faltante.pedido)} es de Node. Para leer del teclado usá \`prompt()\`.`
      : `No está ${codigo(faltante.pedido)} en el proyecto. Fijate que se llame igual, con su carpeta y su \`.js\`.`;
    const donde = n ? `  ${faltante.desde}, línea ${n}\n${conMarca(lineas[n - 1])}\n` : '';
    return { error: `${donde}Error: ${pista}`, linea: n, archivo: n ? faltante.desde : null };
  }
  if (!valor || typeof valor !== 'object' || typeof valor.message !== 'string') {
    return { error: `Se lanzó ${mostrar(valor)} con \`throw\` y nadie lo atrapó.`, linea: 0, archivo: null };
  }
  const nombre = typeof valor.name === 'string' && valor.name ? valor.name : 'Error';
  const todos = marcosDe(valor.stack);
  const propios = todos.filter((m) => fuentes.has(m.archivo));
  const primero = propios[0] ?? null;
  // JSON.parse says where in the text it broke, not in the code.
  const deJson = todos[0]?.archivo === '<input>';
  const lugar = { fuente: primero ? lineasDe(primero.archivo)[primero.linea - 1] ?? '' : '', columna: primero?.columna ?? 0, funcion: primero?.funcion && !SIN_NOMBRE.has(primero.funcion) ? primero.funcion : null };
  const que = deJson ? 'El texto que le pasaste a `JSON.parse` no es JSON válido.' : traducir(valor.message, lugar);
  const texto = que ? conOriginal(`${nombre}: ${que}`, `${nombre}: ${valor.message}`) : `${nombre}: ${valor.message}`;
  if (!primero) return { error: texto, linea: 0, archivo: null };
  // A syntax error: the line with a ^ where it is. What's missing goes at the end of what comes before it.
  if (nombre === 'SyntaxError' && !deJson && !primero.funcion) {
    const falta = /^expecting /.test(valor.message);
    const sitio = falta ? finDelAnterior(fuentes.get(primero.archivo), primero.linea, primero.columna - 1) : { linea: primero.linea, columna: primero.columna - 1 };
    const fuente = lineasDe(primero.archivo)[sitio.linea - 1] ?? '';
    const donde = [`  ${primero.archivo}, línea ${sitio.linea}`, fuente.trim() ? conMarca(fuente, sitio.columna) : ''].filter(Boolean).join('\n');
    return { error: `${donde}\n${texto}`, linea: sitio.linea, archivo: primero.archivo };
  }
  return { error: `${decirMarcos(propios, varios).join('\n')}\n${texto}`, linea: primero.linea, archivo: primero.archivo };
}
