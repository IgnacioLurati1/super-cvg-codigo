import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const CHROME_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

// What Chrome hands over: an event that waits, with the browser's window and the student's answer.
function ofrecer(outcome = 'accepted') {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = vi.fn(() => Promise.resolve());
  e.userChoice = Promise.resolve({ outcome, platform: 'web' });
  window.dispatchEvent(e);
  return e;
}

let m;
let parar;
let enVentana;
let cambioDeModo;

beforeEach(async () => {
  enVentana = false;
  cambioDeModo = null;
  window.matchMedia = vi.fn((q) => ({
    matches: q === '(display-mode: standalone)' && enVentana,
    addEventListener: (_, f) => { cambioDeModo = f; },
    removeEventListener: () => { cambioDeModo = null; },
  }));
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID);
  vi.resetModules();
  m = await import('./instalar.js');
  parar = m.escucharInstalacion();
});

afterEach(() => {
  parar();
  delete window.matchMedia;
  delete navigator.standalone;
  vi.restoreAllMocks();
});

describe('instalar Super CVG', () => {
  it('sin oferta del navegador, y fuera de Safari en iPhone, no hay nada que mostrar', () => {
    expect(m.comoInstalar()).toBe(null);
  });

  it('guarda la oferta, frena el cartel del navegador y avisa a quien mira', () => {
    const visto = vi.fn();
    m.suscribirInstalacion(visto);
    const e = ofrecer();
    expect(e.defaultPrevented).toBe(true);
    expect(m.comoInstalar()).toBe('boton');
    expect(visto).toHaveBeenCalled();
  });

  it('el botón abre la instalación del navegador una vez, y aceptada ya no aparece', async () => {
    const e = ofrecer('accepted');
    expect(await m.instalar()).toBe(true);
    expect(e.prompt).toHaveBeenCalledTimes(1);
    expect(m.comoInstalar()).toBe(null);
    expect(await m.instalar()).toBe(false);
    expect(e.prompt).toHaveBeenCalledTimes(1);
  });

  it('si la cancela, la oferta ya está usada hasta que el navegador la vuelva a dar', async () => {
    ofrecer('dismissed');
    expect(await m.instalar()).toBe(false);
    expect(m.comoInstalar()).toBe(null);
    ofrecer();
    expect(m.comoInstalar()).toBe('boton');
  });

  it('una instalación que falla no queda colgada', async () => {
    const e = ofrecer();
    e.prompt.mockRejectedValueOnce(new Error('no'));
    expect(await m.instalar()).toBe(false);
    expect(m.comoInstalar()).toBe(null);
  });

  it('instalada desde el menú del navegador, el botón se va', () => {
    ofrecer();
    window.dispatchEvent(new Event('appinstalled'));
    expect(m.comoInstalar()).toBe(null);
  });

  it('abierta como app (display-mode: standalone) no se ofrece, y avisa cuando cambia', () => {
    ofrecer();
    const visto = vi.fn();
    m.suscribirInstalacion(visto);
    enVentana = true;
    cambioDeModo();
    expect(visto).toHaveBeenCalled();
    expect(m.comoInstalar()).toBe(null);
    enVentana = false;
    expect(m.comoInstalar()).toBe('boton');
  });

  it('en Safari de iPhone y iPad dice cómo se hace a mano, salvo abierta desde el inicio', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE);
    expect(m.comoInstalar()).toBe('ios');
    navigator.standalone = true;
    expect(m.comoInstalar()).toBe(null);
  });

  it('reconoce a Safari en iPhone y en iPad, y deja afuera a los demás', () => {
    expect(m.esSafariDeIos({ userAgent: IPHONE, maxTouchPoints: 5 })).toBe(true);
    expect(m.esSafariDeIos({ userAgent: IPAD, maxTouchPoints: 5 })).toBe(true);
    // The same text on a Mac, without a touch screen.
    expect(m.esSafariDeIos({ userAgent: IPAD, maxTouchPoints: 0 })).toBe(false);
    expect(m.esSafariDeIos({ userAgent: CHROME_IPHONE, maxTouchPoints: 5 })).toBe(false);
    expect(m.esSafariDeIos({ userAgent: INSTAGRAM, maxTouchPoints: 5 })).toBe(false);
    expect(m.esSafariDeIos({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false);
  });

  it('dejar de escuchar suelta los eventos', () => {
    parar();
    ofrecer();
    expect(m.comoInstalar()).toBe(null);
    parar = () => {};
  });
});
