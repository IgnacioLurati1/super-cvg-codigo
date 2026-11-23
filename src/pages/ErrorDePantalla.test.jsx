import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorDePantalla from './ErrorDePantalla';

vi.mock('../lib/seo', () => ({ tituloDe: (t) => t, useSeo: () => {} }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
  vi.restoreAllMocks();
});

async function mostrar(error, enLinea) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(enLinea);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const router = createMemoryRouter([{ path: '/', lazy: () => Promise.reject(error), errorElement: <ErrorDePantalla /> }]);
  caja = document.body.appendChild(document.createElement('div'));
  raiz = createRoot(caja);
  await act(async () => raiz.render(<RouterProvider router={router} />));
  return caja.textContent;
}

describe('ErrorDePantalla', () => {
  // A screen the service worker never kept fails on its CSS before its JavaScript (Vite's preload): the same case.
  it('without internet, a screen whose CSS was not kept says it was not saved here', async () => {
    const texto = await mostrar(new Error('Unable to preload CSS for /assets/Laboratorio-a1.css'), false);
    expect(texto).toContain('Sin internet');
    expect(texto).toContain('Esta pantalla no quedó guardada en este dispositivo.');
  });

  it('with internet, the same failure is a new version', async () => {
    expect(await mostrar(new Error('Unable to preload CSS for /assets/Laboratorio-a1.css'), true)).toContain('Super CVG se actualizó');
    act(() => raiz.unmount());
    caja.remove();
    expect(await mostrar(new TypeError('Failed to fetch dynamically imported module: /assets/Laboratorio-a1.js'), false)).toContain('Sin internet');
  });
});
