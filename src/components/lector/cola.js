// The drawings of the pages, one at a time and the closest to the view first: after a zoom the pages in view are sharp
// before the ones above and below start, and a phone never draws several big pages at once.

/** `distancia(numero)`: how far a page is from the view, 0 when it is in it (also given later, with `medirCon`). Each
 * drawing is `correr()`, a promise; `pedir` gives back a function that takes it out of the line if it hasn't started.
 * `extra` goes after the pages at the same distance (the detail of a page, after the whole drawings of the pages in
 * view). */
export function crearCola(distancia = () => 0) {
  const pendientes = new Set();
  let ocupada = false;
  let programada = false;

  const siguiente = () => {
    programada = false;
    if (ocupada || !pendientes.size) return;
    let elegida = null;
    let menor = Infinity;
    for (const p of pendientes) {
      const d = distancia(p.numero) + p.extra;
      if (d < menor) {
        menor = d;
        elegida = p;
      }
    }
    pendientes.delete(elegida);
    ocupada = true;
    Promise.resolve()
      .then(elegida.correr)
      .catch(() => {})
      .finally(() => {
        ocupada = false;
        programar();
      });
  };
  // A turn of the browser between drawings: the scroll and the fingers go in between.
  const programar = () => {
    if (programada || ocupada || !pendientes.size) return;
    programada = true;
    setTimeout(siguiente, 0);
  };

  return {
    pedir(numero, correr, extra = 0) {
      const p = { numero, correr, extra };
      pendientes.add(p);
      programar();
      return () => pendientes.delete(p);
    },
    medirCon(nueva) {
      distancia = nueva;
    },
    get pendientes() {
      return pendientes.size;
    },
  };
}
