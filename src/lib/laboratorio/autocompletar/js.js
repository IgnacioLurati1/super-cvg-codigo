import { javascriptLanguage } from '@codemirror/lang-javascript';
import { syntaxTree } from '@codemirror/language';
import { claves, dentroDe, lineaAntes, palabraAlFinal, parametroComun, plantilla, recordado, resultado } from './comun';

// A function accepted goes as a call: its parameters but the ones with a default and `...resto`.
const LLAMADA = { parametro: parametroComun };
import { CLAVES_JS, DE_LISTA, DE_OTROS, DE_TEXTO, GLOBALES_JS, MIEMBROS_JS, OBJETOS_JS } from './datosJs';

// JavaScript: its words, what the lab's engine has (console, Math, prompt…), what the file defines and what it imports
// from the other files of the project (read from the tree of Lezer, without running anything), the paths of an
// `import`, and after a dot the methods of a list and of a text.

const NO_ACA = new Set(['LineComment', 'BlockComment', 'String', 'TemplateString']);
const DE_ARCHIVO = /\.(?:m?js|json|txt|csv)$/i;
const DE_CODIGO = /\.m?js$/i;

/** `nombre(parámetros)` or a value, as an option. */
function deFirma(firma, boost = 0) {
  const nombre = /^[\w$]+/.exec(firma)[0];
  const resto = firma.slice(nombre.length);
  return { label: nombre, type: resto ? 'function' : 'property', detail: resto || undefined, boost };
}

const PLANTILLAS = [
  plantilla('for', 'for (let ${i} = 0; ${i} < ${n}; ${i}++) {\n\t${}\n}'),
  plantilla('forof', 'for (const ${elemento} of ${lista}) {\n\t${}\n}', 'for … of'),
  plantilla('while', 'while (${condición}) {\n\t${}\n}'),
  plantilla('if', 'if (${condición}) {\n\t${}\n}'),
  plantilla('function', 'function ${nombre}(${parámetros}) {\n\t${}\n}'),
  plantilla('flecha', 'const ${nombre} = (${parámetros}) => {\n\t${}\n};', 'función flecha'),
  plantilla('log', 'console.log(${});', 'console.log', { entera: false, type: 'function' }),
];
const GLOBALES = GLOBALES_JS.map((f) => ({ ...deFirma(f, -1), type: /\(/.test(f) ? 'function' : 'constant' }));
const OBJETOS = OBJETOS_JS.map((label) => ({ label, type: label === 'console' || label === 'Math' || label === 'JSON' ? 'namespace' : 'class', boost: -1 }));
const MIEMBROS = Object.fromEntries(Object.entries(MIEMBROS_JS).map(([o, lista]) => [o, lista.map((f) => deFirma(f))]));
const DE_UN_VALOR = [...DE_LISTA.map((f) => deFirma(f)), ...DE_TEXTO.map((f) => deFirma(f)), ...DE_OTROS.map((f) => deFirma(f, -1))];
const CLAVES_OP = claves(CLAVES_JS);

const texto = (doc, n) => doc.slice(n.from, n.to);

// What a name defines, by where it is: a function (with its parameters), a class, or a variable.
function comoOpcion(n, doc) {
  const padre = n.parent;
  if (padre?.name === 'FunctionDeclaration') return { type: 'function', detail: padre.getChild('ParamList') ? texto(doc, padre.getChild('ParamList')) : undefined };
  if (padre?.name === 'ClassDeclaration') return { type: 'class' };
  const valor = n.nextSibling?.name === 'Equals' ? n.nextSibling.nextSibling : null;
  if (valor && (valor.name === 'ArrowFunction' || valor.name === 'FunctionExpression')) {
    const p = valor.getChild('ParamList');
    return { type: 'function', detail: p ? texto(doc, p) : undefined };
  }
  return { type: 'variable' };
}

/** What the code defines: functions, classes, variables, parameters and what it imports by name. */
export function definiciones(arbol, doc) {
  const lista = [];
  arbol.iterate({
    enter(n) {
      if (n.name === 'VariableDefinition') lista.push({ label: texto(doc, n), ...comoOpcion(n.node, doc) });
    },
  });
  return lista;
}

/** What a file exports by name (`export const …`, `export function …`, `export { a, b }`), what another one can import. */
export function exportados(arbol, doc) {
  const lista = [];
  for (let n = arbol.topNode.firstChild; n; n = n.nextSibling) {
    if (n.name !== 'ExportDeclaration') continue;
    if (n.getChild('default')) continue;
    const grupo = n.getChild('ExportGroup');
    if (grupo) {
      for (const v of grupo.getChildren('VariableName')) lista.push({ label: texto(doc, v), type: 'variable' });
      continue;
    }
    const dentro = n.getChild('FunctionDeclaration') ?? n.getChild('ClassDeclaration') ?? n.getChild('VariableDeclaration');
    if (!dentro) continue;
    // The names of the declaration itself, not the ones inside its body.
    for (let h = dentro.firstChild; h; h = h.nextSibling) {
      if (h.name === 'VariableDefinition') lista.push({ label: texto(doc, h), ...comoOpcion(h, doc) });
      else if (h.name === 'ArrayPattern' || h.name === 'ObjectPattern') for (const v of h.getChildren('VariableDefinition')) lista.push({ label: texto(doc, v), type: 'variable' });
    }
  }
  return lista;
}

const leerArchivo = recordado((codigo) => exportados(javascriptLanguage.parser.parse(codigo), codigo));

// A path of an `import` as the engine finds it (jsMotor.js): without `./`, with or without `.js`.
const limpia = (ruta) => ruta.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '').replace(/^\//, '');

/** What the file `ruta` of the project exports, or []. */
function delArchivo(ruta, archivos) {
  const buscada = limpia(ruta);
  const a = archivos.find((x) => DE_CODIGO.test(x.nombre) && [buscada, `${buscada}.js`, `${buscada}.mjs`].includes(limpia(x.nombre)))
    ?? archivos.find((x) => DE_CODIGO.test(x.nombre) && [buscada, `${buscada}.js`].includes(x.nombre.split('/').at(-1)));
  return a ? leerArchivo(a.contenido ?? '') : [];
}

/** The source of JavaScript. `contexto()`: { archivos } of the project (the others, by name and content). */
export function fuenteJs(contexto) {
  return (cx) => {
    const { state, pos } = cx;
    const antes = lineaAntes(state, pos);
    const archivos = contexto?.()?.archivos ?? [];

    // `from './ma…`, `import './…`: the files of the project.
    const ruta = /(?:\bfrom|^\s*import)\s*['"]([^'"]*)$/.exec(antes);
    if (ruta) {
      const lista = archivos.filter((a) => DE_ARCHIVO.test(a.nombre)).map((a) => ({ label: `./${a.nombre}`, type: 'namespace' }));
      return resultado(cx, ruta[1], lista, { minimo: 0 });
    }
    if (dentroDe(state, pos, NO_ACA)) return null;

    const palabra = palabraAlFinal(antes);
    const previo = antes.slice(0, antes.length - palabra.length);
    const linea = state.doc.lineAt(pos).text;

    // `import { su… } from './mate.js'`: what that file exports.
    if (/^\s*import\s+(?:[\w$]+\s*,\s*)?\{[^}]*$/.test(previo)) {
      const desde = /\bfrom\s*['"]([^'"]+)['"]/.exec(linea);
      return resultado(cx, palabra, desde ? delArchivo(desde[1], archivos) : [], LLAMADA);
    }

    const doc = state.doc.toString();
    // `m.` of `import * as m from './x.js'`; `console.`, `Math.`…; after any other value, the methods of a list and a text.
    const punto = /([\p{L}_$][\p{L}\p{N}_$]*)\s*\.\s*$/u.exec(previo);
    if (punto) {
      for (const m of doc.matchAll(/import\s*\*\s*as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g)) {
        if (m[1] === punto[1]) return resultado(cx, palabra, delArchivo(m[2], archivos), LLAMADA);
      }
      if (MIEMBROS[punto[1]]) return resultado(cx, palabra, MIEMBROS[punto[1]], LLAMADA);
    }
    if (/\.\s*$/.test(previo)) return /\.\.\.\s*$/.test(previo) ? resultado(cx, palabra, definiciones(syntaxTree(state), doc), LLAMADA) : resultado(cx, palabra, DE_UN_VALOR, LLAMADA);

    const propios = definiciones(syntaxTree(state), doc).map((o) => ({ ...o, boost: 1 }));
    return resultado(cx, palabra, [...propios, ...PLANTILLAS, ...GLOBALES, ...OBJETOS, ...CLAVES_OP], LLAMADA);
  };
}
