import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fijarUsuario, materiaDe, mioActual } from '../lib/mio';
import { Anotaciones } from './MisCosas';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// What the student types, the way the browser tells React.
function escribir(area, texto) {
  const poner = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    poner.call(area, texto);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('anotaciones que llegan de otro dispositivo', () => {
  let raiz;
  let lugar;
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    fijarUsuario(5);
    lugar = document.createElement('div');
    raiz = createRoot(lugar);
  });
  afterEach(() => {
    act(() => raiz.unmount());
    vi.useRealTimers();
    fijarUsuario(null);
    localStorage.clear();
  });

  it('si llega una mientras escribís, al guardar quedan las dos', () => {
    act(() => raiz.render(<Anotaciones materiaId={7} nota="Base" />));
    const area = lugar.querySelector('textarea');
    escribir(area, 'Base y lo mío');
    // The copy in Drive brings another version while the student is still typing.
    act(() => raiz.render(<Anotaciones materiaId={7} nota="Llegó del celu" />));
    expect(area.value).toBe('Base y lo mío');
    act(() => vi.advanceTimersByTime(600));
    expect(materiaDe(mioActual(), 7).nota).toBe('Base y lo mío\n\nLlegó del celu');
    expect(area.value).toBe('Base y lo mío\n\nLlegó del celu');
  });

  it('si llega sin que estés escribiendo, se ve y se guarda tal cual lo que sigue', () => {
    act(() => raiz.render(<Anotaciones materiaId={7} nota="Base" />));
    const area = lugar.querySelector('textarea');
    act(() => raiz.render(<Anotaciones materiaId={7} nota="Llegó del celu" />));
    expect(area.value).toBe('Llegó del celu');
    escribir(area, 'Llegó del celu y sigo');
    act(() => vi.advanceTimersByTime(600));
    expect(materiaDe(mioActual(), 7).nota).toBe('Llegó del celu y sigo');
  });
});
