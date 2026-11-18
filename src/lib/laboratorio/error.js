// An error as the engine says it, in two parts: where it happened (the frames, the line of code and the ^ under it,
// kept as they are so the marks point at their place) and what happened (the last lines, not indented), which is what
// the student reads first. SQLite only says the second.
export function partirError(texto) {
  const lineas = String(texto ?? '').replace(/\n+$/, '').split('\n');
  let corte = -1;
  lineas.forEach((l, i) => {
    if (/^\s/.test(l)) corte = i;
  });
  return { donde: lineas.slice(0, corte + 1).join('\n'), que: lineas.slice(corte + 1).join('\n') };
}

/** What a translation says, with what the engine said under it so it can be looked up: «Mensaje original: …». */
export const conOriginal = (dicho, original) => `${dicho}\nMensaje original: ${original}`;

/** The first line of what happened, without where it happened or the original under it: what a step or a case says. */
export const queDice = (texto) => partirError(texto).que.split('\n').find((l) => l.trim() && !l.startsWith('Mensaje original: ')) ?? '';
