import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import Imagen from './Imagen';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('foto con miniatura', () => {
  let raiz;
  afterEach(() => act(() => raiz.unmount()));

  const pintar = (props) => {
    const lugar = document.createElement('div');
    raiz = createRoot(lugar);
    act(() => raiz.render(<Imagen alt="Una foto" {...props} />));
    return lugar;
  };

  it('muestra la miniatura mientras baja y la grande se funde al cargar', () => {
    const lugar = pintar({ src: 'grande.webp', previa: 'data:image/webp;base64,AAAA' });
    const fotos = [...lugar.querySelectorAll('img')];
    expect(fotos.map((f) => f.getAttribute('src'))).toEqual(['data:image/webp;base64,AAAA', 'grande.webp']);
    expect(lugar.firstChild.dataset.estado).toBe('cargando');
    act(() => fotos[1].dispatchEvent(new Event('load')));
    expect(lugar.firstChild.dataset.estado).toBe('lista');
  });

  it('si la foto falla queda el respaldo', () => {
    const lugar = pintar({ src: 'rota.webp', respaldo: <span>Sin foto</span> });
    act(() => lugar.querySelector('img').dispatchEvent(new Event('error')));
    expect(lugar.textContent).toContain('Sin foto');
  });
});
