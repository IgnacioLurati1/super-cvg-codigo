// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./python.worker.js?worker&url', () => ({ default: '/assets/python.worker.js' }));
vi.mock('./sql.worker.js?worker&url', () => ({ default: '/assets/sql.worker.js' }));
vi.mock('./c.worker.js?worker&url', () => ({ default: '/assets/c.worker.js' }));

// A worker of mentira: it loads at once, and each run does what the test says, through `responder`.
const workers = [];
class WorkerFalso {
  constructor(url, opciones) {
    this.url = url;
    this.opciones = opciones;
    this.oyentes = { message: [], error: [] };
    this.recibidos = [];
    this.terminado = false;
    workers.push(this);
  }

  addEventListener(tipo, f) {
    this.oyentes[tipo].push(f);
  }

  postMessage(d) {
    this.recibidos.push(d);
    if (d.tipo === 'cargar') queueMicrotask(() => this.mandar({ tipo: 'listo', version: '3.14', pausa: true }));
  }

  mandar(d) {
    if (!this.terminado) this.oyentes.message.forEach((f) => f({ data: d }));
  }

  terminate() {
    this.terminado = true;
  }
}

let motorDe;
beforeEach(async () => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.stubGlobal('Worker', WorkerFalso);
  vi.stubGlobal('Blob', class {
    constructor(partes, opciones) {
      this.partes = partes;
      this.type = opciones?.type;
    }
  });
  URL.createObjectURL = vi.fn(() => 'blob:arranque');
  URL.revokeObjectURL = vi.fn();
  vi.resetModules();
  ({ motorDe } = await import('./motor'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ultimoWorker = () => workers.at(-1);
const correrEn = (motor, codigo = 'x', alEvento = () => {}) => motor.correr(codigo, { nombre: 'a.py', alEvento });

describe('el motor de cada lenguaje', () => {
  it('arranca desde un blob que importa el worker del sitio, como módulo, y le dice dónde están los motores', async () => {
    const m = motorDe('python');
    expect(await m.encender()).toBe(true);
    const w = ultimoWorker();
    expect(w.url).toBe('blob:arranque');
    expect(w.opciones.type).toBe('module');
    const [blob] = URL.createObjectURL.mock.calls[0];
    expect(blob.type).toBe('text/javascript');
    expect(blob.partes.join('')).toMatch(/^import "http:\/\/[^"]+\/assets\/python\.worker\.js";\n$/);
    expect(w.recibidos[0]).toMatchObject({ tipo: 'cargar', base: expect.stringMatching(/\/motores\/$/) });
    expect(m.leer().fase).toBe('listo');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('una corrida termina con lo que dice el worker', async () => {
    const m = motorDe('python');
    const vuelta = correrEn(m);
    await vi.waitFor(() => expect(ultimoWorker().recibidos.some((d) => d.tipo === 'correr')).toBe(true));
    const { id } = ultimoWorker().recibidos.find((d) => d.tipo === 'correr');
    ultimoWorker().mandar({ tipo: 'fin', id, ms: 12, error: 'NameError', linea: 3 });
    expect(await vuelta).toEqual({ ms: 12, error: 'NameError', linea: 3 });
    expect(m.leer().fase).toBe('listo');
  });

  it('pasado el tope de tiempo la para, y carga otro worker para la próxima', async () => {
    const m = motorDe('sql');
    const vuelta = correrEn(m);
    await vi.waitFor(() => expect(m.leer().fase).toBe('corriendo'));
    const primero = ultimoWorker();
    await vi.advanceTimersByTimeAsync(14_900);
    expect(m.leer().fase).toBe('corriendo');
    await vi.advanceTimersByTimeAsync(200);
    expect(await vuelta).toEqual({ cortado: 'tiempo' });
    expect(primero.terminado).toBe(true);
    expect(ultimoWorker()).not.toBe(primero);
    await vi.waitFor(() => expect(m.leer().fase).toBe('listo'));
  });

  it('mientras espera lo que escribe el alumno, el reloj no corre', async () => {
    const m = motorDe('python');
    const eventos = [];
    const vuelta = correrEn(m, 'input()', (d) => eventos.push(d));
    await vi.waitFor(() => expect(m.leer().fase).toBe('corriendo'));
    const w = ultimoWorker();
    const { id } = w.recibidos.find((d) => d.tipo === 'correr');
    await vi.advanceTimersByTimeAsync(20_000);
    w.mandar({ tipo: 'pide', id, pregunta: 'Nombre: ' });
    expect(m.leer().fase).toBe('esperando');
    expect(eventos.at(-1)).toMatchObject({ tipo: 'pide', pregunta: 'Nombre: ' });
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(w.terminado).toBe(false);
    m.entrada('Ana');
    expect(w.recibidos.at(-1)).toEqual({ tipo: 'entrada', texto: 'Ana' });
    expect(m.leer().fase).toBe('corriendo');
    await vi.advanceTimersByTimeAsync(10_100);
    expect(await vuelta).toEqual({ cortado: 'tiempo' });
  });

  it('«Parar» y el tope de salida cortan la corrida', async () => {
    const m = motorDe('python');
    let vuelta = correrEn(m);
    await vi.waitFor(() => expect(m.leer().fase).toBe('corriendo'));
    m.cortar('parado');
    expect(await vuelta).toEqual({ cortado: 'parado' });
    await vi.waitFor(() => expect(m.leer().fase).toBe('listo'));
    vuelta = correrEn(m);
    await vi.waitFor(() => expect(m.leer().fase).toBe('corriendo'));
    const w = ultimoWorker();
    const { id } = w.recibidos.findLast((d) => d.tipo === 'correr');
    w.mandar({ tipo: 'tope', id });
    expect(await vuelta).toEqual({ cortado: 'salida' });
    expect(w.terminado).toBe(true);
  });

  it('lo que llega de otra corrida o de un worker viejo no se mezcla', async () => {
    const m = motorDe('python');
    const vuelta = correrEn(m);
    await vi.waitFor(() => expect(m.leer().fase).toBe('corriendo'));
    const w = ultimoWorker();
    const { id } = w.recibidos.find((d) => d.tipo === 'correr');
    w.mandar({ tipo: 'fin', id: id + 1, ms: 1 });
    expect(m.leer().fase).toBe('corriendo');
    w.mandar({ tipo: 'fin', id, ms: 2 });
    expect(await vuelta).toEqual({ ms: 2, error: null, linea: 0 });
  });

  it('si el motor no carga, lo dice, y se puede probar de nuevo', async () => {
    const m = motorDe('sql');
    const encendido = m.encender();
    ultimoWorker().postMessage = () => {};
    ultimoWorker().mandar({ tipo: 'falla', mensaje: 'sin red' });
    expect(await encendido).toBe(false);
    expect(m.leer()).toMatchObject({ fase: 'falla', error: 'sin red' });
    expect(await m.encender()).toBe(true);
  });

  it('con el laboratorio cerrado un rato, el motor se apaga', async () => {
    const m = motorDe('python');
    await m.encender();
    const w = ultimoWorker();
    m.usar(true);
    m.usar(false);
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(w.terminado).toBe(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(w.terminado).toBe(true);
    expect(m.leer().fase).toBe('apagado');
  });
});

describe('un paquete que el programa importa', () => {
  const NUMPY = 'import numpy as np\nprint(np.eye(2))';
  const { archivo, bytes } = __PAQUETES_LABORATORIO__.paquetes.numpy;
  const respuesta = (largo = bytes, ok = true) => ({ ok, arrayBuffer: async () => new ArrayBuffer(largo) });
  const paquetes = (w) => w.recibidos.filter((d) => d.tipo === 'paquete');
  const corridas = (w) => w.recibidos.filter((d) => d.tipo === 'correr');

  it('lo baja del sitio, se lo pasa al worker y recién después corre', async () => {
    const pedir = vi.fn(async () => respuesta());
    vi.stubGlobal('fetch', pedir);
    const m = motorDe('python');
    const vuelta = correrEn(m, NUMPY);
    await vi.waitFor(() => expect(paquetes(ultimoWorker())).toHaveLength(1));
    const w = ultimoWorker();
    expect(pedir.mock.calls[0][0]).toMatch(new RegExp(`/motores/python/${archivo.replaceAll('.', '\\.')}$`));
    expect(paquetes(w)[0]).toMatchObject({ nombre: 'numpy' });
    expect(paquetes(w)[0].bytes.byteLength).toBe(bytes);
    expect(m.leer()).toMatchObject({ fase: 'corriendo', paquete: 'numpy' });
    expect(corridas(w)).toHaveLength(0);
    // The clock waits for the program.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(w.terminado).toBe(false);
    w.mandar({ tipo: 'paquete', nombre: 'numpy', ok: true });
    await vi.waitFor(() => expect(corridas(w)).toHaveLength(1));
    expect(m.leer()).toMatchObject({ fase: 'corriendo', paquete: '' });
    w.mandar({ tipo: 'fin', id: corridas(w)[0].id, ms: 5 });
    expect(await vuelta).toEqual({ ms: 5, error: null, linea: 0 });

    // The same worker already has it.
    const otra = correrEn(m, NUMPY);
    await vi.waitFor(() => expect(corridas(w)).toHaveLength(2));
    expect(pedir).toHaveBeenCalledTimes(1);
    w.mandar({ tipo: 'fin', id: corridas(w)[1].id, ms: 1 });
    await otra;
  });

  it('con lo que necesita, cada uno antes de lo que lo usa, y la pantalla dice cuánto pesa todo', async () => {
    const archivos = __PAQUETES_LABORATORIO__.paquetes;
    const pedir = vi.fn(async (url) => respuesta(Object.values(archivos).find((p) => url.endsWith(`/${p.archivo}`)).bytes));
    vi.stubGlobal('fetch', pedir);
    const m = motorDe('python');
    const vuelta = correrEn(m, 'import pandas as pd\nimport matplotlib.pyplot as plt');
    await vi.waitFor(() => expect(paquetes(ultimoWorker())).toHaveLength(1));
    const w = ultimoWorker();
    const todos = ['numpy', 'six', 'python-dateutil', 'pytz', 'pandas', 'contourpy', 'cycler', 'fonttools', 'kiwisolver', 'packaging', 'pillow', 'pyparsing', 'matplotlib'];
    expect(m.leer()).toMatchObject({ paquete: 'pandas y matplotlib', peso: todos.reduce((n, p) => n + archivos[p].bytes, 0) });
    for (let i = 0; i < todos.length; i += 1) {
      await vi.waitFor(() => expect(paquetes(w)).toHaveLength(i + 1));
      expect(paquetes(w)[i].nombre).toBe(todos[i]);
      w.mandar({ tipo: 'paquete', nombre: todos[i], ok: true });
    }
    await vi.waitFor(() => expect(corridas(w)).toHaveLength(1));
    expect(m.leer()).toMatchObject({ paquete: '', peso: 0 });
    w.mandar({ tipo: 'fin', id: corridas(w)[0].id, ms: 5 });
    await vuelta;
    // numpy is already there: only what is missing, by its name.
    const otra = correrEn(m, 'import numpy\nimport matplotlib');
    await vi.waitFor(() => expect(corridas(w)).toHaveLength(2));
    expect(pedir).toHaveBeenCalledTimes(todos.length);
    w.mandar({ tipo: 'fin', id: corridas(w)[1].id, ms: 1 });
    await otra;
  });

  it('en un proyecto, lo que importa cualquiera de sus .py; el proyecto y lo que cambió van y vuelven', async () => {
    const pedir = vi.fn(async () => respuesta());
    vi.stubGlobal('fetch', pedir);
    const m = motorDe('python');
    const archivos = [{ nombre: 'main.py', contenido: 'import calculos' }, { nombre: 'calculos.py', contenido: new TextEncoder().encode('import numpy as np') }, { nombre: 'datos.py.txt', contenido: 'import pandas' }];
    const vuelta = m.correr('', { nombre: 'main.py', archivos, principal: 'main.py' });
    await vi.waitFor(() => expect(paquetes(ultimoWorker())).toHaveLength(1));
    const w = ultimoWorker();
    expect(paquetes(w)[0].nombre).toBe('numpy');
    w.mandar({ tipo: 'paquete', nombre: 'numpy', ok: true });
    await vi.waitFor(() => expect(corridas(w)).toHaveLength(1));
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(corridas(w)[0]).toMatchObject({ archivos, principal: 'main.py' });
    const cambiados = [{ nombre: 'salida.txt', contenido: new Uint8Array([104]) }];
    w.mandar({ tipo: 'fin', id: corridas(w)[0].id, ms: 2, error: 'ZeroDivisionError', linea: 3, archivo: 'calculos.py', archivos: { cambiados, borrados: [] } });
    expect(await vuelta).toEqual({ ms: 2, error: 'ZeroDivisionError', linea: 3, archivo: 'calculos.py', archivos: { cambiados, borrados: [] } });
  });

  it('sin importarlo no baja nada, y SQL tampoco', async () => {
    const pedir = vi.fn(async () => respuesta());
    vi.stubGlobal('fetch', pedir);
    const m = motorDe('python');
    const vuelta = correrEn(m, 'print("numpy")');
    await vi.waitFor(() => expect(corridas(ultimoWorker())).toHaveLength(1));
    ultimoWorker().mandar({ tipo: 'fin', id: corridas(ultimoWorker())[0].id, ms: 1 });
    await vuelta;
    const sql = motorDe('sql');
    const consulta = correrEn(sql, 'import numpy');
    await vi.waitFor(() => expect(corridas(ultimoWorker())).toHaveLength(1));
    ultimoWorker().mandar({ tipo: 'fin', id: corridas(ultimoWorker())[0].id, ms: 1 });
    await consulta;
    expect(pedir).not.toHaveBeenCalled();
  });

  it('si no baja entero o el worker no lo toma, lo dice y el motor queda listo', async () => {
    const m = motorDe('python');
    for (const pedir of [async () => respuesta(bytes, false), async () => respuesta(120), async () => Promise.reject(new TypeError('sin red'))]) {
      vi.stubGlobal('fetch', vi.fn(pedir));
      expect(await correrEn(m, NUMPY)).toEqual({ falla: true, paquete: 'numpy' });
      expect(m.leer()).toMatchObject({ fase: 'listo', paquete: '' });
    }
    const w = ultimoWorker();
    expect(w.terminado).toBe(false);
    expect(paquetes(w)).toHaveLength(0);
    vi.stubGlobal('fetch', vi.fn(async () => respuesta()));
    const vuelta = correrEn(m, NUMPY);
    await vi.waitFor(() => expect(paquetes(w)).toHaveLength(1));
    w.mandar({ tipo: 'paquete', nombre: 'numpy', ok: false });
    expect(await vuelta).toEqual({ falla: true, paquete: 'numpy' });
    expect(corridas(w)).toHaveLength(0);
  });

  it('«Parar» mientras baja corta el pedido, y el worker nuevo lo pide otra vez', async () => {
    let cortes = 0;
    const pedir = vi.fn((url, { signal }) => new Promise((resolver, rechazar) => {
      signal.addEventListener('abort', () => {
        cortes += 1;
        rechazar(new DOMException('cortado', 'AbortError'));
      });
      if (pedir.mock.calls.length > 1) resolver(respuesta());
    }));
    vi.stubGlobal('fetch', pedir);
    const m = motorDe('python');
    const vuelta = correrEn(m, NUMPY);
    await vi.waitFor(() => expect(m.leer().paquete).toBe('numpy'));
    const primero = ultimoWorker();
    m.cortar('parado');
    expect(await vuelta).toEqual({ cortado: 'parado' });
    expect(cortes).toBe(1);
    expect(primero.terminado).toBe(true);
    await vi.waitFor(() => expect(m.leer()).toMatchObject({ fase: 'listo', paquete: '' }));
    const otra = correrEn(m, NUMPY);
    await vi.waitFor(() => expect(paquetes(ultimoWorker())).toHaveLength(1));
    expect(ultimoWorker()).not.toBe(primero);
    expect(pedir).toHaveBeenCalledTimes(2);
    ultimoWorker().mandar({ tipo: 'paquete', nombre: 'numpy', ok: true });
    await vi.waitFor(() => expect(corridas(ultimoWorker())).toHaveLength(1));
    ultimoWorker().mandar({ tipo: 'fin', id: corridas(ultimoWorker())[0].id, ms: 1 });
    await otra;
  });
});
