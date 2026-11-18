import { describe, expect, it } from 'vitest';
import { sale } from './useSalirSinGuardar';

const ir = (de, a) => sale({ currentLocation: de, nextLocation: a });

describe('salir sin guardar', () => {
  it('frena al ir a otra pantalla o a otra pestaña de la misma', () => {
    expect(ir({ pathname: '/admin/sitio', search: '' }, { pathname: '/admin', search: '' })).toBe(true);
    expect(ir({ pathname: '/admin/sitio', search: '' }, { pathname: '/admin/sitio', search: '?ver=trabajos' })).toBe(true);
  });

  it('no frena si se queda donde está', () => {
    expect(ir({ pathname: '/admin/sitio', search: '?ver=textos' }, { pathname: '/admin/sitio', search: '?ver=textos' })).toBe(false);
  });
});
