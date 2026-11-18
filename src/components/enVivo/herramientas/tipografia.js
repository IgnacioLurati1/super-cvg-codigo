import { Mark } from '@tiptap/core';
import { letraSegura } from '../../../lib/enVivo/documento';

// The Documento's typeface: a mark with one of the fixed list (LETRAS in src/lib/enVivo/documento.js), drawn as a class
// of documento.css. What a peer puts in it is read against the list: anything else is the page's own typeface, and no
// font name or style of theirs reaches the page.
export const Tipografia = Mark.create({
  name: 'letra',

  addAttributes() {
    return {
      cual: {
        default: null,
        parseHTML: (el) => letraSegura(el.getAttribute('data-letra')),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-letra]', getAttrs: (el) => (letraSegura(el.getAttribute('data-letra')) ? null : false) }];
  },

  renderHTML({ mark }) {
    const cual = letraSegura(mark.attrs.cual);
    return ['span', cual ? { 'data-letra': cual, class: `vdoc-letra vdoc-letra--${cual}` } : {}, 0];
  },

  addCommands() {
    return {
      // The page's own typeface (null, or one not in the list) takes the mark away.
      ponerLetra: (cual) => ({ commands }) => {
        const segura = letraSegura(cual);
        return segura ? commands.setMark(this.name, { cual: segura }) : commands.unsetMark(this.name);
      },
    };
  },
});
