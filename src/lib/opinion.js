// «Opinar»: a text for Luta Studios, sent to the same function of its panel that counts the visits (visita.js). It
// sends only {"tipo":"opinion","texto":"..."}: no account, nothing of the campus, no cookies and no id. The panel keeps
// the text and the day, and drops it after a year.
import { SITIO } from '../../sitio.config.js';
import { CONTADOR } from './visita';

export const MAX_OPINION = 2000;

// The text as the panel keeps it (supercvg/reglas.ts, limpiarTexto): one kind of line break, no control characters
// and no spaces around. Counted the same way too, by characters, so an emoji is one.
export const limpiarOpinion = (texto) =>
  String(texto ?? '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim();
export const largoOpinion = (texto) => [...limpiarOpinion(texto)].length;

// Why it did not go, in the words of the form. `vacio` and `largo` go next to the field.
export const MOTIVOS = {
  vacio: 'Escribí tu opinión antes de mandarla.',
  largo: 'Es muy larga para mandarla. Acortala un poco.',
  seguido: 'Mandaste varias seguidas. Esperá unos minutos y probá de nuevo.',
  tope: 'Hoy llegaron muchas opiniones. Probá de nuevo mañana.',
  pausado: 'Ahora no estamos recibiendo opiniones. Probá de nuevo en un rato.',
  red: 'No se pudo conectar. Revisá tu internet y probá de nuevo.',
  error: 'No se pudo mandar. Probá de nuevo en un rato.',
};
const CONOCIDOS = new Set(['vacio', 'largo', 'seguido', 'tope', 'pausado']);

// Only the published site sends it. Anywhere else (npm run dev, a local preview) the answer is made up, so no test
// opinion ever reaches the panel; the browser tests (mode flujos) send it to a request they answer themselves.
const deVerdad = (origen) => origen === SITIO.url || import.meta.env.MODE === 'flujos';
const simulada = () => new Promise((ok) => setTimeout(() => ok(new Response('{"ok":true}', { status: 200 })), 400));

/** Sends the opinion. Resolves { ok: true } or { ok: false, motivo }, with `motivo` a key of MOTIVOS. Never throws. */
export async function mandarOpinion(texto, { origen = window.location.origin, pedir = window.fetch.bind(window) } = {}) {
  const limpio = limpiarOpinion(texto);
  if (!limpio) return { ok: false, motivo: 'vacio' };
  if ([...limpio].length > MAX_OPINION) return { ok: false, motivo: 'largo' };
  let respuesta;
  try {
    // A text body keeps it a simple request: no preflight.
    const op = { method: 'POST', body: JSON.stringify({ tipo: 'opinion', texto: limpio }), credentials: 'omit', referrerPolicy: 'no-referrer' };
    respuesta = await (deVerdad(origen) ? pedir(CONTADOR, op) : simulada());
  } catch {
    return { ok: false, motivo: 'red' };
  }
  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Not the panel's answer.
  }
  if (respuesta.ok && cuerpo?.ok === true) return { ok: true };
  const motivo = typeof cuerpo?.motivo === 'string' && CONOCIDOS.has(cuerpo.motivo) ? cuerpo.motivo : 'error';
  return { ok: false, motivo };
}
