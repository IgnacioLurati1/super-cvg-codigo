import { StreamLanguage } from '@codemirror/language';

// The mode of C in the editor: its colors (keywords, types, strings, numbers, comments, the #include lines) and the
// indentation by braces. A small tokenizer of its own, with the colors of the site (Editor.jsx).

const CLAVES = new Set('auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while _Bool _Noreturn _Static_assert'.split(' '));
const TIPOS = new Set('void char short int long float double signed unsigned bool size_t ssize_t FILE int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t intptr_t uintptr_t ptrdiff_t time_t clock_t'.split(' '));
const VALORES = new Set('NULL true false EOF stdin stdout stderr EXIT_SUCCESS EXIT_FAILURE RAND_MAX'.split(' '));

export const modoC = StreamLanguage.define({
  name: 'c',
  startState: () => ({ comentario: false, directiva: false, nivel: 0 }),
  token(stream, estado) {
    if (stream.sol()) estado.directiva = false;
    if (estado.comentario) {
      if (stream.match(/^.*?\*\//)) estado.comentario = false;
      else stream.skipToEnd();
      return 'comment';
    }
    if (stream.eatSpace()) return null;
    if (stream.match('//')) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.match('/*')) {
      estado.comentario = !stream.match(/^.*?\*\//);
      if (estado.comentario) stream.skipToEnd();
      return 'comment';
    }
    if (stream.match(/^#\s*[a-z]+/)) {
      estado.directiva = true;
      return 'keyword';
    }
    if (estado.directiva && stream.match(/^<[^>\n]*>/)) return 'string';
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/) || stream.match(/^'(?:[^'\\]|\\.)*'?/)) return 'string';
    if (stream.match(/^(?:0x[\da-f]+|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[ulf]*/i)) return 'number';
    if (stream.match(/^[A-Za-z_]\w*/)) {
      const palabra = stream.current();
      if (CLAVES.has(palabra)) return 'keyword';
      if (TIPOS.has(palabra)) return 'typeName';
      if (VALORES.has(palabra)) return 'atom';
      return 'variableName';
    }
    const c = stream.next();
    if (c === '{') estado.nivel += 1;
    else if (c === '}') estado.nivel = Math.max(0, estado.nivel - 1);
    return null;
  },
  indent: (estado, despues, cx) => Math.max(0, estado.nivel - (/^\s*\}/.test(despues) ? 1 : 0)) * cx.unit,
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
    indentOnInput: /^\s*\}$/,
  },
});
