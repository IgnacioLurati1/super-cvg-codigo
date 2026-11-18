import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Pasos from './Pasos';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('barra de pasos', () => {
  let raiz;
  afterEach(() => act(() => raiz.unmount()));

  it('deja volver a un paso hecho y no adelantarse', () => {
    const lugar = document.createElement('div');
    raiz = createRoot(lugar);
    const alElegir = vi.fn();
    act(() => raiz.render(<Pasos pasos={['Datos', 'Pedido', 'Revisar']} actual={1} alElegir={alElegir} />));

    const botones = lugar.querySelectorAll('button');
    expect(botones).toHaveLength(1);
    expect(botones[0].textContent).toBe('Datos');
    act(() => botones[0].click());
    expect(alElegir).toHaveBeenCalledWith(0);
    expect(lugar.querySelector('[aria-current="step"]').textContent).toBe('Pedido');
  });
});
