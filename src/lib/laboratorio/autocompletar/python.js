import { pythonLanguage } from '@codemirror/lang-python';
import { syntaxTree } from '@codemirror/language';
import { claves, dentroDe, lineaAntes, palabraAlFinal, parametroComun, plantilla, recordado, resultado } from './comun';
import { CLAVES_PYTHON, INCORPORADAS, MODULOS_PYTHON } from './datosPython';

// Python: its words, the built-in functions, what the file and the other files of the project define (read from the
// tree of Lezer, without running anything) and the modules imported, with `modulo.` as in any editor.

const NO_ACA = new Set(['Comment', 'String', 'FormatString']);
// A function accepted goes as a call: its parameters but `self`, `cls` and the ones with a default.
const LLAMADA = { parametro: (p) => (/^(?:self|cls)\b/.test(p) ? '' : parametroComun(p)) };

/** `nombre(parámetros)` or a value, as an option. */
export function deFirma(firma, boost = 0) {
  const nombre = /^\w+/.exec(firma)[0];
  const resto = firma.slice(nombre.length);
  const type = !resto ? 'constant' : /^[A-Z]/.test(nombre) ? 'class' : 'function';
  return { label: nombre, type, detail: resto || undefined, boost };
}

const INCORPORADAS_OP = INCORPORADAS.map((f) => deFirma(f, -1));
const MODULOS_OP = Object.fromEntries(Object.entries(MODULOS_PYTHON).map(([m, lista]) => [m, lista.map((f) => deFirma(f))]));

const PLANTILLAS = [
  plantilla('for', 'for ${elemento} in ${lista}:\n\t${}'),
  plantilla('while', 'while ${condición}:\n\t${}'),
  plantilla('if', 'if ${condición}:\n\t${}'),
  plantilla('def', 'def ${nombre}(${parámetros}):\n\t${}'),
  plantilla('class', 'class ${Nombre}:\n\tdef __init__(self${}):\n\t\t${}'),
];
const CLAVES_OP = claves(CLAVES_PYTHON);

const texto = (doc, n) => doc.slice(n.from, n.to);

/**
 * What the code defines: functions (with their parameters), classes, and the variables assigned, of the parameters and
 * of each `for`. `soloArriba`: only what is at the top of the file, what another file can import.
 */
export function definiciones(arbol, doc, soloArriba = false) {
  const lista = [];
  const sumar = (nodo, type, detail) => nodo?.name === 'VariableName' && lista.push({ label: texto(doc, nodo), type, detail });
  arbol.iterate({
    enter(n) {
      const padre = n.node.parent?.name === 'DecoratedStatement' ? n.node.parent.parent : n.node.parent;
      const arriba = padre?.name === 'Script';
      if (n.name === 'FunctionDefinition') {
        if (soloArriba && !arriba) return false;
        const nombre = n.node.getChild('VariableName');
        sumar(nombre, 'function', n.node.getChild('ParamList') ? texto(doc, n.node.getChild('ParamList')) : undefined);
        return !soloArriba;
      }
      if (n.name === 'ClassDefinition') {
        if (soloArriba && !arriba) return false;
        sumar(n.node.getChild('VariableName'), 'class');
        return !soloArriba;
      }
      if (n.name === 'AssignStatement') {
        if (soloArriba && !arriba) return false;
        for (let h = n.node.firstChild; h && h.name !== 'AssignOp'; h = h.nextSibling) sumar(h, 'variable');
        return false;
      }
      if (soloArriba) return n.name === 'Script' || (n.name === 'DecoratedStatement' && arriba);
      if (n.name === 'ParamList') for (const h of n.node.getChildren('VariableName')) sumar(h, 'variable');
      if (n.name === 'ForStatement') for (let h = n.node.firstChild; h && h.name !== 'in'; h = h.nextSibling) sumar(h, 'variable');
      return true;
    },
  });
  return lista;
}

/** The `import` of the code: each name it leaves (alias → module) and what came with `from … import`. */
export function importados(arbol, doc) {
  const modulos = new Map();
  const nombres = [];
  arbol.iterate({
    enter(n) {
      if (n.name !== 'ImportStatement') return true;
      const frase = texto(doc, n).replace(/#.*$/gm, '').replace(/[()\\\n]/g, ' ');
      const desde = /^\s*from\s+([\w.]+)\s+import\s+(.+)$/s.exec(frase);
      const partes = (desde ? desde[2] : frase.replace(/^\s*import\s+/, '')).split(',').map((p) => p.trim()).filter(Boolean);
      for (const p of partes) {
        const [, original, alias] = /^([\w.*]+)(?:\s+as\s+(\w+))?$/.exec(p) ?? [];
        if (!original) continue;
        if (desde) nombres.push({ modulo: desde[1], original, nombre: alias ?? original });
        else modulos.set(alias ?? original, original);
      }
      return false;
    },
  });
  return { modulos, nombres };
}

const leerArchivo = recordado((codigo) => definiciones(pythonLanguage.parser.parse(codigo), codigo, true));

/** The modules of the project: each `.py` but the open one, by its name without `.py`, with what it defines. */
function delProyecto(archivos = []) {
  const m = new Map();
  for (const a of archivos) {
    const nombre = /^([\p{L}_][\p{L}\p{N}_]*)\.py$/u.exec(a.nombre)?.[1];
    if (nombre) m.set(nombre, () => leerArchivo(a.contenido ?? ''));
  }
  return m;
}

const lugar = (nombre, proyecto) => (MODULOS_OP[nombre] ? MODULOS_OP[nombre] : proyecto.has(nombre) ? proyecto.get(nombre)() : null);

/** The source of Python. `contexto()`: { archivos } of the project (the others, by name and content). */
export function fuentePython(contexto) {
  return (cx) => {
    const { state, pos } = cx;
    if (dentroDe(state, pos, NO_ACA)) return null;
    const antes = lineaAntes(state, pos);
    const proyecto = delProyecto(contexto?.()?.archivos);

    // `import ma…`, `from mo…`: the modules there are, of the site and of the project.
    const modulo = /^\s*(?:import|from)\s+(?:[\w.]+\s*(?:as\s+\w+\s*)?,\s*)*([\w.]*)$/.exec(antes);
    if (modulo) {
      const lista = [...proyecto.keys(), ...Object.keys(MODULOS_PYTHON)].map((label) => ({ label, type: 'namespace' }));
      return resultado(cx, modulo[1], lista);
    }

    const palabra = palabraAlFinal(antes);
    const previo = antes.slice(0, antes.length - palabra.length);
    const doc = state.doc.toString();
    const arbol = syntaxTree(state);

    // `from modelo import Al…`: what that module has.
    const desde = /^\s*from\s+([\w.]+)\s+import\s+(?:\(?\s*(?:\w+(?:\s+as\s+\w+)?\s*,\s*)*)$/.exec(previo);
    if (desde) return resultado(cx, palabra, lugar(desde[1], proyecto) ?? [], LLAMADA);

    const { modulos, nombres } = importados(arbol, doc);
    // `math.sq…`, `pd.read…`: what the module has. After another dot (a list, an object), nothing.
    const punto = /([\p{L}_][\p{L}\p{N}_]*)\s*\.\s*$/u.exec(previo);
    if (punto) return resultado(cx, palabra, (modulos.has(punto[1]) && lugar(modulos.get(punto[1]), proyecto)) || [], LLAMADA);
    if (/\.\s*$/.test(previo)) return null;

    const deImports = [];
    for (const [alias, original] of modulos) deImports.push({ label: alias, type: 'namespace', detail: alias === original ? undefined : original });
    for (const n of nombres) {
      const delModulo = lugar(n.modulo, proyecto) ?? [];
      if (n.original === '*') deImports.push(...delModulo);
      else deImports.push({ ...(delModulo.find((o) => o.label === n.original) ?? { type: 'variable' }), label: n.nombre });
    }
    const propios = definiciones(arbol, doc).map((o) => ({ ...o, boost: 1 }));
    return resultado(cx, palabra, [...propios, ...deImports, ...PLANTILLAS, ...INCORPORADAS_OP, ...CLAVES_OP], LLAMADA);
  };
}
