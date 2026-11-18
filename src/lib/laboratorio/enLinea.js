import { partirError } from './error';

// What the last run said, line by line, for the editor (as Error Lens): the error with its short message, and in C each
// warning of the compiler in its own line. Everything comes from what the console already shows: the engines aren't
// asked anything new.

// How long a message goes at the end of a line: the rest is in the console.
export const TOPE_EN_LINEA = 120;
// As cMensajes.js writes each warning: «Aviso en la línea 4. …», or «Aviso en lista.c, línea 4. …» in a project.
const AVISO_DE_C = /^Aviso en (?:(.+?), línea|la línea) (\d+)\. (.+)$/gm;

const recortar = (texto) => {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > TOPE_EN_LINEA ? `${t.slice(0, TOPE_EN_LINEA - 1).trimEnd()}…` : t;
};

/** The first line of what happened (partirError), without where: what goes at the end of the line. */
export const resumenDelError = (texto) => recortar(partirError(texto).que.split('\n').find((l) => l.trim()) ?? '');

/**
 * The marks of the file open in the editor (`abierto`, its name as the engine says it): [{ linea, tono, texto }].
 * `error`: { linea, archivo } of the last run (Laboratorio.jsx), `piezas`: what the console has. A warning that doesn't
 * name its file is of `principal`, the one that ran.
 */
export function marcasDelIntento({ error, piezas = [], lenguaje, abierto, principal }) {
  const marcas = [];
  if (error?.linea > 0 && (error.archivo ?? principal) === abierto) {
    const pieza = piezas.findLast((p) => p.tipo === 'error' && p.linea === error.linea);
    marcas.push({ linea: error.linea, tono: 'error', texto: pieza ? resumenDelError(pieza.texto) : '' });
  }
  if (lenguaje !== 'c') return marcas;
  for (const p of piezas) {
    if (p.tipo !== 'salida' || p.flujo !== 'err') continue;
    for (const [, archivo, linea, texto] of String(p.texto).matchAll(AVISO_DE_C)) {
      if ((archivo ?? principal) === abierto) marcas.push({ linea: Number(linea), tono: 'aviso', texto: recortar(texto) });
    }
  }
  return marcas;
}
