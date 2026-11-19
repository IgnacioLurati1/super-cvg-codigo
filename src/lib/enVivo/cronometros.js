// The Cronómetro of a live session, in its bar: stopwatches and countdowns everyone shares. Each one is a plain object in
// the session's own map (`cronometrosDeLaSesion`), under `c:<id>`, so two people touching two of them never step on
// each other:
//
//   { nombre, modo: 'cronometro' | 'cuenta', duracion, acumulado, desde, cuando }
//
// `acumulado` is the time counted before the last start; `desde`, the clock of whoever started it (null while
// stopped). Each browser counts with its own clock: a clock that is a few seconds off shows those seconds off.
// Everything here comes from the others too: it is read back checked and cut.

export const MAX_CRONOMETROS = 8;
export const MAX_NOMBRE = 40;
export const MODOS = ['cronometro', 'cuenta'];
export const NOMBRE_DEL_MODO = { cronometro: 'Cronómetro', cuenta: 'Cuenta regresiva' };
// A countdown from a minute to ten hours; it starts at 25 minutes.
export const DURACION = { min: 60_000, max: 10 * 3_600_000, porDefecto: 25 * 60_000 };

const CLAVE = /^c:[0-9a-f]{12}$/;

/** Where the session keeps them: its own place of the Y.Doc, not a tab. */
export const cronometrosDeLaSesion = (doc) => doc.getMap('cronometros');
const nuevoId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
// eslint-disable-next-line no-control-regex
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : '');
const numero = (v, min, max, otro) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : otro);
// Nothing counts more than a day: a stopwatch someone forgot doesn't grow without end.
const DIA = 86_400_000;

export const duracionValida = (v) => numero(v, DURACION.min, DURACION.max, DURACION.porDefecto);

// One timer as it was written, checked; null if it doesn't read.
const leer = (v, id) => {
  if (!v || typeof v !== 'object' || !MODOS.includes(v.modo)) return null;
  return {
    id,
    nombre: texto(v.nombre, MAX_NOMBRE).trim() || NOMBRE_DEL_MODO[v.modo],
    modo: v.modo,
    duracion: duracionValida(v.duracion),
    acumulado: numero(v.acumulado, 0, DIA, 0),
    desde: typeof v.desde === 'number' && Number.isFinite(v.desde) && v.desde > 0 ? v.desde : null,
    cuando: Number(v.cuando) || 0,
  };
};

/** The timers of the tab, in the order they were added: [{ id, nombre, modo, duracion, acumulado, desde, cuando }]. */
export function cronometros(datos) {
  const lista = [];
  datos.forEach((v, clave) => {
    const c = CLAVE.test(clave) ? leer(v, clave.slice(2)) : null;
    if (c) lista.push(c);
  });
  return lista.sort((a, b) => a.cuando - b.cuando || a.id.localeCompare(b.id)).slice(0, MAX_CRONOMETROS);
}

/** How long it has counted, at `ahora`. */
export const transcurrido = (c, ahora) => Math.min(DIA, c.acumulado + (c.desde ? Math.max(0, ahora - c.desde) : 0));

/** What a countdown has left (0 once it ended). */
export const restante = (c, ahora) => Math.max(0, c.duracion - transcurrido(c, ahora));

/** A countdown that reached zero. */
export const termino = (c, ahora) => c.modo === 'cuenta' && transcurrido(c, ahora) >= c.duracion;

/** When a running countdown reaches zero, in this browser's clock; null if it isn't running or already did. */
export const cuandoTermina = (c, ahora) => (c.modo === 'cuenta' && c.desde && !termino(c, ahora) ? ahora + restante(c, ahora) : null);

/** What the digits say: «4:05», «1:02:09». A countdown rounds up, so it reads 0:00 only when it ended. */
export function enReloj(ms, { arriba = false } = {}) {
  const total = arriba ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The same, said: «4 minutos y 5 segundos». For the readers, which read 4:05 as a time of day. */
export function enPalabras(ms, { arriba = false } = {}) {
  const total = arriba ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const partes = [[Math.floor(total / 3600), 'hora', 'horas'], [Math.floor((total % 3600) / 60), 'minuto', 'minutos'], [total % 60, 'segundo', 'segundos']]
    .filter(([n]) => n > 0)
    .map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
  if (!partes.length) return '0 segundos';
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
}

const cambiar = (datos, id, f) => {
  const clave = `c:${id}`;
  const v = datos.get(clave);
  if (!v || typeof v !== 'object') return;
  datos.set(clave, { ...v, ...f(v) });
};

/** Adds one, stopped. Returns its id (null past the top). */
export function agregar(datos, modo, ahora = Date.now()) {
  if (!MODOS.includes(modo) || cronometros(datos).length >= MAX_CRONOMETROS) return null;
  const id = nuevoId();
  datos.set(`c:${id}`, { nombre: '', modo, duracion: DURACION.porDefecto, acumulado: 0, desde: null, cuando: ahora });
  return id;
}

export function iniciar(datos, id, ahora = Date.now()) {
  cambiar(datos, id, (v) => (v.desde ? {} : { desde: ahora }));
}

/** Stops it where it is: what it counted stays. */
export function pausar(datos, id, ahora = Date.now()) {
  cambiar(datos, id, (v) => {
    const c = leer(v, id);
    return c?.desde ? { acumulado: transcurrido(c, ahora), desde: null } : {};
  });
}

/** Back to zero (a countdown, back to its whole time), stopped. */
export function reiniciar(datos, id) {
  cambiar(datos, id, () => ({ acumulado: 0, desde: null }));
}

export function quitar(datos, id) {
  datos.delete(`c:${id}`);
}

export function renombrar(datos, id, nombre) {
  cambiar(datos, id, () => ({ nombre: texto(nombre, MAX_NOMBRE) }));
}

/** A countdown's whole time. Only before it starts: then it is back at zero. */
export function cambiarDuracion(datos, id, duracion) {
  cambiar(datos, id, () => ({ duracion: duracionValida(duracion), acumulado: 0, desde: null }));
}
