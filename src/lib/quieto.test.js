import { describe, expect, it } from 'vitest';
import { acomodarResumen, anchoDelResumen, anchoTope } from './quieto';

describe('la página quieta al abrir una columna al costado', () => {
  it('el tope de una página sale del max-width en píxeles, con su relleno si no es border-box', () => {
    expect(anchoTope({ maxWidth: '800px', boxSizing: 'border-box', paddingLeft: '20px', paddingRight: '20px' })).toBe(800);
    expect(anchoTope({ maxWidth: '800px', boxSizing: 'content-box', paddingLeft: '20px', paddingRight: '20px', borderLeftWidth: '1px', borderRightWidth: '1px' })).toBe(842);
    expect(anchoTope({ maxWidth: 'none' })).toBeNull();
    expect(anchoTope({ maxWidth: '90%' })).toBeNull();
  });

  // A frame 1540 wide that was 1920 before Consultron (380) opened; what's in view ends at 1524.
  const marco = { completo: 1920, propio: 1540, limite: 1524 };

  it('un resumen que termina antes de Consultron queda como estaba', () => {
    // An index on the left and a column centered in the rest, ending at 1500: nothing to do.
    const indice = (ancho) => 296 + (ancho - 296 + 784) / 2;
    expect(anchoDelResumen({ ...marco, borde: indice })).toBe(1920);
  });

  it('si Consultron lo taparía, se corre lo justo, centrado o de punta a punta', () => {
    // A centered column 1240 wide: at 1920 it ends at 1580, 56 too far. Half of each pixel less moves it.
    const centrado = (ancho) => (ancho + 1240) / 2;
    const ancho = anchoDelResumen({ ...marco, borde: centrado });
    expect(centrado(ancho)).toBeLessThanOrEqual(marco.limite + 0.5);
    expect(centrado(ancho)).toBeGreaterThan(marco.limite - 2);
    // Text across the whole width, 20 from the edge: only the frame's own width keeps it in view.
    expect(anchoDelResumen({ ...marco, borde: (a) => a - 20 })).toBe(1544);
    expect(anchoDelResumen({ ...marco, borde: (a) => a - 10 })).toBeNull();
  });

  it('sin Consultron, el resumen queda como vino', () => {
    document.documentElement.style.setProperty('width', '2000px', 'important');
    expect(acomodarResumen(document, 0)).toBeNull();
    expect(document.documentElement.style.width).toBe('');
    expect(document.documentElement.style.overflowX).toBe('');
  });
});
