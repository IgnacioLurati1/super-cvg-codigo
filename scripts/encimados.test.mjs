// @vitest-environment node
import { chromium } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buscarEncimados } from './encimados.mjs';
import { buscarChrome, opcionesNavegador } from './navegador.mjs';

const exe = buscarChrome();

// Each case is a tiny page with one thing that fits or one that doesn't.
const pagina = (cuerpo) => `<!doctype html><html lang="es"><head><style>
  body { margin: 0; font: 16px/1.4 sans-serif; width: 600px; }
  .boton { display: inline-block; width: 60px; padding: 4px; border: 1px solid; white-space: nowrap; }
  .caja { width: 80px; height: 22px; overflow: hidden; white-space: nowrap; }
  .solo-lectores { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style></head><body>${cuerpo}</body></html>`;

describe.skipIf(!exe)('chequeo de texto cortado o encimado', () => {
  let navegador;
  let p;
  beforeAll(async () => {
    navegador = await chromium.launch(opcionesNavegador(exe));
    p = await navegador.newPage({ viewport: { width: 600, height: 400 } });
  }, 30_000);
  afterAll(() => navegador?.close());

  const revisar = async (cuerpo, opciones) => {
    await p.setContent(pagina(cuerpo));
    return buscarEncimados(p, opciones);
  };

  it('no marca lo que entra, lo cortado a propósito ni lo escondido', async () => {
    expect(await revisar(`
      <h1>Título que entra</h1>
      <p>Un párrafo cualquiera.</p>
      <a class="boton" href="#">Ir</a> <button>Otro</button>
      <p class="caja" style="text-overflow: ellipsis">Un texto larguísimo que termina en puntos suspensivos</p>
      <p class="caja" style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1; white-space: normal">Dos renglones como máximo y el resto se esconde a propósito</p>
      <div style="width: 100px; overflow-x: auto"><p style="width: 300px">Una tabla ancha que se desplaza de costado</p></div>
      <span class="solo-lectores">Solo para lectores de pantalla</span>
      <details><summary>Abrir</summary><p style="position: absolute; top: 0">Encima, pero cerrado</p></details>
      <div style="position: fixed; top: 0; left: 0">Flota a propósito</div>
    `)).toEqual([]);
  });

  it('marca el texto que se sale de su botón', async () => {
    const r = await revisar('<a class="boton" href="#">Un botón con mucho texto</a>');
    expect(r.some((x) => x.startsWith('se sale de su caja') && x.includes('Un botón'))).toBe(true);
  });

  it('marca el texto cortado por su caja', async () => {
    const r = await revisar('<p class="caja">Un texto que no entra en la caja</p>');
    expect(r.some((x) => x.startsWith('cortado'))).toBe(true);
  });

  it('marca dos textos uno encima del otro y dos controles que se pisan', async () => {
    const r = await revisar(`
      <div style="position: relative; height: 60px">
        <p style="position: absolute; top: 0; margin: 0">Primero</p><p style="position: absolute; top: 4px; left: 10px; margin: 0">Segundo</p>
      </div>
      <div style="display: flex"><button style="width: 120px">Uno</button><button style="width: 120px; margin-left: -40px">Dos</button></div>
    `);
    expect(r.some((x) => x.startsWith('encimados') && x.includes('Primero') && x.includes('Segundo'))).toBe(true);
    expect(r.some((x) => x.startsWith('encimados') && x.includes('Uno') && x.includes('Dos'))).toBe(true);
  });

  it('marca lo que se sale de la pantalla y respeta lo que se pide ignorar', async () => {
    const cuerpo = '<p style="white-space: nowrap; margin-left: 500px" class="largo">Este renglón sigue de largo más allá del borde</p>';
    expect((await revisar(cuerpo)).some((x) => x.startsWith('se sale de la pantalla'))).toBe(true);
    expect(await revisar(cuerpo, { ignorar: ['.largo'] })).toEqual([]);
  });
});
