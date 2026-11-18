import { pickedCompletion } from '@codemirror/autocomplete';
import { Transaction } from '@codemirror/state';
import { CABECERA_DE } from '../cMensajes';
import { aplicarLlamada, claves, dentroDe, lineaAntes, moldeDeLlamada, palabraAlFinal, parametrosDe, plantilla, recordado, resultado } from './comun';
import { CABECERAS_C, CLAVES_C, DIRECTIVAS_C, FUNCIONES_C, TIPOS_C, VALORES_C } from './datosC';

// C: its words, the functions of the course's headers with their prototype, and what the file and the headers of the
// project it includes define (#define, structs, typedefs, functions and variables), read with simple patterns, without
// compiling anything. A function of a header not included brings its #include.

const NO_ACA = new Set(['comment', 'string']);
// The headers whose #include is added: the six of the course.
const SUMABLES = new Set(['stdio.h', 'stdlib.h', 'string.h', 'ctype.h', 'math.h', 'time.h']);
const CONTROL = new Set([...CLAVES_C, 'else']);
// What can't go before the name of a function being declared.
const NO_TIPO = new Set('return else if while for switch case do goto sizeof break continue default typedef'.split(' '));

const PRINTF = 'printf("${texto}\\n");';
const SCANF = 'scanf("${%d}", &${variable});';
const PLANTILLAS = [
  plantilla('for', 'for (int ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}'),
  plantilla('while', 'while (${condición}) {\n\t${}\n}'),
  plantilla('if', 'if (${condición}) {\n\t${}\n}'),
  plantilla('main', 'int main(void) {\n\t${}\n\treturn 0;\n}'),
  plantilla('struct', 'struct ${Nombre} {\n\t${int campo;}\n};'),
];
// printf and scanf, as functions of the library that bring their template.
const MOLDES = { printf: PRINTF, scanf: SCANF };

const FUNCIONES = FUNCIONES_C.map((firma) => ({ label: /(\w+)\s*\(/.exec(firma)[1], type: 'function', detail: firma }));
const VALORES = VALORES_C.map((label) => ({ label, type: 'constant', boost: -1 }));
const PALABRAS = [...claves(TIPOS_C, 'type'), ...claves(CLAVES_C)];

/** The code without comments: each one becomes spaces, so the places stay. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
/** And without texts nor characters, for the patterns of the declarations. */
const sinTextos = (t) => t.replace(/"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/g, (m) => ' '.repeat(m.length));

/** The headers a code includes: { propias: ['alumnos.h'], delSistema: ['stdio.h'] }. */
export function incluidos(codigo) {
  const propias = [];
  const delSistema = [];
  for (const m of sinComentarios(codigo).matchAll(/^[ \t]*#[ \t]*include[ \t]*(?:"([^"\n]+)"|<([^>\n]+)>)/gm)) {
    if (m[1]) propias.push(m[1].trim());
    else delSistema.push(m[2].trim());
  }
  return { propias, delSistema };
}

// From the end of a declaration's first name, the others of the same line: `int a, b[3], *c;`.
function demasNombres(texto, desde) {
  const nombres = [];
  let nivel = 0;
  let pedazo = '';
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (nivel === 0 && (c === ';' || c === ')' || c === '{' || c === '}')) break;
    if ('([{'.includes(c)) nivel += 1;
    else if (')]}'.includes(c)) nivel -= 1;
    if (nivel === 0 && c === ',') {
      if (pedazo) nombres.push(pedazo);
      pedazo = '';
      const n = /^\s*\**\s*([A-Za-z_]\w*)/.exec(texto.slice(i + 1))?.[1];
      if (n) pedazo = n;
    }
  }
  if (pedazo) nombres.push(pedazo);
  return nombres;
}

/**
 * What a C code defines: #define, struct, union and enum (with its values), typedef, functions and variables.
 * `otrosTipos`: the typedefs of the headers it includes, so `Alumno a;` is a declaration too.
 */
export function nombresC(codigo, otrosTipos = []) {
  const lista = [];
  const limpio = sinTextos(sinComentarios(codigo));
  for (const m of limpio.matchAll(/^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)(\([^)\n]*\))?[ \t]*([^\n]*)$/gm)) {
    lista.push({ label: m[1], type: m[2] ? 'function' : 'constant', detail: m[2] ?? (m[3].trim().slice(0, 40) || undefined) });
  }
  const texto = limpio.replace(/^[ \t]*#[^\n]*$/gm, (m) => ' '.repeat(m.length));
  const tipos = new Set([...TIPOS_C, ...otrosTipos]);
  for (const m of texto.matchAll(/\b(struct|union|enum)\s+([A-Za-z_]\w*)\s*\{/g)) lista.push({ label: m[2], type: 'class', detail: m[1] });
  for (const m of texto.matchAll(/\benum\b[^{;]*\{([^}]*)\}/g)) {
    for (const v of m[1].split(',')) {
      const n = /^\s*([A-Za-z_]\w*)/.exec(v)?.[1];
      if (n) lista.push({ label: n, type: 'constant', detail: 'enum' });
    }
  }
  for (const m of texto.matchAll(/\btypedef\b/g)) {
    let nivel = 0;
    let fin = m.index;
    while (fin < texto.length && !(nivel === 0 && texto[fin] === ';')) {
      if (texto[fin] === '{') nivel += 1;
      else if (texto[fin] === '}') nivel -= 1;
      fin += 1;
    }
    const frase = texto.slice(m.index, fin);
    const n = /\(\s*\*\s*([A-Za-z_]\w*)\s*\)/.exec(frase)?.[1] ?? /([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*$/.exec(frase)?.[1];
    if (n) {
      tipos.add(n);
      lista.push({ label: n, type: 'type', detail: 'typedef' });
    }
  }
  for (const m of texto.matchAll(/(?:^|[;{}])\s*([A-Za-z_][\w\s*]*?)\b([A-Za-z_]\w*)\s*\(([^;{}()]*(?:\([^;{}()]*\)[^;{}()]*)*)\)\s*(?=[{;])/gm)) {
    const tipo = m[1].trim();
    if (!tipo || CONTROL.has(m[2]) || tipo.split(/[\s*]+/).some((p) => NO_TIPO.has(p))) continue;
    lista.push({ label: m[2], type: 'function', detail: `${tipo.replace(/\s+/g, ' ')} ${m[2]}(${m[3].trim().replace(/\s+/g, ' ')})` });
  }
  const nombreDeTipo = [...tipos].sort((a, b) => b.length - a.length).map((t) => t.replace(/\W/g, '')).join('|');
  const declaracion = new RegExp(`\\b((?:struct|union|enum)\\s+[A-Za-z_]\\w*|${nombreDeTipo})\\b(?=((?:\\s|\\*)+)([A-Za-z_]\\w*))`, 'g');
  for (const m of texto.matchAll(declaracion)) {
    if (CONTROL.has(m[3]) || tipos.has(m[3])) continue;
    // Only the type is taken (the name, looked ahead): in `unsigned int n`, `int n` is found too.
    const fin = m.index + m[1].length + m[2].length + m[3].length;
    if (/^\s*\(/.test(texto.slice(fin))) continue;
    const tipo = `${m[1].replace(/\s+/g, ' ')}${m[2].includes('*') ? ' *' : ''}`;
    lista.push({ label: m[3], type: 'variable', detail: tipo });
    for (const n of demasNombres(texto, fin)) if (!CONTROL.has(n) && !tipos.has(n)) lista.push({ label: n, type: 'variable', detail: m[1].replace(/\s+/g, ' ') });
  }
  return lista;
}

const leerArchivo = recordado((codigo) => ({ nombres: nombresC(codigo), incluye: incluidos(codigo) }));
const tiposDe = (nombres) => nombres.filter((o) => o.type === 'type').map((o) => o.label);

/**
 * What the code reaches through its own #include "…": the names of each header of the project (and of the ones they
 * include), and the headers of the system that come with them.
 */
export function alcance(codigo, archivos = []) {
  const porNombre = new Map(archivos.map((a) => [a.nombre.split('/').at(-1), a]));
  const propio = incluidos(codigo);
  const delSistema = new Set(propio.delSistema);
  const nombres = [];
  const vistos = new Set();
  const pendientes = [...propio.propias];
  while (pendientes.length) {
    const nombre = pendientes.shift().split('/').at(-1);
    if (vistos.has(nombre) || !porNombre.has(nombre)) continue;
    vistos.add(nombre);
    const leido = leerArchivo(porNombre.get(nombre).contenido ?? '');
    nombres.push(...leido.nombres.map((o) => ({ ...o, detail: o.detail ? `${o.detail} · ${nombre}` : nombre })));
    leido.incluye.delSistema.forEach((h) => delSistema.add(h));
    pendientes.push(...leido.incluye.propias);
  }
  return { nombres, delSistema };
}

/** Where `#include <cabecera>` goes: after the last #include, after the guard of a header, or at the top. */
export function sumarInclude(codigo, cabecera) {
  const linea = `#include <${cabecera}>`;
  const limpio = sinComentarios(codigo);
  let ultimo = null;
  for (const m of limpio.matchAll(/^[ \t]*#[ \t]*include\b[^\n]*/gm)) ultimo = m;
  if (ultimo) return { from: ultimo.index + ultimo[0].length, insert: `\n${linea}` };
  const guarda = /^\s*#[ \t]*ifndef[ \t]+(\w+)[^\n]*\n[ \t]*#[ \t]*define[ \t]+\1\b[^\n]*/.exec(limpio);
  if (guarda) return { from: guarda[0].length, insert: `\n${linea}` };
  return { from: 0, insert: `${linea}\n` };
}

// Accepting a function of a header not included: the name (or its template) and, above, its #include.
const conInclude = (cabecera, molde) => (view, completion, from, to) => {
  if (molde) {
    aplicarLlamada(molde)(view, completion, from, to);
    view.dispatch({ changes: sumarInclude(view.state.doc.toString(), cabecera), userEvent: 'input.complete' });
    return;
  }
  const cambios = view.state.changes([sumarInclude(view.state.doc.toString(), cabecera), { from, to, insert: completion.label }]);
  view.dispatch({ changes: cambios, selection: { anchor: cambios.mapPos(to, 1) }, scrollIntoView: true, annotations: [pickedCompletion.of(completion), Transaction.userEvent.of('input.complete')] });
};

/** A parameter's name in a prototype: the last name (`int *v`, `char s[]`), the pointer's of a function; none for `void` and `...`. */
export function parametroC(p) {
  if (p === 'void' || p === '...') return '';
  return /\(\s*\*\s*([A-Za-z_]\w*)\s*\)/.exec(p)?.[1] ?? /([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*$/.exec(p)?.[1] ?? '';
}

/** The library: each function with its prototype, accepted as a call; the ones of a header not included, with what they add. */
function biblioteca(delSistema) {
  return [...FUNCIONES, ...VALORES].map((o) => {
    const cabecera = CABECERA_DE.get(o.label);
    const molde = MOLDES[o.label] ?? (o.type === 'function' ? moldeDeLlamada(o.label, parametrosDe(o.detail), parametroC) : undefined);
    if (cabecera && SUMABLES.has(cabecera) && !delSistema.has(cabecera)) {
      return { ...o, info: `Suma #include <${cabecera}>`, apply: conInclude(cabecera, molde) };
    }
    return molde ? { ...o, apply: aplicarLlamada(molde) } : o;
  });
}

/** The source of C. `contexto()`: { archivos } of the project (the others, by name and content). */
export function fuenteC(contexto) {
  return (cx) => {
    const { state, pos } = cx;
    const antes = lineaAntes(state, pos);
    const archivos = contexto?.()?.archivos ?? [];

    // `#include <st…` and `#include "alu…`: the headers of the system or the ones of the project.
    const include = /^\s*#\s*include\s*([<"])([\w./-]*)$/.exec(antes);
    if (include) {
      const cierre = include[1] === '<' ? '>' : '"';
      const sigue = state.sliceDoc(pos, state.doc.lineAt(pos).to);
      const lista = include[1] === '<' ? CABECERAS_C : archivos.map((a) => a.nombre).filter((n) => /\.h$/i.test(n));
      return resultado(cx, include[2], lista.map((label) => ({ label, type: 'namespace', apply: sigue.startsWith(cierre) ? label : label + cierre })));
    }
    if (dentroDe(state, pos, NO_ACA)) return null;
    const palabra = palabraAlFinal(antes);
    const previo = antes.slice(0, antes.length - palabra.length);
    if (/^\s*#\s*$/.test(previo)) return resultado(cx, palabra, claves(DIRECTIVAS_C));
    // A field after `.` or `->`: not known here.
    if (/(?:\.|->)\s*$/.test(previo) || /^\s*#/.test(previo)) return null;

    const codigo = state.doc.toString();
    const { nombres, delSistema } = alcance(codigo, archivos);
    const propios = [...nombresC(codigo, tiposDe(nombres)), ...nombres].map((o) => ({ ...o, boost: 1 }));
    return resultado(cx, palabra, [...propios, ...PLANTILLAS, ...biblioteca(delSistema), ...PALABRAS], { parametro: parametroC });
  };
}
