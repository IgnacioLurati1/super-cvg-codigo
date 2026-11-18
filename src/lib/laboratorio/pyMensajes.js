// What Python says when a program breaks (the traceback of corredor.js), in the student's words. Only the last line is
// said again, the one that names what happened («NameError: name 'x' is not defined»): the frames above it, with the
// file, the line and the ^, stay as Python writes them so the marks point at their place. The kind of error stays in
// English as Python names it (NameError), and the original line goes under the translation so it can be looked up.
// One that isn't known stays as it came. As cMensajes.js (C) and jsMensajes.js (JavaScript).
import { conOriginal, partirError } from './error';

const codigo = (t) => `\`${t}\``;
const PLURAL = (n, uno, varios) => (n === 1 ? uno : varios);
const quisiste = (s) => (s ? ` ¿Quisiste decir ${codigo(s)}?` : '');

// A type as Python names it, in words, with its article.
const TIPOS = {
  int: 'un número entero',
  float: 'un número con coma',
  str: 'un texto',
  list: 'una lista',
  tuple: 'una tupla',
  dict: 'un diccionario',
  set: 'un conjunto',
  bool: 'un booleano',
  NoneType: '`None`',
  function: 'una función',
  range: 'un `range`',
  complex: 'un número complejo',
};
const capital = (t) => t[0].toUpperCase() + t.slice(1);
const tipo = (n) => TIPOS[n] ?? `un valor de tipo ${codigo(n)}`;

const CIERRE = { '(': ')', '[': ']', '{': '}' };
const ABRE = { ')': '(', ']': '[', '}': '{' };
const QUE_SE_ASIGNA = { literal: 'un valor fijo', 'function call': 'una llamada a una función', expression: 'una cuenta', lambda: 'una `lambda`', comparison: 'una comparación' };
// «function definition», «'if' statement»: what has an empty block under it.
const DEL_BLOQUE = /^(?:function definition|class definition|'\w+' statement)$/;

// Each known last line, as a pattern, and how it's said here with what it names. The text goes after the kind of error.
const TRADUCCIONES = [
  // Names
  [/^NameError: name '(.+?)' is not defined$/, (m) => `${codigo(m[1])} no existe. Fijate que esté escrita igual, con las mismas mayúsculas, y que la hayas creado antes de usarla.`],
  [/^UnboundLocalError: cannot access local variable '(.+?)' where it is not associated with a value$/, (m) => `Usaste ${codigo(m[1])} adentro de la función antes de darle un valor. Una variable a la que le asignás algo adentro de una función es de esa función.`],
  // Syntax
  [/^SyntaxError: '([([{])' was never closed$/, (m) => `Abriste un ${codigo(m[1])} y no lo cerraste con su ${codigo(CIERRE[m[1]])}.`],
  [/^SyntaxError: unmatched '([)\]}])'$/, (m) => `Sobra un ${codigo(m[1])}, porque no hay un ${codigo(ABRE[m[1]])} abierto.`],
  [/^SyntaxError: closing parenthesis '(.)' does not match opening parenthesis '(.)'(?: on line \d+)?$/, (m) => `Abriste un ${codigo(m[2])} y lo cerraste con un ${codigo(m[1])}. Tienen que ser del mismo tipo.`],
  [/^SyntaxError: expected ':'$/, () => 'Falta el `:` al final de esa línea.'],
  [/^SyntaxError: invalid syntax\. Maybe you meant '==' or ':=' instead of '='\?$/, () => 'Para comparar se usa `==`. Un solo `=` sirve para asignar un valor.'],
  [/^SyntaxError: invalid syntax\. Perhaps you forgot a comma\?$/, () => 'Falta una coma entre dos valores.'],
  [/^SyntaxError: invalid syntax$/, () => 'Esa línea está mal escrita. Fijate donde marca la `^` y también la línea de arriba, por si falta cerrar algo.'],
  [/^SyntaxError: unterminated string literal \(detected at line \d+\)$/, () => 'Falta cerrar las comillas de un texto.'],
  [/^SyntaxError: unterminated triple-quoted string literal \(detected at line \d+\)$/, () => 'Falta cerrar un texto de tres comillas.'],
  [/^SyntaxError: Missing parentheses in call to 'print'\..*$/, () => '`print` lleva paréntesis. Se escribe `print(...)`.'],
  [/^SyntaxError: cannot assign to (.+?) here\. Maybe you meant '==' instead of '='\?$/, (m) => `A la izquierda del \`=\` va una variable, y ahí hay ${QUE_SE_ASIGNA[m[1]] ?? 'algo que no es una variable'}. Si querías comparar, usá \`==\`.`],
  [/^SyntaxError: 'return' outside function$/, () => '`return` va adentro de una función.'],
  [/^SyntaxError: '(break|continue)' outside loop$/, (m) => `${codigo(m[1])} va adentro de un \`for\` o de un \`while\`.`],
  [/^SyntaxError: positional argument follows keyword argument$/, () => 'Los argumentos con nombre, como `sep=","`, van al final.'],
  [/^SyntaxError: parameter without a default follows parameter with a default$/, () => 'Los parámetros con valor por defecto van después de los que no lo tienen.'],
  [/^SyntaxError: duplicate argument '(.+?)' in function definition$/, (m) => `El parámetro ${codigo(m[1])} está repetido.`],
  [/^SyntaxError: invalid decimal literal$/, () => 'Hay un número con letras pegadas. Un nombre no puede empezar con un número.'],
  [/^SyntaxError: invalid non-printable character (U\+\w+)$/, (m) => `Hay un carácter invisible (${m[1]}), seguramente de copiar y pegar. Borralo y escribilo de nuevo.`],
  [/^SyntaxError: invalid character '(.+?)' \((U\+\w+)\)$/, (m) => `Hay un carácter que Python no entiende, ${codigo(m[1])}. Si son comillas de Word o de una página, escribilas de nuevo.`],
  [/^SyntaxError: f-string: expecting .*'\}'.*$/, () => 'En un f-string falta cerrar una `{` con su `}`, o hay algo raro adentro.'],
  // Indentation
  [/^IndentationError: unexpected indent$/, () => 'Esa línea tiene espacios de más al principio. Tiene que estar alineada con la de arriba.'],
  [/^IndentationError: expected an indented block after (.+) on line (\d+)$/, (m) => (DEL_BLOQUE.test(m[1]) ? `Después de la línea ${m[2]} va un bloque con sangría, o sea con espacios al principio, y no hay ninguno. Si todavía no sabés qué poner, escribí \`pass\`.` : null)],
  [/^IndentationError: unindent does not match any outer indentation level$/, () => 'Los espacios al principio de esa línea no coinciden con los de ningún bloque de arriba. Alineala con el bloque al que pertenece.'],
  [/^TabError: inconsistent use of tabs and spaces in indentation$/, () => 'Mezclaste tabuladores y espacios al principio de las líneas. Usá solo uno de los dos.'],
  // Types
  [/^TypeError: can only concatenate (\w+) \(not "(\w+)"\) to (\w+)$/, (m) => `No se puede sumar ${tipo(m[1])} con ${tipo(m[2])}. Convertí uno de los dos con \`str()\`, \`int()\` o \`float()\`.`],
  [/^TypeError: unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'$/, (m) => `No se puede hacer ${codigo(m[1])} entre ${tipo(m[2])} y ${tipo(m[3])}.`],
  [/^TypeError: bad operand type for unary (.+): '(\w+)'$/, (m) => `No se puede usar ${codigo(m[1])} con ${tipo(m[2])}.`],
  [/^TypeError: object of type '(\w+)' has no len\(\)$/, (m) => `\`len()\` no sirve con ${tipo(m[1])}.`],
  [/^TypeError: (?:\w+\.)?(\w+)\(\) takes (?:from \d+ to )?(\d+) positional arguments? but (\d+) (?:was|were) given$/, (m) => `${codigo(m[1])} recibe ${m[2]} ${PLURAL(Number(m[2]), 'argumento', 'argumentos')} y le pasaste ${m[3]}.${Number(m[3]) === Number(m[2]) + 1 ? ' Si es un método de una clase, fijate que tenga `self` como primer parámetro.' : ''}`],
  [/^TypeError: (?:\w+\.)?(\w+)\(\) missing (\d+) required positional arguments?: (.+)$/, (m) => `A ${codigo(m[1])} le ${PLURAL(Number(m[2]), 'falta', 'faltan')} ${m[2]} ${PLURAL(Number(m[2]), 'argumento', 'argumentos')}, ${m[3].replace(/'/g, '`').replace(/,? and /, ' y ')}.${/'self'/.test(m[3]) ? ' Un método se llama sobre un objeto, como `objeto.metodo()`.' : ''}`],
  [/^TypeError: (?:\w+\.)?(\w+)\(\) got an unexpected keyword argument '(.+?)'$/, (m) => `${codigo(m[1])} no tiene un parámetro que se llame ${codigo(m[2])}.`],
  [/^TypeError: '(\w+)' object is not callable$/, (m) => `Llamaste con \`()\` a ${tipo(m[1])}, y no es una función. ¿Le pusiste a una variable el nombre de una función?`],
  [/^TypeError: '(\w+)' object is not subscriptable$/, (m) => `Usaste \`[]\` sobre ${tipo(m[1])}, que no tiene elementos para pedir por lugar.${m[1] === 'NoneType' ? ' Seguro una función no devolvió nada, le falta el `return`.' : ''}`],
  [/^TypeError: '(\w+)' object does not support item assignment$/, (m) => `${capital(tipo(m[1]))} no se puede modificar elemento por elemento.${m[1] === 'tuple' || m[1] === 'str' ? ' Para cambiarlo, armá uno nuevo o usá una lista.' : ''}`],
  [/^TypeError: (list|tuple|str) indices must be integers or slices, not (\w+)$/, (m) => `El lugar que se pide de ${tipo(m[1])} tiene que ser un número entero, y le pasaste ${tipo(m[2])}.`],
  [/^TypeError: '(\w+)' object is not iterable$/, (m) => `No se puede recorrer ${tipo(m[1])}.${m[1] === 'int' ? ' Para recorrer números usá `range()`.' : ''}`],
  [/^TypeError: '(\S+)' not supported between instances of '(\w+)' and '(\w+)'$/, (m) => `No se puede comparar ${tipo(m[2])} con ${tipo(m[3])} usando ${codigo(m[1])}.`],
  [/^TypeError: cannot use '(\w+)' as a dict key \(unhashable type: '\w+'\)$|^TypeError: unhashable type: '(\w+)'$/, (m) => `${capital(tipo(m[1] ?? m[2]))} no puede ser clave de un diccionario ni estar en un conjunto, porque se puede modificar.`],
  [/^TypeError: can't multiply sequence by non-int of type '(\w+)'$/, (m) => `Un texto o una lista solo se multiplica por un número entero, y le pasaste ${tipo(m[1])}.`],
  [/^TypeError: '(\w+)' object cannot be interpreted as an integer$/, (m) => `Acá hace falta un número entero y llegó ${tipo(m[1])}. Con \`int()\` lo convertís.`],
  [/^TypeError: (\w+)\(\) argument must be a string, a bytes-like object or a real number, not '(\w+)'$/, (m) => `${codigo(`${m[1]}()`)} no puede convertir ${tipo(m[2])}.`],
  [/^TypeError: cannot unpack non-iterable (\w+) object$/, (m) => `No se puede repartir ${tipo(m[1])} en varias variables.`],
  [/^TypeError: can't convert complex to float$/, () => 'Un número complejo no se puede pasar a número con coma.'],
  // Numbers and values
  [/^ZeroDivisionError: .*(?:by zero|zero to a negative power).*$/, () => 'Dividiste por cero. Fijate que el divisor no pueda valer 0, por ejemplo con un `if`.'],
  [/^ValueError: invalid literal for int\(\) with base (\d+): (.+)$/, (m) => `\`int()\` no puede convertir ${m[2]} en un número entero.`],
  [/^ValueError: could not convert string to float: (.+)$/, (m) => `\`float()\` no puede convertir ${m[1]} en un número.`],
  [/^ValueError: too many values to unpack \(expected (\d+), got (\d+)\)$/, (m) => `Querés repartir ${m[2]} valores en ${m[1]} ${PLURAL(Number(m[1]), 'variable', 'variables')}. Tienen que ser la misma cantidad.`],
  [/^ValueError: not enough values to unpack \(expected (\d+), got (\d+)\)$/, (m) => `Querés repartir ${m[2]} ${PLURAL(Number(m[2]), 'valor', 'valores')} en ${m[1]} variables. Tienen que ser la misma cantidad.`],
  [/^ValueError: (?:list\.(?:index|remove)\(x\): x not in list|.+ is not in list)$/, () => 'Ese valor no está en la lista. Con `in` preguntás antes si está.'],
  [/^ValueError: (?:math domain error|expected a nonnegative input, got .+)$/, () => 'Esa función de `math` no está definida para ese número. Por ejemplo, la raíz de un número negativo.'],
  [/^ValueError: chr\(\) arg not in range\(.+\)$/, () => '`chr()` recibió un número que no corresponde a ningún carácter.'],
  [/^OverflowError: (?:math range error|\(\d+, 'Result not representable'\)|.*too large.*)$/, () => 'El resultado es un número demasiado grande para Python.'],
  // Lists, dictionaries and objects
  [/^IndexError: (list|string|tuple) index out of range$/, (m) => `Pediste un lugar de ${tipo(m[1] === 'string' ? 'str' : m[1])} que no existe. Si tiene n elementos, los lugares van de 0 a n-1.`],
  [/^IndexError: list assignment index out of range$/, () => 'Asignaste a un lugar de la lista que no existe. Para agregar al final usá `append()`.'],
  [/^IndexError: pop from empty list$/, () => 'Usaste `pop()` en una lista vacía.'],
  [/^KeyError: (.+)$/, (m) => `No hay ninguna clave ${m[1]} en el diccionario. Con \`in\` preguntás antes si está, y con \`.get()\` no falla.`],
  [/^AttributeError: '(\w+)' object has no attribute '(.+?)'$/, (m) => `${m[1] === 'NoneType' ? 'El valor es `None`' : capital(tipo(m[1]))} y no tiene ${codigo(m[2])}.${m[1] === 'NoneType' ? ' Seguro una función no devolvió nada, le falta el `return`.' : ' Fijate cómo se escribe y de qué tipo es el valor.'}`],
  [/^AttributeError: module '(.+?)' has no attribute '(.+?)'$/, (m) => `El módulo ${codigo(m[1])} no tiene ${codigo(m[2])}. Fijate cómo se escribe.`],
  // Modules, files and the keyboard
  [/^(?:ModuleNotFoundError|ImportError): No module named '(.+?)'; '(.+?)' is not a package$/, (m) => `${codigo(m[2])} no es un paquete, así que no tiene ${codigo(m[1])} adentro.`],
  [/^ModuleNotFoundError: No module named '(.+?)'$/, (m) => `No se encuentra el módulo ${codigo(m[1])}. Fijate cómo está escrito.`],
  [/^ImportError: cannot import name '(.+?)' from '(.+?)'.*$/, (m) => `El módulo ${codigo(m[2])} no tiene ${codigo(m[1])}. Fijate cómo se escribe.`],
  [/^FileNotFoundError: \[Errno \d+\] No such file or directory: (.+)$/, (m) => `No existe el archivo ${m[1].replace(/^'(.*)'$/, '`$1`')}. Fijate que se llame igual y que esté en el proyecto, en la misma carpeta.`],
  [/^IsADirectoryError: \[Errno \d+\] Is a directory: (.+)$/, (m) => `${m[1].replace(/^'(.*)'$/, '`$1`')} es una carpeta, no un archivo.`],
  [/^EOFError: EOF when reading a line$/, () => '`input()` pidió un dato y no había nada para leer.'],
  // Others
  [/^RecursionError: maximum recursion depth exceeded.*$/, () => 'La función se llamó a sí misma demasiadas veces. Fijate que tenga un caso base que corte la recursión.'],
  [/^AssertionError$/, () => 'Falló un `assert`. Lo que afirmaba era falso.'],
  [/^AssertionError: (.+)$/, (m) => `Falló un \`assert\` con el mensaje «${m[1]}». Lo que afirmaba era falso.`],
  [/^StopIteration$/, () => '`next()` no tiene más elementos para dar.'],
  [/^RuntimeError: No active exception to reraise$/, () => '`raise` solo, sin nada atrás, va adentro de un `except`.'],
];

/** One line of what happened («NameError: name 'x' is not defined»), told in Spanish, or null if it isn't a known one. */
function decir(linea) {
  // «Did you mean: 'y'?» is said at the end, in Spanish.
  const sugerencia = /\.? Did you mean: '(.+?)'\?$/.exec(linea);
  const limpia = sugerencia ? linea.slice(0, sugerencia.index) : linea;
  for (const [patron, dicho] of TRADUCCIONES) {
    const m = patron.exec(limpia);
    if (!m) continue;
    const texto = dicho(m);
    if (texto === null) return null;
    const tipoDeError = limpia.split(':')[0];
    return conOriginal(`${tipoDeError}: ${texto}${quisiste(sugerencia?.[1])}`, linea);
  }
  return null;
}

/**
 * The error of a Python run or check as the console shows it, with its last line in Spanish and the original under it.
 * The frames above (the indented part, error.js) and the line of the error don't change.
 */
export function explicarPython(texto) {
  const original = String(texto ?? '');
  const { donde, que } = partirError(original);
  const [primera, ...resto] = que.split('\n');
  const dicha = decir(primera);
  if (!dicha) return original;
  return `${[donde, [dicha, ...resto].join('\n')].filter(Boolean).join('\n')}${original.endsWith('\n') ? '\n' : ''}`;
}
