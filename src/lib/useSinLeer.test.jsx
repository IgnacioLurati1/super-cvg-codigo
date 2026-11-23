import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The campus of every tab, counted together.
const campus = vi.hoisted(() => ({ mensajes: 0, notificaciones: 0 }));
vi.mock('./campus', () => ({
  contarSinLeer: vi.fn(async () => {
    campus.mensajes += 1;
    return 3;
  }),
  contarNotificaciones: vi.fn(async () => {
    campus.notificaciones += 1;
    return 0;
  }),
  cargarNotificaciones: vi.fn(async () => []),
}));

// navigator.locks as the browser does it: one holder per name, the rest in line, and a line left with `signal`.
function cerrojos() {
  const filas = new Map();
  const correr = async (nombre) => {
    const fila = filas.get(nombre);
    const primero = fila[0];
    if (!primero) return;
    try {
      primero.ok(await primero.fn());
    } catch (error) {
      primero.mal(error);
    }
    fila.shift();
    correr(nombre);
  };
  return {
    request(nombre, opciones, fn) {
      return new Promise((ok, mal) => {
        const fila = filas.get(nombre) ?? [];
        filas.set(nombre, fila);
        const pedido = { fn, ok, mal };
        opciones.signal?.addEventListener('abort', () => {
          const i = fila.indexOf(pedido);
          if (i > 0) {
            fila.splice(i, 1);
            mal(new DOMException('Abortado', 'AbortError'));
          }
        });
        fila.push(pedido);
        if (fila.length === 1) correr(nombre);
      });
    },
  };
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const raices = [];

// A tab: its own copy of Super CVG's modules, as a browser tab has, under the same key.
async function abrirPestana() {
  vi.resetModules();
  const { useSinLeer } = await import('./useSinLeer');
  const caja = document.createElement('div');
  const raiz = createRoot(caja);
  raices.push(raiz);
  function Sobre() {
    return <p>{useSinLeer('k')}</p>;
  }
  await act(async () => raiz.render(<Sobre />));
  return caja;
}

beforeEach(() => {
  campus.mensajes = 0;
  campus.notificaciones = 0;
  sessionStorage.setItem('cl.sesion', 'k');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
afterEach(async () => {
  await act(async () => raices.splice(0).forEach((r) => r.unmount()));
  sessionStorage.clear();
  delete navigator.locks;
});

describe('useSinLeer', () => {
  it('two tabs of the session: one clock, one ask, the same number in both', async () => {
    Object.defineProperty(navigator, 'locks', { value: cerrojos(), configurable: true });
    const a = await abrirPestana();
    await act(() => esperar(500));
    const b = await abrirPestana();
    await act(() => esperar(500));
    expect(campus.mensajes).toBe(1);
    expect(campus.notificaciones).toBe(1);
    expect(a.textContent).toBe('3');
    expect(b.textContent).toBe('3');
  });

  it('without locks, a tab asks on its own as always', async () => {
    const a = await abrirPestana();
    await act(() => esperar(500));
    expect(campus.mensajes).toBe(1);
    expect(a.textContent).toBe('3');
  });
});
