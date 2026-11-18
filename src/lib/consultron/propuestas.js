// What Consultron in «Código» proposes to change in the lab, file by file, until the student applies or discards it.
// With «Aplicar solo» on, it's applied as it comes. What was applied in the last pedido can be undone in one go.
// Each project or file alone keeps its own, only in the memory of the tab: going to another and coming back finds them
// again. A pedido still going when the student leaves puts what it proposes in the place it was asked from.
import { useSyncExternalStore } from 'react';

const TOPE_LUGARES = 20;
const NADA = { archivos: [], hecho: [] };
// By place (ide.donde), the last touched at the end; the ones with nothing aren't kept. archivos: [{ nombre, despues,
// nuevo }]. hecho: what the last pedido there applied, [{ nombre, antes }] (antes null: it made it).
const lugares = new Map();
// The place in view, with what it has: what the screen shows.
let estado = { donde: null, ...NADA };
const avisados = new Set();
const avisar = () => {
  for (const f of avisados) f();
};
const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

const de = (donde) => lugares.get(donde) ?? NADA;

// The place in view, again from what it has now.
function mirar() {
  const { archivos, hecho } = de(estado.donde);
  if (archivos === estado.archivos && hecho === estado.hecho) return;
  estado = { donde: estado.donde, archivos, hecho };
  avisar();
}

function guardar(donde, cambio) {
  const nuevo = { ...de(donde), ...cambio };
  lugares.delete(donde);
  if (nuevo.archivos.length || nuevo.hecho.length) lugares.set(donde, nuevo);
  for (const d of lugares.keys()) {
    if (lugares.size <= TOPE_LUGARES) break;
    if (d !== estado.donde) lugares.delete(d);
  }
  // Before any place is in view, the first that has something is.
  if (estado.donde === null) estado = { ...estado, donde };
  mirar();
}

export const suscribirPropuestas = suscribir;
export const usePropuestas = () => useSyncExternalStore(suscribir, () => estado, () => estado);
/** What the place in view has, or `donde`. */
export const propuestasAhora = (donde = estado.donde) => (donde === estado.donde ? estado : { donde, ...de(donde) });
/** Whether some place has something: the editor is watched to show it on coming back. */
export const hayEnAlgunLugar = () => lugares.size > 0;

/** The place of the lab in view: what the screen shows is its. */
export function alLugar(donde) {
  if (estado.donde === donde) return;
  const e = lugares.get(donde);
  if (e) {
    lugares.delete(donde);
    lugares.set(donde, e);
  }
  estado = { donde, ...(e ?? NADA) };
  avisar();
}

/** A place that isn't anymore (its file or project was deleted): what it had goes. */
export function olvidarLugar(donde) {
  lugares.delete(donde);
  mirar();
}

/** A new pedido in `donde`: what is applied there from now on is what «Deshacer» undoes. */
export const empezarPedido = (donde = estado.donde) => guardar(donde, { hecho: [] });

/** What the file has for the agent: the proposal if there is one, else what the lab has. undefined if it isn't there. */
export function contenidoPara(ide, nombre) {
  const p = de(ide.donde).archivos.find((a) => a.nombre === nombre);
  if (p) return p.despues;
  return ide.archivos().find((a) => a.nombre === nombre)?.contenido;
}

/** The files as the agent sees them: the lab's with the proposals on top, and the new ones. */
export function archivosPara(ide) {
  const propios = ide.archivos().map((a) => ({ nombre: a.nombre, contenido: contenidoPara(ide, a.nombre) }));
  const nuevos = de(ide.donde).archivos.filter((p) => p.nuevo && !propios.some((a) => a.nombre === p.nombre)).map((p) => ({ nombre: p.nombre, contenido: p.despues }));
  return [...propios, ...nuevos];
}

function escribir(ide, p) {
  const actual = ide.archivos().find((a) => a.nombre === p.nombre);
  if (!actual) return ide.crear(p.nombre, p.despues) ? { nombre: p.nombre, antes: null } : null;
  return ide.escribir(p.nombre, p.despues) ? { nombre: p.nombre, antes: actual.contenido } : null;
}

const sumarHecho = (hecho, h) => [...hecho.filter((x) => x.nombre !== h.nombre), hecho.find((x) => x.nombre === h.nombre) ?? h];

/** Proposes `despues` for the file `nombre` (`nuevo`: one to make), in the place of `ide`. With `solo`, it's applied now.
 * Returns 'aplicado', 'propuesto' or null if it couldn't be applied. */
export function proponer(ide, nombre, despues, { nuevo = false, solo = false } = {}) {
  const { archivos, hecho } = de(ide.donde);
  if (solo) {
    const h = escribir(ide, { nombre, despues });
    if (!h) return null;
    guardar(ide.donde, { archivos: archivos.filter((a) => a.nombre !== nombre), hecho: sumarHecho(hecho, h) });
    return 'aplicado';
  }
  const antes = archivos.find((a) => a.nombre === nombre);
  guardar(ide.donde, { archivos: [...archivos.filter((a) => a.nombre !== nombre), { nombre, despues, nuevo: antes?.nuevo ?? nuevo }] });
  return 'propuesto';
}

/** Applies the proposal of one file of the place of `ide`. False if the lab didn't take it. */
export function aplicar(ide, nombre) {
  const { archivos, hecho } = de(ide.donde);
  const p = archivos.find((a) => a.nombre === nombre);
  if (!p) return false;
  const h = escribir(ide, p);
  if (!h) return false;
  guardar(ide.donde, { archivos: archivos.filter((a) => a.nombre !== nombre), hecho: sumarHecho(hecho, h) });
  return true;
}

export const descartar = (nombre, donde = estado.donde) => guardar(donde, { archivos: de(donde).archivos.filter((a) => a.nombre !== nombre) });

/** Applies them all. Returns the names that couldn't be. */
export const aplicarTodo = (ide) => de(ide.donde).archivos.map((p) => p.nombre).filter((n) => !aplicar(ide, n));

export const descartarTodo = (donde = estado.donde) => guardar(donde, { archivos: [] });

/** Takes back what the last pedido in the place of `ide` applied. */
export function deshacer(ide) {
  for (const h of [...de(ide.donde).hecho].reverse()) {
    if (h.antes === null) ide.borrar(h.nombre);
    else ide.escribir(h.nombre, h.antes);
  }
  guardar(ide.donde, { hecho: [] });
}
