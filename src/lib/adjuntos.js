// Files in Mensajes. The campus only takes text: Super CVG uploads the file to the student's Google Drive, into a
// folder «Super CVG» it creates there (one the student sees and can empty), shares it as «anyone with the link can
// view» and sends the link in the message, in a fixed text that reads well on the campus too:
//
//   <what the student wrote, if anything>
//
//   Archivo adjunto: <name> (<size>)
//   https://drive.google.com/file/d/<id>/view?usp=sharing
//
// Only with `drive.file` (USOS.adjuntos in google.js): this app sees the files it created and nothing else of the Drive.
// Straight from the browser to Google, with the permission in the header: never in an address, without cookies and
// without saying where it comes from. The campus key never comes here.
// Without Drive connected, the file goes to El Santo Resumen for 45 days instead, locked, with a link to Super CVG in
// place of the one of Drive (temporales.js).
// Whoever gets one in Super CVG sees a card only when the message ends in exactly those two lines and the link is the
// one of a Drive file, its id checked. The card opens an address built here from that id, never the one in the message.
// Its name comes in the message, written by whoever sent it, and is cleaned before it shows: nothing is asked to Google
// about a file of someone else.
import { peso } from './datos';
import { olvidarGoogle, permisoGoogle, renovarGoogle, tokenGoogle } from './google';
import { esDemo } from './modoDemo';
import { sanearNombre } from './nombreArchivo';
import { tokenActual } from './sesion';
import { leerLinkTemporal, linkTemporal } from './temporales';

export const API_ARCHIVOS = 'https://www.googleapis.com/drive/v3';
export const SUBIR_ARCHIVOS = 'https://www.googleapis.com/upload/drive/v3';
/** The biggest file that goes: enough for a practical work or a few photos, and quick to upload on a phone. */
export const TOPE_ADJUNTO = 25 * 1024 * 1024;
const TOPE_EN_TEXTO = '25 MB';
export const CARPETA_ADJUNTOS = 'Super CVG';
const DESCRIPCION_CARPETA = 'Los archivos que mandaste por Mensajes de Super CVG. Cualquiera con el link de uno lo puede ver. Si lo borrás, el link deja de andar.';
const TIPO_CARPETA = 'application/vnd.google-apps.folder';
// Bigger than one piece, a resumable upload, piece by piece (Google takes multiples of 256 KB): the progress moves with
// each one, and after a cut it goes on from the last byte Google kept. Up to one piece, in one request with its name.
export const TROZO = 4 * 256 * 1024;
// A cut in the middle is tried again after these waits, asking Google first where it stayed.
const ESPERAS = [500, 1500, 3000];
export const ETIQUETA_ADJUNTO = 'Archivo adjunto: ';
const ID = '[A-Za-z0-9_-]{20,80}';
const ES_ID = new RegExp(`^${ID}$`);
// The link of a Drive file, exactly: what «Copiar vínculo» of Drive gives and what is sent from here. Nothing before,
// after or in between: not another site that ends in Google, not another path, not a second parameter.
const LINK = new RegExp(`^https://drive\\.google\\.com/file/d/(${ID})/view(?:\\?usp=(?:sharing|drive_link|share_link|drivesdk))?$`);
const CON_PESO = /^(.*\S) \((\d{1,4}(?:,\d)? (?:KB|MB))\)$/;
const TIPO = /^[\w.+-]{1,60}\/[\w.+-]{1,100}$/;

export { sanearNombre };

/** The address that opens a Drive file. Only for a checked id. */
export const linkDeArchivo = (id) => `https://drive.google.com/file/d/${id}/view?usp=sharing`;

/** Why a file can't go, in words, or ''. */
export function problemaDeArchivo(archivo) {
  if (!archivo || !(archivo.size > 0)) return 'Ese archivo está vacío. Elegí otro.';
  if (archivo.size > TOPE_ADJUNTO) return `Ese archivo pesa ${peso(archivo.size)}. El tope es de ${TOPE_EN_TEXTO}.`;
  return '';
}

/** The message as it goes to the campus: what was written, a blank line, and the two lines of the file. With `llave`,
 * one sent without Drive (temporales.js). */
export function textoConAdjunto(texto, { nombre, bytes, id, llave }) {
  const link = llave ? linkTemporal(id, llave) : ES_ID.test(String(id ?? '')) && linkDeArchivo(id);
  if (!link || (llave && !leerLinkTemporal(link))) throw new Error('El archivo no tiene un link válido.');
  const tamano = bytes > 0 ? ` (${peso(bytes)})` : '';
  const bloque = `${ETIQUETA_ADJUNTO}${sanearNombre(nombre)}${tamano}\n${link}`;
  const escrito = String(texto ?? '').trim();
  return escrito ? `${escrito}\n\n${bloque}` : bloque;
}

/** How many bytes the two lines of a file add to a message, at most: for the count of what can still be written. */
// The link without Drive is the longer one.
export const largoDelAdjunto = (nombre, bytes) =>
  new TextEncoder().encode(`\n\n${textoConAdjunto('', { nombre, bytes, id: '00000000-0000-0000-0000-000000000000', llave: 'x'.repeat(43) })}`).length;

const textoDe = (partes) => partes.map((p) => p.texto ?? '').join('');

// The file if this line is only the link of a Drive file ({ id }) or of one sent without Drive ({ id, llave }). The campus
// turns an address into a link to itself: then the link has to go to that same file too. One whose text says Drive and
// goes elsewhere is not a file.
function archivoDeLinea(partes) {
  if (!Array.isArray(partes) || partes.length !== 1) return null;
  const [p] = partes;
  if (p.tipo !== 'texto' && p.tipo !== 'enlace') return null;
  const texto = String(p.texto ?? '').trim();
  const temporal = leerLinkTemporal(texto);
  if (temporal) {
    const destino = p.tipo === 'enlace' ? leerLinkTemporal(p.url) : temporal;
    return destino?.id === temporal.id && destino.llave === temporal.llave ? temporal : null;
  }
  const id = LINK.exec(texto)?.[1];
  if (!id) return null;
  if (p.tipo === 'enlace' && LINK.exec(String(p.url ?? ''))?.[1] !== id) return null;
  return { id };
}

function leerEtiqueta(texto) {
  if (!texto.startsWith(ETIQUETA_ADJUNTO)) return null;
  const resto = texto.slice(ETIQUETA_ADJUNTO.length).trim();
  const conPeso = CON_PESO.exec(resto);
  const crudo = conPeso ? conPeso[1] : resto;
  if (!crudo.trim()) return null;
  return { nombre: sanearNombre(crudo), peso: conPeso ? conPeso[2] : '' };
}

/** The file at the end of a message, from its blocks (bloquesCampus.js): { adjunto: { id, nombre, peso, url }, bloques }
 * (one sent without Drive also has `llave` and `temporal`)
 * with the blocks that are left, or null when the message doesn't end in exactly the two lines of a file. The two
 * lines are the last two of the last paragraph, or the last of one paragraph and the only one of the next. */
export function leerAdjunto(bloques) {
  if (!Array.isArray(bloques) || !bloques.length) return null;
  const ultimo = bloques.at(-1);
  if (ultimo?.tipo !== 'parrafo' || !ultimo.lineas?.length) return null;
  let etiqueta;
  let enlace;
  let resto;
  if (ultimo.lineas.length >= 2) {
    [etiqueta, enlace] = ultimo.lineas.slice(-2);
    const quedan = ultimo.lineas.slice(0, -2);
    resto = [...bloques.slice(0, -1), ...(quedan.length ? [{ ...ultimo, lineas: quedan }] : [])];
  } else {
    const previo = bloques.at(-2);
    if (previo?.tipo !== 'parrafo' || !previo.lineas?.length) return null;
    etiqueta = previo.lineas.at(-1);
    enlace = ultimo.lineas[0];
    const quedan = previo.lineas.slice(0, -1);
    resto = [...bloques.slice(0, -2), ...(quedan.length ? [{ ...previo, lineas: quedan }] : [])];
  }
  const archivo = archivoDeLinea(enlace);
  const datos = archivo ? leerEtiqueta(textoDe(etiqueta)) : null;
  if (!datos) return null;
  const { id, llave } = archivo;
  const adjunto = llave ? { id, llave, temporal: true, url: linkTemporal(id, llave) } : { id, url: linkDeArchivo(id) };
  return { adjunto: { ...adjunto, nombre: datos.nombre, peso: datos.peso }, bloques: resto };
}

// What goes wrong, in the words of the site.
const TEXTOS = {
  'sin-red': 'Sin conexión. Probá de nuevo cuando vuelva.',
  vencida: 'Se cortó la conexión con Google. Probá de nuevo.',
  'sin-permiso': 'Google no dio permiso para subir el archivo a tu Drive. Probá de nuevo y dejá marcada esa opción.',
  lleno: 'Tu Google Drive está lleno. Hacé lugar y probá de nuevo.',
  ocupado: 'Google está ocupado. Probá de nuevo en un rato.',
  'sin-compartir': 'Tu cuenta de Google no deja compartir archivos con link. Probá con otra cuenta.',
  caido: 'Google Drive no responde ahora. Probá de nuevo en un rato.',
  cancelada: 'Cancelaste el envío.',
};
const falla = (codigo, extra = {}) => Object.assign(new Error(TEXTOS[codigo]), { conocido: true, codigo, ...extra });
/** The errors that need Google's window again before trying. */
export const PIDE_CONECTAR = new Set(['vencida', 'sin-permiso']);

async function razones(r) {
  try {
    const json = await r.json();
    return (json?.error?.errors ?? []).map((e) => e?.reason).filter((x) => typeof x === 'string');
  } catch {
    return [];
  }
}

async function errorDe(r, { compartiendo = false } = {}) {
  if (r.status === 401) return falla('vencida', { token: true });
  if (r.status === 403 || r.status === 429) {
    const lista = await razones(r);
    if (lista.includes('storageQuotaExceeded')) return falla('lleno');
    if (r.status === 429 || lista.some((x) => /rateLimit|dailyLimit|quota/i.test(x))) return falla('ocupado');
    // A school or work account may not let a file go outside it.
    if (compartiendo && !lista.some((x) => /insufficientPermissions|authError/i.test(x))) return falla('sin-compartir');
    return falla('sin-permiso');
  }
  return falla('caido');
}

const esperarUnRato = (ms, senal) => new Promise((ok, mal) => {
  if (senal?.aborted) {
    mal(falla('cancelada'));
    return;
  }
  const reloj = setTimeout(() => {
    senal?.removeEventListener('abort', cortar);
    ok();
  }, ms);
  function cortar() {
    clearTimeout(reloj);
    mal(falla('cancelada'));
  }
  senal?.addEventListener('abort', cortar, { once: true });
});

const azar = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A client for one student's permission. `token()` gives it now; `pedir` is fetch and `esperar` the pause before
 * trying again (tests change them). */
export function clienteAdjuntos({ token, pedir = (...a) => fetch(...a), esperar = esperarUnRato }) {
  async function llamar(url, opciones = {}, senal = null) {
    const permiso = token();
    if (!permiso) throw falla('vencida');
    if (senal?.aborted) throw falla('cancelada');
    try {
      return await pedir(url, { ...opciones, headers: { ...opciones.headers, Authorization: `Bearer ${permiso}` }, credentials: 'omit', referrerPolicy: 'no-referrer', signal: senal ?? undefined });
    } catch {
      throw falla(senal?.aborted ? 'cancelada' : 'sin-red');
    }
  }

  const idDe = async (r) => {
    const id = (await r.json().catch(() => null))?.id;
    if (typeof id !== 'string' || !ES_ID.test(id)) throw falla('caido');
    return id;
  };

  /** The folder «Super CVG» this app made in the student's Drive (the oldest, if the student copied it), or a new one. */
  async function carpeta(senal = null) {
    const params = new URLSearchParams({
      q: `name = '${CARPETA_ADJUNTOS}' and mimeType = '${TIPO_CARPETA}' and trashed = false`,
      spaces: 'drive',
      fields: 'files(id)',
      orderBy: 'createdTime',
      pageSize: '10',
    });
    const r = await llamar(`${API_ARCHIVOS}/files?${params}`, {}, senal);
    if (!r.ok) throw await errorDe(r);
    const json = await r.json().catch(() => null);
    if (!Array.isArray(json?.files)) throw falla('caido');
    const hallada = json.files.find((f) => typeof f?.id === 'string' && ES_ID.test(f.id));
    if (hallada) return hallada.id;
    const creada = await llamar(`${API_ARCHIVOS}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: CARPETA_ADJUNTOS, mimeType: TIPO_CARPETA, description: DESCRIPCION_CARPETA }),
    }, senal);
    if (!creada.ok) throw await errorDe(creada);
    return idDe(creada);
  }

  // Where a resumable upload stayed: { desde } with the next byte to send, { id } if it already ended, or null when
  // Google no longer has it.
  async function dondeQuedo(lugar, total, senal) {
    const r = await llamar(lugar, { method: 'PUT', headers: { 'Content-Range': `bytes */${total}` } }, senal);
    if (r.status === 308) return { desde: siguienteByte(r) };
    if (r.ok) return { id: await idDe(r) };
    if (r.status === 404 || r.status === 410) return null;
    if (r.status >= 500) throw falla('caido');
    throw await errorDe(r);
  }

  /** Uploads `archivo` as `nombre` into `carpeta`. `sesion` (in memory) keeps the resumable upload, so trying again goes
   * on where it stayed. `alAvanzar(hecho, total)` after each piece. Resolves with the id of the file. */
  async function subir(archivo, { nombre, carpeta: dentro, sesion = {}, alAvanzar = () => {}, senal = null }) {
    const total = archivo.size;
    const tipo = TIPO.test(archivo.type ?? '') ? archivo.type : 'application/octet-stream';
    const meta = { name: nombre, parents: [dentro] };
    if (total <= TROZO) {
      const limite = `super-cvg-${azar()}`;
      const cuerpo = new Blob([
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`,
        archivo,
        `\r\n--${limite}--`,
      ]);
      const r = await llamar(`${SUBIR_ARCHIVOS}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo }, senal);
      if (!r.ok) throw await errorDe(r);
      const id = await idDe(r);
      alAvanzar(total, total);
      return id;
    }
    let dudoso = Boolean(sesion.lugar);
    if (!sesion.lugar) {
      const inicio = await llamar(`${SUBIR_ARCHIVOS}/files?uploadType=resumable&fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(total) },
        body: JSON.stringify(meta),
      }, senal);
      if (!inicio.ok) throw await errorDe(inicio);
      const lugar = inicio.headers.get('Location');
      if (!lugar || !lugar.startsWith(`${SUBIR_ARCHIVOS}/files?`)) throw falla('caido');
      sesion.lugar = lugar;
      sesion.desde = 0;
    }
    let intentos = 0;
    let quietos = 0;
    for (;;) {
      try {
        if (dudoso) {
          const estado = await dondeQuedo(sesion.lugar, total, senal);
          if (!estado) {
            // Google dropped it (a week later, or it broke): the next try starts again.
            sesion.lugar = null;
            throw falla('caido', { final: true });
          }
          dudoso = false;
          if (estado.id) {
            alAvanzar(total, total);
            return estado.id;
          }
          sesion.desde = estado.desde;
        }
        alAvanzar(sesion.desde, total);
        const fin = Math.min(sesion.desde + TROZO, total);
        const r = await llamar(sesion.lugar, { method: 'PUT', headers: { 'Content-Range': `bytes ${sesion.desde}-${fin - 1}/${total}` }, body: archivo.slice(sesion.desde, fin) }, senal);
        if (r.status === 308) {
          const desde = siguienteByte(r);
          // A piece that Google never keeps would go up forever.
          quietos = desde > sesion.desde ? 0 : quietos + 1;
          if (quietos > 2) throw falla('caido', { final: true });
          sesion.desde = desde;
          intentos = 0;
          continue;
        }
        if (r.ok) {
          const id = await idDe(r);
          alAvanzar(total, total);
          return id;
        }
        if (r.status === 404 || r.status === 410) {
          sesion.lugar = null;
          throw falla('caido', { final: true });
        }
        if (r.status >= 500) throw falla('caido');
        throw await errorDe(r);
      } catch (e) {
        if (e.final || (e.codigo !== 'sin-red' && e.codigo !== 'caido') || intentos >= ESPERAS.length) throw e;
        await esperar(ESPERAS[intentos], senal);
        intentos += 1;
        dudoso = true;
      }
    }
  }

  /** Shares the file with whoever has the link, to see it only. Not findable in a search of Drive. */
  async function compartir(id, senal = null) {
    const r = await llamar(`${API_ARCHIVOS}/files/${encodeURIComponent(id)}/permissions?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ role: 'reader', type: 'anyone', allowFileDiscovery: false }),
    }, senal);
    if (!r.ok) throw await errorDe(r, { compartiendo: true });
  }

  /** Deletes a file this app uploaded, for one that is not going to be sent. Already gone is what was wanted. */
  async function borrar(id) {
    const r = await llamar(`${API_ARCHIVOS}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok && r.status !== 404) throw await errorDe(r);
  }

  return { carpeta, subir, compartir, borrar };
}

// The byte after the last one Google kept, from «Range: bytes=0-1048575». Without it, it kept none.
function siguienteByte(r) {
  const fin = /^bytes=0-(\d+)$/.exec(r.headers.get('Range') ?? '')?.[1];
  return fin === undefined ? 0 : Number(fin) + 1;
}

/** The client for this tab: Google with the student's permission, or the one of the demo (only in npm run dev). */
export async function clienteDeAdjuntos() {
  if (import.meta.env.DEV && esDemo(tokenActual())) return (await import('./demoAdjuntos')).clienteDemo();
  return clienteAdjuntos({ token: () => permisoGoogle('adjuntos') });
}

/** Uploads the file to the folder «Super CVG» and shares it with its link: { id, nombre, bytes, url }. `estado` (in
 * memory, per message) keeps how far it got, so trying again goes on from there: the bytes Google kept, or straight to
 * sharing. `alAvanzar({ paso, hecho, total })`, with `paso` 'subiendo' or 'compartiendo'. Cancelled (`senal`), or when
 * the account doesn't let it share, the file that went up is deleted: nothing half done stays in the Drive. */
export async function prepararAdjunto(archivo, { cliente, estado = {}, alAvanzar = () => {}, senal = null }) {
  const problema = problemaDeArchivo(archivo);
  if (problema) throw Object.assign(new Error(problema), { conocido: true, codigo: 'archivo' });
  const nombre = sanearNombre(archivo.name);
  const total = archivo.size;
  try {
    if (!estado.id) {
      estado.carpeta ??= await cliente.carpeta(senal);
      estado.id = await cliente.subir(archivo, { nombre, carpeta: estado.carpeta, sesion: estado, senal, alAvanzar: (hecho) => alAvanzar({ paso: 'subiendo', hecho, total }) });
    }
    if (!estado.compartido) {
      alAvanzar({ paso: 'compartiendo', hecho: total, total });
      await cliente.compartir(estado.id, senal);
      estado.compartido = true;
    }
  } catch (e) {
    const error = senal?.aborted ? falla('cancelada') : e;
    if (error.codigo === 'cancelada' || error.codigo === 'sin-compartir') await descartarAdjunto(cliente, estado);
    // A permission Google no longer takes: dropped, and renewed without asking if it can.
    if (error.token && tokenGoogle() && tokenGoogle() !== 'demo') {
      olvidarGoogle();
      renovarGoogle();
    }
    throw error;
  }
  return { id: estado.id, nombre, bytes: total, url: linkDeArchivo(estado.id) };
}

/** Deletes from the Drive a file that went up and is not going to be sent, and forgets how far it got. */
export async function descartarAdjunto(cliente, estado) {
  const id = estado?.id;
  if (!estado) return;
  estado.id = null;
  estado.lugar = null;
  estado.desde = 0;
  estado.compartido = false;
  if (id) await cliente.borrar(id).catch(() => {});
}
