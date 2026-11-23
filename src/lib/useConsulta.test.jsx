import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { conCache, iniciarSesion } from './sesion';
import { useConsulta } from './useConsulta';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const vistos = [];
function Pantalla({ fn, alInstante }) {
  const { datos, cargando } = useConsulta(fn, [], { alInstante });
  vistos.push({ datos, cargando });
  return <p>{datos ?? 'cargando'}</p>;
}

let raiz;
let caja;
beforeEach(() => {
  vistos.length = 0;
  iniciarSesion('k');
  caja = document.createElement('div');
  raiz = createRoot(caja);
});
afterEach(() => act(() => raiz.unmount()));

// The campus answers when the test says.
function campus() {
  let responder;
  const fn = vi.fn(() => new Promise((ok) => { responder = ok; }));
  return { fn, responder: (v) => responder(v) };
}

describe('useConsulta alInstante', () => {
  it('shows what was kept while it asks, then the fresh answer, asking once', async () => {
    await conCache('materias', 0, async () => 'lo guardado');
    const { fn, responder } = campus();
    await act(async () => raiz.render(<Pantalla alInstante fn={() => conCache('materias', 0, fn)} />));
    await vi.waitFor(() => expect(caja.textContent).toBe('lo guardado'));
    expect(vistos.at(-1).cargando).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    await act(async () => responder('lo nuevo'));
    expect(caja.textContent).toBe('lo nuevo');
    expect(vistos.at(-1).cargando).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('without it, waits for the campus as always', async () => {
    await conCache('materias', 0, async () => 'lo guardado');
    const { fn, responder } = campus();
    await act(async () => raiz.render(<Pantalla fn={() => conCache('materias', 0, fn)} />));
    await act(() => new Promise((ok) => setTimeout(ok, 20)));
    expect(caja.textContent).toBe('cargando');
    await act(async () => responder('lo nuevo'));
    expect(caja.textContent).toBe('lo nuevo');
  });
});
