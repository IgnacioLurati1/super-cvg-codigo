// The Python of the lab: Pyodide, in this worker, from this site's /motores/python/. Nothing of a package is downloaded
// here (the lock file the site serves lists none), and once loaded the worker loses the network (red.js). A package of
// the site's list (modulos.js) comes from the page, already downloaded, and goes to site-packages. A matplotlib figure
// goes to the page as PNG (graficos.js). The messages are the ones of every engine (motor.js); a run brings the code
// alone (`codigo`, `nombre`) or a project (`archivos` [{ nombre, contenido }], `principal`), and its `fin` says in which
// file it broke (`archivo`) and what the program did to its folder (`archivos`: { cambiados, borrados }, pyProyecto.js).
import { loadPyodide } from 'pyodide';
import { CHAPIN_PY } from './chapinPython';
import { CORREDOR } from './corredor';
import { BACKEND_MATPLOTLIB, MAX_IMAGENES, pngValido } from './graficos';
import { TOPE_SALIDA } from './lenguajes';
import { contarBajadas } from './progreso';
import { cambiosDe, ponerProyecto, proyectoPython } from './pyProyecto';
import { RASTREO } from './rastreo';
import { REVISOR_PY } from './revisarPython';
import { cerrarRed } from './red';

const enviar = self.postMessage.bind(self);
const escuchar = self.addEventListener.bind(self);

let py = null;
let correr = null;
let pasoAPaso = null;
let medir = null;
let medirPrograma = null;
// What checks the code while the student types (revisarPython.js), and whether pyflakes is here.
let revisarPy = null;
let conPyflakes = false;
// What reads the code as a Chapin, without running it (chapinPython.js).
let chapin = null;
let corrida = 0;
let escrito = 0;
let imagenes = 0;
let sitio = '';
let cortado = false;
let esperando = null;
// How long the run waited for what the student types: it doesn't count in how long it took.
let espera = 0;
let desdeEspera = 0;

function salida(flujo) {
  const decodificar = new TextDecoder();
  return {
    isatty: false,
    write(bytes) {
      const texto = decodificar.decode(bytes, { stream: true });
      if (cortado) return bytes.length;
      escrito += texto.length;
      if (escrito > TOPE_SALIDA) {
        cortado = true;
        enviar({ tipo: 'tope', id: corrida });
      } else if (texto) enviar({ tipo: 'salida', id: corrida, flujo, texto });
      return bytes.length;
    },
  };
}

async function cargar(base, total) {
  contarBajadas(self, (bajado) => enviar({ tipo: 'progreso', bajado, total }));
  py = await loadPyodide({
    indexURL: `${base}python/`,
    // matplotlib draws with the lab's backend (graficos.js).
    env: { HOME: '/home/alumno', PYTHONHASHSEED: '0', PYTHON_COLORS: '0', NO_COLOR: '1', MPLBACKEND: 'module://_laboratorio_mpl' },
    // What `import js` gives the student's code: nothing of the worker.
    jsglobals: Object.create(null),
    stdout: () => {},
    stderr: () => {},
  });
  py.setStdout(salida('out'));
  py.setStderr(salida('err'));
  py.registerJsModule('_laboratorio', {
    pedir: (pregunta) => new Promise((resolver) => {
      esperando = resolver;
      desdeEspera = performance.now();
      enviar({ tipo: 'pide', id: corrida, pregunta: String(pregunta ?? '').slice(-200) });
    }),
    sin_pausa: () => enviar({ tipo: 'sin-pausa', id: corrida }),
    // A matplotlib figure, as PNG (graficos.js).
    imagen: (datos) => {
      imagenes += 1;
      const png = datos instanceof Uint8Array ? datos.slice() : new Uint8Array(0);
      if (imagenes > MAX_IMAGENES) {
        if (imagenes === MAX_IMAGENES + 1) enviar({ tipo: 'salida', id: corrida, flujo: 'err', texto: `Mostró ${MAX_IMAGENES} gráficos y no muestra más.\n` });
      } else if (pngValido(png)) enviar({ tipo: 'imagen', id: corrida, png }, [png.buffer]);
      else enviar({ tipo: 'salida', id: corrida, flujo: 'err', texto: 'El gráfico pesa más de 4 MB y no se muestra.\n' });
    },
    // «Paso a paso» and «Medir tiempos» (rastreo.js).
    pasos: (texto) => enviar({ tipo: 'pasos', id: corrida, pasos: String(texto) }),
    medida_empieza: (n) => enviar({ tipo: 'medida-empieza', id: corrida, n: Number(n) }),
    medida: (n, s, veces) => enviar({ tipo: 'medida', id: corrida, n: Number(n), s: Number(s), veces: Number(veces) }),
    medida_vuelta: (vuelta, s) => enviar({ tipo: 'medida-vuelta', id: corrida, vuelta: Number(vuelta), s: Number(s) }),
    medida_funciones: (texto) => enviar({ tipo: 'medida-funciones', id: corrida, texto: String(texto).slice(0, 20000) }),
    medida_tope: (n) => enviar({ tipo: 'medida-tope', id: corrida, n: Number(n) }),
    medida_falla: (donde, texto, n) => enviar({ tipo: 'medida-falla', id: corrida, donde: String(donde), texto: String(texto ?? '').slice(0, 300), n: Number(n) || 0 }),
  });
  // The packages go where Python keeps them, not in the student's folder; next to them, matplotlib's backend.
  sitio = py.runPython('import site; site.getsitepackages()[0]');
  py.FS.writeFile(`${sitio}/_laboratorio_mpl.py`, BACKEND_MATPLOTLIB);
  py.runPython(CORREDOR, { filename: '<laboratorio>' });
  correr = py.globals.get('_correr');
  py.runPython(RASTREO, { filename: '<laboratorio>' });
  pasoAPaso = py.globals.get('_paso_a_paso');
  medir = py.globals.get('_medir');
  medirPrograma = py.globals.get('_medir_programa');
  py.runPython(REVISOR_PY, { filename: '<laboratorio>' });
  revisarPy = py.globals.get('_revisar');
  py.runPython(CHAPIN_PY, { filename: '<laboratorio>' });
  chapin = py.globals.get('_chapin');
  cerrarRed(self);
  return { version: py.runPython('import sys; sys.version.split()[0]'), pausa: typeof WebAssembly.Suspending === 'function' };
}

// How it runs: as it is, step by step or measuring a function (`modo`, from the screen).
function comoCorre(codigo, nombre, lineas, modo) {
  if (modo?.tipo === 'pasos') return [pasoAPaso, [codigo, nombre, lineas, Number(modo.tope) || 1000]];
  if (modo?.tipo === 'medir' && modo.programa) return [medirPrograma, [codigo, nombre, lineas, Math.min(10, Math.max(1, Math.round(Number(modo.vueltas)) || 3)), Number(modo.presupuesto) || 20]];
  if (modo?.tipo === 'medir') {
    const tamanos = Array.isArray(modo.tamanos) ? modo.tamanos.map(Number).filter(Number.isFinite) : [];
    return [medir, [codigo, nombre, lineas, String(modo.funcion ?? ''), String(modo.argumentos ?? ''), tamanos, Number(modo.presupuesto) || 20]];
  }
  return [correr, [codigo, nombre, lineas]];
}

async function ejecutar({ id, codigo, nombre, lineas, modo, archivos, principal }) {
  corrida = id;
  escrito = 0;
  imagenes = 0;
  cortado = false;
  espera = 0;
  const desde = performance.now();
  const proyecto = proyectoPython({ codigo, nombre, archivos, principal });
  if (proyecto.error) {
    enviar({ tipo: 'fin', id, ms: 0, error: proyecto.error, linea: 0, archivo: null, archivos: { cambiados: [], borrados: [] } });
    return;
  }
  let resultado;
  let antes = new Map();
  try {
    antes = ponerProyecto(py.FS, proyecto);
    const [f, datos] = comoCorre(proyecto.codigo, proyecto.principal, lineas, modo);
    const r = typeof WebAssembly.Suspending === 'function' ? await f.callPromising(...datos) : f(...datos);
    resultado = r.toJs();
    r.destroy();
  } catch (e) {
    resultado = [String(e?.message ?? e), 0, null];
  }
  const [error, linea, archivo] = resultado;
  // What the program did to its folder goes back also when it broke.
  let cambios;
  try {
    cambios = cambiosDe(py.FS, antes);
  } catch {
    cambios = { cambiados: [], borrados: [] };
  }
  const fin = { tipo: 'fin', id, ms: Math.round(performance.now() - desde - espera), error: error ?? null, linea: Number(linea) || 0, archivo: typeof archivo === 'string' ? archivo : null, archivos: cambios };
  enviar(fin, cambios.cambiados.map((a) => a.contenido.buffer));
}

// Checks the open file without running it (revisar.js): `revisado` { error, linea, marcas, pyflakes }. pyflakes comes
// once, from the page (`pyflakes`, the bytes of its file), and goes where Python keeps its packages.
function revisar({ id, codigo, nombre, pyflakes }) {
  if (!conPyflakes && pyflakes instanceof ArrayBuffer) {
    try {
      py.unpackArchive(pyflakes, 'wheel', { extractDir: sitio });
      conPyflakes = true;
    } catch {
      conPyflakes = false;
    }
  }
  let r = [null, 0, []];
  try {
    const x = revisarPy(String(codigo ?? ''), String(nombre ?? 'main.py'));
    r = x.toJs();
    x.destroy();
  } catch {
    // Nothing to mark.
  }
  const [error, linea, marcas] = r;
  enviar({ tipo: 'revisado', id, error: typeof error === 'string' ? error : null, linea: Number(linea) || 0, marcas: Array.isArray(marcas) ? marcas : [], pyflakes: conPyflakes });
}

escuchar('message', async ({ data }) => {
  if (data?.tipo === 'cargar') {
    try {
      enviar({ tipo: 'listo', ...(await cargar(String(data.base), Number(data.total) || 0)) });
    } catch (e) {
      enviar({ tipo: 'falla', mensaje: String(e?.message ?? e) });
    }
  } else if (data?.tipo === 'correr' && correr) {
    ejecutar(data);
  } else if (data?.tipo === 'revisar' && revisarPy) {
    revisar(data);
  } else if (data?.tipo === 'chapin' && chapin) {
    // The code as a Chapin (chapin.js): `chapin` { id, json }, the JSON as _chapin gives it, or null if it broke.
    let json = null;
    try {
      json = String(chapin(String(data.codigo ?? '')));
    } catch {
      json = null;
    }
    enviar({ tipo: 'chapin', id: data.id, json });
  } else if (data?.tipo === 'paquete' && correr) {
    // The file of a package, as the page downloaded it: unpacked where `import` looks.
    let ok = true;
    try {
      py.unpackArchive(data.bytes, 'wheel', { extractDir: sitio });
    } catch {
      ok = false;
    }
    enviar({ tipo: 'paquete', nombre: String(data.nombre), ok });
  } else if (data?.tipo === 'entrada' && esperando) {
    const resolver = esperando;
    esperando = null;
    espera += performance.now() - desdeEspera;
    resolver(typeof data.texto === 'string' ? data.texto : null);
  }
});
