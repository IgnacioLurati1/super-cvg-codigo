import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAdelantar } from '../lib/ahorro';
import { cambiarAjustes } from '../lib/ajustes';
import Entrada from '../pages/Entrada';
import Cuaderno3D from './cuaderno3d/Cuaderno3D';
import Entrada3D from './entrada3d/Entrada3D';
import HojaResumen from './HojaResumen';
import { PreviaProvider } from './Previa';

// Every place that saves data, on screen: with «Siempre» nothing downloads that the student didn't ask for, with «Nunca»
// it does as before.

// A device that can draw the 3D (jsdom has no WebGL): only the data saver decides.
vi.mock('./cuaderno3d/soporte', async (original) => ({ ...(await original()), puede3D: () => true }));
// The entrance's scene without three.js: drawn at once.
vi.mock('./entrada3d/escena.js', () => ({
  describirEscena: () => ({}),
  crearEscena: () => ({
    lienzo: document.createElement('canvas'),
    preparar: async () => {},
    dibujar() {}, visible() {}, quieto() {}, noche() {}, destruir() {}, foto() {},
  }),
}));
// Whether what is observed comes into view at once (the scene of /entrada loads then).
let enVista = false;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  globalThis.IntersectionObserver = class {
    constructor(avisar) {
      this.avisar = avisar;
    }
    observe() {
      if (enVista) this.avisar([{ isIntersecting: true }]);
    }
    disconnect() {}
  };
  window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
});

let raiz;
afterEach(() => {
  act(() => raiz?.unmount());
  raiz = null;
  cambiarAjustes({ ahorro: 'auto' });
  enVista = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function pintar(elemento) {
  const lugar = document.createElement('div');
  document.body.append(lugar);
  raiz = createRoot(lugar);
  act(() => raiz.render(<MemoryRouter>{elemento}</MemoryRouter>));
  return lugar;
}

describe('useAdelantar', () => {
  function Prueba({ adelantar, cuando, clave }) {
    useAdelantar(adelantar, cuando, clave);
    return null;
  }

  it('ahorrando no corre; al apagar el ahorro, sí, y otra vez con otra clave', () => {
    cambiarAjustes({ ahorro: 'siempre' });
    const adelantar = vi.fn();
    pintar(<Prueba adelantar={adelantar} cuando clave="python" />);
    expect(adelantar).not.toHaveBeenCalled();
    act(() => cambiarAjustes({ ahorro: 'nunca' }));
    expect(adelantar).toHaveBeenCalledTimes(1);
    act(() => raiz.render(<MemoryRouter><Prueba adelantar={adelantar} cuando clave="c" /></MemoryRouter>));
    expect(adelantar).toHaveBeenCalledTimes(2);
  });

  it('sin `cuando`, tampoco', () => {
    cambiarAjustes({ ahorro: 'nunca' });
    const adelantar = vi.fn();
    pintar(<Prueba adelantar={adelantar} cuando={false} />);
    expect(adelantar).not.toHaveBeenCalled();
  });
});

describe('la hoja de la vista previa', () => {
  const ociosa = () => {
    const pedir = vi.fn(() => 1);
    vi.stubGlobal('requestIdleCallback', pedir);
    vi.stubGlobal('cancelIdleCallback', () => {});
    return pedir;
  };
  it('ahorrando no se baja de antemano', () => {
    const pedir = ociosa();
    cambiarAjustes({ ahorro: 'siempre' });
    pintar(<PreviaProvider>hola</PreviaProvider>);
    expect(pedir).not.toHaveBeenCalled();
  });

  it('sin ahorro se baja cuando la página está quieta', () => {
    const pedir = ociosa();
    cambiarAjustes({ ahorro: 'nunca' });
    pintar(<PreviaProvider>hola</PreviaProvider>);
    expect(pedir).toHaveBeenCalledTimes(1);
  });
});

describe('la foto de la tarjeta de un resumen', () => {
  const foto = { url: 'https://ejemplo/foto.webp', ancho: 400, alto: 560 };

  it('ahorrando queda la carátula, sin pedir la foto', () => {
    cambiarAjustes({ ahorro: 'siempre' });
    const lugar = pintar(<HojaResumen foto={foto} titulo="Parcial 1" materia="Física I" />);
    expect(lugar.querySelector('img')).toBeNull();
    expect(lugar.querySelector('.hoja').dataset.forma).toBe('caratula');
    expect(lugar.textContent).toContain('Parcial 1');
  });

  it('sin ahorro, la foto', () => {
    cambiarAjustes({ ahorro: 'nunca' });
    const lugar = pintar(<HojaResumen foto={foto} titulo="Parcial 1" materia="Física I" />);
    expect(lugar.querySelector('img').getAttribute('src')).toBe(foto.url);
  });
});

describe('la facu en 3D', () => {
  it('detrás del ingreso y en el cuaderno, ahorrando no aparece', () => {
    cambiarAjustes({ ahorro: 'siempre' });
    const lugar = pintar(<><Entrada3D modo="fondo" /><Cuaderno3D /></>);
    expect(lugar.querySelector('.entrada3d, .cuaderno3d')).toBeNull();
    act(() => cambiarAjustes({ ahorro: 'nunca' }));
    expect(lugar.querySelector('.entrada3d')).not.toBeNull();
  });

  it('en su pantalla, ahorrando espera al botón', () => {
    cambiarAjustes({ ahorro: 'siempre' });
    const lugar = pintar(<Entrada />);
    expect(lugar.querySelector('.entrada3d')).toBeNull();
    expect(lugar.textContent).toContain('Para ahorrar datos no se carga sola.');
    const boton = [...lugar.querySelectorAll('button')].find((b) => b.textContent === 'Cargarla');
    boton.focus();
    act(() => boton.click());
    expect(lugar.querySelector('.entrada3d')).not.toBeNull();
    // While it downloads: the same button, busy, with the focus.
    expect(boton.textContent).toBe('Cargando…');
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(lugar.querySelector('.facu3d__cartel').getAttribute('aria-busy')).toBe('true');
    expect(document.activeElement).toBe(boton);
    act(() => boton.click());
    expect(boton.textContent).toBe('Cargando…');
  });

  it('en su pantalla, al terminar de cargar el foco va a la escena', async () => {
    cambiarAjustes({ ahorro: 'siempre' });
    enVista = true;
    const lugar = pintar(<Entrada />);
    const boton = [...lugar.querySelectorAll('button')].find((b) => b.textContent === 'Cargarla');
    boton.focus();
    act(() => boton.click());
    await act(() => new Promise((listo) => setTimeout(listo, 50)));
    expect(lugar.querySelector('.entrada3d--lista')).not.toBeNull();
    expect(lugar.querySelector('.facu3d__cartel').hasAttribute('aria-busy')).toBe(false);
    expect(document.activeElement.textContent).toBe('Verla de frente');
  });

  it('en su pantalla, sin ahorro se carga sola', () => {
    cambiarAjustes({ ahorro: 'nunca' });
    const lugar = pintar(<Entrada />);
    expect(lugar.querySelector('.entrada3d')).not.toBeNull();
    expect(lugar.textContent).not.toContain('Cargarla');
  });
});
