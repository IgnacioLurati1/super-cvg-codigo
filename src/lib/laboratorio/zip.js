import { strToU8, unzipSync, zipSync } from 'fflate';
import { ARCHIVO_CASOS, casosATexto, casosDeTexto } from './casos';
import { esBytes } from './escritos';
import { LENGUAJES } from './lenguajes';
import { EXTENSIONES, MAX_ARCHIVOS, MAX_CODIGO, nombreValido } from './saneo';

// A project as a zip, both ways (fflate, already in the site for the C compiler and the shared courses: nothing new to
// download, and no eval, so it keeps the CSP). What comes in is read here and then goes through the same saving as
// everything else (guardado.js, sanearArchivo): only files of the project's language, each by its plain name, without
// folders or `..`, within the limits of saneo.js. A binary .dat stays apart, for the memory of the tab (escritos.js).

// The zip itself, before opening it, and what it may unpack: well over what a project can keep, never a bomb.
export const TOPE_ZIP = 8 * 1024 * 1024;
const TOPE_DESEMPACADO = 24 * 1024 * 1024;
const TOPE_BINARIO = 4 * 1024 * 1024;
const DE_CODIGO = new Set(['c', 'h', 'py', 'sql']);

/** The text of a file the student brought: UTF-8, or else the Windows letters of a .txt saved in Excel or Notepad. Null if
 * it's binary. Lines end in \n. */
export function textoSubido(bytes) {
  if (bytes.includes(0)) return null;
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** «notas.h» as { nombre: 'notas', ext: 'h' }, if it's a plain name of a file (no folders, no dots at the start). */
export function partirNombre(nombre) {
  const m = /^([^/\\:*?"<>|]+)\.([A-Za-z0-9]{1,5})$/.exec(String(nombre ?? ''));
  if (!m || m[1].startsWith('.') || m[1].includes('..')) return null;
  const base = nombreValido(m[1]);
  return base ? { nombre: base, ext: m[2].toLowerCase() } : null;
}

/**
 * One file brought into a project of `lenguaje`: { nombre, ext, codigo }, { nombre, ext, bytes } for a binary .dat, or
 * { problema: 'extension' | 'binario' | 'largo' }.
 */
export function leerSubido(nombre, bytes, lenguaje) {
  const partes = partirNombre(nombre);
  if (!partes || !EXTENSIONES[lenguaje]?.includes(partes.ext)) return { problema: 'extension' };
  const texto = textoSubido(bytes);
  if (texto === null) {
    if (partes.ext !== 'dat') return { problema: 'binario' };
    return bytes.length > TOPE_BINARIO ? { problema: 'largo' } : { ...partes, bytes };
  }
  if (texto.length > MAX_CODIGO) return { problema: 'largo' };
  return { ...partes, codigo: texto };
}

// A zip of a folder brings the folder's name first: the files are what's inside it.
function sinCarpeta(nombres) {
  const primeras = new Set(nombres.map((n) => (n.includes('/') ? n.slice(0, n.indexOf('/')) : '')));
  if (primeras.size !== 1) return (n) => n;
  const [carpeta] = primeras;
  return carpeta ? (n) => n.slice(carpeta.length + 1) : (n) => n;
}

// Of the language with more files of code; null if there's none.
function lenguajeDe(exts) {
  const cuenta = { c: 0, python: 0, sql: 0, javascript: 0 };
  for (const e of exts) {
    if (e === 'c' || e === 'h') cuenta.c += 1;
    else if (e === 'py') cuenta.python += 1;
    else if (e === 'sql') cuenta.sql += 1;
    else if (e === 'js') cuenta.javascript += 1;
  }
  const [mejor, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0];
  return n ? mejor : null;
}

/**
 * Reads a zip the student brought. { lenguaje, archivos: [{ nombre, ext, codigo }], binarios: [{ nombre, ext, bytes }],
 * afuera: [what was left out, by its name], casos: [its test cases, casos.js] } or { problema: 'grande' | 'roto' | 'vacio' | 'sin-codigo' }.
 */
export function leerZip(bytes) {
  if (!esBytes(bytes)) return { problema: 'roto' };
  if (bytes.length > TOPE_ZIP) return { problema: 'grande' };
  let desempacado = 0;
  let entradas;
  try {
    entradas = unzipSync(bytes, {
      filter: (f) => {
        if (f.name.endsWith('/') || /(^|\/)(__MACOSX|\.)/.test(f.name)) return false;
        desempacado += f.originalSize;
        return desempacado <= TOPE_DESEMPACADO;
      },
    });
  } catch {
    return { problema: 'roto' };
  }
  if (desempacado > TOPE_DESEMPACADO) return { problema: 'grande' };
  const nombres = Object.keys(entradas);
  if (!nombres.length) return { problema: 'vacio' };
  const corto = sinCarpeta(nombres);
  const afuera = [];
  const leidos = [];
  let casos = [];
  for (const n of nombres) {
    const plano = corto(n);
    // The test cases of the project, as zipDeProyecto leaves them.
    if (plano === ARCHIVO_CASOS) {
      const texto = textoSubido(entradas[n]);
      casos = texto === null ? [] : casosDeTexto(texto);
      if (texto === null) afuera.push(n);
      continue;
    }
    // Inside a folder, or a name that climbs out of it: it stays out.
    const partes = plano.includes('/') || plano.includes('\\') ? null : partirNombre(plano);
    if (!partes) afuera.push(n);
    else leidos.push({ ...partes, original: plano, bytes: entradas[n] });
  }
  const lenguaje = lenguajeDe(leidos.map((l) => l.ext));
  if (!lenguaje) return { problema: 'sin-codigo' };
  const archivos = [];
  const binarios = [];
  const vistos = new Set();
  for (const l of leidos.sort((a, b) => a.original.localeCompare(b.original, 'es'))) {
    const leido = leerSubido(l.original, l.bytes, lenguaje);
    const clave = `${leido.nombre}.${leido.ext}`.toLowerCase();
    if (leido.problema || vistos.has(clave) || archivos.length + binarios.length >= MAX_ARCHIVOS || (leido.bytes && DE_CODIGO.has(leido.ext))) {
      afuera.push(l.original);
      continue;
    }
    vistos.add(clave);
    if (leido.bytes) binarios.push(leido);
    else archivos.push(leido);
  }
  return { lenguaje, archivos, binarios, afuera, casos };
}

/** The project as a zip: a folder with its name and each file in it. `archivos`: [{ nombre, contenido }] (text or bytes).
 * Its test cases go as a text file in a folder of their own (`pruebas/`), apart from the project's. */
/**
 * Several projects in one zip, each in its own folder (a repeated name gets « (2)»): the live session's whole shared
 * folder. `proyectos`: [{ carpeta, archivos, casos }].
 */
export function zipDeCarpetas(proyectos) {
  const dentro = {};
  const usadas = new Set();
  for (const { carpeta, archivos, casos } of proyectos) {
    let nombre = carpeta || 'Proyecto';
    for (let i = 2; usadas.has(nombre.toLowerCase()); i += 1) nombre = `${carpeta} (${i})`;
    usadas.add(nombre.toLowerCase());
    for (const a of archivos) dentro[`${nombre}/${a.nombre}`] = typeof a.contenido === 'string' ? strToU8(a.contenido) : a.contenido;
    const deCasos = `${nombre}/${ARCHIVO_CASOS}`;
    if (casos?.length && !(deCasos in dentro)) dentro[deCasos] = strToU8(casosATexto(casos));
  }
  return zipSync(dentro, { level: 6 });
}

export function zipDeProyecto(carpeta, archivos, casos = []) {
  const dentro = {};
  for (const a of archivos) dentro[`${carpeta}/${a.nombre}`] = typeof a.contenido === 'string' ? strToU8(a.contenido) : a.contenido;
  // (Unless a program of the project wrote one by that name: its file stays.)
  const deCasos = `${carpeta}/${ARCHIVO_CASOS}`;
  if (casos?.length && !(deCasos in dentro)) dentro[deCasos] = strToU8(casosATexto(casos));
  return zipSync(dentro, { level: 6 });
}
