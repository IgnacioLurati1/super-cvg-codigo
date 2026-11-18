import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { tokenActual } from '../sesion';

// What the student typed in each calculator, kept while the tab is open: going to another screen and coming back finds
// it as it was. Only in memory, never on disk nor in the address. Another session starts clean.
const memoria = new Map();
// What Consultron left for a calculator: only some fields, joined with the calculator's own start when it opens.
const deAfuera = new Set();
let deQuien = null;

function delDueno() {
  const actual = tokenActual();
  if (actual !== deQuien) {
    memoria.clear();
    deAfuera.clear();
    deQuien = actual;
  }
  return memoria;
}

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const recordado = (clave, inicial) => {
  const m = delDueno();
  if (!m.has(clave)) return inicial;
  if (!deAfuera.has(clave)) return m.get(clave);
  deAfuera.delete(clave);
  const parte = m.get(clave);
  const junto = esObjeto(inicial) && esObjeto(parte) ? { ...inicial, nombre: undefined, ...parte } : parte;
  m.set(clave, junto);
  return junto;
};

export const recordar = (clave, valor) => {
  delDueno().set(clave, valor);
};

/** Consultron's data for a calculator (`calc:<slug>`): what the student had there is replaced, and the fields not
 * given come from the calculator's start. */
export const dejarDatos = (clave, parte) => {
  delDueno().set(clave, parte);
  deAfuera.add(clave);
};

// One of the calculator's own examples that Consultron proposed («Probá con»): the calculator fills it as it opens, if
// it opens soon.
const VIGENCIA_MS = 30_000;
let ejemploPedido = null;

/** Consultron's example for a calculator: `nombre` is one of its «Probá con». */
export const dejarEjemplo = (nombre) => {
  ejemploPedido = { nombre, cuando: Date.now() };
};

/** The example asked for, if it's in `ejemplos` (once). */
export function tomarEjemplo(ejemplos) {
  if (!ejemploPedido || Date.now() - ejemploPedido.cuando > VIGENCIA_MS) return null;
  const e = ejemplos.find((x) => x.nombre === ejemploPedido.nombre) ?? null;
  if (e) ejemploPedido = null;
  return e;
}

// A calculator open in a live session's table keeps what's typed there, shared with the others, instead of here
// (enVivo/calculadoraCompartida.js): { leer(clave, inicial), escribir(clave, valor | fn, inicial), suscribir(fn) }.
const Compartida = createContext(null);
export const MemoriaCompartida = Compartida.Provider;
const sinOyentes = () => () => {};
const nada = () => undefined;

/** Like useState, but what's left survives leaving the screen. Inside a MemoriaCompartida, it's the table's. */
export function useRecordado(clave, inicial) {
  const mesa = useContext(Compartida);
  const [valor, setValor] = useState(() => (mesa ? inicial : recordado(clave, inicial)));
  useEffect(() => {
    if (!mesa) recordar(clave, valor);
  }, [mesa, clave, valor]);
  const leer = useCallback(() => mesa?.leer(clave, inicial), [mesa, clave, inicial]);
  const deLaMesa = useSyncExternalStore(mesa ? mesa.suscribir : sinOyentes, mesa ? leer : nada, mesa ? leer : nada);
  const escribir = useCallback((v) => mesa?.escribir(clave, v, inicial), [mesa, clave, inicial]);
  return mesa ? [deLaMesa, escribir] : [valor, setValor];
}
