// A real picture of each calculator for its card in the list, in the light and the dark theme: the calculator as it
// opens, with the example it starts with. Run it with `npm run dev` up (the calculators are private, and only
// development shows them without an account, with ?demo=1):
//   node scripts/calculadoras/fotos.mjs [http://localhost:5330] [slug…]
// It keeps the most telling part of the sheet (its biggest drawing or 3D scene, or else its table, or else its top, all its width)
// and writes public/calculadoras/<slug>-claro.webp and -oscuro.webp.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buscarChrome, opcionesNavegador } from '../navegador.mjs';
import { CATALOGO } from '../../src/lib/calculadoras/catalogo.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [, , direccion, ...solo] = process.argv;
const base = (direccion || 'http://localhost:5330').replace(/\/$/, '');
const destino = path.join(raiz, 'public', 'calculadoras');
const ANCHO = 560;
const ALTO = 280;

const { chromium } = await import('playwright-core');
const navegador = await chromium.launch(opcionesNavegador(buscarChrome()));
const pagina = await navegador.newPage({ viewport: { width: 820, height: 1000 }, deviceScaleFactor: 1 });
await pagina.goto(`${base}/?demo=1`);
await pagina.waitForLoadState('networkidle');
fs.mkdirSync(destino, { recursive: true });

for (const c of CATALOGO.filter((x) => !solo.length || solo.includes(x.slug))) {
  await pagina.evaluate((u) => {
    history.pushState({}, '', u);
    dispatchEvent(new PopStateEvent('popstate'));
  }, `/calculadoras/${c.slug}`);
  await pagina.waitForSelector('.calc-hoja', { timeout: 15000 });
  // A 3D scene starts when it comes near the screen.
  const escena = pagina.locator('.gr-escena');
  if (await escena.count()) {
    await escena.scrollIntoViewIfNeeded();
    await pagina.waitForSelector('.gr-escena--lista', { timeout: 20000 });
  }
  await pagina.waitForTimeout(400);
  for (const tema of ['claro', 'oscuro']) {
    await pagina.evaluate((t) => document.documentElement.setAttribute('data-tema', t), tema);
    await pagina.waitForTimeout(350);
    // The part that says what it is: the biggest drawing of the sheet, else its first table, else its top.
    const caja = await pagina.evaluate(() => {
      const hoja = document.querySelector('.calc-hoja');
      const area = (el) => {
        const r = el.getBoundingClientRect();
        return r.width * r.height;
      };
      const dibujos = [...hoja.querySelectorAll('svg, canvas')].filter((s) => area(s) > 20000).sort((a, b) => area(b) - area(a));
      const el = dibujos[0] || hoja.querySelector('table') || hoja;
      // Below the fixed header, so it doesn't come out in the picture.
      window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - 140);
      // The whole width of the sheet from a little above it, so every card shows it at the same scale.
      const r = el.getBoundingClientRect();
      const h = hoja.getBoundingClientRect();
      // A 3D scene has its drawing in the middle: the picture takes its centre.
      const y = el.tagName === 'CANVAS' ? r.y + (r.height - h.width / 2) / 2 : Math.max(h.y, r.y - 16);
      return { x: h.x, y, width: h.width, height: h.width / 2 };
    });
    await pagina.waitForTimeout(100);
    const png = await pagina.screenshot({ clip: caja, type: 'png' });
    // To WebP in the browser itself: no image package needed.
    const webp = await pagina.evaluate(
      async ({ datos, ancho, alto }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${datos}`;
        await img.decode();
        const lienzo = document.createElement('canvas');
        lienzo.width = ancho;
        lienzo.height = alto;
        const g = lienzo.getContext('2d');
        g.fillStyle = getComputedStyle(document.body).backgroundColor;
        g.fillRect(0, 0, ancho, alto);
        g.drawImage(img, 0, 0, ancho, alto);
        return lienzo.toDataURL('image/webp', 0.82).split(',')[1];
      },
      { datos: png.toString('base64'), ancho: ANCHO, alto: ALTO },
    );
    fs.writeFileSync(path.join(destino, `${c.slug}-${tema}.webp`), Buffer.from(webp, 'base64'));
  }
  console.log(c.slug);
}
await navegador.close();
const total = fs.readdirSync(destino).reduce((n, f) => n + fs.statSync(path.join(destino, f)).size, 0);
console.log(`Listo: ${Math.round(total / 1024)} KB en public/calculadoras.`);
