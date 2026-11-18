// «Paso a paso»: what the worker recorded (rastreo.js), read and put in the student's words. A trace has its steps, the
// frames and the objects each step points to (kept once each), and what the program printed, all of it with how much it
// had printed at each step. Everything here is pure: the screen asks for one step at a time.

/** How many steps are recorded, at most: past that, the program stops and the screen says so. */
export const TOPE_PASOS = 1000;

const EVENTOS = new Set(['line', 'call', 'return', 'exception', 'fin']);
const esNumero = (n) => Number.isInteger(n) && n >= 0;
const esValor = (v) => Array.isArray(v) && typeof v[0] === 'string';

/** The trace the worker sent, as JSON text, or null if it isn't one. */
export function leerRecorrido(texto) {
  let d;
  try {
    d = JSON.parse(String(texto));
  } catch {
    return null;
  }
  if (!d || !Array.isArray(d.pasos) || !Array.isArray(d.marcos) || !Array.isArray(d.objetos) || !Array.isArray(d.salida)) return null;
  const marcos = d.marcos.filter((m) => m && typeof m.f === 'string' && Array.isArray(m.v));
  const objetos = d.objetos.filter((o) => o && esNumero(o.i) && typeof o.t === 'string');
  if (marcos.length !== d.marcos.length || objetos.length !== d.objetos.length) return null;
  const pasos = d.pasos.filter((p) => p && EVENTOS.has(p.e) && esNumero(p.l) && esNumero(p.s) && Array.isArray(p.m) && Array.isArray(p.o)
    && p.m.every((k) => esNumero(k) && k < marcos.length) && p.o.every((k) => esNumero(k) && k < objetos.length));
  if (!pasos.length) return null;
  const salida = d.salida.filter((s) => Array.isArray(s) && ['out', 'err', 'in'].includes(s[0]) && typeof s[1] === 'string');
  return { pasos, marcos, objetos, salida, tope: d.tope === true };
}

/** Step `i` (from 0) with its frames and objects in place. */
export function fotoDelPaso(recorrido, i) {
  const p = recorrido.pasos[i];
  const marcos = p.m.map((k) => recorrido.marcos[k]);
  const objetos = p.o.map((k) => recorrido.objetos[k]);
  return {
    i,
    total: recorrido.pasos.length,
    evento: p.e,
    archivo: archivoDe(p),
    linea: p.l,
    escrito: p.s,
    marcos,
    ocultos: esNumero(p.h) ? p.h : 0,
    objetos,
    porId: new Map(objetos.map((o) => [o.i, o])),
    devuelve: esValor(p.d) ? p.d : null,
    // C: a void function (cRastro.js) leaves without a value, and not because of an error.
    sinValor: p.n === 1,
    error: typeof p.x === 'string' && p.x ? p.x : null,
  };
}

// The file of the project a step or frame is in (rastreo.js), or null in a trace without it.
const archivoDe = (p) => (typeof p?.a === 'string' && p.a ? p.a : null);

/** The lines to mark in the editor at step `i`: the one that goes next and the one that just ran (0, none), and the
 * file of the project they're in (`archivo`, null in a trace without it). The one that just ran counts only in the
 * same file. */
export function lineasDelPaso(recorrido, i) {
  const p = recorrido.pasos[i];
  if (!p) return { siguiente: 0, recien: 0, archivo: null };
  const archivo = archivoDe(p);
  if (p.e === 'return' || p.e === 'exception' || p.e === 'fin') return { siguiente: 0, recien: p.l, archivo };
  const previo = i > 0 ? recorrido.pasos[i - 1] : null;
  const antes = previo && archivoDe(previo) === archivo ? previo.l : 0;
  return { siguiente: p.l, recien: antes === p.l ? 0 : antes, archivo };
}

/** What the program had printed (and what was typed) before step `escrito` characters: pieces { flujo, texto }. */
export function salidaHasta(salida, escrito) {
  const piezas = [];
  let queda = escrito;
  for (const [flujo, texto] of salida) {
    if (queda <= 0) break;
    piezas.push({ flujo, texto: texto.slice(0, queda) });
    queda -= texto.length;
  }
  return piezas;
}

const numero = new Intl.NumberFormat('es-AR');

/** The name an object goes by on the screen: «lista 1», «diccionario 2», «Alumno 1». */
export const nombreDeObjeto = (o) => `${o.t === 'objeto' ? o.c || 'objeto' : o.t} ${o.k}`;

/** A value in words: as Python writes it, or the name of what it points to. */
export function textoDeValor(v, porId) {
  if (!esValor(v)) return '';
  const [tipo, dato] = v;
  if (tipo === 'v') return String(dato);
  if (tipo === 'e') return dato ? `un entero de ${numero.format(dato)} cifras` : 'un entero enorme';
  if (tipo === 'r') {
    const o = porId?.get(dato);
    return o ? nombreDeObjeto(o) : 'un objeto';
  }
  if (tipo === 'f') return `función ${dato}`;
  if (tipo === 'c') return `clase ${dato}`;
  if (tipo === 'm') return `módulo ${dato}`;
  return '';
}

const COMPRENSIONES = new Set(['<listcomp>', '<dictcomp>', '<setcomp>']);

/** The name of a frame: the main program, a function, a class being made. */
export function nombreDeMarco(m) {
  // C: its globals (cRastro.js) go in a frame with its own name.
  if (m.t === 'g') return m.f === '<module>' ? 'Programa principal' : m.f;
  if (m.t === 'c') return `clase ${m.f}`;
  if (m.f === '<lambda>') return 'lambda';
  if (m.f === '<genexpr>') return 'generador';
  if (COMPRENSIONES.has(m.f)) return 'comprensión';
  return m.f;
}

const juntar = (partes) => (partes.length < 2 ? partes.join('') : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`);

/** What happens at the step, in one sentence. */
export function describirPaso(foto) {
  const marco = foto.marcos.at(-1);
  const nombre = marco ? nombreDeMarco(marco) : '';
  if (foto.evento === 'line') return `Va a correr la línea ${foto.linea}.`;
  if (foto.evento === 'call') {
    if (marco?.t === 'c') return `Arma la ${nombre}.`;
    const datos = (marco?.v ?? []).map(([n, v]) => `${n} = ${textoDeValor(v, foto.porId)}`);
    return datos.length ? `Entra a ${nombre} con ${juntar(datos)}.` : `Entra a ${nombre}.`;
  }
  if (foto.evento === 'return') {
    if (marco?.t === 'c') return `Termina de armar la ${nombre}.`;
    if (foto.devuelve) return `${nombre} devuelve ${textoDeValor(foto.devuelve, foto.porId)}.`;
    return foto.sinValor ? `Sale de ${nombre}.` : `Sale de ${nombre} por un error.`;
  }
  if (foto.evento === 'exception') return `Salta un error en la línea ${foto.linea}.`;
  return foto.error ? `Terminó con un error en la línea ${foto.linea}.` : 'Terminó.';
}

// The references a value or an object holds, in order.
const refsDeValor = (v) => (esValor(v) && v[0] === 'r' ? [v[1]] : []);
function refsDeObjeto(o) {
  if (Array.isArray(o.e)) return o.e.flatMap(refsDeValor);
  if (Array.isArray(o.p)) return o.p.flatMap(([a, b]) => [...refsDeValor(a), ...refsDeValor(b)]);
  if (Array.isArray(o.a)) return o.a.flatMap(([, b]) => refsDeValor(b));
  return [];
}

/** The objects of a step in rows, as they are reached: each variable of the frames, from the main program down,
 * starts a row with what it points to, and what that holds follows to its right. So the arrows go to the right. */
export function filasDeObjetos(foto) {
  const puestos = new Set();
  const filas = [];
  const seguir = (id, fila) => {
    const o = foto.porId.get(id);
    if (!o || puestos.has(id)) return;
    puestos.add(id);
    fila.push(o);
    refsDeObjeto(o).forEach((r) => seguir(r, fila));
  };
  const raices = [...foto.marcos.flatMap((m) => m.v.flatMap(([, v]) => refsDeValor(v))), ...refsDeValor(foto.devuelve)];
  for (const id of raices) {
    const fila = [];
    seguir(id, fila);
    if (fila.length) filas.push(fila);
  }
  const sueltos = foto.objetos.filter((o) => !puestos.has(o.i));
  if (sueltos.length) filas.push(sueltos);
  return filas;
}

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** What changed from step `antes` to `ahora`: keys «m<frame>:<name>» of variables and «o<id>:<place>» of what an object
 * holds. A frame is the same if it's in the same place of the stack with the same function. */
export function cambiosDelPaso(antes, ahora) {
  const cambios = new Set();
  if (!antes) return cambios;
  ahora.marcos.forEach((m, k) => {
    const previo = antes.marcos[k];
    if (!previo || previo.f !== m.f || previo.t !== m.t) return;
    const valores = new Map(previo.v);
    for (const [n, v] of m.v) if (!valores.has(n) || !igual(valores.get(n), v)) cambios.add(`m${k}:${n}`);
  });
  for (const o of ahora.objetos) {
    const previo = antes.porId.get(o.i);
    if (!previo) continue;
    if (Array.isArray(o.e)) o.e.forEach((v, j) => (!previo.e || !igual(previo.e[j], v)) && cambios.add(`o${o.i}:${j}`));
    const pares = o.p ?? o.a;
    const previos = previo.p ?? previo.a;
    if (Array.isArray(pares)) {
      const viejos = new Map((previos ?? []).map(([a, b]) => [JSON.stringify(a), b]));
      for (const [a, b] of pares) {
        const clave = JSON.stringify(a);
        if (!viejos.has(clave) || !igual(viejos.get(clave), b)) cambios.add(`o${o.i}:${clave}`);
      }
    }
  }
  return cambios;
}
