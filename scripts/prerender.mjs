// Deja el contenido de cada página pública ya armado en su HTML, así un buscador o una red social lo lee sin correr
// JavaScript. Abre cada página de dist en Chromium y guarda lo que quedó en #root. Al llegar el JavaScript, React arma
// lo mismo encima. Lo privado (noindex) y 404.html no se tocan: salen vacíos a propósito.
// Sin Chromium avisa y sigue. En el deploy frena, porque publicaría páginas vacías.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buscarChrome, opcionesNavegador, servirDist } from './navegador.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');
const VACIO = '<div id="root"></div>';
// Sin JavaScript nadie marca lo que entra al bajar: que se vea igual.
const SIN_JS = '<noscript><style>.con-movimiento [data-aparece]{opacity:1!important;transform:none!important}</style></noscript>';

/** El HTML de una página con su contenido. `null` si ya no está vacía. Arranca con `con-movimiento`: lo que entra al
 * bajar queda oculto hasta que corre el JavaScript, sin aparecer, desaparecer y volver a aparecer. */
export function conContenido(html, { contenido, datos = [], movimiento = true }) {
  if (!html.includes(VACIO)) return null;
  let salida = html.replace(VACIO, () => `<div id="root">${contenido}</div>`);
  if (movimiento) {
    salida = salida.replace(/<html([^>]*)>/, (_, attrs) => `<html${attrs} class="con-movimiento">`);
    datos = [SIN_JS, ...datos];
  }
  return salida.replace('</head>', () => `${datos.join('\n    ')}\n  </head>`);
}

/** Corre en la página. Un `<` dentro de los datos estructurados se escapa: viene de la base y va a parar al HTML. */
function leerPagina() {
  const copia = document.getElementById('root').cloneNode(true);
  copia.querySelectorAll('[data-visto]').forEach((el) => el.removeAttribute('data-visto'));
  copia.querySelectorAll('[data-foco-pantalla]').forEach((el) => {
    el.removeAttribute('data-foco-pantalla');
    el.removeAttribute('tabindex');
  });
  // A canvas's drawing doesn't survive into HTML: what drew it (the landing's 3D) draws it again.
  copia.querySelectorAll('canvas').forEach((el) => el.remove());
  return {
    contenido: copia.innerHTML,
    movimiento: document.documentElement.classList.contains('con-movimiento'),
    datos: [...document.head.querySelectorAll('script[type="application/ld+json"]')].map(
      (s) => `<script type="application/ld+json" data-previo>${s.textContent.replace(/</g, '\\u003c')}</script>`,
    ),
  };
}

function paginasDe(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory() && e.name !== 'assets') paginasDe(f, salida);
    else if (e.name === 'index.html' && !fs.readFileSync(f, 'utf8').includes('name="robots" content="noindex"')) salida.push(f);
  }
  return salida;
}

async function main() {
  const dist = path.join(RAIZ, 'dist');
  const exe = buscarChrome();
  if (!exe) {
    if (process.env.CI) throw new Error('no encontré Chromium (variable CHROME)');
    console.log('aviso  sin Chromium: las páginas quedan sin contenido en el HTML');
    return;
  }
  const { chromium } = await import('playwright-core');
  const { base, cerrar } = await servirDist(RAIZ);
  let hechas = 0;
  try {
    const navegador = await chromium.launch(opcionesNavegador(exe));
    const pagina = await navegador.newPage({ viewport: { width: 1280, height: 860 } });
    // When a page doesn't come up, what it said is the only clue (on GitHub there's nobody to open it).
    const errores = [];
    pagina.on('pageerror', (e) => errores.push(String(e).slice(0, 300)));
    pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text().slice(0, 300)); });
    pagina.on('requestfailed', (r) => errores.push(`falló ${r.url()} (${r.failure()?.errorText})`));
    pagina.on('response', (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
    for (const archivo of paginasDe(dist)) {
      const ruta = path.relative(dist, path.dirname(archivo)).replace(/\\/g, '/');
      errores.length = 0;
      // Con la barra final, como las sirve GitHub Pages.
      await pagina.goto(base + (ruta ? `${ruta}/` : ''), { waitUntil: 'load' });
      await pagina.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
      // Only the DOM matters here. Polling by time, not by frame: GitHub's headless Chrome may not paint, and a
      // wait for "visible" never ends there although the page is already built.
      await pagina.waitForFunction(() => document.querySelector('#root main'), null, { polling: 100, timeout: 8000 }).catch(async (e) => {
        const html = await pagina.evaluate(() => document.body.innerHTML.slice(0, 400)).catch(() => '(sin respuesta)');
        throw new Error(`/${ruta} no apareció. ${errores.join(' | ') || 'Sin errores en la página.'} (${e.message.split('\n')[0]}) HTML ${html}`);
      });
      const lista = conContenido(fs.readFileSync(archivo, 'utf8'), await pagina.evaluate(leerPagina));
      if (lista) {
        fs.writeFileSync(archivo, lista);
        hechas += 1;
      }
    }
    await navegador.close();
  } finally {
    cerrar();
  }
  console.log(`${hechas} páginas con su contenido en el HTML.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`Frené: ${e.message}`);
    process.exit(1);
  });
}
