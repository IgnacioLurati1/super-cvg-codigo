import { deflateSync, Inflate, strFromU8, strToU8 } from 'fflate';
import { cambiarMateria, materiaDe, mioActual, personalizar, sanearMio } from './mio';

// How a student passes their order of a course to the class, with no server: a link whose data travels in the hash
// (it never reaches a server) or a file. What comes in is hostile by default: another student wrote it.
const TIPO = 'campus-lindo-orden';
const VERSION = 1;
export const LIMITE_PAQUETE = 200 * 1024;
// Deflate can barely grow what it can't compress, so a real package never needs more text than this.
const LIMITE_TEXTO = Math.ceil((LIMITE_PAQUETE * 4) / 3) + 1024;
// Deflate multiplies by 1032 at most: a piece this size can't inflate past about 1 MB before the limit is checked.
const PEDAZO = 1024;
const LIMITE_FECHAS = 200;
const LIMITE_LISTA = 3000;
// mio.js accepts any integer as a date, and a date too far away makes the date formatters throw.
const FECHA_MINIMA = Date.UTC(2000, 0, 1) / 1000;
const FECHA_MAXIMA = Date.UTC(2100, 0, 1) / 1000;
const CAMPOS = ['secciones', 'ocultos', 'nombres', 'orden', 'fechas'];

const ROTO = 'Este link no es un orden de Super CVG o llegó cortado. Pedile a quien te lo pasó que te lo mande de nuevo.';
const NO_ES = 'Esto no es un orden de Super CVG.';
const OTRA_VERSION = 'Este orden se armó con una versión que no conocemos.';
const MUY_GRANDE = 'Este orden pesa demasiado.';
const SIN_GUARDAR = 'No se pudo guardar en este navegador.';

export function falla(mensaje) {
  const error = new Error(mensaje);
  error.conocido = true; // `textoError` shows it as is.
  return error;
}

const esPlano = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const esLista = (x) => (Array.isArray(x) ? x : []);
const unir = (a, b) => [...new Set([...a, ...b])].slice(0, LIMITE_LISTA);
const mismaFecha = (a, b) => a.titulo === b.titulo && a.cuando === b.cuando;

/** Control characters and invisible ones: they can disguise a name or flip it around on screen. */
export const limpiarTexto = (t) => t.replace(/\p{Cf}/gu, '').replace(/[\p{Cc}\u2028\u2029]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Only what can be shared. Nothing else from the course's data ever gets in here. */
export function armarPaquete(materiaId, mio) {
  const m = materiaDe(mio, materiaId);
  return {
    tipo: TIPO,
    version: VERSION,
    materiaId: Number(materiaId),
    secciones: [...m.secciones],
    ocultos: [...m.ocultos],
    nombres: { ...m.nombres },
    orden: Object.fromEntries(Object.entries(m.orden).filter(([, claves]) => claves.length)),
    // The ids stay home: they only make sense in this browser.
    fechas: m.fechas.map((f, i) => ({ id: i + 1, titulo: f.titulo, cuando: f.cuando, sinHora: f.sinHora })),
  };
}

export const paqueteVacio = (p) =>
  !p.secciones.length && !p.ocultos.length && !p.fechas.length && !Object.keys(p.nombres).length && !Object.keys(p.orden).length;

/** Whatever came in, as a package with known fields, types and sizes. Throws if it isn't one. */
function sanearPaquete(datos) {
  if (!esPlano(datos) || datos.tipo !== TIPO) throw falla(NO_ES);
  if (datos.version !== VERSION) throw falla(OTRA_VERSION);
  const id = datos.materiaId;
  if (!['number', 'string'].includes(typeof id) || !/^[1-9]\d{0,11}$/.test(String(id))) throw falla(NO_ES);

  // mio.js checks each value. These checks are for what it would read too kindly: a list where an object goes, odd keys.
  const crudo = {
    secciones: esLista(datos.secciones),
    ocultos: esLista(datos.ocultos),
    nombres: esPlano(datos.nombres) ? datos.nombres : {},
    orden: esPlano(datos.orden) ? Object.fromEntries(Object.entries(datos.orden).filter(([s]) => /^\d{1,12}$/.test(s))) : {},
    fechas: esLista(datos.fechas).filter(esPlano).map((f, i) => ({ id: i + 1, titulo: f.titulo, cuando: f.cuando, sinHora: f.sinHora })),
  };
  const m = sanearMio({ materias: { [id]: crudo } }).materias[id];

  const nombres = {};
  for (const [clave, nombre] of Object.entries(m.nombres)) {
    const limpio = limpiarTexto(nombre);
    if (limpio) nombres[clave] = limpio;
  }
  const fechas = [];
  for (const f of m.fechas) {
    const fecha = { ...f, titulo: limpiarTexto(f.titulo) };
    if (fecha.titulo && f.cuando >= FECHA_MINIMA && f.cuando <= FECHA_MAXIMA && !fechas.some((o) => mismaFecha(o, fecha))) fechas.push(fecha);
  }
  return {
    tipo: TIPO,
    version: VERSION,
    materiaId: Number(id),
    secciones: m.secciones,
    ocultos: m.ocultos,
    nombres,
    orden: Object.fromEntries(Object.entries(m.orden).filter(([, claves]) => claves.length)),
    fechas: fechas.map((f, i) => ({ ...f, id: i + 1 })),
  };
}

/** The text of a package's JSON, as it comes in a file. */
export function paqueteDeTexto(texto) {
  let datos;
  try {
    datos = JSON.parse(String(texto).replace(/^\uFEFF/, ''));
  } catch {
    throw falla(NO_ES);
  }
  return sanearPaquete(datos);
}

export function aBase64(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64(texto) {
  const relleno = '='.repeat((4 - (texto.length % 4)) % 4);
  const binario = atob(texto.replace(/-/g, '+').replace(/_/g, '/') + relleno);
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

/** Inflates by pieces and stops as soon as it goes over the limit, so a zip bomb never gets to fill the memory. */
export function inflarConTope(comprimido, limite = LIMITE_PAQUETE, mensaje = MUY_GRANDE) {
  const partes = [];
  let total = 0;
  const inflador = new Inflate((parte) => {
    total += parte.length;
    if (total > limite) throw falla(mensaje);
    partes.push(parte);
  });
  for (let i = 0; i < comprimido.length; i += PEDAZO) inflador.push(comprimido.subarray(i, i + PEDAZO), false);
  inflador.push(new Uint8Array(0), true);
  const salida = new Uint8Array(total);
  let lugar = 0;
  for (const parte of partes) {
    salida.set(parte, lugar);
    lugar += parte.length;
  }
  return salida;
}

export function codificarPaquete(paquete) {
  const bytes = strToU8(JSON.stringify(paquete));
  if (bytes.length > LIMITE_PAQUETE) throw falla('Este orden es muy grande para pasarlo.');
  return aBase64(deflateSync(bytes, { level: 9 }));
}

export function decodificarPaquete(texto) {
  if (typeof texto !== 'string' || !/^[A-Za-z0-9_-]+$/.test(texto)) throw falla(ROTO);
  if (texto.length > LIMITE_TEXTO) throw falla(MUY_GRANDE);
  let inflado;
  try {
    inflado = inflarConTope(deBase64(texto));
  } catch (error) {
    if (error.conocido) throw error;
    throw falla(ROTO);
  }
  try {
    return paqueteDeTexto(strFromU8(inflado));
  } catch (error) {
    throw error.message === NO_ES ? falla(ROTO) : error;
  }
}

const PREFIJO_HASH = '#orden=';

export const hayPaqueteEnHash = (hash) => String(hash).startsWith(PREFIJO_HASH);
export const paqueteDeHash = (hash) => decodificarPaquete(String(hash).slice(PREFIJO_HASH.length));
export const hashDe = (paquete) => PREFIJO_HASH + codificarPaquete(paquete);

/** `archivo` is a File. Its size is checked before reading it. */
export async function leerArchivoPaquete(archivo) {
  if (archivo.size > LIMITE_PAQUETE) throw falla(MUY_GRANDE);
  return paqueteDeTexto(await archivo.text());
}

const textoParaArchivo = (paquete) => JSON.stringify(paquete, null, 1);
export const archivoDe = (paquete) => new Blob([textoParaArchivo(paquete)], { type: 'application/json' });

/** What the package says, on top of what the student already has. Touches only the five shared fields. */
function fundir(m, p) {
  const fechas = [...m.fechas];
  let proximo = Math.max(0, ...fechas.map((f) => f.id)) + 1;
  for (const f of p.fechas) {
    if (fechas.length >= LIMITE_FECHAS) break;
    if (!fechas.some((o) => mismaFecha(o, f))) fechas.push({ ...f, id: proximo++ });
  }
  return {
    ...m,
    secciones: unir(m.secciones, p.secciones),
    ocultos: unir(m.ocultos, p.ocultos),
    nombres: { ...m.nombres, ...p.nombres },
    orden: { ...m.orden, ...p.orden },
    fechas,
  };
}

const copiaDeCampos = (m) => ({ secciones: m.secciones, ocultos: m.ocultos, nombres: m.nombres, orden: m.orden, fechas: m.fechas });

/** Adds the package to the student's data and returns what was there before, for `restaurarMateria`. */
export function aplicarPaquete(paquete) {
  const antes = copiaDeCampos(materiaDe(mioActual(), paquete.materiaId));
  if (!cambiarMateria(paquete.materiaId, (m) => fundir(m, paquete))) throw falla(SIN_GUARDAR);
  return antes;
}

/** Undoes `aplicarPaquete`. A note or a task written in between stays. */
export function restaurarMateria(materiaId, antes) {
  const campos = Object.fromEntries(CAMPOS.map((c) => [c, antes[c]]));
  if (!cambiarMateria(materiaId, (m) => ({ ...m, ...campos }))) throw falla(SIN_GUARDAR);
}

/** Leaves out what doesn't exist in this course: it wouldn't do anything and nobody could review it. */
export function filtrarPaquete(paquete, items) {
  const claves = new Set(items.map((i) => i.clave));
  const porSeccion = new Map();
  for (const i of items) {
    const seccion = String(i.seccionId);
    if (!porSeccion.has(seccion)) porSeccion.set(seccion, new Set());
    porSeccion.get(seccion).add(i.clave);
  }
  const orden = {};
  for (const [seccion, lista] of Object.entries(paquete.orden)) {
    const validas = lista.filter((c) => porSeccion.get(seccion)?.has(c));
    if (validas.length) orden[seccion] = validas;
  }
  return {
    ...paquete,
    secciones: paquete.secciones.filter((s) => porSeccion.has(String(s))),
    ocultos: paquete.ocultos.filter((c) => claves.has(c)),
    nombres: Object.fromEntries(Object.entries(paquete.nombres).filter(([c]) => claves.has(c))),
    orden,
  };
}

function ordenPorSeccion(items, mio) {
  const secciones = new Map();
  for (const i of personalizar(items, mio)) {
    const seccion = String(i.seccionId);
    if (!secciones.has(seccion)) secciones.set(seccion, []);
    secciones.get(seccion).push(i.clave);
  }
  return secciones;
}

/** What would change in this course, with real names, to show before applying. `items` are as the campus sends them. */
export function resumirPaquete(paquete, items, mio) {
  const id = paquete.materiaId;
  const filtrado = filtrarPaquete(paquete, items);
  const m = materiaDe(mio, id);
  const unoPorClave = new Map();
  const nombreSeccion = new Map();
  for (const i of items) {
    if (!unoPorClave.has(i.clave)) unoPorClave.set(i.clave, i);
    if (!nombreSeccion.has(String(i.seccionId))) nombreSeccion.set(String(i.seccionId), i.seccion || 'Sección sin nombre');
  }
  const campusDe = (clave) => unoPorClave.get(clave).nombre;

  const renombrados = Object.entries(filtrado.nombres)
    .filter(([clave, nuevo]) => (m.nombres[clave] ?? campusDe(clave)) !== nuevo)
    .map(([clave, nuevo]) => ({ clave, campus: campusDe(clave), nuevo }));
  const ocultos = filtrado.ocultos
    .filter((clave) => !m.ocultos.includes(clave))
    .map((clave) => ({ clave, nombre: m.nombres[clave] ?? campusDe(clave) }));
  const secciones = filtrado.secciones
    .filter((s) => !m.secciones.includes(s))
    .map((s) => ({ id: s, nombre: nombreSeccion.get(String(s)) }));
  const fechas = filtrado.fechas.filter((f) => !m.fechas.some((o) => mismaFecha(o, f)));

  const ordenHoy = ordenPorSeccion(items, mio);
  const ordenDespues = ordenPorSeccion(items, { materias: { [id]: fundir(m, filtrado) } });
  const orden = Object.keys(filtrado.orden)
    .filter((s) => ordenHoy.get(s).join() !== ordenDespues.get(s).join())
    .map((s) => ({ id: s, nombre: nombreSeccion.get(s) }));

  return {
    paquete: filtrado,
    renombrados,
    ocultos,
    secciones,
    orden,
    fechas,
    hayCambios: Boolean(renombrados.length || ocultos.length || secciones.length || orden.length || fechas.length),
  };
}

// A file imported from another screen waits here, in memory: the browser's history would keep it on disk.
let dejado = null;
export const dejarPaquete = (paquete) => { dejado = paquete; };
export const paqueteDejado = () => dejado;
