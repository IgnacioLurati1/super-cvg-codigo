import { unzipSync } from 'fflate';
import { EXPORTES, FALLA, GUARDA, leerNombres, vigilar } from './cGuardia';
import { explicarAssert, explicarCompilacion, explicarFalla, tipoDeFalla } from './cMensajes';
import FUENTE_DEL_APOYO from './c/apoyo.c?raw';
import { AGREGADOS } from './c/cabeceras';
import FUENTE_DE_PRINTF from './c/vfprintf.c?raw';
import { Archivos, crearWasi, Salida } from './wasi';
import { bytesDe, nombreDeArchivo, TOPE_PROYECTO } from './proyecto';

export { nombreDeArchivo, TOPE_PROYECTO };

// The C of the lab, without the worker around it: xcc (a C compiler that runs as WebAssembly, MIT) compiles the code
// of the student to WebAssembly, and the program runs in the same WASI of memory (wasi.js), with its guard (cGuardia.js).
// What the compiler and the program say comes back in the student's words (cMensajes.js).

// The stack of the program, as in Linux. The compiler puts it first in memory, from this address down to 0.
export const PILA = 8 * 1024 * 1024;
// The memory a program may take, in pages of 64 KB: 256 MB. Past that, malloc() gives NULL.
export const PAGINAS = 4096;
const CASA = '/home/alumno';
const PROGRAMA = '/tmp/programa.wasm';
// Compiled once and linked with each program: what the library of xcc lacks or does differently (c/apoyo.c), and
// printf (c/vfprintf.c).
const APOYOS = [
  ['/usr/lib/laboratorio/apoyo.c', FUENTE_DEL_APOYO],
  ['/usr/lib/laboratorio/vfprintf.c', FUENTE_DE_PRINTF],
];
const OBJETOS = APOYOS.map(([ruta]) => ruta.replace(/\.c$/, '.o'));
// The bytes all the files of a run may take: past it, writing says the disk is full.
export const TOPE_ARCHIVOS = 32 * 1024 * 1024;

const texto = (bytes) => new TextDecoder().decode(bytes);

async function correrCompilador({ compilador, archivos, args }) {
  let salida = '';
  const decodificar = new TextDecoder();
  const wasi = crearWasi({
    args: ['cc', ...args],
    env: { HOME: CASA, PWD: CASA },
    archivos,
    escribir: (_fd, bytes) => {
      salida += decodificar.decode(bytes, { stream: true });
    },
    leer: () => new Uint8Array(0),
  });
  const instancia = await WebAssembly.instantiate(compilador, wasi.importsPara(compilador));
  wasi.usar(instancia.exports.memory);
  let codigo = 0;
  try {
    instancia.exports._start();
  } catch (e) {
    if (!(e instanceof Salida)) throw e;
    codigo = e.codigo;
  }
  return { codigo, salida: salida.slice(0, 50_000) };
}

/** From the zip of xcc (its compiler, headers and library): what every compilation needs, ready. */
export async function prepararC(zip) {
  const base = new Archivos();
  for (const [ruta, datos] of Object.entries(unzipSync(zip))) if (datos.length && !ruta.endsWith('/')) base.escribir(`/${ruta}`, datos);
  const cc = base.leer('/usr/bin/cc');
  if (!cc) throw new Error('El paquete de C no trae el compilador.');
  for (const [ruta, extra] of Object.entries(AGREGADOS)) base.escribir(ruta, `${texto(base.leer(ruta) ?? new Uint8Array(0))}${extra}`);
  const compilador = await WebAssembly.compile(cc);
  for (const [i, [ruta, fuente]] of APOYOS.entries()) {
    base.escribir(ruta, fuente);
    const apoyo = await correrCompilador({ compilador, archivos: base, args: ['-c', '-o', OBJETOS[i], ruta] });
    if (apoyo.codigo !== 0 || !base.leer(OBJETOS[i])) throw new Error(`No se pudo preparar C: ${apoyo.salida}`);
  }
  const { salida } = await correrCompilador({ compilador, archivos: new Archivos(base.datos), args: ['--version'] });
  const version = /version\s+([\w.]+)/.exec(salida)?.[1] ?? '';
  return { base, compilador, version };
}

/**
 * What a run gets, ready: { fuentes } (the `.c` and `.h`, as text, the main one first), { datos } (the other files, as
 * bytes, for the program to open) and { principal } (the `.c` the program is named after, or null if there's none).
 * From { codigo, nombre } (the code alone, as always) or { archivos: [{ nombre, contenido }], principal }, with the
 * contents as text or bytes. What doesn't fit under TOPE_PROYECTO or has a name that isn't valid stays out.
 */
export function proyectoDe({ codigo, nombre, archivos, principal } = {}) {
  if (!Array.isArray(archivos)) {
    const solo = /^[\w-]{1,40}\.c$/.test(String(nombre)) ? String(nombre) : 'tu_codigo.c';
    return { fuentes: [{ nombre: solo, contenido: String(codigo ?? '') }], datos: [], principal: solo };
  }
  const fuentes = [];
  const datos = [];
  const vistos = new Set();
  let total = 0;
  for (const a of archivos.slice(0, TOPE_PROYECTO.archivos)) {
    const n = nombreDeArchivo(a?.nombre);
    const c = a?.contenido;
    const bytes = bytesDe(c);
    if (!n || vistos.has(n) || !bytes || total + bytes.length > TOPE_PROYECTO.bytes) continue;
    vistos.add(n);
    total += bytes.length;
    if (/\.[ch]$/.test(n)) fuentes.push({ nombre: n, contenido: typeof c === 'string' ? c : texto(bytes) });
    else datos.push({ nombre: n, bytes });
  }
  const codigos = fuentes.filter((f) => f.nombre.endsWith('.c'));
  const elegido = codigos.find((f) => f.nombre === principal) ?? codigos[0] ?? null;
  if (elegido) fuentes.unshift(...fuentes.splice(fuentes.indexOf(elegido), 1));
  return { fuentes, datos, principal: elegido?.nombre ?? null };
}

/**
 * Compiles a project (proyectoDe, or what it takes): every `.c` together, each `#include "…"` from the project's files.
 * { programa } (the bytes of WebAssembly) and { avisos }, or { error, linea, archivo }.
 */
export async function compilar(c, opciones) {
  const proyecto = opciones?.fuentes ? opciones : proyectoDe(opciones);
  if (!proyecto.principal) return { error: 'El proyecto no tiene ningún archivo `.c` para compilar.', linea: 0, archivo: null, avisos: [] };
  const archivos = new Archivos(c.base.datos);
  for (const f of proyecto.fuentes) archivos.escribir(`${CASA}/${f.nombre}`, f.contenido);
  const rutas = proyecto.fuentes.filter((f) => f.nombre.endsWith('.c')).map((f) => `${CASA}/${f.nombre}`);
  const r = await correrCompilador({ compilador: c.compilador, archivos, args: [`--stack-size=${PILA}`, '-e', '__laboratorio_vaciar', '-o', PROGRAMA, ...rutas, ...OBJETOS] });
  const programa = r.codigo === 0 ? archivos.leer(PROGRAMA) : null;
  const explicado = explicarCompilacion(r.salida, proyecto.fuentes);
  if (programa && !explicado.error) return { programa, avisos: explicado.avisos };
  return { error: explicado.error ?? `No se pudo compilar.\n${r.salida}`.trim(), linea: explicado.linea, archivo: explicado.archivo ?? null, avisos: [] };
}

const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// The files of the student's folder that the run created, changed or deleted, against how they were.
function cambiosDe(archivos, antes) {
  const cambiados = [];
  const borrados = [];
  for (const [ruta, bytes] of archivos.datos) {
    if (!ruta.startsWith(`${CASA}/`)) continue;
    const previo = antes.get(ruta);
    if (!previo || !iguales(previo, bytes)) cambiados.push({ nombre: ruta.slice(CASA.length + 1), contenido: bytes.slice() });
  }
  for (const ruta of antes.keys()) if (!archivos.datos.has(ruta)) borrados.push(ruta.slice(CASA.length + 1));
  return { cambiados, borrados };
}

// The functions of a stack trace, innermost first: by their number (every browser writes wasm-function[n]) and the
// «name» section, or by the name the browser wrote.
function funcionesDeTraza(traza, nombres) {
  const lista = [];
  for (const l of String(traza ?? '').split('\n')) {
    const n = /wasm-function\[(\d+)\]/.exec(l);
    const nombre = n ? nombres.get(Number(n[1])) : /(?:^|[\s.])([A-Za-z_]\w*)(?: \(|@)wasm/.exec(l)?.[1];
    if (nombre && nombre !== lista.at(-1)) lista.push(nombre);
  }
  return lista;
}

/**
 * Runs a compiled program. `fuentes` are the files of the project (or `codigoFuente`, the code alone), to say where it
 * broke; `datos` [{ nombre, bytes }] the files it finds in its folder. `leer(max)` gives what it reads from the keyboard (a Uint8Array, empty for the end, or a
 * promise of one if `pausa`: the browser can pause WebAssembly, JSPI); `escribir(fd, bytes)` gets what it prints.
 * Resolves { codigo } with its exit code, or { error, linea, archivo } if it broke, and always { archivos } with what
 * it did to its folder: { cambiados: [{ nombre, contenido }] (bytes), borrados: [nombre] }. `ultimoError()` is the
 * last thing it wrote to stderr, to recognize a failed assert(). `rastro` (cRastro.js), in «Paso a paso»: the imports
 * of the module «laboratorio» the program calls at each step, and `usar(exportes)`; when it says enough (`corta`), the
 * program stops there and resolves { codigo: 0, cortado: true }.
 */
export async function correrPrograma({ programa, codigoFuente, fuentes, datos = [], nombre, leer, escribir, pausa, ultimoError = () => '', rastro = null }) {
  const lista = fuentes ?? [{ nombre, contenido: String(codigoFuente ?? '') }];
  const archivos = new Archivos([], { tope: TOPE_ARCHIVOS });
  for (const d of datos) archivos.escribir(`${CASA}/${d.nombre}`, d.bytes);
  const antes = new Map(archivos.datos);
  const r = await correrEn({ programa, fuentes: lista, nombre, leer, escribir, pausa, ultimoError, archivos, rastro });
  return { ...r, archivos: cambiosDe(archivos, antes) };
}

async function correrEn({ programa, fuentes, nombre, leer, escribir, pausa, ultimoError, archivos, rastro }) {
  const { bytes, vigilado } = vigilar(programa, { pila: PILA, paginas: PAGINAS });
  const modulo = await WebAssembly.compile(bytes);
  const nombres = leerNombres(programa).funciones;
  // The dates of the program in the zone of the device (localtime, c/apoyo.c).
  const env = { HOME: CASA, PWD: CASA, USER: 'alumno', LABORATORIO_ZONA: String(-new Date().getTimezoneOffset()) };
  const wasi = crearWasi({ args: [nombre.replace(/\.c$/, '')], env, archivos, escribir, leer, archivosComoFlujo: true });
  const suspender = pausa ? (f) => new WebAssembly.Suspending(f) : null;
  const instancia = await WebAssembly.instantiate(modulo, { ...wasi.importsPara(modulo, suspender), ...(rastro ? { laboratorio: rastro.imports } : {}) });
  const x = instancia.exports;
  wasi.usar(x.memory);
  rastro?.usar(x);
  const arrancar = pausa ? WebAssembly.promising(x._start) : x._start;
  try {
    await arrancar();
    return { codigo: 0 };
  } catch (e) {
    if (rastro?.corta(e)) return { codigo: 0, cortado: true };
    if (e instanceof Salida) {
      if (e.codigo === 134) return explicarFalla({ tipo: 'abort', fuentes });
      if (e.codigo !== 0) {
        const fallado = explicarAssert(ultimoError(), nombre);
        if (fallado) return fallado;
      }
      return { codigo: e.codigo };
    }
    if (!(e instanceof WebAssembly.RuntimeError) && !(e instanceof RangeError) && e?.name !== 'InternalError') throw e;
    let tipo = tipoDeFalla(e.message);
    if (vigilado) {
      const causa = x[EXPORTES.falla]?.value;
      const sp = (x[EXPORTES.pila]?.value ?? PILA) >>> 0;
      if (causa === FALLA.NULO) tipo = 'nulo';
      else if (causa === FALLA.PILA || (tipo === 'memoria' && (sp < GUARDA || sp > PILA))) tipo = 'pila';
      // What it printed and was still in the buffer of the C library, from a stack back at its start.
      try {
        x[EXPORTES.pila].value = PILA;
        x[EXPORTES.falla].value = FALLA.NADA;
        x.__laboratorio_vaciar?.();
      } catch {
        // It stays where it was.
      }
    }
    return explicarFalla({ tipo, funciones: funcionesDeTraza(e.stack, nombres), fuentes, original: e.message });
  }
}
