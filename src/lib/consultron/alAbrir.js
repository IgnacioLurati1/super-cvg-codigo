// Whether Consultron loads as soon as Super CVG opens, on this computer. Written after its first download (motor.js):
// «listo» loads it in the background, «a-mano» only on its screen, and nothing means it isn't here. Only that word:
// nothing of the campus. Small on purpose: the layout reads it on every visit without bringing the rest of Consultron.
const CLAVE = 'cl.consultron';

export function leerAlAbrir() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function anotarAlAbrir(valor) {
  try {
    if (valor) localStorage.setItem(CLAVE, valor);
    else localStorage.removeItem(CLAVE);
  } catch {
    // Without storage it only loads on its screen.
  }
}
