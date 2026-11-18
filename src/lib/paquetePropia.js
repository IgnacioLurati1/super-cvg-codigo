// How a course of one's own goes to another student, with no server: a link whose data travels in the hash (only
// when it has no files of its own) or a file. With files it's a ZIP that also opens by hand: the manifest and each
// file with its name. Everything that comes in is hostile: sizes are checked before inflating, the manifest goes
// through propiasSaneo.js, and files and courses get new ids, so nothing steps on what the student already has.
// Things of the campus travel as references, never as copies.
import { deflateSync, strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { borrarDeBodega, guardarEnBodega, leerDeBodega } from './bodega';
import { usuarioActual } from './mio';
import { aBase64, deBase64, falla, inflarConTope } from './paquete';
import { sumarPropia } from './propias';
import { archivosDe, idArchivo, idPropia, LIMITES, sanearPropia, SIN_TIPO } from './propiasSaneo';
import { nombreSeguro } from './zipMateria';

const TIPO = 'super-cvg-materia';
const VERSION = 1;
const MANIFIESTO = 'super-cvg-materia.json';
const CARPETA = /^archivos\/([0-9a-z]{8,32})-/;
const LIMITE_JSON = 2 * 1024 * 1024;
const LIMITE_LINK = 200 * 1024;
export const LIMITE_ZIP = 120 * 1024 * 1024;
export const LIMITE_ARCHIVOS = 100 * 1024 * 1024;
export const MAX_ARCHIVOS = 300;

const NO_ES = 'Esto no es una materia de Super CVG.';
const ROTO = 'Este link no es una materia de Super CVG o llegó cortado. Pedile a quien te lo pasó que te lo mande de nuevo.';
const OTRA_VERSION = 'Esta materia se armó con una versión que no conocemos.';
const MUY_GRANDE = 'Esta materia pesa demasiado.';

const manifiesto = (propia) => ({ tipo: TIPO, version: VERSION, materia: { ...propia, cambiada: 0 } });

/** The course a manifest describes, clean and with a new id. */
function desdeManifiesto(datos) {
  if (!datos || typeof datos !== 'object' || datos.tipo !== TIPO) throw falla(NO_ES);
  if (datos.version !== VERSION) throw falla(OTRA_VERSION);
  const propia = sanearPropia({ ...datos.materia, id: idPropia() });
  if (!propia) throw falla(NO_ES);
  return propia;
}

function deTexto(texto, mensaje = NO_ES) {
  let datos;
  try {
    datos = JSON.parse(String(texto).replace(/^\ufeff/, ''));
  } catch {
    throw falla(mensaje);
  }
  return desdeManifiesto(datos);
}

const sinArchivos = (propia) => ({ ...propia, categorias: propia.categorias.map((c) => ({ ...c, bloques: c.bloques.filter((b) => b.tipo !== 'archivo') })) });

export const tieneArchivos = (propia) => archivosDe(propia).length > 0;

const PREFIJO_HASH = '#materia=';
export const hayMateriaEnHash = (hash) => String(hash).startsWith(PREFIJO_HASH);

/** Only for a course without files of its own: those don't fit in a link. */
export function hashDeMateria(propia) {
  const bytes = strToU8(JSON.stringify(manifiesto(sinArchivos(propia))));
  if (bytes.length > LIMITE_LINK) throw falla('Esta materia es muy grande para pasarla por link. Pasala como archivo.');
  return PREFIJO_HASH + aBase64(deflateSync(bytes, { level: 9 }));
}

export function materiaDeHash(hash) {
  const texto = String(hash).slice(PREFIJO_HASH.length);
  if (!/^[A-Za-z0-9_-]+$/.test(texto) || texto.length > Math.ceil((LIMITE_LINK * 4) / 3) + 1024) throw falla(ROTO);
  let inflado;
  try {
    inflado = inflarConTope(deBase64(texto), LIMITE_LINK, MUY_GRANDE);
  } catch (error) {
    if (error.conocido) throw error;
    throw falla(ROTO);
  }
  return { propia: sinArchivos(deTexto(strFromU8(inflado), ROTO)), archivos: new Map(), faltaron: 0 };
}

const slug = (nombre) => nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'materia';
export const nombreDelArchivo = (propia) => `materia-${slug(propia.nombre)}.${tieneArchivos(propia) ? 'zip' : 'json'}`;

const unicos = (propia) => [...new Map(propia.categorias.flatMap((c) => c.bloques).filter((b) => b.tipo === 'archivo').map((b) => [b.archivoId, b])).values()];

/** Why this course can't go in a file the other student can open, or ''. The same caps `leerArchivoMateria` checks. */
export function porQueNoEntra(propia) {
  const archivos = unicos(propia);
  if (archivos.length > MAX_ARCHIVOS) return `Tiene más de ${MAX_ARCHIVOS} archivos. Sacá algunos o repartilos en dos materias.`;
  if (archivos.reduce((s, b) => s + b.peso, 0) > LIMITE_ARCHIVOS) return `Sus archivos pasan de ${LIMITE_ARCHIVOS / (1024 * 1024)} MB. Sacá algunos o repartilos en dos materias.`;
  return '';
}

/** The file to pass the course on. `leer` gets the bytes of a file of one's own (bodega.js by default). */
export async function archivoDeMateria(propia, leer = (id, nombre) => leerDeBodega(usuarioActual(), id, nombre)) {
  const texto = JSON.stringify(manifiesto(propia), null, 1);
  if (!tieneArchivos(propia)) return new Blob([texto], { type: 'application/json' });
  const noEntra = porQueNoEntra(propia);
  if (noEntra) throw falla(noEntra);
  const entradas = { [MANIFIESTO]: strToU8(texto) };
  const usados = new Set();
  for (const b of propia.categorias.flatMap((c) => c.bloques)) {
    if (b.tipo !== 'archivo' || usados.has(b.archivoId)) continue;
    usados.add(b.archivoId);
    let blob;
    try {
      blob = await leer(b.archivoId, b.nombre);
    } catch {
      throw falla(`Falta «${b.nombre}» en este navegador. Volvé a subirlo o sacalo antes de compartir.`);
    }
    // Stored as is: summaries and PDFs barely compress, and this way the ZIP is built fast.
    entradas[`archivos/${b.archivoId}-${nombreSeguro(b.nombre)}`] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(entradas)], { type: 'application/zip' });
}

/** Reads a file another student passed: a ZIP with files, or the manifest alone. Nothing is saved yet. */
export async function leerArchivoMateria(archivo) {
  if (archivo.size > LIMITE_ZIP) throw falla(MUY_GRANDE);
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    if (bytes.length > LIMITE_JSON) throw falla(MUY_GRANDE);
    return { propia: sinArchivos(deTexto(strFromU8(bytes))), archivos: new Map(), faltaron: 0 };
  }
  let total = 0;
  let cuantos = 0;
  let entradas;
  try {
    // Sizes come from the ZIP's own index, before inflating anything: a ZIP bomb is stopped there.
    entradas = unzipSync(bytes, {
      filter: (f) => {
        if (f.name === MANIFIESTO) {
          if (f.originalSize > LIMITE_JSON) throw falla(MUY_GRANDE);
          return true;
        }
        if (!CARPETA.test(f.name)) return false;
        cuantos += 1;
        total += f.originalSize;
        if (cuantos > MAX_ARCHIVOS || f.originalSize > LIMITES.archivo || total > LIMITE_ARCHIVOS) throw falla(MUY_GRANDE);
        return true;
      },
    });
  } catch (error) {
    if (error.conocido) throw error;
    throw falla(NO_ES);
  }
  if (!entradas[MANIFIESTO]) throw falla(NO_ES);
  const propia = deTexto(strFromU8(entradas[MANIFIESTO]));
  const porId = new Map();
  for (const [ruta, datos] of Object.entries(entradas)) {
    const m = CARPETA.exec(ruta);
    if (m) porId.set(m[1], datos);
  }
  // Each file gets a new id. A block whose file didn't come is left out, and counted so the student knows.
  const archivos = new Map();
  let faltaron = 0;
  const nueva = {
    ...propia,
    categorias: propia.categorias.map((c) => ({
      ...c,
      bloques: c.bloques.flatMap((b) => {
        if (b.tipo !== 'archivo') return [b];
        const datos = porId.get(b.archivoId);
        if (!datos) {
          faltaron += 1;
          return [];
        }
        const id = idArchivo();
        archivos.set(id, new Blob([datos], { type: SIN_TIPO }));
        return [{ ...b, archivoId: id, peso: datos.length }];
      }),
    })),
  };
  return { propia: nueva, archivos, faltaron };
}

/** What a course that arrived brings, to show before saving it. */
export function resumenDeMateria({ propia, archivos }) {
  const bloques = propia.categorias.flatMap((c) => c.bloques);
  const cuenta = (tipo) => bloques.filter((b) => b.tipo === tipo).length;
  return {
    categorias: propia.categorias.length,
    archivos: cuenta('archivo'),
    peso: [...archivos.values()].reduce((s, b) => s + b.size, 0),
    campus: cuenta('campus'),
    enlaces: cuenta('enlace'),
    textos: cuenta('texto'),
    materiasDelCampus: [...new Set(bloques.filter((b) => b.tipo === 'campus').map((b) => b.materiaId))],
  };
}

/** Saves a course that arrived: first its files, then the course. If something fails, nothing half stays. */
export async function guardarMateria({ propia, archivos }, { guardar = guardarEnBodega, borrar = borrarDeBodega, sumar = sumarPropia, usuario = usuarioActual() } = {}) {
  const hechos = [];
  try {
    for (const [id, blob] of archivos) {
      await guardar(usuario, id, blob);
      hechos.push(id);
    }
  } catch (error) {
    await borrar(usuario, hechos).catch(() => {});
    throw error;
  }
  if (!sumar(propia)) {
    await borrar(usuario, hechos).catch(() => {});
    throw falla(`No se pudo guardar. Fijate si ya tenés ${LIMITES.materias} materias tuyas.`);
  }
  return propia.id;
}
