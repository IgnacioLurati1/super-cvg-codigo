import { useSyncExternalStore } from 'react';
import urlPython from './python.worker.js?worker&url';
import urlSql from './sql.worker.js?worker&url';
import urlC from './c.worker.js?worker&url';
import urlJs from './js.worker.js?worker&url';
import { LENGUAJES } from './lenguajes';
import { archivoDe, importadosDelSitio, paqueteDe, paquetesDe, pesoDe } from './modulos';
import { alOlvidarLaboratorio } from './pendiente';

// The engine of each language, on this side: its worker, its state for the screen and the run going on. One per language
// for the whole tab, so coming back to the lab finds it loaded; with the lab closed for a while, it goes away.
//
// Every worker answers the same messages. To it: `cargar` { base, total }, `correr` { id, codigo, nombre, lineas },
// `entrada` { texto } and, in SQL, `reiniciar`. From it: `progreso` { bajado, total }, `listo` { version, pausa },
// `falla` { mensaje }, and for a run `salida` { flujo, texto }, `tabla` { columnas, filas, recortada, linea },
// `cambios` { cambios, linea }, `pide`, `sin-pausa`, `tope` and `fin` { ms, error, linea }; in SQL also `esquema`.
// C, Python and JavaScript also run a project: `correr` with `archivos` [{ nombre, contenido }] and `principal`, and its `fin`
// brings `archivo` (where it broke) and `archivos` { cambiados: [{ nombre, contenido }], borrados } (c.worker.js,
// python.worker.js, js.worker.js). The packages of a Python project are the ones its `.py` import.
// Python also runs with a `modo` in `correr`: { tipo: 'pasos', tope } sends `pasos` { pasos } (rastreo.js), and
// { tipo: 'medir', funcion, argumentos, tamanos, presupuesto } sends `medida-empieza`, `medida`, `medida-tope` and
// `medida-falla`; { tipo: 'medir', programa: true, vueltas, presupuesto } measures the whole program and sends
// `medida-vuelta` { vuelta, s }, `medida-funciones` { texto } (JSON: { total, funciones: [{ nombre, archivo, llamadas,
// s }], mas }), `medida-tope` and `medida-falla`.
// Python, a package the program imports (modulos.js): this side downloads its file and sends `paquete` { nombre, bytes }
// before the run; the worker, with no network, unpacks it and answers `paquete` { nombre, ok }. A matplotlib figure
// comes as `imagen` { png } (graficos.js).
// The run is stopped from here: «Parar», the time limit or too much output end the worker, and a new one loads.
const URLS = { python: urlPython, sql: urlSql, c: urlC, javascript: urlJs };
const PESOS = __PESOS_LABORATORIO__;
const SUELTO_MS = 5 * 60_000;

// The Python a run brings: the code alone, or every `.py` of its project.
function codigoPython(codigo, archivos) {
  if (!Array.isArray(archivos)) return String(codigo ?? '');
  return archivos
    .filter((a) => /\.py$/.test(String(a?.nombre)))
    .map((a) => (typeof a.contenido === 'string' ? a.contenido : ArrayBuffer.isView(a.contenido) ? new TextDecoder().decode(a.contenido) : ''))
    .join('\n');
}

const baseDeMotores = () => new URL(`${import.meta.env.BASE_URL}motores/`, window.location.href).href;

// The worker starts from a blob that only imports the real one: a worker from a blob carries the page's CSP, one from
// an address of the site would carry none (GitHub Pages sends no headers).
function crearWorker(url, nombre) {
  const arranque = URL.createObjectURL(new Blob([`import ${JSON.stringify(new URL(url, window.location.href).href)};\n`], { type: 'text/javascript' }));
  const worker = new Worker(arranque, { type: 'module', name: nombre });
  return { worker, soltarArranque: () => URL.revokeObjectURL(arranque) };
}

class Motor {
  constructor(lenguaje) {
    this.lenguaje = lenguaje;
    this.estado = { fase: 'apagado', bajado: 0, total: PESOS[lenguaje] ?? 0, version: '', pausa: true, esquema: null, error: '', paquete: '', peso: 0, vez: 0 };
    this.avisados = new Set();
    this.worker = null;
    this.listo = null;
    this.corrida = null;
    this.numero = 0;
    this.usos = 0;
    this.suelto = null;
    // Python: the packages this worker already has, and the one it is unpacking.
    this.puestos = new Set();
    this.desempacando = null;
  }

  suscribir = (f) => {
    this.avisados.add(f);
    return () => this.avisados.delete(f);
  };

  leer = () => this.estado;

  poner(cambio) {
    this.estado = { ...this.estado, ...cambio };
    this.avisados.forEach((f) => f());
  }

  /** Loads the engine if it isn't. Resolves true when it's ready, false if it couldn't. */
  encender() {
    if (this.listo) return this.listo;
    const { worker, soltarArranque } = crearWorker(URLS[this.lenguaje], `laboratorio-${this.lenguaje}`);
    this.worker = worker;
    let avisar;
    this.listo = new Promise((resolver) => {
      avisar = resolver;
    });
    this.alListo = (ok) => {
      soltarArranque();
      avisar(ok);
    };
    this.poner({ fase: 'cargando', bajado: 0, error: '' });
    worker.addEventListener('message', (e) => this.recibir(worker, e.data));
    worker.addEventListener('error', (e) => {
      e.preventDefault();
      if (this.worker === worker) this.fallar(e.message || 'El motor no arrancó.');
    });
    // SQL: the student's database, if they loaded one (tuBase.js), is built again in the new worker.
    worker.postMessage({ tipo: 'cargar', base: baseDeMotores(), total: PESOS[this.lenguaje] ?? 0, fuente: this.fuente ?? null });
    return this.listo;
  }

  fallar(mensaje) {
    const corrida = this.corrida;
    this.apagar();
    this.poner({ fase: 'falla', error: String(mensaje).slice(0, 500) });
    corrida?.resolver({ falla: true });
  }

  recibir(worker, d) {
    if (worker !== this.worker || !d || typeof d !== 'object') return;
    if (d.tipo === 'progreso') return this.poner({ bajado: Number(d.bajado) || 0 });
    if (d.tipo === 'listo') {
      this.poner({ fase: this.corrida ? 'corriendo' : 'listo', version: String(d.version ?? ''), pausa: d.pausa !== false });
      return this.alListo(true);
    }
    if (d.tipo === 'falla') return this.fallar(d.mensaje);
    if (d.tipo === 'esquema') return this.poner({ esquema: Array.isArray(d.tablas) ? d.tablas : [] });
    if (d.tipo === 'paquete') {
      const espera = this.desempacando;
      this.desempacando = null;
      return espera?.(d.ok === true);
    }
    const c = this.corrida;
    if (!c || d.id !== c.id) return undefined;
    if (d.tipo === 'pide') {
      this.pausarReloj();
      this.poner({ fase: 'esperando' });
      return c.alEvento(d);
    }
    if (d.tipo === 'tope') return this.cortar('salida');
    if (d.tipo === 'fin') {
      this.terminarCorrida();
      return c.resolver({
        ms: Number(d.ms) || 0,
        error: typeof d.error === 'string' ? d.error : null,
        linea: Number(d.linea) || 0,
        ...(typeof d.archivo === 'string' ? { archivo: d.archivo } : {}),
        ...(d.archivos && typeof d.archivos === 'object' ? { archivos: d.archivos } : {}),
      });
    }
    return c.alEvento(d);
  }

  /** Runs `codigo`. `alEvento` gets what it prints, its tables and when it asks for something. Resolves with how it
   * ended: { ms, error, linea }, { cortado: 'parado' | 'tiempo' | 'salida' } or { falla }. What else comes in the
   * options goes to the worker with the run (SQL: `base` or `tabla`, tuBase.js). */
  async correr(codigo, { nombre, lineas = [], modo = null, alEvento = () => {}, ...extra } = {}) {
    if (this.corrida) return null;
    const ok = await this.encender();
    if (!ok || this.corrida) return ok ? null : { falla: true };
    this.numero += 1;
    const id = this.numero;
    return new Promise((resolver) => {
      this.corrida = { id, alEvento, resolver, queda: LENGUAJES[this.lenguaje].topeSegundos * 1000, desde: 0, reloj: null };
      this.poner({ fase: 'corriendo' });
      const mandar = () => {
        this.arrancarReloj();
        this.worker.postMessage({ ...extra, tipo: 'correr', id, codigo, nombre, lineas, ...(modo ? { modo } : {}) });
      };
      const fuente = this.lenguaje === 'python' ? codigoPython(codigo, extra.archivos) : '';
      const faltan = fuente ? paquetesDe(fuente).filter((p) => !this.puestos.has(p)) : [];
      if (!faltan.length) {
        mandar();
        return;
      }
      // The clock starts with the program: bringing a package doesn't count.
      // What the screen names while it downloads: what the program imports and still isn't here, and how much it all weighs.
      const nombres = importadosDelSitio(fuente).filter((n) => !this.puestos.has(paqueteDe(n)));
      this.poner({ paquete: new Intl.ListFormat('es').format(nombres), peso: pesoDe(faltan) });
      this.traer(faltan, id).then((sinEste) => {
        if (this.corrida?.id !== id) return;
        const paquete = this.estado.paquete;
        this.poner({ paquete: '', peso: 0 });
        if (!sinEste) {
          mandar();
          return;
        }
        this.terminarCorrida();
        resolver({ falla: true, paquete });
      });
    });
  }

  /** Python: downloads each package from the site and hands it to the worker, which has no network, each after what it
   * needs. Resolves with the one that couldn't be brought, or null. It stops if the run it is for ends before (`cortar`). */
  async traer(paquetes, id) {
    const corte = new AbortController();
    this.corrida.corte = corte;
    for (const nombre of paquetes) {
      const { archivo, bytes } = archivoDe(nombre);
      let contenido = null;
      try {
        const respuesta = await fetch(`${baseDeMotores()}python/${archivo}`, { signal: corte.signal });
        if (respuesta.ok) contenido = await respuesta.arrayBuffer();
      } catch {
        contenido = null;
      }
      if (this.corrida?.id !== id || contenido?.byteLength !== bytes) return nombre;
      const puesto = await new Promise((resolver) => {
        this.desempacando = resolver;
        this.worker.postMessage({ tipo: 'paquete', nombre, bytes: contenido }, [contenido]);
      });
      if (!puesto || this.corrida?.id !== id) return nombre;
      this.puestos.add(nombre);
    }
    return null;
  }

  /** What the student typed for the program waiting for it; null, the end of the input (a test case without more lines). */
  entrada(texto) {
    if (!this.corrida || this.estado.fase !== 'esperando') return;
    this.worker.postMessage({ tipo: 'entrada', texto: texto === null ? null : String(texto) });
    this.poner({ fase: 'corriendo' });
    this.arrancarReloj();
  }

  arrancarReloj() {
    const c = this.corrida;
    c.desde = performance.now();
    clearTimeout(c.reloj);
    c.reloj = setTimeout(() => this.cortar('tiempo'), c.queda);
  }

  // The wait for what the student types doesn't count.
  pausarReloj() {
    const c = this.corrida;
    clearTimeout(c.reloj);
    c.queda = Math.max(1000, c.queda - (performance.now() - c.desde));
  }

  terminarCorrida() {
    clearTimeout(this.corrida?.reloj);
    this.corrida = null;
    this.poner({ fase: 'listo', paquete: '', peso: 0 });
  }

  /** «Parar», the time limit or too much output: the worker goes, and a new one loads for the next run. */
  cortar(motivo = 'parado') {
    const c = this.corrida;
    if (!c) return;
    this.apagar();
    c.resolver({ cortado: motivo });
    this.encender();
  }

  apagar() {
    clearTimeout(this.corrida?.reloj);
    this.corrida?.corte?.abort();
    this.corrida = null;
    this.worker?.terminate();
    this.worker = null;
    this.puestos.clear();
    this.desempacando?.(false);
    this.desempacando = null;
    this.alListo?.(false);
    this.listo = null;
    this.poner({ fase: 'apagado', esquema: null, paquete: '', peso: 0, vez: this.estado.vez + 1 });
  }

  /** SQL: the practice database, as it came. */
  reiniciar() {
    if (this.worker && !this.corrida) this.worker.postMessage({ tipo: 'reiniciar' });
  }

  /** The lab is open (true) or closed (false): closed for a while, the engine goes. */
  usar(si) {
    this.usos = Math.max(0, this.usos + (si ? 1 : -1));
    clearTimeout(this.suelto);
    if (!this.usos) {
      this.suelto = setTimeout(() => {
        if (!this.usos && !this.corrida && this.worker) this.apagar();
      }, SUELTO_MS);
    }
  }
}

const motores = {};
export const motorDe = (lenguaje) => (motores[lenguaje] ??= new Motor(lenguaje));
// Leaving: what the code left in an engine (variables, tables) doesn't wait for the next student.
alOlvidarLaboratorio(() => Object.values(motores).forEach((m) => m.worker && m.apagar()));

export function useMotor(lenguaje) {
  const motor = motorDe(lenguaje);
  return useSyncExternalStore(motor.suscribir, motor.leer, motor.leer);
}
