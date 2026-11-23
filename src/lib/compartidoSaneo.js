// What another app shares with Super CVG («Compartir» on Android, the manifest's share_target): the rules for what is
// let in. Used by the service worker, which receives it (scripts/trabajador.mjs copies this file into sw.js without
// its `export`s, so it imports nothing), and by the page that reads it back (compartido.js).
// Only PDFs and photos, told apart by their first bytes and not by their name or the type the other app said: a file
// that only says it's a PDF stays out. The name is rebuilt with the extension of what it really is.

export const COMPARTIDO = {
  // The Cache Storage where it waits, and the addresses it's kept under.
  cache: 'cvg-compartido',
  ruta: '__compartido/',
  // How long it waits to be placed.
  vida: 30 * 60_000,
  archivos: 10,
  // The cap of one file of the student's own (propiasSaneo.js, LIMITES.archivo), and of all together.
  archivo: 25 * 1024 * 1024,
  total: 80 * 1024 * 1024,
  nombre: 100,
  titulo: 200,
  texto: 2000,
  url: 2000,
  // The files left out that are named, at most.
  fuera: 20,
};

export const TIPOS_COMPARTIDOS = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const empieza = (b, firma, desde = 0) => firma.every((x, i) => b[desde + i] === x);

/** What a file is by its first bytes (12 are enough): 'pdf', 'jpg', 'png', 'webp' or null. */
export function tipoPorBytes(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  if (empieza(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';
  if (empieza(b, [0xff, 0xd8, 0xff])) return 'jpg';
  if (empieza(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (empieza(b, [0x52, 0x49, 0x46, 0x46]) && empieza(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

/** A plain line: without control or invisible characters, spaces joined, cut at `tope`. */
export const lineaCompartida = (texto, tope) =>
  String(texto ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, tope)
    .trim();

/** A name to keep a file with: no folders, no control characters, no extensions of its own (nothing that runs, nor a
 * «.pdf.exe»), and the one of what it is. */
export function nombreCompartido(nombre, ext) {
  const base = lineaCompartida(String(nombre ?? '').split(/[/\\]/).pop(), 400)
    .replace(/[<>:"|?*]/g, '')
    // Extensions have a letter: «Tema 2.1» keeps its «.1».
    .replace(/(\.(?=[\p{N}]*\p{L})[\p{L}\p{N}]{1,8})+$/u, '')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const corto = base.slice(0, COMPARTIDO.nombre).trim() || (ext === 'pdf' ? 'Documento compartido' : 'Foto compartida');
  return ext ? `${corto}.${ext}` : corto;
}

/** The first http(s) address in what came: `url` first, then the text. Null if there's none, or it's too long. */
export function enlaceCompartido(url, texto) {
  for (const fuente of [url, texto]) {
    const hallado = /https?:\/\/[^\s<>"']+/i.exec(String(fuente ?? ''))?.[0]?.replace(/[),.;:!?»]+$/, '');
    if (!hallado || hallado.length > COMPARTIDO.url) continue;
    try {
      const u = new URL(hallado);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {
      // Not an address: maybe the text has one.
    }
  }
  return null;
}

/** What came, checked: { titulo, texto, enlace, archivos: [{ nombre, tipo, archivo }], fuera: [{ nombre, por }] }.
 * `por`: 'tipo' (not a PDF or a photo, or empty), 'peso', 'cantidad' or 'total'. `form`: the FormData of the share. */
export async function revisarCompartido(form) {
  const valor = (k) => (typeof form.get(k) === 'string' ? form.get(k) : '');
  const enlace = enlaceCompartido(valor('enlace'), valor('texto'));
  let texto = String(valor('texto')).replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : ' '));
  // The address goes apart: what's left of the text is what the other app said about it.
  if (enlace) texto = texto.replace(/https?:\/\/[^\s<>"']+/gi, ' ');
  texto = texto.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, COMPARTIDO.texto).trim();
  const archivos = [];
  const fuera = [];
  let total = 0;
  for (const archivo of form.getAll('archivos')) {
    if (typeof archivo === 'string' || !archivo) continue;
    // The name as it came, only to say it stayed out: shown as text, never used for a file.
    const dicho = lineaCompartida(String(archivo.name ?? '').split(/[/\\]/).pop(), COMPARTIDO.nombre) || 'Un archivo';
    const afuera = (por) => fuera.length < COMPARTIDO.fuera && fuera.push({ nombre: dicho, por });
    if (archivos.length >= COMPARTIDO.archivos) afuera('cantidad');
    else if (archivo.size > COMPARTIDO.archivo) afuera('peso');
    else if (total + archivo.size > COMPARTIDO.total) afuera('total');
    else {
      const tipo = archivo.size ? tipoPorBytes(await archivo.slice(0, 12).arrayBuffer()) : null;
      if (!tipo) afuera('tipo');
      else {
        total += archivo.size;
        archivos.push({ nombre: nombreCompartido(archivo.name, tipo), tipo, archivo });
      }
    }
  }
  return { titulo: lineaCompartida(valor('titulo'), COMPARTIDO.titulo), texto, enlace, archivos, fuera };
}
