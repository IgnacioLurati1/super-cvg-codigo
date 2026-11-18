import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentoAislado, NO_ESTA, tieneFormulas, TOPE_ORIGINAL, traerHtml, traerParaLeer, traerPdf, traerVista, urlDeBajar } from './verResumen';

const SERVICIO = 'https://lomhlulbgfovtnljbqzp.supabase.co/functions/v1/utn';
const ID = '0b6f2a8e-1c11-4d0a-9a51-2f6a8b1c0d01';

describe('abrir un resumen del banco acá', () => {
  let pedidos;
  let responder;

  beforeEach(() => {
    pedidos = [];
    responder = () => new Response('', { status: 500 });
    vi.stubGlobal('fetch', vi.fn(async (url, opciones) => {
      pedidos.push({ url, ...opciones });
      if (opciones?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const r = responder(url);
      if (r === 'sin-red') throw new TypeError('Failed to fetch');
      return r;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('un PDF llega como sus bytes, sin cookies ni de dónde viene', async () => {
    responder = () => new Response('%PDF-1.7 hola', { status: 200 });
    const blob = await traerPdf(ID);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(13);
    expect(pedidos[0]).toMatchObject({ url: `${SERVICIO}?a=bajar&id=${ID}`, credentials: 'omit', referrerPolicy: 'no-referrer' });
  });

  it('lo que no empieza como un PDF no se dibuja', async () => {
    responder = () => new Response('<html>no</html>', { status: 200 });
    await expect(traerPdf(ID)).rejects.toMatchObject({ codigo: 'no-pdf', conocido: true });
  });

  it('uno muy grande ni se baja entero', async () => {
    responder = () => new Response('%PDF-', { status: 200, headers: { 'content-length': String(30 * 1024 * 1024) } });
    await expect(traerPdf(ID)).rejects.toMatchObject({ codigo: 'muy-grande' });
  });

  it('un HTML llega como texto y una vista con su texto y si sigue', async () => {
    responder = (url) => (url.includes('a=ver') ? new Response('<p>Hola</p>', { status: 200 }) : new Response(JSON.stringify({ texto: 'Uno\n\nDos', cortado: true }), { status: 200 }));
    expect(await traerHtml(ID)).toBe('<p>Hola</p>');
    expect(await traerVista(ID)).toEqual({ texto: 'Uno\n\nDos', cortado: true });
    expect(pedidos.map((p) => p.url)).toEqual([`${SERVICIO}?a=ver&id=${ID}`, `${SERVICIO}?a=vista&id=${ID}`]);
  });

  it('uno que ya no está, sin internet o sin respuesta lo dice; un id con otra forma ni se pide', async () => {
    responder = () => new Response('', { status: 404 });
    await expect(traerHtml(ID)).rejects.toThrow(NO_ESTA);
    responder = () => 'sin-red';
    await expect(traerVista(ID)).rejects.toMatchObject({ codigo: 'red' });
    responder = () => new Response('{"texto":3}', { status: 200 });
    await expect(traerVista(ID)).rejects.toMatchObject({ codigo: 'servicio' });
    const antes = pedidos.length;
    await expect(traerPdf('../x')).rejects.toThrow(NO_ESTA);
    expect(pedidos).toHaveLength(antes);
    expect(urlDeBajar('../x')).toBeNull();
    expect(urlDeBajar(ID)).toBe(`${SERVICIO}?a=bajar&id=${ID}`);
  });

  it('cerrar el visor corta la descarga, y un corte no se toma como falta de internet', async () => {
    const control = new AbortController();
    control.abort();
    await expect(traerPdf(ID, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(pedidos[0].signal).toBe(control.signal);
    await expect(traerParaLeer(ID, true, control.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(pedidos).toHaveLength(2);
  });
});

describe('un HTML con sus scripts va al lector, si El Santo Resumen dice que andan', () => {
  let pedidos;

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const servir = (original) => {
    pedidos = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      pedidos.push(url);
      if (!url.includes('&js=1')) return new Response('<p onclick="robar()">Limpio \\(x\\)</p>', { status: 200 });
      if (original === 'sin-red') throw new TypeError('Failed to fetch');
      return original;
    }));
  };

  it('con scripts prendidos llega el original, tal cual, en un solo pedido', async () => {
    servir(new Response('<script>armar()</script><div id="app"></div>', { status: 200 }));
    expect(await traerParaLeer(ID, true)).toEqual({ scripts: true, html: '<script>armar()</script><div id="app"></div>' });
    expect(pedidos).toEqual([`${SERVICIO}?a=ver&id=${ID}&js=1`]);
  });

  it('un original grande, como una simulación de 5 MB, llega entero hasta el tope del lector', async () => {
    const grande = `<script>armar()</script>${'x'.repeat(5_000_000)}`;
    servir(new Response(grande, { status: 200 }));
    expect(await traerParaLeer(ID, true)).toEqual({ scripts: true, html: grande });
    servir(new Response('x'.repeat(TOPE_ORIGINAL + 1), { status: 200 }));
    expect(await traerParaLeer(ID, true)).toMatchObject({ scripts: false });
  });

  it('sin scripts prendidos ni se pide el original: la copia limpia, sin nada que corra', async () => {
    servir(new Response('<script>armar()</script>', { status: 200 }));
    const leido = await traerParaLeer(ID, false);
    expect(pedidos).toEqual([`${SERVICIO}?a=ver&id=${ID}`]);
    expect(leido).toMatchObject({ scripts: false, formulas: true });
    expect(leido.documento).toContain('Limpio');
    expect(leido.documento).not.toContain('robar');
  });

  it('si allá ya no andan (404) o el pedido falla, sigue con la copia limpia', async () => {
    for (const original of [new Response('{"error":"sin-js"}', { status: 404 }), 'sin-red', new Response('', { status: 503 })]) {
      servir(original);
      expect(await traerParaLeer(ID, true)).toMatchObject({ scripts: false });
      expect(pedidos).toEqual([`${SERVICIO}?a=ver&id=${ID}&js=1`, `${SERVICIO}?a=ver&id=${ID}`]);
    }
  });
});

describe('el HTML va a un marco sin nada que corra', () => {
  const html = `<html><head><script>robar()</script><base href="https://malo.com/"><meta http-equiv="refresh" content="0;url=https://malo.com"></head>
    <body onload="robar()"><img src="x" onerror="robar()"><a href="#parte-2" onclick="robar()">Ir</a> <a href="https://utn.edu.ar">UTN</a> <a href="javascript:robar()">malo</a>
    <iframe src="https://malo.com"></iframe><form action="https://malo.com"><input></form><object data="x"></object><h2 id="parte-2">Parte 2</h2></body></html>`;

  it('saca scripts, marcos, formularios y redirecciones, y arregla los enlaces', () => {
    const doc = new DOMParser().parseFromString(documentoAislado(html), 'text/html');
    expect(doc.querySelectorAll('script, base, iframe, form, object, meta[http-equiv]')).toHaveLength(0);
    expect(doc.querySelectorAll('[onclick], [onerror], [onload]')).toHaveLength(0);
    const [ancla, afuera, malo] = doc.querySelectorAll('a');
    expect(ancla.getAttribute('href')).toBe('about:srcdoc#parte-2');
    expect(afuera.getAttribute('target')).toBe('_blank');
    expect(afuera.getAttribute('rel')).toBe('noopener noreferrer');
    expect(malo.hasAttribute('href')).toBe(false);
    expect(doc.querySelector('meta[name="referrer"]').content).toBe('no-referrer');
    expect(doc.querySelector('h2').textContent).toBe('Parte 2');
  });

  it('sin dibujos ni fórmulas, y un enlace no abre en otro lado ni va a otra dirección que la suya', () => {
    const doc = new DOMParser().parseFromString(documentoAislado(`<p>
      <svg><a xlink:href="https://malo.com" target="_blank"><text>dibujo</text></a></svg><math><mi>x</mi></math>
      <a target="_top" href="https://utn.edu.ar">UTN</a>
      <a target="_blank"><animate attributeName="href" values="https://malo.com">sin dirección</a>
      <a href="#parte" target="_top">Parte</a> <span xlink:href="https://malo.com" target="_top">suelto</span></p>`), 'text/html');
    expect(doc.querySelectorAll('svg, math')).toHaveLength(0);
    expect(doc.body.textContent).not.toMatch(/dibujo/);
    const [utn, sinDireccion, parte] = doc.querySelectorAll('a');
    expect(utn.getAttribute('target')).toBe('_blank');
    expect(utn.getAttribute('rel')).toBe('noopener noreferrer');
    expect(sinDireccion.hasAttribute('target')).toBe(false);
    expect(sinDireccion.hasAttribute('href')).toBe(false);
    expect(parte.hasAttribute('target')).toBe(false);
    const sueltos = [...doc.querySelectorAll('*')].flatMap((el) => [...el.attributes].map((a) => a.name)).filter((n) => n === 'xlink:href' || n === 'target');
    expect(sueltos).toEqual(['target']);
  });

  it('la política de la copia limpia queda; cualquier otra orden a la página, no', () => {
    const doc = new DOMParser().parseFromString(documentoAislado(`<html><head>
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:">
      <meta http-equiv="refresh" content="0;url=https://malo.com"><meta http-equiv="set-cookie" content="a=b">
      <meta name="referrer" content="unsafe-url"><meta name="viewport" content="width=device-width"></head><body><p>Hola</p></body></html>`), 'text/html');
    expect([...doc.querySelectorAll('meta[http-equiv]')].map((m) => m.getAttribute('http-equiv'))).toEqual(['Content-Security-Policy']);
    expect([...doc.querySelectorAll('meta[name="referrer"]')].map((m) => m.content)).toEqual(['no-referrer']);
    expect(doc.querySelector('meta[name="viewport"]')).not.toBeNull();
  });

  it('uno con modo noche propio dice que sigue el tema; uno sin él o que ya lo dice, queda como está', () => {
    const esquema = (html) => [...new DOMParser().parseFromString(documentoAislado(html), 'text/html').querySelectorAll('meta[name="color-scheme"]')].map((m) => m.content);
    expect(esquema('<style>@media (prefers-color-scheme: dark) { body { background: #111 } }</style><p>Hola</p>')).toEqual(['light dark']);
    expect(esquema('<style>body { color: light-dark(#000, #eee) }</style><p>Hola</p>')).toEqual(['light dark']);
    expect(esquema('<style>body { background: #fff }</style><p>Hola</p>')).toEqual([]);
    expect(esquema('<head><meta name="color-scheme" content="dark"><style>@media (prefers-color-scheme: dark) {}</style></head><p>Hola</p>')).toEqual(['dark']);
  });

  it('sabe si trae fórmulas para dibujar', () => {
    expect(tieneFormulas('<p>\\(x^2\\)</p>')).toBe(true);
    expect(tieneFormulas('<p>$$x$$</p>')).toBe(true);
    expect(tieneFormulas('<p>cuesta $3</p>')).toBe(false);
  });
});
