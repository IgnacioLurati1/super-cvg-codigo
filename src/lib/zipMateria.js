// A course in one ZIP: a numbered folder per section, in the student's order, plus a list of its links.
// The plan is pure so it can be tested; `bajarMateria` is the part that talks to the campus.
import { Zip, ZipPassThrough, strToU8 } from 'fflate';
import { traerArchivo, guardarArchivo } from './archivos';
import { enlaceSeguro, nombreDeArchivo } from './datos';
import { hastaCancelar } from './leerTexto';

export const AL_MISMO_TIEMPO = 2;
export const AVISO_BYTES = 300 * 1024 * 1024;
export const ARCHIVO_ENLACES = 'enlaces.txt';
export const ARCHIVO_FALLAS = 'no-se-pudieron-bajar.txt';

const MAX_CARPETA = 60;
const MAX_ARCHIVO = 120;
const TROZO = 4 * 1024 * 1024;
const JUNTAR_CADA = 32 * 1024 * 1024;
const FALLOS_SEGUIDOS = 10;
// This ZIP format has no room for more than 4 GB.
const LIMITE_ZIP = 4_000_000_000;

const RESERVADO = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Valid in a ZIP and in Windows, the strictest place it will be opened. Keeps the extension if it has to cut. */
export function nombreSeguro(nombre, maximo = MAX_ARCHIVO) {
  const limpio = nombreDeArchivo(nombre).replace(/[<>:"|?*]/g, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim() || 'archivo';
  const seguro = RESERVADO.test(limpio) ? `_${limpio}` : limpio;
  const letras = Array.from(seguro);
  if (letras.length <= maximo) return seguro;
  const extension = /\.[\p{L}\p{N}]{1,8}$/u.exec(seguro)?.[0] ?? '';
  return `${letras.slice(0, maximo - extension.length).join('').trimEnd()}${extension}`;
}

/** The name it was saved with, or the one the student gave it, with the file's extension. */
function nombreDelItem(item) {
  const original = item.archivo ?? item.nombre;
  if (!item.nombreOriginal) return original;
  const extension = /\.[\p{L}\p{N}]{1,8}$/u.exec(original)?.[0] ?? '';
  return item.nombre.toLowerCase().endsWith(extension.toLowerCase()) ? item.nombre : `${item.nombre}${extension}`;
}

/** «apunte.pdf» again is «apunte (2).pdf». Upper and lower case count as the same, as they do in Windows. */
function sinRepetir(nombre, usados) {
  if (!usados.has(nombre.toLowerCase())) {
    usados.add(nombre.toLowerCase());
    return nombre;
  }
  const punto = nombre.lastIndexOf('.');
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const extension = punto > 0 ? nombre.slice(punto) : '';
  for (let n = 2; ; n++) {
    const otro = `${base} (${n})${extension}`;
    if (!usados.has(otro.toLowerCase())) {
      usados.add(otro.toLowerCase());
      return otro;
    }
  }
}

const unaLinea = (t) => String(t ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Everything that goes in the ZIP, decided before asking the campus for anything. */
export function planDeZip(items, materia) {
  const carpetas = new Map();
  const conArchivos = (items ?? []).filter((i) => i.tipo === 'archivo' && i.direccion);
  for (const item of conArchivos) {
    const clave = item.seccionId ?? item.seccion ?? '';
    if (!carpetas.has(clave)) carpetas.set(clave, { nombre: nombreSeguro(item.seccion || 'General', MAX_CARPETA), usados: new Set() });
  }
  const cifras = Math.max(2, String(carpetas.size).length);
  [...carpetas.values()].forEach((c, n) => {
    c.nombre = `${String(n + 1).padStart(cifras, '0')} ${c.nombre}`;
  });
  const archivos = conArchivos.map((item) => {
    const carpeta = carpetas.get(item.seccionId ?? item.seccion ?? '');
    return { item, ruta: `${carpeta.nombre}/${sinRepetir(nombreSeguro(nombreDelItem(item)), carpeta.usados)}` };
  });

  const secciones = new Map();
  for (const item of items ?? []) {
    if (item.tipo !== 'enlace') continue;
    const direccion = enlaceSeguro(item.destino ?? item.direccion);
    if (!direccion) continue;
    const nombre = unaLinea(item.seccion) || 'General';
    if (!secciones.has(nombre)) secciones.set(nombre, []);
    secciones.get(nombre).push({ nombre: unaLinea(item.nombre) || 'Enlace', direccion });
  }

  return {
    nombre: `${nombreSeguro(materia?.nombre || 'Materia', MAX_ARCHIVO - 4)}.zip`,
    materia: unaLinea(materia?.nombre) || 'la materia',
    archivos,
    enlaces: [...secciones].map(([nombre, lista]) => ({ nombre, lista })),
    bytes: conArchivos.reduce((suma, i) => suma + (i.peso || 0), 0),
  };
}

export const cuantosEnlaces = (plan) => plan.enlaces.reduce((suma, s) => suma + s.lista.length, 0);

export function textoDeEnlaces(plan) {
  const lineas = [`Enlaces de ${plan.materia}`, ''];
  for (const seccion of plan.enlaces) {
    lineas.push(seccion.nombre);
    for (const e of seccion.lista) lineas.push(`${e.nombre}`, e.direccion, '');
    if (lineas.at(-1) !== '') lineas.push('');
  }
  return `${lineas.join('\n').trimEnd()}\n`;
}

export function textoDeFallas(rutas) {
  return `Estos archivos no se pudieron bajar. Probá de nuevo o bajalos desde el campus.\n\n${rutas.join('\n')}\n`;
}

// ---------- Building it ----------
// The ZIP goes straight to a Blob as it grows, so a big course doesn't need one huge piece of memory.
function nuevaSalida() {
  let partes = [];
  let sueltos = 0;
  let bytes = 0;
  let error = null;
  const zip = new Zip((err, dato) => {
    if (err) {
      error = err;
      return;
    }
    if (!dato?.length) return;
    partes.push(dato);
    bytes += dato.length;
    sueltos += dato.length;
    if (sueltos >= JUNTAR_CADA) {
      partes = [new Blob(partes)];
      sueltos = 0;
    }
  });
  return {
    zip,
    entra: (tam) => bytes + tam <= LIMITE_ZIP,
    revisar() {
      if (error) throw error;
    },
    terminar() {
      zip.end();
      if (error) throw error;
      return new Blob(partes, { type: 'application/zip' });
    },
  };
}

// In pieces, with the screen getting its turn between them: the checksum of a big file would otherwise freeze it.
async function escribir(salida, ruta, blob, senal) {
  const entrada = new ZipPassThrough(ruta);
  salida.zip.add(entrada);
  if (!blob.size) {
    entrada.push(new Uint8Array(0), true);
    return;
  }
  for (let desde = 0; desde < blob.size; desde += TROZO) {
    const trozo = new Uint8Array(await blob.slice(desde, desde + TROZO).arrayBuffer());
    if (senal?.aborted) return;
    entrada.push(trozo, desde + TROZO >= blob.size);
    salida.revisar();
  }
}

function escribirTexto(salida, ruta, texto) {
  const entrada = new ZipPassThrough(ruta);
  salida.zip.add(entrada);
  entrada.push(strToU8(texto), true);
}

/**
 * Downloads the plan's files, at most two at a time, and hands over the ZIP. A file that fails doesn't stop the
 * rest. Returns { cancelado, bajados, fallaron }: `fallaron` holds the paths that didn't make it.
 * Throws only if the ZIP itself could not be built.
 */
export async function bajarMateria(plan, { senal, alProgreso, traer = traerArchivo, guardar = guardarArchivo } = {}) {
  const salida = nuevaSalida();
  const total = plan.archivos.length;
  const fallaron = new Set();
  let siguiente = 0;
  let hechos = 0;
  let bajados = 0;
  let seguidos = 0;
  let roto = null;
  // One entry at a time: the ZIP can't mix two files.
  let cola = Promise.resolve();

  const avisar = () => alProgreso?.({ hechos, total, fallaron: fallaron.size });
  const seguir = () => !senal?.aborted && !roto;

  const trabajador = async () => {
    while (seguir() && siguiente < total) {
      const { item, ruta } = plan.archivos[siguiente++];
      let blob = null;
      // If this many in a row fail, the rest would too. Not worth asking the campus for them.
      if (seguidos < FALLOS_SEGUIDOS) {
        try {
          blob = await hastaCancelar(traer(item), senal);
          seguidos = 0;
        } catch {
          if (senal?.aborted) return;
          seguidos++;
        }
      }
      if (senal?.aborted) return;
      if (blob) {
        const conBlob = blob;
        const turno = cola.then(async () => {
          if (!seguir() || !salida.entra(conBlob.size)) return false;
          await escribir(salida, ruta, conBlob, senal);
          return true;
        });
        cola = turno.catch(() => {});
        try {
          if (await turno) bajados++;
          else if (seguir()) fallaron.add(ruta);
        } catch (e) {
          roto = e;
          return;
        }
      } else {
        fallaron.add(ruta);
      }
      hechos++;
      avisar();
    }
  };

  avisar();
  await Promise.all(Array.from({ length: Math.min(AL_MISMO_TIEMPO, total) }, trabajador));
  await cola;
  if (roto) throw roto;
  const rutasFallidas = plan.archivos.map((a) => a.ruta).filter((r) => fallaron.has(r));
  if (senal?.aborted) return { cancelado: true, bajados, fallaron: rutasFallidas };
  if (!bajados) return { cancelado: false, bajados, fallaron: rutasFallidas };

  if (plan.enlaces.length) escribirTexto(salida, ARCHIVO_ENLACES, textoDeEnlaces(plan));
  if (rutasFallidas.length) escribirTexto(salida, ARCHIVO_FALLAS, textoDeFallas(rutasFallidas));
  guardar(salida.terminar(), plan.nombre);
  return { cancelado: false, bajados, fallaron: rutasFallidas };
}
