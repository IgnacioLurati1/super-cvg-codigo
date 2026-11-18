// What gets published is public: this fails if the built site carries anything of the machine it was built on or
// something shaped like a campus key. The deploy runs it twice (after building and right before publishing).
//   node scripts/revisar-dist.mjs [carpeta]   by default, dist
// Only Node, no packages: the publishing job runs it without npm.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TEXTO = /\.(html|js|mjs|css|txt|xml|json|svg|webmanifest|map)$/i;

const REGLAS = [
  // A Moodle web service key is 32 hex characters. The first one, always: the known files skip it by its place.
  { nombre: 'algo con forma de clave del campus', patron: /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi },
  { nombre: 'una dirección de la red privada', patron: /[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/gi },
  { nombre: 'una ruta de la carpeta privada', patron: /\.control[\\/]/gi },
  { nombre: 'una ruta de una compu', patron: /[a-z]:[\\/]+users[\\/]+(?!<)[^\\/\s"'<>]+/gi },
  { nombre: 'el archivo de la clave', patron: /campus-token/gi },
];

// The photo reader of Consultron (/motores/ocr/, tesseract.js-core 7.0.0): its WebAssembly comes in base64, with runs
// of zeros shaped like a key. These three files skip that one rule, and only while their bytes are exactly the ones of
// the package (sha256): the same name with anything else in it is checked whole. A test compares them with the package.
const CONOCIDOS = new Set([
  '861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3', // tesseract-core-relaxedsimd-lstm.wasm.js
  'c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38', // tesseract-core-simd-lstm.wasm.js
  'eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680', // tesseract-core-lstm.wasm.js
]);
export const esConocido = (bytes) => CONOCIDOS.has(createHash('sha256').update(bytes).digest('hex'));

/** Problems in one text: [{ nombre, muestra }]. The sample shows only the start, never a whole match. `conocido`: one
 * of the files above, which skips the rule of the key. */
export function revisarTexto(texto, { conocido = false } = {}) {
  const fallas = [];
  for (const { nombre, patron } of conocido ? REGLAS.slice(1) : REGLAS) {
    for (const m of texto.matchAll(patron)) fallas.push({ nombre, muestra: `${m[0].slice(0, 4)}…` });
  }
  return fallas;
}

function archivos(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) archivos(f, salida);
    else if (TEXTO.test(e.name)) salida.push(f);
  }
  return salida;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dist = path.resolve(process.argv[2] ?? 'dist');
  if (!fs.existsSync(dist)) {
    console.error(`no existe ${dist}`);
    process.exit(1);
  }
  let total = 0;
  for (const f of archivos(dist)) {
    const bytes = fs.readFileSync(f);
    for (const { nombre, muestra } of revisarTexto(bytes.toString('utf8'), { conocido: esConocido(bytes) })) {
      total += 1;
      console.error(`frena  ${path.relative(dist, f).replace(/\\/g, '/')}: ${nombre} (${muestra})`);
    }
  }
  if (total) process.exit(1);
  console.log('revisar-dist: nada de la compu ni claves en lo publicado');
}
