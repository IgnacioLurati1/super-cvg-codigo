// Which language a piece of code is in, by what only that language writes. Each sign adds its points; the language
// with the most wins, and under PISO it isn't code. The lab runs Python, SQL, C and JavaScript: C++ and Prolog are told apart so the
// screen can say they don't run yet, instead of opening them as Python.
const ITEM_SQL = String.raw`[\w.()*]+(?:\s+as\s+\w+)?`;
const SENALES = {
  sql: [
    [new RegExp(String.raw`\bselect\s+(?:distinct\s+)?${ITEM_SQL}(?:\s*,\s*${ITEM_SQL})*\s+from\s+\w+`, 'i'), 4],
    [/\b(?:insert\s+into|delete\s+from|create\s+(?:table|view|index|trigger)|alter\s+table|drop\s+(?:table|view))\s+\w+/i, 4],
    [/\bupdate\s+\w+\s+set\s+\w+\s*=/i, 4],
    [/\b(?:inner|left|right|full)\s+(?:outer\s+)?join\b|\bjoin\s+\w+(?:\s+\w+)?\s+on\b/i, 2],
    [/\b(?:group|order)\s+by\b|\bhaving\b/i, 1.5],
    [/\b(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|VALUES|JOIN)\b/, 1],
  ],
  python: [
    [/^\s*def\s+\w+\s*\([^)]*\)\s*(?:->\s*[\w[\], .]+)?:/m, 4],
    [/^\s*class\s+\w+(?:\([^)]*\))?\s*:/m, 3],
    [/^\s*(?:if|elif|else|for|while|try|except|finally|with)\b[^\n;{}]*:\s*(?:#.*)?$/m, 2.5],
    [/\bprint\s*\(/, 2],
    [/\binput\s*\(/, 2],
    [/\bin\s+range\s*\(/, 2],
    [/^\s*(?:import\s+\w+|from\s+[\w.]+\s+import\b)/m, 2],
    [/\b(?:elif|None|True|False|self|lambda|len\()\b/, 1],
    [/^\s*#(?!include)/m, 0.5],
  ],
  c: [
    [/#include\s*[<"]/, 4],
    [/\bint\s+main\s*\(/, 3],
    [/\b(?:printf|scanf|malloc|free)\s*\(/, 2.5],
    [/\b(?:int|float|double|char|void|long)\s+\**\w+\s*[=;([]/, 1.5],
    [/\bstruct\s+\w+\s*[{*]|\w->\w/, 1.5],
    [/\b(?:for|while|if)\s*\([^)\n]*\)\s*\{/, 1],
    [/;\s*$/m, 0.5],
  ],
  javascript: [
    [/\bconsole\.(?:log|error|table)\s*\(/, 4],
    [/\bfunction\s*\*?\s*\w*\s*\([^)]*\)\s*\{/, 3],
    [/^\s*(?:export\s+(?:default|const|let|function|class)\b|import\s+(?:\w+|\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+['"])/m, 3],
    [/\brequire\s*\(\s*['"]/, 3],
    [/\b(?:const|let)\s+(?:\w+|\{[^}]*\}|\[[^\]]*\])\s*=/, 2],
    [/=>/, 2],
    [/===|!==/, 2],
    [/\b(?:document|window)\.\w+/, 2],
    [/\bnew\s+(?:Date|Map|Set|Promise|Array)\s*\(/, 1.5],
    [/\b(?:prompt|alert)\s*\(/, 1.5],
    [/\bvar\s+\w+\s*=/, 1],
    [/\.(?:push|forEach|filter|reduce|length|toUpperCase)\b/, 1],
    [/\b(?:undefined|typeof)\b/, 0.5],
  ],
  cpp: [
    [/#include\s*<(?:iostream|vector|string|map|algorithm)>/, 5],
    [/\bstd::|\bcout\s*<<|\bcin\s*>>/, 4],
    [/\busing\s+namespace\s+std\b/, 4],
    [/\b(?:class|template|public:|private:)\b/, 1],
  ],
  prolog: [
    [/^\s*[a-z]\w*(?:\([^()]*\))?\s*:-/m, 4],
    [/\?-\s*\w/, 3],
    [/^\s*[a-z]\w*\([^()]*\)\s*\.\s*$/m, 2],
    [/\b(?:is|write|nl|findall|member|append)\b/, 0.5],
  ],
};

// Under this, it doesn't look like code.
const PISO = 2;

/** { lenguaje, puntos }: the language with most points (python, sql, c, javascript, cpp or prolog), or null if nothing looks like code. */
export function adivinarLenguaje(texto) {
  const t = String(texto ?? '');
  const puntos = Object.fromEntries(Object.entries(SENALES).map(([l, senales]) => [l, senales.reduce((n, [re, p]) => n + (re.test(t) ? p : 0), 0)]));
  // C++ also writes C.
  if (puntos.cpp > 0) puntos.cpp += puntos.c;
  let mejor = null;
  for (const [l, p] of Object.entries(puntos)) if (p >= PISO && (!mejor || p > puntos[mejor])) mejor = l;
  return { lenguaje: mejor, puntos: mejor ? puntos[mejor] : 0 };
}

export const pareceCodigo = (texto) => adivinarLenguaje(texto).lenguaje !== null;

export const NOMBRES_DE_LENGUAJE = { python: 'Python', sql: 'SQL', c: 'C', javascript: 'JavaScript', cpp: 'C++', prolog: 'Prolog' };
