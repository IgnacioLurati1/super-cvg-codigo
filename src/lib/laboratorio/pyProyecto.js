// The files of a Python run, in the worker's memory (python.worker.js): the program runs in CARPETA, with the files of
// its project there, and what it did to them goes back to the page. `FS` is Pyodide's (Emscripten's) file system.
import { bytesDe, nombreDeArchivo, TOPE_PROYECTO } from './proyecto';

/** The folder the program runs in: its files, and what it opens or creates without a path. */
export const CARPETA = '/home/alumno/proyecto';

const texto = (bytes) => new TextDecoder().decode(bytes);

/**
 * What a run gets, ready: { principal } (the `.py` it runs, by its name in the project), { codigo } (that file's text)
 * and { archivos } [{ nombre, bytes }] (every file of the project, the `.py` too, to put in its folder). From
 * { codigo, nombre } (the code alone, as always: { solo: true } and no files, the folder stays as the last run left it)
 * or { archivos: [{ nombre, contenido }], principal }, with the contents as text or bytes. The main file is
 * `principal`, or `main.py`, or the first `.py`. What doesn't fit under TOPE_PROYECTO or has a name that isn't valid
 * stays out. { error } if there's no `.py` to run.
 */
export function proyectoPython({ codigo, nombre, archivos, principal } = {}) {
  if (!Array.isArray(archivos)) {
    const solo = nombreDeArchivo(nombre) && !String(nombre).includes('/') ? String(nombre) : 'tu_codigo.py';
    return { solo: true, principal: solo, codigo: String(codigo ?? ''), archivos: [] };
  }
  const lista = [];
  const vistos = new Set();
  let total = 0;
  for (const a of archivos.slice(0, TOPE_PROYECTO.archivos)) {
    const n = nombreDeArchivo(a?.nombre);
    const bytes = bytesDe(a?.contenido);
    if (!n || vistos.has(n) || !bytes || total + bytes.length > TOPE_PROYECTO.bytes) continue;
    vistos.add(n);
    total += bytes.length;
    lista.push({ nombre: n, bytes });
  }
  const codigos = lista.filter((a) => a.nombre.endsWith('.py'));
  const elegido = codigos.find((a) => a.nombre === principal) ?? codigos.find((a) => a.nombre === 'main.py') ?? codigos[0];
  if (!elegido) return { error: 'El proyecto no tiene ningún archivo `.py` para correr.' };
  return { solo: false, principal: elegido.nombre, codigo: texto(elegido.bytes), archivos: lista };
}

const existe = (FS, ruta) => FS.analyzePath(ruta).exists;

// Every file under `carpeta`, by its path in it.
function leerCarpeta(FS, carpeta, prefijo = '', mapa = new Map()) {
  for (const n of FS.readdir(carpeta)) {
    if (n === '.' || n === '..') continue;
    const ruta = `${carpeta}/${n}`;
    const modo = FS.lstat(ruta).mode;
    if (FS.isDir(modo)) leerCarpeta(FS, ruta, `${prefijo}${n}/`, mapa);
    else if (FS.isFile(modo)) mapa.set(`${prefijo}${n}`, FS.readFile(ruta));
  }
  return mapa;
}

function borrarCarpeta(FS, carpeta) {
  for (const n of FS.readdir(carpeta)) {
    if (n === '.' || n === '..') continue;
    const ruta = `${carpeta}/${n}`;
    if (FS.isDir(FS.lstat(ruta).mode)) {
      borrarCarpeta(FS, ruta);
      FS.rmdir(ruta);
    } else FS.unlink(ruta);
  }
}

/** Puts the project in CARPETA (a project starts from its files alone; the code alone finds what the last run left)
 * and returns how the folder is, to compare after the run (`cambiosDe`). */
export function ponerProyecto(FS, proyecto) {
  FS.chdir('/');
  if (!existe(FS, CARPETA)) FS.mkdirTree(CARPETA);
  if (!proyecto.solo) {
    borrarCarpeta(FS, CARPETA);
    for (const a of proyecto.archivos) {
      const corte = a.nombre.lastIndexOf('/');
      if (corte > 0) FS.mkdirTree(`${CARPETA}/${a.nombre.slice(0, corte)}`);
      FS.writeFile(`${CARPETA}/${a.nombre}`, a.bytes);
    }
  }
  return leerCarpeta(FS, CARPETA);
}

const iguales = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** What the run did to the folder: { cambiados: [{ nombre, contenido }] (bytes, created or changed), borrados: [nombre] }. */
export function cambiosDe(FS, antes) {
  const ahora = existe(FS, CARPETA) ? leerCarpeta(FS, CARPETA) : new Map();
  const cambiados = [];
  for (const [nombre, bytes] of ahora) {
    const previo = antes.get(nombre);
    if (!previo || !iguales(previo, bytes)) cambiados.push({ nombre, contenido: bytes });
  }
  const borrados = [...antes.keys()].filter((n) => !ahora.has(n));
  return { cambiados, borrados };
}
