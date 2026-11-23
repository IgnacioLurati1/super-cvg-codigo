import { useMemo, useSyncExternalStore } from 'react';
import { conRespaldo } from './respaldo';
import { FORMATOS, ID, INSTANCIAS, leerFoto, limpio, nombreDeMateria, SANTO, SERVICIO, SIN_RED, SIN_RESPUESTA, SLUG, urlDeResumen } from './santoResumen';
import { borrarAparte, huellaDe } from './sinInternet';

// Resúmenes: the student's own account of El Santo Resumen, linked to this browser. El Santo Resumen opens
// /resumenes#vincular=<code>: one use, a few minutes, after the «#» so it never reaches a server. The code leaves the
// address and is traded for a key at once, before the student signs in to the campus. The key waits in memory until it
// is known whose campus account this is; then it and the account name stay in this browser, per campus student
// (`cl.santo.<id>`), until Desvincular. The key only reads
// what that account uploaded and sent here, takes one of those out and unlinks itself. It travels only in the
// x-utn-llave header, never in an address or a log. What comes back stays in memory, like the campus data, and with
// «Seguir conectado» the lists are also kept for offline (respaldo.js) under a fingerprint of the key, never the key.
//   POST ?a=cvg-canjear { codigo }  201 { llave, usuario }  400 codigo (wrong, expired or used)  429 tope-ip  403 sin-ip
//   GET  ?a=cvg-resumenes            200 { usuario, subidos, enviados }
//   POST ?a=cvg-quitar { id }         204
//   POST ?a=cvg-desvincular           204
// With the key: 401 llave (missing, wrong or gone) and 403 bloqueada.

export const CUENTA_SANTO = `${SANTO}/#cuenta`;
export const BANCO_SANTO = `${SANTO}/banco.html`;
const PREFIJO = 'cl.santo.';
const CABECERA = 'x-utn-llave';
const CODIGO = /^[A-Za-z0-9_-]{32}$/;
const LLAVE = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_LISTA = 300;

export const TEXTOS = {
  vencido: 'El link venció o ya se usó. En El Santo Resumen, abrí tu cuenta y tocá de nuevo «Vincular con Super CVG».',
  cortado: 'El vínculo con El Santo Resumen se cortó. Volvé a vincularlo para ver tus resúmenes.',
  bloqueada: 'Tu cuenta de El Santo Resumen está bloqueada, así que sus resúmenes no se ven acá.',
  muchos: 'Hubo muchos intentos seguidos desde tu conexión. Esperá un rato y pedí un link nuevo en El Santo Resumen.',
  noSePudo: 'No se pudo vincular. Pedí un link nuevo en El Santo Resumen y probá otra vez.',
};

const falla = (texto, extra = {}) => Object.assign(new Error(texto), { conocido: true, ...extra });
const deLista = (objeto, clave) => (typeof clave === 'string' && Object.hasOwn(objeto, clave) ? objeto[clave] : '');
const esAlumno = (id) => Number.isSafeInteger(id) && id > 0;

// ---------- The code in the address ----------

/** What the address brings to link: { codigo } with a well-formed one, { invalido: true } with anything else after
 * «#vincular=», or null. Only on /resumenes. */
export function codigoDeDireccion(pathname, hash) {
  if (typeof pathname !== 'string' || typeof hash !== 'string') return null;
  if (!/\/resumenes\/?$/.test(pathname) || !hash.startsWith('#vincular=')) return null;
  const codigo = hash.slice('#vincular='.length);
  return CODIGO.test(codigo) ? { codigo } : { invalido: true };
}

// The trade, as screens see it: the code waiting (`pendiente`, the same object until it changes), whether it is being
// traded, a failure on the way that can be tried again (`falla`), a key waiting for the campus student (`esperando`),
// and how the last one ended (`resultado`: { vinculado: usuario }, { vencido: true } or { error: text }). A screen uses
// useCanje, which redraws when it changes.
const SIN_CODIGO = Object.freeze({ pendiente: null, canjeando: false, falla: '', esperando: false, resultado: null });
let canje = SIN_CODIGO;
let enCurso = null;
// The key just traded, only in memory until it is known whose campus account this is. A reload loses it: the
// service keeps a few per account and drops the oldest.
let enEspera = null;
const esperan = new Set();
const poner = (cambios) => {
  canje = { ...canje, ...cambios };
  esperan.forEach((f) => f());
};

export const estadoCanje = () => canje;

export function useCanje() {
  return useSyncExternalStore((f) => {
    esperan.add(f);
    return () => esperan.delete(f);
  }, estadoCanje, () => SIN_CODIGO);
}

/** A link from El Santo Resumen is on its way, or ended in this tab: after signing in, the student goes to see it. */
export const hayVinculoEnCurso = () => canje.pendiente !== null || canje.esperando || canje.resultado !== null;

/** How the last trade ended stops showing (the screen was left, or the account unlinked). */
export function olvidarResultado() {
  if (canje.resultado) poner({ resultado: null });
}

/** Trades the waiting code, once, and returns how it ended (null with no code). Whoever asks while it runs shares the
 * same trade. No internet or no answer throws and the code keeps waiting, so «Probar de nuevo» sends it again. Any
 * other answer throws too, and the code is done. The key waits in memory for adoptarVinculo. */
export function canjearPendiente() {
  const hallado = canje.pendiente;
  if (!hallado) return Promise.resolve(null);
  if (enCurso) return enCurso;
  poner({ canjeando: true, falla: '' });
  const este = (async () => {
    if (hallado.invalido) return { vencido: true };
    const r = await pedir('cvg-canjear', { metodo: 'POST', cuerpo: { codigo: hallado.codigo } });
    if (r.status === 201) {
      const nuevo = leerVinculoCrudo(r.datos);
      if (!nuevo) throw falla(TEXTOS.noSePudo, { final: true });
      return nuevo;
    }
    if (r.status === 400 && r.error === 'codigo') return { vencido: true };
    if (r.status === 429) throw falla(TEXTOS.muchos, { final: true });
    if (r.status >= 500) throw falla(SIN_RESPUESTA);
    throw falla(TEXTOS.noSePudo, { final: true });
  })().then(
    (valor) => {
      if (enCurso === este) enCurso = null;
      if (canje.pendiente !== hallado) return null;
      if (valor.vencido) {
        poner({ pendiente: null, canjeando: false, resultado: valor });
        return valor;
      }
      enEspera = valor;
      poner({ pendiente: null, canjeando: false, esperando: true, resultado: { vinculado: valor.usuario } });
      return { vinculado: valor.usuario };
    },
    (e) => {
      if (enCurso === este) enCurso = null;
      if (canje.pendiente === hallado) poner(e.final ? { pendiente: null, canjeando: false, resultado: { error: e.message } } : { canjeando: false, falla: e.message });
      throw e;
    },
  );
  enCurso = este;
  return este;
}

/** The key that waits in memory goes to this browser, for the campus student `alumno`. If it had another one, that
 * one stops working there too (linked again, maybe with another account). True if there was one. */
export function adoptarVinculo(alumno) {
  if (!enEspera || !esAlumno(alumno)) return false;
  const nuevo = enEspera;
  const anterior = leerVinculo(alumno);
  if (!guardarVinculo(alumno, nuevo)) return false;
  enEspera = null;
  poner({ esperando: false });
  if (anterior && anterior.llave !== nuevo.llave) desvincular(anterior.llave).catch(() => {});
  return true;
}

/** Takes the code out of the address and the history, and trades it at once, before the student signs in to the
 * campus: it lasts only a few minutes. True if there was one. */
export function tomarCodigoDeDireccion(ventana = window) {
  const { pathname, search, hash } = ventana.location;
  const hallado = codigoDeDireccion(pathname, hash);
  if (!hallado) return false;
  ventana.history.replaceState(ventana.history.state, '', pathname + search);
  enCurso = null;
  enEspera = null;
  poner({ pendiente: hallado, canjeando: false, falla: '', esperando: false, resultado: null });
  canjearPendiente().catch(() => {});
  return true;
}

let iniciado = false;
/** Once, when the app loads and before any request. Also when the link is opened in a tab already on /resumenes:
 * then only the «#» changes and the page does not load again. */
export function iniciarVinculo(ventana = window) {
  tomarCodigoDeDireccion(ventana);
  if (iniciado) return;
  iniciado = true;
  ventana.addEventListener('hashchange', () => tomarCodigoDeDireccion(ventana));
}

// ---------- The key in this browser ----------

function leerVinculoCrudo(datos) {
  if (!datos || typeof datos !== 'object' || typeof datos.llave !== 'string' || !LLAVE.test(datos.llave)) return null;
  const usuario = limpio(datos.usuario, 40);
  return usuario ? { llave: datos.llave, usuario } : null;
}

const crudo = (alumno) => {
  if (!esAlumno(alumno)) return null;
  try {
    return localStorage.getItem(PREFIJO + alumno);
  } catch {
    return null;
  }
};

function parsear(texto) {
  if (!texto) return null;
  try {
    return leerVinculoCrudo(JSON.parse(texto));
  } catch {
    return null;
  }
}

const avisados = new Set();
const avisar = () => avisados.forEach((f) => f());

/** A link as stored, checked: { llave, usuario }, or null. Also for one that comes from Drive (entrarConGoogle.js). */
export const vinculoValido = (datos) => leerVinculoCrudo(datos);

/** The link of a campus student in this browser, as { llave, usuario }, or null. */
export const leerVinculo = (alumno) => parsear(crudo(alumno));

export function guardarVinculo(alumno, { llave, usuario }) {
  if (!esAlumno(alumno)) return false;
  try {
    localStorage.setItem(PREFIJO + alumno, JSON.stringify({ llave, usuario }));
  } catch {
    return false;
  }
  avisar();
  return true;
}

/** Forgets the link. With `siEs`, only if it is still that key: another tab may have linked again meanwhile. */
export function borrarVinculo(alumno, siEs = null) {
  if (!esAlumno(alumno)) return;
  if (siEs && leerVinculo(alumno)?.llave !== siEs) return;
  try {
    localStorage.removeItem(PREFIJO + alumno);
  } catch {
    // Nothing to forget.
  }
  // And the lists of that account kept for offline.
  borrarAparte(LISTAS);
  avisar();
}

function suscribir(f) {
  avisados.add(f);
  // Linked or unlinked in another tab (El Santo Resumen opens a new one to link).
  const alCambiar = (e) => {
    if (e.key === null || e.key.startsWith(PREFIJO)) f();
  };
  window.addEventListener('storage', alCambiar);
  return () => {
    avisados.delete(f);
    window.removeEventListener('storage', alCambiar);
  };
}

/** The link of a campus student, redrawn when it changes here or in another tab. */
export function useVinculo(alumno) {
  const texto = useSyncExternalStore(suscribir, () => crudo(alumno), () => null);
  return useMemo(() => parsear(texto), [texto]);
}

// ---------- What comes back ----------

const MARCAS = { pendiente: 'En revisión', oculto: 'Oculto' };

/** One summary as the service sends it (a row of the bank with its state), checked, or null. Published, it links to
 * the bank; otherwise it has no link and carries its mark. */
export function leerResumen(r) {
  if (!r || typeof r !== 'object' || !ID.test(r.id) || !SLUG.test(r.materia)) return null;
  const titulo = limpio(r.titulo, 120);
  if (!titulo) return null;
  const publicado = r.estado === 'publicado';
  const formato = deLista(FORMATOS, r.tipo) ? r.tipo : '';
  const materia = nombreDeMateria(r.materia) || r.materia;
  const tipo = formato ? `${FORMATOS[formato]}${formato === 'html' && r.js === true ? ' interactivo' : ''}` : '';
  return {
    id: r.id,
    titulo,
    materia,
    instancia: deLista(INSTANCIAS, r.instancia),
    formato,
    js: formato === 'html' && r.js === true,
    foto: publicado ? leerFoto(r.foto) : null,
    estado: publicado ? 'publicado' : deLista(MARCAS, r.estado) ? r.estado : 'otro',
    url: publicado ? urlDeResumen(r.materia, r.id) : null,
    marca: publicado ? '' : deLista(MARCAS, r.estado) || 'Sin publicar',
    dato: [materia, deLista(INSTANCIAS, r.instancia), tipo].filter(Boolean).join(', '),
  };
}

function lista(x) {
  const vistos = new Set();
  return (Array.isArray(x) ? x.slice(0, MAX_LISTA) : [])
    .map(leerResumen)
    .filter((r) => r && !vistos.has(r.id) && vistos.add(r.id));
}

/** The answer of cvg-resumenes, checked: the account name and both lists, each without repeats. */
export const leerResumenes = (datos) => ({
  usuario: limpio(datos?.usuario, 40),
  subidos: lista(datos?.subidos),
  enviados: lista(datos?.enviados),
});

// ---------- Requests ----------

// `/?demo=1` in `npm run dev`: «Vincular» links at once with a sample account, and its key is answered by
// demoResumenes.js, which production never ships (like Classroom with demoClassroom.js).
const LLAVE_DEMO = 'demo-de-super-cvg-0000';

export function vincularDemo(alumno) {
  if (!import.meta.env.DEV || !guardarVinculo(alumno, { llave: LLAVE_DEMO, usuario: 'santi' })) return false;
  poner({ resultado: { vinculado: 'santi' } });
  return true;
}

async function pedir(ruta, { metodo, llave, cuerpo } = {}) {
  if (import.meta.env.DEV && llave === LLAVE_DEMO) {
    const { responderResumenes } = await import('./demoResumenes');
    return responderResumenes(ruta, cuerpo);
  }
  const headers = {};
  if (llave) headers[CABECERA] = llave;
  if (cuerpo) headers['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(`${SERVICIO}?a=${ruta}`, {
      method: metodo,
      headers,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    throw falla(SIN_RED, { codigo: 'red' });
  }
  let datos = null;
  if (r.status !== 204) {
    try {
      datos = await r.json();
    } catch {
      datos = null;
    }
  }
  return { status: r.status, error: typeof datos?.error === 'string' ? datos.error : '', datos };
}

// A key the service no longer knows unlinks this browser (`codigo: 'llave'`); a blocked account says so.
function revisarLlave(r) {
  if (r.status === 401) throw falla(TEXTOS.cortado, { codigo: 'llave' });
  if (r.status === 403 && r.error === 'bloqueada') throw falla(TEXTOS.bloqueada, { codigo: 'bloqueada' });
}

const conLlave = (llave) => {
  if (typeof llave !== 'string' || !LLAVE.test(llave)) throw falla(TEXTOS.cortado, { codigo: 'llave' });
  return llave;
};

const LISTAS = 'santo.resumenes';

/** What the account uploaded (also in review or hidden) and what it sent here (only published). Offline, the lists
 * kept for that key. */
export async function cargarResumenes(llave) {
  const suya = conLlave(llave);
  const datos = await conRespaldo(LISTAS, async () => {
    const r = await pedir('cvg-resumenes', { metodo: 'GET', llave: suya });
    revisarLlave(r);
    if (r.status !== 200 || !r.datos || typeof r.datos !== 'object') throw falla(SIN_RESPUESTA);
    // Only the lists: nothing else of the answer is kept.
    return { usuario: r.datos.usuario, subidos: r.datos.subidos, enviados: r.datos.enviados };
  }, { de: (await huellaDe(suya)) ?? null });
  return leerResumenes(datos);
}

/** Takes one out of what was sent here. It stays in the bank. */
export async function quitarResumen(llave, id) {
  if (!ID.test(id)) throw falla(SIN_RESPUESTA);
  const r = await pedir('cvg-quitar', { metodo: 'POST', llave: conLlave(llave), cuerpo: { id } });
  revisarLlave(r);
  if (r.status !== 204 && r.status !== 200) throw falla(SIN_RESPUESTA);
}

export const NO_ESTA_EN_BANCO = 'Ese resumen ya no está en el banco.';

/** A like (or taking it back) for the account of the key, as in El Santo Resumen. Answers how many it has now. */
export async function marcarMeGusta(llave, id, si) {
  if (!ID.test(id)) throw falla(SIN_RESPUESTA);
  const r = await pedir('cvg-me-gusta', { metodo: 'POST', llave: conLlave(llave), cuerpo: { id, si: Boolean(si) } });
  revisarLlave(r);
  if (r.status === 404) throw falla(NO_ESTA_EN_BANCO, { codigo: 'no-existe' });
  if (r.status !== 200 || !r.datos || typeof r.datos !== 'object') throw falla(SIN_RESPUESTA);
  const n = Number(r.datos.me_gusta);
  return { meGusta: Number.isSafeInteger(n) && n >= 0 ? n : 0, mio: r.datos.mio === true };
}

/** The summaries the account of the key likes, as a set of ids. */
export async function cargarGustos(llave) {
  const r = await pedir('cvg-gustos', { metodo: 'GET', llave: conLlave(llave) });
  revisarLlave(r);
  if (r.status !== 200) throw falla(SIN_RESPUESTA);
  const ids = Array.isArray(r.datos?.resumenes) ? r.datos.resumenes : [];
  return new Set(ids.slice(0, 5000).filter((id) => typeof id === 'string' && ID.test(id)));
}

/** The key stops working there. One it no longer knew (401) is the same. */
export async function desvincular(llave) {
  if (typeof llave !== 'string' || !LLAVE.test(llave)) return;
  const r = await pedir('cvg-desvincular', { metodo: 'POST', llave });
  if (r.status !== 204 && r.status !== 200 && r.status !== 401) throw falla(SIN_RESPUESTA);
}
