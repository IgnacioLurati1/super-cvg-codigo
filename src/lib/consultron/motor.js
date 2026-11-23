import { useSyncExternalStore } from 'react';
import { usuarioActual } from '../mio';
import { tokenActual } from '../sesion';
import { soltarCharla } from './adjuntar';
import { anotarAlAbrir, leerAlAbrir } from './alAbrir';
import { borrarCharla, guardarCharla, leerCharla } from './charlas';
import { mensajeDeCarga, revisarCompu } from './compu';
import urlTrabajador from './consultron.worker.js?worker&url';
import { contestoGroq, nubeEnElLugar, nubePara, nubeSinRed, porQueNoNube, preguntarNube, quedanHoy, sinCompu, usaGemini } from './nube';
import { NO_ESTA, SISTEMA, SISTEMA_CHARLA, SISTEMA_GENERAL, SISTEMA_HUMOR, SISTEMA_SITIO, UNA_COSA, armarPedido, conCitaQueFalta, esPuntual, hastaLoEntero, noEsta, puedeSerNoEsta, respuestaSinRed } from './pedido';

// Consultron on this side: its worker (consultron.worker.js), how the model is doing, and the questions of this visit.
// One for the whole tab: leaving the screen doesn't stop a download or an answer. Once on this computer it loads as soon
// as Super CVG opens and stays for the whole visit (alAbrir.js). With that off, and the screen closed for a while, the
// model leaves the video card (it loads again from the browser in seconds).
//
// The questions and answers have the campus's text in them. Each talk is kept in this browser for its student
// (charlas.js) once its answers are done, and Salir deletes them. Another session starts from nothing.

/** The weights, from Hugging Face, pinned to one version: what downloads is always the same. */
export const PESOS = 'https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC/resolve/44b42469f9e192814bfd90440e3b377d89ba7a13/';
const PROGRAMA = 'Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm';
/** What it downloads, in MB (the weights; the program comes with the site). */
export const TOTAL_MB = 2367;
const SUELTO_MS = 5 * 60_000;
// Looking at the browser takes a moment: past this, the worker didn't start, and it says so instead of waiting forever.
const REVISION_MS = 30_000;

const programa = () => new URL(`${import.meta.env.BASE_URL}motores/consultron/${PROGRAMA}`, window.location.href).href;

// Like the lab's: a worker from a blob carries the page's CSP, one from an address of the site would carry none.
function crearWorker() {
  const arranque = URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL(urlTrabajador, window.location.href).href)};\n`], { type: 'text/javascript' }));
  const worker = new Worker(arranque, { type: 'module', name: 'consultron' });
  return { worker, soltar: () => URL.revokeObjectURL(arranque) };
}

const INICIAL = { fase: 'quieto', motivo: '', mb: 0, fraccion: 0, faltan: null, error: '' };

let estado = INICIAL;
let hilo = [];
let token;
let worker = null;
// The worker is there from the look at the computer on: the model answers only once it's loaded.
const conModelo = () => Boolean(worker) && estado.fase === 'listo';
let soltarArranque = null;
let numero = 0;
let usos = 0;
let suelto = null;
let sinRevision = null;
// Loaded as Super CVG opened: it stays on the video card for the whole visit.
let fijo = false;
// Loading in the background, slowly so the computer stays free. A question or the open chat makes it go at full speed.
let lento = false;
const avisados = new Set();

function avisar() {
  guardarLuego();
  avisados.forEach((f) => f());
}

// The talk being kept ({ id, creada }), null until its first answer is done. The thread last kept, so that nothing is
// written twice.
let charla = null;
let escrito = [];
let porGuardar = null;
let ultimaId = 0;
const avisadosCharlas = new Set();
let versionCharlas = 0;
const terminada = (e) => e.estado !== 'leyendo' && e.estado !== 'escribiendo';
// A practice question being corrected was already kept: it stays, as the question waiting (charlas.js).
const paraGuardar = (e) => terminada(e) || (e.practica?.fase === 'corrigiendo' && Boolean(e.practica.pregunta));

function guardarLuego() {
  if (hilo === escrito) return;
  clearTimeout(porGuardar);
  porGuardar = setTimeout(guardarYa, 300);
}

// What's done of the talk, as it is now: the answers still being written wait for the next time.
function guardarYa() {
  clearTimeout(porGuardar);
  escrito = hilo;
  const alumno = usuarioActual();
  const listas = hilo.filter(paraGuardar);
  if (alumno === null || !listas.length || tokenActual() !== token) return;
  if (!charla) {
    ultimaId = Math.max(Date.now(), ultimaId + 1);
    charla = { id: ultimaId, creada: Date.now() };
  }
  guardarCharla(alumno, { ...charla, entradas: listas }).then((si) => si && cambiaronCharlas());
}

function cambiaronCharlas() {
  versionCharlas += 1;
  avisadosCharlas.forEach((f) => f());
}

/** The saved talks changed: a number that goes up, for the list (Charlas.jsx). */
export const escucharCharlas = (f) => {
  avisadosCharlas.add(f);
  return () => avisadosCharlas.delete(f);
};
export const leerVersionCharlas = () => versionCharlas;
/** The id of the saved talk on screen, or null if it isn't kept yet. */
export const charlaAbierta = () => charla?.id ?? null;

function poner(cambio) {
  estado = { ...estado, ...cambio };
  avisar();
}

function cambiarEntrada(id, cambio) {
  hilo = hilo.map((e) => (e.id === id ? { ...e, ...(typeof cambio === 'function' ? cambio(e) : cambio) } : e));
  avisar();
}

// Another session starts with no questions.
function alDia() {
  const ahora = tokenActual();
  if (ahora === token) return;
  token = ahora;
  clearTimeout(porGuardar);
  charla = null;
  if (hilo.length) hilo = [];
  escrito = hilo;
}

function apagar() {
  for (const listo of esperandoDatos.values()) listo(null);
  esperandoDatos.clear();
  for (const a of aparte.values()) a.listo(null);
  aparte.clear();
  worker?.terminate();
  soltarArranque?.();
  worker = null;
  soltarArranque = null;
  // An answer cut by this stays as it was.
  if (hilo.some((e) => e.estado === 'leyendo' || e.estado === 'escribiendo')) {
    hilo = hilo.map((e) => (e.estado === 'leyendo' || e.estado === 'escribiendo' ? { ...e, estado: 'frenado' } : e));
  }
}

function alMensaje({ data: m }) {
  if (m.id != null && aparte.has(m.id)) {
    alMensajeAparte(m);
    return;
  }
  if (m.tipo === 'revision') {
    clearTimeout(sinRevision);
    if (estado.fase !== 'revisando') return;
    // The browser may have taken it out to make room.
    if (!m.bajado) {
      anotarAlAbrir(null);
      fijo = false;
    }
    poner({ fase: m.bajado ? 'bajado' : 'sin-bajar' });
    if (m.bajado && fijo) cargar();
  }
  else if (m.tipo === 'progreso') {
    const mb = m.fase === 'bajando' ? (m.mb ?? Math.round(m.fraccion * TOTAL_MB)) : estado.mb;
    // How long is left, from how fast it goes, once it went for a few seconds.
    const faltan = m.fase === 'bajando' && m.segundos > 5 && mb > 0 ? Math.round(((TOTAL_MB - mb) * m.segundos) / mb) : null;
    poner({ fase: m.fase, fraccion: m.fraccion ?? 0, mb, faltan });
  } else if (m.tipo === 'listo') {
    poner({ fase: 'listo', error: '' });
    const esperando = [...alEstarListo.values()];
    alEstarListo.clear();
    for (const { hacer } of esperando) hacer();
    if (!leerAlAbrir()) anotarAlAbrir('listo');
    navigator.storage?.persist?.().catch(() => {});
  } else if (m.tipo === 'falla') {
    const esperando = [...alEstarListo.values()];
    alEstarListo.clear();
    for (const { fallar } of esperando) fallar();
    apagar();
    poner({ fase: 'falla', error: mensajeDeCarga(m) });
  } else if (m.tipo === 'datos') {
    esperandoDatos.get(m.id)?.(m.texto || null);
    esperandoDatos.delete(m.id);
  } else if (m.tipo === 'parte') {
    // While it can still end as «No lo encuentro en tus apuntes.», what came waits out of sight (`guardado`): that answer
    // is asked again with what the model knows, and its first words showed for a moment before the real one.
    cambiarEntrada(m.id, (e) => {
      const texto = e.texto + (e.guardado ?? '') + m.texto;
      return puedeSerNoEsta(texto) ? { guardado: (e.guardado ?? '') + m.texto } : { estado: 'escribiendo', texto, guardado: undefined };
    });
  } else if (m.tipo === 'fin') {
    const e = hilo.find((x) => x.id === m.id);
    // The pieces didn't have it: it answers again with what it knows in general.
    // Not about the site nor about what was attached: there, what it knows in general would be made up.
    if (e && !m.frenado && !e.general && !e.soloSitio && !e.enResumen && !e.adjuntos?.length && noEsta(e.texto + (e.guardado ?? ''))) enGeneral(m.id);
    // Cut by its length limit: back to its last whole sentence.
    else {
      cambiarEntrada(m.id, (x) => {
        // What waited out of sight shows now: it was the whole answer, or it was stopped there.
        const todo = x.texto + (x.guardado ?? '');
        const estado = m.frenado ? 'frenado' : noEsta(todo) ? 'no-esta' : 'listo';
        const texto = m.cortada ? hastaLoEntero(todo) : todo;
        // A short answer that came without the number of its piece gets it, so that it shows where it comes from.
        return { texto: estado === 'listo' && !x.general ? conCitaQueFalta(texto, x.elegidos) : texto, estado, guardado: undefined };
      });
    }
  } else if (m.tipo === 'falla-respuesta') {
    cambiarEntrada(m.id, { estado: 'falla' });
    // The video card was lost (it happens when another program takes it): the model has to load again.
    if (/device|lost|gpu/i.test(m.mensaje)) {
      apagar();
      poner({ fase: 'falla', error: 'Consultron perdió la placa de video. Cargalo de nuevo.' });
    }
  } else if (m.tipo === 'borrado') {
    anotarAlAbrir(null);
    fijo = false;
    apagar();
    poner({ ...INICIAL, fase: 'sin-bajar' });
  }
}

function encender() {
  if (worker) return;
  ({ worker, soltar: soltarArranque } = crearWorker());
  worker.onmessage = alMensaje;
  worker.onerror = () => {
    apagar();
    poner({ fase: 'falla', error: 'Consultron no pudo arrancar. Probá de nuevo.' });
  };
  worker.postMessage({ tipo: 'revisar', pesos: PESOS, programa: programa() });
  clearTimeout(sinRevision);
  sinRevision = setTimeout(() => {
    if (estado.fase !== 'revisando') return;
    apagar();
    poner({ fase: 'falla', error: 'Consultron no pudo arrancar. Probá de nuevo.' });
  }, REVISION_MS);
}

/** Looks at the computer and at whether the model is already in the browser. Once per tab, or after a failure. */
export async function revisar() {
  if (estado.fase !== 'quieto') return;
  poner({ fase: 'revisando' });
  const compu = await revisarCompu();
  if (!compu.puede) return poner({ fase: 'no-puede', motivo: compu.motivo });
  encender();
}

/** As Super CVG opens (Layout.jsx): if the model is on this computer and that wasn't turned off, it loads in the
 * background. Never downloads: if the browser took it out, it waits for its screen. */
export async function precalentar() {
  // With «Usar Gemini» it loads only when Gemini fails (`cuandoEsteListo`): 4 GB of the video card for nothing, else.
  if (usaGemini() || leerAlAbrir() === 'a-mano' || estado.fase !== 'quieto' || !(await guardado())) return;
  // One tab loads it: another one open with Super CVG would put a second model on the video card. The one that asks
  // loads it anyway.
  if (!(await unaPestana())) return;
  if (estado.fase !== 'quieto') return;
  fijo = true;
  lento = true;
  revisar();
}

// The tab that loads the model on opening keeps this lock while it lives: the browser lets it go when it closes.
async function unaPestana() {
  if (!navigator.locks?.request) return true;
  return new Promise((alTener) => {
    navigator.locks
      .request('super-cvg-consultron', { ifAvailable: true }, (lock) => {
        alTener(Boolean(lock));
        return lock ? new Promise(() => {}) : null;
      })
      .catch(() => alTener(false));
  });
}

// Whether the browser keeps the model's weights: a look at its Cache Storage, without the worker nor web-llm. The
// worker checks every piece after this.
async function guardado() {
  try {
    if (!(await caches.has('webllm/model'))) return false;
    const cache = await caches.open('webllm/model');
    return Boolean(await cache.match(`${PESOS}tensor-cache.json`));
  } catch {
    return false;
  }
}

// Someone is waiting for it: what's left loads at full speed.
function apurar() {
  if (!lento) return;
  lento = false;
  worker?.postMessage({ tipo: 'apurar' });
}

/** Whether it loads as soon as Super CVG opens, on this computer. */
export const cargaAlAbrir = () => leerAlAbrir() !== 'a-mano';

export function ponerCargaAlAbrir(si) {
  anotarAlAbrir(si ? 'listo' : 'a-mano');
  fijo = si;
}

/** Opening Consultron, a model already in the browser loads; with «Usar Gemini» on, it waits until Gemini fails. */
export function cargarSiHaceFalta() {
  if (!usaGemini()) cargar();
}

// What waits for the model to load, by entry: Gemini didn't answer and the model was in the browser. { hacer, fallar }.
const alEstarListo = new Map();

/** Does `hacer` with the model: at once if it's ready; if it's in the browser, once it loads (and it starts loading).
 * Otherwise false, and nothing waits. `fallar`: if it can't load or the question is stopped meanwhile. */
function cuandoEsteListo(id, hacer, fallar) {
  if (conModelo()) {
    hacer();
    return true;
  }
  if (!['bajado', 'preparando'].includes(estado.fase)) return false;
  alEstarListo.set(id, { hacer, fallar });
  apurar();
  if (estado.fase === 'bajado') cargar();
  return true;
}

/** Downloads the model if it isn't in the browser, and loads it on the video card. */
export function cargar() {
  if (!['sin-bajar', 'bajado', 'falla'].includes(estado.fase)) return;
  const bajado = estado.fase === 'bajado';
  encender();
  poner({ fase: bajado ? 'preparando' : 'bajando', fraccion: 0, mb: 0, faltan: null, error: '' });
  worker.postMessage({ tipo: 'cargar', lento: lento && usos === 0 });
}

/** Stops a download. What came stays in the browser, and the next one goes on from there. */
export function cancelarDescarga() {
  if (estado.fase !== 'bajando') return;
  apagar();
  poner({ ...INICIAL, fase: 'quieto' });
  revisar();
}

/** Takes the model out of the browser: frees its 2,4 GB. */
export function borrar() {
  if (['quieto', 'revisando', 'no-puede', 'bajando'].includes(estado.fase)) return;
  encender();
  poner({ fase: 'borrando' });
  worker.postMessage({ tipo: 'borrar' });
}

// The questions that already went to the model: «Frenar» stops those in the worker, and the others here.
const enviadas = new Set();
// The data of an exercise asked to the model, by entry: what to call with its JSON.
const esperandoDatos = new Map();
// The answers before it that go with a question, so it can lean on them («¿y eso cómo se calcula?»).
const MEMORIA = 2;

/** The last answers of this visit before `id`, as turns of the talk. Without their source numbers: those were other
 * pieces. `sinPropias`: without the ones from their own data (career, calendar): a small model mixes them into an
 * answer about anything else («no entiendo las derivadas» came back with what Inteligencia Artificial needs).
 * `soloNube`: only the ones Gemini answered, for a question that goes to Gemini: the others may come from their notes,
 * which never leave the computer. */
export function charlaAntes(entradas, id, { sinPropias = false, soloNube = false } = {}) {
  return entradas
    .filter((e) => e.id < id && e.estado === 'listo' && e.texto && !(sinPropias && e.soloSitio) && !(soloNube && !e.nube))
    .slice(-MEMORIA)
    .flatMap((e) => [
      { role: 'user', content: e.pregunta.slice(0, 400) },
      { role: 'assistant', content: e.texto.replace(/\s*\[\d+\]/g, '').slice(0, 700) },
    ]);
}

/** A question that starts: it shows at once, «leyendo», while its pieces are looked for (fuentes.js). `donde`: where it
 * looks, for the screen. Returns the id of the entry. */
export function empezar(pregunta, donde = '', adjuntos = [], { enResumen = false } = {}) {
  alDia();
  apurar();
  numero += 1;
  // `adjuntos`: what the student attached to it, to show in its bubble ({ id, nombre, clase, url }, adjuntar.js).
  // `enResumen`: asked beside a summary of El Santo Resumen (true) or another file ('archivo'), which is all it looks in.
  hilo = [...hilo, { id: numero, pregunta: String(pregunta).trim(), adjuntos, elegidos: [], donde, texto: '', estado: 'leyendo', ...(enResumen ? { enResumen } : {}) }];
  avisar();
  return numero;
}

/** A question beside an open file whose text couldn't be read: it says so, and makes nothing up. */
export function sinTextoAbierto(id, texto) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo' || enviadas.has(id)) return;
  cambiarEntrada(id, { texto, estado: 'no-esta', donde: '' });
}

/** A question that brought only attachments, and none could be read: nothing to ask. */
export function noPudoLeer(id) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo' || enviadas.has(id)) return;
  cambiarEntrada(id, { texto: 'No pude leer lo que adjuntaste.', estado: 'no-esta', donde: '' });
}

/** Sends a started question to the model with its pieces (fragmentos.js, `elegir`, each with its `fuente`). `charla`:
 * the message of a greeting or talk (pedido.js, `armarCharla`), for when there are no pieces. Without pieces or talk it
 * doesn't even ask: it's not in the notes. Nothing if the question was stopped meanwhile. `corto`: the answer is one
 * thing, short; without it, the question says (pedido.js, `esPuntual`). */
export function responder(id, elegidos, charla = '', { soloSitio = false, humor = false, pedido = null, corto = null, sinCharla = false } = {}) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo' || enviadas.has(id)) return;
  if (!elegidos.length && !charla) {
    // About the site, nothing is made up: a screen the guide doesn't know isn't answered.
    // Nor beside an open file: it reads that file alone.
    if (soloSitio || entrada.enResumen) cambiarEntrada(id, { texto: NO_ESTA, estado: 'no-esta', donde: '' });
    else enGeneral(id, humor, pedido, corto);
    return;
  }
  // With «Usar Gemini» on, anything; with an older permission, the summaries of El Santo Resumen or their career:
  // Gemini (nube.js), first even with the model ready, and on a computer that can't run it or hasn't got it yet.
  const nube = nubePara(elegidos);
  if (!nube && !conModelo()) {
    if (sinRed() && !soloSitio && conLasPiezas(id, elegidos)) return;
    cambiarEntrada(id, { texto: sinCompu(estado.fase), estado: 'no-esta', donde: '' });
    return;
  }
  const puntual = elegidos.length > 0 && (corto ?? esPuntual(entrada.pregunta));
  cambiarEntrada(id, { elegidos, soloSitio, ...(pedido ? { pedido } : {}), ...(puntual ? { corto: true } : {}) });
  enviadas.add(id);
  const mensajes = [
    { role: 'system', content: !elegidos.length ? SISTEMA_CHARLA : soloSitio ? SISTEMA_SITIO : SISTEMA },
    ...(sinCharla ? [] : charlaAntes(hilo, id, { sinPropias: !soloSitio, soloNube: Boolean(nube) && nube !== 'todo' })),
    { role: 'user', content: elegidos.length ? armarPedido(pedido ?? entrada.pregunta, elegidos, { puntual }) : charla },
  ];
  if (nube) porLaNube(id, mensajes, nube, puntual);
  else worker.postMessage({ tipo: 'preguntar', id, corto: puntual, mensajes });
}

// The questions on their way to Gemini, to stop them.
const enLaNube = new Map();

/** Asks Gemini; what it answers ends as the model's answers do. Without an answer, the computer answers it. */
async function porLaNube(id, mensajes, cual, puntual) {
  const control = new AbortController();
  enLaNube.set(id, control);
  const texto = await preguntarNube(mensajes, cual, { senal: control.signal });
  enLaNube.delete(id);
  const e = hilo.find((x) => x.id === id);
  // Stopped or cleared meanwhile.
  if (!e || e.estado !== 'leyendo') return;
  if (texto === null) {
    // The computer answers, and the screen says Gemini didn't; a model in the browser loads for it first. Without one,
    // why Gemini didn't, or offline the pieces found.
    const porque = porQueNoNube();
    const offline = nubeSinRed();
    const sinModelo = () => {
      if (!offline || !conLasPiezas(id, e.elegidos)) cambiarEntrada(id, { texto: porque, estado: 'no-esta', donde: '' });
    };
    const contesta = cuandoEsteListo(
      id,
      () => {
        if (hilo.find((x) => x.id === id)?.estado !== 'leyendo') return;
        cambiarEntrada(id, { nubeFallo: true, ...(quedanHoy() === 0 ? { nubeTope: true } : {}) });
        worker.postMessage({ tipo: 'preguntar', id, corto: puntual, mensajes });
      },
      () => {
        if (hilo.find((x) => x.id === id)?.estado === 'leyendo') sinModelo();
      },
    );
    if (!contesta) sinModelo();
    return;
  }
  if (noEsta(texto) && !e.general) {
    if (cual === 'todo') {
      // With «Usar Gemini», Gemini answers again with what it knows, where that may be (as at the end of an answer).
      if (!e.soloSitio && !e.enResumen && !e.adjuntos?.length) {
        enGeneral(id);
        return;
      }
    } else if (conModelo()) {
      // Gemini says the pieces don't have it: the computer reads the same pieces before giving up.
      worker.postMessage({ tipo: 'preguntar', id, corto: puntual, mensajes });
      return;
    }
  }
  cambiarEntrada(id, { nube: cual, ...(contestoGroq() ? { groq: true } : {}) });
  escribirDeNube(id, texto);
}

const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Offline, with no model on this device: the answer is the pieces found (pedido.js, `respuestaSinRed`), shown as they
 * are in the notes. Not for a question about the site, a general one or one beside a live session. False if none. */
function conLasPiezas(id, elegidos) {
  const e = hilo.find((x) => x.id === id);
  if (!e || e.general || e.soloSitio || e.enResumen === 'mesa' || !elegidos?.length) return false;
  const donde = { archivo: 'este archivo' }[e.enResumen] ?? (e.enResumen ? 'este resumen' : 'tus apuntes');
  const texto = respuestaSinRed(elegidos, donde);
  if (!texto) return false;
  enviadas.add(id);
  cambiarEntrada(id, { elegidos, texto, estado: 'listo', donde: '' });
  return true;
}

// Gemini's answer comes whole: it is written a few words at a time, like the computer's, in about two seconds at most.
const nubeEscribiendo = new Map();
const PASOS_NUBE = 90;
function escribirDeNube(id, texto) {
  const palabras = texto.match(/\S+\s*/g) ?? [texto];
  const deA = Math.max(1, Math.ceil(palabras.length / PASOS_NUBE));
  const corte = { frenado: false };
  nubeEscribiendo.set(id, corte);
  let i = 0;
  const paso = () => {
    // Cleared meanwhile.
    if (!hilo.some((e) => e.id === id)) {
      nubeEscribiendo.delete(id);
      return;
    }
    if (corte.frenado || i >= palabras.length) {
      nubeEscribiendo.delete(id);
      alMensaje({ data: { tipo: 'fin', id, ...(corte.frenado ? { frenado: true } : {}) } });
      return;
    }
    alMensaje({ data: { tipo: 'parte', id, texto: palabras.slice(i, i + deA).join('') } });
    i += deA;
    setTimeout(paso, 25);
  };
  paso();
}

/** What isn't in the notes nor in the guide of the site: the model answers with what it knows, and the screen says so
 * (`general`). */
function enGeneral(id, humor = false, pedido = null, corto = null) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada) return;
  // Asked again after the pieces didn't have it: as it was asked the first time.
  const mensaje = pedido ?? entrada.pedido ?? entrada.pregunta;
  const puntual = !humor && (corto ?? entrada.corto ?? esPuntual(entrada.pregunta));
  // With «Usar Gemini» on, Gemini answers it, first even with the model ready.
  const nube = nubePara([]) === 'todo' ? 'todo' : null;
  // Without the model ready: what Gemini said stays as it is; anything else, why this computer doesn't answer.
  if (!nube && !conModelo()) {
    cambiarEntrada(id, (e) => (e.nube
      ? { texto: e.texto + (e.guardado ?? ''), guardado: undefined, estado: 'no-esta' }
      : { texto: sinCompu(estado.fase), estado: 'no-esta' }));
    return;
  }
  // A joke asked for isn't «not in the notes»: it goes without that notice.
  cambiarEntrada(id, { general: humor ? 'humor' : true, elegidos: [], texto: '', guardado: undefined, estado: 'leyendo', nube: undefined, nubeFallo: undefined, nubeTope: undefined });
  enviadas.add(id);
  const mensajes = [{ role: 'system', content: humor ? SISTEMA_HUMOR : SISTEMA_GENERAL }, ...charlaAntes(hilo, id, { sinPropias: true }), { role: 'user', content: puntual ? `${mensaje}\n${UNA_COSA}` : mensaje }];
  if (nube) porLaNube(id, mensajes, nube, puntual);
  else worker.postMessage({ tipo: 'preguntar', id, humor, corto: puntual, mensajes });
}

// Questions asked apart from this visit's talk (the session's Consultron, src/lib/enVivo/consultronMesa.js): they never
// show in the student's talk nor are kept with it. By id: { texto, listo }.
const aparte = new Map();
let numeroAparte = 0;

function alMensajeAparte(m) {
  const a = aparte.get(m.id);
  if (m.tipo === 'parte') a.texto += m.texto;
  else if (m.tipo === 'fin' || m.tipo === 'falla-respuesta') {
    aparte.delete(m.id);
    const texto = m.tipo === 'fin' && a.texto.trim() ? (m.cortada ? hastaLoEntero(a.texto) : a.texto) : null;
    a.listo(texto);
  }
}

/** Asks the model of this computer, apart from the talk: the messages as Consultron gives them ({ role, content }).
 * Resolves with the whole answer, or null if the model isn't loaded or it failed. */
export function preguntarAparte(mensajes, { corto = false } = {}) {
  if (!worker || estado.fase !== 'listo') return Promise.resolve(null);
  apurar();
  numeroAparte += 1;
  const id = `aparte-${numeroAparte}`;
  return new Promise((listo) => {
    aparte.set(id, { texto: '', listo });
    worker.postMessage({ tipo: 'preguntar', id, corto, mensajes });
  });
}

/** Resolves with the entry once its answer is done (or null if it was cleared). */
export function alTerminar(id) {
  return new Promise((listo) => {
    const ver = () => {
      const e = hilo.find((x) => x.id === id);
      if (e && (e.estado === 'leyendo' || e.estado === 'escribiendo')) return;
      avisados.delete(ver);
      listo(e ?? null);
    };
    avisados.add(ver);
    ver();
  });
}

/** The example of the calculator under an answer: { slug, nombre, clave, ejemplo, modo } (ejemplos.js). */
export function mostrarEjemplo(id, ejemplo) {
  cambiarEntrada(id, { ejemplo });
}

/** The answer is one of the calculator's own examples, with nothing written (ejemplos.js). */
export function mostrarSoloEjemplo(id, ejemplo) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo') return;
  cambiarEntrada(id, { estado: 'listo', texto: '', ejemplo });
}

/** Asks the model for the data of an exercise (calculos.js, `pedidoDeDatos` and `esquemaDe`). Its JSON, or null if
 * the question was stopped, the model isn't loaded or it failed. */
export function pedirDatos(id, mensajes, esquema) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo') return Promise.resolve(null);
  if (nubePara([]) === 'todo') return datosDeLaNube(id, mensajes, esquema);
  return datosDeLaCompu(id, mensajes, esquema);
}

function datosDeLaCompu(id, mensajes, esquema) {
  return new Promise((listo) => {
    const pedir = () => {
      if (hilo.find((x) => x.id === id)?.estado !== 'leyendo') return listo(null);
      esperandoDatos.set(id, listo);
      worker.postMessage({ tipo: 'extraer', id, mensajes, esquema });
      return undefined;
    };
    if (!cuandoEsteListo(id, pedir, () => listo(null))) listo(null);
  });
}

/** The JSON of a text that should be only that: Gemini sometimes wraps it in a block of code. Null if it isn't one. */
export function soloJson(texto) {
  const crudo = String(texto ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const valor = JSON.parse(crudo);
    return valor && typeof valor === 'object' ? crudo : null;
  } catch {
    return null;
  }
}

/** The data of an exercise from Gemini, with «Usar Gemini» on: its JSON, as the model's. Without it (stopped, the day's
 * limit, Google busy), the model of the computer, if it's ready. */
async function datosDeLaNube(id, mensajes, esquema) {
  const control = new AbortController();
  enLaNube.set(id, control);
  const ultimo = mensajes.at(-1);
  const pedido = [
    ...mensajes.slice(0, -1),
    { ...ultimo, content: `${ultimo.content}\n\nContestá solo con un objeto JSON que cumpla este esquema, sin nada más:\n${JSON.stringify(esquema)}` },
  ];
  const texto = await preguntarNube(pedido, 'todo', { senal: control.signal });
  enLaNube.delete(id);
  const json = soloJson(texto);
  if (json || control.signal.aborted) return json;
  const entrada = hilo.find((e) => e.id === id);
  return entrada?.estado === 'leyendo' ? datosDeLaCompu(id, mensajes, esquema) : null;
}

/** The answer is a calculator with the data of the exercise: { slug, nombre, filas, datos } (calculos.js). */
export function mostrarCalculo(id, calculo) {
  const entrada = hilo.find((e) => e.id === id);
  if (!entrada || entrada.estado !== 'leyendo') return;
  cambiarEntrada(id, { estado: 'calculo', calculo });
}

/** Under the answer, the calculator to try it: { slug, nombre }. */
export function sugerir(id, calculadora) {
  cambiarEntrada(id, { sugerida: calculadora });
}

export function frenar() {
  worker?.postMessage({ tipo: 'frenar' });
  // Gemini's, while written: it stays where it got.
  for (const c of nubeEscribiendo.values()) c.frenado = true;
  // The ones waiting for the model to load.
  if (alEstarListo.size) {
    const esperando = [...alEstarListo.entries()];
    alEstarListo.clear();
    hilo = hilo.map((e) => (esperando.some(([id]) => id === e.id) && e.estado === 'leyendo' ? { ...e, estado: 'frenado' } : e));
    for (const [, { fallar }] of esperando) fallar();
    avisar();
  }
  // The ones on their way to Gemini.
  if (enLaNube.size) {
    for (const c of enLaNube.values()) c.abort();
    hilo = hilo.map((e) => (enLaNube.has(e.id) && e.estado === 'leyendo' ? { ...e, estado: 'frenado' } : e));
    enLaNube.clear();
    avisar();
  }
  // One still looking for its pieces never reached the model: it stops here.
  if (hilo.some((e) => e.estado === 'leyendo' && !enviadas.has(e.id))) {
    hilo = hilo.map((e) => (e.estado === 'leyendo' && !enviadas.has(e.id) ? { ...e, estado: 'frenado' } : e));
    avisar();
  }
}

/** Opens a saved talk to go on with it, in place of the one on screen (which stays saved). False if it isn't there. */
export async function abrirCharla(id) {
  alDia();
  if (respondiendo(hilo)) return false;
  const alumno = usuarioActual();
  const leida = await leerCharla(alumno, id);
  if (!leida || respondiendo(hilo) || usuarioActual() !== alumno) return false;
  if (hilo !== escrito) guardarYa();
  soltarCharla();
  hilo = leida.entradas.map((e) => {
    numero += 1;
    return { ...e, id: numero };
  });
  charla = { id: leida.id, creada: leida.creada };
  escrito = hilo;
  avisar();
  return true;
}

/** Deletes a saved talk. If it's the one on screen, a new one starts. */
export async function borrarGuardada(id) {
  if (charla?.id === id) {
    if (respondiendo(hilo)) return;
    clearTimeout(porGuardar);
    hilo = [];
    charla = null;
    escrito = hilo;
    soltarCharla();
    avisar();
  }
  await borrarCharla(usuarioActual(), id);
  cambiaronCharlas();
}

/** A practice question in an entry (practica.js, Practica.jsx): what changes of its `practica`, and its state. */
export function ponerPractica(id, practica, estado) {
  cambiarEntrada(id, (e) => ({ practica: { ...e.practica, ...practica }, ...(estado ? { estado } : {}) }));
}

/** An entry of the talk as it is now, or undefined. */
export const entradaDe = (id) => hilo.find((e) => e.id === id);

/** The piece a practice question comes from, as the source of its entry. */
export function ponerTrozo(id, trozo) {
  cambiarEntrada(id, { elegidos: trozo ? [{ trozo }] : [] });
}

export const respondiendo = (h) => h.some((e) => e.estado === 'leyendo' || e.estado === 'escribiendo');

/** Starts a new talk. The one on screen stays saved. */
export function limpiar() {
  if (respondiendo(hilo)) return;
  if (hilo !== escrito) guardarYa();
  hilo = [];
  charla = null;
  escrito = hilo;
  // What was attached goes with the questions.
  soltarCharla();
  avisar();
}

/** The screen is open: the model stays. When it closes, after a while without the screen, it leaves the video card,
 * unless it loads as Super CVG opens. */
export function usar() {
  usos += 1;
  apurar();
  clearTimeout(suelto);
  return () => {
    usos -= 1;
    if (usos > 0) return;
    soltar();
  };
}

// An answer still being written, from a screen already closed, finishes first.
function soltar() {
  clearTimeout(suelto);
  suelto = setTimeout(() => {
    if (fijo || usos > 0 || estado.fase !== 'listo') return;
    if (respondiendo(hilo)) {
      soltar();
      return;
    }
    apagar();
    poner({ fase: 'quieto' });
  }, SUELTO_MS);
}

const escuchar = (f) => {
  avisados.add(f);
  return () => avisados.delete(f);
};

let foto = { estado, hilo };
const leer = () => {
  alDia();
  if (foto.estado !== estado || foto.hilo !== hilo) foto = { estado, hilo };
  return foto;
};

/** { estado, hilo }: how the model is, and the questions of this visit. */
export const useConsultron = () => useSyncExternalStore(escuchar, leer, leer);

/** Whether questions can be asked: the model ready, or Gemini with a permission of the place on (`permisos`, `lugar`:
 * { enResumen }, nube.js), also while the model isn't there or is getting ready. Not while the computer is looked at. */
// Where the computer can't run the model, also without «Usar Gemini»: the first question asks for it (Charla.jsx).
export const sePuedePreguntar = (estado, permisos, lugar = {}) => ['listo', 'no-puede'].includes(estado.fase) || (!['quieto', 'revisando', 'borrando'].includes(estado.fase) && nubeEnElLugar(permisos, lugar));
