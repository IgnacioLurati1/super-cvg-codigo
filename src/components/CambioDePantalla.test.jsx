import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import CambioDePantalla from './CambioDePantalla';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let raiz;
let caja;
afterEach(() => {
  act(() => raiz?.unmount());
  caja?.remove();
  window.scrollTo = undefined;
});

const cuadro = () => new Promise((r) => requestAnimationFrame(() => r()));

// A home screen with a link, and another screen that comes apart and arrives when `llegar` is called. Outside the
// screens, a field that stays (as Consultron's box does).
async function armar() {
  window.scrollTo = () => {};
  let llegar;
  const descarga = new Promise((r) => { llegar = r; });
  const Otra = () => <main><h1>Otra</h1></main>;
  const router = createMemoryRouter([{
    element: <><CambioDePantalla /><input aria-label="Aparte" /><Outlet /></>,
    children: [
      { path: '/', element: <main><a href="/otra">Ir</a></main> },
      { path: '/otra', lazy: async () => { await descarga; return { Component: Otra }; } },
    ],
  }]);
  caja = document.body.appendChild(document.createElement('div'));
  raiz = createRoot(caja);
  await act(async () => raiz.render(<RouterProvider router={router} />));
  // The student already touched the page: from now on a new screen takes the focus.
  window.dispatchEvent(new Event('pointerdown'));
  caja.querySelector('a').focus();
  let ida;
  await act(async () => { ida = router.navigate('/otra'); });
  return {
    campo: caja.querySelector('input'),
    llegar: async () => {
      await act(async () => {
        llegar();
        await ida;
      });
      await act(cuadro);
      await act(cuadro);
    },
  };
}

describe('CambioDePantalla', () => {
  it('a screen that arrives later takes the focus to its <main>', async () => {
    const { llegar } = await armar();
    await llegar();
    expect(document.activeElement).toBe(caja.querySelector('main'));
  });

  it('if the student put the focus somewhere else while the screen downloaded, it stays there', async () => {
    const { campo, llegar } = await armar();
    campo.focus();
    await llegar();
    expect(caja.querySelector('h1').textContent).toBe('Otra');
    expect(document.activeElement).toBe(campo);
  });
});
