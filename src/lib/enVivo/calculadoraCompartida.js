import { calculadoraDe } from '../calculadoras/lista';

// The Calculadora of a live session's table (components/enVivo/herramientas/Calculadora.jsx), in the tab's Y.Map:
//   cual                    the slug of the calculator open, for everyone
//   v|<clave>|<camino>      what is typed in it, field by field
// Every calculator keeps what's typed with one useRecordado(clave, inicial) (calculadoras/memoria.js). Here that state
// goes into the map split by its fields (nested objects, each leaf apart, the path with / between its parts), so two
// students typing in different fields don't step on each other. Everything here can come from the others: it is read
// back checked and cut, and a field of another kind than the calculator's own start is left out.

const MAX_HOJAS = 300;
const MAX_TEXTO = 5000;
const MAX_LISTA = 500;
const MAX_CLAVES = 100;
const MAX_HONDO = 6;
const MAX_HOJA = 64_000;
// How deep an object is split into fields; below, it travels whole.
const PARTIR_HASTA = 4;
const PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

/** The calculator open in the tab, or null if none (or one this site doesn't have). */
export const calculadoraDeMesa = (datos) => {
  const cual = datos.get('cual');
  return typeof cual === 'string' ? calculadoraDe(cual) : null;
};

export function elegirCalculadora(datos, slug) {
  if (calculadoraDe(slug) && datos.get('cual') !== slug) datos.set('cual', slug);
}

const esPlano = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const tipoDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'lista' : typeof v);

/** A value as JSON that fits: texts, finite numbers, yes or no, lists and plain objects, cut. Else undefined. */
export function limpio(v, hondo = 0) {
  if (typeof v === 'string') return v.slice(0, MAX_TEXTO);
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean' || v === null) return v;
  if (hondo >= MAX_HONDO) return undefined;
  if (Array.isArray(v)) return v.slice(0, MAX_LISTA).map((x) => limpio(x, hondo + 1) ?? null);
  if (esPlano(v)) {
    const salida = {};
    for (const k of Object.keys(v).slice(0, MAX_CLAVES)) {
      if (PROHIBIDAS.has(k)) continue;
      const x = limpio(v[k], hondo + 1);
      if (x !== undefined) salida[k] = x;
    }
    return salida;
  }
  return undefined;
}

const camino = (partes) => partes.map(encodeURIComponent).join('/');
const partes = (c) => (c === '' ? [] : c.split('/').map(decodeURIComponent));

/** The leaves of a state: Map(camino -> value). The state itself, if it isn't an object, goes at camino ''. */
export function aplanar(estado) {
  const hojas = new Map();
  const bajar = (v, ruta) => {
    if (esPlano(v) && Object.keys(v).length && ruta.length < PARTIR_HASTA) {
      for (const k of Object.keys(v)) if (!PROHIBIDAS.has(k) && v[k] !== undefined) bajar(v[k], [...ruta, k]);
      return;
    }
    const x = limpio(v, ruta.length);
    if (x !== undefined) hojas.set(camino(ruta), x);
  };
  bajar(estado, []);
  return hojas;
}

/** The state again from its leaves. A leaf that doesn't fit where it goes is left out. */
export function armar(hojas) {
  if (hojas.has('')) return hojas.get('');
  const raiz = {};
  const ordenadas = [...hojas].sort(([a], [b]) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1));
  for (const [c, v] of ordenadas) {
    const ruta = partes(c);
    if (!ruta.length || ruta.length > PARTIR_HASTA || ruta.some((k) => PROHIBIDAS.has(k))) continue;
    let aca = raiz;
    let entra = true;
    for (const k of ruta.slice(0, -1)) {
      if (aca[k] === undefined) aca[k] = {};
      else if (!esPlano(aca[k])) {
        entra = false;
        break;
      }
      aca = aca[k];
    }
    const ultima = ruta.at(-1);
    if (!entra) continue;
    if (esPlano(aca[ultima]) && esPlano(v)) Object.assign(aca[ultima], v);
    else if (aca[ultima] === undefined) aca[ultima] = v;
  }
  return raiz;
}

/** What came, over the calculator's start: a field of another kind than the start's stays as the start. */
export function encajar(inicial, llegado) {
  if (!esPlano(inicial)) return tipoDe(llegado) === tipoDe(inicial) ? llegado : inicial;
  if (!esPlano(llegado)) return inicial;
  const salida = { ...inicial };
  for (const [k, v] of Object.entries(llegado)) {
    if (inicial[k] === undefined || tipoDe(v) === tipoDe(inicial[k])) salida[k] = v;
  }
  return salida;
}

const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * The MemoriaCompartida of calculadoras/memoria.js over the tab's map, one per map. `leer` gives the same object until
 * something changes (React asks it often).
 */
const memorias = new WeakMap();
export function memoriaDeMesa(datos) {
  if (!memorias.has(datos)) memorias.set(datos, crearMemoria(datos));
  return memorias.get(datos);
}

function crearMemoria(datos) {
  const cache = new Map();
  datos.observe(() => cache.clear());
  const prefijo = (clave) => `v|${clave}|`;

  function hojasDe(clave) {
    const p = prefijo(clave);
    const hojas = new Map();
    for (const [k, v] of datos.entries()) {
      if (hojas.size >= MAX_HOJAS) break;
      if (!k.startsWith(p)) continue;
      const x = limpio(v, 0);
      if (x === undefined || JSON.stringify(x).length > MAX_HOJA) continue;
      hojas.set(k.slice(p.length), x);
    }
    return hojas;
  }

  function leer(clave, inicial) {
    if (cache.has(clave)) return cache.get(clave);
    const hojas = hojasDe(clave);
    let valor = inicial;
    try {
      if (hojas.size) valor = encajar(inicial, armar(hojas));
    } catch {
      valor = inicial;
    }
    cache.set(clave, valor);
    return valor;
  }

  function escribir(clave, v, inicial) {
    const antes = leer(clave, inicial);
    const nuevo = typeof v === 'function' ? v(antes) : v;
    const viejas = hojasDe(clave);
    const nuevas = aplanar(nuevo);
    const p = prefijo(clave);
    datos.doc.transact(() => {
      for (const c of viejas.keys()) if (!nuevas.has(c)) datos.delete(p + c);
      for (const [c, x] of nuevas) if (!viejas.has(c) || !igual(viejas.get(c), x)) datos.set(p + c, x);
    });
  }

  /** Back to the calculator's start, for everyone. */
  function borrar(clave) {
    const p = prefijo(clave);
    datos.doc.transact(() => [...datos.keys()].filter((k) => k.startsWith(p)).forEach((k) => datos.delete(k)));
  }

  function suscribir(fn) {
    datos.observe(fn);
    return () => datos.unobserve(fn);
  }

  return { leer, escribir, borrar, suscribir };
}
