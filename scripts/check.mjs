// Los estándares del sitio, en un comando que falla. `npm run check` compila y corre todo; el deploy corre solo
// lo que no necesita navegador. Lee el nivel de .claude/tipo.json: en un sitio grande, accesibilidad frena; en
// uno chico, avisa.
//   node scripts/check.mjs             todo, sobre dist (compilá antes)
//   node scripts/check.mjs --estatico  sin navegador (lo corre el deploy, y ahí sitio.config.js necesita `url`)
// Una línea con «textos-ok» queda fuera de la revisión de textos.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buscarChrome, opcionesNavegador, servirDist } from './navegador.mjs';

const RAIZ = path.resolve(import.meta.dirname, '..');

const leerTodo = (dir, filtro, salida = []) => {
  if (!fs.existsSync(dir)) return salida;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) leerTodo(f, filtro, salida);
    else if (filtro(f)) salida.push(f);
  }
  return salida;
};

// ---------- Textos ----------
const QUITAR_CODIGO = /\{[^{}]*\}|<[^<>]*>/g;
/** Problemas de un archivo de pantalla. Solo mira texto que se lee: el JSX entre etiquetas y las comillas con frases. */
export function revisarTextos(contenido) {
  const fallas = [];
  contenido.split(/\r?\n/).forEach((linea, i) => {
    if (linea.includes('textos-ok') || /^\s*(\/\/|\*|\/\*|import )/.test(linea)) return;
    const n = i + 1;
    if (/[→↗➜⟶]/.test(linea)) fallas.push(`${n}: flecha en un texto`);
    if (/\s·\s/.test(linea)) fallas.push(`${n}: punto medio en un texto`);
    const entreEtiquetas = [...linea.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
    const frases = [...linea.matchAll(/(?:^|[\s(=,:])(['"`])((?:(?!\1).)*\s(?:(?!\1).)*)\1/g)].map((m) => m[2].replace(QUITAR_CODIGO, ''));
    for (const t of [...entreEtiquetas, ...frases]) {
      if (/[a-záéíóúñ]: [a-záéíóúñ¿«]/i.test(t) && !/https?:|[a-z-]+: [^ ]*;|^\s*\(?[a-z-]+:/.test(t)) fallas.push(`${n}: «:» en medio de una oración («${t.trim().slice(0, 50)}»)`);
    }
  });
  return fallas;
}

// ---------- Lo que no necesita navegador ----------
const SECRETOS = [
  ['clave secreta de Supabase', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['clave de Brevo', /xkeysib-[a-f0-9]{16,}/],
  ['clave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token de GitHub', /gh[pousr]_[A-Za-z0-9]{20,}/],
  ['dirección de Tailscale', /[A-Za-z0-9-]\.ts\.net(?![A-Za-z0-9-])/],
  ['ruta de la carpeta de claves', /[\\/]\.control(?![A-Za-z0-9_-])/],
  ['carpeta de un usuario de Windows', /[A-Z]:\\\\?Users\\\\?(?!<)[A-Za-z]/],
];

export function revisarEstatico({ raiz = RAIZ, enDeploy = false } = {}) {
  const frena = [];
  const avisa = [];
  const dist = path.join(raiz, 'dist');
  const src = path.join(raiz, 'src');

  const tokens = path.join(src, 'styles', 'tokens.css');
  if (fs.existsSync(tokens) && fs.readFileSync(tokens, 'utf8').includes('SIN-MARCA')) frena.push('marca: src/styles/tokens.css sigue con los valores provisorios. Definí la identidad del cliente');

  const pantallas = leerTodo(src, (f) => /\.(jsx|tsx)$/.test(f) && !/\.test\./.test(f));
  for (const f of pantallas) {
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes('COMPLETAR')) frena.push(`contenido: ${rel2(raiz, f)} todavía dice COMPLETAR`);
    for (const p of revisarTextos(t)) frena.push(`textos: ${rel2(raiz, f)}:${p}`);
  }
  for (const f of leerTodo(src, (x) => x.endsWith('.css'))) {
    // Un logo en mayúsculas se deja con /* textos-ok */ en esa línea.
    if (fs.readFileSync(f, 'utf8').split(/\r?\n/).some((l) => /text-transform:\s*uppercase/.test(l) && !l.includes('textos-ok'))) frena.push(`textos: ${rel2(raiz, f)} pone etiquetas en mayúsculas`);
  }

  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    frena.push('build: no hay dist. Corré npm run build');
    return { frena, avisa };
  }

  const textos = leerTodo(dist, (f) => /\.(html|js|css|json|txt|xml|svg|map)$/.test(f));
  for (const f of textos) {
    const t = fs.readFileSync(f, 'utf8');
    for (const [nombre, patron] of SECRETOS) if (patron.test(t)) frena.push(`seguridad: ${nombre} en ${rel2(raiz, f)}`);
  }

  for (const f of textos.filter((x) => x.endsWith('.html'))) {
    const t = fs.readFileSync(f, 'utf8');
    const nombre = rel2(raiz, f);
    if (!/http-equiv="Content-Security-Policy"[^>]*script-src 'self'/.test(t)) frena.push(`seguridad: ${nombre} sin CSP`);
    if (/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(t)) frena.push(`seguridad: ${nombre} con un script inline`);
    if (/\son[a-z]+\s*=\s*["']/i.test(t)) frena.push(`seguridad: ${nombre} con un on…= en el HTML`);
    if (!/<html[^>]+lang="/.test(t)) frena.push(`seo: ${nombre} sin idioma`);
    if (!/<title>[^<]+<\/title>/.test(t)) frena.push(`seo: ${nombre} sin título`);
    if (!/<meta name="description" content="[^"]{20,}"/.test(t)) frena.push(`seo: ${nombre} sin descripción`);
    if (!/name="viewport"/.test(t)) frena.push(`celular: ${nombre} sin viewport`);
    if (t.includes('<div id="root"></div>') && !t.includes('name="robots" content="noindex"') && !nombre.endsWith('404.html')) frena.push(`seo: ${nombre} sale sin contenido en el HTML (scripts/prerender.mjs)`);
  }

  const robots = path.join(dist, 'robots.txt');
  if (!fs.existsSync(robots)) frena.push('seo: falta robots.txt');
  else if (/^Disallow:\s*\/./m.test(fs.readFileSync(robots, 'utf8'))) frena.push('seo: robots.txt nombra rutas en un Disallow. Lo privado va con noindex');

  if (!fs.existsSync(path.join(dist, 'sitemap.xml'))) {
    (enDeploy ? frena : avisa).push('seo: sin sitemap. Falta `url` en sitio.config.js');
  }
  const inicio = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (!/property="og:title"/.test(inicio)) frena.push('seo: el inicio sin og:title');
  if (!/property="og:image"/.test(inicio)) avisa.push('seo: sin og:image. Sumá la imagen de cuando se pega el link');

  const js = leerTodo(path.join(dist, 'assets'), (f) => f.endsWith('.js'));
  const entrada = /src="[^"]*assets\/([^"]+\.js)"/.exec(inicio)?.[1];
  const principal = js.find((f) => path.basename(f) === entrada);
  if (principal) {
    const kb = Math.round(fs.statSync(principal).size / 1024);
    if (kb > 900) frena.push(`peso: el JS de entrada pesa ${kb} KB. Bajá lo pesado aparte (el 3D, el panel) con lazy`);
    else if (kb > 600) avisa.push(`peso: el JS de entrada pesa ${kb} KB`);
  }
  return { frena, avisa };
}
const rel2 = (raiz, f) => path.relative(raiz, f).replace(/\\/g, '/');

// ---------- Con navegador ----------
async function revisarNavegador(tipo) {
  const frena = [];
  const avisa = [];
  const exe = buscarChrome();
  if (!exe) return { frena: ['navegador: no encontré Chromium (variable CHROME)'], avisa };
  const { chromium } = await import('playwright-core');
  const { SITIO } = await import(pathToFileURL(path.join(RAIZ, 'sitio.config.js')).href);
  const axe = fs.readFileSync(path.join(RAIZ, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
  const { base, cerrar } = await servirDist(RAIZ);
  try {
    const navegador = await chromium.launch(opcionesNavegador(exe));
    for (const ancho of [390, 768, 1280]) {
      const pagina = await navegador.newPage({ viewport: { width: ancho, height: 860 } });
      for (const { ruta } of SITIO.publicas) {
        const errores = [];
        const alError = (e) => errores.push(e.message);
        const alConsola = (m) => m.type() === 'error' && errores.push(m.text());
        pagina.on('pageerror', alError);
        pagina.on('console', alConsola);
        // Un 3D o una conexión abierta pueden no quedar nunca en silencio: se espera un rato y se sigue.
        await pagina.goto(base + (ruta ? `${ruta}/` : ''), { waitUntil: 'load' });
        await pagina.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});
        const nombre = `/${ruta} en ${ancho}`;
        const datos = await pagina.evaluate(() => {
          const raiz = document.documentElement;
          const conScroll = raiz.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1;
          const anchoVentana = window.innerWidth;
          const salidos = [...document.querySelectorAll('main *')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > anchoVentana + 1 && getComputedStyle(el).position !== 'fixed';
          }).length;
          return { conScroll, salidos, h1: document.querySelectorAll('h1').length, chicos: [...document.querySelectorAll('a[href], button')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.height < 24 && getComputedStyle(el).display !== 'inline';
          }).length };
        });
        if (datos.conScroll || datos.salidos) frena.push(`diseño: ${nombre} se sale a lo ancho (${datos.salidos} elementos)`);
        if (datos.h1 !== 1) frena.push(`seo: ${nombre} tiene ${datos.h1} h1`);
        if (datos.chicos) avisa.push(`celular: ${nombre} tiene ${datos.chicos} controles de menos de 24 px`);
        for (const e of new Set(errores)) frena.push(`consola: ${nombre}: ${e.slice(0, 160)}`);
        pagina.off('pageerror', alError);
        pagina.off('console', alConsola);
        if (ancho !== 768) {
          await pagina.evaluate(axe);
          const violaciones = await pagina.evaluate(async () => {
            // Lo que aparece al bajar arranca transparente: axe mide contraste con todo ya a la vista.
            document.querySelectorAll('[data-aparece]').forEach((el) => el.setAttribute('data-visto', ''));
            await new Promise((r) => setTimeout(r, 1200));
            const r = await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] });
            return r.violations.map((v) => `${v.id} (${v.nodes.length})`);
          });
          for (const v of violaciones) (tipo === 'web-grande' ? frena : avisa).push(`accesibilidad: ${nombre}: ${v}`);
        }
      }
      await pagina.close();
    }
    await navegador.close();
  } finally {
    cerrar();
  }
  return { frena, avisa };
}

async function main() {
  const estatico = process.argv.includes('--estatico');
  let tipo = 'web-chica';
  try {
    tipo = JSON.parse(fs.readFileSync(path.join(RAIZ, '.claude', 'tipo.json'), 'utf8')).tipo;
  } catch {
    // Sin la marca, el nivel de un sitio chico.
  }
  const fijo = revisarEstatico({ enDeploy: estatico });
  const vivo = estatico ? { frena: [], avisa: [] } : await revisarNavegador(tipo);
  const frena = [...new Set([...fijo.frena, ...vivo.frena])];
  const avisa = [...new Set([...fijo.avisa, ...vivo.avisa])];
  // Con muchas rutas un mismo error se repite: alcanza con los primeros, y la salida no llena la sesión.
  const TOPE = 25;
  for (const a of avisa.slice(0, TOPE)) console.log(`aviso  ${a}`);
  if (avisa.length > TOPE) console.log(`aviso  y ${avisa.length - TOPE} más`);
  for (const f of frena.slice(0, TOPE)) console.log(`FRENA  ${f}`);
  if (frena.length > TOPE) console.log(`FRENA  y ${frena.length - TOPE} más`);
  if (frena.length) {
    console.log(`\n${frena.length} para arreglar.`);
    process.exit(1);
  }
  console.log(`\nTodo en verde${avisa.length ? `, con ${avisa.length} avisos` : ''}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(`Frené: ${e.message}`);
    process.exit(1);
  });
}
