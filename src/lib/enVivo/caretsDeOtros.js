import * as Y from 'yjs';
import { RangeSet } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import { yCollab, yRemoteSelectionsTheme } from 'y-codemirror.next';

// The others' carets and selections in a shared code editor, as y-codemirror.next draws them, but with the name out of
// the text: its own caret puts the name and three U+2060 as text nodes inside the editor, so the page's text
// (`innerText`, a selection that goes past the editor, a screen reader) took them, and pasted back they were code
// for everyone. Here the name is the `::after` of an empty element: drawn, never text.

class CaretDeOtro extends WidgetType {
  constructor(color, nombre) {
    super();
    this.color = color;
    this.nombre = nombre;
  }

  toDOM() {
    const caret = document.createElement('span');
    caret.className = 'cm-ySelectionCaret';
    caret.setAttribute('aria-hidden', 'true');
    caret.dataset.nombre = this.nombre;
    caret.style.backgroundColor = this.color;
    caret.style.borderColor = this.color;
    const punto = document.createElement('span');
    punto.className = 'cm-ySelectionCaretDot';
    caret.append(punto);
    return caret;
  }

  eq(otro) {
    return otro.color === this.color && otro.nombre === this.nombre;
  }

  get estimatedHeight() {
    return -1;
  }

  ignoreEvent() {
    return true;
  }
}

const tema = EditorView.baseTheme({
  '.cm-ySelectionCaret': { display: 'inline-block', verticalAlign: 'text-bottom', height: '1.2em', width: 0 },
  '.cm-ySelectionCaretDot': { display: 'block' },
  '.cm-ySelectionCaret::after': {
    content: 'attr(data-nombre)',
    position: 'absolute',
    insetInlineStart: '-1px',
    bottom: '100%',
    padding: '0 4px',
    borderRadius: '3px 3px 3px 0',
    backgroundColor: 'inherit',
    color: '#fff',
    fontFamily: 'var(--fuente-ui)',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontStyle: 'normal',
    lineHeight: 'normal',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    pointerEvents: 'none',
    zIndex: 101,
  },
});

const marca = (color) => Decoration.mark({ attributes: { style: `background-color: ${color}` }, class: 'cm-ySelection' });

function carets(texto, conciencia) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.decorations = RangeSet.empty;
      this.oir = ({ added, updated, removed }) => {
        if ([...added, ...updated, ...removed].some((c) => c !== conciencia.doc.clientID)) view.dispatch({});
      };
      conciencia.on('change', this.oir);
    }

    destroy() {
      conciencia.off('change', this.oir);
    }

    update(u) {
      const doc = texto.doc;
      // This browser's caret, for the others (as y-codemirror.next does it).
      const local = conciencia.getLocalState();
      if (local != null) {
        const foco = u.view.hasFocus && u.view.dom.ownerDocument.hasFocus();
        const sel = foco ? u.state.selection.main : null;
        if (sel) {
          const anchor = Y.createRelativePositionFromTypeIndex(texto, sel.anchor);
          const head = Y.createRelativePositionFromTypeIndex(texto, sel.head);
          const antes = local.cursor;
          if (!antes
            || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(antes.anchor), anchor)
            || !Y.compareRelativePositions(Y.createRelativePositionFromJSON(antes.head), head)) {
            conciencia.setLocalStateField('cursor', { anchor, head });
          }
        } else if (local.cursor != null && foco) conciencia.setLocalStateField('cursor', null);
      }
      const lista = [];
      conciencia.getStates().forEach((estado, cliente) => {
        if (cliente === conciencia.doc.clientID) return;
        const c = estado.cursor;
        if (!c?.anchor || !c?.head) return;
        const a = Y.createAbsolutePositionFromRelativePosition(c.anchor, doc);
        const h = Y.createAbsolutePositionFromRelativePosition(c.head, doc);
        if (!a || !h || a.type !== texto || h.type !== texto) return;
        const { color = '#30bced', name = 'Alguien' } = estado.user || {};
        const claro = estado.user?.colorLight || `${color}33`;
        const largo = u.state.doc.length;
        const desde = Math.min(a.index, h.index, largo);
        const hasta = Math.min(Math.max(a.index, h.index), largo);
        const l1 = u.state.doc.lineAt(desde);
        const l2 = u.state.doc.lineAt(hasta);
        if (l1.number === l2.number) {
          if (desde < hasta) lista.push(marca(claro).range(desde, hasta));
        } else {
          if (desde < l1.to) lista.push(marca(claro).range(desde, l1.to));
          if (l2.from < hasta) lista.push(marca(claro).range(l2.from, hasta));
          for (let i = l1.number + 1; i < l2.number; i++) {
            const p = u.state.doc.line(i).from;
            lista.push(Decoration.line({ attributes: { style: `background-color: ${claro}`, class: 'cm-yLineSelection' } }).range(p));
          }
        }
        const cabeza = Math.min(h.index, largo);
        lista.push(Decoration.widget({ side: h.index - a.index > 0 ? -1 : 1, widget: new CaretDeOtro(color, String(name)) }).range(cabeza));
      });
      this.decorations = Decoration.set(lista, true);
    }
  }, { decorations: (v) => v.decorations });
}

/** yCollab with the others' carets drawn here: the same sync and undo, the names never text of the editor. */
export function colaborar(texto, conciencia, opciones) {
  return [yCollab(texto, null, opciones), yRemoteSelectionsTheme, tema, carets(texto, conciencia)];
}
