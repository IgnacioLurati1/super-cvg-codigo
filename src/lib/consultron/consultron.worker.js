// Consultron's model, in a worker that starts from a blob (motor.js), so it carries the page's CSP: it can only reach
// the site and Hugging Face. web-llm runs the model on the video card (WebGPU) and keeps it in the browser's Cache
// Storage. The model's program (WebAssembly) comes from the site, /motores/consultron/; its weights, from Hugging Face,
// pinned to one version.
//
// To it: `revisar` { pesos, programa }, `cargar` { lento }, `apurar`, `preguntar` { id, mensajes }, `extraer` { id, mensajes, esquema },
// `frenar`, `borrar`.
// From it: `revision` { bajado }, `progreso` { fraccion, mb, segundos, fase: 'bajando' | 'preparando' }, `listo`,
// `falla` { mensaje, nombre } (loading), `parte` { id, texto }, `fin` { id, frenado }, `falla-respuesta` { id, mensaje,
// nombre }, `datos` { id, texto } (the JSON of `extraer`, empty if it failed), `borrado`.
import { MLCEngine, deleteModelAllInfoInCache, hasModelInCache, prebuiltAppConfig } from '@mlc-ai/web-llm';
import { crearPlaca } from './placa.js';
import { repartirLectura, respiroTras } from './ritmo.js';

const MODELO = 'Qwen3.5-4B-q4f16_1-MLC';

let config = null;
let motor = null;
let corriendo = null;

// The programs of the video card, compiled ahead so the first answer doesn't freeze the browser (placa.js). Before
// web-llm touches the card.
const placa = crearPlaca({ ambito: self, almacen: self.caches });

// Loading in the background (`lento`), it rests between the pieces of the weights it takes from the browser's cache: the
// disk and the video card stay free for the rest of the computer. `apurar` takes the rest away.
const PAUSA_MS = 250;
let pausa = 0;
// web-llm looks up each piece twice: it rests only the first.
const vistas = new Set();
let apurar = () => {};
const esPieza = (pedido) => /params_shard_\d+\.bin$/.test(String(pedido?.url ?? pedido));
const abrirCache = self.caches.open.bind(self.caches);
self.caches.open = async (nombre) => {
  const cache = await abrirCache(nombre);
  const buscar = cache.match.bind(cache);
  cache.match = async (pedido, opciones) => {
    const url = String(pedido?.url ?? pedido);
    if (pausa && esPieza(url) && !vistas.has(url)) {
      vistas.add(url);
      await new Promise((listo) => {
        const reloj = setTimeout(listo, pausa);
        apurar = () => {
          clearTimeout(reloj);
          listo();
        };
      });
    }
    return buscar(pedido, opciones);
  };
  return cache;
};

const decir = (m) => self.postMessage(m);
const falla = (e) => ({ mensaje: String(e?.message ?? e).slice(0, 300), nombre: String(e?.name ?? '') });

function armarConfig({ pesos, programa }) {
  const base = prebuiltAppConfig.model_list.find((m) => m.model_id === MODELO);
  return {
    // The Cache API: what the browser can show and clear like the rest of the site's data.
    useIndexedDBCache: false,
    model_list: [{ ...base, model: pesos, model_lib: programa }],
  };
}

async function cargar() {
  await placa.preparar(config.model_list[0].model_lib);
  motor = new MLCEngine({
    appConfig: config,
    initProgressCallback: ({ progress, timeElapsed, text }) => {
      const bajando = /fetch/i.test(text ?? '');
      const mb = Number(/(\d+)\s*MB fetched/i.exec(text ?? '')?.[1]);
      decir({ tipo: 'progreso', fase: bajando ? 'bajando' : 'preparando', fraccion: progress, mb: Number.isFinite(mb) ? mb : null, segundos: timeElapsed });
    },
  });
  await motor.reload(MODELO);
  // From here on it reads each question in small pieces (ritmo.js).
  repartirLectura(motor.loadedModelIdToPipeline?.get(MODELO));
  await placa.compiladas();
  // The first answer prepares what the video card runs: it's done here, while loading. What it asks for the first
  // time on this computer is kept, to have it compiled ahead from the next load on.
  decir({ tipo: 'progreso', fase: 'preparando', fraccion: 1, mb: null, segundos: null });
  await motor.chat.completions.create({ messages: [{ role: 'user', content: 'Hola' }], max_tokens: 1, extra_body: { enable_thinking: false } });
  await motor.resetChat();
  await placa.guardar();
}

// What the model is asked, in line.
let cola = Promise.resolve();

// A joke needs some invention, and loops more easily: hotter, shorter and punished harder for repeating itself.
const HUMOR = { temperature: 0.8, frequency_penalty: 0.8, presence_penalty: 0.6, max_tokens: 160 };

// One thing was asked (pedido.js, `esPuntual`): the answer has no room to go on with the rest.
const CORTO = { max_tokens: 260 };

async function preguntar({ id, mensajes, humor = false, corto = false }) {
  corriendo = id;
  let frenado = false;
  let cortada = false;
  try {
    const corriente = await motor.chat.completions.create({
      messages: mensajes,
      stream: true,
      temperature: 0.2,
      // Small models loop on a phrase: what it already said weighs a little less.
      frequency_penalty: 0.3,
      max_tokens: 800,
      ...(corto ? CORTO : {}),
      ...(humor ? HUMOR : {}),
      extra_body: { enable_thinking: false },
    });
    let desde = performance.now();
    for await (const parte of corriente) {
      const texto = parte.choices[0]?.delta?.content ?? '';
      if (texto) decir({ tipo: 'parte', id, texto });
      if (parte.choices[0]?.finish_reason === 'abort') frenado = true;
      if (parte.choices[0]?.finish_reason === 'length') cortada = true;
      // The next word is worked out only when asked for: a breath between words leaves the video card free to draw the
      // screen. At full speed the whole computer lags. The breath grows with what the word took (ritmo.js).
      const respiro = respiroTras(performance.now() - desde);
      await new Promise((r) => setTimeout(r, respiro));
      desde = performance.now();
    }
    decir({ tipo: 'fin', id, frenado, cortada });
  } catch (e) {
    decir({ tipo: 'falla-respuesta', id, ...falla(e) });
  } finally {
    corriendo = null;
    // Each question goes on its own: nothing of the one before stays in the model.
    await motor?.resetChat().catch(() => {});
    // A longer answer may have asked the video card for something new.
    placa.guardar();
  }
}

// The data of an exercise for a calculator (calculos.js): the answer can only be the JSON of the form, so the model
// can't name a field or an option that doesn't exist.
async function extraer({ id, mensajes, esquema }) {
  corriendo = id;
  let texto = '';
  try {
    const respuesta = await motor.chat.completions.create({
      messages: mensajes,
      temperature: 0,
      max_tokens: 600,
      response_format: { type: 'json_object', schema: JSON.stringify(esquema) },
      extra_body: { enable_thinking: false },
    });
    texto = respuesta.choices[0]?.message?.content ?? '';
  } catch {
    texto = '';
  } finally {
    corriendo = null;
    await motor?.resetChat().catch(() => {});
    placa.guardar();
  }
  decir({ tipo: 'datos', id, texto });
}

self.onmessage = async ({ data }) => {
  try {
    if (data.tipo === 'revisar') {
      config = armarConfig(data);
      decir({ tipo: 'revision', bajado: await hasModelInCache(MODELO, config).catch(() => false) });
    } else if (data.tipo === 'cargar') {
      pausa = data.lento ? PAUSA_MS : 0;
      await cargar();
      pausa = 0;
      decir({ tipo: 'listo' });
    } else if (data.tipo === 'preguntar' || data.tipo === 'extraer') {
      // One at a time: an answer asked while an example is made waits for it.
      const hacer = data.tipo === 'preguntar' ? preguntar : extraer;
      const turno = cola.then(() => hacer(data));
      cola = turno.catch(() => {});
      await turno;
    } else if (data.tipo === 'apurar') {
      pausa = 0;
      apurar();
    } else if (data.tipo === 'frenar') {
      if (corriendo !== null) motor?.interruptGenerate();
    } else if (data.tipo === 'borrar') {
      await motor?.unload().catch(() => {});
      motor = null;
      await deleteModelAllInfoInCache(MODELO, config);
      await placa.olvidar();
      decir({ tipo: 'borrado' });
    }
  } catch (e) {
    decir({ tipo: 'falla', ...falla(e) });
  }
};
