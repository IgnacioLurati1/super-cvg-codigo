// The autocomplete of the lab, with code as a student writes it: what the list shows in each place (in a real editor,
// with CodeMirror's filter and order, the last letter typed), what accepting one leaves, and where it doesn't open.
import { acceptCompletion, completionStatus, currentCompletions, setSelectedCompletion, startCompletion } from '@codemirror/autocomplete';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql, SQLite } from '@codemirror/lang-sql';
import { indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { EditorView, keymap, runScopeHandlers } from '@codemirror/view';
import initSqlJs from 'sql.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { modoC } from '../../../components/laboratorio/modoC';
import { CABECERA_DE } from '../cMensajes';
import { armarBase, esquemaDe } from '../sqlBase';
import { sumarInclude } from './c';
import { FUNCIONES_C } from './datosC';
import { DE_LISTA, DE_TEXTO, MIEMBROS_JS } from './datosJs';
import { FUNCIONES_SQL } from './datosSql';
import { autocompletar, FUENTES } from './index';

const MODOS = { c: () => modoC, javascript: () => javascript(), python: () => python(), sql: () => sql({ dialect: SQLite, upperCaseKeywords: true }) };
const CURSOR = '‸';
// jsdom doesn't measure: CodeMirror asks a range for its boxes when it scrolls to what was accepted.
Range.prototype.getClientRects ??= () => [];
Range.prototype.getBoundingClientRect ??= () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 });
const abiertas = [];
afterEach(() => abiertas.splice(0).forEach((v) => v.destroy()));

/**
 * An editor with `texto` and the cursor at ‸, as the lab's (four spaces of indentation). Without `explicito`, the letter
 * before the cursor is typed, as a student does; with it, Ctrl+Space. Resolves when the list has answered.
 */
async function escribir(lenguaje, texto, contexto = {}, explicito = false) {
  const pos = texto.indexOf(CURSOR);
  const doc = texto.replace(CURSOR, '');
  const antes = explicito ? doc : doc.slice(0, pos - 1) + doc.slice(pos);
  const vista = new EditorView({
    parent: document.body,
    state: EditorState.create({ doc: antes, selection: { anchor: explicito ? pos : pos - 1 }, extensions: [MODOS[lenguaje](), indentUnit.of('    '), autocompletar(lenguaje, () => contexto)] }),
  });
  abiertas.push(vista);
  if (explicito) startCompletion(vista);
  else vista.dispatch({ changes: { from: pos - 1, insert: doc[pos - 1] }, selection: { anchor: pos }, userEvent: 'input.type' });
  const desde = Date.now();
  await new Promise((r) => setTimeout(r, 130));
  while (completionStatus(vista.state) === 'pending' && Date.now() - desde < 3000) await new Promise((r) => setTimeout(r, 10));
  return vista;
}

const lista = (vista) => currentCompletions(vista.state);
const nombres = async (...a) => lista(await escribir(...a)).map((o) => o.label);
const opcion = async (label, ...a) => lista(await escribir(...a)).find((o) => o.label === label);
const cerrada = async (...a) => completionStatus((await escribir(...a)).state) === null;

/** Accepts `label` from the list with Enter's command and gives back the text. */
async function aceptar(label, ...a) {
  const vista = await escribir(...a);
  const i = lista(vista).findIndex((o) => o.label === label);
  expect(i, `${label} en la lista`).toBeGreaterThanOrEqual(0);
  vista.dispatch({ effects: setSelectedCompletion(i) });
  // CodeMirror ignores an accept right when the list opens (interactionDelay).
  await new Promise((r) => setTimeout(r, 100));
  expect(acceptCompletion(vista)).toBe(true);
  return vista.state.doc.toString();
}

describe('C', () => {
  const alumnosH = `#ifndef ALUMNOS_H
#define ALUMNOS_H
#define MAX_ALUMNOS 50

typedef struct {
    char nombre[40];
    int legajo;
    float nota;
} Alumno;

int cargar_alumnos(Alumno v[], const char *ruta);
float promedio(const Alumno v[], int n);
void mostrar(const Alumno *a);
#endif
`;
  const proyecto = { archivos: [{ nombre: 'alumnos.h', contenido: alumnosH }, { nombre: 'alumnos.c', contenido: '#include "alumnos.h"\nint oculto(void) { return 0; }\n' }] };
  const main = (linea) => `#include <stdio.h>
#include "alumnos.h"

int main(void) {
    Alumno curso[MAX_ALUMNOS];
    int cantidad = cargar_alumnos(curso, "notas.txt");
    float prom = promedio(curso, cantidad);
    ${linea}
    return 0;
}
`;

  it('printf, con su prototipo, primero al escribir pri', async () => {
    const vista = await escribir('c', main(`pri${CURSOR}`), proyecto);
    expect(lista(vista)[0]).toMatchObject({ label: 'printf', detail: 'int printf(const char *formato, ...)' });
    expect(lista(vista)[0].info).toBeUndefined();
  });

  it('lo del .h incluido: el #define, el typedef y sus funciones; lo de otro .c no incluido, no', async () => {
    expect((await opcion('MAX_ALUMNOS', 'c', main(`MAX${CURSOR}`), proyecto)).detail).toBe('50 · alumnos.h');
    expect(await opcion('Alumno', 'c', main(`Alu${CURSOR}`), proyecto)).toMatchObject({ type: 'type', detail: 'typedef · alumnos.h' });
    expect((await opcion('promedio', 'c', main(`prome${CURSOR}`), proyecto)).detail).toBe('float promedio(const Alumno v[], int n) · alumnos.h');
    expect(await nombres('c', main(`ocu${CURSOR}`), proyecto)).not.toContain('oculto');
  });

  it('las variables del archivo, también las declaradas con un tipo del .h', async () => {
    expect(await opcion('cantidad', 'c', main(`cant${CURSOR}`), proyecto)).toMatchObject({ type: 'variable', detail: 'int' });
    expect((await opcion('curso', 'c', main(`cur${CURSOR}`), proyecto)).detail).toBe('Alumno');
  });

  it('una función de un header que falta avisa y suma su #include al aceptarla', async () => {
    expect((await opcion('strlen', 'c', main(`int largo = strl${CURSOR}`), proyecto)).info).toBe('Suma #include <string.h>');
    const texto = await aceptar('strlen', 'c', main(`int largo = strl${CURSOR}`), proyecto);
    expect(texto).toMatch(/^#include <stdio\.h>\n#include "alumnos\.h"\n#include <string\.h>\n/);
    expect(texto).toContain('    int largo = strlen(texto)\n');
  });

  it('printf sin stdio.h: su plantilla y el #include arriba de todo', async () => {
    expect(await aceptar('printf', 'c', `int main(void) {\n    pri${CURSOR}\n}\n`)).toBe('#include <stdio.h>\nint main(void) {\n    printf("texto\\n");\n}\n');
  });

  it('un header con su guarda recibe el #include debajo de ella', () => {
    const { from, insert } = sumarInclude('#ifndef PILA_H\n#define PILA_H\nint tope(void);\n#endif\n', 'stdlib.h');
    expect(from).toBe('#ifndef PILA_H\n#define PILA_H'.length);
    expect(insert).toBe('\n#include <stdlib.h>');
  });

  it('las plantillas: for, while, if, main, struct y scanf; for también con la palabra entera', async () => {
    expect(await opcion('for', 'c', `for${CURSOR}`)).toMatchObject({ detail: 'plantilla' });
    expect(await aceptar('for', 'c', `int main(void) {\n    fo${CURSOR}\n}`)).toBe('int main(void) {\n    for (int i = 0; i < n; i++) {\n        \n    }\n}');
    for (const p of ['while', 'if', 'main', 'struct']) expect((await opcion(p, 'c', `${p.slice(0, 2)}${CURSOR}`))?.detail, p).toBe('plantilla');
    expect(await aceptar('scanf', 'c', `sc${CURSOR}`)).toBe('#include <stdio.h>\nscanf("%d", &variable);');
  });

  it('#include: los headers del sistema y los del proyecto', async () => {
    expect(await nombres('c', `#include <st${CURSOR}`)).toEqual(expect.arrayContaining(['stdio.h', 'stdlib.h', 'string.h']));
    expect(await aceptar('alumnos.h', 'c', `#include "al${CURSOR}`, proyecto)).toBe('#include "alumnos.h"');
    expect(await nombres('c', `#inc${CURSOR}`)).toEqual(['include']);
  });

  it('nada en comentarios, textos, campos de un struct, con una letra o sobre una palabra entera', async () => {
    expect(await cerrada('c', main(`// pri${CURSOR}`), proyecto)).toBe(true);
    expect(await cerrada('c', main(`/* va a pri${CURSOR}`), proyecto)).toBe(true);
    expect(await cerrada('c', main(`printf("pri${CURSOR}`), proyecto)).toBe(true);
    expect(await cerrada('c', main(`curso[0].no${CURSOR}`), proyecto)).toBe(true);
    expect(await cerrada('c', main(`p${CURSOR}`), proyecto)).toBe(true);
    // Enter after `return total` goes to the next line, though `totales` is there.
    expect(await cerrada('c', `int total = 0;\nint totales[3];\nint f(void) { return total${CURSOR}`)).toBe(true);
    expect((await nombres('c', main(`retur${CURSOR}`), proyecto))[0]).toBe('return');
    expect(await cerrada('c', main(`return${CURSOR}`), proyecto)).toBe(true);
  });

  it('con Ctrl+Espacio, aunque no haya letras', async () => {
    expect(await nombres('c', main(CURSOR), proyecto, true)).toEqual(expect.arrayContaining(['cantidad', 'MAX_ALUMNOS', 'printf', 'int']));
  });

  it('cada función de la lista está en uno de los seis headers, según cMensajes.js', () => {
    const seis = new Set(['stdio.h', 'stdlib.h', 'string.h', 'ctype.h', 'math.h', 'time.h']);
    expect(FUNCIONES_C.map((f) => /(\w+)\s*\(/.exec(f)[1]).filter((n) => !seis.has(CABECERA_DE.get(n)))).toEqual([]);
  });
});

describe('Python', () => {
  const modelo = `class Alumno:
    def __init__(self, nombre, nota):
        self.nombre = nombre
        self.nota = nota

    def aprobo(self):
        return self.nota >= 6


def promedio(alumnos):
    return sum(a.nota for a in alumnos) / len(alumnos)


NOTA_MINIMA = 6
`;
  const proyecto = { archivos: [{ nombre: 'modelo.py', contenido: modelo }, { nombre: 'notas.csv', contenido: 'nombre,nota\n' }] };
  const main = (linea) => `import csv
from modelo import Alumno, promedio
import modelo

alumnos = []
with open('notas.csv', encoding='utf-8') as archivo:
    for fila in csv.DictReader(archivo):
        alumnos.append(Alumno(fila['nombre'], float(fila['nota'])))
${linea}
`;

  it('lo importado de otro archivo del proyecto, con lo que pide', async () => {
    expect((await opcion('Alumno', 'python', main(`Alu${CURSOR}`), proyecto)).type).toBe('class');
    expect(await opcion('promedio', 'python', main(`prom${CURSOR}`), proyecto)).toMatchObject({ type: 'function', detail: '(alumnos)' });
    expect((await nombres('python', main(`modelo.NO${CURSOR}`), proyecto))[0]).toBe('NOTA_MINIMA');
    expect(await nombres('python', main(`from modelo import Al${CURSOR}`), proyecto)).toEqual(['Alumno']);
    // `aprobo` is a method: it isn't at the top of modelo.
    expect(await cerrada('python', main(`modelo.ap${CURSOR}`), proyecto)).toBe(true);
  });

  it('el módulo de la biblioteca importado, con su firma', async () => {
    const vista = await escribir('python', main(`lector = csv.Dict${CURSOR}`), proyecto);
    expect(lista(vista).map((o) => o.label)).toEqual(['DictReader', 'DictWriter']);
    expect(lista(vista)[0].detail).toBe('(archivo, fieldnames=None)');
    expect(await cerrada('python', main(`math.sq${CURSOR}`), proyecto)).toBe(true);
    expect(await nombres('python', `import math\nx = math.sq${CURSOR}`)).toEqual(['sqrt', 'isqrt']);
    expect(await nombres('python', `from statistics import *\nmed${CURSOR}`)).toEqual(expect.arrayContaining(['median', 'median_low']));
  });

  it('pandas y pyplot con su alias, solo si están importados', async () => {
    expect(await nombres('python', `import pandas as pd\ndf = pd.read${CURSOR}`)).toEqual(expect.arrayContaining(['read_csv', 'read_excel']));
    expect((await opcion('xlabel', 'python', `import matplotlib.pyplot as plt\nplt.xla${CURSOR}`)).detail).toBe('(texto)');
    expect(await nombres('python', `rea${CURSOR}`)).not.toContain('read_csv');
  });

  it('las variables del archivo, las del for y las funciones incorporadas', async () => {
    expect((await opcion('alumnos', 'python', main(`alu${CURSOR}`), proyecto)).type).toBe('variable');
    expect(await nombres('python', main(`fil${CURSOR}`), proyecto)).toContain('fila');
    const vista = await escribir('python', main(`pri${CURSOR}`), proyecto);
    expect(lista(vista)[0]).toMatchObject({ label: 'print', detail: "(*valores, sep=' ', end='\\n')" });
  });

  it('los módulos al importar: los de la biblioteca y los del proyecto', async () => {
    expect(await nombres('python', `import ma${CURSOR}`)).toEqual(expect.arrayContaining(['math', 'matplotlib.pyplot']));
    expect(await nombres('python', `import mo${CURSOR}`, proyecto)).toEqual(['modelo']);
  });

  it('las plantillas: for, while, if, def y class', async () => {
    expect(await aceptar('for', 'python', `fo${CURSOR}`)).toBe('for elemento in lista:\n    ');
    expect(await aceptar('class', 'python', `cla${CURSOR}`)).toBe('class Nombre:\n    def __init__(self):\n        ');
    for (const p of ['while', 'if', 'def']) expect((await opcion(p, 'python', `${p.slice(0, 2)}${CURSOR}`))?.detail, p).toBe('plantilla');
  });

  it('nada en comentarios ni textos; dentro de las llaves de un f-string, sí', async () => {
    expect(await cerrada('python', main(`# pri${CURSOR}`), proyecto)).toBe(true);
    expect(await cerrada('python', main(`print("pri${CURSOR}`), proyecto)).toBe(true);
    expect(await nombres('python', main(`print(f"hay {alu${CURSOR}}")`), proyecto)).toContain('alumnos');
    expect(await cerrada('python', main(`return${CURSOR}`), proyecto)).toBe(true);
  });
});

describe('SQL', () => {
  let esquema;
  beforeAll(async () => {
    const SQL = await initSqlJs();
    esquema = esquemaDe(armarBase(SQL, null).db);
  });

  it('las tablas y columnas de la base de práctica', async () => {
    expect(await opcion('persona', 'sql', `SELECT * FROM per${CURSOR}`, { esquema })).toMatchObject({ type: 'class', detail: 'tabla' });
    expect((await opcion('id_agente', 'sql', `SELECT id_ag${CURSOR}`, { esquema })).detail).toMatch(/^agente_asignado, /);
  });

  it('las columnas de la tabla por su alias, como en los apuntes', async () => {
    const consulta = `select age.ap${CURSOR}, age.nombre\nfrom persona age\nwhere age.id in (select aa.id_agente from agente_asignado aa)`;
    expect(await nombres('sql', consulta, { esquema })).toEqual(['apellido']);
    const columnas = esquema.find((t) => t.nombre === 'agente_asignado').columnas.map((c) => c.nombre);
    expect((await nombres('sql', `select aa.${CURSOR} from agente_asignado aa`, { esquema }, true)).sort()).toEqual(columnas.sort());
    expect(await cerrada('sql', `select x.no${CURSOR} from persona`, { esquema })).toBe(true);
  });

  it('las funciones de SQLite con lo que piden, en minúscula si así se escribe', async () => {
    expect((await opcion('count', 'sql', `select cou${CURSOR}`, { esquema })).detail).toBe('(x)');
    expect((await opcion('COUNT', 'sql', `SELECT COU${CURSOR}`, { esquema })).detail).toBe('(x)');
    expect(await nombres('sql', `SELECT nombre FROM persona ORD${CURSOR}`, { esquema })).toContain('ORDER BY');
  });

  it('las plantillas select, insert y join, después de su palabra', async () => {
    expect((await nombres('sql', `sel${CURSOR}`, { esquema })).slice(0, 2)).toEqual(['select', 'select … from … where']);
    expect(await aceptar('select … from … where', 'sql', `sel${CURSOR}`, { esquema })).toBe('select columnas\nfrom tabla\nwhere condición;');
    expect(await aceptar('INSERT INTO … VALUES', 'sql', `INS${CURSOR}`, { esquema })).toBe('INSERT INTO tabla (columnas)\nVALUES (valores);');
    expect(await nombres('sql', `select * from persona p jo${CURSOR}`, { esquema })).toContain('join … on');
    expect(await cerrada('sql', `select${CURSOR}`, { esquema })).toBe(true);
  });

  it('nada en comentarios ni textos', async () => {
    expect(await cerrada('sql', `-- per${CURSOR}`, { esquema })).toBe(true);
    expect(await cerrada('sql', `SELECT * FROM persona WHERE nombre = 'per${CURSOR}`, { esquema })).toBe(true);
  });

  it('cada función de la lista existe en el SQLite del laboratorio', async () => {
    const SQL = await initSqlJs();
    const hay = new Set(new SQL.Database().exec('SELECT name FROM pragma_function_list')[0].values.map(([n]) => n));
    expect(FUNCIONES_SQL.map((f) => /^\w+/.exec(f)[0].toLowerCase()).filter((n) => !hay.has(n))).toEqual([]);
  });
});

describe('JavaScript', () => {
  const mate = 'export const PI2 = 6.28;\nexport function sumar(a, b) {\n  const interna = 1;\n  return a + b + interna;\n}\nfunction oculta() {}\nexport { oculta as otra };\n';
  const proyecto = { archivos: [{ nombre: 'mate.js', contenido: mate }, { nombre: 'datos.json', contenido: '[]' }] };

  it('console. y Math. con su firma; prompt entre lo que hay sin importar', async () => {
    expect(await opcion('log', 'javascript', `console.lo${CURSOR}`)).toMatchObject({ type: 'function', detail: '(...valores)' });
    expect(await opcion('floor', 'javascript', `Math.fl${CURSOR}`)).toMatchObject({ detail: '(x)' });
    expect(await opcion('prompt', 'javascript', `const n = pro${CURSOR}`)).toMatchObject({ detail: '(mensaje, porDefecto)' });
    expect(await nombres('javascript', `Object.ke${CURSOR}`)).toContain('keys');
  });

  it('después de un punto, los métodos de una lista y de un texto', async () => {
    const lista = await nombres('javascript', `const xs = [1, 2];\nxs.ma${CURSOR}`);
    expect(lista).toContain('map');
    expect(await nombres('javascript', `const t = 'hola';\nt.toUp${CURSOR}`)).toContain('toUpperCase');
  });

  it('lo que define el archivo: funciones con sus parámetros, variables y parámetros', async () => {
    const codigo = `function promedio(notas, cuantas) {\n  return 0;\n}\nconst doble = (x) => x * 2;\nlet total = 0;\npro${CURSOR}`;
    expect(await opcion('promedio', 'javascript', codigo)).toMatchObject({ type: 'function', detail: '(notas, cuantas)' });
    expect(await opcion('doble', 'javascript', codigo.replace(`pro${CURSOR}`, `dob${CURSOR}`))).toMatchObject({ type: 'function', detail: '(x)' });
    expect(await nombres('javascript', codigo.replace(`pro${CURSOR}`, `tot${CURSOR}`))).toContain('total');
  });

  it('lo que importa: los archivos del proyecto, lo que exporta cada uno y el nombre importado', async () => {
    expect(await nombres('javascript', `import { sumar } from './${CURSOR}`, proyecto, true)).toEqual(expect.arrayContaining(['./mate.js', './datos.json']));
    const dentro = await nombres('javascript', `import { su${CURSOR} } from './mate.js';`, proyecto);
    expect(dentro).toContain('sumar');
    expect(await nombres('javascript', `import { ${CURSOR} } from './mate';`, proyecto, true)).toEqual(expect.arrayContaining(['PI2', 'sumar', 'otra']));
    expect(await nombres('javascript', `import { ${CURSOR} } from './mate';`, proyecto, true)).not.toContain('interna');
    expect(await nombres('javascript', `import * as m from './mate.js';\nm.su${CURSOR}`, proyecto)).toEqual(['sumar']);
    expect(await nombres('javascript', `import { sumar } from './mate.js';\nsum${CURSOR}`, proyecto)).toContain('sumar');
  });

  it('plantillas: for, function, if, while y la flecha', async () => {
    expect(await aceptar('for', 'javascript', `for${CURSOR}`)).toBe('for (let i = 0; i < n; i++) {\n    \n}');
    expect(await aceptar('flecha', 'javascript', `flec${CURSOR}`)).toBe('const nombre = (parámetros) => {\n    \n};');
    for (const p of ['function', 'if', 'while']) expect(await nombres('javascript', `${p.slice(0, 3)}${CURSOR}`)).toContain(p);
  });

  it('nada en comentarios ni textos; en el ${} de una plantilla, sí', async () => {
    expect(await cerrada('javascript', `// cons${CURSOR}`)).toBe(true);
    expect(await cerrada('javascript', `const t = 'cons${CURSOR}`)).toBe(true);
    expect(await nombres('javascript', `const total = 1;\nconst t = \`\${tot${CURSOR}}\`;`)).toContain('total');
  });

  it('cada miembro de la lista existe en JavaScript', () => {
    const nombre = (f) => /^[\w$]+/.exec(f)[0];
    const objetos = { console, Math, Object, Array, String, Number, JSON, Promise, Date };
    for (const [o, lista] of Object.entries(MIEMBROS_JS)) expect(lista.map(nombre).filter((n) => !(n in objetos[o])), o).toEqual([]);
    expect(DE_LISTA.map(nombre).filter((n) => !(n in Array.prototype))).toEqual([]);
    expect(DE_TEXTO.map(nombre).filter((n) => !(n in String.prototype))).toEqual([]);
  });
});

describe('una función aceptada va con sus parámetros', () => {
  // The text with ‸ for the cursor, or [ ] around what is selected.
  const conCursor = (v) => {
    const { from, to } = v.state.selection.main;
    const t = v.state.doc.toString();
    return from === to ? t.slice(0, from) + CURSOR + t.slice(from) : `${t.slice(0, from)}[${t.slice(from, to)}]${t.slice(to)}`;
  };
  const tecla = (v, key, shiftKey = false) => runScopeHandlers(v, new KeyboardEvent('keydown', { key, shiftKey }), 'editor');

  /** As in the lab's editor: Tab indents when there is nothing else for it. Types the letter before ‸ and presses `key`. */
  async function conTecla(lenguaje, texto, key, label = null) {
    const pos = texto.indexOf(CURSOR);
    const doc = texto.replace(CURSOR, '');
    const vista = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: doc.slice(0, pos - 1) + doc.slice(pos), selection: { anchor: pos - 1 }, extensions: [MODOS[lenguaje](), indentUnit.of('    '), autocompletar(lenguaje, () => ({})), keymap.of([...defaultKeymap, indentWithTab])] }),
    });
    abiertas.push(vista);
    vista.dispatch({ changes: { from: pos - 1, insert: doc[pos - 1] }, selection: { anchor: pos }, userEvent: 'input.type' });
    await new Promise((r) => setTimeout(r, 150));
    expect(completionStatus(vista.state)).toBe('active');
    if (label) vista.dispatch({ effects: setSelectedCompletion(lista(vista).findIndex((o) => o.label === label)) });
    // CodeMirror ignores an accept right when the list opens (interactionDelay).
    await new Promise((r) => setTimeout(r, 100));
    expect(tecla(vista, key)).toBe(true);
    return vista;
  }

  it('C: malloc con Tab deja malloc(tamanio) con tamanio elegido; Tab sale después del paréntesis y después sangra', async () => {
    const v = await conTecla('c', `#include <stdlib.h>\nint *v = mall${CURSOR}`, 'Tab');
    expect(conCursor(v)).toBe('#include <stdlib.h>\nint *v = malloc([tamanio])');
    v.dispatch(v.state.replaceSelection('10 * sizeof(int)'));
    expect(tecla(v, 'Tab')).toBe(true);
    expect(conCursor(v)).toBe(`#include <stdlib.h>\nint *v = malloc(10 * sizeof(int))${CURSOR}`);
    // No snippet left: Tab indents the line, as always.
    expect(tecla(v, 'Tab')).toBe(true);
    expect(v.state.doc.toString()).toBe('#include <stdlib.h>\n    int *v = malloc(10 * sizeof(int))');
  });

  it('C: Enter también; con dos parámetros Tab pasa al siguiente, y sin header suma el #include', async () => {
    const v = await conTecla('c', `po${CURSOR}`, 'Enter', 'pow');
    expect(conCursor(v)).toBe('#include <math.h>\npow([base], exponente)');
    tecla(v, 'Tab');
    expect(conCursor(v)).toBe('#include <math.h>\npow(base, [exponente])');
    tecla(v, 'Tab');
    expect(conCursor(v)).toBe(`#include <math.h>\npow(base, exponente)${CURSOR}`);
  });

  it('C: sin parámetros, f() con el cursor después; con un ( adelante, solo el nombre; una variable o una palabra, como están', async () => {
    expect(conCursor(await conTecla('c', `#include <stdio.h>\ngetch${CURSOR}`, 'Tab'))).toBe(`#include <stdio.h>\ngetchar()${CURSOR}`);
    expect(await aceptar('strlen', 'c', `#include <string.h>\nint n = strl${CURSOR}(s);`)).toBe('#include <string.h>\nint n = strlen(s);');
    expect(await aceptar('printf', 'c', `#include <stdio.h>\npri${CURSOR}("hola");`)).toBe('#include <stdio.h>\nprintf("hola");');
    // The file's own functions and macros, and qsort's pointer to a function by its name.
    expect(await aceptar('suma', 'c', `int suma(int a, int b[]) { return a; }\nint x = sum${CURSOR}`)).toBe('int suma(int a, int b[]) { return a; }\nint x = suma(a, b)');
    expect(await aceptar('MAXIMO', 'c', `#define MAXIMO(a, b) ((a) > (b) ? (a) : (b))\nint x = MAX${CURSOR}`)).toBe('#define MAXIMO(a, b) ((a) > (b) ? (a) : (b))\nint x = MAXIMO(a, b)');
    expect(await aceptar('qsort', 'c', `#include <stdlib.h>\nqso${CURSOR}`)).toBe('#include <stdlib.h>\nqsort(base, cantidad, tamanio, comparar)');
    // A variable or a word, as it is.
    expect(await aceptar('total', 'c', `int total = 0;\nint x = tot${CURSOR}`)).toBe('int total = 0;\nint x = total');
    expect(await aceptar('return', 'c', `int f(void) {\n    retu${CURSOR}\n}`)).toBe('int f(void) {\n    return\n}');
  });

  it('Python: las funciones y las de un módulo, sin self, *resto ni lo que tiene un valor por defecto; con solo esos, el cursor entre los paréntesis', async () => {
    const v = await conTecla('python', `n = le${CURSOR}`, 'Tab');
    expect(conCursor(v)).toBe('n = len([x])');
    expect(await aceptar('area', 'python', `def area(base, altura=1):\n    return base * altura\n\nx = are${CURSOR}`)).toBe('def area(base, altura=1):\n    return base * altura\n\nx = area(base)');
    expect(await aceptar('sqrt', 'python', `import math\nx = math.sq${CURSOR}`)).toBe('import math\nx = math.sqrt(x)');
    expect(conCursor(await conTecla('python', `prin${CURSOR}`, 'Tab'))).toBe(`print(${CURSOR})`);
    expect(await aceptar('mover', 'python', `def mover(self, dx, *resto, **mas):\n    pass\n\nmov${CURSOR}`)).toBe('def mover(self, dx, *resto, **mas):\n    pass\n\nmover(dx)');
    expect(await aceptar('total', 'python', `total = 0\nx = tot${CURSOR}`)).toBe('total = 0\nx = total');
  });

  it('JavaScript y SQL también', async () => {
    expect(await aceptar('pow', 'javascript', `Math.po${CURSOR}`)).toBe('Math.pow(base, exponente)');
    expect(conCursor(await conTecla('javascript', `console.lo${CURSOR}`, 'Tab'))).toBe(`console.log(${CURSOR})`);
    expect(await aceptar('doble', 'javascript', `function doble(n) { return 2 * n; }\ndob${CURSOR}`)).toBe('function doble(n) { return 2 * n; }\ndoble(n)');
    expect(conCursor(await conTecla('sql', `select cou${CURSOR}`, 'Tab'))).toBe('select count([x])');
    expect(await aceptar('ROUND', 'sql', `SELECT ROU${CURSOR}`)).toBe('SELECT ROUND(x, decimales)');
  });
});

describe('el enchufe de cada lenguaje', () => {
  it('Python, C, SQL y JavaScript tienen su fuente; un lenguaje sin ella queda sin autocompletar', () => {
    expect(Object.keys(FUENTES)).toEqual(expect.arrayContaining(['c', 'python', 'sql', 'javascript']));
    expect(autocompletar('texto', () => ({}))).toEqual([]);
  });
});
