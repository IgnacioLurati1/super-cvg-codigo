// Consultron's voice: an answer read aloud and a question dictated. Both only on the device: the reading with its own
// voices (lib/voz.js, `elegirVoz`), the dictation only where the browser recognizes speech on the device
// (`processLocally`). Where it can't, the button isn't there: the audio never goes to a server.
import { sinLatex, sinPensar } from './pedido.js';

/** An answer as it's said: without the source numbers, the marks of bold or code, the code blocks, and formulas as
 * text. */
export function textoParaDecir(texto) {
  return sinPensar(texto)
    .replace(/```[\s\S]*?(```|$)/g, 'Hay un bloque de código.')
    .replace(/\$\$([^$]+)\$\$|\$([^$\n]+)\$/g, (todo, a, b) => sinLatex(`$${a ?? b}$`))
    .replace(/[ \t]*\[\d{1,2}(?:\s*(?:,|y)\s*\d{1,2})*\]/g, '')
    .replace(/\*\*|`/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[-*•][ \t]+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const IDIOMA = 'es-AR';
const Reconocedor = () => (typeof window === 'undefined' ? null : (window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null));

/** Whether this browser can dictate on the device: 'listo', 'bajar' (it needs to download its language once) or null. */
export async function puedeDictar() {
  const R = Reconocedor();
  if (typeof R?.available !== 'function') return null;
  try {
    const r = await R.available({ langs: [IDIOMA], processLocally: true });
    if (r === 'available') return 'listo';
    if (r === 'downloadable' || r === 'downloading') return 'bajar';
  } catch {
    // A browser that can't say: as if it couldn't.
  }
  return null;
}

/**
 * Starts dictating, on the device. `alTexto(texto, final)`: what it heard so far. `alTerminar(error)`: when it stops.
 * Returns { parar } or null if it couldn't start.
 */
export async function dictar({ alTexto, alTerminar }) {
  const R = Reconocedor();
  const puede = await puedeDictar();
  if (!puede) return null;
  if (puede === 'bajar') {
    try {
      if (!(await R.install({ langs: [IDIOMA], processLocally: true }))) return null;
    } catch {
      return null;
    }
  }
  const r = new R();
  r.lang = IDIOMA;
  r.processLocally = true;
  r.interimResults = true;
  r.continuous = false;
  r.onresult = (e) => {
    const partes = [...e.results].map((x) => x[0]?.transcript ?? '');
    alTexto(partes.join('').trim(), e.results[e.results.length - 1]?.isFinal ?? false);
  };
  r.onerror = (e) => alTerminar(e.error === 'no-speech' || e.error === 'aborted' ? null : e.error);
  r.onend = () => alTerminar(null);
  try {
    r.start();
  } catch {
    return null;
  }
  return { parar: () => r.stop() };
}
