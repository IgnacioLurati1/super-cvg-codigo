// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { textoDeHtml } from './VisorResumen';

// Consultron beside an HTML summary reads its own text when El Santo Resumen gives none.
describe('textoDeHtml', () => {
  it('saca el texto con sus renglones, sin scripts ni estilos', () => {
    const html = '<html><head><style>p{color:red}</style><script>alert(1)</script></head><body>'
      + '<h2>Parte 1</h2><p>Tecnologías de   acceso <b>al usuario</b>.</p><ul><li>ADSL</li><li>Fibra</li></ul>'
      + '<table><tr><td>Medio</td><td>Costo</td></tr></table><svg><text>dibujo</text></svg></body></html>';
    expect(textoDeHtml(html)).toBe('Parte 1\nTecnologías de acceso al usuario.\nADSL\nFibra\nMedio Costo');
  });

  it('un HTML sin texto da vacío', () => {
    expect(textoDeHtml('<html><body><img src="x.png"></body></html>')).toBe('');
  });
});
