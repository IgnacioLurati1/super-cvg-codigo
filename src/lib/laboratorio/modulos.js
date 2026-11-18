// The lab runs Python with what Python brings and the packages the site serves (vite.config.js, `PAQUETES_LABORATORIO`):
// a program that imports anything else fails at that line, and `porQueNoEsta` says why under the error.
const DE_PYTHON = new Set(
  '__future__ abc argparse array ast asyncio base64 bisect builtins calendar cmath collections contextlib copy csv dataclasses datetime decimal difflib enum fractions functools gc glob graphlib hashlib heapq html inspect io itertools json keyword locale logging math numbers operator os pathlib pickle platform pprint queue random re secrets shutil sqlite3 statistics string struct sys tempfile textwrap threading time timeit traceback types typing unicodedata unittest uuid warnings zipfile zoneinfo'.split(
    ' ',
  ),
);
// `paquetes`: { archivo, bytes, depende } by Pyodide's name, each file in /motores/python/. `importes`: the package of
// each name a program imports (`PIL` is pillow's, `pylab` is matplotlib's).
const { paquetes: PAQUETES, importes: IMPORTES, revisor: REVISOR } = __PAQUETES_LABORATORIO__;

/** pyflakes, what checks Python while the student types (revisar.js): { archivo, bytes, sha256 }, in /motores/python/. */
export const REVISOR_PYTHON = REVISOR;

/** The modules a Python program imports, by their first name. */
function importados(codigo) {
  const nombres = new Set();
  for (const linea of String(codigo ?? '').split(/[\n;]/)) {
    const m = /^\s*(?:import\s+([\w., \t]+)|from\s+([\w.]+)\s+import\b)/.exec(linea);
    if (!m) continue;
    const dichos = m[2] ? [m[2]] : m[1].split(',').map((x) => x.trim().split(/\s+/)[0]);
    for (const n of dichos) {
      const primero = n.split('.')[0];
      if (primero) nombres.add(primero);
    }
  }
  return [...nombres];
}

/** The modules a Python program imports that the lab doesn't have: [] if it runs as it is. */
export const modulosQueFaltan = (codigo) => importados(codigo).filter((n) => !DE_PYTHON.has(n) && !Object.hasOwn(IMPORTES, n));

/** What a program imports of the site's packages, by the name it uses (`matplotlib`, `pandas`). */
export const importadosDelSitio = (codigo) => importados(codigo).filter((n) => Object.hasOwn(IMPORTES, n));

/** The packages a Python program needs, with what they need: each one after its own, once. The engine gets them before
 * the run. */
export function paquetesDe(codigo) {
  const orden = [];
  const sumar = (nombre) => {
    if (orden.includes(nombre)) return;
    PAQUETES[nombre].depende.forEach(sumar);
    orden.push(nombre);
  };
  importadosDelSitio(codigo).forEach((n) => sumar(IMPORTES[n]));
  return orden;
}

/** The package a name of `import` comes from: `PIL` is pillow's. */
export const paqueteDe = (importado) => IMPORTES[importado];

/** Where a package is and how much it weighs: { archivo, bytes, depende }. */
export const archivoDe = (paquete) => PAQUETES[paquete];

/** How much some packages weigh together, in bytes. */
export const pesoDe = (paquetes) => paquetes.reduce((n, p) => n + (PAQUETES[p]?.bytes ?? 0), 0);

// Modules that need what the lab doesn't have: a network (it runs without one) or a window (it only has the console).
const SIN_LUGAR = [
  [/^(pymysql|mysqldb|mysql|psycopg2?|pymongo|pyodbc|cx_oracle|oracledb)$/, (n) => `\`${n}\` necesita un servidor de base de datos y acá no hay red. Probalo con \`sqlite3\`, que se usa casi igual.`],
  [/^(flask|flask_\w+|django|fastapi|bottle|uvicorn)$/, (n) => `\`${n}\` levanta un servidor web y acá no hay red.`],
  [/^(requests|urllib3|httpx|aiohttp|smtplib|ftplib)$/, (n) => `\`${n}\` se conecta a internet y acá no hay red.`],
  [/^(pyqt\d|pyside\d|tkinter|_tkinter|turtle|pygame|kivy|wx)$/, (n) => `\`${n}\` abre ventanas y acá solo hay consola.`],
];

/** Why a module the program imported isn't here, from Python's error: a line for under it, or '' if it isn't that.
 * In a project (`proyecto`), a module that isn't a library may be a file of it that's missing. */
export function porQueNoEsta(error, { proyecto = false } = {}) {
  const m = /^ModuleNotFoundError: No module named '([\w.]+)'/m.exec(String(error ?? ''));
  if (!m) return '';
  const nombre = m[1].split('.')[0];
  const regla = SIN_LUGAR.find(([patron]) => patron.test(nombre.toLowerCase()));
  if (regla) return regla[1](nombre);
  if (proyecto) return `No hay un \`${nombre}.py\` en el proyecto. El Laboratorio tampoco lo trae.`;
  return `El Laboratorio no trae \`${nombre}\`. Trae lo de Python, \`numpy\`, \`pandas\` y \`matplotlib\`.`;
}
