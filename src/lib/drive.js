// The hidden folder of Super CVG in the student's Google Drive (appDataFolder): only this app sees it, and the student
// can delete it from Drive (Administrar apps). Straight from the browser to Google, with the student's permission in
// the header: never in an address, without cookies and without saying where it comes from.
export const API_DRIVE = 'https://www.googleapis.com/drive/v3';
export const SUBIR_DRIVE = 'https://www.googleapis.com/upload/drive/v3';
// Up to this, in one request with its name (multipart). Bigger, in a resumable upload.
export const TOPE_DE_UNA = 5 * 1024 * 1024;
const PAGINAS = 20;
const CAMPOS = 'id,name,size,createdTime,modifiedTime,version';

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const TEXTOS = {
  'sin-red': 'Sin conexión, se guarda cuando vuelva.',
  vencida: 'Se cortó la conexión con Google.',
  lleno: 'Tu Google Drive está lleno. Hacé lugar y probá de nuevo.',
  ocupado: 'Google está ocupado. Probá de nuevo en un rato.',
  'no-existe': 'Eso ya no está en tu Drive.',
  caido: 'Google Drive no responde ahora. Probá de nuevo en un rato.',
};
const error = (codigo) => falla(TEXTOS[codigo], codigo);

async function motivo(r) {
  try {
    const json = await r.json();
    return (json?.error?.errors ?? []).map((e) => e?.reason).filter(Boolean);
  } catch {
    return [];
  }
}

/** A client for one student's permission. `token()` gives the permission now; `pedir` is fetch (tests change it). */
export function clienteDrive({ token, pedir = (...a) => fetch(...a) }) {
  async function llamar(url, opciones = {}) {
    const permiso = token();
    if (!permiso) throw error('vencida');
    let r;
    try {
      r = await pedir(url, { ...opciones, headers: { ...opciones.headers, Authorization: `Bearer ${permiso}` }, credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      throw error('sin-red');
    }
    if (r.ok) return r;
    if (r.status === 401) throw error('vencida');
    if (r.status === 404) throw error('no-existe');
    if (r.status === 403 || r.status === 429) {
      const razones = await motivo(r);
      if (razones.includes('storageQuotaExceeded')) throw error('lleno');
      // Too many requests, or the daily quota of the app: it passes on its own.
      if (r.status === 429 || razones.some((x) => /rateLimit|dailyLimit|quota/i.test(x))) throw error('ocupado');
      // Without the Drive part of the permission (the student left it unmarked, or took it away).
      throw error('vencida');
    }
    if (r.status === 507) throw error('lleno');
    throw error('caido');
  }

  /** The files of the folder: all of them, page by page, or only the one called `nombre` (exactly that name).
   * [{ id, name, size, createdTime, modifiedTime, version }]. An answer that isn't a list is an error, never an empty
   * folder. */
  async function listar({ nombre = null } = {}) {
    const todo = [];
    let pageToken = '';
    for (let i = 0; i < PAGINAS; i++) {
      const params = new URLSearchParams({
        spaces: 'appDataFolder',
        q: nombre === null ? 'trashed = false' : `name = '${nombre.replace(/['\\]/g, '')}' and trashed = false`,
        fields: `nextPageToken,files(${CAMPOS})`,
        pageSize: '1000',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const json = await (await llamar(`${API_DRIVE}/files?${params}`)).json().catch(() => null);
      if (!Array.isArray(json?.files)) throw error('caido');
      todo.push(...json.files.filter((f) => f && typeof f.id === 'string' && typeof f.name === 'string'));
      pageToken = typeof json.nextPageToken === 'string' ? json.nextPageToken : '';
      if (!pageToken) break;
    }
    return nombre === null ? todo : todo.filter((f) => f.name === nombre);
  }

  /** How one file is now: { id, name, modifiedTime, version, ... }. Drive raises its version on every change. */
  async function mirar(id) {
    const json = await (await llamar(`${API_DRIVE}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(CAMPOS)}`)).json().catch(() => null);
    if (typeof json?.id !== 'string') throw error('caido');
    return json;
  }

  const bajar = (id) => llamar(`${API_DRIVE}/files/${encodeURIComponent(id)}?alt=media`);

  /** Saves `blob` as `nombre`: a new file, or over `id`. Resolves with its id. */
  async function subir({ id = null, nombre, blob }) {
    const tipo = blob.type || 'application/octet-stream';
    const meta = id ? {} : { name: nombre, parents: ['appDataFolder'] };
    const destino = id ? `${SUBIR_DRIVE}/files/${encodeURIComponent(id)}` : `${SUBIR_DRIVE}/files`;
    const metodo = id ? 'PATCH' : 'POST';
    if (blob.size <= TOPE_DE_UNA) {
      const limite = `super-cvg-${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
      const cuerpo = new Blob([
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
        `--${limite}\r\nContent-Type: ${tipo}\r\n\r\n`,
        blob,
        `\r\n--${limite}--`,
      ]);
      const r = await llamar(`${destino}?uploadType=multipart&fields=id`, { method: metodo, headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo });
      return (await r.json().catch(() => ({})))?.id ?? id;
    }
    // Resumable: first its name, then the bytes to the address Google gives back.
    const inicio = await llamar(`${destino}?uploadType=resumable&fields=id`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': tipo, 'X-Upload-Content-Length': String(blob.size) },
      body: JSON.stringify(meta),
    });
    const lugar = inicio.headers.get('Location');
    if (!lugar || !lugar.startsWith(`${SUBIR_DRIVE}/`)) throw error('caido');
    const r = await llamar(lugar, { method: 'PUT', headers: { 'Content-Type': tipo }, body: blob });
    return (await r.json().catch(() => ({})))?.id ?? id;
  }

  async function borrar(id) {
    try {
      await llamar(`${API_DRIVE}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (e) {
      // Already gone is what was wanted.
      if (e.codigo !== 'no-existe') throw e;
    }
  }

  return { listar, mirar, bajar, subir, borrar };
}
