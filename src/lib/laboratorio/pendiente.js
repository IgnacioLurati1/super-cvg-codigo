// What the lab has on screen and isn't saved yet: the code that came from a PDF and the student's draft. Only in the
// memory of the tab (it may be campus material), never in the address or the history: it stays while the student goes
// to another screen and back, and goes away with the tab, with Salir or once it's saved as theirs.
import { LENGUAJES } from './lenguajes';

let desdePdf = null;
let mesa = null;
// What else goes with them (the engines, motor.js, with what the code left in them).
const tambien = new Set();
export const alOlvidarLaboratorio = (f) => tambien.add(f);

/** From the reader: the selected code, its language and where it came from ({ materia, apunte, pagina }). */
export function llevarAlLaboratorio({ codigo, lenguaje, adivinado, materia = null, apunte = '', pagina = null }) {
  desdePdf = { codigo: String(codigo), lenguaje, adivinado: adivinado ?? lenguaje, materia, apunte: String(apunte).slice(0, 200), pagina };
}

/** What came from a PDF, once. */
export function tomarDelPdf() {
  const p = desdePdf;
  desdePdf = null;
  return p;
}

/** If the draft (`m`, the one in memory if none) has something the student wrote, which would be lost replacing it. */
export function borradorEscrito(m = mesa?.mesa) {
  return Boolean(m?.tocada && m.codigo?.trim() && m.codigo !== LENGUAJES[m.lenguaje]?.ejemplo);
}

export const mesaGuardada = () => mesa;
export const guardarMesa = (m) => {
  mesa = m;
};

/** Leaving (or another student coming in) drops it all. */
export function olvidarLaboratorio() {
  desdePdf = null;
  mesa = null;
  tambien.forEach((f) => f());
}
