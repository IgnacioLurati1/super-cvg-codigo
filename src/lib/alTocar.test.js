// Touching a link sends what its screen asks first; anything else asks nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adelantarPantalla, escucharToques } from './alTocar';
import { TOKEN_DEMO } from './modoDemo';
import { cerrarSesion, iniciarSesion, recordarAlumno, vaciarCache } from './sesion';

let funciones;
beforeEach(() => {
  funciones = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, { body }) => {
    funciones.push(body.get('wsfunction'));
    return new Response(JSON.stringify(body.get('wsfunction') === 'core_webservice_get_site_info' ? { userid: 9 } : []));
  }));
});
afterEach(() => {
  cerrarSesion();
  vaciarCache();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
const esperar = () => new Promise((ok) => setTimeout(ok, 300));

describe('touching a link', () => {
  it('sends the first read of Mensajes, once', async () => {
    iniciarSesion('clave');
    recordarAlumno(9);
    expect(adelantarPantalla('mensajes')).toBe(true);
    expect(adelantarPantalla('mensajes')).toBe(true);
    await esperar();
    expect(funciones.filter((f) => f === 'core_message_get_conversations')).toHaveLength(1);
  });

  it('asks nothing for another screen, without a session or in the sample mode', async () => {
    expect(adelantarPantalla('mensajes')).toBe(false);
    iniciarSesion('clave');
    expect(adelantarPantalla('configuracion')).toBe(false);
    expect(adelantarPantalla('materias/5/tareas/3')).toBe(false);
    cerrarSesion();
    iniciarSesion(TOKEN_DEMO);
    expect(adelantarPantalla('mensajes')).toBe(false);
    await esperar();
    expect(funciones).toEqual([]);
  });

  it('listens to the finger on links of the site only, without «?» and not to the screen open', async () => {
    iniciarSesion('clave');
    recordarAlumno(9);
    escucharToques('/');
    document.body.innerHTML = '<a href="/mensajes?c=4">a</a><a href="https://otro.test/mensajes">b</a><a href="/mensajes" target="_blank">c</a><a href="/mensajes"><span>d</span></a>';
    const tocar = (el, button = 0) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button }));
    const [a, b, c, d] = document.querySelectorAll('a');
    for (const el of [a, b, c]) tocar(el);
    tocar(d, 2);
    await esperar();
    expect(funciones).toEqual([]);
    tocar(d.firstChild);
    await esperar();
    expect(funciones).toContain('core_message_get_conversations');
  });
});
