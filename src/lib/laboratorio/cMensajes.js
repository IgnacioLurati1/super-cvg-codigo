// What the C compiler (xcc) and a program that breaks say, in the student's words. The compiler writes each problem as
// «file(line): message», with the line of code and a ^ under the token; here it becomes the line to mark, the message in
// Spanish when it's a known one (the original otherwise) and the code with its mark, ready for the console (error.js:
// the indented part is where, the rest is what happened). A missing `;` or `)` is told where it's missing: the compiler
// notices it on the next token, which is often on the line below.

import { conOriginal } from './error';

// Where each function of the C library is declared: «not declared» says which #include is missing.
const CABECERAS = {
  'stdio.h': 'printf scanf puts putchar getchar gets fgets fopen fclose fprintf fscanf sprintf snprintf sscanf fputs fgetc fputc getc putc ungetc perror fflush fread fwrite feof ferror clearerr rewind fseek ftell fgetpos fsetpos setbuf setvbuf remove rename getline tmpfile vprintf vfprintf vsprintf vsnprintf EOF FILE SEEK_SET SEEK_CUR SEEK_END stdin stdout stderr',
  'stdlib.h': 'malloc calloc realloc free exit atexit atoi atof atol atoll strtol strtoul strtoll strtoull strtod strtof rand srand qsort bsearch abs labs llabs div ldiv lldiv abort getenv EXIT_SUCCESS EXIT_FAILURE RAND_MAX',
  'string.h': 'strlen strcpy strncpy strcat strncat strcmp strncmp strchr strrchr strstr strtok strdup strndup strspn strcspn strpbrk strerror strcasecmp strncasecmp memcpy memmove memset memcmp memchr',
  'math.h': 'sqrt cbrt pow hypot sin cos tan asin acos atan atan2 sinh cosh tanh exp exp2 log log10 log2 fabs floor ceil round trunc rint lround fmod fmin fmax sqrtf powf fabsf floorf ceilf roundf M_PI M_E INFINITY NAN isnan isinf',
  'ctype.h': 'isdigit isalpha isalnum isspace isblank isupper islower ispunct isxdigit isprint isgraph iscntrl toupper tolower',
  'time.h': 'time clock difftime mktime localtime gmtime strftime asctime ctime time_t clock_t CLOCKS_PER_SEC',
  'stdbool.h': 'bool true false',
  'assert.h': 'assert',
  'limits.h': 'INT_MAX INT_MIN UINT_MAX LONG_MAX LONG_MIN LLONG_MAX LLONG_MIN SHRT_MAX SHRT_MIN CHAR_MAX CHAR_MIN',
  'stdint.h': 'int8_t uint8_t int16_t uint16_t int32_t uint32_t int64_t uint64_t intptr_t uintptr_t INT32_MAX INT64_MAX',
  'float.h': 'DBL_MAX DBL_MIN DBL_EPSILON FLT_MAX FLT_MIN FLT_EPSILON',
  'stddef.h': 'NULL size_t',
};
export const CABECERA_DE = new Map(Object.entries(CABECERAS).flatMap(([h, nombres]) => nombres.split(' ').map((n) => [n, h])));

// What the lab can't do: it is one program alone, without processes, threads or signals.
const SIN_PROCESOS = /^(?:fork|vfork|wait|waitpid|exec\w*|pipe2?|dup2?|kill|signal|raise|getpid|getppid|sleep|usleep|pthread_\w+|sem_\w+|shm\w+|mmap|munmap|popen|pclose)$/;
const CABECERAS_DE_SISTEMA = /^(?:pthread|semaphore|signal|sys\/wait|sys\/mman|sys\/ipc|sys\/shm|sys\/sem|sys\/socket|netinet\/in|arpa\/inet|termios|dirent|sched)\.h$/;

const codigo = (t) => `\`${t}\``;
const PLURAL = (n, uno, varios) => (n === 1 ? uno : varios);

// Each known message: the English one (as a pattern) and how it's said here. `$1`… are what it names.
const TRADUCCIONES = [
  [/^`;' expected$/, 'Falta un `;`.'],
  [/^`\)' expected$/, 'Falta cerrar un paréntesis, `)`.'],
  [/^`\(' expected$/, 'Falta abrir un paréntesis, `(`.'],
  [/^`\]' expected$/, 'Falta cerrar un corchete, `]`.'],
  [/^`\}' expected$/, 'Falta cerrar una llave, `}`. Cada `{` necesita la suya.'],
  [/^`:' expected$/, 'Falta un `:`.'],
  [/^`,' expected$/, 'Falta una coma.'],
  [/^`,' or `\)` expected$|^`,' or `\)' expected$/, 'Falta una coma o cerrar el paréntesis.'],
  [/^`;' or `,' expected$/, 'Falta un `;` o una coma.'],
  [/^`\}' or `,' expected$/, 'Falta una coma o cerrar la llave.'],
  [/^`while' expected$/, 'Falta el `while` del `do`.'],
  [/^`=' expected for dotted initializer$/, 'Falta el `=` después del campo.'],
  [/^String not closed$/, 'Falta cerrar las comillas de un texto.'],
  [/^Block comment not closed$/, 'Falta cerrar un comentario con `*/`.'],
  [/^Illegal literal$|^Illegal (?:unsigned|long) literal$/, 'Ese número está mal escrito.'],
  [/^Illegal escape$/, 'Esa secuencia con `\\` no existe.'],
  [/^Unexpected character `(.)'\(\d+\)$/, (m) => `C no entiende el carácter ${codigo(m[1])}.`],
  [/^Illegal byte sequence$/, 'Hay un carácter que C no entiende.'],
  [/^ident expected$|^member name expected$/, 'Falta un nombre.'],
  [/^type expected$/, 'Falta un tipo.'],
  [/^expression expected$/, 'Falta una expresión.'],
  [/^statement expected$/, 'Falta una instrucción.'],
  [/^unexpected token$|^Unexpected$/, 'Algo sobra o está fuera de lugar.'],
  [/^`(\w+)' undeclared$/, (m) => noDeclarada(m[1])],
  [/^`(\w+)' undefined$/, (m) => `${codigo(m[1])} no está definida.`],
  [/^`(\w+)' (?:is )?already defined$/, (m) => `${codigo(m[1])} ya está declarada. Usá otro nombre.`],
  [/^`(\w+)' function already defined$/, (m) => `La función ${codigo(m[1])} ya está escrita más arriba.`],
  [/^`(\w+)' type conflict$|^definition conflict: `(\w+)'$/, (m) => `${codigo(m[1] ?? m[2])} está declarada con otro tipo más arriba.`],
  [/^function `(\w+)' expect (\d+) arguments, but (\d+)$/, (m) => `${codigo(m[1])} recibe ${m[2]} ${PLURAL(Number(m[2]), 'argumento', 'argumentos')} y le pasaste ${m[3]}.`],
  [/^cannot call except function$/, 'Eso no es una función, pero se llama como una.'],
  [/^`(\w+)' doesn't exist in the struct$|^`(\w+)' is not member of struct$/, (m) => `El struct no tiene un campo ${codigo(m[1] ?? m[2])}.`],
  [/^`\.' for non struct value$/, 'Usaste `.` en algo que no es un struct.'],
  [/^`->' for non pointer value$/, 'Usaste `->` en algo que no es un puntero. Si es un struct, va con `.`.'],
  [/^`->' for non struct value$/, 'Usaste `->` en un puntero que no apunta a un struct.'],
  [/^cannot assign to array$/, 'No se puede asignar un arreglo entero. Copialo elemento por elemento o con `memcpy`.'],
  [/^cannot assign to (.+)$/, 'Eso no se puede asignar.'],
  [/^cannot assign to incompatible struct$/, 'Los dos lados del `=` no son del mismo tipo.'],
  [/^cannot modify `const'$/, 'Eso es `const` y no se puede cambiar.'],
  [/^lvalue expected$|^Cannot take reference$/, 'A la izquierda del `=` (o después de `&`) va una variable.'],
  [/^convert value from type `(.+?)' to `(.+?)'$|^convert value from type `(.+?)' to array type `(.+?)'$/, (m) => `No se puede pasar de ${codigo(m[1] ?? m[3])} a ${codigo(m[2] ?? m[4])}.`],
  [/^incompatible type$|^lhs and rhs must be same type$/, 'Los tipos no coinciden.'],
  [/^cannot compare except numbers$/, 'Solo se pueden comparar números o punteros.'],
  [/^array or pointer required for `\['$/, 'Usaste `[]` en algo que no es un arreglo ni un puntero.'],
  [/^int required for `\['$/, 'Lo que va entre `[]` tiene que ser un entero.'],
  [/^cannot dereference raw type$/, 'Usaste `*` en algo que no es un puntero.'],
  [/^`return' required a value$/, 'Falta el valor del `return`.'],
  [/^void function `return' a value$/, 'Una función `void` no devuelve nada.'],
  [/^`(break|continue)' cannot be used outside of loop$/, (m) => `${codigo(m[1])} va adentro de un bucle${m[1] === 'break' ? ' o de un `switch`' : ''}.`],
  [/^`(case|default)' cannot use outside of `switch`$/, (m) => `${codigo(m[1])} va adentro de un \`switch\`.`],
  [/^`default' already defined in `switch'$/, 'Este `switch` ya tiene un `default`.'],
  [/^case value `(.+)' already defined$/, (m) => `Este \`switch\` ya tiene un \`case ${m[1]}\`.`],
  [/^excess elements in array initializer$|^initializer more than array size$/, 'Hay más valores que lugares en el arreglo.'],
  [/^array size must be greater than 0.*$/, 'El tamaño de un arreglo tiene que ser mayor que cero.'],
  [/^(?:must be constant|constant expression expected|initializer must be constant|constant integer expected)$/, 'Acá va un valor fijo, no una variable.'],
  [/^illegal type combination$/, 'Esa combinación de tipos no existe.'],
  [/^`void' not allowed$/, 'Acá no puede ir algo `void`.'],
  [/^size unknown$/, 'No se sabe cuánto mide ese tipo. ¿Falta declarar el struct?'],
  [/^incomplete struct: `(\w+)'$/, (m) => `El struct ${codigo(m[1])} no tiene sus campos declarados.`],
  [/^Character not closed$/, "Un carácter va entre comillas simples y es uno solo, como 'a'. Para varias letras va un texto entre comillas dobles."],
  [/^compare pointer to other types$/, 'Se compara un puntero, o un texto, con algo que no es un puntero. Para comparar textos va `strcmp`.'],
  [/^int type expected$/, 'Esa operación, como el `%`, solo anda con números enteros.'],
  // Warnings: they don't stop the program.
  [/^divide by 0$/, 'Divide por cero.'],
  [/^unreachable$/, 'Este código nunca se ejecuta.'],
  [/^`return' required$/, 'Falta un `return` al final de la función.'],
  [/^`return' with void value$/, 'Un `return` sin valor en una función que devuelve algo.'],
  [/^unused variable:? `(\w+)'$/, (m) => `La variable ${codigo(m[1])} no se usa.`],
  [/^unused function: `(\w+)'$/, (m) => `La función ${codigo(m[1])} no se usa.`],
  [/^always (true|false)$/, (m) => `Esa condición siempre da ${m[1] === 'true' ? 'verdadero' : 'falso'}.`],
];

function noDeclarada(nombre) {
  if (SIN_PROCESOS.test(nombre)) return `${codigo(nombre)} no anda en el laboratorio. Corre un solo programa, sin procesos, hilos ni señales.`;
  const h = CABECERA_DE.get(nombre);
  if (h) return `${codigo(nombre)} no está declarada. Sumá \`#include <${h}>\` arriba de todo.`;
  return `${codigo(nombre)} no está declarada. Fijate que esté bien escrita y declarada antes de usarla.`;
}

/** The message in Spanish if it's a known one, or the one of the compiler. */
export function traducir(mensaje) {
  for (const [patron, dicho] of TRADUCCIONES) {
    const m = patron.exec(mensaje);
    if (m) return typeof dicho === 'function' ? dicho(m) : dicho;
  }
  return mensaje;
}

/** The problems of a compilation: { linea, columna, aviso, mensaje, fuente, marca, archivo } (`archivo`, the name of
 * the student's file, or null if it's another), and the lines of the compiler that don't say a line («Cannot open
 * file», what the linker didn't find). `rutas` maps the path of each file of the student to its name. */
export function leerDiagnosticos(salida, rutas) {
  const lineas = String(salida ?? '').replace(/\r/g, '').split('\n');
  const diagnosticos = [];
  const sueltos = [];
  for (let i = 0; i < lineas.length; i += 1) {
    const l = lineas[i];
    if (!l.trim()) continue;
    const m = /^(.+?)\((\d+)\): (warning: )?(.*)$/.exec(l);
    if (!m) {
      sueltos.push(l.trim());
      continue;
    }
    const archivo = rutas.get(m[1]) ?? null;
    const d = { propio: archivo !== null, archivo, linea: Number(m[2]), columna: -1, aviso: Boolean(m[3]), mensaje: m[4].trim(), fuente: '', marca: '' };
    // The line of code and the ^ under the token, if they follow.
    if (/^[ \t]*\^~*$/.test(lineas[i + 2] ?? '')) {
      d.fuente = lineas[i + 1];
      d.marca = lineas[i + 2];
      d.columna = d.marca.indexOf('^');
      i += 2;
    }
    diagnosticos.push(d);
  }
  return { diagnosticos, sueltos };
}

// The code without its comments and the inside of its strings, same length and same lines: to find where a token is.
function sinComentarios(texto) {
  let fuera = '';
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === '/' && texto[i + 1] === '/') {
      while (i < texto.length && texto[i] !== '\n') {
        fuera += ' ';
        i += 1;
      }
    } else if (c === '/' && texto[i + 1] === '*') {
      const fin = texto.indexOf('*/', i + 2);
      const hasta = fin < 0 ? texto.length : fin + 2;
      fuera += texto.slice(i, hasta).replace(/[^\n]/g, ' ');
      i = hasta;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < texto.length && texto[j] !== c && texto[j] !== '\n') j += texto[j] === '\\' ? 2 : 1;
      fuera += c + texto.slice(i + 1, j).replace(/[^\n]/g, 'x') + (texto[j] === c ? c : '');
      i = texto[j] === c ? j + 1 : j;
    } else {
      fuera += c;
      i += 1;
    }
  }
  return fuera;
}

/** Where the token before (linea, columna) ends, both from 1: the place of something missing after it. */
export function finDelAnterior(codigoFuente, linea, columna) {
  const lineas = sinComentarios(String(codigoFuente)).split('\n');
  const antes = (lineas[linea - 1] ?? '').slice(0, Math.max(0, columna));
  if (antes.trim()) return { linea, columna: antes.trimEnd().length };
  for (let n = linea - 1; n >= 1; n -= 1) {
    const l = lineas[n - 1] ?? '';
    if (l.trim()) return { linea: n, columna: l.trimEnd().length };
  }
  return { linea, columna: Math.max(0, columna) };
}

// A line of code for the console: without its indentation, and with the ^ under `columna` (-1, without it).
export function conMarca(fuente, columna = -1, largo = 1) {
  const linea = fuente.replace(/\t/g, '    ');
  const sangria = linea.length - linea.trimStart().length;
  const lugar = fuente.slice(0, Math.max(0, columna)).replace(/\t/g, '    ').length - sangria;
  const marca = columna >= 0 ? `\n    ${' '.repeat(Math.max(0, lugar))}^${'~'.repeat(Math.max(0, largo - 1))}` : '';
  return `    ${linea.slice(sangria)}${marca}`;
}

// The headers there are, to suggest the right one when one is misspelled.
const CABECERAS_CONOCIDAS = [...Object.keys(CABECERAS), 'stdint.h', 'stdarg.h', 'float.h', 'errno.h', 'inttypes.h', 'strings.h', 'unistd.h', 'wchar.h', 'setjmp.h', 'fcntl.h', 'stdnoreturn.h', 'alloca.h', 'libgen.h', 'sys/stat.h', 'sys/types.h'];

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function sinCabecera(nombre) {
  const limpio = nombre.replace(/^[<"]|[>"]$/g, '');
  if (CABECERAS_DE_SISTEMA.test(limpio)) return `\`<${limpio}>\` no está en el laboratorio. Corre un solo programa, sin procesos, hilos ni señales.`;
  if (/^(?:conio|windows|dos)\.h$/i.test(limpio)) return `\`<${limpio}>\` es de Windows y acá no está.`;
  const parecida = CABECERAS_CONOCIDAS.map((h) => [h, distancia(h, limpio)]).filter(([, n]) => n <= 2).sort((a, b) => a[1] - b[1])[0];
  return parecida ? `No existe \`<${limpio}>\`. ¿Quisiste decir \`<${parecida[0]}>\`?` : `No existe \`<${limpio}>\` en el laboratorio.`;
}

function lineaDeTexto(codigoFuente, buscado) {
  const i = String(codigoFuente).split('\n').findIndex((l) => l.includes(buscado));
  return i + 1;
}

// The first file of the project (the main one first) with `buscado`, and its line; or the main one without line.
function dondeEsta(fuentes, buscado) {
  for (const f of fuentes) {
    const linea = lineaDeTexto(f.contenido, buscado);
    if (linea) return { archivo: f.nombre, linea, codigo: f.contenido };
  }
  return { archivo: fuentes[0]?.nombre ?? null, linea: 0, codigo: fuentes[0]?.contenido ?? '' };
}

// The name in the project of `incluido`, written in an #include "…" of `desde`: from the folder of `desde`.
function enLaCarpeta(desde, incluido) {
  const partes = [...desde.split('/').slice(0, -1), ...incluido.split('/')];
  const limpio = [];
  for (const p of partes) {
    if (p === '..') limpio.pop();
    else if (p && p !== '.') limpio.push(p);
  }
  return limpio.join('/');
}

// The files of a project from the code alone, as before.
const comoFuentes = (fuentes, nombre) => (typeof fuentes === 'string' || fuentes == null ? [{ nombre: nombre ?? 'tu_codigo.c', contenido: String(fuentes ?? '') }] : fuentes);

/** The line where function `nombre` is written (its header), or 0. */
export function lineaDeFuncion(codigoFuente, nombre) {
  if (!/^\w+$/.test(nombre)) return 0;
  const lineas = sinComentarios(String(codigoFuente)).split('\n');
  const cabecera = new RegExp(String.raw`^[A-Za-z_][\w\s*]*?\b${nombre}\s*\(`);
  for (let i = 0; i < lineas.length; i += 1) {
    if (!cabecera.test(lineas[i])) continue;
    // A declaration ends in `;` before its body: the body is what's wanted.
    const resto = lineas.slice(i, i + 6).join('\n');
    const llave = resto.indexOf('{');
    const punto = resto.indexOf(';');
    if (llave >= 0 && (punto < 0 || llave < punto)) return i + 1;
  }
  return 0;
}

/**
 * What a compilation that failed says: { error, linea, archivo } with the first problem of the student's code (with
 * where it is, indented, and what happened), and { avisos } (one text each, with their line) when it compiled with
 * warnings. `fuentes` are the files of the project [{ nombre, contenido }], or the code alone with its `nombre`.
 */
export function explicarCompilacion(salida, fuentes, nombre) {
  const lista = comoFuentes(fuentes, nombre);
  const varios = lista.length > 1;
  const rutas = new Map(lista.map((f) => [`/home/alumno/${f.nombre}`, f.nombre]));
  const contenido = new Map(lista.map((f) => [f.nombre, String(f.contenido)]));
  const { diagnosticos, sueltos } = leerDiagnosticos(salida, rutas);
  const errores = diagnosticos.filter((d) => !d.aviso && d.propio);
  const avisos = diagnosticos.filter((d) => d.aviso && d.propio && !errores.length);

  if (errores.length) {
    const d = errores[0];
    let archivo = d.archivo;
    let codigoFuente = contenido.get(archivo);
    let linea = d.linea;
    let fuente = d.fuente;
    let columna = d.columna;
    let largo = d.marca.trim().length || 1;
    let que = traducir(d.mensaje);
    const dicho = que !== d.mensaje;
    // Something missing at the end of a line: the compiler sees it on the next token, here it's said where it goes.
    const falta = /^`[^']+'(?: or `[^'`]+[`'])? expected$/.test(d.mensaje) && d.columna >= 0;
    if (falta) {
      // Seen after an #include "…": what's missing is at the end of that file.
      let lugar = finDelAnterior(codigoFuente, d.linea, d.columna);
      const incluido = /^\s*#\s*include\s*"([^"]+)"/.exec(String(codigoFuente).split('\n')[lugar.linea - 1] ?? '')?.[1];
      const otro = incluido && enLaCarpeta(archivo, incluido);
      if (otro && contenido.has(otro)) {
        archivo = otro;
        codigoFuente = contenido.get(otro);
        lugar = finDelAnterior(codigoFuente, codigoFuente.split('\n').length + 1, 0);
      }
      if (archivo !== d.archivo || lugar.linea !== d.linea || lugar.columna < d.columna) {
        linea = lugar.linea;
        fuente = String(codigoFuente).split('\n')[linea - 1] ?? '';
        columna = lugar.columna;
        largo = 1;
        if (archivo !== d.archivo || lugar.linea !== d.linea) {
          const [, primera, resto] = /^(.*?)\.(?: (.*))?$/.exec(que) ?? [null, que, ''];
          que = `${primera} al final de la línea ${linea}.${resto ? ` ${resto}` : ''}`;
        }
      }
    }
    // The ones after it that follow from it (the same place) don't count as more.
    const otras = new Set(errores.slice(1).filter((e) => e.linea !== d.linea || e.archivo !== d.archivo).map((e) => `${e.archivo}:${e.linea}`));
    const donde = [`  ${archivo}, línea ${linea}`, fuente.trim() ? conMarca(fuente, columna, largo) : ''].filter(Boolean).join('\n');
    const mas = otras.size ? `\n${PLURAL(otras.size, 'Hay otro error más abajo.', `Hay errores en ${otras.size} líneas más.`)} Arreglá este primero y corré de nuevo.` : '';
    return { error: `${donde}\n${dicho ? conOriginal(que, d.mensaje) : que}${mas}`, linea, archivo, avisos: [] };
  }

  // Without a line: a header that isn't there, or something the linker didn't find.
  for (const s of sueltos) {
    const archivo = /^Cannot open file: (.+?)\s*$/.exec(s);
    if (archivo) {
      const buscado = archivo[1].replace(/^[<"]|[>"]$/g, '');
      const en = dondeEsta(lista, buscado);
      const linea = en.linea || 1;
      const fuente = String(en.codigo).split('\n')[linea - 1] ?? '';
      // An #include "…" is a file of the project; one with < > is of the library.
      const propio = /^\s*#\s*include\s*"/.test(fuente) && fuente.includes(`"${buscado}"`);
      const que = propio ? `No está el archivo ${codigo(buscado)} en el proyecto. Fijate que se llame igual, con su carpeta.` : sinCabecera(archivo[1]);
      return { error: `  ${en.archivo}, línea ${linea}\n${conMarca(fuente)}\n${que}`, linea, archivo: en.archivo, avisos: [] };
    }
    const falta = /^Unresolved: (?:env\.)?(\w+)$/.exec(s);
    if (falta) {
      const f = falta[1];
      if (f === '__main_argc_argv' || f === 'main' || f === '__main_void') return { error: 'Falta la función `main`, que es donde empieza el programa.', linea: 0, archivo: null, avisos: [] };
      const en = dondeEsta(lista, `${f}(`);
      if (SIN_PROCESOS.test(f)) return { error: noDeclarada(f), linea: en.linea, archivo: en.archivo, avisos: [] };
      return { error: `Falta escribir la función ${codigo(f)}. Está declarada, pero no tiene su cuerpo con \`{ }\`.`, linea: en.linea, archivo: en.archivo, avisos: [] };
    }
    const doble = /^duplicate symbol: (\w+)$/.exec(s);
    if (doble) {
      const f = /^__main_(?:void|argc_argv)$/.test(doble[1]) ? 'main' : doble[1];
      const donde = lista.filter((x) => x.nombre.endsWith('.c') && lineaDeFuncion(x.contenido, f)).map((x) => codigo(x.nombre));
      const en = dondeEsta(lista.filter((x) => x.nombre.endsWith('.c')), `${f}(`);
      const cuales = donde.length > 1 ? ` Está en ${donde.slice(0, -1).join(', ')} y en ${donde.at(-1)}.` : '';
      const que = f === 'main' ? 'Hay más de un `main` en el proyecto: el programa empieza en uno solo.' : `La función ${codigo(f)} está escrita más de una vez en el proyecto.`;
      return { error: `${que}${cuales}`, linea: en.linea, archivo: en.archivo, avisos: [] };
    }
  }
  const roto = sueltos.find((x) => /Assertion .* failed/.test(x));
  if (roto) return { error: conOriginal('El compilador tropezó con algo que no sabe convertir. Fijate que los valores que asignás o comparás sean del tipo de la variable.', roto), linea: 0, archivo: null, avisos: [] };
  if (diagnosticos.some((d) => !d.aviso) || sueltos.length) {
    const texto = [...diagnosticos.filter((d) => !d.aviso).map((d) => d.mensaje), ...sueltos].join('\n');
    return { error: `No se pudo compilar.\n${texto}`.trim(), linea: 0, archivo: null, avisos: [] };
  }
  return {
    error: null,
    linea: 0,
    avisos: avisos.map((d) => `Aviso en ${varios ? `${d.archivo}, línea` : 'la línea'} ${d.linea}. ${traducir(d.mensaje)}\n`),
  };
}

// What stops a program, by the message of the browser (they all say the same of WebAssembly, each its way).
const FALLAS = [
  ['division', /divide by zero|division by zero|integer divide/i],
  ['resto', /remainder by zero|rem.* by zero/i],
  ['memoria', /out of bounds memory|memory access out of bounds|index out of bounds/i],
  ['pila', /call stack|stack overflow|too much recursion|recursion/i],
  ['conversion', /float unrepresentable|integer overflow|invalid conversion|out of range float/i],
  ['puntero', /null function|signature mismatch|table index|indirect call|function signature/i],
  ['imposible', /unreachable/i],
];

/** Which kind of failure an exception of a running program is, by its message. */
export function tipoDeFalla(mensaje) {
  return FALLAS.find(([, re]) => re.test(String(mensaje)))?.[0] ?? 'otra';
}

const QUE_PASO = {
  division: 'División por cero.',
  resto: 'Resto de una división por cero, un `%` con 0.',
  nulo: 'Segmentation fault. Usaste un puntero que vale `NULL`, que no apunta a nada.',
  memoria: 'Segmentation fault. Leíste o escribiste fuera de la memoria del programa, con un puntero o un índice que se pasa.',
  pila: 'Se llenó la pila (stack overflow). Seguro es una recursión que no termina.',
  conversion: 'Un número con coma no entra en el entero al que lo convertiste.',
  puntero: 'Se llamó a un puntero a función que no apunta a una función.',
  imposible: 'El programa llegó a un lugar al que no debía llegar.',
  abort: 'El programa se cortó con `abort()`.',
  otra: 'El programa se cortó por un error.',
};

/**
 * What a program that broke says: { error, linea, archivo }. `tipo` from tipoDeFalla (or 'nulo', 'pila', 'abort'),
 * `funciones` the names of where it was, innermost first, and `fuentes` the files of the project (or `codigoFuente`,
 * the code alone). The line is the one of the function of the student where it happened.
 */
export function explicarFalla({ tipo, funciones = [], codigoFuente = '', fuentes = null, original = '' }) {
  const lista = fuentes ?? comoFuentes(codigoFuente);
  const varios = lista.length > 1;
  const propias = [];
  for (const f of funciones) {
    const nombre = f === '__main_argc_argv' || f === '__main_void' ? 'main' : f;
    let linea = 0;
    let archivo = null;
    for (const x of lista) {
      linea = lineaDeFuncion(x.contenido, nombre);
      archivo = x.nombre;
      if (linea) break;
    }
    if (linea && !propias.some((p) => p.nombre === nombre && p.linea === linea && p.archivo === archivo)) propias.push({ nombre, linea, archivo });
    if (propias.length >= 4) break;
  }
  const adentro = funciones[0] && !/^__main|^_start/.test(funciones[0]) && !propias.some((p) => p.nombre === funciones[0]) ? funciones[0] : null;
  const donde = [
    adentro && `  adentro de ${adentro}, de la biblioteca de C`,
    ...propias.map((p, i) => `  ${i || adentro ? 'llamada desde' : 'en'} ${p.nombre}, ${varios ? `${p.archivo}, ` : ''}línea ${p.linea}`),
  ].filter(Boolean).join('\n');
  const primera = propias[0];
  const en = primera ? ` Pasó en ${codigo(primera.nombre)}${adentro ? `, al llamar a ${codigo(adentro)}` : ''}.` : '';
  const dicho = `${QUE_PASO[tipo] ?? QUE_PASO.otra}${en}`;
  const texto = original ? conOriginal(dicho, original) : dicho;
  return { error: donde ? `${donde}\n${texto}` : texto, linea: primera?.linea ?? 0, archivo: primera?.archivo ?? null };
}

/** An assert() that failed, as the C library writes it, back to { error, linea, archivo }; null if `texto` isn't one. */
export function explicarAssert(texto, nombre) {
  const m = /(?:^|\n)(?:\/home\/alumno\/)?([^\n:]+):(\d+): (\w+): Assertion `(.*)` failed\s*$/.exec(String(texto));
  if (!m) return null;
  const linea = Number(m[2]);
  return { error: `  ${m[1] === nombre ? nombre : m[1]}, línea ${linea}, en ${m[3]}\nNo se cumplió \`assert(${m[4]})\`.`, linea, archivo: m[1] };
}
