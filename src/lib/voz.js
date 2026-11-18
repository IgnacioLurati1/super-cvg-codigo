// Reading a PDF aloud (lector/Voz.jsx): what is pure about it. Only with the device's own voices (`localService`):
// the others, like Chrome's «Google» ones, send the text to a server, and the text of a PDF never leaves the device.

/** The speeds offered, in order: the button goes through them and back to the first. */
export const VELOCIDADES = [0.75, 1, 1.25, 1.5, 1.75, 2];
export const VELOCIDAD_INICIAL = 1;

/** A speed that came from anywhere (cl.ajustes): the closest of the offered ones, or the usual one. */
export function normalizarVelocidad(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return VELOCIDAD_INICIAL;
  return VELOCIDADES.reduce((mejor, paso) => (Math.abs(paso - v) < Math.abs(mejor - v) ? paso : mejor));
}

export const siguienteVelocidad = (v) => VELOCIDADES[(VELOCIDADES.indexOf(normalizarVelocidad(v)) + 1) % VELOCIDADES.length];

/** «1,25×», as the button shows it. */
export const textoVelocidad = (v) => `${String(normalizarVelocidad(v)).replace('.', ',')}×`;

const idioma = (v) => v.lang.replace(/_/g, '-').toLowerCase();
// Rioplatense first, then the rest of Latin America, Spain last: it sounds the least like the student.
const RIOPLATENSE = ['es-uy', 'es-py'];
const puesto = (lang) => (lang === 'es-ar' ? 0 : RIOPLATENSE.includes(lang) ? 1 : lang === 'es-es' ? 3 : 2);

/** The voice to read with: a local one in Spanish, Argentina's first. Null when the device has none: then nothing is
 * read, because without a voice the browser could take a remote one. */
export function elegirVoz(voces) {
  const propias = (voces ?? []).filter((v) => v?.localService === true && typeof v.lang === 'string' && /^es(-|$)/.test(idioma(v)));
  if (!propias.length) return null;
  const orden = (v) => puesto(idioma(v)) * 2 + (v.default ? 0 : 1);
  return propias.reduce((mejor, v) => (orden(v) < orden(mejor) ? v : mejor));
}

/** The longest piece said at once: Chrome cuts long texts, and a short piece pauses and changes speed sooner. */
export const TRAMO_MAX = 200;
// A line this short, without a period and with a capital after it, is a title: it is read apart and not run into the
// next sentence.
const RENGLON_TITULO = 60;
const FIN_DE_ORACION = /[.!?…:;,]["»”’)\]]*$/u;
const EMPIEZA_ALGO = /^[\p{Lu}\p{N}•▪◦●■\-–—]/u;

// Pieces of a sentence longer than `max`: at a semicolon or a colon, then at a comma, then between words.
function trozar(oracion, max) {
  const partes = [];
  let resto = oracion;
  while (resto.length > max) {
    const ventana = resto.slice(0, max + 1);
    const minimo = Math.floor(max * 0.4);
    let corte = Math.max(ventana.lastIndexOf('; '), ventana.lastIndexOf(': '));
    if (corte < minimo) corte = ventana.lastIndexOf(', ');
    if (corte < minimo) corte = ventana.lastIndexOf(' ');
    corte = corte <= 0 ? max : corte + 1;
    partes.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) partes.push(resto);
  return partes;
}

/** The text of a page or a selection, in the pieces it's read in: by sentence, and the long ones cut where they pause.
 * Words split at the end of a line come back together, and a title is its own piece. */
export function partirTexto(texto, max = TRAMO_MAX) {
  const renglones = String(texto ?? '')
    .replace(/(\p{L})[-­]\s*\n\s*(\p{Ll})/gu, '$1$2')
    .split(/\n/)
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const bloques = [];
  let bloque = '';
  renglones.forEach((r, i) => {
    bloque = bloque ? `${bloque} ${r}` : r;
    const siguiente = renglones[i + 1];
    const titulo = siguiente && r.length <= RENGLON_TITULO && !FIN_DE_ORACION.test(r) && EMPIEZA_ALGO.test(siguiente);
    if (!siguiente || titulo) {
      bloques.push(bloque);
      bloque = '';
    }
  });
  return bloques
    .flatMap((b) => b.split(/(?<=[.!?…]["»”’)\]]*)\s+/u))
    .map((o) => o.trim())
    .filter((o) => /[\p{L}\p{N}]/u.test(o))
    .flatMap((o) => trozar(o, max));
}

/** Reads aloud, one piece at a time, what `siguiente` hands out: `{ pagina, tramos }` each time, or null at the end.
 * Pausing stops the voice and keeps the place: going on says that piece again from its start (Chrome on Android can't
 * pause in the middle). `alCambiar({ estado, pagina })`: 'leyendo', 'pausa', or null when it was stopped, with
 * `terminada` when it got to the end and `error` if the voice failed. `decir(texto, velocidad)` makes the utterance, with the voice already on it. */
export function crearLectura({ synth, decir, velocidad = VELOCIDAD_INICIAL, siguiente, alCambiar = () => {}, demora = 50 }) {
  // Each start, pause, speed change or stop is a new `vez`: what an older one left pending does nothing.
  let vez = 0;
  let estado = null;
  let bloque = null;
  let indice = 0;
  let fin = false;
  let pedido = null;
  let actual = null;
  let rapidez = normalizarVelocidad(velocidad);
  let espera = null;

  const avisar = (extra = {}) => alCambiar({ estado, pagina: bloque?.pagina ?? null, ...extra });

  const callar = () => {
    vez++;
    clearTimeout(espera);
    actual = null;
    synth.cancel();
  };

  const terminar = (extra) => {
    callar();
    estado = null;
    avisar(extra);
  };

  // The next block, asked once even if a pause and a «seguir» wait for it: none is skipped.
  const traer = () => {
    pedido ??= (async () => {
      let otro = null;
      try {
        otro = await siguiente();
      } catch {
        otro = null;
      }
      pedido = null;
      if (otro) {
        bloque = otro;
        indice = 0;
      } else fin = true;
      return otro;
    })();
    return pedido;
  };

  async function avanzar(miVez) {
    while (!bloque || indice >= bloque.tramos.length) {
      if (fin) {
        if (miVez === vez) terminar({ terminada: true });
        return;
      }
      const otro = await traer();
      if (miVez !== vez) return;
      if (otro?.tramos.length) avisar();
    }
    hablar(miVez);
  }

  function hablar(miVez) {
    let dicho;
    try {
      dicho = decir(bloque.tramos[indice], rapidez);
    } catch {
      // Without its voice on it, it is not said: the browser would choose one, maybe a remote one.
      terminar({ error: 'voz' });
      return;
    }
    // Held until it ends: Chrome drops the events of an utterance nobody holds.
    actual = dicho;
    dicho.onend = () => {
      if (miVez !== vez || actual !== dicho) return;
      indice++;
      avanzar(miVez);
    };
    dicho.onerror = (e) => {
      if (miVez !== vez || actual !== dicho) return;
      // Cut by something else (another tab, a call): it waits, paused, where it was.
      if (e?.error === 'interrupted' || e?.error === 'canceled') {
        vez++;
        actual = null;
        estado = 'pausa';
        avisar();
        return;
      }
      terminar({ error: e?.error ?? 'error' });
    };
    synth.speak(dicho);
  }

  // After a cancel, Safari and some Chromes drop a speak that comes right away.
  const retomar = () => {
    callar();
    const miVez = vez;
    espera = setTimeout(() => {
      if (miVez === vez && estado === 'leyendo') avanzar(miVez);
    }, demora);
  };

  return {
    empezar() {
      if (estado !== null) return;
      estado = 'leyendo';
      avisar();
      callar();
      avanzar(vez);
    },
    pausar() {
      if (estado !== 'leyendo') return;
      callar();
      estado = 'pausa';
      avisar();
    },
    seguir() {
      if (estado !== 'pausa') return;
      estado = 'leyendo';
      avisar();
      retomar();
    },
    parar() {
      if (estado !== null) terminar();
    },
    /** The new speed starts with the piece being said, said again from its start. */
    velocidad(v) {
      rapidez = normalizarVelocidad(v);
      if (estado === 'leyendo') retomar();
    },
    get estado() {
      return estado;
    },
  };
}

/** The device's voices. Chrome hands them out a moment after the first ask, with `voiceschanged`: it waits that long,
 * and no more than `ms`. */
export function cargarVoces(synth, ms = 1500) {
  const ya = synth.getVoices();
  if (ya.length) return Promise.resolve(ya);
  return new Promise((listo) => {
    const fin = () => {
      clearTimeout(reloj);
      synth.removeEventListener?.('voiceschanged', fin);
      listo(synth.getVoices());
    };
    const reloj = setTimeout(fin, ms);
    synth.addEventListener?.('voiceschanged', fin);
  });
}
