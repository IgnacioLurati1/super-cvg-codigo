import * as Y from 'yjs';
import { derEnTexto, derVacio, sanearDer } from '../laboratorio/der/modelo';
import { MAX_CODIGO } from '../laboratorio/saneo';

// A `.der` of a live session's Laboratorio (laboratorioCompartido.js), shared by element: the file's `der` is a Y.Map
// with one key per thing of the diagram, so two people working on different things at once both keep what they did,
// and on the same thing the last change stays.
//   e:<id> v:<id> j:<id> g:<id>   { o, e }: an entity, vínculo, hierarchy or aggregation as the `.der` keeps it (`e`),
//                                 and its place in the file (`o`, the order they were made in)
//   d:cp:<vínculo>                the columns of its CP
//   d:lado11:<vínculo>            the side of a 1:1
//   d:tipos:<tabla.columna>       a column's SQL type
// It comes from the others: read back through `sanearDer` and cut to the size of a file of the Laboratorio.

const COLECCIONES = [
  ['e', 'entidades'],
  ['v', 'vinculos'],
  ['j', 'jerarquias'],
  ['g', 'agregaciones'],
];
const DECISIONES = ['cp', 'lado11', 'tipos'];
// Far above what a file of the Laboratorio holds: a crafted map doesn't hang the page.
const MAX_CLAVES = 6000;

const CLAVE_ELEMENTO = /^([evjg]):([A-Za-z0-9_-]{1,40})$/;
const CLAVE_DECISION = /^d:(cp|lado11|tipos):([\s\S]{1,200})$/;
const esObjeto = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** The keys and values of a clean DER, as the shared map keeps them (`o`: the order). */
function entradas(der) {
  const fuera = new Map();
  let o = 0;
  for (const [letra, coleccion] of COLECCIONES) {
    for (const e of der[coleccion]) {
      o += 1;
      fuera.set(`${letra}:${e.id}`, { o, e });
    }
  }
  for (const que of DECISIONES) {
    for (const [k, v] of Object.entries(der.decisiones[que])) fuera.set(`d:${que}:${k}`, v);
  }
  return fuera;
}

/** What a new shared `.der` starts with (a Y.Map made with these entries), from a DER (cleaned here). */
export function entradasDer(der) {
  return [...entradas(sanearDer(der) ?? derVacio())];
}

// The DER of what was read, the newest `menos` things left out.
function armar(listas, decisiones, menos = 0) {
  const todos = Object.values(listas).flat();
  const fuera = new Set(menos ? [...todos].sort((a, b) => b.o - a.o).slice(0, menos) : []);
  const der = { v: 1, decisiones };
  for (const [letra, coleccion] of COLECCIONES) der[coleccion] = listas[letra].filter((x) => !fuera.has(x)).map((x) => x.e);
  return sanearDer(der) ?? derVacio();
}

/**
 * The DER of the shared map, clean: what isn't a thing of a DER (a key or a value of another shape, an id that doesn't
 * match its key) is left out, and past the size of a file the newest things go.
 */
export function leerDerCompartido(mapa) {
  if (!(mapa instanceof Y.Map)) return derVacio();
  const listas = { e: [], v: [], j: [], g: [] };
  const decisiones = { cp: Object.create(null), lado11: Object.create(null), tipos: Object.create(null) };
  let n = 0;
  mapa.forEach((valor, clave) => {
    n += 1;
    if (n > MAX_CLAVES) return;
    const el = CLAVE_ELEMENTO.exec(clave);
    if (el) {
      if (esObjeto(valor) && esObjeto(valor.e) && valor.e.id === el[2]) listas[el[1]].push({ id: el[2], o: Number.isFinite(valor.o) ? valor.o : 0, e: valor.e });
      return;
    }
    const d = CLAVE_DECISION.exec(clave);
    if (d) decisiones[d[1]][d[2]] = valor;
  });
  for (const letra of Object.keys(listas)) listas[letra].sort((a, b) => a.o - b.o || a.id.localeCompare(b.id));
  const der = armar(listas, decisiones);
  if (derEnTexto(der).length <= MAX_CODIGO) return der;
  // Too big (several added at once): the newest things go, as few as it takes (searched by halves).
  const entra = (menos) => derEnTexto(armar(listas, decisiones, menos)).length <= MAX_CODIGO;
  let bajo = 0;
  let alto = Object.values(listas).reduce((s, l) => s + l.length, 0);
  while (alto - bajo > 1) {
    const medio = Math.floor((bajo + alto) / 2);
    if (entra(medio)) alto = medio;
    else bajo = medio;
  }
  return armar(listas, decisiones, alto);
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Puts `der` in the shared map changing only what differs, with `origen` (so each one undoes only their own). False if
 * it isn't a DER or doesn't fit in a file.
 */
export function ponerDerCompartido(mapa, der, origen = null) {
  const limpio = sanearDer(der);
  if (!limpio || !(mapa instanceof Y.Map) || derEnTexto(limpio).length > MAX_CODIGO) return false;
  let ultimo = 0;
  mapa.forEach((v) => {
    if (esObjeto(v) && Number.isFinite(v.o)) ultimo = Math.max(ultimo, v.o);
  });
  const nuevas = entradas(limpio);
  const cambiar = () => {
    for (const [clave, valor] of nuevas) {
      const antes = mapa.get(clave);
      if (!CLAVE_ELEMENTO.test(clave)) {
        if (!igual(antes, valor)) mapa.set(clave, valor);
      } else if (!esObjeto(antes) || !igual(antes.e, valor.e)) {
        // A thing already there keeps its place; a new one goes after every other.
        mapa.set(clave, { o: esObjeto(antes) && Number.isFinite(antes.o) ? antes.o : (ultimo += 1), e: valor.e });
      }
    }
    const sobran = [];
    mapa.forEach((_, clave) => {
      if (!nuevas.has(clave)) sobran.push(clave);
    });
    sobran.forEach((clave) => mapa.delete(clave));
  };
  if (mapa.doc) mapa.doc.transact(cambiar, origen);
  else cambiar();
  return true;
}

/**
 * How a sheet uses one shared `.der`: `leer()` gives { der, atras, adelante } (the same object until something changes),
 * `suscribir(fn)`, `escribir(der)`, and `deshacer()`/`rehacer()` of what this browser did only. `destruir()` at the end.
 */
export function manejoDer(mapa) {
  const origen = { der: true };
  const um = new Y.UndoManager(mapa, { trackedOrigins: new Set([origen]), captureTimeout: 500 });
  const oyentes = new Set();
  let leido = null;
  const avisar = () => {
    leido = null;
    oyentes.forEach((f) => f());
  };
  mapa.observe(avisar);
  ['stack-item-added', 'stack-item-popped', 'stack-cleared'].forEach((e) => um.on(e, avisar));
  return {
    leer: () => (leido ??= { der: leerDerCompartido(mapa), atras: um.undoStack.length, adelante: um.redoStack.length }),
    suscribir(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    escribir: (der) => ponerDerCompartido(mapa, der, origen),
    deshacer: () => um.undo(),
    rehacer: () => um.redo(),
    destruir() {
      mapa.unobserve(avisar);
      um.destroy();
      oyentes.clear();
    },
  };
}

// --- What each one marks on the sheet (mesa.marcar): their pointer, in the sheet's coordinates, and what they chose.

const NODO = /^[evjg]:[A-Za-z0-9_-]{1,40}$/;
const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(Math.max(v, -1e5), 1e5)) : null);

/** Someone's mark on the sheet of `archivo`, checked: { x, y, sel } (x and y null without a pointer), or null. */
export function marcaDer(m, archivo) {
  if (!esObjeto(m) || m.archivo !== archivo) return null;
  const sel = Array.isArray(m.sel) ? m.sel.filter((s) => typeof s === 'string' && NODO.test(s)).slice(0, 20) : [];
  const x = numero(m.x);
  const y = numero(m.y);
  return { x: x !== null && y !== null ? x : null, y: x !== null && y !== null ? y : null, sel };
}

/** A followed view of a sheet: { cx, cy, z } for `archivo`, or null. */
export function vistaDer(v, archivo) {
  if (!esObjeto(v) || v.archivo !== archivo || numero(v.cx) === null || numero(v.cy) === null || typeof v.z !== 'number' || !Number.isFinite(v.z)) return null;
  return { cx: numero(v.cx), cy: numero(v.cy), z: Math.min(Math.max(v.z, 0.25), 2) };
}
