// Files in Mensajes without Google Drive: El Santo Resumen keeps them for 45 days (route `cvg-temporal` of its service).
// The file is locked here, in the browser, with a key made for it (AES-GCM): the service only gets bytes it can't read,
// and its name goes inside them. The key travels only in the link of the message, after the `#`, which no browser sends
// to any server:
//
//   Archivo adjunto: <name> (<size>)
//   https://supercvg.lutastudios.com/archivo#<id>.<key>
//
// The campus shows it as any link; it opens in Super CVG (/archivo), which takes it out of the address at once. Inside
// Super CVG the card of the message opens it right there. Nothing of it is written to disk: the file is unlocked in
// memory and shows in the preview (PDF or picture, typed by its name) or is downloaded.
// Asking the service: `POST ?a=cvg-temporal` with { bytes } gives { id, subida, vence }, `subida` being a one-time
// address of its storage where the locked bytes go with a PUT; `GET ?a=cvg-temporal&id=` gives { url, bytes, vence },
// a short-lived address to bring them. No cookies, no referrer, nothing of the campus.
import { sanearNombre } from './adjuntos';
import { esDemo } from './modoDemo';
import { mimeDe } from './propiasSaneo';
import { SERVICIO } from './santoResumen';
import { tokenActual } from './sesion';

export const TOPE_TEMPORAL = 20 * 1024 * 1024;
export const TOPE_TEMPORAL_EN_TEXTO = '20 MB';
// How long the service keeps one, to say until when a card opens.
export const DIAS_TEMPORAL = 45;
export const ORIGEN_TEMPORAL = 'https://supercvg.lutastudios.com';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LLAVE = '[A-Za-z0-9_-]{43}';
const LINK = new RegExp(`^https://supercvg\\.lutastudios\\.com/archivo#(${UUID})\\.(${LLAVE})$`);
const FRAGMENTO = new RegExp(`^#(${UUID})\\.(${LLAVE})$`);
const ES_ID = new RegExp(`^${UUID}$`);
const IV = 12;
// What the lock adds: the iv in front, the tag at the end, and the name in front of the file.
const LARGO_NOMBRE = 2 + 400;
export const EXTRA_CIFRADO = IV + 16 + LARGO_NOMBRE;

const TEXTOS = {
  'sin-red': 'Sin conexión. Probá de nuevo cuando vuelva.',
  pesado: `Sin Google Drive, el tope es de ${TOPE_TEMPORAL_EN_TEXTO}. Conectá tu Drive para mandarlo.`,
  muchos: 'Mandaste muchos archivos sin Drive por hoy. Probá mañana o conectá tu Google Drive.',
  lleno: 'Ahora no hay lugar para archivos sin Drive. Conectá tu Google Drive para mandarlo.',
  caido: 'El servicio de archivos no responde ahora. Probá de nuevo en un rato.',
  vencido: 'Este archivo ya no está. Los que se mandan sin Drive duran 45 días.',
  roto: 'Este archivo no se abre. El link está incompleto o cambiado.',
  cancelada: 'Cancelaste el envío.',
};
const falla = (codigo) => Object.assign(new Error(TEXTOS[codigo]), { conocido: true, codigo });
/** The errors where Google Drive is the way out. */
export const CON_DRIVE = new Set(['pesado', 'muchos', 'lleno']);

const aBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function deBase64(texto) {
  const b = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** The address of a file sent without Drive. Only for a checked id and key. */
export const linkTemporal = (id, llave) => `${ORIGEN_TEMPORAL}/archivo#${id}.${llave}`;

/** { id, llave } from the text of a link, or null if it isn't exactly one of these. */
export function leerLinkTemporal(texto) {
  const m = LINK.exec(String(texto ?? '').trim());
  return m ? { id: m[1], llave: m[2] } : null;
}

/** { id, llave } from the `#` of /archivo, or null. */
export function leerFragmento(hash) {
  const m = FRAGMENTO.exec(String(hash ?? ''));
  return m ? { id: m[1], llave: m[2] } : null;
}

/** Until when a file sent at `cuando` (seconds) opens. */
export const venceEl = (cuando) => new Date((cuando + DIAS_TEMPORAL * 86_400) * 1000);

// ----- The lock. What goes in: two bytes with the length of the name, the name, the file.

const nueva = (llave, usos) => crypto.subtle.importKey('raw', llave, 'AES-GCM', false, usos);

/** The file locked, with its key: { bytes (Uint8Array), llave (text for the link) }. */
export async function cifrar(archivo, nombre) {
  const deNombre = new TextEncoder().encode(String(nombre)).slice(0, LARGO_NOMBRE - 2);
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  const claro = new Uint8Array(2 + deNombre.length + contenido.length);
  new DataView(claro.buffer).setUint16(0, deNombre.length);
  claro.set(deNombre, 2);
  claro.set(contenido, 2 + deNombre.length);
  const llave = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(IV));
  const cerrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await nueva(llave, ['encrypt']), claro));
  const bytes = new Uint8Array(IV + cerrado.length);
  bytes.set(iv);
  bytes.set(cerrado, IV);
  return { bytes, llave: aBase64(llave) };
}

/** The file unlocked: { nombre, blob }, the blob typed only by its name (PDF or picture, or a plain download). */
export async function descifrar(bytes, llave) {
  let claro;
  try {
    const datos = new Uint8Array(bytes);
    const iv = datos.slice(0, IV);
    claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await nueva(deBase64(llave), ['decrypt']), datos.slice(IV)));
  } catch {
    throw falla('roto');
  }
  if (claro.length < 2) throw falla('roto');
  const largo = new DataView(claro.buffer).getUint16(0);
  if (claro.length < 2 + largo) throw falla('roto');
  const nombre = sanearNombre(new TextDecoder().decode(claro.slice(2, 2 + largo)));
  return { nombre, blob: new Blob([claro.slice(2 + largo)], { type: mimeDe(nombre) }) };
}

// ----- The service.

const errorDe = (status) => {
  if (status === 404) return falla('vencido');
  if (status === 413) return falla('pesado');
  if (status === 429) return falla('muchos');
  if (status === 507) return falla('lleno');
  return falla('caido');
};

async function pedir(url, opciones, senal) {
  let r;
  try {
    r = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: senal, ...opciones });
  } catch {
    if (senal?.aborted) throw falla('cancelada');
    throw falla('sin-red');
  }
  if (!r.ok) throw errorDe(r.status);
  try {
    return await r.json();
  } catch {
    throw falla('caido');
  }
}

// The locked bytes to the one-time address, with how far they went.
function subirBytes(url, bytes, { alAvanzar, senal }) {
  return new Promise((ok, mal) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => alAvanzar(Math.min(e.loaded, bytes.length));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? ok() : mal(errorDe(xhr.status)));
    xhr.onerror = () => mal(falla('sin-red'));
    xhr.onabort = () => mal(falla('cancelada'));
    senal?.addEventListener('abort', () => xhr.abort(), { once: true });
    if (senal?.aborted) xhr.abort();
    else xhr.send(bytes);
  });
}

const ES_URL = (u) => typeof u === 'string' && u.startsWith('https://lomhlulbgfovtnljbqzp.supabase.co/');

/** The client against El Santo Resumen. `pedirJson` and `subir` change in the tests. */
export function clienteTemporales({ servicio = SERVICIO, pedirJson = pedir, subir = subirBytes, traer = fetch } = {}) {
  return {
    async reservar(bytes, senal) {
      const r = await pedirJson(`${servicio}?a=cvg-temporal`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bytes }) }, senal);
      if (!ES_ID.test(String(r?.id ?? '')) || !ES_URL(r?.subida)) throw falla('caido');
      return { id: r.id, subida: r.subida };
    },
    subir,
    async bajar(id, senal) {
      if (!ES_ID.test(id)) throw falla('roto');
      const r = await pedirJson(`${servicio}?a=cvg-temporal&id=${id}`, {}, senal);
      if (!ES_URL(r?.url)) throw falla('caido');
      let res;
      try {
        res = await traer(r.url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: senal });
      } catch {
        throw falla('sin-red');
      }
      if (!res.ok) throw errorDe(res.status);
      return res.arrayBuffer();
    },
  };
}

/** The client for this tab: the service, or the pretend one of the demo (only in npm run dev). */
export async function clienteDeTemporales() {
  if (import.meta.env.DEV && esDemo(tokenActual())) return (await import('./demoTemporales')).clienteDemoTemporal();
  return clienteTemporales();
}

/** Locks the file and sends it: { id, llave, nombre, bytes, url }. `estado` (per message, in memory) keeps what went, so
 * trying again after it went up only sends the message. `alAvanzar({ paso, hecho, total })`, `paso` 'subiendo'. */
export async function prepararTemporal(archivo, { cliente, nombre, estado = {}, alAvanzar = () => {}, senal = null }) {
  if (archivo.size > TOPE_TEMPORAL) throw falla('pesado');
  const total = archivo.size;
  if (!estado.id) {
    alAvanzar({ paso: 'subiendo', hecho: 0, total });
    const { bytes, llave } = await cifrar(archivo, nombre);
    if (senal?.aborted) throw falla('cancelada');
    const { id, subida } = await cliente.reservar(bytes.length, senal);
    await cliente.subir(subida, bytes, { senal, alAvanzar: (hecho) => alAvanzar({ paso: 'subiendo', hecho: Math.min(total, hecho), total }) });
    estado.id = id;
    estado.llave = llave;
  }
  return { id: estado.id, llave: estado.llave, nombre, bytes: total, url: linkTemporal(estado.id, estado.llave) };
}

/** Brings and unlocks one: { nombre, blob }. */
export async function abrirTemporal({ id, llave }, { cliente, senal = null } = {}) {
  const bytes = await (cliente ?? (await clienteDeTemporales())).bajar(id, senal);
  return descifrar(bytes, llave);
}
