// The map of the career's Drive (src/lib/drivePublico.js), made here and published with the site: walking its 2000-odd
// folders from a browser takes about ten minutes, so no student has to. Run it before publishing:
//   DRIVE_CLAVE=<the site's Drive key> npm run drive
// The key is the site's own (secrets.env, SUPERCVG_DRIVE_CLAVE): Google takes it only from the site's addresses, so this
// sends the site's address as the page asking.
import fs from 'node:fs';
import path from 'node:path';
import { armarMapa, CARRERA, clienteDrivePublico } from '../../src/lib/drivePublico.js';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const DESTINO = path.join(RAIZ, 'public/drive/carrera.json');
const clave = process.env.DRIVE_CLAVE;
if (!clave) {
  console.error('Falta DRIVE_CLAVE (la clave de Drive del sitio).');
  process.exit(1);
}

const pedir = (url, opciones = {}) => fetch(url, { ...opciones, headers: { ...opciones.headers, Referer: 'https://supercvg.lutastudios.com/' } });
const inicio = Date.now();
let ultimo = 0;
const mapa = await armarMapa(CARRERA, {
  cliente: clienteDrivePublico({ clave, pedir }),
  aLaVez: 8,
  alAvanzar: (nodos) => {
    if (nodos.length - ultimo < 500) return;
    ultimo = nodos.length;
    console.log(`${nodos.length} cosas, ${Math.round((Date.now() - inicio) / 1000)} s`);
  },
});
// A file named with a run of 32 hex characters (an app's leftovers, like «side_<hash>.png») looks like a campus key to
// the check of what gets published (scripts/revisar-dist.mjs), which would stop the deploy: those files stay out.
const conFormaDeClave = (nodo) => !nodo.c && /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/i.test(JSON.stringify(nodo));
const fuera = mapa.nodos.filter(conFormaDeClave).length;
mapa.nodos = mapa.nodos.filter((n) => !conFormaDeClave(n));
if (fuera) console.log(`${fuera} archivos afuera por tener algo con forma de clave en el nombre.`);
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, JSON.stringify(mapa));
const carpetas = mapa.nodos.filter((n) => n.c).length;
console.log(`Listo: ${mapa.nodos.length} cosas en ${carpetas} carpetas, ${Math.round(fs.statSync(DESTINO).size / 1024)} KB, en ${Math.round((Date.now() - inicio) / 1000)} s.${mapa.cortado ? ' Quedó cortado por los topes.' : ''}`);
