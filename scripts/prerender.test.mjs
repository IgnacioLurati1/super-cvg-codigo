import { describe, expect, it } from 'vitest';
import { conContenido } from './prerender.mjs';

const HTML = '<html lang="es"><head><title>x</title></head><body><div id="root"></div></body></html>';

describe('contenido en el HTML', () => {
  it('lo pone en #root y marca el movimiento, con su arreglo para quien no corre JavaScript', () => {
    const t = conContenido(HTML, { contenido: '<main><h1>Hola</h1></main>' });
    expect(t).toContain('<div id="root"><main><h1>Hola</h1></main></div>');
    expect(t).toContain('<html lang="es" class="con-movimiento">');
    expect(t).toContain('<noscript>');
  });

  it('un signo $ del contenido no rompe el reemplazo', () => {
    expect(conContenido(HTML, { contenido: '<p>$& $1 cuesta $100</p>' })).toContain('<p>$& $1 cuesta $100</p>');
  });

  it('suma los datos estructurados, y sin movimiento no toca la clase', () => {
    const t = conContenido(HTML, { contenido: 'a', movimiento: false, datos: ['<script type="application/ld+json">{}</script>'] });
    expect(t).toContain('application/ld+json');
    expect(t).not.toContain('con-movimiento');
  });

  it('una página que ya tiene contenido no se vuelve a tocar', () => {
    expect(conContenido(HTML.replace('<div id="root"></div>', '<div id="root"><main></main></div>'), { contenido: 'a' })).toBeNull();
  });
});
