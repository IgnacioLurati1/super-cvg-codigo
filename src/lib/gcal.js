// The calendar «Super CVG» in the student's Google Calendar: the permission only lets this app touch the calendars it
// creates, never the student's others. Straight from the browser to Google, with the student's permission in the
// header: never in an address, without cookies and without saying where it comes from.
export const API_CALENDARIO = 'https://www.googleapis.com/calendar/v3';
const PAGINAS = 10;

const falla = (texto, codigo) => Object.assign(new Error(texto), { conocido: true, codigo });
const TEXTOS = {
  'sin-red': 'Sin conexión, se pasan cuando vuelva.',
  vencida: 'Se cortó la conexión con Google.',
  ocupado: 'Google está ocupado. Probá de nuevo en un rato.',
  'no-existe': 'Eso ya no está en tu Google Calendar.',
  duplicado: 'Esa fecha ya estaba en tu Google Calendar.',
  caido: 'Google Calendar no responde ahora. Probá de nuevo en un rato.',
  rechazado: 'Google Calendar no aceptó esa fecha.',
};
const error = (codigo) => falla(TEXTOS[codigo], codigo);
const ruta = (...partes) => `${API_CALENDARIO}/${partes.map((p) => encodeURIComponent(p)).join('/')}`;

async function motivo(r) {
  try {
    const json = await r.json();
    return (json?.error?.errors ?? []).map((e) => e?.reason).filter(Boolean);
  } catch {
    return [];
  }
}

/** A client for one student's permission. `token()` gives the permission now; `pedir` is fetch (tests change it). */
export function clienteCalendario({ token, pedir = (...a) => fetch(...a) }) {
  async function llamar(url, { cuerpo, ...opciones } = {}) {
    const permiso = token();
    if (!permiso) throw error('vencida');
    const headers = { Authorization: `Bearer ${permiso}`, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json; charset=UTF-8' }) };
    let r;
    try {
      r = await pedir(url, { ...opciones, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), credentials: 'omit', referrerPolicy: 'no-referrer' });
    } catch {
      throw error('sin-red');
    }
    if (r.ok) return r;
    if (r.status === 401) throw error('vencida');
    if (r.status === 404 || r.status === 410) throw error('no-existe');
    if (r.status === 409) throw error('duplicado');
    if (r.status === 400) throw error('rechazado');
    if (r.status === 403 || r.status === 429) {
      const razones = await motivo(r);
      if (r.status === 429 || razones.some((x) => /rateLimit|quota|dailyLimit/i.test(x))) throw error('ocupado');
      // Without the calendar part of the permission (left unmarked, or taken away).
      throw error('vencida');
    }
    throw error('caido');
  }
  const json = async (r) => {
    const datos = await r.json().catch(() => null);
    if (!datos || typeof datos !== 'object') throw error('caido');
    return datos;
  };

  /** Creates a calendar of this app. Resolves with its id. */
  async function crear({ nombre, descripcion, zona }) {
    const datos = await json(await llamar(ruta('calendars'), { method: 'POST', cuerpo: { summary: nombre, description: descripcion, timeZone: zona } }));
    if (typeof datos.id !== 'string' || !datos.id) throw error('caido');
    return datos.id;
  }

  /** Whether the calendar is still there: { id, summary }, or the error `no-existe` if the student deleted it. */
  async function mirar(id) {
    const datos = await json(await llamar(`${ruta('calendars', id)}?fields=id,summary`));
    if (datos.id !== id) throw error('caido');
    return datos;
  }

  async function borrarCalendario(id) {
    try {
      await llamar(ruta('calendars', id), { method: 'DELETE' });
    } catch (e) {
      // Already gone is what was wanted.
      if (e.codigo !== 'no-existe') throw e;
    }
  }

  /** Every event of the calendar that is not deleted, with what both sides share, page by page. An answer that isn't a
   * list is an error, never an empty calendar. */
  async function eventos(id) {
    const todo = [];
    let pageToken = '';
    for (let i = 0; i < PAGINAS; i++) {
      const params = new URLSearchParams({ maxResults: '2500', showDeleted: 'false', fields: 'nextPageToken,items(id,status,summary,description,start,end,updated,recurrence,recurringEventId,extendedProperties)' });
      if (pageToken) params.set('pageToken', pageToken);
      const datos = await json(await llamar(`${ruta('calendars', id, 'events')}?${params}`));
      if (!Array.isArray(datos.items)) throw error('caido');
      todo.push(...datos.items.filter((e) => e && typeof e.id === 'string'));
      pageToken = typeof datos.nextPageToken === 'string' ? datos.nextPageToken : '';
      if (!pageToken) break;
    }
    return todo;
  }

  /** Writes an event with its own id: a new one, or over the one that is there. One deleted before keeps its id in
   * Google, so adding it again answers 409 and it is written over instead. */
  async function poner(id, evento, { nuevo = false } = {}) {
    const sobre = () => llamar(ruta('calendars', id, 'events', evento.id), { method: 'PUT', cuerpo: evento });
    if (!nuevo) {
      try {
        await sobre();
        return;
      } catch (e) {
        if (e.codigo !== 'no-existe') throw e;
      }
    }
    try {
      await llamar(ruta('calendars', id, 'events'), { method: 'POST', cuerpo: evento });
    } catch (e) {
      if (e.codigo !== 'duplicado') throw e;
      await sobre();
    }
  }

  /** Changes only what Super CVG shares with Google: what the student set there (a description of theirs, the color, the
   * reminders) stays. */
  async function cambiar(id, evento) {
    const { summary, description, start, end, source, extendedProperties } = evento;
    const parche = { summary, start, end, extendedProperties, ...(description === undefined ? {} : { description }), ...(source ? { source } : {}) };
    await llamar(ruta('calendars', id, 'events', evento.id), { method: 'PATCH', cuerpo: parche });
  }

  async function quitar(id, eventoId) {
    try {
      await llamar(ruta('calendars', id, 'events', eventoId), { method: 'DELETE' });
    } catch (e) {
      if (e.codigo !== 'no-existe') throw e;
    }
  }

  return { crear, mirar, borrarCalendario, eventos, poner, cambiar, quitar };
}
