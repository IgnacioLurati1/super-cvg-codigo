import { useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyField, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql, SQLite } from '@codemirror/lang-sql';
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, drawSelection, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { useAjustes } from '../../lib/ajustes';
import { autocompletar } from '../../lib/laboratorio/autocompletar';
import { MAX_CODIGO } from '../../lib/laboratorio/saneo';
import { modoC } from './modoC';

// The code editor of the lab (CodeMirror 6): colors, line numbers, indentation that follows the language and the usual
// keys of an editor. Tab indents; Esc and then Tab leave it, as in any CodeMirror. Ctrl+Enter (Cmd+Enter) runs.
// The line of an error is marked with the highlighter and a sign in the margin, until the code changes. What the lab's
// section of Configuración says (ajustes.js, `lab…`) is read live: each change reconfigures the editor in place.

// Each language, its mode. C++ and Prolog will add theirs here.
const MODOS = {
  python: () => python(),
  sql: () => sql({ dialect: SQLite, upperCaseKeywords: true }),
  c: () => modoC,
  javascript: () => javascript(),
};

// The mode of the language and its autocomplete (autocompletar/), which asks `contexto()` for what is around when it
// suggests. What only shows (`soloLectura`), without it.
const delLenguaje = (lenguaje, soloLectura, contexto, sugerir = true) => [MODOS[lenguaje]?.() ?? [], soloLectura || !sugerir ? [] : autocompletar(lenguaje, contexto)];

// How it shows and writes the code, as chosen in Configuración: line numbers, the line of the cursor, how much a level
// goes in (in C, a Tab if chosen), long lines wrapped, and brackets and quotes that close by themselves.
function dePreferencias(a, lenguaje, soloLectura) {
  const conTab = lenguaje === 'c' && a.labTabEnC;
  return [
    a.labNumeros ? lineNumbers() : [],
    a.labLineaActual ? [highlightActiveLineGutter(), highlightActiveLine()] : [],
    indentUnit.of(conTab ? '\t' : ' '.repeat(a.labSangria)),
    EditorState.tabSize.of(a.labSangria),
    a.labAjuste ? EditorView.lineWrapping : [],
    a.labCerrar && !soloLectura ? [closeBrackets(), keymap.of(closeBracketsKeymap)] : [],
  ];
}

// tabindex: it is already in the Tab order, but said, so the scroller (long lines on a phone) counts as reachable.
const atributosDe = (etiqueta, describe, soloLectura) =>
  EditorView.contentAttributes.of({ tabindex: '0', 'aria-label': etiqueta, ...(describe ? { 'aria-describedby': describe } : {}), ...(soloLectura ? { 'aria-readonly': 'true' } : {}), autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });

// The colors of the code come from the site's (laboratorio.css): they follow the theme, the contrast and the palettes.
const COLORES = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: 'var(--codigo-clave)', fontWeight: '700' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--codigo-texto)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--codigo-numero)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--codigo-comentario)', fontStyle: 'italic' },
  { tag: [t.function(t.definition(t.variableName)), t.definition(t.className), t.function(t.variableName)], color: 'var(--codigo-funcion)' },
  { tag: [t.typeName, t.className, t.standard(t.variableName)], color: 'var(--codigo-tipo)' },
  { tag: [t.variableName, t.propertyName], color: 'var(--codigo-variable)' },
  { tag: t.invalid, color: 'var(--error)' },
]);

const marcarError = StateEffect.define();

class SignoDeError extends GutterMarker {
  toDOM() {
    const s = document.createElement('span');
    s.className = 'editor__signo';
    s.setAttribute('aria-hidden', 'true');
    s.textContent = '!';
    return s;
  }
}
const SIGNO = new SignoDeError();
const LINEA_CON_ERROR = Decoration.line({ class: 'editor__linea-error' });

// The line with an error (0, none): while the code doesn't change.
const lineaError = StateField.define({
  create: () => 0,
  update(linea, tr) {
    for (const e of tr.effects) if (e.is(marcarError)) return e.value;
    return tr.docChanged ? 0 : linea;
  },
  provide: (campo) => [
    EditorView.decorations.from(campo, (linea) => (view) => {
      const { doc } = view.state;
      return linea > 0 && linea <= doc.lines ? Decoration.set([LINEA_CON_ERROR.range(doc.line(linea).from)]) : Decoration.none;
    }),
  ],
});

// As Error Lens: what the last run said (`marcas`: [{ linea, tono: 'error' | 'aviso', texto }]), at the end of each line,
// which is marked. Each one goes away when its line is edited; the others follow their lines.
const ponerMarcas = StateEffect.define();

class Lente extends WidgetType {
  constructor(texto, tono) {
    super();
    this.texto = texto;
    this.tono = tono;
  }

  eq(otra) {
    return otra.texto === this.texto && otra.tono === this.tono;
  }

  toDOM() {
    const s = document.createElement('span');
    s.className = 'editor__lente';
    s.dataset.tono = this.tono;
    s.setAttribute('aria-hidden', 'true');
    s.textContent = this.texto;
    s.title = this.texto;
    return s;
  }
}
const LINEA_CON_AVISO = Decoration.line({ class: 'editor__linea-aviso' });

const lentes = StateField.define({
  create: () => [],
  update(marcas, tr) {
    for (const e of tr.effects) if (e.is(ponerMarcas)) return e.value;
    if (!tr.docChanged || !marcas.length) return marcas;
    const tocados = [];
    tr.changes.iterChangedRanges((desde, hasta) => tocados.push([desde, hasta]));
    const quedan = [];
    for (const m of marcas) {
      const l = tr.startState.doc.lineAt(m.desde);
      if (tocados.some(([desde, hasta]) => desde <= l.to && hasta >= l.from)) continue;
      quedan.push({ ...m, desde: tr.changes.mapPos(m.desde, 1) });
    }
    return quedan;
  },
  provide: (campo) => [
    EditorView.decorations.from(campo, (marcas) => (view) => {
      if (!marcas.length) return Decoration.none;
      const { doc } = view.state;
      const porLinea = new Map();
      for (const m of marcas) {
        const n = doc.lineAt(Math.min(m.desde, doc.length)).number;
        porLinea.set(n, [...(porLinea.get(n) ?? []), m]);
      }
      const rangos = [];
      for (const [n, deLinea] of porLinea) {
        const l = doc.line(n);
        const tono = deLinea.some((m) => m.tono === 'error') ? 'error' : 'aviso';
        rangos.push((tono === 'error' ? LINEA_CON_ERROR : LINEA_CON_AVISO).range(l.from));
        const texto = deLinea.map((m) => m.texto).filter(Boolean).join(' ');
        if (texto) rangos.push(Decoration.widget({ widget: new Lente(texto, tono), side: 1 }).range(l.to));
      }
      return Decoration.set(rangos, true);
    }),
  ],
});

/** The marks of the field on line `n` of `state`. */
const marcasDeLinea = (state, n) => state.field(lentes, false)?.filter((m) => state.doc.lineAt(Math.min(m.desde, state.doc.length)).number === n) ?? [];

// What a line says, to the screen reader, once when the cursor gets to it (or the marks come while it's there): not at
// each key inside it.
const leerLente = ViewPlugin.fromClass(
  class {
    update(u) {
      const llegaron = u.transactions.some((tr) => tr.effects.some((e) => e.is(ponerMarcas)));
      if ((!u.selectionSet && !u.focusChanged && !llegaron) || !u.view.hasFocus) return;
      const n = u.state.doc.lineAt(u.state.selection.main.head).number;
      const marcas = marcasDeLinea(u.state, n);
      if (!marcas.length) return;
      const antes = u.startState.doc.lineAt(Math.min(u.startState.selection.main.head, u.startState.doc.length)).number;
      if (n === antes && !u.focusChanged && !llegaron) return;
      const texto = marcas.map((m) => `${m.tono === 'error' ? 'Error' : 'Aviso'}: ${m.texto}`).join('. ');
      queueMicrotask(() => u.view.dispatch({ effects: EditorView.announce.of(texto) }));
    }
  },
);

// «Paso a paso»: the line that goes next (a full arrow) and the one that just ran (a hollow one), until the code changes.
const marcarPaso = StateEffect.define();
const SIN_PASO = { siguiente: 0, recien: 0 };

class FlechaDePaso extends GutterMarker {
  constructor(clase) {
    super();
    this.clase = clase;
  }

  eq(otra) {
    return otra.clase === this.clase;
  }

  toDOM() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `editor__flecha ${this.clase}`);
    svg.setAttribute('viewBox', '0 0 12 12');
    svg.setAttribute('aria-hidden', 'true');
    const punta = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    punta.setAttribute('d', 'M2 1.5 10.5 6 2 10.5z');
    svg.append(punta);
    return svg;
  }
}
const FLECHA_SIGUE = new FlechaDePaso('editor__flecha--sigue');
const FLECHA_RECIEN = new FlechaDePaso('editor__flecha--recien');
const LINEA_SIGUE = Decoration.line({ class: 'editor__linea-sigue' });
const LINEA_RECIEN = Decoration.line({ class: 'editor__linea-recien' });

const lineasDePaso = StateField.define({
  create: () => SIN_PASO,
  update(lineas, tr) {
    for (const e of tr.effects) if (e.is(marcarPaso)) return e.value;
    return tr.docChanged ? SIN_PASO : lineas;
  },
  provide: (campo) => [
    EditorView.decorations.from(campo, (p) => (view) => {
      const { doc } = view.state;
      const marcas = [];
      if (p.recien > 0 && p.recien <= doc.lines) marcas.push(LINEA_RECIEN.range(doc.line(p.recien).from));
      if (p.siguiente > 0 && p.siguiente <= doc.lines) marcas.push(LINEA_SIGUE.range(doc.line(p.siguiente).from));
      return marcas.length ? Decoration.set(marcas, true) : Decoration.none;
    }),
  ],
});

// The margin of the error also carries the arrows of the steps: the code doesn't move when they come.
const margenDeError = gutter({
  class: 'editor__margen-error',
  lineMarker: (view, bloque) => {
    const numero = view.state.doc.lineAt(bloque.from).number;
    const linea = view.state.field(lineaError);
    if (linea > 0 && linea <= view.state.doc.lines && numero === linea) return SIGNO;
    if (marcasDeLinea(view.state, numero).some((m) => m.tono === 'error')) return SIGNO;
    const paso = view.state.field(lineasDePaso);
    return numero === paso.siguiente ? FLECHA_SIGUE : numero === paso.recien ? FLECHA_RECIEN : null;
  },
  lineMarkerChange: (u) => u.startState.field(lineaError) !== u.state.field(lineaError) || u.startState.field(lineasDePaso) !== u.state.field(lineasDePaso) || u.startState.field(lentes) !== u.state.field(lentes),
  initialSpacer: () => SIGNO,
});

// The line in view inside the editor, without moving the page: what is below it stays where it is.
function mostrarLinea(v, linea) {
  const s = v.scrollDOM;
  const bloque = v.lineBlockAt(v.state.doc.line(linea).from);
  const arriba = bloque.top + (v.documentTop - s.getBoundingClientRect().top) + s.scrollTop;
  if (arriba < s.scrollTop || arriba + bloque.height > s.scrollTop + s.clientHeight) s.scrollTop = Math.max(0, arriba - s.clientHeight / 3);
}

// Nothing past the limit of a file: the rest of the paste doesn't come in.
const tope = EditorState.changeFilter.of((tr) => tr.newDoc.length <= MAX_CODIGO);

/**
 * `valor` is read when it mounts (a new file mounts a new editor, with its `key`); `alCambiar(texto)` on each change.
 * `lenguaje` changes the mode in place. `error`: { linea } to mark, or null. `alCorrer`: Ctrl+Enter.
 * `paso`: { siguiente, recien } of «Paso a paso», the lines with their arrows, or null. `soloLectura`: what a program
 * wrote, shown until the student saves it or lets it go (read when it mounts). A `lenguaje` without a mode (the text of
 * a data file) goes without colors. `memoria` (a Map) and `clave`: where it leaves, when it closes, the cursor, what Ctrl+Z
 * undoes and how far it went down, to take them back if it opens again with the same text (the tabs of the lab).
 * `contexto()`: { archivos, esquema } for the autocomplete (the other files of the project, the tables of the database).
 * `marcas`: [{ linea, tono, texto }] of the last run, at the end of their lines (Error Lens, if it's on).
 * `compartido`: the extension of a text shared with others (a live session): it brings its own undo and its own limit,
 * so the editor's history and limit stay out. Read when it mounts, like `valor`.
 */
export default function Editor({ valor, lenguaje, alCambiar, alCorrer, error, etiqueta, describe, paso = null, soloLectura = false, memoria = null, clave = null, contexto = null, marcas = null, compartido = null }) {
  const caja = useRef(null);
  const vista = useRef(null);
  const modo = useRef(new Compartment());
  const preferencias = useRef(new Compartment());
  const atributos = useRef(new Compartment());
  const ajustes = useAjustes();
  const ultimo = useRef({ alCambiar, alCorrer, contexto });

  useEffect(() => {
    ultimo.current = { alCambiar, alCorrer, contexto };
  });

  useEffect(() => {
    const correr = () => {
      ultimo.current.alCorrer?.();
      return true;
    };
    const antes = memoria && clave ? memoria.get(clave) : null;
    const alrededor = () => ultimo.current.contexto?.() ?? {};
    const extensiones = [
      preferencias.current.of(dePreferencias(ajustes, lenguaje, soloLectura)),
      margenDeError,
      compartido ?? history(),
      indentOnInput(),
      bracketMatching(),
      // The cursor drawn by the editor, 2px and above the text: the browser's own hid next to a marked bracket.
      drawSelection(),
      syntaxHighlighting(COLORES),
      lineaError,
      lentes,
      leerLente,
      lineasDePaso,
      compartido ? [] : tope,
      EditorState.readOnly.of(soloLectura),
      modo.current.of(delLenguaje(lenguaje, soloLectura, alrededor, ajustes.labAutocompletar)),
      keymap.of([{ key: 'Mod-Enter', run: correr, preventDefault: true }, ...defaultKeymap, ...(compartido ? [] : historyKeymap), indentWithTab]),
      atributos.current.of(atributosDe(etiqueta, describe, soloLectura)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) ultimo.current.alCambiar?.(u.state.doc.toString());
      }),
    ];
    // A shared text is read right when the editor is made: it has to start exactly as the text is.
    const inicial = typeof valor === 'function' ? valor() : valor;
    let estado = null;
    if (antes?.texto === inicial) {
      try {
        estado = EditorState.fromJSON(antes.json, { extensions: extensiones }, { history: historyField });
      } catch {
        estado = null;
      }
    }
    const v = new EditorView({ parent: caja.current, state: estado ?? EditorState.create({ doc: inicial, extensions: extensiones }) });
    vista.current = v;
    if (estado) {
      requestAnimationFrame(() => {
        if (vista.current === v) v.scrollDOM.scrollTop = antes.arriba;
      });
    }
    return () => {
      if (memoria && clave) memoria.set(clave, { texto: v.state.doc.toString(), json: v.state.toJSON({ history: historyField }), arriba: v.scrollDOM.scrollTop });
      v.destroy();
      vista.current = null;
    };
    // The text is read once: a new file is a new editor.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    vista.current?.dispatch({ effects: modo.current.reconfigure(delLenguaje(lenguaje, soloLectura, () => ultimo.current.contexto?.() ?? {}, ajustes.labAutocompletar)) });
    // Only the language and the setting: `soloLectura` is read when it mounts.
  }, [lenguaje, ajustes.labAutocompletar]); // eslint-disable-line react-hooks/exhaustive-deps

  const { labNumeros, labLineaActual, labSangria, labTabEnC, labAjuste, labCerrar } = ajustes;
  useEffect(() => {
    const a = { labNumeros, labLineaActual, labSangria, labTabEnC, labAjuste, labCerrar };
    vista.current?.dispatch({ effects: preferencias.current.reconfigure(dePreferencias(a, lenguaje, soloLectura)) });
    // `soloLectura` is read when it mounts.
  }, [lenguaje, labNumeros, labLineaActual, labSangria, labTabEnC, labAjuste, labCerrar]); // eslint-disable-line react-hooks/exhaustive-deps

  // What a screen reader hears follows the file's language when it changes (an open file, a draft).
  useEffect(() => {
    vista.current?.dispatch({ effects: atributos.current.reconfigure(atributosDe(etiqueta, describe, soloLectura)) });
  }, [etiqueta, describe]); // eslint-disable-line react-hooks/exhaustive-deps

  // The marks come again only when what they say changes: the same marks again don't bring back one edited away.
  const lista = ajustes.labErrores && !soloLectura && Array.isArray(marcas) ? marcas : [];
  const huella = JSON.stringify(lista);
  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const { doc } = v.state;
    const nuevas = lista
      .filter((m) => m.linea > 0 && m.linea <= doc.lines)
      .map((m) => ({ desde: doc.line(m.linea).from, tono: m.tono === 'aviso' ? 'aviso' : 'error', texto: String(m.texto ?? '') }));
    v.dispatch({ effects: ponerMarcas.of(nuevas) });
    // `huella` says what `lista` has.
  }, [huella]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const linea = error?.linea > 0 ? Math.min(error.linea, v.state.doc.lines) : 0;
    v.dispatch({ effects: marcarError.of(linea) });
    if (linea) v.dispatch({ effects: EditorView.scrollIntoView(v.state.doc.line(linea).from, { y: 'center' }) });
  }, [error]);

  const siguiente = paso?.siguiente ?? 0;
  const recien = paso?.recien ?? 0;
  useEffect(() => {
    const v = vista.current;
    if (!v) return;
    const lineas = v.state.doc.lines;
    const p = { siguiente: siguiente <= lineas ? siguiente : 0, recien: recien <= lineas ? recien : 0 };
    if (p.siguiente === v.state.field(lineasDePaso).siguiente && p.recien === v.state.field(lineasDePaso).recien) return;
    v.dispatch({ effects: marcarPaso.of(p.siguiente || p.recien ? p : SIN_PASO) });
    if (p.siguiente || p.recien) mostrarLinea(v, p.siguiente || p.recien);
  }, [siguiente, recien]);

  return <div ref={caja} className="editor" data-lenguaje={lenguaje} />;
}

/** Takes the cursor of the editor inside `raiz` to the start of line `linea`, in view, with the focus there. */
export function irALinea(raiz, linea) {
  const contenido = raiz?.querySelector('.cm-content');
  const v = contenido && EditorView.findFromDOM(contenido);
  if (!v) return;
  const n = Math.min(Math.max(1, linea), v.state.doc.lines);
  const desde = v.state.doc.line(n).from;
  v.dispatch({ selection: { anchor: desde }, effects: EditorView.scrollIntoView(desde, { y: 'center' }) });
  v.focus();
}
