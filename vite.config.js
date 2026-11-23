import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { SITIO } from './sitio.config.js';
import { rutasPublicas } from './scripts/rutas.mjs';

// La política de contenido mínima: solo scripts propios. Nada de scripts inline, on…=, javascript: ni eval.
// `connect-src` es la garantía de fondo: el navegador solo puede pedir datos al sitio, al campus, a los títulos de video, al panel de Luta Studios (el contador de visitas y Consultron con Gemini, que sale de ahí hacia Google), a El Santo Resumen (su índice de apuntes, su servicio de banco y consejos, la función `supercvg-disenos` de Diseños, en el mismo origen, y la función de Consultron en «Código» del Laboratorio, que sale de ahí hacia Groq o Gemini), a Google Classroom (solo lectura, y la revocación del permiso) y a Google Drive (`www.googleapis.com`, también `/upload`: la carpeta oculta de la app, si el alumno guarda ahí lo suyo, y la carpeta «Super CVG» con los archivos que manda por Mensajes, de donde sale su link de `drive.google.com`, que se abre en otra pestaña y nunca se pide; y las carpetas públicas de la pestaña Drive de Buscar, con la clave del sitio). `frame-src` deja abrir, oculta, la pantalla de permiso de Google para renovarlo sin mostrar nada.
// `frame-src` también deja el lector de El Santo Resumen (`demo.lutastudios.com/visor/`): un resumen HTML con sus scripts prendidos corre ahí, en un marco que solo puede correr scripts, sin origen y sin nada de este sitio. Y la vista de Google de un archivo público de Drive (`drive.google.com` y `docs.google.com`, `/preview`), solo cuando Google frena las descargas de la pestaña Drive: corre en su propio origen, sin nada de este sitio.
// `img-src` suma el Supabase de El Santo Resumen por las fotos de la primera página de cada resumen del banco, que saca él y guarda en su carpeta pública (`leerFoto` de src/lib/santoResumen.js solo deja pasar esas).
// El Laboratorio corre Python, SQL, C y JavaScript en WebAssembly (Pyodide, sql.js, el compilador xcc y el intérprete QuickJS, de /motores/), dentro de un worker que arranca de un `blob:` para llevar esta misma política: por eso `worker-src` suma `blob:`, y `script-src` suma `'wasm-unsafe-eval'`, que deja compilar WebAssembly y nada más (sigue sin `eval` ni `new Function` de JavaScript, también adentro del worker; en C es lo que deja correr el programa que acaba de compilar). El JavaScript del alumno tampoco pasa por `eval`: lo lee y lo corre QuickJS adentro de su WebAssembly. Lo que corre ahí no tiene red: además de este `connect-src`, el worker se queda sin fetch, sockets ni IndexedDB al terminar de cargar (src/lib/laboratorio/red.js).
// Estudiar en vivo abre un websocket al Realtime de El Santo Resumen (`wss://lomhlulbgfovtnljbqzp.supabase.co`), solo para el canal de cada sesión, con todo cifrado en el navegador (src/lib/enVivo/). La conexión directa entre navegadores (WebRTC) no pasa por `connect-src`.
// Consultron baja su modelo de Hugging Face (`huggingface.co`, que redirige a sus servidores de archivos en `*.hf.co`): solo los pesos, fijos en una versión, cuando el alumno lo pide y una sola vez. Lo que pregunta y sus apuntes no salen del navegador. El programa del modelo sale de /motores/consultron/ y corre en un worker que arranca de un `blob:`, con esta misma política (src/lib/consultron). Las fotos que le adjuntan las lee tesseract.js, también del sitio (/motores/ocr/): su worker arranca de un `blob:`, carga su núcleo con `importScripts` y sus idiomas con `fetch`, todo de este origen. No hizo falta sumar nada a la política.
export const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com https://lomhlulbgfovtnljbqzp.supabase.co; font-src 'self' data:; connect-src 'self' https://frro.cvg.utn.edu.ar https://www.youtube.com https://spltnoksgdkbaamskuau.supabase.co https://lutastudios.com https://lomhlulbgfovtnljbqzp.supabase.co wss://lomhlulbgfovtnljbqzp.supabase.co https://classroom.googleapis.com https://oauth2.googleapis.com https://www.googleapis.com https://huggingface.co https://*.hf.co; frame-src 'self' https://accounts.google.com https://demo.lutastudios.com https://drive.google.com https://docs.google.com; form-action 'none'; object-src 'none'; base-uri 'self'; worker-src 'self' blob:";

const escapar = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

function conCabeza(html, { ruta, titulo, descripcion, noindex }) {
  const t = escapar(titulo);
  const d = escapar(descripcion);
  const canonica = SITIO.url && !noindex ? `${SITIO.url}/${ruta}` : '';
  const metas = [
    '<meta property="og:type" content="website" />',
    `<meta property="og:site_name" content="${escapar(SITIO.nombre)}" />`,
    `<meta property="og:locale" content="${SITIO.idioma.replace('-', '_')}" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    canonica && `<meta property="og:url" content="${canonica}" />`,
    canonica && `<link rel="canonical" href="${canonica}" />`,
    SITIO.url && SITIO.imagen && `<meta property="og:image" content="${SITIO.url}/${SITIO.imagen}" />`,
    SITIO.url && SITIO.imagen && '<meta property="og:image:width" content="1200" />',
    SITIO.url && SITIO.imagen && '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    noindex && '<meta name="robots" content="noindex" />',
  ].filter(Boolean);
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${t}</title>\n    ${metas.join('\n    ')}`)
    .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${d}"`);
}

// La CSP va en el HTML al compilar: en desarrollo, Vite necesita su script inline.
const csp = () => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html
      .replace('<html lang="es-AR">', `<html lang="${SITIO.idioma}">`)
      .replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// GitHub Pages: cada ruta pública con su index.html y su cabecera, el resto entra por 404.html. También
// sitemap y robots. Los privados llevan noindex.
function paginas() {
  let dist = resolve(import.meta.dirname, 'dist');
  let raiz = import.meta.dirname;
  let modo = 'production';
  return {
    name: 'paginas',
    apply: 'build',
    configResolved(config) {
      dist = resolve(config.root, config.build.outDir);
      raiz = config.root;
      modo = config.mode;
    },
    async closeBundle() {
      const index = resolve(dist, 'index.html');
      if (!existsSync(index)) return;
      const html = readFileSync(index, 'utf8');
      copyFileSync(index, resolve(dist, '404.html'));
      const publicas = await rutasPublicas({ raiz, modo });
      for (const p of publicas) {
        const carpeta = resolve(dist, p.ruta);
        mkdirSync(carpeta, { recursive: true });
        writeFileSync(resolve(carpeta, 'index.html'), conCabeza(html, p));
      }
      for (const ruta of SITIO.privadas) {
        const carpeta = resolve(dist, ruta);
        mkdirSync(carpeta, { recursive: true });
        writeFileSync(resolve(carpeta, 'index.html'), conCabeza(html, { ruta, titulo: SITIO.nombre, descripcion: SITIO.descripcion, noindex: true }));
      }
      if (SITIO.url) {
        const urls = publicas.map((p) => `  <url><loc>${SITIO.url}/${p.ruta}</loc></url>`).join('\n');
        writeFileSync(resolve(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
      }
      writeFileSync(resolve(dist, 'robots.txt'), `User-agent: *\nAllow: /\n${SITIO.url ? `Sitemap: ${SITIO.url}/sitemap.xml\n` : ''}`);
    },
  };
}

// What pdf.js asks for besides the PDF (src/lib/opcionesPdf.js), at /pdfjs/: the decoders of scanned pages in WebAssembly
// (CCITT and JBIG2, JPEG 2000, color management), the standard fonts for a PDF that doesn't carry its own, the maps of Asian
// text and the color profile. Without them a scanned page comes out blank. In dev they come from node_modules, and the
// build copies them. Not the JavaScript engine of pdf.js (quickjs): nothing here runs what a PDF carries.
const PDFJS = resolve(import.meta.dirname, 'node_modules/pdfjs-dist');
const RECURSOS_PDF = {
  wasm: /^(jbig2|openjpeg|qcms_bg)\.wasm$|^(jbig2|openjpeg)_nowasm_fallback\.js$|^LICENSE_(?!.*QUICKJS)/,
  cmaps: /^[\w.-]+$/,
  standard_fonts: /^[\w.-]+$/,
  iccs: /^[\w.-]+$/,
};
const TIPOS_PDF = { '.wasm': 'application/wasm', '.js': 'text/javascript', '.ttf': 'font/ttf', '.icc': 'application/vnd.iccprofile' };

function recursosPdf() {
  let dist = resolve(import.meta.dirname, 'dist');
  return {
    name: 'recursos-pdf',
    configResolved(config) {
      dist = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((pedido, respuesta, seguir) => {
        const base = server.config.base;
        const url = (pedido.url ?? '').split('?')[0];
        const m = /^pdfjs\/([a-z_]+)\/([\w.-]+)$/.exec(url.startsWith(base) ? url.slice(base.length) : '');
        if (!m || !Object.hasOwn(RECURSOS_PDF, m[1]) || !RECURSOS_PDF[m[1]].test(m[2])) return seguir();
        const archivo = resolve(PDFJS, m[1], m[2]);
        if (!existsSync(archivo)) return seguir();
        respuesta.setHeader('Content-Type', TIPOS_PDF[extname(m[2])] ?? 'application/octet-stream');
        respuesta.end(readFileSync(archivo));
      });
    },
    closeBundle() {
      if (!existsSync(resolve(dist, 'index.html'))) return;
      for (const [carpeta, deja] of Object.entries(RECURSOS_PDF)) {
        const destino = resolve(dist, 'pdfjs', carpeta);
        mkdirSync(destino, { recursive: true });
        for (const f of readdirSync(resolve(PDFJS, carpeta))) if (deja.test(f)) copyFileSync(resolve(PDFJS, carpeta, f), resolve(destino, f));
      }
    },
  };
}

// The engines of the Laboratorio, at /motores/: Pyodide (Python, MPL-2.0), the WebAssembly of sql.js (SQLite, MIT) and
// xcc (C, MIT): its compiler, headers and library in one zip, the one its own playground serves, kept in vendor/xcc. And
// QuickJS (JavaScript, MIT), the WebAssembly of quickjs-emscripten, kept in vendor/js.
// Their JavaScript goes in the workers' bundles (src/lib/laboratorio); these are the files they ask for while loading,
// which in dev come from node_modules and the build copies. Python's lock file is served with no packages: nothing can
// be installed (no micropip, nothing downloaded from outside). They load only when the lab opens.
const PYODIDE = resolve(import.meta.dirname, 'node_modules/pyodide');
const SQLJS = resolve(import.meta.dirname, 'node_modules/sql.js');
// From https://tyfkda.github.io/xcc/wccfiles.zip, built by its workflow from github.com/tyfkda/xcc at d7bb34e (v0.1.13).
const XCC = resolve(import.meta.dirname, 'vendor/xcc');
// The asyncify build of @jitl/quickjs-wasmfile-release-asyncify (emscripten-module.wasm), the same version as its
// JavaScript, which goes in the worker's bundle: a test compares them byte by byte (js.test.js).
const QUICKJS = resolve(import.meta.dirname, 'vendor/js');
const QUICKJS_NPM = resolve(import.meta.dirname, 'node_modules/@jitl/quickjs-wasmfile-release-asyncify');
// Consultron's model program (WebAssembly), from github.com/mlc-ai/binary-mlc-llm-libs at 146ed9c, the one web-llm 0.2.87
// asks for (web-llm-models/v0_2_87/base). Its weights come from Hugging Face (src/lib/consultron/motor.js).
// Next to it, `<program>.placa.json`: what that program asks the video card for (src/lib/consultron/placa.js). A new
// program needs a new one: in `npm run dev`, with the model loaded and a question of each kind asked (a normal one, a
// short one, a joke and the data of a calculator), it is the entry the browser keeps in Cache Storage, `consultron/placa`.
const CONSULTRON = resolve(import.meta.dirname, 'vendor/consultron');
// Consultron's reader of photos (src/lib/consultron/ocr.js): the worker of tesseract.js and its core, Tesseract in
// WebAssembly, in the three builds it picks from (relaxed SIMD, SIMD or neither: the browser downloads one). The Spanish
// and English data are tessdata_best in integers, kept in vendor/ocr from @tesseract.js-data/spa and eng 1.0.0
// (4.0.0_best_int). They load only when a photo is attached.
const TESSERACT = resolve(import.meta.dirname, 'node_modules/tesseract.js');
const TESSERACT_CORE = resolve(import.meta.dirname, 'node_modules/tesseract.js-core');
const OCR = resolve(import.meta.dirname, 'vendor/ocr');
const leerJson = (archivo) => JSON.parse(readFileSync(archivo, 'utf8'));
// The packages Python imports in the lab besides its own (src/lib/laboratorio/modulos.js): the builds Pyodide lists for
// this engine, kept in vendor/python from https://cdn.jsdelivr.net/pyodide/v<version>/full/. The page downloads one when
// a program imports it and hands it to the worker, which has no network (src/lib/laboratorio/motor.js). A new Pyodide
// lists another file: without it in vendor/python this fails, and a test compares each with the list byte by byte.
const PYTHON_PAQUETES = resolve(import.meta.dirname, 'vendor/python');
const LISTA_PYODIDE = leerJson(resolve(PYODIDE, 'pyodide-lock.json')).packages;
// The ones a program asks for, with what they need (Pyodide's `depends`). `paquetes`: { archivo, bytes, depende } by
// Pyodide's name; `importes`: the package of each name `import` takes (matplotlib also gives pylab, pillow gives PIL).
const PEDIDOS_PYTHON = ['numpy', 'pandas', 'matplotlib'];
const CON_DEPENDENCIAS = [];
const sumarPaquete = (nombre) => {
  if (CON_DEPENDENCIAS.includes(nombre)) return;
  CON_DEPENDENCIAS.push(nombre);
  LISTA_PYODIDE[nombre].depends.forEach(sumarPaquete);
};
PEDIDOS_PYTHON.forEach(sumarPaquete);
// Each one's license, from its METADATA, for LICENCIA.txt: a package that isn't here fails the build.
const LICENCIAS_PYTHON = {
  numpy: 'licencia BSD de 3 cláusulas (con partes 0BSD, MIT, Zlib y CC0-1.0)',
  pandas: 'licencia BSD de 3 cláusulas',
  matplotlib: 'licencia de Matplotlib, basada en la de la PSF',
  contourpy: 'licencia BSD de 3 cláusulas',
  cycler: 'licencia BSD de 3 cláusulas',
  fonttools: 'licencia MIT',
  kiwisolver: 'licencia BSD de 3 cláusulas',
  packaging: 'licencia Apache-2.0 o BSD de 2 cláusulas',
  pillow: 'licencia MIT-CMU',
  pyparsing: 'licencia MIT',
  'python-dateutil': 'licencia Apache-2.0 y BSD de 3 cláusulas',
  pytz: 'licencia MIT',
  six: 'licencia MIT',
};
for (const n of CON_DEPENDENCIAS) if (!LICENCIAS_PYTHON[n]) throw new Error(`Falta la licencia de ${n} en vite.config.js`);
// pyflakes isn't in Pyodide's list: its wheel as PyPI publishes it (pure Python, MIT license), kept in vendor/python. The
// lab checks Python with it while the student types (src/lib/laboratorio/revisar.js); a program doesn't import it. A
// test compares the file with this sha256.
const REVISOR_PYTHON = { archivo: 'pyflakes-4.1.0-py2.py3-none-any.whl', version: '4.1.0', sha256: 'b2e05e6bac8e49b67be2a6ffa63422c60f7193fc72e8180255907b41ec997dc1' };
const PAQUETES_LABORATORIO = {
  paquetes: Object.fromEntries(
    CON_DEPENDENCIAS.map((nombre) => {
      const { file_name: archivo, depends: depende } = LISTA_PYODIDE[nombre];
      return [nombre, { archivo, bytes: statSync(resolve(PYTHON_PAQUETES, archivo)).size, depende }];
    }),
  ),
  importes: Object.fromEntries(CON_DEPENDENCIAS.flatMap((nombre) => LISTA_PYODIDE[nombre].imports.map((i) => [i, nombre]))),
  revisor: { archivo: REVISOR_PYTHON.archivo, bytes: statSync(resolve(PYTHON_PAQUETES, REVISOR_PYTHON.archivo)).size, sha256: REVISOR_PYTHON.sha256 },
};
// `aparte`: files of another folder, each with its own.
const MOTORES = {
  python: {
    carpeta: PYODIDE,
    archivos: ['pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip'],
    aparte: Object.fromEntries([...Object.values(PAQUETES_LABORATORIO.paquetes), PAQUETES_LABORATORIO.revisor].map((p) => [p.archivo, PYTHON_PAQUETES])),
  },
  sql: { carpeta: resolve(SQLJS, 'dist'), archivos: ['sql-wasm-browser.wasm'] },
  c: { carpeta: XCC, archivos: ['wccfiles.zip'] },
  js: { carpeta: QUICKJS, archivos: ['quickjs.wasm'] },
  // The second one is the list of what that program asks the video card for (src/lib/consultron/placa.js).
  consultron: { carpeta: CONSULTRON, archivos: ['Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm', 'Qwen3.5-4B-q4f16_1_cs1k-webgpu.placa.json'] },
  ocr: {
    carpeta: TESSERACT_CORE,
    archivos: ['tesseract-core-relaxedsimd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
    aparte: { 'worker.min.js': resolve(TESSERACT, 'dist'), 'spa.traineddata.gz': OCR, 'eng.traineddata.gz': OCR },
  },
};
/** Where a file of an engine is, or null if it doesn't serve it. */
function carpetaDe(motor, archivo) {
  const { carpeta, archivos, aparte = {} } = MOTORES[motor];
  if (archivos.includes(archivo)) return carpeta;
  return Object.hasOwn(aparte, archivo) ? aparte[archivo] : null;
}
// Made here: the lock file without packages and the notice of each license.
const HECHOS = {
  python: {
    'pyodide-lock.json': () => JSON.stringify({ info: leerJson(resolve(PYODIDE, 'pyodide-lock.json')).info, packages: {} }),
    'LICENCIA.txt': () => [
      `Pyodide ${leerJson(resolve(PYODIDE, 'package.json')).version}, https://pyodide.org`,
      'Licencia MPL-2.0, https://www.mozilla.org/MPL/2.0/',
      'Código fuente en https://github.com/pyodide/pyodide',
      'Incluye CPython, con la licencia de la Python Software Foundation, https://docs.python.org/3/license.html',
      '',
      'Paquetes de Python, tal como los compila y publica Pyodide, cada uno con su licencia dentro de su archivo:',
      ...CON_DEPENDENCIAS.map((n) => `${n} ${LISTA_PYODIDE[n].version}, ${LICENCIAS_PYTHON[n]}`),
      '',
      `Para revisar el código mientras se escribe, pyflakes ${REVISOR_PYTHON.version} tal como lo publica PyPI, licencia MIT, https://github.com/PyCQA/pyflakes`,
      '',
    ].join('\n'),
  },
  sql: { LICENSE: () => readFileSync(resolve(SQLJS, 'LICENSE'), 'utf8') },
  c: {
    'LICENCIA.txt': () => [
      'xcc 0.1.13 (wcc, el compilador de C a WebAssembly), https://github.com/tyfkda/xcc, versión d7bb34e',
      'Licencia MIT',
      '',
      readFileSync(resolve(XCC, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
    ].join('\n'),
  },
  js: {
    'LICENCIA.txt': () => [
      `QuickJS (Fabrice Bellard y Charlie Gordon, versión 2025-09-13), compilado a WebAssembly por quickjs-emscripten ${leerJson(resolve(QUICKJS_NPM, 'package.json')).version}`,
      'https://bellard.org/quickjs/ y https://github.com/justjake/quickjs-emscripten',
      'Licencia MIT',
      '',
      readFileSync(resolve(QUICKJS_NPM, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n'),
    ].join('\n'),
  },
  consultron: {
    'LICENCIA.txt': () => [
      'Consultron usa Qwen3.5-4B (Alibaba, licencia Apache-2.0, https://huggingface.co/Qwen/Qwen3.5-4B)',
      'con web-llm 0.2.87 (MLC, licencia Apache-2.0, https://github.com/mlc-ai/web-llm).',
      'El programa del modelo lo compila MLC en https://github.com/mlc-ai/binary-mlc-llm-libs, versión 146ed9c.',
      'Los pesos, cuantizados por MLC, están en https://huggingface.co/mlc-ai/Qwen3.5-4B-q4f16_1-MLC, versión 44b4246.',
      '',
    ].join('\n'),
  },
  ocr: {
    'LICENCIA.txt': () => [
      `El lector de fotos de Consultron usa tesseract.js ${leerJson(resolve(TESSERACT, 'package.json')).version} (licencia Apache-2.0, https://github.com/naptha/tesseract.js)`,
      `y tesseract.js-core ${leerJson(resolve(TESSERACT_CORE, 'package.json')).version}, Tesseract compilado a WebAssembly (licencia Apache-2.0, https://github.com/naptha/tesseract.js-core).`,
      'Los datos de castellano e inglés son los de tessdata_best en enteros (licencia Apache-2.0, https://github.com/tesseract-ocr/tessdata_best),',
      'tomados de @tesseract.js-data/spa y @tesseract.js-data/eng 1.0.0 (4.0.0_best_int).',
      '',
    ].join('\n'),
  },
};
const TIPOS_MOTOR = { '.wasm': 'application/wasm', '.mjs': 'text/javascript', '.js': 'text/javascript', '.gz': 'application/gzip', '.zip': 'application/zip', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '': 'text/plain; charset=utf-8' };
// What each engine downloads through fetch, to show how much is left: Python's runtime script comes by import, apart.
const PESOS_LABORATORIO = {
  python: ['pyodide.asm.wasm', 'python_stdlib.zip'].reduce((n, f) => n + statSync(resolve(PYODIDE, f)).size, 0) + HECHOS.python['pyodide-lock.json']().length,
  sql: statSync(resolve(SQLJS, 'dist', 'sql-wasm-browser.wasm')).size,
  c: statSync(resolve(XCC, 'wccfiles.zip')).size,
  javascript: statSync(resolve(QUICKJS, 'quickjs.wasm')).size,
};

function motoresLaboratorio() {
  let dist = resolve(import.meta.dirname, 'dist');
  return {
    name: 'motores-laboratorio',
    configResolved(config) {
      dist = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((pedido, respuesta, seguir) => {
        const base = server.config.base;
        const url = (pedido.url ?? '').split('?')[0];
        const m = /^motores\/(python|sql|c|js|consultron|ocr)\/([\w.-]+)$/.exec(url.startsWith(base) ? url.slice(base.length) : '');
        if (!m) return seguir();
        const [, motor, archivo] = m;
        let cuerpo = null;
        if (Object.hasOwn(HECHOS[motor], archivo)) cuerpo = HECHOS[motor][archivo]();
        else if (carpetaDe(motor, archivo)) cuerpo = readFileSync(resolve(carpetaDe(motor, archivo), archivo));
        if (cuerpo === null) return seguir();
        respuesta.setHeader('Content-Type', TIPOS_MOTOR[extname(archivo)] ?? 'application/octet-stream');
        respuesta.end(cuerpo);
      });
    },
    closeBundle() {
      if (!existsSync(resolve(dist, 'index.html'))) return;
      for (const [motor, { archivos, aparte = {} }] of Object.entries(MOTORES)) {
        const destino = resolve(dist, 'motores', motor);
        mkdirSync(destino, { recursive: true });
        for (const f of [...archivos, ...Object.keys(aparte)]) copyFileSync(resolve(carpetaDe(motor, f), f), resolve(destino, f));
        for (const [f, hacer] of Object.entries(HECHOS[motor])) writeFileSync(resolve(destino, f), hacer());
      }
    },
  };
}

// QuickJS's WebAssembly comes from /motores/js/ (js.worker.js hands its bytes to the engine): the address its
// JavaScript would load it from goes, so the build doesn't copy the same megabyte again into assets/.
function quickjsDeMotores() {
  const MODULO = /[\\/]@jitl[\\/]quickjs-wasmfile-release-asyncify[\\/]dist[\\/]emscripten-module\.browser\.mjs$/;
  const DIRECCION = '(new URL("emscripten-module.wasm",import.meta.url)).href';
  return {
    name: 'quickjs-de-motores',
    enforce: 'pre',
    transform(codigo, id) {
      if (!MODULO.test(id.split('?')[0])) return null;
      if (!codigo.includes(DIRECCION)) this.error('quickjs-emscripten cambió cómo busca su WebAssembly: revisá quickjsDeMotores en vite.config.js.');
      return { code: codigo.replace(DIRECCION, '""'), map: null };
    },
  };
}

// Chunks that keep their name from one publication to the next, so a phone downloads only what changed. A chunk's name
// carries the names of the chunks it imports, so a change spreads to everything that imports it:
//   - lib-<package>: each package of node_modules in its own chunk, which imports only other packages. One chunk per
//     package, not per family: y-protocols (live sessions, asked at start) with y-codemirror.next would bring codemirror
//     to the first page.
//   - app: the code of the first page that other screens share (lib, components, layouts). A change here still renames
//     almost every screen. The entry keeps only main.jsx and the router (App.jsx), whose list of screens changes with
//     any of them: no screen imports it, so changing one screen renames only that screen and the entry.
//   - app-pantallas: the screens of the first page (Hoy, Entrar...), which almost no other screen imports.
const familia = (id) => {
  const m = /.*node_modules[\\/]((@[^\\/]+[\\/])?[^\\/]+)/.exec(id);
  return m ? `lib-${m[1].replace(/^@/, '').replace(/[\\/.]/g, '-')}` : null;
};
const deLaApp = (id) => /[\\/]src[\\/]/.test(id) && !/[\\/]src[\\/](main|App)\.jsx$/.test(id);
// Priority decides who takes a module first; an app group also takes what its modules import, not taken yet. A library
// doesn't take the ones it imports: each one is already in its own chunk, and fflate (used by the first page's zips)
// would otherwise go inside the PDF export library and drag its 200 KB to the first page.
const PEDAZOS = [
  { name: familia, debugName: 'lib', test: /node_modules/, includeDependenciesRecursively: false, priority: 3 },
  { name: 'app', test: (id) => deLaApp(id) && !/[\\/]src[\\/]pages[\\/]/.test(id), tags: ['$initial'], priority: 2 },
  { name: 'app-pantallas', test: deLaApp, tags: ['$initial'], priority: 1 },
];

// The tests say dates with the faculty's clock, wherever they run: the machine of the deploy is in UTC.
if (process.env.VITEST) process.env.TZ = 'America/Argentina/Cordoba';

export default defineConfig({
  // En Pages sin dominio propio el sitio vive en /<repo>/.
  base: process.env.BASE_PATH || '/',
  // Two dev servers in this folder must not share the cache of dependencies: when one of them rebuilds it, the other
  // keeps asking for the old files, gets a 504 and its pages stop opening («Super CVG se actualizó»). A second one
  // goes with its own: CVG_CACHE=node_modules/.vite-5330.
  cacheDir: process.env.CVG_CACHE || 'node_modules/.vite',
  plugins: [react(), csp(), paginas(), recursosPdf(), motoresLaboratorio()],
  define: { __PESOS_LABORATORIO__: JSON.stringify(PESOS_LABORATORIO), __PAQUETES_LABORATORIO__: JSON.stringify(PAQUETES_LABORATORIO) },
  // The lab's workers are modules: Pyodide loads its runtime with import().
  worker: { format: 'es', plugins: () => [quickjsDeMotores()] },
  // Pyodide finds its files from where it is: it isn't bundled ahead in dev (https://pyodide.org/en/stable/usage/working-with-bundlers.html).
  // tesseract.js is CommonJS and loads late, with the first photo: ready ahead, so dev doesn't reload the page then.
  optimizeDeps: { exclude: ['pyodide'], include: ['tesseract.js'] },
  // three.js (the 3D of the sign-in screen and the entrance) is one lazy chunk of about 610 KB, loaded only there.
  // The manifest (.vite/manifest.json) tells scripts/trabajador.mjs which chunks each screen needs; it deletes it.
  build: { chunkSizeWarningLimit: 650, manifest: true, rolldownOptions: { output: { codeSplitting: { groups: PEDAZOS } } } },
  // graphify-out, dist and the screenshots change while working: they must not reload the page.
  server: { port: 5330, strictPort: true, watch: { ignored: ['**/graphify-out/**', '**/dist/**', '**/capturas/**'] } },
  test: { environment: 'jsdom' },
});
