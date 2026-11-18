// The JavaScript of the lab: QuickJS in WebAssembly (jsMotor.js), in this worker, from this site's /motores/js/. The
// student's code is read and run by QuickJS, never by this worker's JavaScript: no eval, as the CSP says. Once loaded
// the worker loses the network (red.js). The messages are the ones of every engine (motor.js); a run brings the code
// alone (`codigo`, `nombre`) or a project (`archivos` [{ nombre, contenido }], `principal`), and its `fin` says in which
// file it broke (`archivo`) and `archivos` { cambiados: [], borrados: [] }: console JavaScript doesn't touch files.
// prompt() always waits for what the student types: asyncify pauses QuickJS in every browser, without JSPI.
import { correrJs, prepararJs, proyectoJs, revisarJs, VERSION } from './jsMotor';
import { TOPE_SALIDA } from './lenguajes';
import { contarBajadas } from './progreso';
import { cerrarRed } from './red';

const enviar = self.postMessage.bind(self);
const escuchar = self.addEventListener.bind(self);

let motor = null;
// The bytes of the engine, to load it again if a run breaks it (the network is gone by then).
let wasm = null;
let corrida = 0;
let escrito = 0;
let cortado = false;
let esperando = null;
let espera = 0;
let desdeEspera = 0;
// What it printed and wasn't sent yet: a loop that prints line by line goes in a few messages.
let pendiente = { flujo: '', texto: '' };
let enviado = 0;

function mandar() {
  if (pendiente.texto) enviar({ tipo: 'salida', id: corrida, flujo: pendiente.flujo, texto: pendiente.texto });
  pendiente = { flujo: '', texto: '' };
  enviado = performance.now();
}

function escribir(flujo, texto) {
  if (cortado || !texto) return;
  escrito += texto.length;
  if (escrito > TOPE_SALIDA) {
    cortado = true;
    mandar();
    enviar({ tipo: 'tope', id: corrida });
    return;
  }
  if (pendiente.flujo && pendiente.flujo !== flujo) mandar();
  pendiente.flujo = flujo;
  pendiente.texto += texto;
  if (pendiente.texto.length > 8192 || performance.now() - enviado > 50) mandar();
}

// What prompt() reads: the question goes to the console, and the program waits for the line the student types.
function leer(pregunta) {
  escribir('out', pregunta);
  mandar();
  return new Promise((resolver) => {
    esperando = resolver;
    desdeEspera = performance.now();
    enviar({ tipo: 'pide', id: corrida, pregunta: pregunta.trim().slice(-200) });
  });
}

// console.clear(): what came before it is no longer shown.
function limpiar() {
  if (cortado) return;
  pendiente = { flujo: '', texto: '' };
  enviar({ tipo: 'limpiar', id: corrida });
}

async function cargar(base, total) {
  contarBajadas(self, (bajado) => enviar({ tipo: 'progreso', bajado, total }));
  const respuesta = await fetch(`${base}js/quickjs.wasm`);
  if (!respuesta.ok) throw new Error(`No se pudo bajar JavaScript (${respuesta.status}).`);
  wasm = new Uint8Array(await respuesta.arrayBuffer());
  motor = await prepararJs(wasm);
  cerrarRed(self);
  return { version: VERSION, pausa: true };
}

async function ejecutar({ id, codigo, nombre, archivos, principal }) {
  corrida = id;
  escrito = 0;
  cortado = false;
  espera = 0;
  pendiente = { flujo: '', texto: '' };
  enviado = performance.now();
  const desde = performance.now();
  const proyecto = proyectoJs({ codigo, nombre, archivos, principal });
  let r;
  if (proyecto.error) r = { error: proyecto.error, linea: 0, archivo: null };
  else {
    try {
      // Past the limit of what it prints, it stops here too, before this worker goes.
      r = await correrJs(motor, proyecto, { escribir, leer, limpiar, parar: () => cortado });
    } catch (e) {
      // What breaks out of QuickJS (the browser's stack, before QuickJS's own) leaves it halfway: a new one, from the
      // same bytes, for the next run.
      const pila = /call stack|too much recursion/i.test(String(e?.message ?? e));
      r = { error: pila ? 'InternalError: Se llenó la pila (stack overflow). Seguro es una recursión que no termina.' : `El programa se cortó por un error.\n${String(e?.message ?? e)}`, linea: 0, archivo: null };
      motor = await prepararJs(wasm);
    }
  }
  mandar();
  enviar({ tipo: 'fin', id, ms: Math.round(performance.now() - desde - espera), error: r.error ?? null, linea: Number(r.linea) || 0, archivo: typeof r.archivo === 'string' ? r.archivo : null, archivos: { cambiados: [], borrados: [] } });
}

escuchar('message', async ({ data }) => {
  if (data?.tipo === 'cargar') {
    try {
      enviar({ tipo: 'listo', ...(await cargar(String(data.base), Number(data.total) || 0)) });
    } catch (e) {
      enviar({ tipo: 'falla', mensaje: String(e?.message ?? e) });
    }
  } else if (data?.tipo === 'correr' && motor) {
    ejecutar(data);
  } else if (data?.tipo === 'revisar' && motor) {
    // Compiles the open file without running it (revisar.js): `revisado` { error, linea }, as a run says it.
    let r = {};
    try {
      r = revisarJs(motor, data);
    } catch {
      // Nothing to mark.
    }
    enviar({ tipo: 'revisado', id: data.id, error: typeof r.error === 'string' ? r.error : null, linea: Number(r.linea) || 0 });
  } else if (data?.tipo === 'entrada' && esperando) {
    const resolver = esperando;
    esperando = null;
    espera += performance.now() - desdeEspera;
    resolver(typeof data.texto === 'string' ? data.texto : null);
  }
});
