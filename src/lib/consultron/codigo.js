// Consultron in «Código»: an agent over the lab. The model (Groq, or Gemini when Groq has no room) asks for tools and
// they run here, in the browser: list and read the files, propose changes, run the program. Only the messages go to the
// model, through the function supercvg-codigo of El Santo Resumen's Supabase (utn-apuntes): what the student asked,
// the files of what is open and what the console said. Nothing of the campus, no key, no account.
// A pedido of the student is one use (10 a day), whatever the calls it takes (up to 8).
import { useSyncExternalStore } from 'react';
import { SITIO } from '../../../sitio.config.js';
import { diaDeGoogle, dispositivo } from './nube';
import { propuestasAhora } from './propuestas';

export const CODIGO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/supercvg-codigo';
export const POR_DIA = 10;
export const LLAMADAS = 8;
const CLAVE = 'cl.consultron.codigo';
// The function tries up to four models, each with its 40 s.
const ESPERA_MS = 120_000;
// What goes in the messages: the function takes up to 60 000 characters in all, and 40 000 in one.
const TOPE_TOTAL = 52_000;
export const TOPE_ARCHIVO = 20_000;
const TOPE_CONSOLA = 3000;
export const TOPE_PEDIDO = 2000;

// The uses left today and «Aplicar solo», on this computer.
const leer = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
};
let actual = { quedan: null, dia: null, aplicarSolo: false, ...leer() };
const avisados = new Set();
const guardar = (cambio) => {
  actual = { ...actual, ...cambio };
  try {
    const { quedan, dia, aplicarSolo } = actual;
    localStorage.setItem(CLAVE, JSON.stringify({ quedan, dia, aplicarSolo }));
  } catch {
    // Without storage it lasts while the page is open.
  }
  for (const f of avisados) f();
};
const suscribir = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};
export const useCodigo = () => useSyncExternalStore(suscribir, () => actual, () => actual);
/** The pedidos left today, or null if it isn't known yet. */
export const quedanHoy = (c = actual, ahora = new Date()) => (c.dia === diaDeGoogle(ahora) ? c.quedan : null);
export const ponerAplicarSolo = (si) => guardar({ aplicarSolo: Boolean(si) });

/** When the pedidos come back: Google's midnight (California), in this computer's hour, «4:00». */
export function vuelven(ahora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ahora).map((p) => [p.type, Number(p.value)]));
  const pasado = ((partes.hour * 60 + partes.minute) * 60 + partes.second) * 1000 + ahora.getMilliseconds();
  const llega = new Date(ahora.getTime() + 86_400_000 - pasado);
  return llega.toLocaleTimeString('es-AR', { hour: 'numeric', minute: '2-digit' });
}

// Only the published site and the browser tests (which answer it themselves) ask the function. In `npm run dev` the
// answer is made up (codigoSimulado.js), unless the one testing turns it on by hand: localStorage['cl.dev.codigoReal']='1'.
function deVerdad(origen) {
  if (origen === SITIO.url || import.meta.env.MODE === 'flujos') return true;
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem('cl.dev.codigoReal') === '1';
  } catch {
    return false;
  }
}

/** The tools the model can ask for, in the function's format (reglas.ts). */
export const HERRAMIENTAS = [
  { nombre: 'listar_archivos', descripcion: 'Lista los archivos de lo que el alumno tiene abierto, con cuántas líneas tiene cada uno y cuál corre.', parametros: { type: 'object', properties: {} } },
  {
    nombre: 'leer_archivo',
    descripcion: 'Devuelve el contenido de un archivo, con tus cambios propuestos encima.',
    parametros: { type: 'object', properties: { nombre: { type: 'string', description: 'El nombre del archivo, por ejemplo main.c' } }, required: ['nombre'] },
  },
  {
    nombre: 'editar_archivo',
    descripcion: 'Propone un cambio en un archivo que ya existe. Con `buscar`, reemplaza ese tramo exacto (tiene que estar una sola vez) por `reemplazo`. Sin `buscar`, `reemplazo` es el archivo entero. El alumno lo ve y decide si lo aplica.',
    parametros: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        buscar: { type: 'string', description: 'El tramo a cambiar, copiado tal cual del archivo, con sus espacios.' },
        reemplazo: { type: 'string', description: 'Lo que va en su lugar, con la misma sangría que `buscar`. Si `buscar` empieza a mitad de una línea, `reemplazo` también.' },
      },
      required: ['nombre', 'reemplazo'],
    },
  },
  {
    nombre: 'crear_archivo',
    descripcion: 'Propone un archivo nuevo en el proyecto. El alumno lo ve y decide si lo crea.',
    parametros: { type: 'object', properties: { nombre: { type: 'string' }, contenido: { type: 'string' } }, required: ['nombre', 'contenido'] },
  },
  {
    nombre: 'correr',
    descripcion: 'Compila y corre el programa en el navegador del alumno, con tus cambios propuestos. Solo C, Python y JavaScript. En SQL no corre nada. Devuelve la salida o el error con su línea.',
    parametros: { type: 'object', properties: { entrada: { type: 'string', description: 'Lo que el programa lee del teclado, una línea por dato.' } } },
  },
  { nombre: 'correr_casos', descripcion: 'Corre los casos de prueba del proyecto (entrada y salida esperada) y dice cuáles fallan.', parametros: { type: 'object', properties: {} } },
];

const NOMBRES_LENGUAJE = { c: 'C', python: 'Python', sql: 'SQL', javascript: 'JavaScript' };

/**
 * What the model is told first. Each line answers something gpt-oss-120b did with the real service (17/11): it
 * answered impersonal and long («Se sustituyó…», «PK», «macro»), blamed garbage in memory for a sum it never looked at
 * (the lab read a 0 there: the error was dividing by 6), said what a program printed without running it, wrote «Qué
 * cambié» about a proposal on «por qué falla?», called `correr` in SQL, answered a question from the console without
 * reading the file, and on «arreglá la consulta» pasted the fix in the answer instead of proposing it. Only this mode
 * reads it (supercvg-codigo): the other models of Consultron have their own.
 */
export function instrucciones(ide) {
  return [
    'Sos Consultron, el ayudante de código del Laboratorio de Super CVG, para alumnos de la UTN FRRO.',
    `Trabajás sobre lo que el alumno tiene abierto: ${ide.proyecto ? `el proyecto «${ide.proyecto}»` : 'un archivo solo'}, en ${NOMBRES_LENGUAJE[ide.lenguaje] ?? ide.lenguaje}.`,
    'Siempre, también para contestar una pregunta, primero listá los archivos y leé los que hacen falta. No inventes lo que no leíste.',
    'Si el alumno pregunta algo (por qué falla, qué hace, explicame), no llames a editar_archivo ni a crear_archivo. Decile la causa y preguntale si quiere que lo arregles.',
    'Si te pide arreglar, cambiar o mejorar, no le preguntes si quiere. Proponelo ya con editar_archivo, no con el código pegado en la respuesta. Cambiá lo mínimo y no sumes comentarios al código.',
    'Mejorar algo que ya anda es un cambio chico. Tiene que seguir haciendo e imprimiendo lo mismo, sin rehacerlo entero ni hacerlo leer del teclado. Si sumás algo, usalo en el mismo cambio.',
    ide.lenguaje === 'sql'
      ? 'En SQL no podés correr nada, porque `correr` solo anda con C, Python y JavaScript. No lo llames. Los cambios sí los proponés con editar_archivo, como en cualquier lenguaje. No digas qué filas trae una consulta. Si hace falta verlo, que la corra el alumno.'
      : '`correr` anda con C, Python y JavaScript. Corré el programa antes de editar, salvo que la consola que te paso ya muestre cómo salió. Después de editar, corrélo de nuevo y fijate que la salida sea la que tiene que dar, no solo que no haya error.',
    ...(ide.lenguaje === 'c'
      ? ['En C, el Laboratorio no avisa cuando un for se pasa del tamaño de un arreglo: lo que lee afuera vale 0. Fijate que los límites de cada for coincidan con el tamaño y arreglá la causa, no el número que sale. Si decís cuánto vale una variable, que salga de seguir el código.']
      : []),
    'Contá solo lo que hiciste y viste con las herramientas. Decí «te propongo» solo si llamaste a editar_archivo, y nunca «cambié», «agregué», «apliqué» ni «reemplacé», porque el alumno decide si lo aplica.',
    'Que lo corriste, que imprime algo o que anda, decilo solo si llamaste a `correr` y lo viste. La causa de un error sale del código y de lo que viste al correr, no de suposiciones como «basura en memoria» o «comportamiento indefinido».',
    'Hablale de vos, en castellano rioplatense, como un compañero de la facultad, y en primera persona para lo tuyo («te propongo», «lo corrí»). Nada de impersonales como «se cambió» o «debería usarse».',
    'Contestá en una a tres oraciones cortas, sin títulos, listas ni bloques de código: qué pasa y por qué. Usá palabras de primer año, sin siglas ni jerga como «PK» o «macro».',
    `Por ejemplo, a una pregunta: «Tu while no termina porque nunca cambiás i adentro. ¿Querés que lo arregle?» Y a un arreglo: «Te faltaba el ; al final de la línea 9. Te propongo agregarlo${ide.lenguaje === 'sql' ? '' : ', lo corrí así y anda'}.»`,
  ].join('\n');
}

/**
 * The student's pedido, with the names of the files and what the console said. `pendientes`: the files with changes
 * proposed in an earlier pedido and not applied yet. Each pedido starts without the ones before: without saying so, the
 * model reads its own fix as the student's file, can't find the error and goes around until the cap («arreglalo» after
 * «por qué falla?»).
 */
export function primerMensaje(texto, ide, pendientes = []) {
  const nombres = ide.archivos().map((a) => a.nombre);
  const consola = String(ide.consola ?? '').trim();
  return [
    String(texto).trim().slice(0, TOPE_PEDIDO),
    `Archivos: ${nombres.join(', ') || 'ninguno'}.${ide.abierto ? ` Tiene abierto ${ide.abierto}.` : ''}`,
    pendientes.length
      ? `En un pedido anterior propusiste cambios en ${pendientes.join(', ')} que el alumno todavía no aplicó: leer_archivo y correr ya los ven puestos. Si con eso alcanza, no edites de nuevo: decile que los aplique con «Aplicar».`
      : '',
    consola ? `Lo último que dijo la consola${ide.final ? ` (${ide.final})` : ''}:\n${consola.slice(-TOPE_CONSOLA)}` : '',
    esPregunta(texto) ? 'Es una pregunta. Antes de contestar, leé con leer_archivo el archivo del error, porque la consola no dice qué guarda cada variable. Contestala de vos y en primera persona, sin editar, y preguntale si quiere que lo arregles.' : '',
    pideCambio(texto)
      ? `Te pide un cambio. Proponelo con editar_archivo, sin preguntarle antes. Si lo pegás en la respuesta en vez de llamar a editar_archivo, el alumno no tiene qué aplicar.${ide.lenguaje === 'sql' ? '' : ' Después corré el programa con `correr` y contá solo lo que viste.'}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Whether the pedido only asks («por qué falla?», «qué hace esto»), without asking for a change. With the rule only in
 * the instructions, gpt-oss-120b proposed a fix on «por qué falla?»; said next to every pedido, it also answered
 * «arreglalo» without touching anything (real service, 17/11). So it goes only next to a question.
 */
export function esPregunta(texto) {
  const t = String(texto).trim().toLowerCase();
  const pregunta = /\?/.test(t) || /^(¿\s*)?(por ?qu[eé]|qu[eé]|c[oó]mo|cu[aá]l|cu[aá]nto|d[oó]nde|para qu[eé]|explic)/.test(t);
  return pregunta && !pideCambio(t);
}

/**
 * Whether the pedido asks for a change («arreglalo», «mejoralo»). With the rule only in the instructions, gpt-oss-120b
 * answered «arreglá la consulta» with the cause and «¿Querés que lo arregle?», and «mejoralo» without running it after
 * editing (real service, 17/11). So it goes next to the pedido, as the question's does.
 */
export function pideCambio(texto) {
  return /arregl|correg|cambi|mejor|agreg|sac[aá]|pon[eé]|escrib|hac[eé]lo|termin/.test(String(texto).toLowerCase());
}

// The ids the function takes (reglas.ts). The model's are kept if they fit, else made again.
const ID = /^[A-Za-z0-9_.:-]{1,80}$/;
const NOMBRE = /^[a-z][a-z0-9_]{0,39}$/;

const largoDe = (mensajes) => mensajes.reduce((n, m) => n + m.texto.length + (m.llamadas ?? []).reduce((k, l) => k + l.argumentos.length, 0), 0);

/** Old results of tools go out (said so) until the messages fit what the function takes. */
export function achicar(mensajes, tope = TOPE_TOTAL) {
  const lista = mensajes.map((m) => ({ ...m }));
  const ultimos = new Set(lista.map((m, i) => i).filter((i) => lista[i].rol === 'herramienta').slice(-2));
  for (let i = 0; i < lista.length && largoDe(lista) > tope; i++) {
    if (lista[i].rol === 'herramienta' && !ultimos.has(i) && lista[i].texto.length > 80) lista[i].texto = '(Resultado viejo, sacado para ahorrar lugar. Pedilo de nuevo si hace falta.)';
  }
  return lista;
}

/** Asks the function once. Resolves { ok: true, texto, llamadas, quedan } or { ok: false, motivo }. Never throws. */
export async function preguntarCodigo(cuerpo, { senal, pedir = (...a) => fetch(...a), origen = globalThis.location?.origin, simular = null } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, motivo: 'red' };
  const tiempo = AbortSignal.timeout(ESPERA_MS);
  const signal = senal ? AbortSignal.any([senal, tiempo]) : tiempo;
  let r;
  try {
    if (deVerdad(origen)) {
      // A text body keeps it a simple request: no preflight.
      r = await pedir(CODIGO, { method: 'POST', body: JSON.stringify(cuerpo), credentials: 'omit', referrerPolicy: 'no-referrer', signal });
    } else {
      const { respuestaSimulada } = simular ?? (await import('./codigoSimulado.js'));
      r = await respuestaSimulada(cuerpo, signal);
    }
  } catch {
    return { ok: false, motivo: senal?.aborted ? 'frenado' : 'red' };
  }
  const d = await r.json().catch(() => null);
  if (d?.ok === true && typeof d.texto === 'string' && Array.isArray(d.llamadas)) {
    if (Number.isFinite(Number(d.quedan))) guardar({ quedan: Math.max(0, Number(d.quedan)), dia: diaDeGoogle() });
    return { ok: true, texto: d.texto, llamadas: d.llamadas, modelo: String(d.modelo ?? '') };
  }
  const motivo = typeof d?.motivo === 'string' ? d.motivo : 'error';
  if (motivo === 'tope_alumno') guardar({ quedan: 0, dia: diaDeGoogle() });
  return { ok: false, motivo };
}

/**
 * A paragraph of the answer in parts: **bold** and `code` as Preguntar draws them, the rest as it comes. The models
 * write them in almost every answer (with the real service, 17/11): without this the student read the asterisks.
 */
export function enLinea(texto) {
  const partes = [];
  let desde = 0;
  for (const m of String(texto).matchAll(/\*\*([^*\n]+?)\*\*|`([^`\n]+)`/g)) {
    if (m.index > desde) partes.push({ texto: texto.slice(desde, m.index) });
    partes.push(m[1] !== undefined ? { texto: m[1], fuerte: true } : { texto: m[2], codigo: true });
    desde = m.index + m[0].length;
  }
  if (desde < texto.length) partes.push({ texto: texto.slice(desde) });
  return partes;
}

/** What the student reads when a pedido doesn't go. */
export const MOTIVOS = {
  tope_alumno: () => `Por hoy no te quedan pedidos. Vuelven a las ${vuelven()}.`,
  tope_llamadas: () => 'Llegó al tope de pasos de este pedido.',
  agotado: () => 'Hoy se terminó lo que tenemos para todo el sitio. Probá mañana.',
  ocupado: () => 'Está todo ocupado. Probá de nuevo en un rato.',
  seguido: () => 'Hubo muchos pedidos seguidos. Esperá unos minutos.',
  red: () => 'No se pudo conectar. Revisá tu internet y probá de nuevo.',
  frenado: () => 'Lo frenaste.',
  recargada: () => 'Se cortó al recargar la página.',
  sin_lab: () => 'Cerraste el Laboratorio y quedó a medias.',
  error: () => 'No salió. Probá de nuevo en un rato.',
};
export const textoDelMotivo = (motivo) => (MOTIVOS[motivo] ?? MOTIVOS.error)();

const leerArgumentos = (texto) => {
  try {
    const v = JSON.parse(texto || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
};

/**
 * Runs one pedido of the student. `ide()`: the lab now (ideAhora). `herramienta(nombre, args, ide)`: does a tool and
 * resolves { texto (for the model), paso (for the screen) }. `alPaso(paso)` for each thing it does. Resolves
 * { texto } with the last answer, or { motivo }.
 */
export async function trabajar(texto, { ide, herramienta, alPaso = () => {}, senal, pedir, origen, simular } = {}) {
  const lab = ide();
  if (!lab) return { motivo: 'sin_lab' };
  const pedido = crypto.randomUUID();
  let mensajes = [
    { rol: 'sistema', texto: instrucciones(lab) },
    { rol: 'alumno', texto: primerMensaje(texto, lab, propuestasAhora().archivos.map((a) => a.nombre)) },
  ];
  let numero = 0;
  for (let vuelta = 0; vuelta < LLAMADAS; vuelta++) {
    mensajes = achicar(mensajes);
    const r = await preguntarCodigo({ dispositivo: dispositivo(), pedido, mensajes, herramientas: HERRAMIENTAS }, { senal, pedir, origen, simular });
    if (!r.ok) return { motivo: r.motivo };
    const llamadas = r.llamadas
      .filter((l) => l && typeof l.nombre === 'string' && NOMBRE.test(l.nombre) && HERRAMIENTAS.some((h) => h.nombre === l.nombre))
      .slice(0, 8)
      .map((l) => ({ id: ID.test(String(l.id)) ? String(l.id) : `llamada_${++numero}`, nombre: l.nombre, argumentos: typeof l.argumentos === 'string' && l.argumentos.length <= 30_000 ? l.argumentos : '{}' }));
    if (!llamadas.length) return { texto: r.texto.trim() || 'Listo.' };
    if (r.texto.trim()) alPaso({ tipo: 'dice', texto: r.texto.trim() });
    // The last call can't ask for more: what it did stays, and the answer says so.
    if (vuelta === LLAMADAS - 1) return { motivo: 'tope_llamadas' };
    mensajes.push({ rol: 'consultron', texto: r.texto, llamadas });
    for (const l of llamadas) {
      if (senal?.aborted) return { motivo: 'frenado' };
      const ahora = ide();
      if (!ahora || ahora.donde !== lab.donde) return { motivo: 'sin_lab' };
      const args = leerArgumentos(l.argumentos);
      const hecho = args ? await herramienta(l.nombre, args, ahora) : { texto: 'Los argumentos no son un JSON válido.', paso: null };
      if (hecho.paso) alPaso(hecho.paso);
      mensajes.push({ rol: 'herramienta', id: l.id, texto: hecho.texto || '(sin resultado)' });
    }
  }
  return { motivo: 'tope_llamadas' };
}

