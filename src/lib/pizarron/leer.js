// A board photo read by Gemini, through Consultron's service (nube.js): with «Usar Gemini» on, one of the student's
// questions of the day per photo. The photo that goes is the board straightened and without cleaning, which Gemini reads
// better (tested on Ignacio's photos, 26/11/2026); nothing of it is kept on the way.

import { contestoGroq, porQueNoNube, preguntarNube } from '../consultron/nube';
import { PEDIDO_PIZARRON, SISTEMA_PIZARRON } from './lectura';

/**
 * Resolves with { texto } (what's written, in Markdown with LaTeX) or { error } (why not, to show). Groq, the
 * service's backup, doesn't see photos: its answer doesn't count.
 */
export async function leerConGemini(foto, { senal } = {}) {
  const mensajes = [
    { role: 'system', content: SISTEMA_PIZARRON },
    { role: 'user', content: PEDIDO_PIZARRON },
  ];
  const texto = await preguntarNube(mensajes, 'todo', { senal, fotos: [foto] });
  if (senal?.aborted) return { error: '' };
  if (texto && !contestoGroq()) return { texto: texto.trim() };
  return { error: texto ? 'Gemini no responde. Probá de nuevo en un rato.' : porQueNoNube() };
}
