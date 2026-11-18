// The pace of the model on the video card, so that the screen is never left without its turn. A slow answer is fine; a
// computer that lags is not.
//
// Before its first word the model reads the question. web-llm gives it to the video card in pieces of 1024 tokens: each
// one keeps the card busy for seconds with nothing in between, and meanwhile the screen is drawn in fits. In small
// pieces, waiting for the card to finish each one and with a breath after it, the card always has a moment for the
// screen. It takes longer to start answering; the answer is the same.
//
// The size of the piece changes which programs the model asks the video card for: the list that goes with the site
// (placa.js) has those of every size up to this one. With a bigger one, the list is made again (vite.config.js, at
// `CONSULTRON`).

/** Tokens the video card reads in one go. */
export const TROZO = 64;
const RESPIRO_MS = 15;
const RESPIRO_MAX_MS = 300;
// Of what the work took: on a slow video card the breath grows with it.
const PARTE = 0.2;

/** The breath after a piece of work on the video card that took `ms`. */
export const respiroTras = (ms) => Math.min(RESPIRO_MAX_MS, Math.max(RESPIRO_MS, Math.round((Number(ms) || 0) * PARTE)));

/**
 * `tubo`: web-llm's pipeline of the loaded model. Returns whether it could: another version of web-llm may not have
 * what this leans on, and then it reads as it always did.
 */
export function repartirLectura(tubo, { trozo = TROZO, esperar = (ms) => new Promise((listo) => setTimeout(listo, ms)), ahora = () => performance.now() } = {}) {
  if (typeof tubo?.embedAndForward !== 'function' || typeof tubo.device?.sync !== 'function' || !(tubo.prefillChunkSize > trozo)) return false;
  const leer = tubo.embedAndForward.bind(tubo);
  tubo.prefillChunkSize = trozo;
  tubo.embedAndForward = async (...a) => {
    const desde = ahora();
    const salida = await leer(...a);
    // What was asked is only queued: the breath starts when the card is done with it.
    await tubo.device.sync();
    await esperar(respiroTras(ahora() - desde));
    return salida;
  };
  return true;
}
