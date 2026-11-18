import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crearPlaca, listaDe } from './placa.js';

const PROGRAMA = 'https://sitio.test/motores/consultron/modelo.wasm';

// A video card that keeps what it was asked: ['ya' | 'luego', descriptor] for each program.
function placaDeMentira({ fallaEn = null } = {}) {
  const pedidos = [];
  class GPUDevice {
    createShaderModule(d) { return { modulo: d.code }; }
    createBindGroupLayout(d) { return { grupo: d.entries }; }
    createPipelineLayout(d) { return { trazado: d.bindGroupLayouts }; }
    createComputePipeline(d) { pedidos.push(['ya', d]); return {}; }
    createComputePipelineAsync(d) {
      pedidos.push(['luego', d]);
      return d.compute.entryPoint === fallaEn ? Promise.reject(new Error('no compila')) : Promise.resolve({});
    }
  }
  class GPUAdapter {
    async requestDevice() { return new GPUDevice(); }
  }
  return { ambito: { GPUDevice, GPUAdapter, location: { href: 'https://sitio.test/' } }, pedidos };
}

// Cache Storage, in memory.
function almacenDeMentira() {
  const cajas = new Map();
  return {
    cajas,
    async open(nombre) {
      if (!cajas.has(nombre)) cajas.set(nombre, new Map());
      const caja = cajas.get(nombre);
      return {
        match: async (pedido) => (caja.has(pedido) ? new Response(caja.get(pedido)) : undefined),
        put: async (pedido, respuesta) => { caja.set(pedido, await respuesta.text()); },
        keys: async () => [...caja.keys()].map((url) => ({ url })),
        delete: async (pedido) => caja.delete(pedido.url ?? pedido),
      };
    },
    async delete(nombre) { return cajas.delete(nombre); },
  };
}

// The model asks for a program the way web-llm does: module, layout and the pipeline, blocking.
function pedirComoElModelo(device, nombre, codigo = `fn ${nombre}() {}`) {
  const module = device.createShaderModule({ code: codigo });
  const grupo = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: 4, buffer: { type: 'storage' } }] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [grupo] });
  return device.createComputePipeline({ layout, compute: { module, entryPoint: nombre } });
}

describe('los programas de la placa de video', () => {
  it('anota una vez cada uno que el modelo pide bloqueando, y lo guarda', async () => {
    const { ambito } = placaDeMentira();
    const almacen = almacenDeMentira();
    const placa = crearPlaca({ ambito, almacen });
    await placa.preparar(PROGRAMA);
    const device = await new ambito.GPUAdapter().requestDevice();
    pedirComoElModelo(device, 'suma');
    pedirComoElModelo(device, 'suma');
    pedirComoElModelo(device, 'producto');
    expect(placa.cuantas()).toEqual({ vistas: 2, guardadas: 0 });
    expect(await placa.guardar()).toBe(true);
    const guardado = JSON.parse(almacen.cajas.get('consultron/placa').get(`${PROGRAMA}?placa=1`));
    expect(guardado.recetas.map((r) => r.entryPoint)).toEqual(['suma', 'producto']);
    expect(guardado.recetas[0]).toEqual({ codigo: 'fn suma() {}', entryPoint: 'suma', grupos: [[{ binding: 0, visibility: 4, buffer: { type: 'storage' } }]] });
    // Nothing new, nothing written.
    expect(await placa.guardar()).toBe(false);
  });

  it('en la carga siguiente los compila antes, sin bloquear y de a uno, apenas toma la placa', async () => {
    const almacen = almacenDeMentira();
    const primera = placaDeMentira();
    const antes = crearPlaca({ ambito: primera.ambito, almacen });
    await antes.preparar(PROGRAMA);
    const d1 = await new primera.ambito.GPUAdapter().requestDevice();
    pedirComoElModelo(d1, 'suma');
    pedirComoElModelo(d1, 'producto');
    await antes.guardar();

    const segunda = placaDeMentira();
    const placa = crearPlaca({ ambito: segunda.ambito, almacen });
    await placa.preparar(PROGRAMA);
    expect(placa.cuantas().guardadas).toBe(2);
    const d2 = await new segunda.ambito.GPUAdapter().requestDevice();
    await placa.compiladas();
    expect(segunda.pedidos.map(([como, d]) => [como, d.compute.entryPoint])).toEqual([['luego', 'suma'], ['luego', 'producto']]);
    const [, hecho] = segunda.pedidos[0];
    expect(hecho.compute.module).toEqual({ modulo: 'fn suma() {}' });
    expect(hecho.layout).toEqual({ trazado: [{ grupo: [{ binding: 0, visibility: 4, buffer: { type: 'storage' } }] }] });
    // The model asks for them after: they were kept already, so nothing is written again.
    pedirComoElModelo(d2, 'suma');
    expect(await placa.guardar()).toBe(false);
    // One it hadn't asked for before is added to those kept.
    pedirComoElModelo(d2, 'resta');
    expect(await placa.guardar()).toBe(true);
    expect(JSON.parse(almacen.cajas.get('consultron/placa').get(`${PROGRAMA}?placa=1`)).recetas.map((r) => r.entryPoint)).toEqual(['suma', 'producto', 'resta']);
  });

  it('uno que no compila no frena a los demás ni a la carga', async () => {
    const almacen = almacenDeMentira();
    const primera = placaDeMentira();
    const antes = crearPlaca({ ambito: primera.ambito, almacen });
    await antes.preparar(PROGRAMA);
    const d1 = await new primera.ambito.GPUAdapter().requestDevice();
    pedirComoElModelo(d1, 'rota');
    pedirComoElModelo(d1, 'sana');
    await antes.guardar();

    const segunda = placaDeMentira({ fallaEn: 'rota' });
    const placa = crearPlaca({ ambito: segunda.ambito, almacen });
    await placa.preparar(PROGRAMA);
    await new segunda.ambito.GPUAdapter().requestDevice();
    await expect(placa.compiladas()).resolves.toBeUndefined();
    expect(segunda.pedidos.map(([, d]) => d.compute.entryPoint)).toEqual(['rota', 'sana']);
  });

  it('los de otra versión del modelo no se usan y se van al guardar los nuevos', async () => {
    const almacen = almacenDeMentira();
    const vieja = placaDeMentira();
    const antes = crearPlaca({ ambito: vieja.ambito, almacen });
    await antes.preparar('https://sitio.test/motores/consultron/viejo.wasm');
    pedirComoElModelo(await new vieja.ambito.GPUAdapter().requestDevice(), 'suma');
    await antes.guardar();

    const nueva = placaDeMentira();
    const placa = crearPlaca({ ambito: nueva.ambito, almacen });
    await placa.preparar(PROGRAMA);
    expect(placa.cuantas().guardadas).toBe(0);
    const device = await new nueva.ambito.GPUAdapter().requestDevice();
    await placa.compiladas();
    expect(nueva.pedidos).toEqual([]);
    pedirComoElModelo(device, 'producto');
    await placa.guardar();
    expect([...almacen.cajas.get('consultron/placa').keys()]).toEqual([`${PROGRAMA}?placa=1`]);
  });

  it('lo guardado roto se ignora, y con el modelo borrado se van', async () => {
    const almacen = almacenDeMentira();
    (await almacen.open('consultron/placa')).put(`${PROGRAMA}?placa=1`, new Response('{ no es json'));
    const { ambito, pedidos } = placaDeMentira();
    const placa = crearPlaca({ ambito, almacen });
    await placa.preparar(PROGRAMA);
    expect(placa.cuantas().guardadas).toBe(0);
    await new ambito.GPUAdapter().requestDevice();
    await placa.compiladas();
    expect(pedidos).toEqual([]);
    await placa.olvidar();
    expect(almacen.cajas.has('consultron/placa')).toBe(false);
  });

  const LISTA = 'https://sitio.test/motores/consultron/modelo.placa.json';
  const receta = (nombre) => ({ codigo: `fn ${nombre}() {}`, entryPoint: nombre, grupos: [[{ binding: 0, visibility: 4, buffer: { type: 'storage' } }]] });

  it('en una compu que nunca lo cargó compila antes los de la lista del sitio, y el navegador se la queda', async () => {
    const almacen = almacenDeMentira();
    const { ambito, pedidos } = placaDeMentira();
    const pedidas = [];
    const traer = async (url) => { pedidas.push(url); return new Response(JSON.stringify({ recetas: [receta('suma'), receta('producto')] })); };
    const placa = crearPlaca({ ambito, almacen, traer });
    await placa.preparar(PROGRAMA);
    expect(pedidas).toEqual([LISTA]);
    expect(listaDe(PROGRAMA)).toBe(LISTA);
    expect(placa.cuantas().guardadas).toBe(2);
    const device = await new ambito.GPUAdapter().requestDevice();
    await placa.compiladas();
    expect(pedidos.map(([como, d]) => [como, d.compute.entryPoint])).toEqual([['luego', 'suma'], ['luego', 'producto']]);
    // The model asks for one of the list: nothing new, and the list is kept the same, once.
    pedirComoElModelo(device, 'suma');
    expect(await placa.guardar()).toBe(true);
    expect(JSON.parse(almacen.cajas.get('consultron/placa').get(`${PROGRAMA}?placa=1`)).recetas.map((r) => r.entryPoint)).toEqual(['suma', 'producto']);
    expect(await placa.guardar()).toBe(false);

    // The load after: what the browser keeps is enough, and the site isn't asked.
    const otra = placaDeMentira();
    const despues = crearPlaca({ ambito: otra.ambito, almacen, traer });
    await despues.preparar(PROGRAMA);
    expect(despues.cuantas().guardadas).toBe(2);
    expect(pedidas).toEqual([LISTA]);
  });

  it('sin la lista del sitio, o con una rota, carga igual y anota lo que el modelo pide', async () => {
    const formas = [
      async () => new Response('no está', { status: 404 }),
      async () => new Response('{ no es json'),
      async () => new Response(JSON.stringify({ recetas: 'ninguna' })),
      async () => { throw new Error('sin red'); },
    ];
    for (const traer of formas) {
      const almacen = almacenDeMentira();
      const { ambito, pedidos } = placaDeMentira();
      const placa = crearPlaca({ ambito, almacen, traer });
      await placa.preparar(PROGRAMA);
      expect(placa.cuantas().guardadas).toBe(0);
      const device = await new ambito.GPUAdapter().requestDevice();
      await placa.compiladas();
      expect(pedidos).toEqual([]);
      expect(await placa.guardar()).toBe(false);
      pedirComoElModelo(device, 'suma');
      expect(await placa.guardar()).toBe(true);
    }
    // A program that isn't a WebAssembly has no list to ask for.
    expect(listaDe('https://sitio.test/motores/consultron/modelo')).toBe(null);
  });

  it('cada programa de modelo del sitio trae su lista, entera y sin repetidos', () => {
    const carpeta = resolve(process.cwd(), 'vendor/consultron');
    const programas = readdirSync(carpeta).filter((f) => f.endsWith('.wasm'));
    expect(programas.length).toBeGreaterThan(0);
    for (const programa of programas) {
      const { recetas } = JSON.parse(readFileSync(resolve(carpeta, programa.replace(/\.wasm$/, '.placa.json')), 'utf8'));
      expect(recetas.length).toBeGreaterThan(40);
      expect(recetas.length).toBeLessThanOrEqual(200);
      for (const r of recetas) {
        expect(typeof r.codigo).toBe('string');
        expect(r.codigo).toContain(`fn ${r.entryPoint}(`);
        expect(Array.isArray(r.grupos)).toBe(true);
      }
      expect(new Set(recetas.map((r) => JSON.stringify(r))).size).toBe(recetas.length);
    }
  });

  it('sin placa de video no hace nada', async () => {
    const almacen = almacenDeMentira();
    const placa = crearPlaca({ ambito: {}, almacen });
    await placa.preparar(PROGRAMA);
    await expect(placa.compiladas()).resolves.toBeUndefined();
    expect(await placa.guardar()).toBe(false);
    expect(almacen.cajas.size).toBe(0);
  });
});
