// The C of the lab: xcc, a C compiler that runs as WebAssembly, in this worker, from this site's /motores/c/ (one zip with
// the compiler, the headers and the library). Each run compiles the code and runs the program it makes (cMotor.js);
// once loaded the worker loses the network (red.js). The messages are the ones of every engine (motor.js); a run brings
// the code alone (`codigo`, `nombre`) or a project (`archivos` [{ nombre, contenido }], `principal`), and its `fin` says
// in which file it broke (`archivo`) and what the program did to its files (`archivos`: { cambiados, borrados }).
// With `modo` { tipo: 'pasos', tope } it runs recording each step (cRastro.js) and sends the trace before its `fin`
// ({ tipo: 'pasos', pasos }, the same as Python's).
import { compilar, correrPrograma, prepararC, proyectoDe } from './cMotor';
import { grabar } from './cRastro';
import { TOPE_SALIDA } from './lenguajes';
import { TOPE_PASOS } from './pasos';
import { contarBajadas } from './progreso';
import { cerrarRed } from './red';

const enviar = self.postMessage.bind(self);
const escuchar = self.addEventListener.bind(self);
// Where the browser can pause WebAssembly (JSPI), scanf() waits for what the student types; elsewhere it reads the
// lines written before running.
const PAUSA = typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function';
const codificar = (t) => new TextEncoder().encode(t);

let c = null;
let corrida = 0;
let escrito = 0;
let cortado = false;
let esperando = null;
let espera = 0;
let desdeEspera = 0;
let antes = [];
let avisoSinPausa = false;
// What it printed and wasn't sent yet: a loop that prints line by line goes in a few messages.
let pendiente = { flujo: '', texto: '' };
let enviado = 0;
// The line it's printing (the question before a scanf) and the end of what it wrote to stderr (a failed assert).
let abierta = '';
let errores = '';
let decodificadores = {};

function mandar() {
  if (pendiente.texto) enviar({ tipo: 'salida', id: corrida, flujo: pendiente.flujo, texto: pendiente.texto });
  pendiente = { flujo: '', texto: '' };
  enviado = performance.now();
}

function sumar(flujo, texto) {
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
  if (flujo === 'out') {
    const fin = texto.lastIndexOf('\n');
    abierta = fin >= 0 ? texto.slice(fin + 1) : `${abierta}${texto}`.slice(-200);
  } else errores = `${errores}${texto}`.slice(-2000);
  if (pendiente.texto.length > 8192 || performance.now() - enviado > 50) mandar();
}

// system("cls") (c/apoyo.c) writes a terminal's «clear the screen»: the console gets it as `limpiar`, and what came
// before it is no longer shown.
const LIMPIAR = '\x1b[2J\x1b[H';
const escribir = (fd, bytes) => {
  const flujo = fd === 2 ? 'err' : 'out';
  decodificadores[flujo] ??= new TextDecoder();
  const partes = decodificadores[flujo].decode(bytes, { stream: true }).split(LIMPIAR);
  partes.forEach((texto, i) => {
    if (i > 0 && !cortado) {
      pendiente = { flujo: '', texto: '' };
      enviar({ tipo: 'limpiar', id: corrida });
    }
    sumar(flujo, texto);
  });
};

// What the program reads from the keyboard: a line the student types (with its Enter), or the end of the input.
function leer() {
  if (PAUSA) {
    mandar();
    return new Promise((resolver) => {
      esperando = resolver;
      desdeEspera = performance.now();
      enviar({ tipo: 'pide', id: corrida, pregunta: abierta.slice(-200) });
    });
  }
  if (antes.length) {
    const linea = String(antes.shift());
    sumar('out', `${linea}\n`);
    return codificar(`${linea}\n`);
  }
  if (!avisoSinPausa) {
    avisoSinPausa = true;
    mandar();
    enviar({ tipo: 'sin-pausa', id: corrida });
  }
  return new Uint8Array(0);
}

async function cargar(base, total) {
  contarBajadas(self, (bajado) => enviar({ tipo: 'progreso', bajado, total }));
  const respuesta = await fetch(`${base}c/wccfiles.zip`);
  if (!respuesta.ok) throw new Error(`No se pudo bajar C (${respuesta.status}).`);
  c = await prepararC(new Uint8Array(await respuesta.arrayBuffer()));
  cerrarRed(self);
  return { version: `xcc ${c.version}`.trim(), pausa: PAUSA };
}

async function ejecutar({ id, codigo, nombre, lineas, archivos, principal, modo }) {
  corrida = id;
  escrito = 0;
  cortado = false;
  espera = 0;
  antes = Array.isArray(lineas) ? lineas.slice(0, 1000) : [];
  avisoSinPausa = false;
  pendiente = { flujo: '', texto: '' };
  enviado = performance.now();
  abierta = '';
  errores = '';
  decodificadores = {};
  const proyecto = proyectoDe({ codigo, nombre, archivos, principal });
  const desde = performance.now();
  let r;
  let pasos = null;
  try {
    const compilado = await compilar(c, proyecto);
    if (compilado.error) r = compilado;
    else {
      compilado.avisos.forEach((a) => sumar('err', a));
      const comun = { pausa: PAUSA, leer, escribir, ultimoError: () => errores };
      const grabado = modo?.tipo === 'pasos' ? await grabar(c, proyecto, { ...comun, tope: Number(modo.tope) || TOPE_PASOS }) : null;
      if (grabado) ({ r, pasos } = grabado);
      else {
        if (modo?.tipo === 'pasos') sumar('err', 'Este programa no se puede seguir paso a paso. Corre como siempre.\n');
        r = await correrPrograma({ programa: compilado.programa, fuentes: proyecto.fuentes, datos: proyecto.datos, nombre: proyecto.principal, ...comun });
      }
    }
  } catch (e) {
    r = { error: `El programa se cortó por un error.\n${String(e?.message ?? e)}`, linea: 0 };
  }
  for (const [flujo, d] of Object.entries(decodificadores)) sumar(flujo, d.decode());
  if (r.codigo) sumar('err', `${abierta ? '\n' : ''}El programa terminó con el código ${r.codigo}.\n`);
  mandar();
  if (pasos) enviar({ tipo: 'pasos', id, pasos });
  const cambios = r.archivos ?? null;
  const fin = { tipo: 'fin', id, ms: Math.round(performance.now() - desde - espera), error: typeof r.error === 'string' ? r.error : null, linea: Number(r.linea) || 0, archivo: typeof r.archivo === 'string' ? r.archivo : null, archivos: cambios };
  enviar(fin, cambios ? cambios.cambiados.map((a) => a.contenido.buffer) : []);
}

// Compiles without running, to mark the errors while the student types (revisar.js): `revisado` { error, linea, archivo,
// avisos }, as a run says them. The project's files, as in a run.
async function revisar({ id, codigo, nombre, archivos, principal }) {
  let r;
  try {
    r = await compilar(c, proyectoDe({ codigo, nombre, archivos, principal }));
  } catch {
    r = {};
  }
  enviar({ tipo: 'revisado', id, error: typeof r.error === 'string' ? r.error : null, linea: Number(r.linea) || 0, archivo: typeof r.archivo === 'string' ? r.archivo : null, avisos: Array.isArray(r.avisos) ? r.avisos.map(String) : [] });
}

escuchar('message', async ({ data }) => {
  if (data?.tipo === 'cargar') {
    try {
      enviar({ tipo: 'listo', ...(await cargar(String(data.base), Number(data.total) || 0)) });
    } catch (e) {
      enviar({ tipo: 'falla', mensaje: String(e?.message ?? e) });
    }
  } else if (data?.tipo === 'correr' && c) {
    ejecutar(data);
  } else if (data?.tipo === 'revisar' && c) {
    revisar(data);
  } else if (data?.tipo === 'entrada' && esperando) {
    const resolver = esperando;
    esperando = null;
    espera += performance.now() - desdeEspera;
    abierta = '';
    resolver(typeof data.texto === 'string' ? codificar(`${data.texto}\n`) : new Uint8Array(0));
  }
});
