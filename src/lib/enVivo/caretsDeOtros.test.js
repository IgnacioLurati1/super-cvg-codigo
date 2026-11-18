import { afterEach, describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { colaborar } from './caretsDeOtros';

// Another one's caret at the end of the file: drawn with their name, and nothing of it is text of the editor (a native
// edit of the whole file read the old caret's name and U+2060 back as code, for everyone).
let vista = null;
afterEach(() => {
  vista?.destroy();
  vista = null;
});

function conOtro(texto, nombre, donde) {
  const doc = new Y.Doc();
  const t = doc.getText('codigo');
  t.insert(0, texto);
  const pos = Y.createRelativePositionFromTypeIndex(t, donde);
  const oyentes = new Set();
  const conciencia = {
    doc,
    getLocalState: () => ({}),
    setLocalStateField() {},
    getStates: () => new Map([[doc.clientID + 1, { cursor: { anchor: pos, head: pos }, user: { name: nombre, color: '#c03' } }]]),
    on: (_e, fn) => oyentes.add(fn),
    off: (_e, fn) => oyentes.delete(fn),
  };
  vista = new EditorView({
    state: EditorState.create({ doc: t.toString(), extensions: colaborar(t, conciencia, { undoManager: false }) }),
    parent: document.body,
  });
  oyentes.forEach((fn) => fn({ added: [doc.clientID + 1], updated: [], removed: [] }));
  return { t, vista };
}

describe('carets de otros en el código', () => {
  it('dibuja el caret con el nombre, sin texto dentro del editor', () => {
    const { vista: v } = conOtro('print(1)\nplt.show()', 'Ana E.', 19);
    const caret = v.contentDOM.querySelector('.cm-ySelectionCaret');
    expect(caret).not.toBeNull();
    expect(caret.dataset.nombre).toBe('Ana E.');
    expect(caret.getAttribute('aria-hidden')).toBe('true');
    expect(caret.textContent).toBe('');
    expect(v.contentDOM.textContent).not.toMatch(/Ana|⁠/);
  });
});
