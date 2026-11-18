import { acceptCompletion, autocompletion, completionStatus, currentCompletions } from '@codemirror/autocomplete';
import { EditorState, Prec } from '@codemirror/state';
import { EditorView, keymap, tooltips, ViewPlugin } from '@codemirror/view';
import { fuenteC } from './c';
import { fuenteJs } from './js';
import { fuentePython } from './python';
import { fuenteSql } from './sql';

// The autocomplete of the lab's editor, without a language server: each language, a source that reads the code (and
// the other files of the project, or the database) and suggests from its lists. It opens from the second letter or
// with Ctrl+Space; Enter or Tab accept, Esc closes, and a click elsewhere too. The list is CodeMirror's (listbox and
// option, with the option on view as the active one) and how many came is said to the screen reader when it opens.

/**
 * Each language, its source: `(contexto) => CompletionSource`, where `contexto()` gives { archivos, esquema } (the other
 * files of the project by name and content, and the tables of the database). Another language joins with its line.
 */
export const FUENTES = {
  python: fuentePython,
  c: fuenteC,
  sql: fuenteSql,
  javascript: fuenteJs,
};

const cuantas = (n) => (n === 1 ? '1 sugerencia' : `${n} sugerencias`);

// When the list opens, how many there are, to the screen reader (the one on view it reads by itself, as the active one).
const anunciar = ViewPlugin.fromClass(
  class {
    update(u) {
      if (completionStatus(u.startState) === 'active' || completionStatus(u.state) !== 'active') return;
      const n = currentCompletions(u.state).length;
      queueMicrotask(() => {
        if (completionStatus(u.view.state) === 'active') u.view.dispatch({ effects: EditorView.announce.of(cuantas(n)) });
      });
    }
  },
);

/** The extensions of the autocomplete for `lenguaje` (none, for one without its source). */
export function autocompletar(lenguaje, contexto) {
  const fuente = FUENTES[lenguaje];
  if (!fuente) return [];
  return [
    autocompletion({ override: [fuente(contexto)], closeOnBlur: true, maxRenderedOptions: 60, tooltipClass: () => 'sugerencias' }),
    // Tab accepts too, before it indents.
    Prec.highest(keymap.of([{ key: 'Tab', run: acceptCompletion }])),
    EditorState.phrases.of({ Completions: 'Sugerencias' }),
    // On a phone the list doesn't touch the edges of the screen.
    tooltips({ tooltipSpace: (v) => { const w = v.dom.ownerDocument.defaultView; return { top: 0, left: 8, bottom: w.innerHeight, right: w.innerWidth - 8 }; } }),
    anunciar,
  ];
}
