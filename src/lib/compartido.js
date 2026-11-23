// What another app shared with Super CVG, read back by the page (Compartir.jsx). The service worker received it and
// kept it in its own Cache Storage (scripts/trabajador/sw.js, rules in compartidoSaneo.js): it waits there only until
// the student places it (a section of a course, or Consultron), cancels, half an hour goes by or someone signs out
// (sesion.js). Nothing of it goes to the address, to localStorage or anywhere else.
import { COMPARTIDO, TIPOS_COMPARTIDOS, enlaceCompartido, lineaCompartida, nombreCompartido } from './compartidoSaneo';

const hayCaches = () => typeof caches !== 'undefined';
// Whether this visit deleted one that waited too long, so its screen says so instead of «nothing here». Only that, in
// memory.
let vencio = false;

/** Whether one was deleted for being too old since the last time this was asked. */
export function tomarVencido() {
  const v = vencio;
  vencio = false;
  return v;
}

const viejo = (crudo, ahora) => Boolean(crudo && Number.isFinite(crudo.cuando) && ahora - crudo.cuando > COMPARTIDO.vida);
const lugar = (i) => new URL(`${import.meta.env.BASE_URL}${COMPARTIDO.ruta}${i}`, window.location.origin).href;

/** Deletes what is waiting, if anything. Never fails. */
export async function borrarCompartido() {
  if (!hayCaches()) return;
  await caches.delete(COMPARTIDO.cache).catch(() => {});
}

// The list as the worker wrote it, checked again: what isn't as expected is left out.
function datosDe(crudo, ahora) {
  if (!crudo || typeof crudo !== 'object' || !Number.isFinite(crudo.cuando)) return null;
  if (ahora - crudo.cuando > COMPARTIDO.vida || crudo.cuando - ahora > 60_000) return null;
  const archivos = (Array.isArray(crudo.archivos) ? crudo.archivos : [])
    .slice(0, COMPARTIDO.archivos)
    .filter((a) => a && Object.hasOwn(TIPOS_COMPARTIDOS, a.tipo))
    .map((a, i) => ({ i, tipo: a.tipo, nombre: nombreCompartido(a.nombre, a.tipo) }));
  const fuera = (Array.isArray(crudo.fuera) ? crudo.fuera : [])
    .slice(0, COMPARTIDO.fuera)
    .filter((f) => f && ['tipo', 'peso', 'cantidad', 'total'].includes(f.por))
    .map((f) => ({ nombre: lineaCompartida(f.nombre, COMPARTIDO.nombre) || 'Un archivo', por: f.por }));
  const texto = String(crudo.texto ?? '').replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === '\n' ? c : ' ')).slice(0, COMPARTIDO.texto).trim();
  return { cuando: crudo.cuando, titulo: lineaCompartida(crudo.titulo, COMPARTIDO.titulo), texto, enlace: crudo.enlace ? enlaceCompartido(crudo.enlace) : null, archivos, fuera };
}

/** What is waiting: { cuando, titulo, texto, enlace, archivos: [File], fuera: [{ nombre, por }] }, or null if nothing
 * is (or it was too old: then it's deleted here). */
export async function leerCompartido(ahora = Date.now()) {
  if (!hayCaches() || !(await caches.has(COMPARTIDO.cache).catch(() => false))) return null;
  try {
    const cache = await caches.open(COMPARTIDO.cache);
    const crudo = await (await cache.match(lugar('datos')))?.json();
    const datos = datosDe(crudo, ahora);
    if (!datos) {
      if (viejo(crudo, ahora)) vencio = true;
      await borrarCompartido();
      return null;
    }
    const archivos = [];
    for (const a of datos.archivos) {
      const blob = await (await cache.match(lugar(a.i)))?.blob();
      if (blob?.size) archivos.push(new File([blob], a.nombre, { type: TIPOS_COMPARTIDOS[a.tipo] }));
    }
    const conAlgo = archivos.length || datos.enlace || datos.texto || datos.titulo;
    if (!conAlgo && !datos.fuera.length) {
      await borrarCompartido();
      return null;
    }
    return { ...datos, archivos };
  } catch {
    await borrarCompartido();
    return null;
  }
}

/** What waited too long goes, even if the student never opens its screen: called when the site opens. */
export async function limpiarCompartidoViejo() {
  if (!hayCaches() || !(await caches.has(COMPARTIDO.cache).catch(() => false))) return;
  try {
    const cache = await caches.open(COMPARTIDO.cache);
    const crudo = await (await cache.match(lugar('datos')))?.json();
    if (datosDe(crudo, Date.now())) return;
    if (viejo(crudo, Date.now())) vencio = true;
    await borrarCompartido();
  } catch {
    await borrarCompartido();
  }
}

/** What Consultron reads per question (consultron/adjuntar.js, MAX_ADJUNTOS: a test checks they match), without bringing
 * that module to this screen. */
export const LEE_CONSULTRON = 5;

/** The text and the link as a text file, for Consultron (it reads attached files). */
export function comoTexto({ titulo, texto, enlace }) {
  const cuerpo = [titulo, texto, enlace].filter(Boolean).join('\n\n');
  return new File([cuerpo], 'Lo que compartiste.txt', { type: 'text/plain' });
}
