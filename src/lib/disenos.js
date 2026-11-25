// Diseños: estilos de Super CVG que publican los alumnos, para probarlos y usarlos. Un diseño ES un código de estilo
// (codigoDeEstilo.js), con un nombre y una descripción corta: lleva lo mismo que «Pasar tu estilo», también lo que se
// sume después, y nada más. Ni nombres ni nada del campus: cómo se ve la página.
//
// Todo pasa por la función supercvg-disenos de utn-apuntes (el Supabase de El Santo Resumen). Leer no pide cuenta;
// publicar, editar, puntuar, comentar, borrar y denunciar, la cuenta de El Santo Resumen vinculada (resumenes.js): su llave va
// solo en la cabecera x-utn-llave. Lo que vuelve se valida acá y se muestra como texto: un diseño con un código que no
// se lee no aparece.
//   POST { a: 'lista', orden, buscar, desde }      { ok, disenos: [...], mas }
//   POST { a: 'comentarios', id }                  { ok, comentarios: [...] }
//   POST { a: 'publicar', nombre, descripcion, codigo }  { ok, id }
//   POST { a: 'editar', id, nombre, descripcion, codigo }  { ok, diseno }
//   POST { a: 'borrar' | 'borrar-comentario', id } { ok }
//   POST { a: 'votar', id, estrellas }             { ok, estrellas, votos, mi_voto }
//   POST { a: 'comentar', id, texto }              { ok, comentario }
//   POST { a: 'denunciar', tipo, id }              { ok }
// Si no, { ok: false, motivo } (supabase/functions/supercvg-disenos/reglas.ts).
//
// El sitio publicado y `npm run dev` con una cuenta de verdad le piden a la función: lo que se publica desde ahí llega a la
// base. Solo /?demo=1 contesta con demoDisenos.js, con diseños de ejemplo. Las pruebas de navegador (modo flujos) piden
// de verdad a una dirección que contestan ellas.
import { useSyncExternalStore } from 'react';
import { SITIO } from '../../sitio.config.js';
import { ajustesActuales, cambiarAjustes, normalizar, ORIGINALES, probarAjustes } from './ajustes';
import { codigoDeEstilo, leerCodigoDeEstilo } from './codigoDeEstilo';
import { disenoEnPrueba, ponerEnPrueba } from './enPrueba';
import { cambiarMio, mioActual, usuarioActual } from './mio';
import { esDemo } from './modoDemo';
import { tokenActual } from './sesion';
import { ID, limpio } from './santoResumen';

export const DISENOS = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/supercvg-disenos';
export const MAX_NOMBRE = 40;
export const MAX_DESCRIPCION = 160;
export const MAX_COMENTARIO = 500;
export const MAX_BUSCAR = 40;
const MAX_LISTA = 60;
const MAX_COMENTARIOS = 300;
const CABECERA = 'x-utn-llave';
const LLAVE = /^[A-Za-z0-9_-]{16,128}$/;

// ---------- Textos ----------

/** El texto como lo guarda la base: un solo salto de línea (solo con `renglones`), sin caracteres de control ni
 * espacios de más. Contado por caracteres, así un emoji es uno. */
export function limpiarTexto(v, { renglones = false } = {}) {
  if (typeof v !== 'string') return '';
  let t = v.replace(/\r\n?/g, '\n');
  // eslint-disable-next-line no-control-regex
  t = renglones ? t.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n') : t.replace(/[\u0000-\u001f\u007f]/g, ' ');
  return t.replace(/[ \t]{2,}/g, ' ').trim();
}
export const largo = (t) => [...t].length;
export const conHtml = (t) => /[<>]/.test(t);

/** Qué le falta a un texto antes de mandarlo, o ''. */
export function problemaDeTexto(texto, { max, obligatorio = true, renglones = false }) {
  const t = limpiarTexto(texto, { renglones });
  if (!t) return obligatorio ? 'vacio' : '';
  if (largo(t) > max) return 'largo';
  if (conHtml(t)) return 'html';
  return '';
}

// Por qué algo no salió, en palabras de la pantalla. Algunos cambian según lo que se hizo.
export const MOTIVOS = {
  llave: 'El vínculo con El Santo Resumen se cortó. Volvé a vincularlo.',
  bloqueada: 'Tu cuenta de El Santo Resumen está bloqueada.',
  seguido: 'Hiciste muchas cosas seguidas. Esperá un rato y probá de nuevo.',
  repetido: 'Ya publicaste este mismo estilo.',
  'no-existe': 'Ese diseño ya no está.',
  invalido: 'Algo de lo que escribiste no se puede publicar. Revisalo.',
  red: 'No se pudo conectar. Revisá tu internet y probá de nuevo.',
  error: 'Diseños no responde ahora. Probá de nuevo en un rato.',
};
const SEGUN = {
  publicar: {
    tope: 'Ya tenés 20 diseños publicados. Borrá uno para publicar otro.',
    seguido: 'Ya publicaste 5 estilos hoy. Probá mañana.',
  },
  editar: {
    repetido: 'Ya publicaste este mismo estilo en otro diseño.',
    seguido: 'Editaste muchas veces hoy. Probá mañana.',
  },
  votar: { propio: 'Tu propio diseño no se puntúa.' },
  comentar: { tope: 'Este diseño no recibe más comentarios.' },
  'borrar-comentario': { 'no-existe': 'Ese comentario ya no está.' },
  denunciar: { propio: 'Lo tuyo no se denuncia.' },
};
const CONOCIDOS = new Set([...Object.keys(MOTIVOS), 'tope', 'propio']);

const falla = (accion, motivo) => Object.assign(new Error(SEGUN[accion]?.[motivo] ?? MOTIVOS[motivo] ?? MOTIVOS.error), { conocido: true, motivo });

// ---------- Lo que vuelve ----------

const entero = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);
const fecha = (v) => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const nombreDe = (v) => {
  const t = limpiarTexto(limpio(v, 200));
  return t && largo(t) <= 40 && !conHtml(t) ? t : '';
};

/** Lo que un código pone en Configuración, sobre la de siempre: para dibujarlo y para la vista previa. */
export function ajustesDeCodigo(codigo, base = null) {
  const cambio = leerCodigoDeEstilo(codigo, base ?? {});
  return cambio ? normalizar({ ...normalizar(base), ...cambio.ajustes }) : null;
}

/** Un diseño como lo manda el servicio, revisado, o null. Su código tiene que leerse: si no, no se muestra. */
export function leerDiseno(d) {
  if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !ID.test(d.id)) return null;
  const nombre = typeof d.nombre === 'string' ? limpiarTexto(d.nombre) : '';
  if (!nombre || largo(nombre) > MAX_NOMBRE || conHtml(nombre)) return null;
  const codigo = typeof d.codigo === 'string' && d.codigo.length <= 200 ? d.codigo : '';
  const ajustes = ajustesDeCodigo(codigo);
  if (!ajustes) return null;
  const descripcion = typeof d.descripcion === 'string' ? limpiarTexto(d.descripcion) : '';
  const estrellas = typeof d.estrellas === 'number' && d.estrellas >= 1 && d.estrellas <= 5 ? Math.round(d.estrellas * 10) / 10 : null;
  const votos = entero(d.votos);
  const mio = d.mio === true;
  return {
    id: d.id.toLowerCase(),
    nombre,
    descripcion: largo(descripcion) <= MAX_DESCRIPCION && !conHtml(descripcion) ? descripcion : '',
    codigo,
    ajustes,
    autor: nombreDe(d.autor) || 'Alguien',
    estrellas: votos ? estrellas : null,
    votos,
    comentarios: entero(d.comentarios),
    creado: fecha(d.creado),
    mio,
    oculto: mio && d.oculto === true,
    miVoto: Number.isInteger(d.mi_voto) && d.mi_voto >= 1 && d.mi_voto <= 5 ? d.mi_voto : null,
  };
}

/** La respuesta de `lista`: los diseños sin repetidos, si hay más y desde dónde sigue (`siguiente`, contado como
 * cuenta el servicio, antes de sacar lo que no pasa la validación). */
export function leerLista(datos, desde = 0) {
  const vistos = new Set();
  const crudos = Array.isArray(datos?.disenos) ? datos.disenos.slice(0, MAX_LISTA) : [];
  const disenos = crudos.map(leerDiseno).filter((d) => d && !vistos.has(d.id) && vistos.add(d.id));
  return { disenos, mas: datos?.mas === true, siguiente: desde + crudos.length };
}

export function leerComentario(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID.test(c.id)) return null;
  const texto = typeof c.texto === 'string' ? limpiarTexto(c.texto, { renglones: true }) : '';
  if (!texto || largo(texto) > MAX_COMENTARIO || conHtml(texto)) return null;
  return { id: c.id.toLowerCase(), texto, autor: nombreDe(c.autor) || 'Alguien', creado: fecha(c.creado), mio: c.mio === true };
}

// ---------- Pedidos ----------

// El sitio publicado y `npm run dev` con una cuenta de verdad le piden a la función (deja entrar a localhost:5330);
// solo /?demo=1 usa los diseños de ejemplo. Las pruebas de navegador, a la dirección que contestan ellas.
const deVerdad = (origen) =>
  origen === SITIO.url || import.meta.env.MODE === 'flujos' || (import.meta.env.DEV && !esDemo(tokenActual()));

async function pedir(cuerpo, { llave = null, origen = window.location.origin } = {}) {
  const conLlave = typeof llave === 'string' && LLAVE.test(llave) ? llave : null;
  if (!deVerdad(origen)) {
    if (!import.meta.env.DEV) return { ok: false, motivo: 'error' };
    const { responderDisenos } = await import('./demoDisenos');
    return responderDisenos(cuerpo, conLlave);
  }
  let r;
  try {
    r = await fetch(DISENOS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(conLlave ? { [CABECERA]: conLlave } : {}) },
      body: JSON.stringify(cuerpo),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'red' };
  }
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    // No es la respuesta de la función.
  }
  if (r.ok && datos?.ok === true) return datos;
  return { ok: false, motivo: typeof datos?.motivo === 'string' && CONOCIDOS.has(datos.motivo) ? datos.motivo : 'error' };
}

async function hacer(cuerpo, llave, opciones) {
  const r = await pedir(cuerpo, { llave, ...opciones });
  if (!r.ok) throw falla(cuerpo.a, r.motivo);
  return r;
}

const conLlave = (llave, accion) => {
  if (typeof llave !== 'string' || !LLAVE.test(llave)) throw falla(accion, 'llave');
  return llave;
};
const conId = (id, accion) => {
  if (typeof id !== 'string' || !ID.test(id)) throw falla(accion, 'no-existe');
  return id;
};

/** Una página de diseños: `orden` 'mejores' o 'nuevos', un pedazo del nombre y desde cuál. Con llave, marca los
 * propios y el voto de esa cuenta. */
export async function cargarDisenos({ orden = 'mejores', buscar = '', desde = 0, llave = null } = {}, opciones) {
  const b = limpiarTexto(buscar);
  return leerLista(await hacer({ a: 'lista', orden: orden === 'nuevos' ? 'nuevos' : 'mejores', buscar: [...b].slice(0, MAX_BUSCAR).join(''), desde }, llave, opciones), desde);
}

export async function cargarComentarios(id, llave = null, opciones) {
  const r = await hacer({ a: 'comentarios', id: conId(id, 'comentarios') }, llave, opciones);
  const vistos = new Set();
  return (Array.isArray(r.comentarios) ? r.comentarios.slice(0, MAX_COMENTARIOS) : [])
    .map(leerComentario)
    .filter((c) => c && !vistos.has(c.id) && vistos.add(c.id));
}

/** Publica el estilo de estos ajustes y este `mio` (lo mismo que «Pasar tu estilo»). Devuelve el id. */
export async function publicarDiseno(llave, { nombre, descripcion = '', ajustes, mio }, opciones) {
  const n = limpiarTexto(nombre);
  const d = limpiarTexto(descripcion);
  if (problemaDeTexto(n, { max: MAX_NOMBRE }) || problemaDeTexto(d, { max: MAX_DESCRIPCION, obligatorio: false })) throw falla('publicar', 'invalido');
  const r = await hacer({ a: 'publicar', nombre: n, descripcion: d, codigo: codigoDeEstilo(ajustes, mio) }, conLlave(llave, 'publicar'), opciones);
  if (typeof r.id !== 'string' || !ID.test(r.id)) throw falla('publicar', 'error');
  return r.id.toLowerCase();
}

/** Cambia nombre, descripción y estilo de un diseño propio: puntajes y comentarios quedan. Con `ajustes` y `mio`, el
 * estilo de ahora (como al publicar); si no, el `codigo` que ya tenía. Devuelve el diseño como quedó. */
export async function editarDiseno(llave, id, { nombre, descripcion = '', codigo, ajustes, mio }, opciones) {
  const n = limpiarTexto(nombre);
  const d = limpiarTexto(descripcion);
  if (problemaDeTexto(n, { max: MAX_NOMBRE }) || problemaDeTexto(d, { max: MAX_DESCRIPCION, obligatorio: false })) throw falla('editar', 'invalido');
  const elCodigo = ajustes ? codigoDeEstilo(ajustes, mio) : codigo;
  if (typeof elCodigo !== 'string' || !ajustesDeCodigo(elCodigo)) throw falla('editar', 'invalido');
  const r = await hacer({ a: 'editar', id: conId(id, 'editar'), nombre: n, descripcion: d, codigo: elCodigo }, conLlave(llave, 'editar'), opciones);
  const diseno = leerDiseno(r.diseno);
  if (!diseno || diseno.id !== id.toLowerCase()) throw falla('editar', 'error');
  return diseno;
}

export async function borrarDiseno(llave, id, opciones) {
  await hacer({ a: 'borrar', id: conId(id, 'borrar') }, conLlave(llave, 'borrar'), opciones);
}

/** Un puntaje de 1 a 5, uno por cuenta, que se puede cambiar. Devuelve cómo quedó el diseño. */
export async function votarDiseno(llave, id, estrellas, opciones) {
  if (!Number.isInteger(estrellas) || estrellas < 1 || estrellas > 5) throw falla('votar', 'invalido');
  const r = await hacer({ a: 'votar', id: conId(id, 'votar'), estrellas }, conLlave(llave, 'votar'), opciones);
  const votos = entero(r.votos);
  return {
    votos,
    estrellas: votos && typeof r.estrellas === 'number' && r.estrellas >= 1 && r.estrellas <= 5 ? Math.round(r.estrellas * 10) / 10 : null,
    miVoto: estrellas,
  };
}

export async function comentarDiseno(llave, id, texto, opciones) {
  const t = limpiarTexto(texto, { renglones: true });
  if (problemaDeTexto(t, { max: MAX_COMENTARIO, renglones: true })) throw falla('comentar', 'invalido');
  const r = await hacer({ a: 'comentar', id: conId(id, 'comentar'), texto: t }, conLlave(llave, 'comentar'), opciones);
  const c = leerComentario(r.comentario);
  if (!c) throw falla('comentar', 'error');
  return c;
}

export async function borrarComentario(llave, id, opciones) {
  await hacer({ a: 'borrar-comentario', id: conId(id, 'borrar-comentario') }, conLlave(llave, 'borrar-comentario'), opciones);
}

/** `tipo`: 'diseno' o 'comentario'. Con las de varias cuentas, se oculta hasta que se revise. */
export async function denunciar(llave, tipo, id, opciones) {
  await hacer({ a: 'denunciar', tipo: tipo === 'comentario' ? 'comentario' : 'diseno', id: conId(id, 'denunciar') }, conLlave(llave, 'denunciar'), opciones);
}

// ---------- Probar y usar ----------

/** Muestra un diseño en toda la página sin guardarlo: lo de cada uno (daltonismo, movimiento, Sensible a la luz)
 * queda, también si cambia mientras dura. Sin código, vuelve a lo guardado. */
export function verDiseno(codigo, ajustes = ajustesActuales(), luego) {
  const bien = Boolean(codigo && ajustesDeCodigo(codigo, ajustes));
  probarAjustes(bien ? (base) => ajustesDeCodigo(codigo, base) : null, bien ? luego : undefined);
  return bien;
}

/** Prueba un diseño en todo el sitio (enPrueba.js); el mismo otra vez, o null, la termina. False si su código no se
 * lee. */
export function probarDiseno(diseno) {
  if (!diseno || diseno.id === disenoEnPrueba()?.id) {
    terminarPrueba();
    return true;
  }
  // Its bar shows with it, in the same frame (public/ajustes.js).
  return verDiseno(diseno.codigo, undefined, () => ponerEnPrueba(diseno));
}

export function terminarPrueba() {
  if (!disenoEnPrueba()) return;
  probarAjustes(null, () => ponerEnPrueba(null));
}

// The style the student had before using one, as a code, to go back to it another day. Per student on this device,
// like cl.ajustes: a style code carries nothing of the campus (disenos.test.js), so Salir leaves it.
export const CLAVE_ANTES = 'cl.disenos.antes';
const claveAntes = () => (usuarioActual() === null ? null : `${CLAVE_ANTES}.${usuarioActual()}`);
const avisados = new Set();
const leerAntes = () => {
  try {
    return claveAntes() && localStorage.getItem(claveAntes());
  } catch {
    return null;
  }
};
const parsearAntes = (texto) => {
  try {
    const v = JSON.parse(texto ?? 'null');
    return v && typeof v.codigo === 'string' && typeof v.nombre === 'string'
      ? { codigo: v.codigo, nombre: limpiarTexto(v.nombre).slice(0, 80), usado: typeof v.usado === 'string' ? v.usado : '' }
      : null;
  } catch {
    return null;
  }
};
const guardarAntes = (valor) => {
  try {
    const clave = claveAntes();
    if (clave && valor) localStorage.setItem(clave, JSON.stringify(valor));
    else if (clave) localStorage.removeItem(clave);
  } catch {
    // Without where to keep it, going back is not offered after reloading.
  }
  avisados.forEach((f) => f());
};

let cacheTexto;
let cacheValor = null;
const estadoAntes = () => {
  const t = leerAntes();
  if (t !== cacheTexto) {
    cacheTexto = t;
    cacheValor = parsearAntes(t);
  }
  return cacheValor;
};

/** El diseño en uso desde Diseños ({ nombre }), mientras se pueda volver al estilo de antes, o null. */
export function useDisenoEnUso() {
  return useSyncExternalStore((f) => {
    avisados.add(f);
    return () => avisados.delete(f);
  }, estadoAntes, () => null);
}

// Los ajustes de este dispositivo y lo de Hoy y la campana del alumno, como «Pasar tu estilo».
function poner({ ajustes: a, hoy, avisosOcultos }) {
  const bienAjustes = cambiarAjustes(a);
  const bienMio = cambiarMio((d) => ({ ...d, hoy: { ...d.hoy, ...hoy }, avisosOcultos }));
  return bienAjustes && bienMio;
}

/** Usa un diseño de verdad. La vuelta es al estilo propio, aunque se usen varios seguidos. False si no se pudo guardar
 * (vale hasta cerrar la pestaña). */
export function usarDiseno(diseno, { ajustes, mio }) {
  const cambio = leerCodigoDeEstilo(diseno.codigo, ajustes);
  if (!cambio) return false;
  const tuyo = estadoAntes()?.codigo ?? codigoDeEstilo(ajustes, mio);
  const bien = poner(cambio);
  // The preview ends here, after saving so nothing flashes: left on, the screens would keep drawing it over every later
  // change until a reload. The bar of the preview goes with it.
  probarAjustes(null, () => ponerEnPrueba(null));
  // `usado`: how the settings look right after using it, to tell whether they changed afterwards (disenoSigue).
  guardarAntes({ codigo: tuyo, nombre: diseno.nombre, usado: codigoDeEstilo(ajustesActuales(), mioActual()) });
  return bien;
}

/** Si la configuración sigue siendo la del diseño en uso. Si se cambió después (en Configuración), ya no hay diseño en
 * uso y volver se olvida (`olvidarDisenoEnUso`): pisaría esos cambios. */
export const disenoSigue = (enUso, ajustes, mio) => Boolean(enUso?.usado) && enUso.usado === codigoDeEstilo(ajustes, mio);

export const olvidarDisenoEnUso = () => guardarAntes(null);

/** Vuelve al estilo de antes del primer diseño usado. False si no había o no se pudo guardar. */
export function volverAlTuyo(ajustes) {
  const antes = estadoAntes();
  const cambio = antes && leerCodigoDeEstilo(antes.codigo, ajustes);
  guardarAntes(null);
  return cambio ? poner(cambio) : false;
}

// ---------- Para dibujarlo ----------

const NOMBRES_DE_ESTILO = { original: 'Original', hoja: 'Hoja', profesional: 'Profesional', batman: 'Batman', plano: 'Plano', pizarron: 'Pizarrón' };
const NOMBRES_DE_TEMA = {
  sistema: 'Como tu dispositivo', claro: 'Claro', oscuro: 'Oscuro', rosa: 'Rosa oscuro', bosque: 'Verde bosque', cafe: 'Café', lavanda: 'Lavanda',
  infierno: 'Infierno', glaciar: 'Glaciar', cosmico: 'Violeta cósmico',
};
const PALETAS = ['rosa', 'bosque', 'cafe', 'lavanda', 'infierno', 'glaciar', 'cosmico'];

/** Estilo y tema, en palabras: «Plano, Violeta cósmico, versión potente». */
export const resumenDeDiseno = (a) =>
  [NOMBRES_DE_ESTILO[a.estilo], NOMBRES_DE_TEMA[a.tema], a.potente && 'versión potente'].filter(Boolean).join(', ');

/** Qué dibujo de Configuración lo muestra (configuracion.css, .dibujo-tema): una paleta va con todos los estilos. */
export function dibujoDe(a) {
  if (PALETAS.includes(a.tema)) return a.tema;
  if (a.estilo !== 'original') return a.estilo;
  return a.tema === 'oscuro' ? 'oscuro' : 'claro';
}

// Cabecera, color principal y resaltador de cada estilo sin colores propios, en claro y oscuro (tokens.css).
const DE_ESTILO = {
  profesional: { claro: ['#ffffff', '#3a63d6', '#f2c94c'], oscuro: ['#16223f', '#3a63d6', '#f2c94c'] },
  batman: { claro: ['#1b1d22', '#f5c518', '#f5c518'], oscuro: ['#1b1d22', '#f5c518', '#f5c518'] },
  plano: { claro: ['#ebe5d1', '#1d4f9f'], oscuro: ['#0a2647', '#f2f7ff', '#ffd166'] },
  pizarron: { claro: ['#c9cfd5', '#1558c0'], oscuro: ['#8f6c47', '#f2f0e8', '#f2d873'] },
};

const oscuroDelDispositivo = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Los colores con que se dibuja: los propios, o los de su tema o su estilo. */
export function coloresDe(a) {
  const paleta = PALETAS.includes(a.tema);
  const luz = a.tema === 'oscuro' || (a.tema === 'sistema' && oscuroDelDispositivo()) ? 'oscuro' : 'claro';
  const base = ORIGINALES[paleta ? a.tema : luz];
  const [cabecera, accion = base.accion, resaltador = base.resaltador] = (!paleta && DE_ESTILO[a.estilo]?.[luz]) || [];
  const principal = a.accion ?? accion;
  return {
    accion: principal,
    cabecera: a.cabecera ?? (a.accion ? principal : cabecera ?? principal),
    resaltador: a.resaltador ?? resaltador,
    consultron: a.consultronColor ?? principal,
  };
}

/** Las pantallas a la vista en su menú, en su orden. */
export const pantallasALaVista = (a) => a.menu.orden.filter((c) => (a.menu.lugares[c] ?? 'vista') === 'vista');
