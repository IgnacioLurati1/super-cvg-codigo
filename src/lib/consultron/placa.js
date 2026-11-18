// The programs the model runs on the video card (compute pipelines). web-llm asks for most of them at its first answer,
// in the way that blocks: while the browser compiles them it draws nothing, in any tab, for some five seconds. Asked
// ahead in the way that doesn't block, an identical one asked later is already made and costs nothing.
// Which ones they are is only known when the model asks for them. They are the same on every computer (they come inside
// the model's program), so the list goes with the site, next to that program: `<program>.placa.json`, written down on a
// computer of ours (how, in vite.config.js, at `CONSULTRON`). Every load compiles them ahead as soon as the video card
// is taken, while the weights go up. One the list doesn't have is written down when the model asks for it and stays in
// the browser, next to the model.

const CACHE = 'consultron/placa';
const TOPE = 200;

const firma = (r) => `${r.entryPoint}\n${JSON.stringify(r.grupos)}\n${JSON.stringify(r.constantes ?? null)}\n${r.codigo}`;

const porFirma = (recetas) => new Map(recetas.slice(0, TOPE).filter((r) => typeof r?.codigo === 'string' && typeof r?.entryPoint === 'string').map((r) => [firma(r), r]));

/** Where the list that comes with the site is: next to the model's program. */
export const listaDe = (programa) => (/\.wasm$/.test(programa) ? programa.replace(/\.wasm$/, '.placa.json') : null);

/**
 * Watches the video card of `ambito` (the worker) and keeps its programs in `almacen` (Cache Storage). `traer` brings
 * the list of the site. Without a video card nothing is watched and everything answers empty.
 */
export function crearPlaca({ ambito = globalThis, almacen = globalThis.caches, traer = ambito.fetch?.bind(ambito) } = {}) {
  const D = ambito.GPUDevice?.prototype;
  const A = ambito.GPUAdapter?.prototype;
  // What was seen in this worker, and what the browser kept from a load before: by signature.
  const vistas = new Map();
  let guardadas = new Map();
  let clave = null;
  let adelanto = Promise.resolve();
  // The list came from the site and the browser doesn't keep it yet.
  let delSitio = false;

  if (D && A && !D.createComputePipeline.deConsultron) {
    const codigoDe = new WeakMap();
    const entradasDe = new WeakMap();
    const gruposDe = new WeakMap();
    const crearModulo = D.createShaderModule;
    const crearGrupo = D.createBindGroupLayout;
    const crearTrazado = D.createPipelineLayout;
    const crearYa = D.createComputePipeline;
    const crearLuego = D.createComputePipelineAsync;
    const pedir = A.requestDevice;

    const recetaDe = (d) => {
      const codigo = codigoDe.get(d?.compute?.module);
      if (!codigo) return null;
      const grupos = typeof d.layout === 'string' ? d.layout : gruposDe.get(d.layout)?.map((g) => entradasDe.get(g));
      // A layout that wasn't seen being made can't be made again.
      if (!grupos || (Array.isArray(grupos) && grupos.some((g) => !g))) return null;
      return { codigo, entryPoint: d.compute.entryPoint, grupos, ...(d.compute.constants ? { constantes: d.compute.constants } : {}) };
    };

    // A recipe that fails (another version of the browser, a card that lost its place) is left: the model asks for it
    // again its own way.
    const compilar = async (device, recetas) => {
      for (const r of recetas) {
        try {
          const module = crearModulo.call(device, { code: r.codigo });
          const layout = typeof r.grupos === 'string' ? r.grupos : crearTrazado.call(device, { bindGroupLayouts: r.grupos.map((entries) => crearGrupo.call(device, { entries })) });
          await crearLuego.call(device, { layout, compute: { module, entryPoint: r.entryPoint, ...(r.constantes ? { constants: r.constantes } : {}) } });
        } catch {
          // Nothing: see above.
        }
      }
    };

    D.createShaderModule = function (d) {
      const modulo = crearModulo.call(this, d);
      if (typeof d?.code === 'string') codigoDe.set(modulo, d.code);
      return modulo;
    };
    D.createBindGroupLayout = function (d) {
      const grupo = crearGrupo.call(this, d);
      entradasDe.set(grupo, d?.entries);
      return grupo;
    };
    D.createPipelineLayout = function (d) {
      const trazado = crearTrazado.call(this, d);
      gruposDe.set(trazado, d?.bindGroupLayouts);
      return trazado;
    };
    // The one that blocks: it's made as asked, and written down for the next load.
    D.createComputePipeline = function (d) {
      const receta = recetaDe(d);
      if (receta && vistas.size < TOPE) vistas.set(firma(receta), receta);
      return crearYa.call(this, d);
    };
    D.createComputePipeline.deConsultron = true;
    // The video card was just taken: what the browser kept is compiled meanwhile, one at a time.
    A.requestDevice = async function (...a) {
      const device = await pedir.apply(this, a);
      const recetas = [...guardadas.values()];
      adelanto = recetas.length ? compilar(device, recetas) : Promise.resolve();
      return device;
    };
  }

  const pedidoDe = (programa) => `${programa}?placa=1`;

  /** Before loading the model of `programa` (the address of its WebAssembly): what the browser kept for it or, on a
   * computer that never loaded it, the list of the site. */
  async function preparar(programa) {
    clave = programa;
    guardadas = new Map();
    adelanto = Promise.resolve();
    delSitio = false;
    if (!D || !almacen) return;
    try {
      const cache = await almacen.open(CACHE);
      const dato = await cache.match(pedidoDe(programa));
      const recetas = dato ? (await dato.json())?.recetas : null;
      if (Array.isArray(recetas)) guardadas = porFirma(recetas);
    } catch {
      guardadas = new Map();
    }
    if (guardadas.size) return;
    // Without the list the model loads the same: it asks for each program its own way, and they are written down.
    try {
      const lista = listaDe(programa);
      const respuesta = lista && traer ? await traer(lista) : null;
      const recetas = respuesta?.ok ? (await respuesta.json())?.recetas : null;
      if (Array.isArray(recetas)) guardadas = porFirma(recetas);
      delSitio = guardadas.size > 0;
    } catch {
      guardadas = new Map();
    }
  }

  /** Resolves once what was kept is compiled. Before the model's first answer, which would ask for it blocking. */
  const compiladas = () => adelanto;

  /** Keeps what the model asked for and wasn't kept yet, and the list of the site the first time. Nothing new, nothing
   * written. */
  async function guardar() {
    if (!D || !almacen || !clave) return false;
    const nuevas = [...vistas.keys()].filter((k) => !guardadas.has(k));
    if (!nuevas.length && !delSitio) return false;
    const todas = new Map([...guardadas, ...vistas]);
    try {
      const cache = await almacen.open(CACHE);
      // Those of another version of the model are of no use anymore.
      for (const pedido of await cache.keys()) {
        if (pedido.url !== new URL(pedidoDe(clave), ambito.location?.href).href) await cache.delete(pedido);
      }
      await cache.put(pedidoDe(clave), new Response(JSON.stringify({ recetas: [...todas.values()].slice(0, TOPE) }), { headers: { 'content-type': 'application/json' } }));
      guardadas = todas;
      delSitio = false;
      return true;
    } catch {
      return false;
    }
  }

  /** With the model taken out of the browser, these go too. */
  async function olvidar() {
    guardadas = new Map();
    delSitio = false;
    vistas.clear();
    try {
      await almacen?.delete(CACHE);
    } catch {
      // Nothing to take out.
    }
  }

  return { preparar, compiladas, guardar, olvidar, cuantas: () => ({ vistas: vistas.size, guardadas: guardadas.size }) };
}
