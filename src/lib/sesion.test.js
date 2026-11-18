import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cerrarSesion, conCache, iniciarSesion, tokenActual, vaciarCache } from './sesion';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vaciarCache();
});

describe('sesion', () => {
  it('keeps the key only for this tab by default', () => {
    iniciarSesion('k');
    expect(tokenActual()).toBe('k');
    expect(localStorage.length).toBe(0);
  });

  it('survives closing the tab only when asked', () => {
    iniciarSesion('k', { recordar: true });
    expect(sessionStorage.length).toBe(0);
    expect(tokenActual()).toBe('k');
  });

  it('leaving erases the key and all cached data everywhere', async () => {
    iniciarSesion('k', { recordar: true });
    sessionStorage.setItem('cl.sesion', 'k2');
    const fn = vi.fn(async () => ({ privado: true }));
    await conCache('materias', 5, fn);
    localStorage.setItem('otra-app', 'queda');
    cerrarSesion();
    expect(tokenActual()).toBeNull();
    expect(Object.keys(sessionStorage)).toEqual([]);
    expect(Object.keys(localStorage)).toEqual(['otra-app']);
    await conCache('materias', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('conCache', () => {
  it('asks once within the window', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shares one request between callers at the same time', async () => {
    const fn = vi.fn(async () => 1);
    await Promise.all([conCache('b', 5, fn), conCache('b', 5, fn)]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('asks again after the window', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 0, fn);
    await new Promise((r) => setTimeout(r, 2));
    await conCache('a', 0, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('asks again after emptying the cache', async () => {
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    vaciarCache();
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('keeps campus data away from the disk', async () => {
    await conCache('notas', 5, async () => ({ nota: 'privada' }));
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('privada');
  });

  it('a late answer from the previous student is not stored for the next one', async () => {
    let responder;
    const lenta = new Promise((r) => { responder = r; });
    const deA = conCache('notas', 5, () => lenta);
    cerrarSesion();
    iniciarSesion('b');
    responder('notas de A');
    await deA;
    expect(await conCache('notas', 5, async () => 'notas de B')).toBe('notas de B');
  });

  it('the next student does not join a request still running for the previous one', async () => {
    let responder;
    const deA = conCache('notas', 5, () => new Promise((r) => { responder = r; }));
    cerrarSesion();
    iniciarSesion('b');
    expect(await conCache('notas', 5, async () => 'notas de B')).toBe('notas de B');
    responder('notas de A');
    await deA;
    expect(await conCache('notas', 5, async () => 'no se pide')).toBe('notas de B');
  });

  it('leaving from another tab empties this one', async () => {
    iniciarSesion('k', { recordar: true });
    const fn = vi.fn(async () => 1);
    await conCache('a', 5, fn);
    window.dispatchEvent(new StorageEvent('storage', { key: 'cl.salida', newValue: '1' }));
    expect(tokenActual()).toBeNull();
    await conCache('a', 5, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not store a failed answer', async () => {
    await expect(conCache('a', 5, async () => { throw new Error('x'); })).rejects.toThrow('x');
    expect(await conCache('a', 5, async () => 3)).toBe(3);
  });
});
