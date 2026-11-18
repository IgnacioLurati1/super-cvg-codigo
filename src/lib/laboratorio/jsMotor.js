// The JavaScript of the lab: QuickJS (Fabrice Bellard's, 2025-09-13), an interpreter of JavaScript compiled to
// WebAssembly by quickjs-emscripten in its asyncify build. The student's code never goes through the page's `eval` or
// `new Function` (the CSP doesn't allow them): QuickJS reads it and runs it inside its WebAssembly, which is all
// `'wasm-unsafe-eval'` lets in. Asyncify lets `prompt()` wait for what the student types in any browser, without JSPI.
//
// Console JavaScript, as Node runs it without its modules: `console`, `prompt()`, timers (jsConsola.js) and what the
// language brings. No HTML or DOM, no network (the worker loses it, red.js) and no files: the `.js` of a project import
// each other (`import`/`export`, by their path in the project, with or without `.js`), a `.json` comes as its value
// (`import datos from './datos.json'`) and a `.txt` or `.csv` as its text. The main file is a module only if it imports
// or exports: otherwise it runs as a script, as in a browser's console (a variable without `let` still works).
import { newQuickJSAsyncWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import variante from '@jitl/quickjs-wasmfile-release-asyncify';
import { CONSOLA, RELOJES } from './jsConsola';
import { explicarError } from './jsMensajes';

export const VERSION = 'QuickJS 2025-09-13';
// How deep a recursion goes before QuickJS says «stack overflow»: about 600 calls of a function, 170 through a `map`.
// The browser's own stack ends first past ~135 KB of this one in a Chrome worker (740 and 200 calls, measured): if it
// still ends first, js.worker.js says the same without the line and loads the engine again.
const PILA = 112 * 1024;
const MEMORIA = 256 * 1024 * 1024;
const EXTENSIONES = /\.(?:m?js|json|txt|csv)$/i;
const DE_CODIGO = /\.m?js$/i;

/** The engine, from the bytes of its WebAssembly (/motores/js/quickjs.wasm). */
export const prepararJs = (wasm) => newQuickJSAsyncWASMModuleFromVariant(newVariant(variante, { wasmBinary: wasm }));

const texto = (c) => (typeof c === 'string' ? c : ArrayBuffer.isView(c) ? new TextDecoder().decode(c) : '');
// A path of the project: forward slashes, without `./` or `/` at its start, never out of it.
function ruta(nombre) {
  const partes = [];
  for (const p of String(nombre ?? '').replace(/\\/g, '/').split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') return '';
    partes.push(p);
  }
  return partes.join('/');
}

/** What a run brings, as the engine runs it: { fuentes (Map by path), principal } or { error }. */
export function proyectoJs({ codigo, nombre, archivos, principal }) {
  if (!Array.isArray(archivos)) {
    const n = ruta(nombre) || 'main.js';
    return { fuentes: new Map([[n, String(codigo ?? '')]]), principal: n };
  }
  const fuentes = new Map();
  for (const a of archivos) {
    const n = ruta(a?.nombre);
    if (n && EXTENSIONES.test(n)) fuentes.set(n, texto(a.contenido));
  }
  const elegido = ruta(principal);
  const p = fuentes.has(elegido) && DE_CODIGO.test(elegido) ? elegido : [...fuentes.keys()].find((n) => DE_CODIGO.test(n));
  if (!p) return { error: 'El proyecto no tiene ningún archivo .js para correr.' };
  return { fuentes, principal: p };
}

// Where an `import` of `base` goes: a path of the project, as Node and the browsers say it, also without `.js`.
function resolver(fuentes, base, pedido) {
  const p = String(pedido);
  const relativo = p.startsWith('./') || p.startsWith('../');
  const partes = relativo ? [...base.split('/').slice(0, -1), ...p.split('/')] : p.split('/');
  const fuera = [];
  for (const x of partes) {
    if (x === '' || x === '.') continue;
    if (x === '..') fuera.pop();
    else fuera.push(x);
  }
  const r = fuera.join('/');
  return [r, `${r}.js`, `${r}/index.js`].find((n) => fuentes.has(n)) ?? null;
}

// `with { type: 'json' }` after an import, as Node and the browsers ask for a .json: QuickJS doesn't take it from here,
// so it goes as spaces (the lines and columns stay) and the .json comes as the default of a module.
const sinAtributos = (codigo) => codigo.replace(/(from\s*(['"])[^'"\n]*\.json\2)(\s*(?:with|assert)\s*\{\s*type\s*:\s*(['"])json\4\s*\})/g, (_, antes, _c, atributos) => antes + atributos.replace(/[^\n]/g, ' '));

// A module of the project as QuickJS loads it: the code of a `.js`, and the data of the others as their default.
function modulo(nombre, contenido) {
  if (DE_CODIGO.test(nombre)) return sinAtributos(contenido);
  if (/\.json$/i.test(nombre)) return `export default JSON.parse(${JSON.stringify(contenido)});\n`;
  return `export default ${JSON.stringify(contenido)};\n`;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// What an `import` of the project loads, in the runtime `rt`. Gives how to know the first import of a file that isn't
// there ({ desde, pedido }, or null).
function ponerCargador(rt, fuentes) {
  let faltante = null;
  rt.setModuleLoader(
    (nombre) => (fuentes.has(nombre) ? modulo(nombre, fuentes.get(nombre)) : { error: new Error(`No está ${nombre} en el proyecto.`) }),
    (base, pedido) => {
      const r = resolver(fuentes, base, pedido);
      if (r) return r;
      faltante ??= { desde: base, pedido: String(pedido) };
      return { error: new Error(`No está ${pedido} en el proyecto.`) };
    },
  );
  return () => faltante;
}

/**
 * Compiles the open file (`nombre`) without running it, to mark its error while the student types (revisar.js):
 * { error, linea, archivo } as a run says it, the error null if it compiles. In a runtime of its own, as a run reads
 * it: a script, or a module if it imports or exports or has an `await` outside a function. What it imports of the
 * project (`archivos`, as a run gets them) is compiled too, and never run.
 */
export function revisarJs(motor, { codigo, nombre, archivos }) {
  const n = ruta(nombre) || 'main.js';
  const fuente = sinAtributos(String(codigo ?? ''));
  const fuentes = proyectoJs({ archivos: Array.isArray(archivos) ? archivos : [] }).fuentes ?? new Map();
  fuentes.set(n, String(codigo ?? ''));
  const rt = motor.newRuntime();
  rt.setMaxStackSize(PILA);
  rt.setMemoryLimit(MEMORIA);
  const faltante = ponerCargador(rt, fuentes);
  const ctx = rt.newContext();
  try {
    // A run lets QuickJS tell a module by its `import` or `export`: compiling alone it doesn't, so it's told here.
    const modulo = /^[ \t]*(?:import\s*[\w${*'"]|export\b)/m.test(fuente);
    let r = ctx.evalCode(fuente, n, { type: modulo ? 'module' : 'global', compileOnly: true });
    if (r.error && /\bawait\b/.test(fuente) && ctx.dump(r.error)?.name === 'SyntaxError') {
      const otra = ctx.evalCode(fuente, n, { type: 'module', compileOnly: true });
      if (otra.error) otra.error.dispose();
      else {
        r.error.dispose();
        r = otra;
      }
    }
    if (!r.error) {
      r.value.dispose();
      return { error: null, linea: 0, archivo: null };
    }
    const valor = ctx.dump(r.error);
    r.error.dispose();
    return explicarError(valor, fuentes, { faltante: faltante() });
  } finally {
    try {
      ctx.dispose();
      rt.dispose();
    } catch {
      // Already gone with the runtime.
    }
  }
}

/**
 * Runs a project (proyectoJs). `escribir(flujo, texto)` gets what it prints ('out' or 'err'), `leer(pregunta)` gives
 * what the student types (a string, null if there's nothing, or a promise of either), `limpiar()` is console.clear()
 * and `parar()`, called while it runs, stops it when it returns true. Resolves with { error, linea, archivo }.
 */
export async function correrJs(motor, { fuentes, principal }, { escribir, leer, limpiar = () => {}, parar = null }) {
  const rt = motor.newRuntime();
  rt.setMaxStackSize(PILA);
  rt.setMemoryLimit(MEMORIA);
  if (parar) rt.setInterruptHandler(() => parar() === true);
  const faltante = ponerCargador(rt, fuentes);
  let enTrabajos = false;
  // A prompt() that couldn't wait (after an `await`): the error of the run if nothing else broke.
  let sinEspera = null;
  const ctx = rt.newContext();
  const fallo = (handle) => {
    const valor = ctx.dump(handle);
    handle.dispose();
    return explicarError(valor, fuentes, { faltante: faltante() });
  };
  try {
    const lab = ctx.newObject();
    ctx.newFunction('escribir', (flujo, t) => {
      escribir(ctx.getString(flujo) === 'err' ? 'err' : 'out', ctx.getString(t));
    }).consume((f) => ctx.setProp(lab, 'escribir', f));
    // A promise suspends QuickJS until it resolves (asyncify), which only works from evalCodeAsync: after an `await`,
    // where the jobs of the promises run, prompt() can't wait and says so.
    ctx.newAsyncifiedFunction('leer', (pregunta) => {
      if (enTrabajos) throw new Error('`prompt()` no puede esperar lo que escribís después de un `await`. Pedí los datos antes.');
      const valor = (linea) => (typeof linea === 'string' ? ctx.newString(linea) : ctx.null);
      const r = leer(ctx.getString(pregunta));
      return r instanceof Promise ? r.then(valor) : valor(r);
    }).consume((f) => ctx.setProp(lab, 'leer', f));
    ctx.newFunction('sinEspera', (mensaje, pila) => {
      sinEspera ??= { name: 'Error', message: ctx.getString(mensaje), stack: ctx.getString(pila) };
    }).consume((f) => ctx.setProp(lab, 'sinEspera', f));
    ctx.newFunction('limpiar', () => {
      limpiar();
    }).consume((f) => ctx.setProp(lab, 'limpiar', f));
    ctx.setProp(ctx.global, '__lab', lab);
    lab.dispose();
    ctx.unwrapResult(ctx.evalCode(CONSOLA, '<laboratorio>', { type: 'global' })).dispose();

    const codigo = sinAtributos(fuentes.get(principal));
    let r = await ctx.evalCodeAsync(codigo, principal);
    // An `await` outside a function, as a browser's console takes it: the same code as a module (it didn't run, it
    // didn't compile).
    if (r.error && /\bawait\b/.test(codigo) && ctx.dump(r.error)?.name === 'SyntaxError') {
      const otra = await ctx.evalCodeAsync(codigo, principal, { type: 'module' });
      if (otra.error) otra.error.dispose();
      else {
        r.error.dispose();
        r = otra;
      }
    }
    if (r.error) return fallo(r.error);
    // A module gives a promise: it ends when its `await` do. Then the timers, each when its time comes.
    let promesa = r.value;
    for (;;) {
      enTrabajos = true;
      const hechos = rt.executePendingJobs();
      enTrabajos = false;
      if (hechos.error) return fallo(hechos.error);
      if (promesa) {
        const estado = ctx.getPromiseState(promesa);
        if (estado.type === 'rejected') {
          promesa.dispose();
          return fallo(estado.error);
        }
        if (estado.type === 'fulfilled') {
          if (!estado.notAPromise) estado.value.dispose();
          promesa.dispose();
          promesa = null;
        }
      }
      const espera = ctx.unwrapResult(ctx.evalCode(`globalThis[Symbol.for(${JSON.stringify(RELOJES)})].espera()`, '<laboratorio>', { type: 'global' })).consume((h) => ctx.getNumber(h));
      if (espera < 0) break;
      if (espera > 0) await dormir(espera);
      if (parar?.() === true) return explicarError({ name: 'InternalError', message: 'interrupted', stack: '' }, fuentes);
      const disparo = await ctx.evalCodeAsync(`globalThis[Symbol.for(${JSON.stringify(RELOJES)})].disparar()`, '<laboratorio>', { type: 'global' });
      if (disparo.error) return fallo(disparo.error);
      disparo.value.dispose();
    }
    promesa?.dispose();
    if (sinEspera) return explicarError(sinEspera, fuentes);
    return { error: null, linea: 0, archivo: null };
  } finally {
    // What a run left (variables, host functions) goes with its runtime; a leak here only lasts until the worker ends.
    try {
      ctx.dispose();
      rt.dispose();
    } catch {
      // Already gone with the runtime.
    }
  }
}
