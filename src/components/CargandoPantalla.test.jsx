import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CargandoPantalla from './CargandoPantalla';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
  vi.useRealTimers();
});

describe('CargandoPantalla', () => {
  it('shows the bar only while a screen still downloading takes longer than a moment', async () => {
    let llegar;
    const router = createMemoryRouter([
      {
        path: '/',
        element: (<><CargandoPantalla /><Link to="/otra">Otra</Link><Outlet /></>),
        children: [{ path: 'otra', lazy: () => new Promise((r) => { llegar = r; }) }],
      },
    ]);
    caja = document.createElement('div');
    document.body.append(caja);
    raiz = createRoot(caja);
    await act(async () => raiz.render(<RouterProvider router={router} />));
    const barra = () => caja.querySelector('.cargando-pantalla');
    expect(barra()).toBeNull();
    await act(async () => caja.querySelector('a').click());
    await act(async () => vi.advanceTimersByTime(100));
    expect(barra()).toBeNull();
    await act(async () => vi.advanceTimersByTime(100));
    expect(barra()).not.toBeNull();
    await act(async () => llegar({ element: <p>Llegó</p> }));
    expect(barra()).toBeNull();
    expect(caja.textContent).toContain('Llegó');
  });
});
