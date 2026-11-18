import { useEffect, useState } from 'react';
import { sinLatex } from '../../lib/consultron/pedido';

// A formula of an answer, drawn as math (MathML, which the browser draws with its own fonts: nothing else to download
// nor any style from outside). KaTeX comes only when an answer has one. While it comes, or if the LaTeX is broken, the
// formula reads as text.

let katex = null;
let cargado = null;
const cargarKatex = () =>
  (katex ??= import('katex').then((m) => {
    cargado = m.default;
    return cargado;
  }));
// Each formula is drawn once: while an answer is written its paragraphs render again with every word, and a formula
// that went back to text for a moment would change its height and move the page.
const dibujadas = new Map();
function deCache(latex, bloque) {
  const clave = `${bloque ? 'b' : 'l'}${latex}`;
  if (!dibujadas.has(clave) && cargado) {
    if (dibujadas.size > 500) dibujadas.clear();
    dibujadas.set(clave, dibujar(cargado, latex, bloque));
  }
  return dibujadas.get(clave);
}

/** The MathML of `latex`, or null if it can't be read. Commands that reach outside (\href, \url, \includegraphics)
 * are off with `trust: false`. */
export function dibujar(k, latex, bloque) {
  try {
    return k.renderToString(latex, { output: 'mathml', displayMode: bloque, throwOnError: true, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 200 });
  } catch {
    return null;
  }
}

export default function Formula({ latex, bloque = false }) {
  const [, setVez] = useState(0);
  const html = deCache(latex, bloque) ?? null;
  useEffect(() => {
    if (cargado) return undefined;
    let vivo = true;
    cargarKatex()
      .then(() => {
        if (vivo) setVez((v) => v + 1);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const Caja = bloque ? 'div' : 'span';
  if (!html) return <Caja className={`consultron__formula${bloque ? ' consultron__formula--bloque' : ''}`}>{sinLatex(latex)}</Caja>;
  // KaTeX writes the MathML from the LaTeX and escapes its text: nothing of the answer goes in as HTML.
  return <Caja className={`consultron__formula${bloque ? ' consultron__formula--bloque' : ''}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
