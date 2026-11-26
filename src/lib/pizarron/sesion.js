// The photos of the class not saved yet, in the memory of the tab: they stay while the student goes to Consultron or
// the Laboratorio and back, and go away with the tab, once saved, or with Salir (Layout.jsx). Never in the address,
// the history or the disk.

import { soltarFoto } from './fotos';

let fotos = [];
// The one open, to find it open on coming back.
let abierta = null;

export const fotosDeLaClase = () => fotos;
export const abiertaDeLaClase = () => (fotos.some((f) => f.id === abierta) ? abierta : null);

export function guardarFotosDeLaClase(lista, laAbierta = null) {
  fotos = lista;
  abierta = laAbierta;
}

/** Lets go of all of them: their pictures in memory and their copies in the worker. */
export function olvidarPizarron() {
  for (const f of fotos) {
    if (f.url) URL.revokeObjectURL(f.url);
    if (f.resultado) URL.revokeObjectURL(f.resultado.url);
    soltarFoto(f.id);
  }
  fotos = [];
  abierta = null;
}
