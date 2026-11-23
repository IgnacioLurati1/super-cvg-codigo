// Writes dist/sw.js, the service worker that lets Super CVG open without internet (scripts/trabajador/sw.js), after the
// build and the prerender: it lists what each new version keeps and names its caches by their content.
//   node scripts/trabajador.mjs [carpeta]   by default, dist
// Mobile data is scarce, so not everything is downloaded up front:
//   - NUCLEO, kept from the start: the two shells (index.html and 404.html), the icons, the manifest, ajustes.js, and the
//     files of the first page and of the screens a student opens the most (PANTALLAS_DEL_NUCLEO), found in the build's
//     manifest (dist/.vite/manifest.json, deleted here: it isn't published). Of the fonts, only the site's own.
//   - RESTO, every other file of assets/: kept the first time it is used, and downloaded in the background only on a
//     connection that isn't paid by the megabyte (puedeBajarTodo in src/lib/trabajador.js).
//   - Never ahead, only when used: the heavy ones (SIN_PRECARGA), and motores/ and pdfjs/.
// Only Node, no packages.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = path.resolve(import.meta.dirname, '..');

// The workers of the Laboratorio and of Consultron (megabytes, and only with the lab or the local model open) and the 3D
// of the sign-in screen and the entrance (lib-three, only before coming in). Each is kept the first time it is used.
// And the fonts in .woff: every browser that has service workers reads .woff2.
export const SIN_PRECARGA = /^assets\/((consultron|python|c|sql|js)\.worker-|lib-three-)|\.woff$/;
// Besides the first page (Hoy, Entrar), by their source: a screen renamed or moved fails here, not quietly.
export const PANTALLAS_DEL_NUCLEO = ['src/pages/Materias.jsx', 'src/pages/Materia.jsx', 'src/pages/Calendario.jsx', 'src/components/PreviaHoja.jsx', 'src/components/VisorPdf.jsx'];
// Of the fonts the first page links, only Barlow, the site's letter: the code ones and Kalam (the «Hoja» style and the
// shared document) are kept when they show.
const FUENTE = /\.woff2?$/;
const FUENTE_DEL_NUCLEO = /^assets\/barlow-[^/]+\.woff2$/;
const SUELTOS = ['ajustes.js', 'manifest.webmanifest', 'favicon.svg', 'apple-touch-icon.png', 'icono-192.png', 'icono-512.png', 'icono-maskable-512.png'];
export const MANIFIESTO = path.join('.vite', 'manifest.json');

const archivosDe = (carpeta, base = carpeta) =>
  fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((e) => {
    const lleno = path.join(carpeta, e.name);
    return e.isDirectory() ? archivosDe(lleno, base) : [path.relative(base, lleno).split(path.sep).join('/')];
  });

/** The files of assets/ that the first page and PANTALLAS_DEL_NUCLEO load: with what they import, their CSS and assets. */
export function nucleoDe(manifiesto) {
  const entradas = Object.values(manifiesto);
  // A chunk that two screens share has no source of its own in the manifest, only its name (VisorPdf).
  const buscar = (fuente) => {
    const propia = manifiesto[fuente] ?? entradas.find((e) => e.src === fuente);
    if (propia) return propia;
    const nombre = path.basename(fuente).replace(/\.[^.]+$/, '');
    const porNombre = entradas.filter((e) => !e.src && e.name === nombre);
    if (porNombre.length !== 1) throw new Error(`trabajador: ${fuente} no está en el manifiesto de la build (PANTALLAS_DEL_NUCLEO)`);
    return porNombre[0];
  };
  const archivos = new Set();
  const vistas = new Set();
  const visitar = (entrada) => {
    if (!entrada || vistas.has(entrada)) return;
    vistas.add(entrada);
    archivos.add(entrada.file);
    for (const f of [...(entrada.css ?? []), ...(entrada.assets ?? [])]) archivos.add(f);
    for (const k of entrada.imports ?? []) visitar(manifiesto[k]);
  };
  for (const fuente of ['index.html', ...PANTALLAS_DEL_NUCLEO]) visitar(buscar(fuente));
  return [...archivos].filter((f) => f.startsWith('assets/') && !SIN_PRECARGA.test(f) && (!FUENTE.test(f) || FUENTE_DEL_NUCLEO.test(f)));
}

/** What the service worker keeps from the start (nucleo, where '' is the page of «/») and what it keeps later (resto). */
export function precargaDe(dist, manifiesto) {
  const assets = fs.existsSync(path.join(dist, 'assets')) ? archivosDe(path.join(dist, 'assets')).map((f) => `assets/${f}`) : [];
  const nucleo = nucleoDe(manifiesto).sort();
  for (const f of nucleo) if (!assets.includes(f)) throw new Error(`trabajador: el manifiesto nombra ${f}, que no está en ${dist}`);
  return {
    nucleo: ['', '404.html', ...SUELTOS.filter((f) => fs.existsSync(path.join(dist, f))), ...nucleo],
    resto: assets.filter((f) => !nucleo.includes(f) && !SIN_PRECARGA.test(f)).sort(),
  };
}

const archivoDe = (dist, ruta) => path.join(dist, ruta === '' ? 'index.html' : ruta);

/** A short name for some files and their bytes: the same files give the same name. */
export function huella(dist, rutas) {
  const h = createHash('sha256');
  for (const r of rutas) {
    h.update(r);
    h.update('\0');
    h.update(fs.readFileSync(archivoDe(dist, r)));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

// The rules for what another app shares (src/lib/compartidoSaneo.js), the same the page uses: as plain code, since a
// service worker that isn't a module can't import.
export function reglasDeCompartir() {
  const codigo = fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'compartidoSaneo.js'), 'utf8');
  if (/^\s*import\b/m.test(codigo)) throw new Error('src/lib/compartidoSaneo.js no puede importar: va entero en sw.js');
  return codigo.replace(/^export /gm, '');
}

export function leerManifiesto(dist) {
  const archivo = path.join(dist, MANIFIESTO);
  if (!fs.existsSync(archivo)) throw new Error(`trabajador: falta ${MANIFIESTO} en ${dist}. Compilá de nuevo (build.manifest de vite.config.js)`);
  return JSON.parse(fs.readFileSync(archivo, 'utf8'));
}

// The modules of the page the night downloads use (src/lib/descargasFondo.js), each in a scope of its own that gives only
// what is named here: from moodle.js, only the reads. The worker never gets a function that writes to the campus.
export const MODULOS = {
  moodle: { archivo: 'moodle.js', nombre: 'Moodle', da: ['LECTURA', 'llamar', 'pedirArchivo'] },
  disco: { archivo: 'sinInternetDisco.js', nombre: 'Disco', da: ['ARCHIVO_MAXIMO', 'recordar', 'fichaGuardada', 'guardarDeNoche'] },
  fondo: { archivo: 'descargasFondo.js', nombre: 'Fondo', da: ['TAG', 'correr'] },
};

/** A module of src/lib as plain code in its own scope, `const Nombre = (() => { …; return { … }; })()`. It can't import:
 * a service worker that isn't a module can't either. */
export function moduloParaElTrabajador({ archivo, nombre, da }) {
  const codigo = fs.readFileSync(path.join(RAIZ, 'src', 'lib', archivo), 'utf8');
  if (/^\s*import\b/m.test(codigo) || /^\s*export\s*(\*|\{)/m.test(codigo)) throw new Error(`src/lib/${archivo} no puede importar ni reexportar: va entero en sw.js`);
  const propios = new Set([...codigo.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]));
  for (const n of da) if (!propios.has(n)) throw new Error(`src/lib/${archivo} no exporta ${n}`);
  return `const ${nombre} = (() => {\n${codigo.replace(/^export\s+/gm, '')}\nreturn { ${da.join(', ')} };\n})();`;
}

export function armarTrabajador(dist, manifiesto = leerManifiesto(dist)) {
  const { nucleo, resto } = precargaDe(dist, manifiesto);
  const motores = ['motores', 'pdfjs'].filter((c) => fs.existsSync(path.join(dist, c))).flatMap((c) => archivosDe(path.join(dist, c)).map((f) => `${c}/${f}`)).sort();
  const plantilla = fs.readFileSync(path.join(RAIZ, 'scripts', 'trabajador', 'sw.js'), 'utf8');
  const modulos = Object.keys(MODULOS).map((m) => `/* ${m} */`);
  for (const marca of ["'__VERSION__'", '/* nucleo */ []', '/* resto */ []', "'__MOTORES__'", '/* compartido */', ...modulos]) {
    if (!plantilla.includes(marca)) throw new Error(`Falta ${marca} en scripts/trabajador/sw.js`);
  }
  let sw = plantilla
    .replace("'__VERSION__'", () => JSON.stringify(huella(dist, [...nucleo, ...resto])))
    .replace('/* nucleo */ []', () => JSON.stringify(nucleo))
    .replace('/* resto */ []', () => JSON.stringify(resto))
    .replace("'__MOTORES__'", () => JSON.stringify(huella(dist, motores)))
    .replace('/* compartido */', () => reglasDeCompartir());
  for (const [m, modulo] of Object.entries(MODULOS)) sw = sw.replace(`/* ${m} */`, () => moduloParaElTrabajador(modulo));
  return sw;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(RAIZ, process.argv[2] ?? 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('trabajador: no hay build en', dist);
    process.exit(1);
  }
  try {
    const manifiesto = leerManifiesto(dist);
    fs.writeFileSync(path.join(dist, 'sw.js'), armarTrabajador(dist, manifiesto));
    fs.rmSync(path.join(dist, path.dirname(MANIFIESTO)), { recursive: true, force: true });
    const { nucleo, resto } = precargaDe(dist, manifiesto);
    console.log(`trabajador: sw.js con ${nucleo.length} archivos para guardar de entrada y ${resto.length} para después`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
