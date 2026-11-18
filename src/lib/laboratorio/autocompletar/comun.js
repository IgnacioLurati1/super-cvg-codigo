import { insertCompletionText, pickedCompletion, snippet, snippetCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';

// What every language shares: the word being written, whether the cursor is inside a comment or a text, and the list
// that comes out (without repeats, and without what is already written whole).

// A name as the languages write it (Python lets it have accents).
const NOMBRE_AL_FINAL = /[\p{L}_][\p{L}\p{N}_]*$/u;

/** The name the cursor is finishing in `antes` (the line up to the cursor), or ''. */
export const palabraAlFinal = (antes) => NOMBRE_AL_FINAL.exec(antes)?.[0] ?? '';

/** The line up to the cursor. */
export function lineaAntes(state, pos) {
  const linea = state.doc.lineAt(pos);
  return linea.text.slice(0, pos - linea.from);
}

/**
 * Whether `pos` is inside one of the nodes named in `nombres` (comments and texts). In an f-string of Python, and in
 * the `${}` of a template of JavaScript, what goes between braces is code again.
 */
export function dentroDe(state, pos, nombres) {
  for (let n = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent) {
    if (n.name === 'FormatReplacement' || n.name === 'Interpolation') return false;
    if (nombres.has(n.name)) return true;
  }
  return false;
}

/**
 * The result for CodeMirror. Without Ctrl+Space it opens from the second letter, and not over a word already written
 * whole (so Enter after `return total` goes to the next line, even with `totales` around); a template, yes (`for`). Each
 * name goes once, the first one that came. No `validFor`: it asks again at each letter, so a finished word closes it.
 * `sinCaso`: SQL, where `select` and `SELECT` are the same word.
 */
export function resultado(contexto, palabra, opciones, { minimo = 2, sinCaso = false, parametro = null } = {}) {
  if (!contexto.explicit && palabra.length < minimo) return null;
  const igual = sinCaso ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  const vistos = new Set();
  const lista = [];
  for (const o of opciones) {
    if (vistos.has(o.label)) continue;
    vistos.add(o.label);
    if (!contexto.explicit && igual(o.label, palabra)) {
      if (!ENTERAS.has(o)) return null;
    }
    lista.push(parametro ? conLlamada(o, parametro) : o);
  }
  if (!lista.length) return null;
  return { from: contexto.pos - palabra.length, options: lista };
}

// The templates that open also with their word whole: nobody leaves a `for` alone on its line.
const ENTERAS = new WeakSet();

/** A short template, with its places to fill (Tab goes to the next one). `entera`: it opens with its word whole too. */
export function plantilla(label, molde, detalle = 'plantilla', { entera = true, type = 'keyword' } = {}) {
  const o = snippetCompletion(molde, { label, type, detail: detalle, boost: -1 });
  if (entera) ENTERAS.add(o);
  return o;
}

// ---- Calls: a function accepted goes with its parameters, each a place to fill (Tab goes to the next, and then out) --

const LLAMABLES = new Set(['function', 'method', 'class']);

/** What goes between the first `(` of `firma` and its `)`, or null if it has no parentheses. */
export function parametrosDe(firma) {
  const t = String(firma ?? '');
  const abre = t.indexOf('(');
  if (abre < 0) return null;
  let nivel = 0;
  for (let i = abre; i < t.length; i++) {
    if (t[i] === '(') nivel += 1;
    else if (t[i] === ')' && --nivel === 0) return t.slice(abre + 1, i);
  }
  return null;
}

/** A list of parameters cut at its commas, not at the ones inside parentheses or brackets. */
function partir(lista) {
  const pedazos = [];
  let nivel = 0;
  let pedazo = '';
  for (const c of lista) {
    if ('([{'.includes(c)) nivel += 1;
    else if (')]}'.includes(c)) nivel -= 1;
    if (c === ',' && nivel === 0) {
      pedazos.push(pedazo);
      pedazo = '';
    } else pedazo += c;
  }
  pedazos.push(pedazo);
  return pedazos.map((p) => p.trim()).filter(Boolean);
}

/**
 * The template of a call to `nombre` with the parameters in `lista`: each one that has to be written, a place to fill,
 * and one more after the `)`, where Tab leaves. `parametro(texto)` gives a parameter's name, or '' for one that can be
 * left out (a default, `...`). Only optional ones: the cursor between the parentheses. None: after them.
 */
export function moldeDeLlamada(nombre, lista, parametro) {
  // `(void)` of C is no parameters.
  const pedazos = partir(lista).filter((p) => p !== 'void');
  if (!pedazos.length) return `${nombre}()`;
  const nombres = pedazos.map((p) => String(parametro(p) ?? '').replace(/[^\p{L}\p{N}_]/gu, '')).filter(Boolean);
  if (!nombres.length) return `${nombre}(\${})`;
  return `${nombre}(${nombres.map((n) => `\${${n}}`).join(', ')})\${}`;
}

/** Accepting a call: its template, or only the name when a `(` already follows. Without places, the cursor at its end. */
export const aplicarLlamada = (molde) => (view, completion, from, to) => {
  const yaAbre = /^\s*\(/.test(view.state.sliceDoc(to, view.state.doc.lineAt(to).to));
  if (yaAbre || !molde.includes('${')) {
    view.dispatch({ ...insertCompletionText(view.state, yaAbre ? completion.label : molde, from, to), annotations: pickedCompletion.of(completion), userEvent: 'input.complete' });
  } else snippet(molde)(view, completion, from, to);
};

/** The option of a function (or a class) whose parameters are known, as a call; any other one, as it is. */
export function conLlamada(o, parametro) {
  if (o.apply || !LLAMABLES.has(o.type)) return o;
  const lista = parametrosDe(o.detail);
  return lista === null ? o : { ...o, apply: aplicarLlamada(moldeDeLlamada(o.label, lista, parametro)) };
}

/** A parameter's name as most languages write it: the first name, unless it has a default or is `*`, `/` or `...`. */
export const parametroComun = (p) => (/^[*/.]|=|\?$|\.\.\.$/.test(p) ? '' : (/^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(p)?.[0] ?? ''));

/** A word of the language. */
export const claves = (lista, type = 'keyword') => lista.map((label) => ({ label, type, boost: -2 }));

/** What a file says, remembered by its text: the other files of the project are read again only when they change. */
export function recordado(leer, tope = 40) {
  const memoria = new Map();
  return (texto) => {
    if (memoria.has(texto)) return memoria.get(texto);
    const valor = leer(texto);
    if (memoria.size >= tope) memoria.delete(memoria.keys().next().value);
    memoria.set(texto, valor);
    return valor;
  };
}
